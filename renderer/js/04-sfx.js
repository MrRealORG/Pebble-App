/* ============================================================
   PebbleX v0.1 — 04-sfx.js
   Realistic Physical & Acoustic UI Sound Synthesis Engine
   - Studio-grade physical modeling using WebAudio API
   - Mechanical haptic micro-switch clicks (transient noise + body thump)
   - Resonant crystal/glass chimes with natural acoustic harmonic ratios
   - Tactile wooden block pops & water droplet dynamics
   - Muted physical double-thuds for gentle error states
   - Smooth filtered aerodynamic swooshes for navigation
   - Zero external audio files required, zero latency
   ============================================================ */
(function(NX){
'use strict';
let ctx = null;

function ac(){
  if(!ctx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    ctx = new AC();
  }
  if(ctx.state === 'suspended') ctx.resume().catch(()=>{});
  return ctx;
}

function getMasterVol(){
  try{
    const s = NX.store.get('settings', {});
    return (s.sfxVolume != null ? s.sfxVolume : 0.5);
  }catch(e){ return 0.5; }
}

/* Synthesizes realistic white/pink noise burst for mechanical switch transients */
function noiseBurst(dur, { filterFreq=3200, filterQ=3, vol=0.15, delay=0 } = {}){
  const c = ac(); if(!c) return;
  const t0 = c.currentTime + delay;
  const bufferSize = Math.max(256, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0; i<bufferSize; i++){
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
  }

  const src = c.createBufferSource();
  src.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(filterFreq, t0);
  filter.Q.setValueAtTime(filterQ, t0);

  const gain = c.createGain();
  const v = vol * getMasterVol();
  gain.gain.setValueAtTime(v, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);

  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/* Resonant acoustic tone with natural exponential envelope */
function tone(freq, dur, { type='sine', vol=0.3, delay=0, slide=0, filterFreq=0 } = {}){
  const c = ac(); if(!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if(slide){
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  }

  const v = vol * getMasterVol();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(v, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  if(filterFreq > 0){
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(filterFreq, t0);
    osc.connect(f);
    f.connect(g);
  } else {
    osc.connect(g);
  }

  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.04);
}

/* Crystal glass bell with natural acoustic harmonic ratios (1.0 : 2.76 : 5.4) */
function glassBell(rootFreq, dur, vol = 0.2, delay = 0){
  tone(rootFreq, dur, { type:'sine', vol: vol, delay });
  tone(rootFreq * 2.756, dur * 0.6, { type:'sine', vol: vol * 0.28, delay });
  tone(rootFreq * 5.404, dur * 0.35, { type:'sine', vol: vol * 0.12, delay });
}

/* Realistic Sound Bank */
const BANK = {
  /* 1. Realistic Mechanical Haptic Click: micro-transient + sub-thump */
  click: () => {
    // High-frequency mechanical contact click
    noiseBurst(0.012, { filterFreq: 3600, filterQ: 4.5, vol: 0.14 });
    // Low-frequency key switch body damp
    tone(180, 0.022, { type:'sine', vol: 0.16, slide: -70 });
  },

  /* 2. Tactile dial tick: crisp precise micro-tap */
  tick: () => {
    noiseBurst(0.008, { filterFreq: 4200, filterQ: 5, vol: 0.11 });
    tone(740, 0.014, { type:'sine', vol: 0.08, slide: -200 });
  },

  /* 3. Smooth aerodynamic navigation / page turn */
  nav: () => {
    noiseBurst(0.05, { filterFreq: 1800, filterQ: 1.5, vol: 0.08 });
    tone(560, 0.07, { type:'sine', vol: 0.12, slide: 120 });
    glassBell(880, 0.12, 0.06, 0.03);
  },

  /* 4. Realistic acoustic pop: wooden block / liquid drop */
  pop: () => {
    noiseBurst(0.006, { filterFreq: 2800, filterQ: 4, vol: 0.1 });
    const c = ac(); if(!c) return;
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, t0);
    osc.frequency.exponentialRampToValueAtTime(1450, t0 + 0.01);
    osc.frequency.exponentialRampToValueAtTime(700, t0 + 0.055);
    const v = 0.22 * getMasterVol();
    g.gain.setValueAtTime(v, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + 0.07);
  },

  /* 5. Natural warm glass window open */
  open: () => {
    noiseBurst(0.03, { filterFreq: 2200, filterQ: 2, vol: 0.07 });
    glassBell(587.33, 0.16, 0.14, 0.01); // D5
    glassBell(880, 0.22, 0.12, 0.06);    // A5
  },

  /* 6. Success / Task Complete: warm 3-note harmonic celesta chime */
  ok: () => {
    glassBell(523.25, 0.22, 0.16, 0.00); // C5
    glassBell(659.25, 0.24, 0.16, 0.07); // E5
    glassBell(783.99, 0.38, 0.20, 0.14); // G5
  },

  /* 7. Notification: pristine double chime */
  notify: () => {
    glassBell(880, 0.26, 0.18, 0.00);    // A5
    glassBell(1174.66, 0.35, 0.18, 0.08); // D6
  },

  /* 8. Send message: upward pneumatic tactile whoosh */
  send: () => {
    noiseBurst(0.04, { filterFreq: 2400, filterQ: 2, vol: 0.1 });
    tone(440, 0.09, { type:'sine', vol: 0.16, slide: 380 });
    glassBell(1046.5, 0.16, 0.12, 0.05);
  },

  /* 9. Receive message: soft mellow chime */
  receive: () => {
    glassBell(783.99, 0.18, 0.15, 0.00);
    glassBell(587.33, 0.25, 0.14, 0.07);
  },

  /* 10. Gentle error: physical wooden double-thump (never annoying) */
  err: () => {
    tone(150, 0.06, { type:'triangle', vol: 0.14, slide: -40 });
    tone(115, 0.09, { type:'triangle', vol: 0.12, delay: 0.06, slide: -30 });
    noiseBurst(0.02, { filterFreq: 800, filterQ: 1.5, vol: 0.08 });
  },

  /* 11. Celebration / Confetti: shimmering harp arpeggio */
  confetti: () => {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, idx) => {
      glassBell(freq, 0.28, 0.15, idx * 0.045);
    });
  },

  /* 12. Timer complete: resonant acoustic singing bowl */
  timer: () => {
    glassBell(659.25, 0.5, 0.22, 0.00);
    glassBell(987.77, 0.6, 0.18, 0.12);
  },

  /* 13. System unlock / login: majestic welcoming chord */
  login: () => {
    glassBell(440, 0.35, 0.16, 0.00);
    glassBell(554.37, 0.35, 0.16, 0.08);
    glassBell(659.25, 0.45, 0.18, 0.16);
    glassBell(880, 0.65, 0.22, 0.25);
  },

  /* 14. Switch / Toggle */
  toggle: () => {
    noiseBurst(0.007, { filterFreq: 4000, filterQ: 4, vol: 0.12 });
    tone(320, 0.018, { type:'sine', vol: 0.12, slide: -80 });
  }
};

NX.sfx = {
  play(name){
    try{
      const s = NX.store.get('settings', {});
      if(s.sfx === false) return;
      (BANK[name] || BANK.click)();
    }catch(e){}
  }
};

/* global click sound for interactive elements (subtle tactile haptic) */
document.addEventListener('pointerdown', (e)=>{
  const b = e.target.closest && e.target.closest('.btn, .icon-btn, .chip, .nav-item, .srv-tile');
  if(b) NX.sfx.play('click');
}, true);

})(window.NX);
