// The heads-up display: altitude and speed tapes, compass strip, fuel
// gauge, score, timer and mission objective, plus warnings. Everything is
// drawn on the canvas so the screenshots show the instruments lit.

import { FUEL } from './config.js';

const PANEL = 'rgba(8, 20, 32, 0.72)';
const PANEL_EDGE = 'rgba(140, 200, 230, 0.45)';
const INK = '#eaf6ff';
const DIM = '#9fc6d8';
const AMBER = '#ffb020';
const RED = '#ff5a4e';
const GREEN = '#5ee08a';

// Compass point names for the strip.
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// Heading in degrees, 0 = north, clockwise.
export function headingDegrees(heading) {
  return ((heading * 180 / Math.PI) % 360 + 360) % 360;
}

// A rounded panel helper so every HUD box looks like one instrument set.
function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PANEL;
  ctx.strokeStyle = PANEL_EDGE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

function label(ctx, text, x, y, size, colour, align) {
  ctx.fillStyle = colour || DIM;
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function bigNumber(ctx, text, x, y, size, colour, align) {
  ctx.fillStyle = colour || INK;
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

// Left tape: speed in km/h with a moving scale.
function drawSpeedTape(ctx, speedKmh, x, y, w, h) {
  panel(ctx, x, y, w, h);
  label(ctx, 'KECEPATAN', x + 10, y + 14, 11, DIM, 'left');
  bigNumber(ctx, `${Math.round(speedKmh)}`, x + w - 12, y + 42, 32, INK, 'right');
  label(ctx, 'km/jam', x + w - 12, y + 66, 11, DIM, 'right');
  // A thin marker showing where this speed sits between 0 and 210 km/h.
  const frac = Math.max(0, Math.min(1, speedKmh / 210));
  ctx.fillStyle = '#4db8e8';
  ctx.fillRect(x + 10, y + h - 14, (w - 20) * frac, 4);
}

// Right tape: altitude in metres with a moving scale.
function drawAltitudeTape(ctx, altitude, x, y, w, h) {
  panel(ctx, x, y, w, h);
  label(ctx, 'KETINGGIAN', x + 10, y + 14, 11, DIM, 'left');
  bigNumber(ctx, `${Math.round(altitude)}`, x + w - 12, y + 42, 32, INK, 'right');
  label(ctx, 'meter', x + w - 12, y + 66, 11, DIM, 'right');
  const frac = Math.max(0, Math.min(1, altitude / 300));
  ctx.fillStyle = '#4db8e8';
  ctx.fillRect(x + 10, y + h - 14, (w - 20) * frac, 4);
}

// Top-centre compass: a strip of ticks around the current heading.
function drawCompass(ctx, heading, width, height) {
  const cx = width / 2;
  const y = 12;
  panel(ctx, cx - 190, y, 380, 46);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 190, y, 380, 46);
  ctx.clip();
  const degrees = headingDegrees(heading);
  // One tick every 15 degrees; the strip scrolls so the heading is centred.
  for (let offset = -90; offset <= 90; offset += 15) {
    const tickDegrees = Math.round((degrees + offset) / 15) * 15;
    const dx = ((tickDegrees - degrees + 540) % 360 - 180) / 90 * 150;
    const tickX = cx + dx;
    const major = tickDegrees % 45 === 0;
    ctx.strokeStyle = major ? INK : DIM;
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(tickX, y + (major ? 8 : 16));
    ctx.lineTo(tickX, y + 26);
    ctx.stroke();
    if (major) {
      const point = POINTS[Math.round(((tickDegrees % 360) + 360) % 360 / 45) % 8];
      label(ctx, point, tickX, y + 38, 11, INK, 'center');
    }
  }
  ctx.restore();
  // The lubber line and the numeric heading.
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(cx, y + 2);
  ctx.lineTo(cx - 6, y + 10);
  ctx.lineTo(cx + 6, y + 10);
  ctx.closePath();
  ctx.fill();
  bigNumber(ctx, `${String(Math.round(degrees)).padStart(3, '0')}°`, cx, y + 52, 15, AMBER, 'center');
}

// Top-right: fuel bar, score, timer and mission progress.
function drawStatusBlock(ctx, state, width) {
  const x = width - 236;
  const y = 12;
  panel(ctx, x, y, 224, 96);
  label(ctx, 'BAHAN BAKAR', x + 12, y + 16, 11, DIM, 'left');
  const fuelFrac = Math.max(0, state.plane.fuel / 100);
  const fuelColour = state.plane.fuel <= FUEL.lowWarning ? RED : fuelFrac < 0.5 ? AMBER : GREEN;
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x + 12, y + 26, 200, 12);
  ctx.fillStyle = fuelColour;
  ctx.fillRect(x + 12, y + 26, 200 * fuelFrac, 12);
  bigNumber(ctx, `${Math.round(state.plane.fuel)}%`, x + 212, y + 16, 13, fuelColour, 'right');
  label(ctx, 'SKOR', x + 12, y + 56, 11, DIM, 'left');
  bigNumber(ctx, `${state.score}`, x + 212, y + 56, 20, INK, 'right');
  // No objective line here: the objective already has its own bottom-centre
  // bar, and the long text used to overflow this panel onto the timer.
  const seconds = Math.max(0, Math.ceil(state.timeLeft));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const timeText = `${minutes}:${String(rest).padStart(2, '0')}`;
  bigNumber(ctx, timeText, x + 212, y + 82, 16, seconds <= 30 ? RED : INK, 'right');
  label(ctx, 'WAKTU', x + 12, y + 82, 11, DIM, 'left');
}

