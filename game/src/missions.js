// Missions for Langit Courier: three sorties with different goals — a ring
// run, an island-hopping delivery with three landings, and a storm delivery.
// A mission is a list of objectives; the game steps through them in order.

import { MISSIONS, SCORE, FUEL, RING } from './config.js';
import { RUNWAYS, heightAt, runwayFrame } from './terrain.js';
import { createRng, fbmNoise, range } from './rng.js';
import { wrapAngle } from './aircraft.js';
import { distanceTo } from './physics.js';

// A ring the courier must fly through: centre, radius and whether it is done.
function makeRing(x, y, z) {
  return { type: 'ring', x, y, z, radius: RING.radius, passed: false, prevAlong: null };
}

// A landing objective on a named runway.
function makeLanding(runway) {
  return { type: 'land', x: runway.x, z: runway.z, y: heightAt(runway.x, runway.z) + 4, runway, passed: false };
}

// Ring positions for the Ring Run: a loop over the archipelago, each ring
// high enough to clear the island under it.
function ringRunRings() {
  const spots = [
    [-200, 95, -620],
    [320, 125, -920],
    [1150, 175, -1100],
    [1420, 140, -320],
    [1050, 105, 650],
    [320, 85, 920],
    [-620, 115, 1120],
    [-1020, 95, 180],
  ];
  return spots.map((spot) => makeRing(spot[0], spot[1], spot[2]));
}

// Guide rings for one Island Hop leg: two rings on the way to the runway.
function legGuides(from, to, rng) {
  const guides = [];
  for (const frac of [0.35, 0.7]) {
    const x = from.x + (to.x - from.x) * frac + range(rng, -60, 60);
    const z = from.z + (to.z - from.z) * frac + range(rng, -60, 60);
    const ground = heightAt(x, z);
    guides.push(makeRing(x, Math.max(70, ground + 55 + range(rng, 0, 30)), z));
  }
  return guides;
}

// Storm rings: six rings across the archipelago, lower and closer together
// so the wind has less time to push the courier off line.
function stormRings() {
  const spots = [
    [-150, 85, -700],
    [500, 110, -800],
    [1100, 130, -500],
    [1250, 100, 300],
    [700, 85, 900],
    [-100, 95, 600],
  ];
  return spots.map((spot) => makeRing(spot[0], spot[1], spot[2]));
}

// Build a mission's full state from its id. The seed is fixed per mission
// so the same mission always has the same rings.
export function buildMission(missionId) {
  const def = MISSIONS.find((item) => item.id === missionId) || MISSIONS[0];
  const rng = createRng(101 + MISSIONS.indexOf(def) * 17);
  const runwayA = RUNWAYS[0];
  const runwayB = RUNWAYS[1];
  let objectives = [];
  let storm = false;

  if (def.id === 'ring-run') {
    objectives = ringRunRings();
  } else if (def.id === 'island-hop') {
    objectives = [
      ...legGuides(runwayA, runwayB, rng),
      makeLanding(runwayB),
      ...legGuides(runwayB, runwayA, rng),
      makeLanding(runwayA),
      ...legGuides(runwayA, runwayB, rng),
      makeLanding(runwayB),
    ];
  } else {
    storm = true;
    objectives = [...stormRings(), makeLanding(runwayA)];
  }

  return {
    def,
    objectives,
    currentIndex: 0,
    storm,
    timeLimit: def.timeLimit,
    timeLeft: def.timeLimit,
    elapsed: 0,
    ringsPassed: 0,
    landingsDone: 0,
    complete: false,
    seed: 101 + MISSIONS.indexOf(def) * 17,
  };
}

// The objective the courier is flying toward right now, or null.
export function currentObjective(mission) {
  return mission.objectives[mission.currentIndex] || null;
}

// Is the mission over (every objective done)?
export function missionDone(mission) {
  return mission.currentIndex >= mission.objectives.length;
}

