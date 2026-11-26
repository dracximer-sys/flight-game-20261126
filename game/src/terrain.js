// The archipelago: seeded islands, beaches, rice fields, towns and two
// runways, all from one height function so the renderer, the physics and the
// missions agree about where the ground is.

import { WORLD_HALF, SEA_LEVEL } from './config.js';
import { createRng, fbmNoise, hash2, range } from './rng.js';

export const TERRAIN_SEED = 20261126;

// Island definitions, generated once from the fixed seed. Each island is a
// Gaussian bump with a peak height and a radius; the height function sums
// them, so islands near each other merge into one landmass.
function buildIslands() {
  const rng = createRng(TERRAIN_SEED);
  const islands = [];
  // The big home island, flat enough in the middle for the main runway.
  islands.push({ x: -650, z: -350, radius: 720, peak: 64 });
  // The second island, home of the far runway.
  islands.push({ x: 1050, z: 650, radius: 560, peak: 52 });
  // A tall volcanic island to the north-east.
  islands.push({ x: 1150, z: -1100, radius: 480, peak: 118 });
  // A low green island to the south-west.
  islands.push({ x: -1250, z: 1000, radius: 520, peak: 34 });
  // A handful of small islets scattered between them.
  for (let i = 0; i < 9; i += 1) {
    islands.push({
      x: range(rng, -1500, 1500),
      z: range(rng, -1500, 1500),
      radius: range(rng, 110, 260),
      peak: range(rng, 12, 42),
    });
  }
  return islands;
}

export const ISLANDS = buildIslands();

// Runways sit on flattened ground. Each one is a rectangle with a heading;
// landing checks and the renderer both use this shape.
export const RUNWAYS = [
  {
    id: 'A',
    name: 'Runway A — Pulau Induk',
    // Centre of the strip, metres in world space.
    x: -650,
    z: -350,
    heading: Math.PI / 2, // east-west
    length: 420,
    width: 34,
  },
  {
    id: 'B',
    name: 'Runway B — Pulau Timur',
    x: 1050,
    z: 650,
    heading: -Math.PI / 4, // north-east diagonal
    length: 380,
    width: 32,
  },
];

// Distance from a point to the centre line of a runway, and how far along
// the strip it is. Negative along means before the threshold.
export function runwayFrame(runway, x, z) {
  const dx = x - runway.x;
  const dz = z - runway.z;
  const along = dx * Math.sin(runway.heading) + dz * Math.cos(runway.heading);
  const across = dx * Math.cos(runway.heading) - dz * Math.sin(runway.heading);
  return { along, across };
}

// True when (x, z) lies on the flattened apron of any runway.
export function runwayAt(x, z) {
  for (const runway of RUNWAYS) {
    const frame = runwayFrame(runway, x, z);
    if (Math.abs(frame.along) <= runway.length / 2 && Math.abs(frame.across) <= runway.width / 2) {
      return runway;
    }
  }
  return null;
}

// True when (x, z) lies on the flattened apron around a runway, used to
// keep the terrain flat a little beyond the strip itself.
function runwayApronAt(x, z) {
  for (const runway of RUNWAYS) {
    const frame = runwayFrame(runway, x, z);
    if (Math.abs(frame.along) <= runway.length / 2 + 60 && Math.abs(frame.across) <= runway.width / 2 + 60) {
      return runway;
    }
  }
  return null;
}

// Ground height in metres at (x, z). Sea floor is -6; land rises from the
// island bumps with two octaves of rolling noise on top.
export function heightAt(x, z) {
  const clampedX = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, x));
  const clampedZ = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, z));
  let height = -6;
  for (const island of ISLANDS) {
    const dx = clampedX - island.x;
    const dz = clampedZ - island.z;
    const distanceSq = dx * dx + dz * dz;
    const radiusSq = island.radius * island.radius;
    if (distanceSq < radiusSq * 4) {
      height += island.peak * Math.exp(-distanceSq / (radiusSq * 0.55));
    }
  }
  // Rolling detail, stronger on high ground so mountains look rugged.
  const detail = fbmNoise(clampedX / 260, clampedZ / 260, TERRAIN_SEED);
  height += (detail - 0.5) * (height > 4 ? 9 : 2.5);
  // Flatten the apron so a runway is a runway, not a hill.
  if (runwayApronAt(clampedX, clampedZ)) height = Math.min(height, 3.2);
  return height;
}

// What kind of ground (x, z) is, for colouring: water, sand, paddy, grass,
// forest, rock or snow. Rice paddies are a checker of flat low fields.
export function terrainKind(x, z) {
  const height = heightAt(x, z);
  if (height <= 0.6) return 'water';
  if (height <= 2.2) return 'sand';
  if (height > 46) return 'snow';
  if (height > 30) return 'rock';
  if (height > 13) return 'forest';
  // Paddy checker: only on flat low ground, cells of about 90 m.
  const cellX = Math.floor(x / 90);
  const cellZ = Math.floor(z / 90);
  const paddy = hash2(cellX, cellZ, TERRAIN_SEED + 11) < 0.42;
  if (height < 7 && paddy) return 'paddy';
  return 'grass';
}

// A small town on the home island, drawn as a cluster of rooftops near the
// main runway, south of the strip so the approach stays clear. Positions are
// seeded so they never move between runs.
export function townHouses() {
  const rng = createRng(TERRAIN_SEED + 77);
  const houses = [];
  for (let i = 0; i < 46; i += 1) {
    houses.push({
      x: -950 + rng() * 420,
      z: -120 + rng() * 260,
      size: 9 + rng() * 8,
      hue: rng(),
    });
  }
  return houses;
}

export const HOUSES = townHouses();

// Cloud puffs for the sky: world positions, a radius and a drift speed.
// They live high up and are projected like any other world point.
export function buildClouds() {
  const rng = createRng(TERRAIN_SEED + 3);
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    clouds.push({
      x: range(rng, -1900, 1900),
      z: range(rng, -1900, 1900),
      y: range(rng, 260, 420),
      radius: range(rng, 90, 220),
      drift: range(rng, 2, 6),
    });
  }
  return clouds;
}

export const CLOUDS = buildClouds();
export { SEA_LEVEL };
