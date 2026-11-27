// render.js — everything the eye sees in flight: the dusk sky, layered
// ridges, the fjord water, low-poly islands with villages, the lighthouse,
// runways with PAPI lights, mission rings, drop zones, falling crates and
// the aircraft itself, all projected from world coordinates through a chase
// camera that sits behind and above the plane and rolls gently with it.

import { ISLANDS, RUNWAYS, VILLAGES, LIGHTHOUSE, terrainHeight, villageHouses, mulberry32 } from './world.js';

const W = 1280, H = 800;
const FOCAL = 640;

// Ridge silhouettes for the horizon, fixed profiles scrolled by heading.
function ridgeProfile(seed, points, base, amp) {
  const rnd = mulberry32(seed);
  const vals = [];
  let v = 0.5;
  for (let i = 0; i < points; i++) { v += (rnd() - 0.5) * 0.55; v = Math.max(0.05, Math.min(1, v)); vals.push(base + v * amp); }
  return vals;
}
const RIDGE_FAR = ridgeProfile(7, 96, 120, 130);
const RIDGE_NEAR = ridgeProfile(13, 96, 60, 110);
const STARS = (() => { const rnd = mulberry32(99); const s = []; for (let i = 0; i < 90; i++) s.push({ x: rnd(), y: rnd() * 0.4, r: rnd() * 1.3 + 0.4 }); return s; })();
const HOUSES = VILLAGES.map(villageHouses);

// Per-island dressing, all seeded so the fjord is identical on every
// flight: facet shading jitter, pine stands on the slopes, and one
// waterfall angle for each tall island. The sun sits low in the west,
// so facets facing it catch the light.
const SUN_DIR = { x: -0.9, z: -0.44 };
const ISLAND_DECOR = ISLANDS.map((isl, idx) => {
  const rnd = mulberry32(1000 + idx * 131);
  const jitter = [];
  for (let i = 0; i < 40; i++) jitter.push(0.94 + rnd() * 0.12);
  const trees = [];
  const treeCount = isl.h >= 40 ? 26 : 7;
  for (let i = 0; i < treeCount; i++) trees.push({ a: rnd() * Math.PI * 2, f: 0.48 + rnd() * 0.47, s: 0.8 + rnd() * 0.5 });
  const fall = isl.h >= 130 ? rnd() * Math.PI * 2 : null;
  return { jitter, trees, fall };
});
const SPARKS = (() => { const rnd = mulberry32(4242); const s = []; for (let i = 0; i < 220; i++) s.push({ u: rnd(), v: rnd(), w: rnd() }); return s; })();
// Working boats: a hull colour and a slow patrol line each.
const BOATS = [
  { x: -330, z: -950, dir: 0.35, phase: 0.4, range: 120, hue: '#a63c2e' },
  { x: 430, z: -2150, dir: -0.55, phase: 2.4, range: 100, hue: '#33566b' },
  { x: -160, z: -3400, dir: 0.95, phase: 4.4, range: 85, hue: '#7a5a38' },
];

function hexRgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
function mixRgb(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
function css(rgb, shade) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * shade)));
  return 'rgb(' + c(rgb[0]) + ',' + c(rgb[1]) + ',' + c(rgb[2]) + ')';
}

