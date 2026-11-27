// Langit Courier: Nusantara Run — game loop, screens and the deterministic
// screenshot scenes. This file wires the modules together: input feeds the
// physics, physics feeds the missions, missions feed the HUD, and the
// renderer draws the world. Nothing here loads a network resource.

import { GAME_NAME, GAME_TAGLINE, MISSIONS, SCORE, KEYS } from './config.js';
import { createRng } from './rng.js';
import { RUNWAYS, heightAt } from './terrain.js';
import { createAircraft, drawPaperPlane } from './aircraft.js';
import { stepPhysics, makeFlightContext, distanceTo } from './physics.js';
import {
  buildMission, currentObjective, missionDone, targetAltitudeFor, windAt,
  checkRingPass, ringScore, checkLanding, refuelForRing,
  objectiveText, objectiveSub, autopilotInput,
} from './missions.js';
import { renderWorld, createParticles, spawnRingBurst, updateAndDrawParticles, project, createCamera } from './render.js';
import { drawHud } from './hud.js';
import { createInput, attachInput, readFlightInput, takePressedKeys, takeClick } from './input.js';
import {
  createAudio, ensureAudio, updateEngineSound, playRingChime,
  playLandingJingle, playMissionComplete, playCrash, toggleMute,
} from './audio.js';

const STEP = 1 / 60;
const SHOT_SEED = 7;

// Start position: the threshold of runway A, facing down the strip.
function startPosition() {
  const runway = RUNWAYS[0];
  const along = -runway.length / 2 + 30;
  return {
    x: runway.x + Math.sin(runway.heading) * along,
    z: runway.z + Math.cos(runway.heading) * along,
    heading: runway.heading,
  };
}

function createGame(canvas) {
  return {
    canvas,
    ctx: canvas.getContext('2d'),
    width: 0,
    height: 0,
    screen: 'title', // title | playing | paused | complete | gameover
    input: createInput(),
    audio: createAudio(),
    plane: null,
    mission: null,
    missionId: 'ring-run',
    score: 0,
    bestScore: 0,
    crashReason: '',
    flash: null, // { text, until }
    time: 0,
    particles: createParticles(),
    titleButtons: [], // clickable mission rows on the title screen
    actionButtons: [], // clickable buttons on end screens
    shotMode: null,
    rng: createRng(SHOT_SEED),
  };
}

// Resize the canvas to the window, capped at a 2x backing store.
function resizeGame(game) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  game.width = window.innerWidth;
  game.height = window.innerHeight;
  game.canvas.width = Math.round(game.width * dpr);
  game.canvas.height = Math.round(game.height * dpr);
  game.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Begin a mission from the title screen (or restart it).
function startMission(game, missionId) {
  game.missionId = missionId;
  game.mission = buildMission(missionId);
  const start = startPosition();
  game.plane = createAircraft(start.x, start.z, start.heading);
  game.plane.altitude = heightAt(start.x, start.z) + 1.2;
  game.score = 0;
  game.flash = null;
  game.particles = createParticles();
  game.time = 0;
  game.screen = 'playing';
  ensureAudio(game.audio);
}

// Back to the title screen, plane parked on runway A as a backdrop.
function showTitle(game) {
  game.mission = buildMission(game.missionId);
  const start = startPosition();
  game.plane = createAircraft(start.x, start.z, start.heading);
  game.plane.altitude = heightAt(start.x, start.z) + 1.2;
  game.plane.throttle = 0.25;
  game.screen = 'title';
}

function endFlight(game, reason) {
  game.crashReason = reason;
  game.screen = 'gameover';
  game.bestScore = Math.max(game.bestScore, game.score);
  playCrash(game.audio);
}

function finishMission(game) {
  const timeBonus = Math.round(game.mission.timeLeft * 5);
  const fuelBonus = Math.round(game.plane.fuel * SCORE.fuelBonusPerUnit);
  game.score += timeBonus + fuelBonus;
  game.bestScore = Math.max(game.bestScore, game.score);
  game.screen = 'complete';
  playMissionComplete(game.audio);
}

