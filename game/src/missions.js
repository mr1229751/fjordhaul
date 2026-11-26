// missions.js — the campaign: three sorties with different goals, the ring
// and crate bookkeeping, landing grades turned into score, and stars.
// A mission state is plain data; updateMission watches the plane and the
// flight events from flight-model.js and decides when a sortie is won, lost
// or still flying.

import { RUNWAYS, terrainHeight } from './world.js';

export const MISSIONS = [
  {
    id: 'freight',
    name: 'First Freight',
    brief: 'Thread all 6 rings down the fjord, then land at Nordhavn Strip.',
    detail: 'Crates of engine parts for the Nordhavn ferry. Keep your speed up in the turns — the wing stalls below 23 m/s — and save fuel for the far end.',
    destRunway: 'far',
    fuel: 100,
    palette: 'dusk',
    weather: false,
    rings: [
      { x: 0, alt: 120, z: -650 }, { x: -140, alt: 130, z: -1250 },
      { x: 90, alt: 140, z: -1850 }, { x: -70, alt: 135, z: -2450 },
      { x: 60, alt: 130, z: -3050 }, { x: -40, alt: 120, z: -3650 },
    ],
    dropZones: [],
    starScores: [900, 1500, 1950],
  },
  {
    id: 'supply',
    name: 'Supply Drop',
    brief: 'Drop 3 crates onto the marked island zones, then land at Nordhavn Strip.',
    detail: 'Press Space over a zone to let a crate go. It falls where the plane is pointing, so line up early, fly low and slow, then climb away and land far north.',
    destRunway: 'far',
    fuel: 115,
    palette: 'dusk',
    weather: false,
    rings: [],
    dropZones: [
      { x: 380, z: -1050, label: 'Brefjellet' },
      { x: -260, z: -1500, label: 'Svarthoyda' },
      { x: 150, z: -2900, label: 'Langoya' },
    ],
    starScores: [700, 1200, 1650],
  },
  {
    id: 'storm',
    name: 'Storm Run',
    brief: 'Beat the weather to Stormodden Short Strip on half tanks.',
    detail: 'A front is coming down the fjord: gusting crosswind, low fuel, failing light and only 460 m of strip. Throttle discipline is the whole flight. Land gentle or not at all.',
    destRunway: 'storm',
    fuel: 58,
    palette: 'storm',
    weather: true,
    rings: [
      { x: -60, alt: 130, z: -800 }, { x: 120, alt: 140, z: -1600 },
    ],
    dropZones: [],
    starScores: [600, 1050, 1500],
  },
];

export const RING_RADIUS = 26;
export const DROP_ZONE_RADIUS = 62;

export function createMissionState(mission) {
  return {
    mission,
    score: 0,
    ringsPassed: 0,
    ringDone: mission.rings.map(() => false),
    cratesLeft: mission.dropZones.length,
    cratesHit: 0,
    crates: [],          // crates in the air or landed: {x,z,alt,vx,vz,vy,chute,done,hit}
    landingGrade: null,
    landedAtDest: false,
    finished: false,
    crashed: false,
    crashCause: '',
    message: '',
    messageT: 0,
    prevSide: mission.rings.map(() => null), // ring crossing side memory
    time: 0,
  };
}

function say(state, text) { state.message = text; state.messageT = 3.2; }

// Watch ring crossings: a ring is passed when the plane crosses its plane
// (the Z of the ring, rings face along the fjord) within its radius.
function checkRings(state, plane, prev) {
  const m = state.mission;
  for (let i = 0; i < m.rings.length; i++) {
    if (state.ringDone[i]) continue;
    const ring = m.rings[i];
    const sideNow = plane.z - ring.z;
    const sidePrev = prev.z - ring.z;
    if (sidePrev !== 0 && Math.sign(sideNow) !== Math.sign(sidePrev)) {
      const dx = plane.x - ring.x;
      const dy = plane.alt - ring.alt;
      if (dx * dx + dy * dy <= RING_RADIUS * RING_RADIUS) {
        state.ringDone[i] = true;
        state.ringsPassed++;
        state.score += 250;
        say(state, 'RING ' + state.ringsPassed + '/' + m.rings.length + '  +250');
        return 'ring';
      }
    }
  }
  return null;
}