export function drawScene(ctx, view) {
  const pal = view.palette;
  const plane = view.plane;
  const t = view.time;

  // Camera: behind and above the aircraft (or an override for title shots).
  const cam = view.camOverride || {
    x: plane.x - Math.sin(plane.heading) * 40,
    z: plane.z + Math.cos(plane.heading) * 40,
    alt: plane.alt + 13,
    heading: plane.heading,
    bank: plane.bank || 0,
    climbAngle: plane.climbAngle || 0,
  };
  const cosH = Math.cos(cam.heading), sinH = Math.sin(cam.heading);
  const pitchCam = -0.05 - cam.climbAngle * 0.45;
  const cosP = Math.cos(pitchCam), sinP = Math.sin(pitchCam);
  const rollA = -(cam.bank || 0) * 0.55;
  const cosR = Math.cos(rollA), sinR = Math.sin(rollA);
  const CX = W / 2, CY = H * 0.52;

  function project(wx, wy, wz, applyRoll = true) {
    const rx = wx - cam.x, rz = wz - cam.z, ry = wy - cam.alt;
    const right = rx * cosH + rz * sinH;
    const fwd = rx * sinH - rz * cosH;
    const depth = fwd * cosP + ry * sinP;
    if (depth < 9) return null;
    const up = -fwd * sinP + ry * cosP;
    let sx = CX + (right / depth) * FOCAL;
    let sy = CY - (up / depth) * FOCAL;
    if (applyRoll) {
      const dx = sx - CX, dy = sy - CY;
      sx = CX + dx * cosR - dy * sinR;
      sy = CY + dx * sinR + dy * cosR;
    }
    return { x: sx, y: sy, depth };
  }

  // --- sky ---
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.8);
  sky.addColorStop(0, pal.skyTop); sky.addColorStop(0.48, pal.skyMid);
  sky.addColorStop(0.74, pal.horizon); sky.addColorStop(1, pal.skyLow);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (const s of STARS) {
    const sx = ((s.x - cam.heading * 0.02) % 1 + 1) % 1 * W;
    ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 0.7 + s.x * 40);
    ctx.fillRect(sx, s.y * H, s.r, s.r);
  }
  ctx.globalAlpha = 1;
  // Low sun, fixed in the west, with a broad warm glow around it.
  const sun = project(cam.x - 6000, cam.alt + 260, cam.z - 2500);
  if (sun) {
    const glow = ctx.createRadialGradient(sun.x, sun.y, 8, sun.x, sun.y, 190);
    glow.addColorStop(0, 'rgba(255,196,120,0.42)');
    glow.addColorStop(0.4, 'rgba(255,170,100,0.16)');
    glow.addColorStop(1, 'rgba(255,160,90,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sun.x - 190, sun.y - 190, 380, 380);
    ctx.fillStyle = pal.sun;
    ctx.beginPath(); ctx.arc(sun.x, sun.y, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,205,140,0.25)';
    ctx.beginPath(); ctx.arc(sun.x, sun.y, 58, 0, Math.PI * 2); ctx.fill();
  }
  // Dusk cloud bands, lit from below by the setting sun.
  if (!view.weather) drawDuskClouds(ctx, cam.heading);

  // --- water: the horizon line comes from projecting two far points at
  // camera height, so pitch and roll tilt it exactly as the world does ---
  const left = project(cam.x - cosH * 6000 + sinH * 6000, cam.alt, cam.z - sinH * 6000 - cosH * 6000);
  const right = project(cam.x + cosH * 6000 + sinH * 6000, cam.alt, cam.z + sinH * 6000 - cosH * 6000);

  // --- horizon ridges, layered against that same line ---
  if (left && right) {
    drawRidge(ctx, left, right, RIDGE_FAR, pal.ridgeFar, 40, 0.05, cam.heading);
    drawRidge(ctx, left, right, RIDGE_NEAR, pal.ridgeNear, 78, 0.11, cam.heading);
    ctx.fillStyle = pal.water;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y); ctx.lineTo(right.x, right.y);
    ctx.lineTo(W + 40, H + 40); ctx.lineTo(-40, H + 40);
    ctx.closePath(); ctx.fill();
    // Distance sheen toward the horizon.
    const sheen = ctx.createLinearGradient(0, Math.min(left.y, right.y), 0, H);
    sheen.addColorStop(0, pal.waterFar); sheen.addColorStop(0.35, 'rgba(0,0,0,0)');
    ctx.fillStyle = sheen; ctx.fill();
    // Sun glitter and cool sparkle on the water's surface.
    drawSparkles(ctx, left, right, sun, t);
  }
  drawBirds(ctx, t);

  // --- storm cloud deck, behind the terrain ---
  if (view.weather) drawClouds(ctx, t);

  // --- islands, far to near ---
  const sorted = ISLANDS.map((isl, idx) => ({ isl, idx, d: dist2(cam, isl) })).sort((a, b) => b.d - a.d);
  for (const { isl, idx } of sorted) drawIsland(ctx, project, isl, idx, pal, cam);

  // --- villages and lighthouse ---
  VILLAGES.forEach((village, vi) => {
    for (const house of HOUSES[vi]) drawHouse(ctx, project, house, pal);
  });
  drawLighthouse(ctx, project, t, pal);

  // --- boats working the fjord ---
  drawBoats(ctx, project, t);

  // --- runways ---
  for (const key of Object.keys(RUNWAYS)) drawRunway(ctx, project, RUNWAYS[key], pal, view);

  // --- mission dressing ---
  const ms = view.missionState;
  if (ms) {
    drawDropZones(ctx, project, ms, pal);
    drawRings(ctx, project, ms, t);
    drawCrates(ctx, project, ms);
  }

  // --- the aircraft ---
  if (!view.hidePlane && plane) drawAircraft(ctx, plane, t);

  // --- storm rain ---
  if (view.weather) drawRain(ctx, t);
}

