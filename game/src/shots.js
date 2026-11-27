// shots.js — staged, deterministic scenes for the maker's screenshots.
// A ?shot=cover|storm|approach|debrief URL freezes the clock and poses a
// real game state (same plane, same mission bookkeeping the game itself
// uses), so every screenshot is an honest render of the game's own code.

import { createPlane } from './flight-model.js';
import { createMissionState, MISSIONS } from './missions.js';
import { RUNWAYS } from './world.js';

function stagedPlane(mission, props) {
  const plane = createPlane({ x: 0, z: 0, alt: 100, fuel: mission.fuel });
  plane.fuelCapacity = mission.fuel;
  Object.assign(plane, props);
  plane.propPhase = 2.2;
  return plane;
}

export function stageShot(game, name) {
  const mission = MISSIONS[0];
  game.missionIndex = 0;
  game.time = 6.0;
  game.frozen = true;

  if (name === 'debrief') {
    const ms = createMissionState(mission);
    ms.score = 2050; ms.ringsPassed = 6;
    ms.ringDone = ms.ringDone.map(() => true);
    ms.landingGrade = 'Gentle'; ms.landedAtDest = true;
    ms.finished = true; ms.time = 148;
    game.mState = ms;
    game.plane = stagedPlane(mission, {
      x: RUNWAYS.far.cx, z: RUNWAYS.far.cz + 120, alt: RUNWAYS.far.alt,
      heading: 0, speed: 0, throttle: 0, fuel: 21, damage: 6,
      onGround: true, groundRunway: RUNWAYS.far,
    });
    game.displayProgress = { stars: { freight: 3 }, best: { freight: 2050 } };
    game.screen = 'debrief';
    return;
  }

  if (name === 'storm') {
    // Mission 3, Storm Run: heavy bank into the crosswind, rain and a low
    // cloud deck (the storm palette and weather come from the mission
    // itself), crabbed heading, low fuel on the gauges.
    const storm = MISSIONS[2];
    game.missionIndex = 2;
    const ms = createMissionState(storm);
    ms.ringDone[0] = true; ms.ringsPassed = 1; ms.score = 250;
    ms.message = 'RING 1/2  +250'; ms.messageT = 3;
    game.mState = ms;
    game.plane = stagedPlane(storm, {
      x: 180, z: -1250, alt: 150, heading: 0.30, speed: 44,
      throttle: 0.72, bank: -0.48, climbAngle: -0.05, vs: -2.2, fuel: 13,
    });
    game.screen = 'fly';
    return;
  }

  game.screen = 'fly';
  if (name === 'rings') {
    const ms = createMissionState(mission);
    ms.ringDone[0] = true; ms.ringDone[1] = true; ms.ringsPassed = 2;
    ms.score = 500; ms.message = 'RING 2/6  +250'; ms.messageT = 3;
    game.mState = ms;
    game.plane = stagedPlane(mission, {
      x: 55, z: -1560, alt: 138, heading: -0.03, speed: 49,
      throttle: 0.64, bank: -0.07, climbAngle: 0.02, fuel: 78,
    });
    return;
  }
  if (name === 'approach') {
    // On final: five rings flown, the last gate still ahead on the way
    // in, 600 m from the Nordhavn threshold on a 3.2-degree glide (the
    // aid reads ON GLIDE, PAPI two white two red), offset east of the
    // centreline so the strip, its threshold bars and the approach
    // light row sit clear of the airframe, with Sisteoya's peak
    // standing off the right wing. Nordfjellet stays out of frame.
    const ms = createMissionState(mission);
    ms.ringDone = ms.ringDone.map(() => true);
    ms.ringDone[5] = false;
    ms.ringsPassed = 5;
    ms.score = 1250;
    game.mState = ms;
    game.plane = stagedPlane(mission, {
      x: RUNWAYS.far.cx + 110, z: -3350, alt: 48, heading: 0.01, speed: 38,
      throttle: 0.34, bank: 0.02, climbAngle: -0.057, vs: -2.2, fuel: 30,
    });
    return;
  }
  // cover: mid ring-run, banked in a turn onto the next ring (bank
  // 0.21 rad, horizon rolled). The plane sits on a 33-degree intercept
  // heading with the NEXT ring dead ahead of the nose, fully clear of
  // the airframe and seen obliquely, so it draws as a foreshortened
  // ellipse; Nordhavn Strip lies in the distance to the left. The
  // heading offset from the strip (0.58 rad) keeps the glide-slope aid
  // out of the frame; ring progress shows on the objective board
  // (Rings 4/6).
  const ms = createMissionState(mission);
  for (let i = 0; i < 4; i++) ms.ringDone[i] = true;
  ms.ringsPassed = 4; ms.score = 1000;
  game.mState = ms;
  game.plane = stagedPlane(mission, {
    x: -241, z: -2590, alt: 74, heading: 0.58, speed: 47,
    throttle: 0.66, bank: 0.21, climbAngle: 0.11, vs: 4.8, fuel: 64,
  });
  // The destination strip lies ~1.9 km out in this frame and would read
  // as a speck; flag it so the renderer lays an extended approach
  // corridor — a centreline running out of the near threshold with a
  // light row along it — toward the aircraft's side of the frame. This
  // staging only; free flight never sets the flag.
  RUNWAYS.far.coverGuide = true;
}