// One fixed physics step of the playing state.
function stepPlaying(game, dt) {
  const plane = game.plane;
  const mission = game.mission;
  mission.elapsed += dt;
  mission.timeLeft -= dt;
  if (mission.timeLeft <= 0) {
    endFlight(game, 'Waktu habis — paket tidak sampai tepat waktu.');
    return;
  }
  const wind = windAt(mission, mission.elapsed);
  const context = makeFlightContext(targetAltitudeFor(mission, plane), wind.x, wind.z);
  const input = readFlightInput(game.input);
  const events = stepPhysics(plane, input, dt, context);
  game.time += dt;

  const passedRing = checkRingPass(mission, plane);
  if (passedRing) {
    const points = ringScore(mission);
    game.score += points;
    refuelForRing(plane);
    game.flash = { text: `RING! +${points}`, until: game.time + 1.6 };
    playRingChime(game.audio);
    const camera = createCamera(plane, game.width, game.height);
    const point = project(camera, passedRing.x, passedRing.y, passedRing.z);
    if (point) spawnRingBurst(game.particles, point.x, point.y);
    // A ring mission ends on its last ring; there is no runway to land on.
    if (missionDone(mission)) {
      finishMission(game);
      return;
    }
  }
  if (events.landed) {
    const points = checkLanding(mission, events.landed);
    if (points > 0) {
      game.score += points;
      game.flash = { text: `MENDARAT! +${points}`, until: game.time + 2 };
      playLandingJingle(game.audio);
      plane.fuel = Math.min(100, plane.fuel + 20);
      if (missionDone(mission)) {
        finishMission(game);
        return;
      }
    } else {
      game.flash = { text: 'Mendarat — bukan runway tujuan', until: game.time + 2 };
    }
  }
  if (events.crashed) {
    const reason = events.crashed === 'water'
      ? 'Mendarat di laut — pesawat tenggelam.'
      : 'Menabrak terrain — pesawat hancur.';
    endFlight(game, reason);
    return;
  }
  if (plane.fuel <= 0 && plane.onGround && plane.speed < 1 && missionDone(mission)) {
    finishMission(game);
  }
}

// ---- Screens -------------------------------------------------------------

function drawTitleScreen(game) {
  const { ctx, width, height } = game;
  renderWorld(ctx, game, width, height, 6);
  drawTitleScreenOverlay(game);
}

