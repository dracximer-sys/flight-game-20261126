// Langit Courier: Nusantara Run — game constants and mission definitions.
// All distances in metres, speeds in metres per second, angles in radians
// unless a name says otherwise. Nothing here touches the network.

export const GAME_NAME = 'Langit Courier: Nusantara Run';
export const GAME_TAGLINE = 'Terbang antar pulau, antar paket, antar badai.';

// World: one archipelago, 4000 m by 4000 m, sea level at y = 0.
export const WORLD_SIZE = 4000;
export const WORLD_HALF = WORLD_SIZE / 2;
export const SEA_LEVEL = 0;

// Aircraft limits.
export const PLANE = {
  maxSpeed: 58, // m/s at full throttle
  cruiseSpeed: 34,
  minSpeed: 14, // below this the courier stalls and sinks
  accel: 14, // m/s^2 toward the throttle target speed
  maxBank: 0.62, // radians, about 35 degrees
  bankRate: 2.4, // radians per second toward the bank target
  turnAuthority: 0.42, // heading rate per radian of bank
  pitchRate: 0.5, // radians per second toward the pitch target
  maxPitch: 0.38,
  stallSink: 9, // m/s lost when stalled
  takeoffSpeed: 26,
};

// Fuel: 100 units at mission start; a sortie lasts about six minutes at cruise.
// Rings refund a little fuel, so a clean line through the rings is also a
// fuel decision, not just a score decision.
export const FUEL = {
  start: 100,
  baseDrain: 0.10, // units per second, engine idling
  throttleDrain: 0.22, // extra units per second at full throttle
  ringBonus: 4, // units refunded for each ring flown
  lowWarning: 25,
};

// Scoring.
export const SCORE = {
  ring: 250,
  ringTimeBonus: 120, // scaled by how fast the ring was reached
  landing: 500,
  delivery: 800,
  fuelBonusPerUnit: 6, // leftover fuel at mission end
};

// Camera: chase view behind and above the courier plane.
export const CAMERA = {
  distance: 24,
  height: 8,
  lookAhead: 46,
  focal: 760, // pixels, tuned for a 1280x720 frame
};

// Rendering.
export const RENDER = {
  cellSize: 50, // terrain grid cell, metres
  viewDepth: 1300, // metres of terrain drawn ahead
  viewWidth: 750, // metres drawn to each side
  fogStart: 750,
  fogEnd: 1300,
};

// Rings.
export const RING = {
  radius: 26,
  passRadius: 24,
  glow: 14,
};

// Mission list, shown on the title screen in this order.
export const MISSIONS = [
  {
    id: 'ring-run',
    name: 'Ring Run',
    blurb: 'Terbang melewati 8 ring di atas kepulauan. Cepat dan rapi.',
    timeLimit: 240,
    difficulty: 'Mudah',
  },
  {
    id: 'island-hop',
    name: 'Island Hop',
    blurb: 'Antar paket: mendarat di dua runway pulau, tiga kali.',
    timeLimit: 360,
    difficulty: 'Sedang',
  },
  {
    id: 'storm-delivery',
    name: 'Storm Delivery',
    blurb: 'Badai datang. Enam ring, angin kencang, lalu mendarat.',
    timeLimit: 300,
    difficulty: 'Sulit',
  },
];

// Keys, kept in one place so input.js and the title screen agree.
export const KEYS = {
  throttleUp: ['KeyW', 'ArrowUp'],
  throttleDown: ['KeyS', 'ArrowDown'],
  turnLeft: ['KeyA', 'ArrowLeft'],
  turnRight: ['KeyD', 'ArrowRight'],
  pause: ['KeyP', 'Escape'],
  restart: ['KeyR'],
  mute: ['KeyM'],
  mission1: ['Digit1'],
  mission2: ['Digit2'],
  mission3: ['Digit3'],
  confirm: ['Enter', 'Space'],
};
