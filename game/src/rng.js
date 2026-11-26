// Seeded random numbers for Langit Courier. Every random choice in the game
// (island shapes, ring jitter, storm gusts, cloud drift) comes from one of
// these, never from Math.random, so a seeded run is exactly reproducible —
// the screenshot modes depend on it.

// Mulberry32: a small, fast, well-behaved seeded PRNG.
export function createRng(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// A deterministic 2D hash in [0, 1) for value noise. Same (x, z, seed),
// same number, on every machine. The multipliers are large odd primes so
// neighbouring cells decorrelate instead of forming visible stripes.
export function hash2(x, z, seed) {
  let h = (x * 374761393 + z * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Smooth value noise over the world plane: bilinear interpolation of the
// hash grid, with a smoothstep so the terrain has no creases.
export function valueNoise(x, z, seed) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const sx = xf * xf * (3 - 2 * xf);
  const sz = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, seed);
  const b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed);
  const d = hash2(xi + 1, zi + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

// Two octaves of value noise, in [0, 1), for rolling terrain detail.
export function fbmNoise(x, z, seed) {
  const coarse = valueNoise(x, z, seed);
  const fine = valueNoise(x * 2.13 + 7.7, z * 2.13 + 3.1, seed + 5);
  return coarse * 0.68 + fine * 0.32;
}

// Pick a number in [min, max) from a seeded rng.
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

// Pick one entry from an array with a seeded rng.
export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}
