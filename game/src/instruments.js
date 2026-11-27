// instruments.js — the panel a pilot actually reads: round airspeed and
// altitude gauges with needles and digital readouts, an artificial horizon
// that rolls and pitches with the plane, a heading tape, vertical speed,
// fuel and hull bars, warning lights, the objective board, centre messages
// and the glide-slope aid that appears on final approach.

import { RUNWAYS, runwayLocal, terrainHeight } from './world.js';
import { STALL_SPEED, wrapAngle } from './flight-model.js';
import { objectivesText } from './missions.js';

const W = 1280, H = 800;

export function drawInstruments(ctx, plane, ms, t, opts) {
  drawTopReadouts(ctx, plane);
  drawHeadingTape(ctx, plane, ms);
  drawObjectives(ctx, plane, ms, opts);
  drawPanel(ctx, plane, t, ms);
  drawWarnings(ctx, plane, t);
  drawGlideAid(ctx, plane, ms);
  if (ms && ms.messageT > 0 && ms.message) drawCentreMessage(ctx, ms, t);
}

function panelBox(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10,17,24,0.88)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(140,170,190,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
}

function drawTopReadouts(ctx, plane) {
  panelBox(ctx, 18, 16, 252, 92);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8fb6c9'; ctx.font = '700 13px system-ui, sans-serif';
  ctx.fillText('ALT', 34, 42); ctx.fillText('SPD', 34, 68); ctx.fillText('HDG', 34, 94);
  ctx.fillStyle = '#f4f7f9'; ctx.font = '700 25px ui-monospace, Menlo, monospace';
  ctx.fillText(Math.max(0, Math.round(plane.alt)) + ' m', 92, 43);
  ctx.fillText(plane.speed.toFixed(1) + ' m/s', 92, 69);
  const hdg = ((Math.round(plane.heading * 180 / Math.PI) % 360) + 360) % 360;
  ctx.fillText(String(hdg).padStart(3, '0') + '°', 92, 95);
}

function drawHeadingTape(ctx, plane, ms) {
  const x0 = W / 2 - 190, y0 = 16, w = 380, h = 40;
  panelBox(ctx, x0, y0, w, h);
  const hdg = plane.heading * 180 / Math.PI;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0 + 4, y0 + 4, w - 8, h - 8); ctx.clip();
  ctx.textAlign = 'center';
  for (let d = -75; d <= 75; d += 5) {
    const deg = Math.round((hdg + d) / 5) * 5;
    const x = W / 2 + (deg - hdg) * 3.4;
    if (x < x0 || x > x0 + w) continue;
    const norm = ((deg % 360) + 360) % 360;
    ctx.strokeStyle = '#7e97a8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y0 + h - 12); ctx.lineTo(x, y0 + h - (norm % 15 === 0 ? 22 : 17)); ctx.stroke();
    if (norm % 30 === 0) {
      ctx.fillStyle = '#dfe9ef'; ctx.font = '700 13px system-ui, sans-serif';
      const label = norm === 0 ? 'N' : norm === 90 ? 'E' : norm === 180 ? 'S' : norm === 270 ? 'W' : String(norm).padStart(3, '0');
      ctx.fillText(label, x, y0 + 20);
    }
  }
  ctx.restore();
  ctx.fillStyle = '#ffb340';
  ctx.beginPath(); ctx.moveTo(W / 2 - 7, y0 + h - 2); ctx.lineTo(W / 2 + 7, y0 + h - 2); ctx.lineTo(W / 2, y0 + h - 11); ctx.closePath(); ctx.fill();
  // Bearing bug for the next ring or the destination strip.
  const target = nextTarget(plane, ms);
  if (target) {
    const bearing = Math.atan2(target.x - plane.x, -(target.z - plane.z));
    const rel = wrapAngle(bearing - plane.heading) * 180 / Math.PI;
    if (Math.abs(rel) < 75) {
      const x = W / 2 + rel * 3.4;
      ctx.fillStyle = '#7ee2a0';
      ctx.beginPath(); ctx.moveTo(x - 5, y0 + 4); ctx.lineTo(x + 5, y0 + 4); ctx.lineTo(x, y0 + 12); ctx.closePath(); ctx.fill();
    }
  }
}

