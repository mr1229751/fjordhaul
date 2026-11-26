// world.js — the fjord itself: seeded islands, runways, villages and the
// lighthouse, plus the terrain height every other module reads. North is -Z,
// east is +X, heights are metres above the water. Nothing here is random at
// run time: the archipelago is fixed data, so every flight sees the same fjord.

export const WATER_Y = 0;

// Islands: kind 'peak' is a smooth mountain blob, kind 'plateau' is a flat
// top an airstrip can sit on. h is the summit (peak) or plateau height.
export const ISLANDS = [
  { x: 0,     z: 350,   r: 620, h: 16,  kind: 'plateau', name: 'Haulvik' },
  { x: 330,   z: -150,  r: 120, h: 42,  kind: 'peak',    name: 'Fyrholm' },
  { x: -420,  z: -700,  r: 300, h: 120, kind: 'peak',    name: 'Vestfjellet' },
  { x: 380,   z: -1050, r: 260, h: 90,  kind: 'peak',    name: 'Brefjellet' },
  { x: -260,  z: -1500, r: 340, h: 170, kind: 'peak',    name: 'Svarthoyda' },
  { x: 520,   z: -1900, r: 300, h: 140, kind: 'peak',    name: 'Austfjellet' },
  { x: -80,   z: -2150, r: 240, h: 80,  kind: 'peak',    name: 'Midtoya' },
  { x: -520,  z: -2500, r: 380, h: 190, kind: 'peak',    name: 'Storefjellet' },
  { x: 560,   z: -2650, r: 430, h: 20,  kind: 'plateau', name: 'Stormodden' },
  { x: 150,   z: -2900, r: 300, h: 130, kind: 'peak',    name: 'Langoya' },
  { x: -380,  z: -3300, r: 330, h: 160, kind: 'peak',    name: 'Nordfjellet' },
  { x: 240,   z: -3750, r: 280, h: 110, kind: 'peak',    name: 'Sisteoya' },
  { x: 330,   z: -4080, r: 260, h: 90,  kind: 'peak',    name: 'Portoya' },
  { x: -150,  z: -4450, r: 700, h: 14,  kind: 'plateau', name: 'Nordhavn' },
];

function islandHeight(island, x, z) {
  const dx = x - island.x;
  const dz = z - island.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= island.r * island.r) return 0;
  const t = Math.sqrt(d2) / island.r;
  if (island.kind === 'plateau') {
    if (t < 0.72) return island.h;
    const s = (t - 0.72) / 0.28;
    return island.h * Math.max(0, 1 - s * s);
  }
  const s = 1 - t * t;
  return island.h * s * s;
}

export function terrainHeight(x, z) {
  let h = WATER_Y;
  for (const island of ISLANDS) {
    const ih = islandHeight(island, x, z);
    if (ih > h) h = ih;
  }
  return h;
}

// Runways lie along the fjord (heading 0 = north). cx/cz is the centre,
// length/width in metres, alt the strip elevation.
export const RUNWAYS = {
  home:  { id: 'home',  name: 'Haulvik Strip',  cx: 0,    cz: 300,   length: 950,  width: 46, alt: 16, heading: 0 },
  far:   { id: 'far',   name: 'Nordhavn Strip', cx: -150, cz: -4450, length: 1000, width: 46, alt: 14, heading: 0 },
  storm: { id: 'storm', name: 'Stormodden Short Strip', cx: 560, cz: -2650, length: 460, width: 40, alt: 20, heading: 0 },
};

// Local strip coordinates: along > 0 toward the far (north) end from centre,
// side = lateral offset from the centreline. Returns null off the strip.
export function runwayLocal(runway, x, z) {
  const along = -(z - runway.cz);
  const side = x - runway.cx;
  if (Math.abs(along) <= runway.length / 2 && Math.abs(side) <= runway.width / 2) {
    return { along, side };
  }
  return null;
}

export function runwayAt(x, z) {
  for (const key of Object.keys(RUNWAYS)) {
    const rw = RUNWAYS[key];
    if (runwayLocal(rw, x, z)) return rw;
  }
  return null;
}

// Villages: clusters of red-roof houses drawn on the named islands.
export const VILLAGES = [
  { x: 185, z: 540, houses: 9, seed: 11 },
  { x: -215, z: -1420, houses: 7, seed: 23 },
  { x: -470, z: -2420, houses: 8, seed: 37 },
  { x: -330, z: -3230, houses: 6, seed: 41 },
  { x: -95, z: -4380, houses: 8, seed: 53 },
];

export const LIGHTHOUSE = { x: 330, z: -150, height: 36 };

// Deterministic small RNG for village layouts and backdrop ridges.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// House positions for a village, fixed by its seed.
export function villageHouses(village) {
  const rnd = mulberry32(village.seed);
  const houses = [];
  for (let i = 0; i < village.houses; i++) {
    const hx = village.x + (rnd() - 0.5) * 150;
    const hz = village.z + (rnd() - 0.5) * 110;
    houses.push({ x: hx, z: hz, alt: terrainHeight(hx, hz), rot: rnd() * Math.PI });
  }
  return houses;
}

// Two palettes, one art style: the dusk fjord, and its storm-grey variant.
export const PALETTES = {
  dusk: {
    skyTop: '#1c2c47', skyMid: '#2e5d6d', skyLow: '#c97e4e', horizon: '#eaa96c',
    sun: '#ffd9a0', water: '#123c49', waterFar: '#1d5563',
    ridgeFar: '#33566b', ridgeNear: '#223d4a',
    slopeDark: '#274f43', slopeMid: '#356857', slopeHigh: '#5d8a72', rock: '#77827c', snow: '#e9f1ec',
    strip: '#2c3136', stripLine: '#e8e4da',
  },
  storm: {
    skyTop: '#20262e', skyMid: '#3d4a52', skyLow: '#7d6a58', horizon: '#a8895f',
    sun: '#cbb490', water: '#1a2f38', waterFar: '#274550',
    ridgeFar: '#39434a', ridgeNear: '#28323a',
    slopeDark: '#2a4238', slopeMid: '#37594a', slopeHigh: '#567a66', rock: '#6d766f', snow: '#dde6e0',
    strip: '#272c30', stripLine: '#d8d4ca',
  },
};