// A low storm deck for weather scenes: overlapping soft-edged cloud
// ellipses in flat greys, drifting slowly across the upper sky.
function drawClouds(ctx, t) {
  const blobs = [
    { fx: 0.08, fy: 0.10, rx: 260, ry: 44 }, { fx: 0.30, fy: 0.05, rx: 320, ry: 52 },
    { fx: 0.52, fy: 0.12, rx: 280, ry: 40 }, { fx: 0.74, fy: 0.06, rx: 330, ry: 50 },
    { fx: 0.95, fy: 0.11, rx: 260, ry: 42 }, { fx: 0.18, fy: 0.20, rx: 220, ry: 30 },
    { fx: 0.62, fy: 0.21, rx: 240, ry: 30 }, { fx: 0.88, fy: 0.22, rx: 200, ry: 26 },
  ];
  for (const b of blobs) {
    const x = ((b.fx + t * 0.004) % 1.15 - 0.07) * W;
    const y = b.fy * H;
    const g = ctx.createRadialGradient(x, y, 6, x, y, b.rx);
    g.addColorStop(0, 'rgba(34,40,48,0.55)');
    g.addColorStop(0.7, 'rgba(34,40,48,0.27)');
    g.addColorStop(1, 'rgba(34,40,48,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, b.rx, b.ry, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function dist2(cam, isl) { const dx = isl.x - cam.x, dz = isl.z - cam.z; return dx * dx + dz * dz; }

// A ridge silhouette standing on the horizon line: jagged profile points
// between the two projected horizon ends, scrolled slowly by heading.
function drawRidge(ctx, left, right, profile, color, ampPx, par, heading) {
  const n = profile.length;
  const pts = [];
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i <= 32; i++) {
    const frac = i / 32;
    const idx = Math.floor((((frac + heading * par) % 1) + 1) % 1 * n) % n;
    const lift = (profile[idx] - 55) / 195; // profiles live around 60..250
    const x = -40 + frac * (W + 80);
    const y = left.y + (right.y - left.y) * frac - Math.max(0, lift) * ampPx + 2;
    pts.push({ x, y, lift });
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  for (let i = 32; i >= 0; i--) {
    const frac = i / 32;
    ctx.lineTo(-40 + frac * (W + 80), left.y + (right.y - left.y) * frac + 3);
  }
  ctx.closePath(); ctx.fill();
  // Snow lying on the highest crests.
  ctx.strokeStyle = 'rgba(233,240,242,0.8)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i].lift > 0.74 && pts[i + 1].lift > 0.74) {
      ctx.moveTo(pts[i].x, pts[i].y + 1); ctx.lineTo(pts[i + 1].x, pts[i + 1].y + 1);
    }
  }
  ctx.stroke();
}

// An island drawn as low-poly facets: a lattice of rings and sectors,
// each quad shaded by its height band and by how squarely it faces the
// low western sun, so the slopes read as real fjord cliffs — sunlit on
// one side, in shadow on the other — instead of flat stacked ellipses.
function drawIsland(ctx, project, isl, idx, pal, cam) {
  const decor = ISLAND_DECOR[idx];
  const dark = hexRgb(pal.slopeDark), mid = hexRgb(pal.slopeMid), high = hexRgb(pal.slopeHigh);
  const rock = hexRgb(pal.rock), snow = hexRgb(pal.snow);
  const bands = [1.0, 0.8, 0.58, 0.36, 0.17];
  const N = 20;
  const rings = bands.map((f) => {
    const arr = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const wx = isl.x + Math.cos(a) * isl.r * f;
      const wz = isl.z + Math.sin(a) * isl.r * f;
      const wy = terrainHeight(wx, wz) + (f === 1 ? -1.5 : 0.4);
      arr.push({ p: project(wx, wy, wz), h: wy });
    }
    return arr;
  });
  const centre = project(isl.x, isl.h + 0.4, isl.z);
  const colorFor = (meanH, sector) => {
    const hf = isl.h > 0 ? meanH / isl.h : 0;
    let base = hf < 0.45 ? mixRgb(dark, mid, hf / 0.45) : mixRgb(mid, high, (hf - 0.45) / 0.55);
    if (isl.kind === 'peak') {
      if (isl.h >= 140 && hf > 0.72) base = mixRgb(base, snow, Math.min(1, (hf - 0.72) / 0.28) * 0.92);
      else if (hf > 0.82) base = mixRgb(base, rock, (hf - 0.82) * 1.6);
    }
    const midA = ((sector + 0.5) / N) * Math.PI * 2;
    const dot = Math.cos(midA) * SUN_DIR.x + Math.sin(midA) * SUN_DIR.z;
    const shade = Math.max(0.45, Math.min(1.25, 0.68 + 0.52 * dot)) * decor.jitter[sector % decor.jitter.length];
    return css(base, shade);
  };
  for (let j = 0; j < bands.length - 1; j++) {
    for (let i = 0; i < N; i++) {
      const a = rings[j][i], b = rings[j][i + 1], c = rings[j + 1][i + 1], d = rings[j + 1][i];
      if (!a.p || !b.p || !c.p || !d.p) continue;
      ctx.fillStyle = colorFor((a.h + b.h + c.h + d.h) / 4, i);
      ctx.beginPath();
      ctx.moveTo(a.p.x, a.p.y); ctx.lineTo(b.p.x, b.p.y); ctx.lineTo(c.p.x, c.p.y); ctx.lineTo(d.p.x, d.p.y);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(8,18,14,0.10)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }
  // Summit fan: triangles from the innermost ring up to the peak. A
  // plateau's level top is filled as one disc instead — a fan of long
  // flat triangles shades like a crater rim.
  if (centre) {
    const inner = rings[bands.length - 1];
    if (isl.kind === 'plateau') {
      if (inner.every((pt) => pt.p)) {
        ctx.fillStyle = css(mixRgb(mid, high, 0.55), 0.98);
        ctx.beginPath();
        inner.forEach((pt, i) => { if (i === 0) ctx.moveTo(pt.p.x, pt.p.y); else ctx.lineTo(pt.p.x, pt.p.y); });
        ctx.closePath(); ctx.fill();
      }
    } else {
      for (let i = 0; i < N; i++) {
        const a = inner[i], b = inner[i + 1];
        if (!a.p || !b.p) continue;
        ctx.fillStyle = colorFor((a.h + b.h + isl.h) / 3, i);
        ctx.beginPath();
        ctx.moveTo(a.p.x, a.p.y); ctx.lineTo(b.p.x, b.p.y); ctx.lineTo(centre.x, centre.y);
        ctx.closePath(); ctx.fill();
      }
    }
  }
  // Shoreline: a dark waterline rim with a pale beach edge inside it,
  // so each land patch reads as land where it meets the fjord.
  const outer = rings[0];
  if (outer.every((pt) => pt.p)) {
    ctx.beginPath();
    outer.forEach((pt, i) => { if (i === 0) ctx.moveTo(pt.p.x, pt.p.y); else ctx.lineTo(pt.p.x, pt.p.y); });
    ctx.closePath();
    ctx.strokeStyle = 'rgba(8,26,22,0.55)'; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = 'rgba(226,205,160,0.75)'; ctx.lineWidth = 2.2; ctx.stroke();
  }
  drawIslandTrees(ctx, project, isl, decor);
  if (decor.fall !== null) drawWaterfall(ctx, project, isl, decor.fall, cam);
}

// Pine stands scattered over the lower slopes: two stacked triangles a
// tree, dark against the grass, thinning out below the snowline.
function drawIslandTrees(ctx, project, isl, decor) {
  for (const tr of decor.trees) {
    const wx = isl.x + Math.cos(tr.a) * isl.r * tr.f;
    const wz = isl.z + Math.sin(tr.a) * isl.r * tr.f;
    const wy = terrainHeight(wx, wz);
    if (wy < 5 || wy > isl.h * 0.68) continue;
    const p = project(wx, wy, wz);
    if (!p || p.depth > 2400) continue;
    const s = Math.max(1.6, Math.min(10, 640 / p.depth)) * tr.s;
    ctx.fillStyle = '#1d3d2b';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - s * 2.4); ctx.lineTo(p.x + s * 0.75, p.y); ctx.lineTo(p.x - s * 0.75, p.y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2a5a3e';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - s * 3.1); ctx.lineTo(p.x + s * 0.5, p.y - s * 1.1); ctx.lineTo(p.x - s * 0.5, p.y - s * 1.1);
    ctx.closePath(); ctx.fill();
  }
}

// A white ribbon falling off the high islands where a cliff meets the
// water, with a foam patch at its foot. Falls on the far side of an
// island are skipped — they would draw over the summit.
function drawWaterfall(ctx, project, isl, angle, cam) {
  const baseWx = isl.x + Math.cos(angle) * isl.r;
  const baseWz = isl.z + Math.sin(angle) * isl.r;
  const camD = Math.hypot(cam.x - isl.x, cam.z - isl.z);
  if (Math.hypot(cam.x - baseWx, cam.z - baseWz) > camD + isl.r * 0.35) return;
  const pts = [];
  for (let k = 0; k <= 5; k++) {
    const f = 0.24 + (k / 5) * 0.76;
    const wx = isl.x + Math.cos(angle) * isl.r * f;
    const wz = isl.z + Math.sin(angle) * isl.r * f;
    const p = project(wx, terrainHeight(wx, wz) + 0.7, wz);
    if (!p || p.depth > 3400) return;
    pts.push(p);
  }
  ctx.strokeStyle = 'rgba(206,233,243,0.55)';
  ctx.lineWidth = Math.max(1.1, Math.min(3.2, 700 / pts[5].depth));
  ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
  ctx.stroke();
  const b = pts[5];
  ctx.fillStyle = 'rgba(232,246,250,0.55)';
  ctx.beginPath(); ctx.ellipse(b.x, b.y, Math.max(2, 300 / b.depth), Math.max(1, 110 / b.depth), 0, 0, Math.PI * 2); ctx.fill();
}

// Soft dusk cloud bands: dark bellies with a warm sunlit underside.
function drawDuskClouds(ctx, heading) {
  const bands = [
    { fx: 0.14, fy: 0.15, rx: 300, ry: 20 }, { fx: 0.42, fy: 0.09, rx: 380, ry: 24 },
    { fx: 0.68, fy: 0.20, rx: 330, ry: 18 }, { fx: 0.90, fy: 0.12, rx: 290, ry: 21 },
    { fx: 0.55, fy: 0.27, rx: 240, ry: 14 },
  ];
  for (const b of bands) {
    const x = (((b.fx - heading * 0.015) % 1) + 1) % 1 * (W + 420) - 210;
    const y = b.fy * H;
    ctx.fillStyle = 'rgba(238,164,102,0.20)';
    ctx.beginPath(); ctx.ellipse(x, y + b.ry * 0.55, b.rx, b.ry * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(27,40,54,0.30)';
    ctx.beginPath(); ctx.ellipse(x, y, b.rx, b.ry, 0, 0, Math.PI * 2); ctx.fill();
  }
}

// Glitter on the water: a warm path under the sun and a cool sparkle
// spread over the rest, each fleck twinkling on its own phase.
function drawSparkles(ctx, left, right, sun, t) {
  const horizonAt = (x) => left.y + (right.y - left.y) * ((x + 40) / (W + 80));
  ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  for (let i = 0; i < SPARKS.length; i++) {
    const s = SPARKS[i];
    const warm = i < 130;
    if (warm && !sun) continue;
    const x = warm ? sun.x + (s.u - 0.5) * (60 + s.v * 320) : s.u * W;
    const hy = horizonAt(x);
    const y = hy + 5 + s.v * s.v * (H - hy - 16);
    if (y > H - 4 || y < hy + 3) continue;
    const tw = 0.5 + 0.5 * Math.sin(t * 2.6 + s.w * 40);
    const alpha = (warm ? 0.16 : 0.10) * (0.35 + 0.65 * tw);
    ctx.strokeStyle = warm ? 'rgba(255,213,158,' + alpha.toFixed(3) + ')' : 'rgba(178,220,232,' + alpha.toFixed(3) + ')';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5 + s.v * 12, y); ctx.stroke();
  }
}

// Two skeins of birds crossing the evening sky.
function drawBirds(ctx, t) {
  ctx.strokeStyle = 'rgba(14,22,28,0.6)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let f = 0; f < 2; f++) {
    const cx = ((t * 9 + 480 + f * 640) % (W + 360)) - 180;
    const cy = 118 + f * 74 + Math.sin(t * 0.9 + f * 2.0) * 9;
    for (let i = 0; i < 7; i++) {
      const bx = cx + (i % 3) * 27 - Math.floor(i / 3) * 15;
      const by = cy + Math.floor(i / 3) * 17 + (i % 3) * 5;
      const flap = Math.sin(t * 7 + i * 1.3 + f) * 4;
      ctx.beginPath();
      ctx.moveTo(bx - 8, by + flap);
      ctx.quadraticCurveTo(bx - 3, by - 3.5, bx, by);
      ctx.quadraticCurveTo(bx + 3, by - 3.5, bx + 8, by + flap);
      ctx.stroke();
    }
  }
}