// The title screen's overlay, drawn over the world. Shared by the live
// title screen and the ?shot=menu scene so both look identical.
function drawTitleScreenOverlay(game) {
  const { ctx, width, height } = game;
  ctx.fillStyle = 'rgba(6, 18, 30, 0.55)';
  ctx.fillRect(0, 0, width, height);
  const cx = width / 2;
  drawPaperPlane(ctx, cx, 108, 26, '#ffc93c');
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(GAME_NAME, cx, 168);
  ctx.fillStyle = '#cfe6f2';
  ctx.font = '400 19px system-ui, sans-serif';
  ctx.fillText(GAME_TAGLINE, cx, 204);
  // Mission rows, clickable and numbered 1-3.
  game.titleButtons = [];
  const rowWidth = 560;
  const rowHeight = 74;
  const startY = 248;
  MISSIONS.forEach((mission, index) => {
    const y = startY + index * (rowHeight + 14);
    const x = cx - rowWidth / 2;
    ctx.fillStyle = 'rgba(10, 30, 46, 0.82)';
    ctx.strokeStyle = 'rgba(140, 200, 230, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, rowWidth, rowHeight, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffc93c';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${index + 1}`, x + 22, y + rowHeight / 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 21px system-ui, sans-serif';
    ctx.fillText(mission.name, x + 58, y + 26);
    ctx.fillStyle = '#9fc6d8';
    ctx.font = '400 14px system-ui, sans-serif';
    ctx.fillText(mission.blurb, x + 58, y + 50);
    ctx.fillStyle = '#5ee08a';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${mission.difficulty} · ${Math.floor(mission.timeLimit / 60)}:${String(mission.timeLimit % 60).padStart(2, '0')}`, x + rowWidth - 18, y + 26);
    ctx.textAlign = 'left';
    game.titleButtons.push({ x, y, w: rowWidth, h: rowHeight, missionId: mission.id });
  });
  const helpY = startY + 3 * (rowHeight + 14) + 18;
  ctx.fillStyle = '#cfe6f2';
  ctx.font = '400 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('W/S atau ↑/↓ throttle · A/D atau ←/→ belok · Mouse: arah + trim ketinggian', cx, helpY);
  ctx.fillText('P jeda · M bisu · R ulangi misi · Klik misi atau tekan 1, 2, 3 untuk terbang', cx, helpY + 26);
  if (game.bestScore > 0) {
    ctx.fillStyle = '#ffc93c';
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillText(`Skor terbaik: ${game.bestScore}`, cx, helpY + 58);
  }
  ctx.fillStyle = 'rgba(207, 230, 242, 0.7)';
  ctx.font = '400 13px system-ui, sans-serif';
  ctx.fillText('Langit Courier — game orisinal. Semua art dan suara dibuat dari kode, tanpa aset luar.', cx, height - 24);
}

function drawEndPanel(game, title, lines, accent) {
  const { ctx, width, height } = game;
  const cx = width / 2;
  const panelWidth = 520;
  const panelHeight = 120 + lines.length * 30 + 92;
  const x = cx - panelWidth / 2;
  const y = height / 2 - panelHeight / 2;
  ctx.fillStyle = 'rgba(6, 18, 30, 0.72)';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(10, 30, 46, 0.92)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, panelWidth, panelHeight, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.font = '700 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, cx, y + 48);
  ctx.fillStyle = '#eaf6ff';
  ctx.font = '400 16px system-ui, sans-serif';
  lines.forEach((line, index) => {
    ctx.fillText(line, cx, y + 92 + index * 30);
  });
  const buttonY = y + panelHeight - 52;
  game.actionButtons = [
    { x: cx - 210, y: buttonY, w: 200, h: 38, action: 'restart', label: 'Ulangi misi (R)' },
    { x: cx + 10, y: buttonY, w: 200, h: 38, action: 'title', label: 'Menu utama (Enter)' },
  ];
  for (const button of game.actionButtons) {
    ctx.fillStyle = 'rgba(77, 184, 232, 0.25)';
    ctx.strokeStyle = '#4db8e8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(button.x, button.y, button.w, button.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#eaf6ff';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText(button.label, button.x + button.w / 2, button.y + button.h / 2);
  }
}

function drawGameOver(game) {
  renderWorld(game.ctx, game, game.width, game.height, game.time);
  drawEndPanel(game, 'PENERBANGAN BERAKHIR', [
    game.crashReason,
    `Skor: ${game.score} · Ring: ${game.mission ? game.mission.ringsPassed : 0} · Skor terbaik: ${game.bestScore}`,
  ], '#ff5a4e');
}

function drawComplete(game) {
  renderWorld(game.ctx, game, game.width, game.height, game.time);
  drawEndPanel(game, 'MISI SELESAI!', [
    `${game.mission.def.name} selesai — paket sampai.`,
    `Skor akhir: ${game.score} (termasuk bonus waktu + bahan bakar)`,
    `Ring: ${game.mission.ringsPassed} · Pendaratan: ${game.mission.landingsDone}`,
  ], '#5ee08a');
}

function drawPaused(game) {
  renderWorld(game.ctx, game, game.width, game.height, game.time);
  drawEndPanel(game, 'JEDA', [
    'Penerbangan dijeda. Tekan P untuk lanjut.',
    `Skor: ${game.score} · ${objectiveText(game.mission, game.plane)}`,
  ], '#ffb020');
}

