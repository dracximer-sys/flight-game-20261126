// The renderer: sky, sea, projected terrain, runways, town, rings and the
// courier plane, all on one 2D canvas. The world is real 3D (x east, z
// south, y up); the camera chases the plane and every world point is
// projected with a pinhole camera, so the view is honest about depth.

import { CAMERA, RENDER } from './config.js';
import { heightAt, terrainKind, RUNWAYS, HOUSES, CLOUDS } from './terrain.js';
import { drawAircraft } from './aircraft.js';
import { hash2 } from './rng.js';

const SKY_TOP = '#2f7fc9';
const SKY_HORIZON = '#cfe6f2';
const SEA_NEAR = '#1d6f8f';
const SEA_FAR = '#9dc8dc';
const FOG_COLOUR = [207, 230, 242];

// Terrain palette, one colour per kind, varied a little by the cell hash.
const PALETTE = {
  sand: [217, 196, 143],
  paddy: [127, 176, 105],
  paddyAlt: [106, 158, 95],
  grass: [105, 168, 79],
  grassAlt: [124, 179, 90],
  forest: [63, 122, 58],
  rock: [138, 127, 116],
  snow: [238, 242, 245],
};

// Mix two RGB colours by t in [0, 1].
function mixColour(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function cssColour(rgb, alpha) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

// Build the chase camera from the plane: behind it, above it, looking
// ahead, rolling a little with the bank so the view never fights the pilot.
export function createCamera(plane, width, height) {
  const heading = plane.heading;
  const fwdX = Math.sin(heading);
  const fwdZ = Math.cos(heading);
  // Right is f cross world-up: facing south (+z), west (-x) is on the right.
  const rightX = -Math.cos(heading);
  const rightZ = Math.sin(heading);
  const camX = plane.x - fwdX * CAMERA.distance;
  const camZ = plane.z - fwdZ * CAMERA.distance;
  const camY = plane.altitude + CAMERA.height;
  // Look target: ahead of the plane, a touch below its altitude.
  const targetX = plane.x + fwdX * CAMERA.lookAhead;
  const targetZ = plane.z + fwdZ * CAMERA.lookAhead;
  const targetY = plane.altitude + 1.5;
  // View basis: f forward, r right, u up, orthonormal. Right is the
  // forward vector crossed with world-up: (f.z, 0, -f.x) is the wrong
  // hand; (-f.z, 0, f.x) keeps the image unmirrored and the roll true.
  let f = normalize(targetX - camX, targetY - camY, targetZ - camZ);
  let r = normalize(-f.z, 0, f.x);
  const u = cross(r, f);
  // Roll the camera a little with the plane's bank.
  const roll = plane.bank * 0.45;
  const cosRoll = Math.cos(roll);
  const sinRoll = Math.sin(roll);
  const r2 = {
    x: r.x * cosRoll + u.x * sinRoll,
    y: r.y * cosRoll + u.y * sinRoll,
    z: r.z * cosRoll + u.z * sinRoll,
  };
  const u2 = {
    x: u.x * cosRoll - r.x * sinRoll,
    y: u.y * cosRoll - r.y * sinRoll,
    z: u.z * cosRoll - r.z * sinRoll,
  };
  return {
    x: camX, y: camY, z: camZ,
    f, r: r2, u: u2,
    focal: CAMERA.focal * (height / 720),
    width, height,
    fwdX, fwdZ, rightX, rightZ,
  };
}

function normalize(x, y, z) {
  const length = Math.sqrt(x * x + y * y + z * z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

// Project a world point to screen pixels, or null when it is behind the
// camera. `depth` is the distance along the view axis, used for fog.
export function project(camera, x, y, z) {
  const dx = x - camera.x;
  const dy = y - camera.y;
  const dz = z - camera.z;
  const depth = dx * camera.f.x + dy * camera.f.y + dz * camera.f.z;
  if (depth < 2) return null;
  const cx = dx * camera.r.x + dy * camera.r.y + dz * camera.r.z;
  const cy = dx * camera.u.x + dy * camera.u.y + dz * camera.u.z;
  const scale = camera.focal / depth;
  return {
    x: camera.width / 2 + cx * scale,
    y: camera.height * 0.52 - cy * scale,
    depth,
  };
}

// Where the sea meets the sky on this frame, for the sky/sea split.
function horizonScreenY(camera) {
  const far = project(camera, camera.x + camera.f.x * 3000, 0, camera.z + camera.f.z * 3000);
  return far ? far.y : camera.height * 0.42;
}

function drawSky(ctx, camera, time, storm) {
  const horizonY = horizonScreenY(camera);
  const top = storm ? '#3d4d63' : SKY_TOP;
  const horizon = storm ? '#8b98a8' : SKY_HORIZON;
  const gradient = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizonY));
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, horizon);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, camera.width, Math.max(1, horizonY));
  // Sun: a soft disc fixed in the world sky, so it moves with the heading.
  const sun = project(camera, camera.x + 900, camera.y + 420, camera.z - 1600);
  if (sun && sun.y > -60 && sun.y < horizonY + 40) {
    const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 90);
    glow.addColorStop(0, 'rgba(255, 244, 200, 0.95)');
    glow.addColorStop(0.35, 'rgba(255, 226, 140, 0.55)');
    glow.addColorStop(1, 'rgba(255, 226, 140, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, 90, 0, Math.PI * 2);
    ctx.fill();
  }
  return horizonY;
}

