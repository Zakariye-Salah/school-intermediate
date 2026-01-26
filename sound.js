// sound.js — improved SoundManager with many files, BG ducking and modal toggles

// configure how many files you have — adjust if you create more/less
const BG_COUNT = 16;       // bg1.mp3 .. bg20.mp3 (your folder)
const CORRECT_COUNT = 19;  // correct1.mp3 .. correct30.mp3
const WRONG_COUNT = 35;    // wrong1.mp3 .. wrong30.mp3

// streak thresholds (files should be named streak10.mp3, streak20.mp3, ...)
// include higher thresholds you want; if a streak n doesn't match, manager picks nearest lower threshold.
const STREAK_THRESHOLDS = [10,20,30,40,50,60,70,80,90,100,200,300,500,700,1000];

// base asset folder (update if your assets are somewhere else)
const ASSET_FOLDER = 'assets';

function pathFor(prefix, idx){
  return `${ASSET_FOLDER}/${prefix}${idx}.mp3`;
}
function pathForStreak(th){
  return `${ASSET_FOLDER}/streak${th}.mp3`;
}

function randIndex(max){ return Math.floor(Math.random()*max); }
function getRandomFrom(arr){ if(!arr || arr.length===0) return null; return arr[Math.floor(Math.random()*arr.length)]; }

function fadeVolume(audio, from, to, duration=300){
  if(!audio) return Promise.resolve();
  // linear fade over duration ms
  const steps = 12;
  const stepTime = duration / steps;
  const delta = (to - from) / steps;
  let i = 0;
  return new Promise(resolve => {
    try {
      audio.volume = Math.max(0, Math.min(1, from));
    } catch(e){}
    const tick = () => {
      i++;
      try { audio.volume = Math.max(0, Math.min(1, from + delta*i)); } catch(e){}
      if(i >= steps) return resolve();
      setTimeout(tick, stepTime);
    };
    tick();
  });
}

// safe play: try Audio and return a promise that resolves when ended (or timed out)
// function playAudioElement(path){
//   return new Promise((resolve) => {
//     try {
//       const a = new Audio(path);
//       a.preload = 'auto';
//       // ensure it resolves even if playback doesn't start or errors
//       let settled = false;
//       const finish = (ok=true) => { if(settled) return; settled = true; try { a.pause(); } catch(e){} resolve(ok); };
//       a.addEventListener('ended', () => finish(true));
//       a.addEventListener('error', () => finish(false));
//       // safety timeout in case 'ended' doesn't fire (2s default, but effects might be longer) - we set 6s here
//       const to = setTimeout(()=> finish(true), 6000);
//       a.play().catch((e) => { // play may be blocked
//         // fallback: resolve false (still allow app to continue)
//         finish(false);
//       });
//       // when finished, clear timeout
//       // finish will pause audio and resolve
//     } catch (e) {
//       resolve(false);
//     }
//   });
// }

// safe play: try Audio and return a promise that resolves when ended (or timed out)
function playAudioElement(path){
  return new Promise((resolve) => {
    try {
      const a = new Audio(path);
      a.preload = 'auto';

      // keep a global pool so we can stop all active sounds later
      if(!window.__activeAudioPool) window.__activeAudioPool = [];
      window.__activeAudioPool.push(a);

      let settled = false;
      const finish = (ok=true) => {
        if(settled) return;
        settled = true;
        try { a.pause(); a.currentTime = 0; } catch(e){}
        // remove from pool
        window.__activeAudioPool = (window.__activeAudioPool || []).filter(x => x !== a);
        resolve(ok);
      };

      a.addEventListener('ended', () => finish(true));
      a.addEventListener('error', () => finish(false));

      // safety timeout in case 'ended' doesn't fire
      const to = setTimeout(() => finish(true), 6000);

      a.play().catch(() => {
        // playback blocked or failed — still cleanup
        clearTimeout(to);
        finish(false);
      });
    } catch (e) {
      resolve(false);
    }
  });
}