// ---- Screenshot scenes ---------------------------------------------------
// Each scene stages a fixed, seeded state and renders one frame. The parent
// takes the screenshot; the game itself never moves in shot mode, so the
// frame is the same on every machine.

// Fly the autopilot forward for `seconds` at fixed steps.
function flyAutopilot(game, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (game.screen !== 'playing') break;
    const plane = game.plane;
    const mission = game.mission;
    mission.elapsed += STEP;
    mission.timeLeft -= STEP;
    const wind = windAt(mission, mission.elapsed);
    const context = makeFlightContext(targetAltitudeFor(mission, plane), wind.x, wind.z);
    const events = stepPhysics(plane, autopilotInput(mission, plane), STEP, context);
    game.time += STEP;
    if (checkRingPass(mission, plane)) {
      game.score += ringScore(mission);
      refuelForRing(plane);
    }
    if (missionDone(mission)) break;
    if (events.crashed || events.landed) break;
  }
}

function stageShot(game, shot) {
  game.shotMode = shot;
  if (shot === 'menu') {
    showTitle(game);
    drawTitleScreen(game);
    return;
  }
  if (shot === 'landing') {
    // Final approach to runway B: lined up, 400 m out, descending gently.
    // Close enough that the strip, its centreline and edge lights fill
    // the frame instead of reading as a thin dash on the horizon.
    startMission(game, 'island-hop');
    const runway = RUNWAYS[1];
    const along = -runway.length / 2 - 400;
    game.plane.x = runway.x + Math.sin(runway.heading) * along;
    game.plane.z = runway.z + Math.cos(runway.heading) * along;
    game.plane.heading = runway.heading;
    game.plane.altitude = heightAt(runway.x, runway.z) + 48;
    game.plane.speed = 36;
    game.plane.throttle = 0.55;
    game.plane.onGround = false;
    // Guides already flown; the landing itself is the objective.
    game.mission.currentIndex = 2;
    game.mission.ringsPassed = 2;
    game.time = 6;
    renderWorld(game.ctx, game, game.width, game.height, 6);
    drawShotHud(game);
    return;
  }
  // cover and ring: a real Ring Run, flown by the autopilot.
  startMission(game, 'ring-run');
  const seconds = shot === 'ring' ? 26 : 13;
  flyAutopilot(game, seconds);
  if (shot === 'ring') {
    // Keep flying until the next ring is close ahead, so the frame shows
    // the courier about to thread it.
    let guard = 0;
    while (guard < 60 * 20) {
      const objective = currentObjective(game.mission);
      if (!objective || objective.type !== 'ring') break;
      if (distanceTo(game.plane, objective) < 260) break;
      flyAutopilot(game, 0.5);
      guard += 1;
    }
  }
  game.time = 6;
  renderWorld(game.ctx, game, game.width, game.height, 6);
  drawShotHud(game);
}

function drawShotHud(game) {
  const ringObjectives = game.mission.objectives.filter((item) => item.type === 'ring');
  const state = {
    plane: game.plane,
    score: game.score,
    timeLeft: game.mission.timeLeft,
    objectiveText: objectiveText(game.mission, game.plane),
    objectiveSub: objectiveSub(game.mission, game.plane),
    ringsPassed: game.mission.ringsPassed,
    ringsTotal: ringObjectives.length,
    groundHeight: heightAt(game.plane.x, game.plane.z),
    stalled: false,
  };
  drawHud(game.ctx, state, game.width, game.height);
}

// ---- Main loop -----------------------------------------------------------