// Drop a crate from the bomb bay: it keeps the plane's velocity, then the
// parachute opens and it settles at 6 m/s.
export function dropCrate(state, plane) {
  if (state.cratesLeft <= 0) return false;
  state.cratesLeft--;
  state.crates.push({
    x: plane.x, z: plane.z, alt: plane.alt - 2,
    vx: Math.sin(plane.heading) * plane.speed,
    vz: -Math.cos(plane.heading) * plane.speed,
    vy: 0, t: 0, done: false, hit: false,
  });
  say(state, 'CRATE AWAY');
  return true;
}

function stepCrates(state, dt) {
  for (const c of state.crates) {
    if (c.done) continue;
    c.t += dt;
    const chute = c.t > 0.9;
    c.vy = chute ? Math.max(c.vy - 22 * dt, -6) : c.vy - 9.8 * dt;
    if (chute) { c.vx *= (1 - 1.6 * dt); c.vz *= (1 - 1.6 * dt); }
    c.x += c.vx * dt; c.z += c.vz * dt; c.alt += c.vy * dt;
    const ground = terrainHeight(c.x, c.z);
    if (c.alt <= ground + 1) {
      c.alt = ground + 1;
      c.done = true;
      for (const zone of state.mission.dropZones) {
        const dx = c.x - zone.x, dz = c.z - zone.z;
        if (dx * dx + dz * dz <= DROP_ZONE_RADIUS * DROP_ZONE_RADIUS) {
          c.hit = true;
          state.cratesHit++;
          state.score += 300;
          say(state, 'CRATE ON TARGET  +300');
          break;
        }
      }
      if (!c.hit) say(state, 'CRATE LOST IN THE FJORD');
    }
  }
}

// Feed one frame of flight into the mission. flightEvents come from
// stepPlane; prev is the plane's position before the step.
export function updateMission(state, plane, prev, flightEvents, dt) {
  state.time += dt;
  if (state.messageT > 0) state.messageT -= dt;
  stepCrates(state, dt);
  if (state.finished) return null;

  let event = checkRings(state, plane, prev);

  for (const fe of flightEvents) {
    if (fe.type === 'crash') {
      state.crashed = true;
      state.crashCause = fe.cause;
      state.finished = true;
      event = 'crash';
    } else if (fe.type === 'touchdown') {
      state.landingGrade = fe.grade;
      const dest = RUNWAYS[state.mission.destRunway];
      if (fe.runway.id === dest.id) {
        state.landedAtDest = true;
        state.score += fe.grade === 'Gentle' ? 400 : fe.grade === 'Firm' ? 200 : 50;
        say(state, 'TOUCHDOWN — ' + fe.grade.toUpperCase());
        event = 'touchdown';
      } else {
        say(state, 'WRONG STRIP — THAT IS ' + fe.runway.name.toUpperCase());
      }
    } else if (fe.type === 'takeoff' && state.landedAtDest) {
      state.landedAtDest = false; // went around: the landing must be re-made
    }
  }

  // Won: parked on the destination strip with every objective met.
  const objectivesMet = state.ringsPassed === state.mission.rings.length
    && state.cratesHit === state.mission.dropZones.length;
  if (state.landedAtDest && plane.onGround && plane.speed < 3 && objectivesMet) {
    state.finished = true;
    event = 'complete';
  }
  return event;
}

export function starsFor(mission, state, damage) {
  if (state.crashed) return 0;
  let stars = 0;
  for (const need of mission.starScores) if (state.score >= need) stars++;
  if (stars === 3 && damage > 40) stars = 2; // a bent airframe caps the grade
  return stars;
}

export function objectivesText(state) {
  const m = state.mission;
  const parts = [];
  if (m.rings.length) parts.push('Rings ' + state.ringsPassed + '/' + m.rings.length);
  if (m.dropZones.length) parts.push('Crates ' + state.cratesHit + '/' + m.dropZones.length);
  parts.push('Land: ' + RUNWAYS[m.destRunway].name);
  return parts.join('   ·   ');
}