function drawSea(ctx, camera, horizonY, storm) {
  const gradient = ctx.createLinearGradient(0, horizonY, 0, camera.height);
  gradient.addColorStop(0, storm ? '#5d7186' : SEA_FAR);
  gradient.addColorStop(1, storm ? '#2c4256' : SEA_NEAR);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, horizonY, camera.width, camera.height - horizonY);
}

function drawClouds(ctx, camera, time) {
  for (const cloud of CLOUDS) {
    const driftedX = cloud.x + cloud.drift * time;
    const point = project(camera, driftedX, cloud.y, cloud.z);
    if (!point || point.depth < 50) continue;
    const radius = cloud.radius * camera.focal / point.depth;
    if (radius < 4 || point.x < -radius || point.x > camera.width + radius) continue;
    const puff = ctx.createRadialGradient(point.x, point.y, radius * 0.1, point.x, point.y, radius);
    puff.addColorStop(0, 'rgba(255,255,255,0.85)');
    puff.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = puff;
    ctx.beginPath();
    ctx.ellipse(point.x, point.y, radius, radius * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// The terrain grid: rows far to near, so nearer ground paints over farther.
// Water cells are skipped — the sea gradient already shows through.
function drawTerrain(ctx, camera) {
  const cell = RENDER.cellSize;
  const { fwdX, fwdZ, rightX, rightZ } = camera;
  for (let depth = RENDER.viewDepth; depth > 0; depth -= cell) {
    const fog = Math.max(0, Math.min(1, (depth - RENDER.fogStart) / (RENDER.fogEnd - RENDER.fogStart)));
    for (let lateral = -RENDER.viewWidth; lateral < RENDER.viewWidth; lateral += cell) {
      const baseX = camera.x + fwdX * depth + rightX * lateral;
      const baseZ = camera.z + fwdZ * depth + rightZ * lateral;
      const farX = baseX + fwdX * cell;
      const farZ = baseZ + fwdZ * cell;
      const sideX = baseX + rightX * cell;
      const sideZ = baseZ + rightZ * cell;
      const farSideX = farX + rightX * cell;
      const farSideZ = farZ + rightZ * cell;
      const h00 = heightAt(baseX, baseZ);
      const h10 = heightAt(farX, farZ);
      const h01 = heightAt(sideX, sideZ);
      const h11 = heightAt(farSideX, farSideZ);
      const maxHeight = Math.max(h00, h10, h01, h11);
      if (maxHeight <= 0.6) continue;
      const p00 = project(camera, baseX, h00, baseZ);
      const p10 = project(camera, farX, h10, farZ);
      const p01 = project(camera, sideX, h01, sideZ);
      const p11 = project(camera, farSideX, h11, farSideZ);
      if (!p00 || !p10 || !p01 || !p11) continue;
      const centreX = baseX + (fwdX + rightX) * cell * 0.5;
      const centreZ = baseZ + (fwdZ + rightZ) * cell * 0.5;
      const kind = terrainKind(centreX, centreZ);
      const jitter = hash2(Math.floor(centreX / cell), Math.floor(centreZ / cell), 41);
      let colour = PALETTE[kind] || PALETTE.grass;
      if (kind === 'grass' && jitter > 0.5) colour = PALETTE.grassAlt;
      if (kind === 'paddy' && jitter > 0.5) colour = PALETTE.paddyAlt;
      // Slope shading: a cell climbing away from the camera is darker.
      const slope = Math.max(0, Math.min(1, (h10 + h11 - h00 - h01) / 24));
      const shaded = mixColour(colour, [30, 30, 30], slope * 0.25);
      const fogged = mixColour(shaded, FOG_COLOUR, fog);
      ctx.fillStyle = cssColour(fogged, 1);
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawRunwayStrip(ctx, camera, runway) {
  const halfLength = runway.length / 2;
  const halfWidth = runway.width / 2;
  const ground = heightAt(runway.x, runway.z);
  const sinH = Math.sin(runway.heading);
  const cosH = Math.cos(runway.heading);
  function stripPoint(along, across) {
    return project(
      camera,
      runway.x + sinH * along + cosH * across,
      ground + 0.6,
      runway.z + cosH * along - sinH * across,
    );
  }
  const a = stripPoint(-halfLength, -halfWidth);
  const b = stripPoint(halfLength, -halfWidth);
  const c = stripPoint(halfLength, halfWidth);
  const d = stripPoint(-halfLength, halfWidth);
  if (!a || !b || !c || !d) return;
  ctx.fillStyle = '#3a3f45';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
  // Centreline dashes.
  ctx.strokeStyle = '#f5f5f0';
  ctx.lineWidth = 2;
  for (let along = -halfLength + 20; along < halfLength - 10; along += 40) {
    const p1 = stripPoint(along, 0);
    const p2 = stripPoint(along + 18, 0);
    if (!p1 || !p2) continue;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  // Threshold bars at both ends.
  ctx.lineWidth = 3;
  for (const end of [-halfLength + 8, halfLength - 8]) {
    const p1 = stripPoint(end, -halfWidth + 4);
    const p2 = stripPoint(end, halfWidth - 4);
    if (!p1 || !p2) continue;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  // Edge lights: small amber dots down both sides.
  ctx.fillStyle = '#ffb020';
  for (let along = -halfLength + 10; along <= halfLength - 10; along += 45) {
    for (const across of [-halfWidth + 2, halfWidth - 2]) {
      const p = stripPoint(along, across);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawTown(ctx, camera) {
  const sorted = [...HOUSES].sort((a, b) => {
    const da = (a.x - camera.x) ** 2 + (a.z - camera.z) ** 2;
    const db = (b.x - camera.x) ** 2 + (b.z - camera.z) ** 2;
    return db - da;
  });
  for (const house of sorted) {
    const ground = heightAt(house.x, house.z);
    const point = project(camera, house.x, ground + 4, house.z);
    if (!point || point.depth > RENDER.viewDepth) continue;
    const size = house.size * camera.focal / point.depth;
    if (size < 2) continue;
    const roof = house.hue < 0.5 ? '#b5502e' : '#7a4a2b';
    ctx.fillStyle = '#e8dcc8';
    ctx.fillRect(point.x - size / 2, point.y - size * 0.4, size, size * 0.6);
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(point.x - size * 0.6, point.y - size * 0.4);
    ctx.lineTo(point.x, point.y - size * 0.9);
    ctx.lineTo(point.x + size * 0.6, point.y - size * 0.4);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRings(ctx, camera, mission, time) {
  if (!mission) return;
  mission.objectives.forEach((objective, index) => {
    if (objective.type !== 'ring') return;
    const isNext = index === mission.currentIndex;
    const point = project(camera, objective.x, objective.y, objective.z);
    if (!point || point.depth < 4) return;
    const radius = objective.radius * camera.focal / point.depth;
    if (radius < 3) return;
    const groundPoint = project(camera, objective.x, heightAt(objective.x, objective.z) + 1, objective.z);
    // Guide line from the ring down to the ground, for depth reading.
    if (groundPoint && isNext) {
      ctx.strokeStyle = 'rgba(255, 200, 60, 0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(groundPoint.x, groundPoint.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const pulse = isNext ? 1 + Math.sin(time * 4) * 0.08 : 1;
    const colour = objective.passed ? '#5ee08a' : isNext ? '#ffc93c' : '#57c8e8';
    ctx.save();
    ctx.globalAlpha = objective.passed ? 0.45 : isNext ? 1 : 0.75;
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(3, radius * 0.12);
    ctx.shadowColor = colour;
    ctx.shadowBlur = isNext ? 26 : 12;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (isNext) {
      ctx.fillStyle = '#fff3c4';
      ctx.font = `700 ${Math.max(12, radius * 0.32)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${mission.ringsPassed + 1}`, point.x, point.y);
    }
  });
}

// The plane's shadow on the ground below, shrinking as it climbs.
function drawPlaneShadow(ctx, camera, plane) {
  const ground = heightAt(plane.x, plane.z);
  const point = project(camera, plane.x, ground + 0.8, plane.z);
  if (!point || plane.onGround) return;
  const heightAbove = Math.max(1, plane.altitude - ground);
  const radius = 34 * camera.focal / point.depth / Math.max(1, heightAbove * 0.06);
  ctx.fillStyle = `rgba(10, 20, 30, ${Math.max(0.08, 0.45 - heightAbove * 0.002)})}`;
  ctx.beginPath();
  ctx.ellipse(point.x, point.y, Math.max(4, radius), Math.max(2, radius * 0.35), 0, 0, Math.PI * 2);
  ctx.fill();
}

// Storm rain: deterministic streaks from a hash of (drop, time slice).
export function drawStormRain(ctx, width, height, time) {
  ctx.strokeStyle = 'rgba(200, 220, 235, 0.4)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 130; i += 1) {
    const slice = Math.floor(time * 2.2);
    const x = hash2(i, slice, 7) * width;
    const y = (hash2(i, slice + 1, 7) * height + time * 520) % height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 4, y + 16);
    ctx.stroke();
  }
}

// One full world frame: sky, sea, clouds, terrain, runways, town, rings,
// shadow and the courier itself. The HUD is drawn on top by main.js.
export function renderWorld(ctx, game, width, height, time) {
  const camera = createCamera(game.plane, width, height);
  const storm = game.mission ? game.mission.storm : false;
  const horizonY = drawSky(ctx, camera, time, storm);
  drawSea(ctx, camera, horizonY, storm);
  drawClouds(ctx, camera, time);
  drawTerrain(ctx, camera);
  for (const runway of RUNWAYS) drawRunwayStrip(ctx, camera, runway);
  drawTown(ctx, camera);
  drawRings(ctx, camera, game.mission, time);
  drawPlaneShadow(ctx, camera, game.plane);
  const planePoint = project(camera, game.plane.x, game.plane.altitude + 1.5, game.plane.z);
  if (planePoint) {
    drawAircraft(ctx, game.plane, planePoint.x, planePoint.y, 150);
  }
  if (storm) drawStormRain(ctx, width, height, time);
  return camera;
}

// Small particle burst (gold sparks) when a ring is passed.
export function createParticles() {
  return [];
}

export function spawnRingBurst(particles, x, y) {
  for (let i = 0; i < 26; i += 1) {
    const angle = (i / 26) * Math.PI * 2;
    const speed = 60 + (i % 5) * 22;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.7,
    });
  }
}

export function updateAndDrawParticles(ctx, particles, dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.life -= dt;
    if (particle.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 160 * dt;
    ctx.fillStyle = `rgba(255, 201, 60, ${particle.life / 0.7})`;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