export const SoundManager = {
  bgEnabled: false,
  effectsEnabled: true,
  bgAudio: null,      // single HTMLAudioElement used for bg playback (looped)
  bgList: [],
  correctList: [],
  wrongList: [],
  streakMap: {},

  preloadAll(){
    // build lists
    for(let i=1;i<=BG_COUNT;i++) this.bgList.push(pathFor('bg', i));
    for(let i=1;i<=CORRECT_COUNT;i++) this.correctList.push(pathFor('correct', i));
    for(let i=1;i<=WRONG_COUNT;i++) this.wrongList.push(pathFor('wrong', i));
    STREAK_THRESHOLDS.forEach(t => this.streakMap[t] = pathForStreak(t));

    // prepare bg audio element but don't autoplay (browser may block)
    try {
      this.bgAudio = new Audio();
      this.bgAudio.loop = true;
      this.bgAudio.preload = 'auto';
      this.bgAudio.volume = 0.20; // keep bg generally low by default
    } catch (e) {
      this.bgAudio = null;
    }
  },

  _chooseBgPath(){
    return getRandomFrom(this.bgList) || null;
  },
//where i added is here be carefully not double dd think it here comes error if.. not jj dd  ok

  stopAll(){
    try {
      // stop background audio if present
      if(this.bgAudio){
        try { this.bgAudio.pause(); this.bgAudio.currentTime = 0; } catch(e){}
      }
    } catch(e){}
  
    // stop any active effect audio created by playAudioElement
    try {
      if(window.__activeAudioPool && Array.isArray(window.__activeAudioPool)){
        window.__activeAudioPool.forEach(a => { try { a.pause(); a.currentTime = 0; } catch(e){} });
        window.__activeAudioPool = [];
      }
    } catch(e){}
  },

  //that's the end 
  async _startBg(){
    if(!this.bgAudio) return;
    const path = this._chooseBgPath();
    if(!path) return;
    // if current bgAudio.src differs, swap
    try {
      if(this.bgAudio.src && this.bgAudio.src.includes(path)) {
        await this.bgAudio.play().catch(()=>{});
        return;
      }
      this.bgAudio.src = path;
      // ensure we start at a random offset so repeating bg isn't always same phase
      this.bgAudio.currentTime = Math.random() * 4;
      await this.bgAudio.play().catch(()=>{});
    } catch(e){}
  },

  setBgEnabled(on){
    this.bgEnabled = !!on;
    if(this.bgEnabled){
      // start playing random bg
      this._startBg();
    } else {
      if(this.bgAudio){
        try { this.bgAudio.pause(); } catch(e){}
      }
    }
  },

  setEffectsEnabled(on){
    this.effectsEnabled = !!on;
  },

  // helper to pick streak path for a given n: use exact if available, otherwise nearest lower threshold
  _getStreakPathFor(n){
    if(!n) return null;
    // if exact file exists:
    if(this.streakMap[n]) return this.streakMap[n];
    // find nearest lower threshold
    const ts = STREAK_THRESHOLDS.slice().sort((a,b)=>a-b);
    let pick = null;
    for(const t of ts){
      if(n >= t) pick = t;
      else break;
    }
    if(pick) return this.streakMap[pick];
    // fallback: smallest threshold
    return this.streakMap[ts[0]] || null;
  },

  // Play an effect while ducking the background
  async _playEffectWithBgDuck(effectPath){
    if(!this.effectsEnabled || !effectPath) {
      return false;
    }
    try {
      // duck bg
      const bg = this.bgAudio;
      let restored = false;
      if(bg && !bg.paused){
        const prevVol = bg.volume || 0.2;
        // fade to low (10% of original)
        await fadeVolume(bg, prevVol, Math.max(0.02, prevVol * 0.12), 160);
        // play effect
        const played = await playAudioElement(effectPath);
        // restore bg
        await fadeVolume(bg, bg.volume, prevVol, 240);
        restored = true;
        return played;
      } else {
        // no bg playing, just play effect
        const played2 = await playAudioElement(effectPath);
        return played2;
      }
    } catch(e){
      console.warn('playEffectWithBgDuck failed', e);
      // try synth fallback
      try { synthClapFallback(); } catch(e2){}
      return false;
    }
  },

  async playFile(path){
    if(!this.effectsEnabled) return false;
    try {
      return await this._playEffectWithBgDuck(path);
    } catch(e){
      console.warn('playFile failed', e);
      return false;
    }
  },

  async playCorrect(){
    if(!this.effectsEnabled) return false;
    const p = getRandomFrom(this.correctList);
    if(!p) return false;
    return this._playEffectWithBgDuck(p);
  },

  async playIncorrect(){
    if(!this.effectsEnabled) return false;
    const p = getRandomFrom(this.wrongList);
    if(!p) return false;
    return this._playEffectWithBgDuck(p);
  },

  async playStreak(n = 10){
    if(!this.effectsEnabled) return false;
    const p = this._getStreakPathFor(n);
    if(!p) return false;
    return this._playEffectWithBgDuck(p);
  },

  // Force a short clap synth fallback if files fail
  async playClapFallback(){
    try { synthClapFallback(); return true; } catch(e){ return false; }
  }
};

// small synth fallback in case audio files can't play
function synthClapFallback(count = 6, speed = 0.06, volume = 0.8) {
  try {
    if (!window.__audioFallbackCtx) window.__audioFallbackCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = window.__audioFallbackCtx;
    const now = ctx.currentTime;
    for (let i = 0; i < count; i++) {
      const t = now + i * speed;
      const bufferSize = Math.floor(ctx.sampleRate * 0.08);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let j = 0; j < bufferSize; j++) {
        data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bufferSize * 0.85)) * (1 - i * 0.08);
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1200 - (i * 60);
      band.Q.value = 0.6 + (i * 0.12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume * (1 - i * 0.08), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      src.connect(band);
      band.connect(gain);
      gain.connect(ctx.destination);
      src.start(t);
      src.stop(t + 0.22);
    }
  } catch (e) { console.warn('synth fallback failed', e); }
}

// default export for compatibility
export default SoundManager;