function nextTarget(plane, ms) {
  if (!ms) return null;
  const i = ms.ringDone.findIndex((d) => !d);
  if (i >= 0) return ms.mission.rings[i];
  const zone = ms.mission.dropZones.find((z, zi) => !ms.crates.some((c) => c.done && c.hit && Math.hypot(c.x - z.x, c.z - z.z) < 62));
  if (zone && ms.cratesHit < ms.mission.dropZones.length) return zone;
  const rw = RUNWAYS[ms.mission.destRunway];
  return { x: rw.cx, z: rw.cz };
}

function drawObjectives(ctx, plane, ms, opts) {
  panelBox(ctx, W - 356, 16, 338, 92);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffb340'; ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillText(ms ? ms.mission.name.toUpperCase() : 'FJORDHAUL', W - 340, 42);
  ctx.fillStyle = '#dfe9ef'; ctx.font = '600 14px system-ui, sans-serif';
  if (ms) ctx.fillText(objectivesText(ms), W - 340, 66);
  ctx.fillStyle = '#8fb6c9'; ctx.font = '700 13px system-ui, sans-serif';
  ctx.fillText('SCORE', W - 340, 92);
  ctx.fillStyle = '#f4f7f9'; ctx.font = '700 20px ui-monospace, Menlo, monospace';
  ctx.fillText(ms ? String(ms.score) : '0', W - 282, 93);
  if (opts && opts.wind) {
    ctx.fillStyle = '#ffb08a'; ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillText('WIND ' + opts.wind, W - 190, 92);
  }
}

function drawPanel(ctx, plane, t, ms) {
  const y = H - 128;
  ctx.fillStyle = 'rgba(9,15,21,0.92)';
  ctx.fillRect(0, y, W, 128);
  ctx.fillStyle = 'rgba(140,170,190,0.4)'; ctx.fillRect(0, y, W, 2);
  drawDial(ctx, 108, y + 64, 54, 'AIRSPEED', 'm/s', plane.speed, 90, plane.speed.toFixed(0),
    (v) => -225 + (v / 90) * 270, plane.speed < STALL_SPEED + 3 && !plane.onGround);
  drawDial(ctx, W - 108, y + 64, 54, 'ALTIMETER', 'm', plane.alt, 1000, String(Math.max(0, Math.round(plane.alt))),
    (v) => -90 + ((v % 1000) / 1000) * 360, false, 0.30);
  drawHorizon(ctx, W / 2 - 120, y + 64, 46, plane);
  drawVsi(ctx, W / 2 + 120, y + 64, plane);
  drawBars(ctx, 210, y + 22, plane);
  drawStatusCluster(ctx, 838, y + 20, plane, ms);
}

// The right-hand status cluster: gear state (fixed gear on this old
// freighter — the lamp is green and stays green), height above the
// terrain under the keel, and the distance still to run to the
// destination strip.
function drawStatusCluster(ctx, x, y, plane, ms) {
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7ee2a0';
  ctx.beginPath(); ctx.arc(x + 5, y + 8, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#dfe9ef'; ctx.font = '700 13px system-ui, sans-serif';
  ctx.fillText('GEAR DOWN · LOCKED', x + 18, y + 12);
  ctx.fillStyle = '#8fb6c9'; ctx.font = '700 11px system-ui, sans-serif';
  ctx.fillText('AGL', x, y + 44);
  ctx.fillText('DST', x, y + 74);
  ctx.fillStyle = '#f4f7f9'; ctx.font = '700 16px ui-monospace, Menlo, monospace';
  const agl = Math.max(0, plane.alt - terrainHeight(plane.x, plane.z));
  ctx.fillText(Math.round(agl) + ' m', x + 44, y + 45);
  if (ms) {
    const rw = RUNWAYS[ms.mission.destRunway];
    const dist = Math.hypot(plane.x - rw.cx, plane.z - rw.cz) / 1000;
    ctx.fillText(dist.toFixed(2) + ' km', x + 44, y + 75);
    ctx.fillStyle = '#8fb6c9'; ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText('to ' + rw.name, x + 44, y + 94);
  }
}

function drawDial(ctx, cx, cy, r, label, unit, value, max, digital, angleFor, warn, digitalFrac) {
  ctx.fillStyle = '#101c26';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = warn && Math.sin(performance.now() / 130) > 0 ? '#ff5147' : '#5d7688';
  ctx.lineWidth = 2.5; ctx.stroke();
  const step = max === 1000 ? 100 : max / 9;
  for (let v = 0; v <= max; v += step) {
    const a = angleFor(v) * Math.PI / 180;
    const c = Math.cos(a), s = Math.sin(a);
    ctx.strokeStyle = '#aebfcc'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + c * (r - 9), cy + s * (r - 9));
    ctx.lineTo(cx + c * (r - 3), cy + s * (r - 3));
    ctx.stroke();
    if (max === 90 && v % 30 === 0) {
      ctx.fillStyle = '#dfe9ef'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(String(v), cx + c * (r - 19), cy + s * (r - 19) + 4);
    }
    // Altimeter face numerals: 0-9, one per 100 m revolution step.
    if (max === 1000 && v < 1000) {
      ctx.fillStyle = '#dfe9ef'; ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(String(v / 100), cx + c * (r - 20), cy + s * (r - 20) + 4);
    }
  }
  // Stall band on the airspeed dial.
  if (max === 90) {
    ctx.strokeStyle = '#ff5147'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, r - 5, angleFor(0) * Math.PI / 180, angleFor(STALL_SPEED) * Math.PI / 180); ctx.stroke();
  }
  const a = angleFor(Math.min(value, max)) * Math.PI / 180;
  ctx.strokeStyle = '#ffb340'; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12)); ctx.stroke();
  ctx.fillStyle = '#ffb340'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4f7f9'; ctx.font = '700 17px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center';
  ctx.fillText(digital, cx, cy + r * (digitalFrac === undefined ? 0.52 : digitalFrac));
  ctx.fillStyle = '#8fb6c9'; ctx.font = '700 10px system-ui, sans-serif';
  ctx.fillText(label + ' ' + unit, cx, cy - r - 6);
}