// Altitude the pitch assist should aim for: the next ring's height, or a
// glide path to the next runway that stays above the highest ground
// between the plane and the strip, so the approach never flies into a
// hillside the runway hides behind.
export function targetAltitudeFor(mission, plane) {
  const objective = currentObjective(mission);
  if (!objective) return 120;
  if (objective.type === 'ring') return objective.y;
  const distance = distanceTo(plane, objective);
  // Highest ground on the line to the strip. Note the start value is the
  // strip's own ground height, NOT the objective's height (which sits
  // 4 m above the ground): starting from the objective's height would
  // hold the plane 19 m up forever and it would overfly the runway.
  let highestGround = heightAt(objective.runway.x, objective.runway.z);
  const samples = 10;
  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples;
    const x = plane.x + (objective.x - plane.x) * t;
    const z = plane.z + (objective.z - plane.z) * t;
    highestGround = Math.max(highestGround, heightAt(x, z));
  }
  // Two-segment glide path that ends BELOW the touchdown height (strip
  // minus 1.5 m), not above it: the pitch assist tracks the target from
  // above with a lag, so a target that ends at the strip itself leaves
  // the courier levelling off 2-3 m above the ground, overflying the
  // runway forever. Aiming below the strip makes the plane descend
  // through the touchdown height, where the landing check catches it.
  // The last 150 m are shallow (10%) so the touchdown descent stays
  // under the gentle limit.
  const strip = heightAt(objective.runway.x, objective.runway.z) - 1.5;
  const farPart = Math.max(0, distance - 150) * 0.22;
  const nearPart = Math.min(distance, 150) * 0.10;
  const glidePath = strip + farPart + nearPart;
  // Terrain floor: stay 12 m above the highest ground on the approach,
  // fading out inside 150 m so the plane can actually descend to the
  // strip once it is over the flattened apron.
  const floor = highestGround + 12 * Math.min(1, distance / 150);
  return Math.max(Math.min(160, glidePath), floor);
}

// Wind at this moment, in m/s along x and z. Calm missions have none; the
// storm has a steady push plus slow gusts from seeded noise.
export function windAt(mission, time) {
  if (!mission.storm) return { x: 0, z: 0 };
  const gustX = (fbmNoise(time * 0.08, 3.7, mission.seed) - 0.5) * 18;
  const gustZ = (fbmNoise(9.2, time * 0.08, mission.seed) - 0.5) * 18;
  return { x: 5 + gustX, z: -3 + gustZ };
}

// Check the current ring: the plane passes it when it crosses the ring's
// plane (the along-track sign flips) close to the centre. Returns the ring
// when it is passed, otherwise null. The along-track axis is the plane's
// own heading, so a ring only counts when flown through, not when circled.
export function checkRingPass(mission, plane) {
  const objective = currentObjective(mission);
  if (!objective || objective.type !== 'ring') return null;
  const dx = plane.x - objective.x;
  const dz = plane.z - objective.z;
  const along = dx * Math.sin(plane.heading) + dz * Math.cos(plane.heading);
  // `along` is the signed distance past the ring along the flight path.
  const lateral = Math.sqrt(
    Math.max(0, dx * dx + dz * dz - along * along)
    + (plane.altitude - objective.y) * (plane.altitude - objective.y),
  );
  const crossed = objective.prevAlong !== null && objective.prevAlong < 0 && along >= 0;
  objective.prevAlong = along;
  if (crossed && lateral < RING.passRadius) {
    objective.passed = true;
    mission.currentIndex += 1;
    mission.ringsPassed += 1;
    return objective;
  }
  // Flying past the ring without crossing its disc: the ring stays open
  // and the pilot can circle back for it.
  if (objective.prevAlong !== null && along > RING.passRadius * 3 && lateral > RING.passRadius) {
    objective.prevAlong = null;
  }
  return null;
}

// Score for a ring: base points plus a time bonus for reaching it quickly.
export function ringScore(mission) {
  const speedBonus = Math.round(SCORE.ringTimeBonus * Math.max(0, mission.timeLeft / mission.timeLimit));
  return SCORE.ring + speedBonus;
}

// Called when the plane lands on a runway. Returns the points earned, or 0
// when the landing was not the current objective.
export function checkLanding(mission, runway) {
  const objective = currentObjective(mission);
  if (!objective || objective.type !== 'land' || objective.runway !== runway) return 0;
  objective.passed = true;
  mission.currentIndex += 1;
  mission.landingsDone += 1;
  return missionDone(mission) ? SCORE.delivery : SCORE.landing;
}

