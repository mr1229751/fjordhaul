// audio.js — every sound is synthesized with WebAudio: a two-oscillator
// engine whose pitch follows the throttle, filtered wind that follows the
// airspeed, a chime for a ring or a crate on target, and a low thud for
// touchdown and crashes. M mutes. Nothing loads from a file.

export function createAudio() {
  let ctx = null, engineOsc = null, engineOsc2 = null, engineGain = null;
  let windGain = null, muted = false, started = false;

  function start() {
    if (started) return;
    started = true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
      engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'square';
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass'; engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter); engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain); engineGain.connect(ctx.destination);
      engineOsc.start(); engineOsc2.start();

      const len = ctx.sampleRate * 1.2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const wind = ctx.createBufferSource(); wind.buffer = buffer; wind.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass'; windFilter.frequency.value = 640; windFilter.Q.value = 0.6;
      windGain = ctx.createGain(); windGain.gain.value = 0;
      wind.connect(windFilter); windFilter.connect(windGain); windGain.connect(ctx.destination);
      wind.start();
    } catch (err) {
      ctx = null; // no audio device: the game flies silent
    }
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator(); osc.type = type; osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  return {
    start,
    get muted() { return muted; },
    toggleMute() { muted = !muted; if (engineGain) engineGain.gain.value = 0; return muted; },
    // Called every frame with the flight state.
    update(plane) {
      if (!ctx || muted) return;
      const rpm = 30 + plane.throttle * 68;
      engineOsc.frequency.value = rpm;
      engineOsc2.frequency.value = rpm * 1.5 + 3;
      engineGain.gain.value = plane.onGround && plane.speed < 1 ? 0.012 : 0.028 + plane.throttle * 0.03;
      windGain.gain.value = Math.min(0.11, plane.speed * plane.speed * 0.000028);
    },
    chime() { blip(880, 0.16, 'sine', 0.16); blip(1318, 0.22, 'sine', 0.14, 0.07); },
    dropTone() { blip(392, 0.14, 'triangle', 0.15); },
    thud(hard) { blip(hard ? 68 : 92, 0.3, 'sine', 0.3); blip(50, 0.42, 'triangle', 0.2, 0.03); },
    stallWarn() { blip(1180, 0.09, 'square', 0.05); },
  };
}
