/**
 * PebbleX SFX — tiny synthesized sound engine (Web Audio, zero assets).
 * Everything is generated: soft clicks, key taps, whooshes, pebble drops,
 * a send blip and a two-note chime. Muted until the user opts in.
 */

type Listener = (on: boolean) => void;

class SFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private listeners = new Set<Listener>();
  private lastKey = 0;
  private lastTick = 0;
  enabled = false;

  constructor() {
    try {
      this.enabled = localStorage.getItem("pebblex-sfx") === "1";
    } catch {
      this.enabled = false;
    }
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    try {
      localStorage.setItem("pebblex-sfx", on ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (on) {
      this.ensure();
      this.ctx?.resume();
      this.chime();
    }
    this.listeners.forEach((l) => l(on));
  }

  toggle() {
    this.setEnabled(!this.enabled);
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    // gentle low-pass so nothing is ever harsh
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7000;
    this.master.connect(lp);
    lp.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 0.4);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return this.ctx;
  }

  private get t() {
    return this.ctx!.currentTime;
  }

  private tone({ freq, to, dur = 0.12, type = "sine", gain = 0.18, delay = 0 }: { freq: number; to?: number; dur?: number; type?: OscillatorType; gain?: number; delay?: number }) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state === "suspended") ctx?.resume();
    if (!ctx) return;
    const t0 = this.t + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private hit({ dur = 0.09, gain = 0.1, freq = 1400, q = 1, delay = 0, type = "bandpass" }: { dur?: number; gain?: number; freq?: number; q?: number; delay?: number; type?: BiquadFilterType } = {}) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const t0 = this.t + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master!);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** soft mouse click */
  click() {
    this.hit({ freq: 2200, q: 0.8, dur: 0.045, gain: 0.09 });
    this.tone({ freq: 520, to: 300, dur: 0.05, type: "triangle", gain: 0.06 });
  }

  /**
   * iOS-style cursor tick — a 6 ms high-passed noise burst, the same
   * character as an iPhone keyboard click. Barely audible, never annoying.
   */
  tick() {
    const now = performance.now();
    if (now - this.lastTick < 34) return;
    this.lastTick = now;
    this.hit({ type: "highpass", freq: 2600 + Math.random() * 700, q: 0.6, dur: 0.016, gain: 0.032 });
    this.tone({ freq: 1250 + Math.random() * 350, to: 900, dur: 0.018, type: "triangle", gain: 0.014 });
  }

  /** iOS-style press — a touch deeper than the tick */
  tap() {
    this.hit({ type: "highpass", freq: 1900, q: 0.7, dur: 0.028, gain: 0.055 });
    this.tone({ freq: 620, to: 380, dur: 0.045, type: "triangle", gain: 0.05 });
  }

  /** release after a press */
  release() {
    this.hit({ type: "highpass", freq: 3200, q: 0.5, dur: 0.014, gain: 0.022 });
  }

  /** soft rising sweep for hovers on cards / links */
  swoosh() {
    this.tone({ freq: 900, to: 1500, dur: 0.09, type: "sine", gain: 0.014 });
  }

  /** keyboard tap — slightly randomized so typing doesn't sound robotic */
  key() {
    const now = performance.now();
    if (now - this.lastKey < 28) return;
    this.lastKey = now;
    this.hit({ freq: 1500 + Math.random() * 900, q: 1.4, dur: 0.028, gain: 0.05 });
  }

  /** view transition */
  whoosh() {
    this.hit({ type: "lowpass", freq: 900, dur: 0.26, gain: 0.05 });
    this.tone({ freq: 220, to: 620, dur: 0.22, type: "sine", gain: 0.045 });
  }

  /** card picked up */
  pick() {
    this.tone({ freq: 380, to: 620, dur: 0.1, type: "triangle", gain: 0.07 });
  }

  /** pebble dropped into a column */
  drop() {
    this.tone({ freq: 300, to: 140, dur: 0.14, type: "sine", gain: 0.12 });
    this.hit({ freq: 700, q: 1.2, dur: 0.07, gain: 0.07, delay: 0.01 });
  }

  /** message sent */
  send() {
    this.tone({ freq: 660, to: 990, dur: 0.1, type: "sine", gain: 0.1 });
    this.tone({ freq: 990, dur: 0.13, type: "sine", gain: 0.05, delay: 0.07 });
  }

  /** AI reply starts streaming */
  blip() {
    this.tone({ freq: 880, dur: 0.07, type: "sine", gain: 0.05 });
  }

  /** theme applied */
  pop() {
    this.tone({ freq: 420, to: 880, dur: 0.13, type: "triangle", gain: 0.09 });
    this.hit({ freq: 3000, q: 0.7, dur: 0.05, gain: 0.04, delay: 0.02 });
  }

  /** success / toast */
  chime() {
    this.tone({ freq: 659.25, dur: 0.16, type: "sine", gain: 0.08 });
    this.tone({ freq: 987.77, dur: 0.22, type: "sine", gain: 0.06, delay: 0.09 });
  }

  /** secret unlocked */
  secret() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone({ freq: f, dur: 0.18, type: "triangle", gain: 0.07, delay: i * 0.07 }));
  }
}

export const sfx = new SFX();