// Refuel a little for each ring, so a clean line is also a fuel decision.
export function refuelForRing(plane) {
  plane.fuel = Math.min(100, plane.fuel + FUEL.ringBonus);
}

// Text for the HUD: what to do next, and how far away it is.
export function objectiveText(mission, plane) {
  const objective = currentObjective(mission);
  if (!objective) return 'Misi selesai!';
  if (objective.type === 'ring') {
    const left = mission.objectives.filter((item) => item.type === 'ring' && !item.passed).length;
    const total = mission.ringsPassed + left;
    return `RING ${mission.ringsPassed + 1}/${total} — terbang melewati ring emas`;
  }
  return `Mendarat di ${objective.runway.name}`;
}

export function objectiveSub(mission, plane) {
  const objective = currentObjective(mission);
  if (!objective) return '';
  const distance = Math.round(distanceTo(plane, objective));
  if (objective.type === 'ring') return `Jarak ${distance} m · ring di ketinggian ${Math.round(objective.y)} m`;
  return `Jarak ${distance} m · samakan arah dengan runway`;
}

// Autopilot for the deterministic screenshot scenes: steer toward the
// current objective and hold a cruise throttle. It only ever presses the
// same keys a player could press. For a landing it first aims at the
// final approach fix — 650 m out on the runway's extended centreline — so
// the approach is lined up with the strip instead of cutting across it.
export function autopilotInput(mission, plane) {
  const objective = currentObjective(mission);
  if (!objective) return { throttleUp: false, throttleDown: false, turnLeft: false, turnRight: false, pitchTrim: 0 };
  let targetX = objective.x;
  let targetZ = objective.z;
  if (objective.type === 'land') {
    // Line up with the strip before the final: fly to the approach fix
    // 650 m out on the extended centreline, on whichever end the plane
    // is nearer, and only turn onto the centre when on final.
    const runway = objective.runway;
    const frame = runwayFrame(runway, plane.x, plane.z);
    const side = frame.along < 0 ? -1 : 1;
    // On final when the plane is between the fix and the strip on the same
    // side, close to the centreline: along*side is the distance in from
    // the fix, positive on both ends. The lower bound is -350, NOT +80:
    // the strip itself is at along*side 0..-190, and a plane 70 m from
    // the centre must keep aiming at the centre instead of turning back
    // to the fix behind it.
    const onFinal = Math.abs(frame.across) < 90 && frame.along * side > -350 && frame.along * side < 750;
    if (!onFinal) {
      const fixAlong = side * 650;
      targetX = runway.x + Math.sin(runway.heading) * fixAlong;
      targetZ = runway.z + Math.cos(runway.heading) * fixAlong;
    } else if (distanceTo(plane, objective) < 350) {
      // Short final: aim at the centreline 300 m ahead of the plane's
      // along-track position, so the courier flies straight down the
      // strip AND corrects any lateral drift back to the centreline.
      // (Aiming 300 m ahead along the current heading instead would
      // freeze whatever drift the plane already had and fly it into
      // the hills beside the strip.)
      const dirX = Math.sin(runway.heading);
      const dirZ = Math.cos(runway.heading);
      const sign = frame.along >= 0 ? 1 : -1;
      const targetAlong = frame.along - sign * 300;
      targetX = runway.x + dirX * targetAlong;
      targetZ = runway.z + dirZ * targetAlong;
    }
  }
  const desiredHeading = Math.atan2(targetX - plane.x, targetZ - plane.z);
  const error = wrapAngle(desiredHeading - plane.heading);
  // Proportional steering: a small heading error asks for a shallow bank,
  // so the courier tracks the centreline instead of weaving across it the
  // way a full-left/full-right bang-bang pilot does.
  const steer = Math.max(-1, Math.min(1, error * 2.0));
  // On final approach, ease off the throttle: slower means more time to
  // descend onto the strip, and the landing check wants speed under 52.
  const cruiseThrottle = objective.type === 'land' ? 0.6 : 0.72;
  return {
    throttleUp: plane.throttle < cruiseThrottle,
    throttleDown: plane.throttle > cruiseThrottle + 0.08,
    turnLeft: steer < -0.06,
    turnRight: steer > 0.06,
    steer,
    pitchTrim: 0,
  };
}
