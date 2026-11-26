// Synthesised sound for Langit Courier: no audio files, only the Web Audio
// API. Engine hum follows the throttle, rings chime, landings play a short
// jingle and crashes thud. Everything is created lazily on the first user
// gesture, so the page never needs an autoplay permission.

export function createAudio() {
  return {
    context: null,
    master: null,
    engineOsc: null,
    engineOsc2: null,
    engineGain: null,
    windGain: null,
    windSource: null,
    muted: false,
    started: false,
  };
}

// Build the audio graph. Safe to call more than once; the second call is a
// no-op. Must be called from a user gesture (key or click) the first time.
export function ensureAudio(audio) {
  if (audio.started) return true;
  if (typeof window === 'undefined' || !window.AudioContext) return false;
  try {
    const context = new window.AudioContext();
    const master = context.createGain();
    master.gain.value = audio.muted ? 0 : 0.5;
    master.connect(context.destination);

    // Engine: two detuned sawtooth oscillators through a low-pass filter,
    // so the hum is warm instead of buzzy.
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.connect(master);
    const engineGain = context.createGain();
    engineGain.gain.value = 0;
    engineGain.connect(filter);
    const engineOsc = context.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 62;
    engineOsc.connect(engineGain);
    engineOsc.start();
    const engineOsc2 = context.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 93;
    engineOsc2.connect(engineGain);
    engineOsc2.start();

    // Wind: looped filtered noise, louder at speed and in the storm.
    // The buffer is filled once at startup from a fixed-seed generator:
    // it is only sound, never game state, so it does not affect the
    // deterministic replay — and no Math.random is used anywhere.
    const noiseLength = context.sampleRate * 2;
    const noiseBuffer = context.createBuffer(1, noiseLength, context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    let noiseState = 123456789;
    for (let i = 0; i < noiseLength; i += 1) {
      noiseState = (noiseState * 1664525 + 1013904223) >>> 0;
      noiseData[i] = noiseState / 2147483648 - 1;
    }
    const windSource = context.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;
    const windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    const windGain = context.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSource.start();

    audio.context = context;
    audio.master = master;
    audio.engineOsc = engineOsc;
    audio.engineOsc2 = engineOsc2;
    audio.engineGain = engineGain;
    audio.windGain = windGain;
    audio.windSource = windSource;
    audio.started = true;
    return true;
  } catch (error) {
    return false;
  }
}

// Call every frame: engine pitch follows throttle, wind follows speed.
export function updateEngineSound(audio, throttle, speed, storm) {
  if (!audio.started || !audio.context) return;
  const time = audio.context.currentTime;
  const base = 52 + throttle * 58;
  audio.engineOsc.frequency.setTargetAtTime(base, time, 0.08);
  audio.engineOsc2.frequency.setTargetAtTime(base * 1.5, time, 0.08);
  audio.engineGain.gain.setTargetAtTime(0.05 + throttle * 0.1, time, 0.1);
  const windLevel = Math.min(0.16, speed * 0.0022 + (storm ? 0.08 : 0));
  audio.windGain.gain.setTargetAtTime(windLevel, time, 0.2);
}

// One short tone: a sine note with a quick attack and a gentle decay.
function playTone(audio, frequency, startAt, duration, volume) {
  if (!audio.started || !audio.context) return;
  const context = audio.context;
  const osc = context.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

// Ring chime: a bright two-note ping that says "got it".
export function playRingChime(audio) {
  if (!audio.started || !audio.context) return;
  const now = audio.context.currentTime;
  playTone(audio, 880, now, 0.35, 0.35);
  playTone(audio, 1318, now + 0.07, 0.4, 0.3);
}

// Landing jingle: a small rising arpeggio in C major.
export function playLandingJingle(audio) {
  if (!audio.started || !audio.context) return;
  const now = audio.context.currentTime;
  const notes = [523, 659, 784, 1046];
  notes.forEach((frequency, index) => {
    playTone(audio, frequency, now + index * 0.11, 0.5, 0.32);
  });
}

// Mission complete: the landing jingle plus a high sparkle on top.
export function playMissionComplete(audio) {
  if (!audio.started || !audio.context) return;
  playLandingJingle(audio);
  const now = audio.context.currentTime;
  playTone(audio, 1568, now + 0.5, 0.7, 0.25);
  playTone(audio, 2093, now + 0.62, 0.8, 0.2);
}

// Crash: a low thud made from a falling sine and a burst of noise.
export function playCrash(audio) {
  if (!audio.started || !audio.context) return;
  const context = audio.context;
  const now = context.currentTime;
  const osc = context.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(38, now + 0.4);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(now);
  osc.stop(now + 0.55);
}

// Toggle mute; returns the new muted state.
export function toggleMute(audio) {
  audio.muted = !audio.muted;
  if (audio.started && audio.master && audio.context) {
    audio.master.gain.setTargetAtTime(audio.muted ? 0 : 0.5, audio.context.currentTime, 0.05);
  }
  return audio.muted;
}
