// main.js — FJORDHAUL's frame: the game state machine (title, briefing,
// flight, pause, debrief), the campaign's saved stars and bests, the wiring
// between input, the flight model, the missions, the renderer, the
// instruments and the sound, and the ?shot= staging the screenshots use.
//
// THE GAME. FJORDHAUL is a complete Canvas 2D chase-view flight game set
// over a dusk fjord archipelago of fourteen islands, three airstrips, five
// villages and a lighthouse, all drawn by the game's own code (low-poly
// sun-shaded cliff facets, pine stands, waterfalls, working boats, lit
// windows) with no external assets. You fly a fixed-gear prop freighter
// between island strips on a three-mission campaign, each mission with a
// different goal:
//   1. FIRST FREIGHT — thread all 6 checkpoint rings down the fjord, then
//      land at Nordhavn Strip (1,000 m of runway at the far end).
//   2. SUPPLY DROP — parachute 3 supply crates onto marked island drop
//      zones (Space over a zone; a crate keeps the plane's velocity, then
//      settles under its canopy), then land at Nordhavn.
//   3. STORM RUN — beat a gusting-crosswind front to Stormodden Short
//      Strip: 460 m of runway, half tanks (58 units of fuel), failing
//      light, turbulence shaking the airframe the whole way down.
// FLIGHT MODEL. An energy budget, not an arcade glide: thrust fights
// quadratic drag, speed bleeds in climbs and in hard banked turns, lift
// collapses through the 23 m/s stall speed, fuel burns with the throttle
// setting, and hull damage accrues from hard or misaligned touchdowns.
// Landings are graded Gentle / Firm / Hard by sink rate, alignment and
// speed; a sortie scores rings (+250), crates on target (+300) and the
// touchdown grade (+400/+200/+50), and earns 1–3 campaign stars per
// mission — a bent airframe (over 40% damage) caps the grade at two.
// Stars and best scores persist in localStorage, and each mission unlocks
// the next. The panel is a flown one: airspeed and altimeter dials with
// needles and digital readouts, an artificial horizon, a vertical-speed
// dial, a heading tape with a bearing bug for the next objective,
// throttle/fuel/hull bars, a gear-down lamp, AGL and distance-to-strip
// readouts, PAPI lights and a glide-slope aid on final.
// CONTROLS. W/S throttle · arrow keys pitch and bank (mouse works too) ·
// Space drop crate · P or Esc pause · R restart the sortie · M mute ·
// Enter select and start. Sound is synthesized in code (engine, stall
// warning, chimes, touchdown thuds); there are no audio files.

import { createPlane, stepPlane, stormWeather } from './flight-model.js';
import { MISSIONS, createMissionState, updateMission, dropCrate, starsFor } from './missions.js';
import { PALETTES, RUNWAYS } from './world.js';
import { drawScene } from './render.js';
import { drawInstruments } from './instruments.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const W = 1280, H = 800;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const audio = createAudio();

const STORE_KEY = 'fjordhaul.progress.v1';
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { stars: {}, best: {} }; }
  catch (err) { return { stars: {}, best: {} }; }
}
function saveProgress() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (err) { /* private mode */ }
}
let progress = loadProgress();

const game = {
  screen: 'title',
  missionIndex: 0,
  plane: null,
  mState: null,
  time: 0,
  paused: false,
  frozen: false,
  endTimer: -1,       // counts down to the debrief after a finish or crash
  stallBeepT: 0,
  displayProgress: null,
};

function unlocked(i) {
  return i === 0 || (progress.stars[MISSIONS[i - 1].id] || 0) > 0;
}

function startMission(i) {
  const mission = MISSIONS[i];
  game.missionIndex = i;
  const plane = createPlane({ x: 0, z: 690, alt: RUNWAYS.home.alt, fuel: mission.fuel, onGround: true });
  plane.fuelCapacity = mission.fuel;
  plane.groundRunway = RUNWAYS.home;
  game.plane = plane;
  game.mState = createMissionState(mission);
  game.paused = false;
  game.endTimer = -1;
  game.screen = 'briefing';
}

function beginFlight() {
  audio.start();
  game.screen = 'fly';
}

function finishSortie() {
  const ms = game.mState, mission = ms.mission;
  if (!ms.crashed) {
    const stars = starsFor(mission, ms, game.plane.damage);
    if (stars > (progress.stars[mission.id] || 0)) progress.stars[mission.id] = stars;
    if (ms.score > (progress.best[mission.id] || 0)) progress.best[mission.id] = ms.score;
    saveProgress();
  }
  game.screen = 'debrief';
}