// Working boats on slow patrol lines: a coloured hull, a lit cabin and
// a V of foam trailing the stern.
function drawBoats(ctx, project, t) {
  for (const boat of BOATS) {
    const off = Math.sin(t * 0.045 + boat.phase) * boat.range;
    const bx = boat.x + Math.sin(boat.dir) * off;
    const bz = boat.z - Math.cos(boat.dir) * off;
    const fx = Math.sin(boat.dir), fz = -Math.cos(boat.dir);
    const bow = project(bx + fx * 15, 1.2, bz + fz * 15);
    if (!bow || bow.depth > 3200) continue;
    const stern = project(bx - fx * 15, 1.2, bz - fz * 15);
    const port = project(bx - fz * 5, 1.2, bz + fx * 5);
    const star = project(bx + fz * 5, 1.2, bz - fx * 5);
    if (!stern || !port || !star) continue;
    ctx.strokeStyle = 'rgba(214,236,240,0.4)'; ctx.lineWidth = Math.max(1, 130 / bow.depth);
    for (const side of [-1, 1]) {
      const wStart = project(bx - fx * 15 + side * fz * 4, 0.6, bz - fz * 15 - side * fx * 4);
      const wEnd = project(bx - fx * 52 + side * fz * 13, 0.6, bz - fz * 52 - side * fx * 13);
      if (wStart && wEnd) { ctx.beginPath(); ctx.moveTo(wStart.x, wStart.y); ctx.lineTo(wEnd.x, wEnd.y); ctx.stroke(); }
    }
    ctx.fillStyle = boat.hue;
    ctx.beginPath();
    ctx.moveTo(bow.x, bow.y); ctx.lineTo(star.x, star.y); ctx.lineTo(stern.x, stern.y); ctx.lineTo(port.x, port.y);
    ctx.closePath(); ctx.fill();
    const cabTop = project(bx - fx * 3, 5.2, bz - fz * 3);
    const cabBase = project(bx - fx * 3, 1.2, bz - fz * 3);
    if (cabTop && cabBase) {
      const wpx = Math.max(1.5, 240 / bow.depth);
      ctx.fillStyle = '#e9e2d2';
      ctx.fillRect(cabTop.x - wpx, cabTop.y, wpx * 2, Math.max(1.5, cabBase.y - cabTop.y));
      ctx.fillStyle = '#ffca7a';
      ctx.fillRect(cabTop.x - wpx * 0.4, cabTop.y + (cabBase.y - cabTop.y) * 0.35, wpx * 0.8, Math.max(1, (cabBase.y - cabTop.y) * 0.3));
    }
  }
}

