/* ============================================================
   Pebble 3.0 — 04-sfx.js
   WebAudio synthesized sound engine (no asset files needed)
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

function tone(freq, dur, { type='sine', vol=0.5, delay=0, slide=0 } = {}){
  const c = ac(); if(!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, t0);
  if(slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq+slide), t0+dur);
  const v = vol * (NX.store.get('settings', {}).sfxVolume != null ? NX.store.get('settings').sfxVolume : 0.5);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(v, t0+0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
  osc.connect(g); g.connect(c.destination);
  osc.start(t0); osc.stop(t0+dur+0.05);
}

const BANK = {
  nav:    ()=>{ tone(520, .07, {type:'sine', vol:.16}); tone(780, .06, {type:'sine', vol:.10, delay:.045}); },
  click:  ()=>tone(660, .05, {type:'triangle', vol:.14}),
  tick:   ()=>tone(880, .04, {type:'sine', vol:.08}),
  open:   ()=>{ tone(420, .08, {type:'sine', vol:.14}); tone(640, .09, {type:'sine', vol:.12, delay:.05}); },
  send:   ()=>{ tone(600, .09, {type:'sine', vol:.2}); tone(900, .11, {type:'sine', vol:.16, delay:.06}); },
  receive:()=>{ tone(500, .09, {type:'sine', vol:.14}); tone(375, .12, {type:'sine', vol:.12, delay:.07}); },
  notify: ()=>{ tone(880, .1, {type:'sine', vol:.22}); tone(1175, .14, {type:'sine', vol:.18, delay:.09}); },
  ok:     ()=>{ tone(523, .09, {vol:.18}); tone(659, .09, {vol:.18, delay:.08}); tone(784, .16, {vol:.2, delay:.16}); },
  err:    ()=>{ tone(300, .14, {type:'square', vol:.08}); tone(220, .2, {type:'square', vol:.07, delay:.1}); },
  pop:    ()=>tone(980, .06, {type:'sine', vol:.16, slide:240}),
  confetti:()=>{ [523,659,784,1046].forEach((f,i)=>tone(f, .12, {vol:.14, delay:i*.05})); },
  timer:  ()=>{ tone(1046, .12, {vol:.2}); tone(784, .18, {vol:.2, delay:.12}); },
  login:  ()=>{ tone(392, .1, {vol:.16}); tone(523, .1, {vol:.16, delay:.09}); tone(659, .1, {vol:.16, delay:.18}); tone(784, .22, {vol:.2, delay:.27}); }
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

/* global click sound for buttons (subtle) */
document.addEventListener('pointerdown', (e)=>{
  const b = e.target.closest && e.target.closest('.btn, .icon-btn, .chip, .nav-item, .srv-tile');
  if(b) NX.sfx.play('click');
}, true);
})(window.NX);
