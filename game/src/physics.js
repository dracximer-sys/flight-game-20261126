// Flight physics for the courier: throttle, banking turns, assisted pitch,
// fuel, stalls, wind, takeoffs, landings and crashes. One fixed step, so a
// seeded replay is exactly reproducible.

import { PLANE, FUEL } from './config.js';
import { heightAt, runwayAt, RUNWAYS, runwayFrame } from './terrain.js';
import { approach, wrapAngle } from './aircraft.js';

// What the step needs from the mission: where the plane should be climbing
// toward, and the wind at this moment.
export function makeFlightContext(targetAltitude, windX, windZ) {
  return { targetAltitude, windX, windZ };
}

// Advance the plane one step. `input` is { throttleUp, throttleDown,
// turnLeft, turnRight, pitchTrim } from input.js. Returns an event object:
// { crashed: null | 'terrain' | 'water', landed: null | runway,
//   liftedOff: boolean }.
export function stepPhysics(plane, input, dt, context) {
  const events = { crashed: null, landed: null, liftedOff: false };

  // Throttle: W/S nudge it, clamped to [0, 1].
  if (input.throttleUp) plane.throttle = Math.min(1, plane.throttle + dt * 0.55);
  if (input.throttleDown) plane.throttle = Math.max(0, plane.throttle - dt * 0.7);

  // Fuel: the engine drinks more the harder it works. Empty tanks mean the
  // throttle is dead, not an instant crash — a good pilot can still glide.
  const hadFuel = plane.fuel > 0;
  plane.fuel = Math.max(0, plane.fuel - (FUEL.baseDrain + FUEL.throttleDrain * plane.throttle) * dt);
  if (!hadFuel || plane.fuel <= 0) plane.throttle = 0;

  // Speed chases the throttle target; drag grows with speed.
  const targetSpeed = plane.throttle * PLANE.maxSpeed;
  plane.speed = approach(plane.speed, targetSpeed, PLANE.accel * dt);
  if (plane.speed > PLANE.minSpeed) {
    plane.speed = approach(plane.speed, PLANE.cruiseSpeed * plane.throttle + 8, dt * 1.5);
  }

  // Bank: the steer value (-1 left to 1 right) sets the bank target
  // proportionally, so an autopilot (or a gentle pilot) can ask for a
  // shallow bank instead of full left or full right. Keyboard keys give
  // full deflection; the heading follows the bank, never the keys
  // directly, so turns feel like flying, not like steering a car.
  const steer = typeof input.steer === 'number'
    ? Math.max(-1, Math.min(1, input.steer))
    : (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0);
  const bankTarget = steer * PLANE.maxBank;
  plane.bank = approach(plane.bank, bankTarget, PLANE.bankRate * dt);
  // Heading rate grows with bank and with speed: a steep bank at cruise
  // turns about 17 degrees a second, a gentle bank barely turns at all.
  plane.heading = wrapAngle(plane.heading + plane.bank * PLANE.turnAuthority * (plane.speed / 30) * dt);

  // Pitch assist: the courier trims itself toward the mission's target
  // altitude, and the pilot's mouse trim nudges that target up or down.
  // This keeps the game about throttle and turn discipline, as briefed.
  const trimTarget = context.targetAltitude + (input.pitchTrim || 0) * 70;
  const groundHere = heightAt(plane.x, plane.z);
  if (plane.onGround) {
    plane.pitch = approach(plane.pitch, 0, PLANE.pitchRate * dt);
  } else {
    // A firm gain (0.8) so the courier actually tracks the glide path
    // instead of lagging above it and overflying the runway: the old
    // 0.35 gain only descended as fast as the error was large, so a
    // 15 m error closed at barely 2 m/s and the plane reached the strip
    // still 14 m up. The pitch rate limit keeps the response smooth.
    const wantedClimb = Math.max(-12, Math.min(12, (trimTarget - plane.altitude) * 0.8));
    const speedForPitch = Math.max(plane.speed, 8);
    const pitchTarget = Math.max(-PLANE.maxPitch, Math.min(PLANE.maxPitch, Math.asin(Math.max(-1, Math.min(1, wantedClimb / speedForPitch)))));
    plane.pitch = approach(plane.pitch, pitchTarget, PLANE.pitchRate * dt);
  }

  // Stall: too slow in the air and the courier sinks instead of flying.
  const stalled = !plane.onGround && plane.speed < PLANE.minSpeed;
  if (stalled) plane.pitch = approach(plane.pitch, -0.22, PLANE.pitchRate * dt);

  // Move: forward along the heading, up along the pitch, plus the wind.
  const forwardX = Math.sin(plane.heading);
  const forwardZ = Math.cos(plane.heading);
  plane.x += (forwardX * plane.speed * Math.cos(plane.pitch) + context.windX) * dt;
  plane.z += (forwardZ * plane.speed * Math.cos(plane.pitch) + context.windZ) * dt;
  plane.verticalSpeed = plane.speed * Math.sin(plane.pitch) - (stalled ? PLANE.stallSink : 0);
  if (!plane.onGround) plane.altitude += plane.verticalSpeed * dt;

  // Prop spins faster with throttle; the renderer reads this angle.
  plane.propAngle += dt * (4 + plane.throttle * 42);

  // Stay inside the archipelago: the sea beyond is a soft wall that turns
  // the plane back instead of ending the sortie.
  const limit = 1950;
  if (Math.abs(plane.x) > limit || Math.abs(plane.z) > limit) {
    plane.heading = wrapAngle(plane.heading + Math.PI);
    plane.x = Math.max(-limit, Math.min(limit, plane.x));
    plane.z = Math.max(-limit, Math.min(limit, plane.z));
  }

  // Ground contact. Two windows: a landing is caught early — a courier
  // descending gently onto a runway at up to 4 m above the strip, slow
  // and lined up, has landed — while a crash needs the plane to actually
  // reach the ground (1.2 m). The gap matters because the pitch assist
  // tracks the glide path from above with a small lag: it bottoms out
  // a couple of metres above the strip, and without the early window it
  // would overfly the runway forever.
  const ground = heightAt(plane.x, plane.z);
  const runway = runwayAt(plane.x, plane.z);
  const clearance = plane.altitude - ground;
  if (!plane.onGround && runway && clearance <= 4.0 && clearance > 1.2) {
    const frame = runwayFrame(runway, plane.x, plane.z);
    const headingError = Math.abs(wrapAngle(plane.heading - runway.heading));
    const aligned = headingError < 0.5 || Math.abs(headingError - Math.PI) < 0.5;
    const gentle = plane.verticalSpeed > -5.5;
    const slow = plane.speed < 52;
    const descending = plane.verticalSpeed < -0.5;
    if (gentle && slow && aligned && descending) {
      plane.onGround = true;
      plane.altitude = ground + 1.2;
      plane.verticalSpeed = 0;
      plane.pitch = 0;
      plane.bank = approach(plane.bank, 0, 2);
      events.landed = runway;
      return events;
    }
  }
  if (clearance <= 1.2) {
    if (plane.onGround) {
      plane.altitude = ground + 1.2;
      // Taxiing into the sea is a ditching, not a shortcut.
      if (!runway && ground <= 0.8) {
        events.crashed = 'water';
        return events;
      }
      // Takeoff: enough speed and a target above the ground lifts off.
      if (plane.speed >= PLANE.takeoffSpeed && trimTarget > ground + 12) {
        plane.onGround = false;
        events.liftedOff = true;
      }
      return events;
    }
    // Touching down: a runway, gentle descent, slow enough and lined up
    // with the strip is a landing. Anything else is a crash.
    const frame = runway ? runwayFrame(runway, plane.x, plane.z) : null;
    const headingError = frame
      ? Math.abs(wrapAngle(plane.heading - runway.heading))
      : Math.PI;
    const aligned = headingError < 0.5 || Math.abs(headingError - Math.PI) < 0.5;
    const gentle = plane.verticalSpeed > -5.5;
    const slow = plane.speed < 52;
    if (runway && gentle && slow && aligned) {
      plane.onGround = true;
      plane.altitude = ground + 1.2;
      plane.verticalSpeed = 0;
      plane.pitch = 0;
      plane.bank = approach(plane.bank, 0, 2);
      events.landed = runway;
      return events;
    }
    events.crashed = ground <= 0.8 ? 'water' : 'terrain';
    return events;
  }

  return events;
}

// Distance in metres from the plane to a point, in 3D.
export function distanceTo(plane, point) {
  const dx = plane.x - point.x;
  const dy = plane.altitude - point.y;
  const dz = plane.z - point.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// The closest runway, for the HUD's "nearest strip" readout.
export function nearestRunway(plane) {
  let best = null;
  let bestDistance = Infinity;
  for (const runway of RUNWAYS) {
    const dx = plane.x - runway.x;
    const dz = plane.z - runway.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = runway;
    }
  }
  return { runway: best, distance: bestDistance };
}