function drawHouse(ctx, project, house, pal) {
  const base = project(house.x, house.alt, house.z);
  if (!base || base.depth > 2600) return;
  const s = Math.max(2, Math.min(30, 950 / base.depth));
  ctx.fillStyle = '#e6ddcb';
  ctx.fillRect(base.x - s * 0.5, base.y - s * 0.8, s, s * 0.8);
  ctx.fillStyle = '#a63c2e';
  ctx.beginPath();
  ctx.moveTo(base.x - s * 0.65, base.y - s * 0.8);
  ctx.lineTo(base.x, base.y - s * 1.35);
  ctx.lineTo(base.x + s * 0.65, base.y - s * 0.8);
  ctx.closePath(); ctx.fill();
  // Lit windows against the dusk — somebody is home for supper.
  if (s > 6) {
    ctx.fillStyle = '#ffc46a';
    const ws = s * 0.16;
    ctx.fillRect(base.x - s * 0.30, base.y - s * 0.55, ws, ws);
    if (house.rot > 1.2) ctx.fillRect(base.x + s * 0.13, base.y - s * 0.55, ws, ws);
  }
}

function drawLighthouse(ctx, project, t, pal) {
  const baseAlt = terrainHeight(LIGHTHOUSE.x, LIGHTHOUSE.z);
  const base = project(LIGHTHOUSE.x, baseAlt, LIGHTHOUSE.z);
  const top = project(LIGHTHOUSE.x, baseAlt + LIGHTHOUSE.height, LIGHTHOUSE.z);
  if (!base || !top || base.depth > 3200) return;
  const wBase = Math.max(2, 260 / base.depth * 6);
  ctx.fillStyle = '#e8e2d4';
  ctx.beginPath();
  ctx.moveTo(base.x - wBase, base.y); ctx.lineTo(top.x - wBase * 0.55, top.y);
  ctx.lineTo(top.x + wBase * 0.55, top.y); ctx.lineTo(base.x + wBase, base.y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#b0402f';
  ctx.fillRect(top.x - wBase * 0.62, top.y + (base.y - top.y) * 0.34, wBase * 1.24, (base.y - top.y) * 0.2);
  // Lamp and rotating beam.
  ctx.fillStyle = '#ffd76a';
  ctx.beginPath(); ctx.arc(top.x, top.y - 2, Math.max(2, wBase * 0.5), 0, Math.PI * 2); ctx.fill();
  const beamA = t * 0.7;
  ctx.fillStyle = 'rgba(255,214,106,0.10)';
  for (const dir of [0, Math.PI]) {
    ctx.beginPath();
    ctx.moveTo(top.x, top.y - 2);
    ctx.lineTo(top.x + Math.cos(beamA + dir) * 190, top.y - 2 + Math.sin(beamA + dir) * 46);
    ctx.lineTo(top.x + Math.cos(beamA + dir + 0.1) * 190, top.y - 2 + Math.sin(beamA + dir + 0.1) * 46);
    ctx.closePath(); ctx.fill();
  }
}

function drawRunway(ctx, project, rw, pal, view) {
  const hw = rw.width / 2, hl = rw.length / 2;
  const corners = [
    project(rw.cx - hw, rw.alt + 0.4, rw.cz + hl), project(rw.cx + hw, rw.alt + 0.4, rw.cz + hl),
    project(rw.cx + hw, rw.alt + 0.4, rw.cz - hl), project(rw.cx - hw, rw.alt + 0.4, rw.cz - hl),
  ];
  if (corners.some((c) => !c)) return;
  ctx.fillStyle = pal.strip;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath(); ctx.fill();
  // Centreline dashes and threshold bars.
  ctx.strokeStyle = pal.stripLine; ctx.lineWidth = 2;
  ctx.setLineDash([14, 12]);
  const c1 = project(rw.cx, rw.alt + 0.5, rw.cz + hl * 0.92);
  const c2 = project(rw.cx, rw.alt + 0.5, rw.cz - hl * 0.92);
  if (c1 && c2) { ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.stroke(); }
  ctx.setLineDash([]);
  // Threshold bars: piano-key stripes across both ends of the strip.
  ctx.strokeStyle = pal.stripLine;
  for (const endSign of [1, -1]) {
    const zBar = rw.cz + endSign * (hl - 16);
    for (const off of [-0.62, -0.31, 0, 0.31, 0.62]) {
      const b1 = project(rw.cx + off * rw.width, rw.alt + 0.5, zBar + endSign * 13);
      const b2 = project(rw.cx + off * rw.width, rw.alt + 0.5, zBar - endSign * 1);
      if (b1 && b2) {
        ctx.lineWidth = Math.max(1.2, Math.min(5, 260 / b1.depth));
        ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
      }
    }
  }
  // Approach lights: a centreline row running out from the south
  // threshold, so the strip can be picked out from far down the fjord.
  ctx.fillStyle = '#cfe8ff';
  for (let i = 1; i <= 5; i++) {
    const p = project(rw.cx, rw.alt + 1.2, rw.cz + hl + i * 46);
    if (p && p.depth < 3200) { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.2, 216 / p.depth), 0, Math.PI * 2); ctx.fill(); }
  }
  // Edge lights.
  ctx.fillStyle = '#ffd76a';
  for (let i = 0; i <= 8; i++) {
    const z = rw.cz + hl - (i / 8) * rw.length;
    for (const side of [-1, 1]) {
      const p = project(rw.cx + side * (hw + 3), rw.alt + 1, z);
      if (p && p.depth < 2600) { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, 60 / p.depth * 3), 0, Math.PI * 2); ctx.fill(); }
    }
  }
  // PAPI: four lights by the near threshold that read the glide slope.
  const plane = view.plane;
  if (plane && !plane.onGround) {
    const dz = plane.z - (rw.cz + hl);
    if (dz > 60 && dz < 2400 && Math.abs(plane.x - rw.cx) < 320) {
      const glide = Math.atan2(plane.alt - rw.alt, dz) * 180 / Math.PI;
      const whites = glide > 4.2 ? 4 : glide > 3.4 ? 3 : glide > 2.6 ? 2 : glide > 1.8 ? 1 : 0;
      for (let i = 0; i < 4; i++) {
        const p = project(rw.cx - hw - 9, rw.alt + 1.6, rw.cz + hl - 26 - i * 0.01);
        if (!p) continue;
        ctx.fillStyle = i < whites ? '#ffffff' : '#ff3b30';
        ctx.beginPath(); ctx.arc(p.x - i * 7, p.y, 3.2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  // Name label when close: on the terrain west of the strip's near end,
  // right-aligned so it ends beside the strip — never across the strip
  // or the aircraft.
  const labelP = project(rw.cx - hw - 75, rw.alt + 2, rw.cz + hl * 0.9);
  const nearMid = project(rw.cx, rw.alt + 2, rw.cz + hl * 0.9);
  if (labelP && nearMid && nearMid.depth < 1500) {
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '600 13px system-ui, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(rw.name.toUpperCase(), labelP.x, labelP.y + 4);
  }
}

function drawRings(ctx, project, ms, t) {
  const rings = ms.mission.rings;
  let nextFound = false;
  rings.forEach((ring, i) => {
    const done = ms.ringDone[i];
    const isNext = !done && !nextFound;
    if (!done) nextFound = true;
    const c = project(ring.x, ring.alt, ring.z);
    if (!c || c.depth > 5200) return;
    const px = project(ring.x + 26, ring.alt, ring.z);
    const py = project(ring.x, ring.alt + 26, ring.z);
    if (!px || !py) return;
    const rx = Math.abs(px.x - c.x), ry = Math.abs(py.y - c.y);
    ctx.lineWidth = isNext ? 7 : 5;
    ctx.strokeStyle = done ? 'rgba(80,220,140,0.5)' : isNext ? '#ffb340' : 'rgba(110,200,235,0.65)';
    if (isNext) { ctx.shadowColor = '#ffb340'; ctx.shadowBlur = 16 + Math.sin(t * 5) * 6; }
    ctx.beginPath(); ctx.ellipse(c.x, c.y, Math.max(rx, 3), Math.max(ry, 3), 0, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
  });
}

function drawDropZones(ctx, project, ms, pal) {
  for (const zone of ms.mission.dropZones) {
    const alt = terrainHeight(zone.x, zone.z);
    const c = project(zone.x, alt + 2, zone.z);
    if (!c || c.depth > 4200) return;
    const px = project(zone.x + 62, alt + 2, zone.z);
    if (!px) return;
    const r = Math.abs(px.x - c.x);
    ctx.strokeStyle = '#ff7a3c'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, r, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c.x - r * 0.4, c.y); ctx.lineTo(c.x + r * 0.4, c.y);
    ctx.moveTo(c.x, c.y - r * 0.18); ctx.lineTo(c.x, c.y + r * 0.18);
    ctx.stroke();
    ctx.fillStyle = '#ffb08a'; ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('DROP — ' + zone.label.toUpperCase(), c.x, c.y - r * 0.5 - 6);
  }
}

function drawCrates(ctx, project, ms) {
  for (const c of ms.crates) {
    const p = project(c.x, c.alt, c.z);
    if (!p) continue;
    const s = Math.max(2, Math.min(20, 620 / p.depth));
    if (!c.done && c.t > 0.9) {
      ctx.strokeStyle = '#e8e2d4'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(p.x, p.y - s * 1.7, s * 0.9, Math.PI, 0); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - s * 0.9, p.y - s * 1.7); ctx.lineTo(p.x, p.y - s * 0.3);
      ctx.moveTo(p.x + s * 0.9, p.y - s * 1.7); ctx.lineTo(p.x, p.y - s * 0.3);
      ctx.stroke();
    }
    ctx.fillStyle = c.done && c.hit ? '#7dc95e' : '#b98a4e';
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    ctx.strokeStyle = '#6e5326'; ctx.lineWidth = 1;
    ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
  }
}

function drawAircraft(ctx, plane, t) {
  const ax = W / 2 - (plane.bank || 0) * 26;
  const ay = H * 0.60 - (plane.climbAngle || 0) * 55;

  // Grounding: a soft shadow on the water/terrain below, sliding away and
  // fading as the aircraft climbs, tight under the wheels on the ground;
  // and a faint twin wake when skimming low over water.
  const groundAlt = terrainHeight(plane.x, plane.z);
  const agl = Math.max(0, plane.alt - groundAlt);
  if (plane.onGround) {
    ctx.fillStyle = 'rgba(6,14,18,0.32)';
    ctx.beginPath(); ctx.ellipse(ax, ay + 58, 150, 26, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    const shA = Math.max(0.07, 0.30 - agl * 0.0021);
    const shRx = Math.max(58, 148 - agl * 0.75);
    const shX = ax + Math.min(64, agl * 0.55);
    const shY = ay + 74 + Math.min(58, agl * 0.5);
    ctx.fillStyle = 'rgba(6,14,18,' + shA.toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(shX, shY, shRx, shRx * 0.20, 0, 0, Math.PI * 2); ctx.fill();
    if (groundAlt <= 0.01 && agl > 2 && agl < 30 && plane.speed > 12) {
      ctx.strokeStyle = 'rgba(220,238,244,0.35)'; ctx.lineWidth = 2.5;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(ax + side * 16, ay + 96);
        ctx.quadraticCurveTo(ax + side * (30 + agl), ay + 130 + agl * 0.4, ax + side * (58 + agl * 1.4), ay + 168 + agl * 0.5);
        ctx.stroke();
      }
    }
  }

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate((plane.bank || 0) * 0.85);
  const S = 1.0;
  ctx.scale(S, S);

  // Main wing with dihedral, shaded panels.
  const wingGrad = ctx.createLinearGradient(-175, 0, 175, 0);
  wingGrad.addColorStop(0, '#7e94a6'); wingGrad.addColorStop(0.5, '#aebfcc'); wingGrad.addColorStop(1, '#7e94a6');
  ctx.fillStyle = wingGrad;
  ctx.beginPath();
  ctx.moveTo(-178, -6); ctx.lineTo(-30, 10); ctx.lineTo(30, 10); ctx.lineTo(178, -6);
  ctx.lineTo(168, 14); ctx.lineTo(-168, 14); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(30,45,58,0.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-120, -2); ctx.lineTo(-118, 13); ctx.moveTo(120, -2); ctx.lineTo(118, 13); ctx.stroke();
  // Nav lights: red port, green starboard, white tail strobe.
  ctx.fillStyle = '#ff4444'; ctx.beginPath(); ctx.arc(-176, 2, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#39e75f'; ctx.beginPath(); ctx.arc(176, 2, 4.5, 0, Math.PI * 2); ctx.fill();
  if (Math.sin(t * 6) > 0.55) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 96, 4, 0, Math.PI * 2); ctx.fill(); }

  // Fuselage: nose up-screen (far), tail cone toward the viewer.
  const fusGrad = ctx.createLinearGradient(-30, 0, 30, 0);
  fusGrad.addColorStop(0, '#5f7488'); fusGrad.addColorStop(0.45, '#c3d2de'); fusGrad.addColorStop(1, '#54687c');
  ctx.fillStyle = fusGrad;
  ctx.beginPath();
  ctx.moveTo(0, -104);
  ctx.quadraticCurveTo(17, -88, 21, -48);
  ctx.quadraticCurveTo(26, 6, 20, 46);
  ctx.quadraticCurveTo(14, 78, 0, 88);
  ctx.quadraticCurveTo(-14, 78, -20, 46);
  ctx.quadraticCurveTo(-26, 6, -21, -48);
  ctx.quadraticCurveTo(-17, -88, 0, -104);
  ctx.fill();
  // Cargo door outline and cheatline.
  ctx.strokeStyle = 'rgba(25,40,52,0.5)'; ctx.lineWidth = 1.6;
  ctx.strokeRect(-13, -6, 26, 44);
  ctx.beginPath(); ctx.moveTo(-22, -34); ctx.lineTo(22, -34); ctx.stroke();
  ctx.fillStyle = '#c9452c';
  ctx.fillRect(-23, -40, 46, 5);
  // Canopy glass.
  const glass = ctx.createLinearGradient(0, -86, 0, -52);
  glass.addColorStop(0, '#9fd4e8'); glass.addColorStop(1, '#274b5e');
  ctx.fillStyle = glass;
  ctx.beginPath(); ctx.ellipse(0, -68, 12.5, 19, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.ellipse(-4, -76, 4, 8, 0.3, 0, Math.PI * 2); ctx.fill();

  // Tailplane and fin.
  ctx.fillStyle = '#8499ab';
  ctx.beginPath();
  ctx.moveTo(-62, 66); ctx.lineTo(62, 66); ctx.lineTo(52, 82); ctx.lineTo(-52, 82); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#a63c2e';
  ctx.beginPath();
  ctx.moveTo(0, 30); ctx.lineTo(9, 88); ctx.lineTo(-9, 88); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f2ead8'; ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('FH-01', 0, 74);

  // Gear legs and wheels (fixed gear, always down on this old freighter).
  ctx.strokeStyle = '#33424f'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-20, 20); ctx.lineTo(-30, 40); ctx.moveTo(20, 20); ctx.lineTo(30, 40); ctx.stroke();
  ctx.fillStyle = '#1c2329';
  ctx.beginPath(); ctx.arc(-31, 44, 7, 0, Math.PI * 2); ctx.arc(31, 44, 7, 0, Math.PI * 2); ctx.fill();

  // Spinning prop at the nose: a translucent blur disc with a rim ring,
  // and two blade streaks turning inside it.
  ctx.save();
  ctx.translate(0, -106);
  ctx.fillStyle = 'rgba(200,214,224,0.10)';
  ctx.beginPath(); ctx.ellipse(0, 0, 64, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(200,214,224,0.20)';
  ctx.beginPath(); ctx.ellipse(0, 0, 58, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(215,228,238,0.38)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, 59, 11.5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(40,52,62,0.75)'; ctx.lineWidth = 4;
  const pa = plane.propPhase || 0;
  ctx.beginPath();
  ctx.moveTo(Math.cos(pa) * -56, Math.sin(pa) * -10);
  ctx.lineTo(Math.cos(pa) * 56, Math.sin(pa) * 10);
  ctx.stroke();
  ctx.fillStyle = '#c9452c';
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.restore();
}

function drawRain(ctx, t) {
  ctx.strokeStyle = 'rgba(190,210,225,0.28)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < 110; i++) {
    const x = ((i * 173.3 + t * 620) % (W + 80)) - 40;
    const y = ((i * 97.7 + t * 900) % (H + 60)) - 30;
    ctx.moveTo(x, y); ctx.lineTo(x - 7, y + 17);
  }
  ctx.stroke();
}