function drawHorizon(ctx, cx, cy, r, plane) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-(plane.bank || 0));
  const pitchPx = (plane.climbAngle || 0) * 130;
  ctx.fillStyle = '#3f7ea6'; ctx.fillRect(-r - 4, -r - 4 + pitchPx, (r + 4) * 2, r + 4 - pitchPx + 60);
  ctx.fillStyle = '#7a5a38'; ctx.fillRect(-r - 4, pitchPx, (r + 4) * 2, r + 4);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-r - 4, pitchPx); ctx.lineTo(r + 4, pitchPx); ctx.stroke();
  for (const p of [-20, -10, 10, 20]) {
    ctx.beginPath(); ctx.moveTo(-9, pitchPx + p); ctx.lineTo(9, pitchPx + p); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#5d7688'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#ffb340'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy); ctx.lineTo(cx - 6, cy); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx + 6, cy); ctx.lineTo(cx + 20, cy);
  ctx.stroke();
  ctx.fillStyle = '#8fb6c9'; ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('HORIZON', cx, cy - r - 4);
}

function drawVsi(ctx, cx, cy, plane) {
  // A flown VSI: round dial, needle, graduations every 2 m/s, numerals at
  // the majors, zero straight up, and a digital readout in m/s.
  const r = 46;
  const vs = Math.max(-12, Math.min(12, plane.vs));
  const angleFor = (v) => -225 + ((v + 12) / 24) * 270; // -12 bottom-left, 0 top, +12 bottom-right
  ctx.fillStyle = '#101c26';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5d7688'; ctx.lineWidth = 2.5; ctx.stroke();
  for (let v = -12; v <= 12; v += 2) {
    const a = angleFor(v) * Math.PI / 180;
    const c = Math.cos(a), s = Math.sin(a);
    const major = v % 6 === 0;
    ctx.strokeStyle = v === 0 ? '#ffffff' : '#aebfcc';
    ctx.lineWidth = v === 0 ? 3 : major ? 2 : 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + c * (r - (major ? 10 : 6)), cy + s * (r - (major ? 10 : 6)));
    ctx.lineTo(cx + c * (r - 3), cy + s * (r - 3));
    ctx.stroke();
    if (major) {
      ctx.fillStyle = '#dfe9ef'; ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(v > 0 ? '+' + v : String(v), cx + c * (r - 21), cy + s * (r - 21) + 3);
    }
  }
  const a = angleFor(vs) * Math.PI / 180;
  ctx.strokeStyle = '#ffb340'; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r - 13), cy + Math.sin(a) * (r - 13)); ctx.stroke();
  ctx.fillStyle = '#ffb340'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4f7f9'; ctx.font = '700 13px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center';
  ctx.fillText((plane.vs >= 0 ? '+' : '') + plane.vs.toFixed(1), cx, cy + r * 0.68);
  ctx.fillStyle = '#8fb6c9'; ctx.font = '700 10px system-ui, sans-serif';
  ctx.fillText('VERT SPEED m/s', cx, cy - r - 6);
}