// ---------------------------------------------------------------- loop ----
let lastTs = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;
  const now = performance.now() / 1000;

  handleKeys();
  if (!game.frozen) {
    game.time += dt;
    if (game.screen === 'fly' && !game.paused) stepFlight(dt);
  }
  draw();
  input.endFrame();
}

function stepFlight(dt) {
  const plane = game.plane, ms = game.mState;
  const controls = input.read(performance.now() / 1000);
  const prev = { x: plane.x, z: plane.z, alt: plane.alt };
  const weather = ms.mission.weather ? stormWeather(game.time) : null;
  const events = stepPlane(plane, controls, dt, { weather });
  plane.propPhase += dt * (3 + plane.throttle * 42);
  const event = updateMission(ms, plane, prev, events, dt);
  audio.update(plane);

  if (event === 'ring') audio.chime();
  for (const fe of events) {
    if (fe.type === 'touchdown') audio.thud(fe.grade === 'Hard');
    if (fe.type === 'crash') audio.thud(true);
  }
  if (plane.stalled) {
    game.stallBeepT -= dt;
    if (game.stallBeepT <= 0) { audio.stallWarn(); game.stallBeepT = 0.45; }
  }
  if (ms.finished && game.endTimer < 0) game.endTimer = ms.crashed ? 1.5 : 0.9;
  if (game.endTimer > 0) {
    game.endTimer -= dt;
    if (game.endTimer <= 0) finishSortie();
  }
}

function handleKeys() {
  if (input.wasPressed('KeyM')) audio.toggleMute();
  if (game.screen === 'title') {
    if (input.wasPressed('ArrowUp')) game.missionIndex = (game.missionIndex + MISSIONS.length - 1) % MISSIONS.length;
    if (input.wasPressed('ArrowDown')) game.missionIndex = (game.missionIndex + 1) % MISSIONS.length;
    for (let i = 0; i < MISSIONS.length; i++) if (input.wasPressed('Digit' + (i + 1))) game.missionIndex = i;
    if (input.wasPressed('Enter') && unlocked(game.missionIndex)) startMission(game.missionIndex);
  } else if (game.screen === 'briefing') {
    if (input.wasPressed('Enter')) beginFlight();
  } else if (game.screen === 'fly') {
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) game.paused = !game.paused;
    if (!game.paused && input.wasPressed('Space') && game.mState.mission.dropZones.length) {
      if (dropCrate(game.mState, game.plane)) audio.dropTone();
    }
    if (input.wasPressed('KeyR')) startMission(game.missionIndex);
  } else if (game.screen === 'debrief') {
    if (input.wasPressed('Enter')) { game.screen = 'title'; game.displayProgress = null; }
    if (input.wasPressed('KeyR')) startMission(game.missionIndex);
  }
}

canvas.addEventListener('mousedown', () => {
  if (game.screen === 'title' && unlocked(game.missionIndex)) startMission(game.missionIndex);
  else if (game.screen === 'briefing') beginFlight();
  else if (game.screen === 'debrief') { game.screen = 'title'; game.displayProgress = null; }
});

// ---------------------------------------------------------------- draw ----
function palette() {
  const mission = game.mState ? game.mState.mission : MISSIONS[game.missionIndex];
  return PALETTES[mission.palette];
}

function draw() {
  const pal = palette();
  if (game.screen === 'title') {
    const a = game.time * 0.05;
    const cx = -150, cz = -4450;
    const camX = cx + Math.sin(a) * 1050, camZ = cz + Math.cos(a) * 1050;
    const heading = Math.atan2(cx - camX, -(cz - camZ));
    drawScene(ctx, {
      palette: pal, time: game.time, plane: null, missionState: null, hidePlane: true,
      camOverride: { x: camX, z: camZ, alt: 305, heading, bank: 0.1, climbAngle: -0.1 },
    });
    drawTitle();
    return;
  }
  const ms = game.mState, plane = game.plane;
  const weather = ms.mission.weather ? stormWeather(game.time) : null;
  drawScene(ctx, { palette: pal, time: game.time, plane, missionState: ms, weather: !!weather });
  if (game.screen === 'briefing') { drawBriefing(); return; }
  const wind = weather ? (Math.abs(weather.windX) < 1 ? 'calm' : (weather.windX > 0 ? 'E ' : 'W ') + Math.abs(weather.windX).toFixed(0) + ' m/s') : null;
  drawInstruments(ctx, plane, ms, game.time, { wind });
  if (game.screen === 'debrief') drawDebrief();
  else if (ms.crashed && game.endTimer > 0) banner('WRECKED — ' + ms.crashCause.toUpperCase(), '#ff5147');
  else if (game.paused) drawPaused();
}

