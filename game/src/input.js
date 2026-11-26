// Keyboard and mouse input for Langit Courier. Keys are held state, not
// events, so the physics step reads them every frame; clicks and key
// presses are delivered as one-shot actions the game loop consumes.

import { KEYS } from './config.js';

export function createInput() {
  return {
    throttleUp: false,
    throttleDown: false,
    turnLeft: false,
    turnRight: false,
    // Mouse trim: -1 (push down) to 1 (pull up), eased back to 0.
    pitchTrim: 0,
    mouseSteer: 0, // -1 left to 1 right, from the mouse X position
    mouseActive: false,
    // One-shot actions, set by events and cleared by the game loop.
    pressedKeys: [],
    clicked: null, // { x, y } in canvas pixels
  };
}

// Is this code one of the codes in the list?
function isCode(code, list) {
  return list.indexOf(code) !== -1;
}

// Wire the listeners onto the window and canvas. Returns a function that
// removes them again (used by the test harness, not by the game itself).
export function attachInput(input, canvas) {
  function onKeyDown(event) {
    if (isCode(event.code, KEYS.throttleUp)) input.throttleUp = true;
    if (isCode(event.code, KEYS.throttleDown)) input.throttleDown = true;
    if (isCode(event.code, KEYS.turnLeft)) input.turnLeft = true;
    if (isCode(event.code, KEYS.turnRight)) input.turnRight = true;
    if (input.pressedKeys.indexOf(event.code) === -1) input.pressedKeys.push(event.code);
    // Keep the page from scrolling when the game owns the arrows and space.
    if (isCode(event.code, KEYS.throttleUp) || isCode(event.code, KEYS.throttleDown)
      || isCode(event.code, KEYS.turnLeft) || isCode(event.code, KEYS.turnRight)
      || event.code === 'Space') {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    if (isCode(event.code, KEYS.throttleUp)) input.throttleUp = false;
    if (isCode(event.code, KEYS.throttleDown)) input.throttleDown = false;
    if (isCode(event.code, KEYS.turnLeft)) input.turnLeft = false;
    if (isCode(event.code, KEYS.turnRight)) input.turnRight = false;
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width);
    const y = (event.clientY - rect.top) / Math.max(1, rect.height);
    // Mouse steers like a yoke: sideways for bank, up/down for pitch trim.
    input.mouseSteer = Math.max(-1, Math.min(1, (x - 0.5) * 2));
    input.pitchTrim = Math.max(-1, Math.min(1, (0.5 - y) * 1.6));
    input.mouseActive = true;
  }

  function onMouseDown(event) {
    const rect = canvas.getBoundingClientRect();
    input.clicked = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function onBlur() {
    input.throttleUp = false;
    input.throttleDown = false;
    input.turnLeft = false;
    input.turnRight = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  return function detachInput() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mousedown', onMouseDown);
  };
}

// The physics step reads this each frame: keyboard keys win, and the mouse
// steers only while it is clearly off-centre (so a resting mouse does not
// fight the keyboard). The mouse trim eases back toward level on its own
// because pitchTrim is only read while the mouse recently moved.
// `steer` is proportional (-1 to 1): full deflection from the keys, a
// partial deflection from the mouse position.
export function readFlightInput(input) {
  const steer = input.mouseActive && Math.abs(input.mouseSteer) > 0.18
    ? input.mouseSteer : 0;
  const keySteer = (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0);
  return {
    throttleUp: input.throttleUp,
    throttleDown: input.throttleDown,
    turnLeft: input.turnLeft || steer < -0.18,
    turnRight: input.turnRight || steer > 0.18,
    steer: keySteer !== 0 ? keySteer : steer,
    pitchTrim: input.mouseActive ? input.pitchTrim : 0,
  };
}

// Take and clear the one-shot key presses since the last frame.
export function takePressedKeys(input) {
  const pressed = input.pressedKeys;
  input.pressedKeys = [];
  return pressed;
}

// Take and clear the last click since the last frame.
export function takeClick(input) {
  const clicked = input.clicked;
  input.clicked = null;
  return clicked;
}
