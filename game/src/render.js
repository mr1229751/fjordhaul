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
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.75);
  sky.addColorStop(0, pal.skyTop); sky.addColorStop(0.55, pal.skyMid); sky.addColorStop(1, pal.skyLow);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (const s of STARS) {
    const sx = ((s.x - cam.heading * 0.02) % 1 + 1) % 1 * W;
    ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 0.7 + s.x * 40);
    ctx.fillRect(sx, s.y * H, s.r, s.r);
  }
  ctx.globalAlpha = 1;
  // Low sun, fixed in the west.
  const sun = project(cam.x - 6000, cam.alt + 260, cam.z - 2500);
  if (sun) {
    ctx.fillStyle = pal.sun;
    ctx.beginPath(); ctx.arc(sun.x, sun.y, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,205,140,0.25)';
    ctx.beginPath(); ctx.arc(sun.x, sun.y, 58, 0, Math.PI * 2); ctx.fill();
  }

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
  }

  // --- storm cloud deck, behind the terrain ---
  if (view.weather) drawClouds(ctx, t);

  // --- islands, far to near ---
  const sorted = ISLANDS.map((isl) => ({ isl, d: dist2(cam, isl) })).sort((a, b) => b.d - a.d);
  for (const { isl } of sorted) drawIsland(ctx, project, isl, pal);

  // --- villages and lighthouse ---
  VILLAGES.forEach((village, vi) => {
    for (const house of HOUSES[vi]) drawHouse(ctx, project, house, pal);
  });
  drawLighthouse(ctx, project, t, pal);

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
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i <= 32; i++) {
    const frac = i / 32;
    const idx = Math.floor((((frac + heading * par) % 1) + 1) % 1 * n) % n;
    const lift = (profile[idx] - 55) / 195; // profiles live around 60..250
    const x = -40 + frac * (W + 80);
    const y = left.y + (right.y - left.y) * frac - Math.max(0, lift) * ampPx + 2;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  for (let i = 32; i >= 0; i--) {
    const frac = i / 32;
    ctx.lineTo(-40 + frac * (W + 80), left.y + (right.y - left.y) * frac + 3);
  }
  ctx.closePath(); ctx.fill();
}

function drawIsland(ctx, project, isl, pal) {
  const rings = [
    { f: 1.0, col: pal.slopeDark },
    { f: 0.66, col: pal.slopeMid },
    { f: 0.36, col: pal.slopeHigh },
    { f: 0.15, col: isl.h > 150 ? pal.snow : pal.rock },
  ];
  const N = 18;
  for (const ring of rings) {
    const pts = [];
    let ok = true;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const wx = isl.x + Math.cos(a) * isl.r * ring.f;
      const wz = isl.z + Math.sin(a) * isl.r * ring.f;
      const wy = terrainHeight(wx, wz) + (ring.f === 1 ? -1.5 : 0.5);
      const p = project(wx, wy, wz);
      if (!p) { ok = false; break; }
      pts.push(p);
    }
    if (!ok || !pts.length) continue;
    ctx.fillStyle = ring.col;
    ctx.beginPath();
    pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.closePath(); ctx.fill();
    if (ring.f === 1) {
      // Shoreline: a dark waterline rim with a pale beach edge inside it,
      // so each land patch reads as land where it meets the fjord.
      ctx.strokeStyle = 'rgba(8,26,22,0.55)'; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = 'rgba(226,205,160,0.75)'; ctx.lineWidth = 2.2; ctx.stroke();
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