function banner(text, color) {
  ctx.fillStyle = 'rgba(8,13,18,0.55)'; ctx.fillRect(0, 330, W, 92);
  ctx.fillStyle = color; ctx.font = '800 34px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, 388);
}

function drawTitle() {
  ctx.fillStyle = 'rgba(8,14,20,0.45)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd9a0'; ctx.font = '800 92px system-ui, sans-serif';
  ctx.fillText('FJORDHAUL', W / 2, 170);
  ctx.fillStyle = '#dfe9ef'; ctx.font = '600 21px system-ui, sans-serif';
  ctx.fillText('Freight flying over a dusk fjord — rings, crate drops and short strips in a storm.', W / 2, 212);
  ctx.textAlign = 'left';
  MISSIONS.forEach((m, i) => {
    const y = 300 + i * 108;
    const open = unlocked(i);
    const sel = i === game.missionIndex;
    ctx.fillStyle = sel ? 'rgba(255,179,64,0.16)' : 'rgba(10,17,24,0.72)';
    ctx.beginPath(); ctx.roundRect(290, y - 40, 700, 92, 12); ctx.fill();
    ctx.strokeStyle = sel ? '#ffb340' : 'rgba(140,170,190,0.35)'; ctx.lineWidth = sel ? 2.5 : 1.5; ctx.stroke();
    ctx.fillStyle = open ? '#f4f7f9' : '#77828c'; ctx.font = '800 24px system-ui, sans-serif';
    ctx.fillText((i + 1) + '.  ' + m.name, 322, y);
    ctx.font = '600 15px system-ui, sans-serif'; ctx.fillStyle = open ? '#b9cbd6' : '#66727c';
    ctx.fillText(open ? m.brief : 'Complete the previous mission to unlock.', 322, y + 28);
    const stars = progress.stars[m.id] || 0;
    ctx.fillStyle = '#ffd76a'; ctx.font = '800 22px system-ui, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('★'.repeat(stars) + '☆'.repeat(3 - stars), 958, y);
    if (progress.best[m.id]) {
      ctx.fillStyle = '#8fb6c9'; ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText('BEST ' + progress.best[m.id], 958, y + 28);
    }
    ctx.textAlign = 'left';
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = '#dfe9ef'; ctx.font = '600 17px system-ui, sans-serif';
  ctx.fillText('↑↓ choose · ENTER fly · W/S throttle · arrows pitch & bank · SPACE drop crate · P pause · M mute', W / 2, 668);
  ctx.fillStyle = '#8fb6c9'; ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillText(audio.muted ? 'Sound: OFF (M)' : 'Sound: on', W / 2, 700);
}

function drawBriefing() {
  const m = game.mState.mission;
  ctx.fillStyle = 'rgba(8,13,18,0.62)'; ctx.fillRect(0, 0, W, H);
  ctx.beginPath(); ctx.roundRect(240, 150, 800, 470, 14);
  ctx.fillStyle = 'rgba(10,17,24,0.94)'; ctx.fill();
  ctx.strokeStyle = '#ffb340'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb340'; ctx.font = '800 40px system-ui, sans-serif';
  ctx.fillText(m.name.toUpperCase(), W / 2, 232);
  ctx.fillStyle = '#f4f7f9'; ctx.font = '600 20px system-ui, sans-serif';
  wrapText(m.brief, W / 2, 282, 700, 28);
  ctx.fillStyle = '#b9cbd6'; ctx.font = '500 17px system-ui, sans-serif';
  wrapText(m.detail, W / 2, 356, 700, 25);
  ctx.fillStyle = '#8fb6c9'; ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillText('You are on the Haulvik strip, engine running, freight loaded.', W / 2, 452);
  ctx.fillText('W to open the throttle — she lifts off past 27 m/s with a pull on ↑.', W / 2, 480);
  ctx.fillStyle = '#ffd9a0'; ctx.font = '800 21px system-ui, sans-serif';
  ctx.fillText('ENTER — START ENGINES', W / 2, 552);
}

function drawPaused() {
  ctx.fillStyle = 'rgba(8,13,18,0.55)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4f7f9'; ctx.font = '800 44px system-ui, sans-serif';
  ctx.fillText('PAUSED', W / 2, 360);
  ctx.font = '600 18px system-ui, sans-serif'; ctx.fillStyle = '#b9cbd6';
  ctx.fillText('P or Esc to fly on · R restarts the sortie · M ' + (audio.muted ? 'unmutes' : 'mutes'), W / 2, 404);
}

function drawDebrief() {
  const ms = game.mState, plane = game.plane, mission = ms.mission;
  const shown = game.displayProgress || progress;
  ctx.fillStyle = 'rgba(8,13,18,0.66)'; ctx.fillRect(0, 0, W, H);
  ctx.beginPath(); ctx.roundRect(190, 96, 900, 590, 14);
  ctx.fillStyle = 'rgba(10,17,24,0.96)'; ctx.fill();
  ctx.strokeStyle = ms.crashed ? '#ff5147' : '#ffb340'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = ms.crashed ? '#ff5147' : '#ffd9a0'; ctx.font = '800 42px system-ui, sans-serif';
  ctx.fillText(ms.crashed ? 'AIRCRAFT LOST' : 'MISSION COMPLETE', W / 2, 168);
  ctx.fillStyle = '#b9cbd6'; ctx.font = '600 17px system-ui, sans-serif';
  ctx.fillText(ms.crashed ? ms.crashCause + '.' : mission.name + ' — freight delivered to ' + RUNWAYS[mission.destRunway].name + '.', W / 2, 200);
  const stars = ms.crashed ? 0 : starsFor(mission, ms, plane.damage);
  ctx.fillStyle = '#ffd76a'; ctx.font = '800 44px system-ui, sans-serif';
  ctx.fillText('★'.repeat(stars) + '☆'.repeat(3 - stars), W / 2, 258);
  ctx.textAlign = 'left';
  const rows = [
    ['Score', String(ms.score)],
    ['Flight time', Math.floor(ms.time / 60) + ':' + String(Math.floor(ms.time % 60)).padStart(2, '0')],
    mission.rings.length ? ['Rings', ms.ringsPassed + ' / ' + mission.rings.length] : null,
    mission.dropZones.length ? ['Crates on target', ms.cratesHit + ' / ' + mission.dropZones.length] : null,
    ['Landing', ms.landingGrade ? ms.landingGrade : '—'],
    ['Hull damage', Math.round(plane.damage) + '%'],
    ['Fuel remaining', Math.max(0, Math.round(plane.fuel / plane.fuelCapacity * 100)) + '%'],
  ].filter(Boolean);
  ctx.font = '600 18px system-ui, sans-serif';
  rows.forEach((row, i) => {
    const y = 310 + i * 33;
    ctx.fillStyle = '#8fb6c9'; ctx.fillText(row[0], 300, y);
    ctx.fillStyle = '#f4f7f9'; ctx.textAlign = 'right'; ctx.fillText(row[1], 700, y); ctx.textAlign = 'left';
  });
  // Campaign board.
  ctx.fillStyle = '#ffb340'; ctx.font = '800 16px system-ui, sans-serif';
  ctx.fillText('CAMPAIGN', 760, 310);
  MISSIONS.forEach((m, i) => {
    const y = 344 + i * 40;
    ctx.fillStyle = '#dfe9ef'; ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillText(m.name, 760, y);
    const st = shown.stars[m.id] || 0;
    ctx.fillStyle = '#ffd76a'; ctx.font = '800 17px system-ui, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('★'.repeat(st) + '☆'.repeat(3 - st), 1052, y);
    ctx.textAlign = 'left';
    if (shown.best[m.id]) {
      ctx.fillStyle = '#8fb6c9'; ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText('BEST ' + shown.best[m.id], 760, y + 16);
    }
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd9a0'; ctx.font = '800 19px system-ui, sans-serif';
  ctx.fillText('ENTER — BACK TO THE FJORD      R — FLY IT AGAIN', W / 2, 640);
}

function wrapText(text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '', yy = y;
  for (const word of words) {
    const trial = line ? line + ' ' + word : word;
    if (ctx.measureText(trial).width > maxW && line) {
      ctx.fillText(line, cx, yy); yy += lineH; line = word;
    } else line = trial;
  }
  if (line) ctx.fillText(line, cx, yy);
  return yy;
}

// ------------------------------------------------------------- staging ----
// ?shot=<name> poses a frozen scene for the maker's screenshots.
const shotName = new URLSearchParams(location.search).get('shot');
if (shotName) stageShot(game, shotName);

// A small handle the maker's headless tests use to fly the game.
window.FJORDHAUL = {
  game,
  startMission,
  beginFlight,
  teleport(props) { if (game.plane) Object.assign(game.plane, props); },
  state() {
    return {
      screen: game.screen,
      plane: game.plane ? { ...game.plane, groundRunway: undefined } : null,
      mission: game.mState ? { score: game.mState.score, ringsPassed: game.mState.ringsPassed, cratesHit: game.mState.cratesHit, finished: game.mState.finished, crashed: game.mState.crashed, landingGrade: game.mState.landingGrade } : null,
    };
  },
};

requestAnimationFrame(frame);