// Bottom-centre: the current objective, the next waypoint distance, and
// a row of ring pips (gold = flown, outline = left) so the mission
// progress reads at a glance even in a small screenshot.
function drawObjectiveBar(ctx, state, width, height) {
  const text = state.objectiveText;
  const sub = state.objectiveSub || '';
  const ringsTotal = state.ringsTotal || 0;
  const ringsPassed = state.ringsPassed || 0;
  ctx.font = '600 16px system-ui, sans-serif';
  const textWidth = ctx.measureText(text).width;
  ctx.font = '600 12px system-ui, sans-serif';
  const subWidth = sub ? ctx.measureText(sub).width : 0;
  const dotsWidth = ringsTotal > 0 ? ringsTotal * 16 : 0;
  const w = Math.max(textWidth, subWidth, dotsWidth) + 36;
  const x = (width - w) / 2;
  const y = height - 64 - (ringsTotal > 0 ? 16 : 0);
  const panelHeight = ringsTotal > 0 ? 68 : sub ? 52 : 36;
  panel(ctx, x, y, w, panelHeight);
  label(ctx, text, width / 2, y + 16, 16, INK, 'center');
  if (sub) label(ctx, sub, width / 2, y + 38, 12, DIM, 'center');
  if (ringsTotal > 0) {
    const dotsY = y + 56;
    const startX = width / 2 - ((ringsTotal - 1) * 16) / 2;
    for (let i = 0; i < ringsTotal; i += 1) {
      const dotX = startX + i * 16;
      ctx.beginPath();
      ctx.arc(dotX, dotsY, 4.5, 0, Math.PI * 2);
      if (i < ringsPassed) {
        ctx.fillStyle = '#ffc93c';
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255, 201, 60, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }
}

// Centre-screen warnings: low fuel, pull up, stall. They sit high enough
// to clear the plane and low enough to clear the compass strip.
export function drawWarnings(ctx, state, width, height) {
  const warnings = [];
  if (state.plane.fuel <= FUEL.lowWarning && state.plane.fuel > 0) warnings.push({ text: 'BAHAN BAKAR RENDAH', colour: AMBER });
  if (state.plane.fuel <= 0) warnings.push({ text: 'TANGKI KOSONG — MELUNCUR!', colour: RED });
  const ground = state.groundHeight || 0;
  if (!state.plane.onGround && state.plane.altitude - ground < 18 && state.plane.verticalSpeed < -2) {
    warnings.push({ text: 'TARIK KE ATAS!', colour: RED });
  }
  if (state.stalled) warnings.push({ text: 'STALL — TAMBAH THROTTLE', colour: AMBER });
  warnings.forEach((warning, index) => {
    bigNumber(ctx, warning.text, width / 2, height * 0.3 + index * 30, 22, warning.colour, 'center');
  });
}

// The whole HUD for the playing screen. `state` carries plane, score,
// timeLeft, objectiveText, objectiveSub, groundHeight and stalled.
export function drawHud(ctx, state, width, height) {
  const speedKmh = state.plane.speed * 3.6;
  drawSpeedTape(ctx, speedKmh, 14, 76, 132, 84);
  drawAltitudeTape(ctx, state.plane.altitude, width - 146, 130, 132, 84);
  drawCompass(ctx, state.plane.heading, width, height);
  drawStatusBlock(ctx, state, width);
  drawObjectiveBar(ctx, state, width, height);
  drawWarnings(ctx, state, width, height);
  // Throttle bar, bottom-left, with a marker for the takeoff band.
  const x = 14;
  const y = height - 92;
  panel(ctx, x, y, 150, 52);
  label(ctx, 'THROTTLE', x + 10, y + 13, 11, DIM, 'left');
  bigNumber(ctx, `${Math.round(state.plane.throttle * 100)}%`, x + 140, y + 13, 13, INK, 'right');
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x + 10, y + 26, 130, 10);
  ctx.fillStyle = '#4db8e8';
  ctx.fillRect(x + 10, y + 26, 130 * state.plane.throttle, 10);
  // Damage pips, bottom-left under the throttle.
  if (state.plane.damage > 0) {
    label(ctx, `KERUSAKAN ${Math.round(state.plane.damage)}%`, x + 10, y + 46, 11, RED, 'left');
  }
}
