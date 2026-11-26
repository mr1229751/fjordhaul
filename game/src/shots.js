// shots.js — staged, deterministic scenes for the maker's screenshots.
// A ?shot=cover|rings|approach|debrief URL freezes the clock and poses a
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
    const ms = createMissionState(mission);
    ms.ringDone = ms.ringDone.map(() => true);
    ms.ringDone[5] = false; // the last ring still waits on the way in
    ms.ringsPassed = 5;
    ms.score = 1250;
    game.mState = ms;
    game.plane = stagedPlane(mission, {
      x: RUNWAYS.far.cx + 4, z: -3300, alt: 52, heading: 0.01, speed: 38,
      throttle: 0.34, bank: 0.02, climbAngle: -0.079, vs: -3.0, fuel: 30,
    });
    return;
  }
  // cover: last ring ahead, Nordhavn strip beyond it, panel lit.
  const ms = createMissionState(mission);
  for (let i = 0; i < 5; i++) ms.ringDone[i] = true;
  ms.ringsPassed = 5; ms.score = 1250;
  ms.message = 'RING 5/6  +250'; ms.messageT = 3;
  game.mState = ms;
  game.plane = stagedPlane(mission, {
    x: -28, z: -3360, alt: 131, heading: 0.02, speed: 47,
    throttle: 0.62, bank: 0.06, climbAngle: 0.01, fuel: 64,
  });
}