function handleKeys(game) {
  const pressed = takePressedKeys(game.input);
  for (const code of pressed) {
    ensureAudio(game.audio);
    if (game.screen === 'title') {
      if (code === 'Digit1') startMission(game, 'ring-run');
      else if (code === 'Digit2') startMission(game, 'island-hop');
      else if (code === 'Digit3') startMission(game, 'storm-delivery');
      else if (code === 'Enter') startMission(game, game.missionId);
    } else if (game.screen === 'playing') {
      if (KEYS.pause.includes(code)) game.screen = 'paused';
      else if (code === 'KeyR') startMission(game, game.missionId);
      else if (code === 'KeyM') toggleMute(game.audio);
    } else if (game.screen === 'paused') {
      if (KEYS.pause.includes(code)) game.screen = 'playing';
      else if (code === 'KeyR') startMission(game, game.missionId);
      else if (code === 'KeyM') toggleMute(game.audio);
    } else if (game.screen === 'gameover' || game.screen === 'complete') {
      if (code === 'KeyR') startMission(game, game.missionId);
      else if (code === 'Enter') showTitle(game);
    }
  }
}

function handleClicks(game) {
  const clicked = takeClick(game.input);
  if (!clicked) return;
  ensureAudio(game.audio);
  const inside = (button) => clicked.x >= button.x && clicked.x <= button.x + button.w
    && clicked.y >= button.y && clicked.y <= button.y + button.h;
  if (game.screen === 'title') {
    for (const button of game.titleButtons) {
      if (inside(button)) startMission(game, button.missionId);
    }
  } else if (game.screen === 'gameover' || game.screen === 'complete') {
    for (const button of game.actionButtons) {
      if (!inside(button)) continue;
      if (button.action === 'restart') startMission(game, game.missionId);
      else showTitle(game);
    }
  }
}

function drawFrame(game, dt) {
  const { ctx, width, height } = game;
  ctx.clearRect(0, 0, width, height);
  if (game.screen === 'title') {
    drawTitleScreen(game);
    return;
  }
  if (game.screen === 'paused') {
    drawPaused(game);
    return;
  }
  if (game.screen === 'gameover') {
    drawGameOver(game);
    return;
  }
  if (game.screen === 'complete') {
    drawComplete(game);
    return;
  }
  // Playing.
  renderWorld(ctx, game, width, height, game.time);
  updateAndDrawParticles(ctx, game.particles, dt);
  const ringObjectives = game.mission.objectives.filter((item) => item.type === 'ring');
  const state = {
    plane: game.plane,
    score: game.score,
    timeLeft: game.mission.timeLeft,
    objectiveText: objectiveText(game.mission, game.plane),
    objectiveSub: objectiveSub(game.mission, game.plane),
    ringsPassed: game.mission.ringsPassed,
    ringsTotal: ringObjectives.length,
    groundHeight: heightAt(game.plane.x, game.plane.z),
    stalled: game.plane.speed < 14 && !game.plane.onGround,
  };
  drawHud(ctx, state, width, height);
  if (game.flash && game.time < game.flash.until) {
    ctx.fillStyle = '#ffc93c';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(game.flash.text, width / 2, height * 0.42);
  }
  updateEngineSound(game.audio, game.plane.throttle, game.plane.speed, game.mission.storm);
}

function boot() {
  const canvas = document.getElementById('game');
  const game = createGame(canvas);
  attachInput(game.input, canvas);
  resizeGame(game);
  window.addEventListener('resize', () => resizeGame(game));
  showTitle(game);

  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    // Deterministic screenshot scene: stage it, render one frame, stop.
    // The canvas is sized to the window the parent opens (1280x720).
    resizeGame(game);
    stageShot(game, shot);
    return;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    handleKeys(game);
    handleClicks(game);
    if (game.screen === 'playing') {
      // Fixed steps keep the physics stable at any frame rate.
      let remaining = dt;
      while (remaining > 0) {
        const step = Math.min(STEP, remaining);
        stepPlaying(game, step);
        remaining -= step;
        if (game.screen !== 'playing') break;
      }
    }
    drawFrame(game, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
