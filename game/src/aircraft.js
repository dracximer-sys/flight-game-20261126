// The courier plane: its flight state and the way it is drawn in the
// chase view. The drawing is all canvas paths — a red-and-cream prop
// courier with a spinning prop, panel lines and a cargo stripe — no images.

import { PLANE } from './config.js';

// A fresh plane on a runway threshold, facing the runway heading. The
// courier starts on the ground with the engine off; throttle up to roll.
export function createAircraft(x, z, heading) {
  return {
    x,
    z,
    altitude: 4, // metres above sea level; on the ground at a runway
    heading,
    speed: 0,
    throttle: 0,
    bank: 0, // radians, positive rolls right
    pitch: 0, // radians, positive climbs
    verticalSpeed: 0,
    fuel: 100,
    damage: 0, // 0 to 100; a hard landing adds some, terrain ends the flight
    onGround: true,
    propAngle: 0,
  };
}

// Wrap an angle to [-PI, PI] so heading differences never spin the long way.
export function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

// Move a value toward a target by at most `step`.
export function approach(value, target, step) {
  if (value < target) return Math.min(target, value + step);
  if (value > target) return Math.max(target, value - step);
  return value;
}

// Draw the courier from behind and slightly above, centred at (cx, cy) on
// the canvas, rotated by its bank. `size` is the wingspan in pixels.
// The prop spins with `plane.propAngle`, which the physics step advances.
export function drawAircraft(ctx, plane, cx, cy, size) {
  const span = size;
  const chord = size * 0.42;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(plane.bank);
  ctx.lineJoin = 'round';

  // Shadow of the plane on the ground is drawn by the renderer, not here.

  // Main wings: cream with a red tip on each side and a dark outline.
  ctx.fillStyle = '#f3e9d2';
  ctx.strokeStyle = '#5a2e1e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-span / 2, -chord * 0.1);
  ctx.lineTo(-span * 0.08, -chord * 0.32);
  ctx.lineTo(span * 0.08, -chord * 0.32);
  ctx.lineTo(span / 2, -chord * 0.1);
  ctx.lineTo(span * 0.42, chord * 0.28);
  ctx.lineTo(-span * 0.42, chord * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Red wingtips.
  ctx.fillStyle = '#c0392b';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * span * 0.42, -chord * 0.16);
    ctx.lineTo(side * span / 2, -chord * 0.1);
    ctx.lineTo(side * span * 0.42, chord * 0.28);
    ctx.closePath();
    ctx.fill();
  }

  // Fuselage: a tapered body from tail (bottom) to nose (top).
  const body = ctx.createLinearGradient(0, chord * 0.55, 0, -chord * 1.5);
  body.addColorStop(0, '#a93226');
  body.addColorStop(0.45, '#c0392b');
  body.addColorStop(1, '#e0664a');
  ctx.fillStyle = body;
  ctx.strokeStyle = '#5a2e1e';
  ctx.beginPath();
  ctx.moveTo(-span * 0.075, chord * 0.55);
  ctx.lineTo(-span * 0.055, -chord * 0.9);
  ctx.quadraticCurveTo(0, -chord * 1.55, span * 0.055, -chord * 0.9);
  ctx.lineTo(span * 0.075, chord * 0.55);
  ctx.quadraticCurveTo(0, chord * 0.72, -span * 0.075, chord * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cargo stripe along the fuselage.
  ctx.strokeStyle = '#f3e9d2';
  ctx.lineWidth = size * 0.02;
  ctx.beginPath();
  ctx.moveTo(0, chord * 0.45);
  ctx.lineTo(0, -chord * 1.3);
  ctx.stroke();

  // Cockpit windows, two panes catching the sky.
  ctx.fillStyle = '#bfe3ea';
  ctx.strokeStyle = '#3d3d3d';
  ctx.lineWidth = 1.5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * span * 0.012, -chord * 0.95);
    ctx.lineTo(side * span * 0.045, -chord * 0.95);
    ctx.lineTo(side * span * 0.04, -chord * 0.72);
    ctx.lineTo(side * span * 0.012, -chord * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Tail: horizontal stabiliser and a tall red fin.
  ctx.fillStyle = '#c0392b';
  ctx.strokeStyle = '#5a2e1e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-span * 0.3, chord * 0.42);
  ctx.lineTo(span * 0.3, chord * 0.42);
  ctx.lineTo(span * 0.2, chord * 0.62);
  ctx.lineTo(-span * 0.2, chord * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e0664a';
  ctx.beginPath();
  ctx.moveTo(-span * 0.03, chord * 0.5);
  ctx.lineTo(0, chord * 0.16);
  ctx.lineTo(span * 0.03, chord * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Spinning prop at the nose: a translucent disc and two blades.
  const propY = -chord * 1.52;
  ctx.save();
  ctx.translate(0, propY);
  ctx.rotate(plane.propAngle);
  ctx.strokeStyle = 'rgba(60, 60, 60, 0.85)';
  ctx.lineWidth = size * 0.03;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.16);
  ctx.lineTo(0, size * 0.16);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(200, 210, 215, 0.18)';
  ctx.beginPath();
  ctx.ellipse(0, propY, size * 0.17, size * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();

  // Navigation lights: red on the left tip, green on the right.
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(-span / 2, chord * 0.05, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#34c759';
  ctx.beginPath();
  ctx.arc(span / 2, chord * 0.05, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// A small paper-plane icon for the title screen and the mission list.
export function drawPaperPlane(ctx, x, y, size, colour) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.9, size * 0.7);
  ctx.lineTo(0, size * 0.35);
  ctx.lineTo(-size * 0.9, size * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