function drawBars(ctx, x, y, plane) {
  bar(ctx, x, y, 'THROTTLE', plane.throttle, '#ffb340');
  bar(ctx, x, y + 34, 'FUEL', plane.fuel / plane.fuelCapacity, plane.fuel / plane.fuelCapacity < 0.25 ? '#ff5147' : '#7ee2a0');
  bar(ctx, x, y + 68, 'HULL', 1 - plane.damage / 100, plane.damage > 55 ? '#ff5147' : '#8fc3e8');
}

function bar(ctx, x, y, label, frac, color) {
  ctx.fillStyle = '#8fb6c9'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(label, x, y + 11);
  ctx.fillStyle = '#101c26'; ctx.fillRect(x + 74, y, 190, 13);
  ctx.strokeStyle = '#5d7688'; ctx.lineWidth = 1; ctx.strokeRect(x + 74, y, 190, 13);
  ctx.fillStyle = color;
  ctx.fillRect(x + 75, y + 1, 188 * Math.max(0, Math.min(1, frac)), 11);
}

function drawWarnings(ctx, plane, t) {
  ctx.textAlign = 'center';
  if (plane.stalled && Math.sin(t * 10) > -0.2) {
    ctx.fillStyle = '#ff5147'; ctx.font = '800 30px system-ui, sans-serif';
    ctx.fillText('STALL', W / 2, 152);
  }
  if (plane.fuel / plane.fuelCapacity < 0.2 && Math.sin(t * 4) > 0) {
    ctx.fillStyle = '#ffb340'; ctx.font = '800 19px system-ui, sans-serif';
    ctx.fillText('LOW FUEL', W / 2, 180);
  }
  if (plane.damage > 55) {
    ctx.fillStyle = '#ff8a7a'; ctx.font = '800 19px system-ui, sans-serif';
    ctx.fillText('HULL DAMAGE', W / 2, 206);
  }
}

function drawGlideAid(ctx, plane, ms) {
  if (!ms || plane.onGround) return;
  const rw = RUNWAYS[ms.mission.destRunway];
  const local = runwayLocal(rw, plane.x, plane.z);
  const distToThreshold = plane.z - (rw.cz + rw.length / 2);
  const aligned = Math.abs(plane.x - rw.cx) < 200 && Math.abs(wrapAngle(plane.heading - rw.heading)) < 0.5;
  if (!aligned || distToThreshold < 40 || distToThreshold > 2200) return;
  const glide = Math.atan2(plane.alt - rw.alt, distToThreshold) * 180 / Math.PI;
  const x = W - 120, y = 300;
  panelBox(ctx, x - 86, y - 64, 172, 128);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8fb6c9'; ctx.font = '700 12px system-ui, sans-serif';
  ctx.fillText('FINAL — ' + rw.name.split(' ')[0].toUpperCase(), x, y - 40);
  ctx.font = '800 21px system-ui, sans-serif';
  ctx.fillStyle = glide > 4.2 ? '#f4f7f9' : glide < 2.4 ? '#ff5147' : '#7ee2a0';
  ctx.fillText(glide > 4.2 ? '▼ TOO HIGH' : glide < 2.4 ? '▲ TOO LOW' : '● ON GLIDE', x, y - 10);
  ctx.fillStyle = '#dfe9ef'; ctx.font = '600 14px ui-monospace, Menlo, monospace';
  ctx.fillText(Math.round(distToThreshold) + ' m to threshold', x, y + 20);
  ctx.fillText('sink ' + (-plane.vs).toFixed(1) + ' m/s', x, y + 42);
  if (local) { ctx.fillStyle = '#7ee2a0'; ctx.fillText('OVER THE STRIP', x, y + 60); }
}

function drawCentreMessage(ctx, ms, t) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, ms.messageT / 0.8);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd9a0';
  ctx.font = '800 34px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 10;
  ctx.fillText(ms.message, W / 2, 250);
  ctx.restore();
}
