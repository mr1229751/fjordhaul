// flight-model.js — the aeroplane: energy, lift, stall, fuel, damage.
// Arcade handling over a real energy budget: speed bleeds in climbs and hard
// turns, the wing stalls when slow, and the ground is unforgiving. stepPlane
// mutates the plane and returns an event object when something notable
// happens (takeoff, touchdown, crash) for missions.js and main.js to score.

import { terrainHeight, runwayAt, runwayLocal, WATER_Y } from './world.js';

export const STALL_SPEED = 23;
export const TOUCHDOWN_MAX_SINK = 7.5;

export function createPlane(start) {
  return {
    x: start.x, z: start.z, alt: start.alt,
    heading: start.heading || 0,
    speed: start.speed || 0,
    vs: 0,               // vertical speed, m/s, + is up
    throttle: 0,
    bank: 0,             // radians, + banks right
    pitchInput: 0, rollInput: 0,
    climbAngle: 0,
    lift: 1,             // 0..1 lift factor, collapses below stall speed
    stalled: false,
    fuel: start.fuel,
    damage: 0,           // 0..100 hull damage
    onGround: !!start.onGround,
    groundRunway: null,  // runway object while rolling on a strip
    propPhase: 0,
    windDrift: { x: 0, z: 0 },
  };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Weather for the storm mission: a gusting crosswind plus turbulence,
// all smooth functions of time so a flight is reproducible.
export function stormWeather(t) {
  return {
    windX: 6.5 * Math.sin(t * 0.23) + 3.5 * Math.sin(t * 0.071 + 1.7),
    windZ: 2.5 * Math.sin(t * 0.11 + 0.6),
    turbulence: Math.sin(t * 1.9) * Math.sin(t * 0.77 + 2.0),
  };
}

export function stepPlane(plane, input, dt, env) {
  const events = [];
  const weather = env.weather || null;
  plane.pitchInput = input.pitch;
  plane.rollInput = input.roll;

  // Throttle lever.
  plane.throttle = clamp(plane.throttle + input.throttleDelta * dt * 0.55, 0, 1);

  // Bank toward the stick, a little slower when heavy with speed.
  const targetBank = input.roll * 1.05 + (weather ? weather.turbulence * 0.05 : 0);
  plane.bank += clamp(targetBank - plane.bank, -2.4 * dt, 2.4 * dt);

  // Lift factor: full above stall, collapsing through it.
  plane.lift = clamp((plane.speed - 13) / (STALL_SPEED - 13), 0, 1);
  plane.stalled = !plane.onGround && plane.lift < 0.98;

  // Turn: coordinated, rate set by bank and speed.
  const turnRate = plane.onGround
    ? input.roll * clamp(plane.speed / 30, 0, 1) * 0.55
    : (9.8 * Math.tan(plane.bank) / Math.max(plane.speed, 18)) * 1.12;
  plane.heading += turnRate * dt;

  // Climb angle the wing can actually hold.
  const wantedClimb = input.pitch * 0.38 + (weather ? weather.turbulence * 0.012 : 0);
  const heldClimb = wantedClimb * plane.lift - (1 - plane.lift) * 0.55;
  plane.climbAngle += clamp(heldClimb - plane.climbAngle, -1.6 * dt, 1.6 * dt);
  plane.vs = Math.sin(plane.climbAngle) * plane.speed - (1 - plane.lift) * 4.5;

  // Energy: thrust against drag, gravity in the climb, bleed in the turn.
  let accel = plane.throttle * 8.5
    - 0.0023 * plane.speed * plane.speed
    - 9.8 * Math.sin(plane.climbAngle) * 0.55
    - Math.abs(turnRate) * plane.speed * 0.045;
  if (plane.onGround) accel -= plane.speed > 1 ? 1.1 : 0; // rolling drag
  // Wheel brakes bite once the throttle is closed, so the short Stormodden
  // strip (460 m) is stoppable from a firm touchdown.
  if (plane.onGround && plane.throttle < 0.05 && plane.speed > 1) accel -= 2.4;
  plane.speed = Math.max(0, plane.speed + accel * dt);

  // Fuel burns with the throttle.
  plane.fuel = Math.max(0, plane.fuel - (0.30 + plane.throttle * 0.78) * dt);
  if (plane.fuel <= 0) plane.throttle = Math.max(0, plane.throttle - dt * 0.8);

  // Move.
  const fx = Math.sin(plane.heading), fz = -Math.cos(plane.heading);
  plane.x += fx * plane.speed * dt;
  plane.z += fz * plane.speed * dt;
  if (weather && !plane.onGround) {
    plane.x += weather.windX * dt * 0.55;
    plane.z += weather.windZ * dt * 0.55;
    plane.windDrift.x = weather.windX; plane.windDrift.z = weather.windZ;
  }

  const ground = terrainHeight(plane.x, plane.z);
  const strip = runwayAt(plane.x, plane.z);
  const stripAlt = strip ? strip.alt : null;

  if (plane.onGround) {
    const home = plane.groundRunway;
    if (strip && home && strip.id === home.id) {
      plane.alt = stripAlt;
      plane.vs = 0;
      // Rotate: enough speed and a pull on the stick lifts her off.
      if (plane.speed > 27 && input.pitch > 0.22) {
        plane.onGround = false;
        plane.groundRunway = null;
        plane.alt = stripAlt + 0.6;
        events.push({ type: 'takeoff' });
      }
    } else {
      // Rolled off the strip: water or rough ground at speed is a wreck.
      events.push({ type: 'crash', cause: ground <= WATER_Y + 0.5 ? 'Ran off the strip into the fjord' : 'Ran off the strip onto rough ground' });
      plane.damage = 100;
    }
    return events;
  }

  plane.alt += plane.vs * dt;

  // Ground contact.
  const floorHere = strip ? Math.max(stripAlt, ground) : ground;
  if (plane.alt <= floorHere + 0.4) {
    if (strip && stripAlt >= ground - 0.5) {
      const sink = -plane.vs;
      const align = Math.abs(wrapAngle(plane.heading - strip.heading));
      const local = runwayLocal(strip, plane.x, plane.z);
      if (sink > TOUCHDOWN_MAX_SINK) {
        plane.damage = 100;
        events.push({ type: 'crash', cause: 'Came down far too hard on the strip' });
      } else {
        plane.alt = stripAlt;
        plane.onGround = true;
        plane.groundRunway = strip;
        plane.vs = 0;
        let grade = sink <= 2.2 ? 'Gentle' : sink <= 4.5 ? 'Firm' : 'Hard';
        let dmg = grade === 'Hard' ? 30 : grade === 'Firm' ? 8 : 0;
        if (align > 0.21 || !local) { grade = grade === 'Gentle' ? 'Firm' : grade; dmg += 12; }
        if (plane.speed > 46) { dmg += 15; }
        plane.damage = Math.min(100, plane.damage + dmg);
        events.push({ type: 'touchdown', runway: strip, grade, sink, damage: dmg, aligned: align <= 0.21 });
        if (plane.damage >= 100) events.push({ type: 'crash', cause: 'The airframe gave up on touchdown' });
      }
    } else if (ground <= WATER_Y + 0.5) {
      plane.damage = 100;
      events.push({ type: 'crash', cause: 'Down in the fjord' });
    } else {
      plane.damage = 100;
      events.push({ type: 'crash', cause: 'Struck the terrain' });
    }
  }
  return events;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
