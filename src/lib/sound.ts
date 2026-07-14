/* Tiny Web Audio synth — no audio assets needed. All sounds are generated. */

let ctx: AudioContext | null = null;
let enabled = true;

if (typeof window !== "undefined") {
  enabled = localStorage.getItem("ppb-sound") !== "off";
}

export function soundEnabled() {
  return enabled;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  localStorage.setItem("ppb-sound", on ? "on" : "off");
  if (!on) speechSynthesis?.cancel();
}

function ac(): AudioContext | null {
  if (!enabled || typeof window === "undefined") return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; at?: number; slideTo?: number } = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + (opts.at ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(opts.gain ?? 0.15, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noiseBuffer(a: AudioContext, seconds: number): AudioBuffer {
  const buf = a.createBuffer(1, a.sampleRate * seconds, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function noise(dur: number, opts: { gain?: number; freq?: number; q?: number; type?: BiquadFilterType; at?: number } = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + (opts.at ?? 0);
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a, dur + 0.1);
  const f = a.createBiquadFilter();
  f.type = opts.type ?? "bandpass";
  f.frequency.value = opts.freq ?? 2000;
  f.Q.value = opts.q ?? 0.8;
  const g = a.createGain();
  g.gain.setValueAtTime(opts.gain ?? 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
  src.stop(t + dur + 0.1);
}

export const sfx = {
  click() {
    tone(880, 0.06, { type: "triangle", gain: 0.08 });
  },
  beep() {
    tone(660, 0.18, { type: "sine", gain: 0.2 });
  },
  beepFinal() {
    tone(990, 0.35, { type: "sine", gain: 0.24 });
  },
  shutter() {
    noise(0.09, { gain: 0.35, freq: 4500, q: 1.2 });
    noise(0.05, { gain: 0.25, freq: 1200, q: 1, at: 0.06 });
  },
  flash() {
    tone(1500, 0.25, { type: "sine", gain: 0.05, slideTo: 3000 });
  },
  curtain() {
    noise(1.4, { gain: 0.12, freq: 500, q: 0.4, type: "lowpass" });
  },
  paper() {
    noise(0.8, { gain: 0.15, freq: 3000, q: 0.5, type: "highpass" });
  },
  pop() {
    tone(520, 0.12, { type: "sine", gain: 0.15, slideTo: 900 });
  },
  chime() {
    tone(784, 0.5, { gain: 0.1 });
    tone(988, 0.5, { gain: 0.1, at: 0.12 });
    tone(1319, 0.7, { gain: 0.1, at: 0.24 });
  },
};

/** Looping printer motor + head noise. Returns a stop function. */
export function startPrinter(): () => void {
  const a = ac();
  if (!a) return () => {};
  const motor = a.createOscillator();
  motor.type = "sawtooth";
  motor.frequency.value = 55;
  const mg = a.createGain();
  mg.gain.value = 0.045;
  motor.connect(mg).connect(a.destination);
  motor.start();

  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a, 1);
  src.loop = true;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1800;
  const lfo = a.createOscillator();
  lfo.frequency.value = 9;
  const lfoGain = a.createGain();
  lfoGain.gain.value = 0.05;
  const ng = a.createGain();
  ng.gain.value = 0.055;
  lfo.connect(lfoGain).connect(ng.gain);
  src.connect(f).connect(ng).connect(a.destination);
  src.start();
  lfo.start();

  return () => {
    const t = a.currentTime + 0.2;
    mg.gain.linearRampToValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0, t);
    motor.stop(t);
    src.stop(t);
    lfo.stop(t);
  };
}

export function say(text: string) {
  if (!enabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.92;
  u.pitch = 1.15;
  u.volume = 0.85;
  speechSynthesis.speak(u);
}
