// main.js (updated)
// Keep your firebase imports etc.
import { db } from './firebase-config.js';
// import { doc, getDoc, getDocs, collection, query, where } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

// // add orderBy and limit to your firebase/firestore imports
// import { collection, doc, getDocs, getDoc, query, where, orderBy, limit, addDoc, updateDoc, deleteDoc, setDoc, Timestamp } 
// from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
// or your project's firebase import style — just ensure orderBy & limit are present

// -------- STUDENT: render quizzes for a student (main.js) --------
import { collection, where,orderBy,query as qFn, where as whereFn, getDocs,getDoc ,doc,query,getDoc as getDocFn, limit ,addDoc,addDoc as addDocFn, collection as collectionFn, setDoc as setDocFn, doc as docFn, orderBy as orderByFn , updateDoc, deleteDoc, Timestamp} 
from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';



/* ---------- DOM refs ---------- */
const searchBtn = document.getElementById('searchBtn');
const studentIdInput = document.getElementById('studentId');
const resultArea = document.getElementById('resultArea');
const message = document.getElementById('message');
const loaderOverlay = document.getElementById('loaderOverlay');
const loaderMessageEl = document.getElementById('loaderMessage');
const toggleIdInputBtn = document.getElementById('toggleIdInputBtn');

const audioToggleBtn = document.getElementById('audioToggleBtn');
let audioEnabled = false;

const celebrationOverlay = document.getElementById('celebrationOverlay');
const celebrationModal = document.getElementById('celebrationModal');
const celebrationClose = document.getElementById('celebrationClose');
const celebrationCloseBtn = document.getElementById('celebrationCloseBtn');
const celebrationFall = document.getElementById('celebrationFall');

const toggleEmojisBtn = document.getElementById('toggleEmojisBtn');
const toggleEmojisIcon = document.getElementById('toggleEmojisIcon');
const clapAudioEl = document.getElementById('clapAudio'); // preloaded audio element

let emojisVisible = true;
let lastEmojiType = 'celebrate';

/* ---------- loader helpers ---------- */
let loaderInterval = null;
const loaderMessages = ['Fadlan sug...','Waxaan hubineynaa xogta...','Waxaa la soo rarayaa natiijooyinka...'];
function showLoader(){
  if(!loaderOverlay) return;
  loaderOverlay.style.display='flex';
  let i=0;
  loaderMessageEl.textContent = loaderMessages[0];
  if(loaderInterval) clearInterval(loaderInterval);
  loaderInterval = setInterval(()=>{ i=(i+1)%loaderMessages.length; loaderMessageEl.textContent = loaderMessages[i]; },2200);
}
function hideLoader(){
  if(!loaderOverlay) return;
  loaderOverlay.style.display='none';
  if(loaderInterval){ clearInterval(loaderInterval); loaderInterval=null; }
  loaderMessageEl.textContent='';
}

/* ---------- small utilities (escape etc.) ---------- */
function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }


/* ---------- currency + tiny toast helper (paste after escapeHtml) ---------- */

/** cents -> display string with 2 decimals (e.g. 3500 -> "35.00") */
function c2p(cents){
  // handle strings/numbers/undefined
  const n = Number(cents || 0);
  if (Number.isNaN(n)) return '0.00';
  return (n / 100).toFixed(2);
}

const toastContainer = document.getElementById('toast-container');


const MAX_TOASTS = 5;

/* ---------------- SOUND (uses your asset) ---------------- */
// point to your file (make sure path is correct relative to the page)
const toastSound = new Audio('assets/notification.mp3');
toastSound.preload = 'auto';
toastSound.volume = 0.9;

let audioUnlocked = false; // will flip true after a successful play

// safe play helper — tries to play now, otherwise registers a one-time gesture unlock
async function playToastSound() {
  if (!toastSound) return;
  try {
    // if audio already unlocked, just restart then play
    toastSound.currentTime = 0;
    await toastSound.play();
    audioUnlocked = true;
  } catch (err) {
    // play was blocked by browser autoplay policy — register a one-time unlock on user gesture
    // we do not spam listeners: use { once: true } so it auto-removes after first gesture
    const unlock = async () => {
      try {
        toastSound.currentTime = 0;
        await toastSound.play();
        audioUnlocked = true;
      } catch (e) {
        // still blocked — ignore
      }
    };
    document.addEventListener('click', unlock, { once: true, passive: true });
    document.addEventListener('keydown', unlock, { once: true, passive: true });
    document.addEventListener('touchstart', unlock, { once: true, passive: true });
  }
}


/**
 * toast(message, type, duration)
 * type: success | error | warning | info
 */

function toast(msg, type = 'info', duration = 2200) {
  if (!toastContainer) return;

  // queue limit
  while (toastContainer.children.length >= MAX_TOASTS) {
    toastContainer.firstChild.remove();
  }

  const toastEl = document.createElement('div');
  toastEl.className = `toast ${type}`;

  const iconMap = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

  toastEl.innerHTML = `
    <div class="icon" aria-hidden="true">${iconMap[type] || 'ℹ'}</div>
    <div class="msg">${msg}</div>
    <button class="close" aria-label="Close toast">✕</button>
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"></div>
  `;

  // append
  toastContainer.appendChild(toastEl);

  // close btn
  const closeBtn = toastEl.querySelector('.close');
  if (closeBtn) closeBtn.onclick = () => removeToast(toastEl);

  // progress bar animation
  const bar = toastEl.querySelector('.bar');
  if (bar) {
    bar.style.transition = `transform ${duration}ms linear`;
    // ensure the style change runs in next frame
    requestAnimationFrame(() => { bar.style.transform = 'scaleX(0)'; });
  }

  // play sound (safe)
  playToastSound().catch(() => { /* ignore sound failures */ });

  // auto remove
  const autoRemoveTimer = setTimeout(() => removeToast(toastEl), duration);

  // Pause removal on hover / focus (nice UX)
  toastEl.addEventListener('mouseenter', () => {
    clearTimeout(autoRemoveTimer);
    if (bar) bar.style.transition = ''; // pause progress
  });
  toastEl.addEventListener('mouseleave', () => {
    // resume with remaining time (simple approach: remove after small delay)
    // For simplicity we remove after 800ms when leaving; adjust if you want precise remaining time logic
    setTimeout(() => removeToast(toastEl), 800);
    if (bar) {
      // restart a short finish transition to hide
      bar.style.transition = `transform 800ms linear`;
      requestAnimationFrame(() => { bar.style.transform = 'scaleX(0)'; });
    }
  });
}

function removeToast(el) {
  if (!el) return;
  el.style.opacity = '0';
  el.style.transform = 'translateY(-6px) scale(.96)';
  setTimeout(() => el.remove(), 260);
}



const modalBackdrop = document.getElementById('modalBackdrop');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalClose = document.getElementById('modalClose');

function showModal(title, html, fullscreen = false){
  modalTitle.textContent = title;
  modalBody.innerHTML = html;

  modal.classList.toggle('fullscreen', fullscreen);

  modalBackdrop.style.display = 'flex';
  modalBackdrop.offsetHeight;
  modalBackdrop.classList.add('show');
}
function closeModal(){
  modalBackdrop.classList.remove('show');

  setTimeout(()=>{
    modalBackdrop.style.display = 'none';
    modalBody.innerHTML = '';
    modal.classList.remove('fullscreen');
  }, 200);
}


modalClose.onclick = closeModal;
modalBackdrop.onclick = (e) => { if(e.target === modalBackdrop) closeModal(); };

function setButtonLoading(btn, loading, loadingText = 'Saving...'){
  if(!btn) return;
  if(loading){
    btn.disabled = true;
    btn.dataset._orig = btn.innerHTML;
    btn.innerHTML = loadingText;
  } else {
    btn.disabled = false;
    if(btn.dataset._orig){
      btn.innerHTML = btn.dataset._orig;
      delete btn.dataset._orig;
    }
  }
}

function modalConfirm(title, htmlMessage){
  return new Promise(resolve => {
    showModal(title, `
      <div style="margin-bottom:16px">${htmlMessage}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" id="mcCancel">Cancel</button>
        <button class="btn btn-danger" id="mcOk">Yes</button>
      </div>
    `);

    document.getElementById('mcCancel').onclick = () => {
      closeModal(); resolve(false);
    };
    document.getElementById('mcOk').onclick = () => {
      closeModal(); resolve(true);
    };
  });
}


/* ---------- Audio / unlock logic ---------- */
/*
  Notes:
  - Browsers require a user gesture to allow .play() for audio. We attempt to 'unlock' by quickly playing+pausing the preloaded element
    when the user clicks the audio toggle.
  - We try clapAudioEl first; if it fails we try candidate paths; if all fail we use the synthesized fallback (playClap).
*/

let audioFallbackCtx = null;
function ensureAudioCtx(){ if(!audioFallbackCtx) audioFallbackCtx = new (window.AudioContext || window.webkitAudioContext)(); }

async function tryUnlockAudio() {
  try {
    // Resume audio context if exists
    if (audioFallbackCtx && audioFallbackCtx.state === 'suspended') {
      await audioFallbackCtx.resume();
    }
    if (clapAudioEl) {
      // Attempt quick play/pause to unlock playback
      clapAudioEl.muted = true; // silent attempt
      clapAudioEl.currentTime = 0;
      try {
        await clapAudioEl.play();
        clapAudioEl.pause();
        clapAudioEl.currentTime = 0;
        clapAudioEl.muted = false;
        console.info('Audio element unlocked by user gesture (silent play succeeded).');
        return true;
      } catch (err) {
        clapAudioEl.muted = false;
        console.warn('Silent unlock via clapAudioEl failed:', err);
      }
    }
    return false;
  } catch (e) {
    console.warn('tryUnlockAudio error', e);
    return false;
  }
}

function playClap(count = 10, speed = 0.07, volume = 0.95){
  try{
    ensureAudioCtx();
    const ctx = audioFallbackCtx;
    const now = ctx.currentTime;
    for(let i=0;i<count;i++){
      const t = now + i * speed;
      const bufferSize = Math.floor(ctx.sampleRate * 0.09);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for(let j=0;j<bufferSize;j++){
        data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bufferSize * 0.85)) * (1 - i*0.09);
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1400 - (i * 70);
      band.Q.value = 0.6 + (i * 0.14);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume * (1 - i*0.09), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      src.connect(band);
      band.connect(gain);
      gain.connect(ctx.destination);
      src.start(t);
      src.stop(t + 0.22);
    }
  }catch(e){ console.warn('Audio fallback failed', e); }
}

async function tryPlayCandidates(candidates){
  for(const url of candidates){
    try{
      const a = new Audio(url);
      a.preload = 'auto';
      a.muted = false;
      // Some browsers will still block .play(); catch errors
      await a.play();
      // let it play a short time (or end quickly)
      return true;
    }catch(err){
      // try next candidate
      console.warn('candidate play failed for', url, err);
    }
  }
  return false;
}

async function playAudioFileIfEnabled(path, fallbackFn){
  
  if(!audioEnabled) {
    console.info('Audio disabled by user — skipping playback.');
    return;
  }

  // 1) try preloaded audio element first
  if (clapAudioEl) {
    try {
      clapAudioEl.pause();
      clapAudioEl.currentTime = 0;
      clapAudioEl.muted = false;
      // set a reasonably loud volume but not max
      try { clapAudioEl.volume = 0.95; } catch(e) {}
      await clapAudioEl.play();
      console.info('Played preloaded clapAudio element.');
      return;
    } catch(err) {
      console.warn('Preloaded clapAudio element play failed:', err);
      // fall through to try other options
    }
  }

  // 2) try path candidates (if path provided)
  if (path) {
    const cleaned = String(path).replace(/^\.\//, '').replace(/^\/+/, '');
    const candidates = [cleaned, '/' + cleaned, './' + cleaned];
    try{
      const ok = await tryPlayCandidates(candidates);
      if(ok){
        console.info('Played clap via Audio() candidate path.');
        return;
      }
    }catch(e){
      console.warn('tryPlayCandidates error', e);
    }
  }

  // 3) fallback to synthesized clap
  console.info('Falling back to synth clap.');
  fallbackFn && fallbackFn();

}

/* ---------- Input toggle (unchanged) ---------- */
(function wireInputToggleNow(){
  if(!toggleIdInputBtn || !studentIdInput) return;

  // ensure the toggle button uses primary color (keeps icon colored)
  try {
    toggleIdInputBtn.style.color = 'var(--primary)';
  } catch (e){ /* ignore if CSS var not present */ }

  // find icons inside the button
  const openIcon = toggleIdInputBtn.querySelector('#toggleOpen');
  const closedIcon = toggleIdInputBtn.querySelector('#toggleClosed');

  // initial state: visible (not hidden) -> show open icon, input type text
  let hidden = false;
  studentIdInput.type = 'text';
  if(openIcon) openIcon.style.display = 'inline-block';
  if(closedIcon) closedIcon.style.display = 'none';

  // click handler toggles mask and icon (and keeps button color)
  toggleIdInputBtn.addEventListener('click', () => {
    hidden = !hidden;
    studentIdInput.type = hidden ? 'password' : 'text';

    if(openIcon && closedIcon){
      openIcon.style.display = hidden ? 'none' : 'inline-block';
      closedIcon.style.display = hidden ? 'inline-block' : 'none';
    }

    // keep primary color no matter what (prevents icon going white)
    try { toggleIdInputBtn.style.color = 'var(--primary)'; } catch(e){}
    toggleIdInputBtn.setAttribute('aria-pressed', String(hidden));
  });
})();


function gradeForPercent(p){
  if(p>=97) return 'A+'; if(p>=93) return 'A'; if(p>=90) return 'A-';
  if(p>=87) return 'B+'; if(p>=83) return 'B'; if(p>=80) return 'B-';
  if(p>=77) return 'C+'; if(p>=73) return 'C'; if(p>=70) return 'C-';
  if(p>=67) return 'D+'; if(p>=63) return 'D'; if(p>=60) return 'D-';
  if(p>=50) return 'E+'; if(p>=40) return 'E'; return 'F';
}
function percentColor(p){
  if(p>=95) return '#0b8a3e'; if(p>=90) return '#26a64b'; if(p>=85) return '#8cc63f';
  if(p>=80) return '#f1c40f'; if(p>=75) return '#f39c12'; if(p>=70) return '#e67e22';
  if(p>=60) return '#e74c3c'; return '#c0392b';
}
function gradeColor(g){
  if(g==='A+') return '#0b8a3e'; if(g==='A') return '#26a64b'; if(g==='A-') return '#66d17a';
  if(g.startsWith('B')) return '#3b82f6'; if(g.startsWith('C')) return '#f59e0b'; return '#b91c1c';
}
/* ---------- audio toggle wiring ---------- */
(function wireAudioToggle(){
  if(!audioToggleBtn) return;

  function render(){
    audioToggleBtn.innerHTML = audioEnabled ? '🔊 Audio: ON' : '🔈 Audio: OFF';
    audioToggleBtn.setAttribute('aria-pressed', String(audioEnabled));
  }

  audioToggleBtn.addEventListener('click', async () => {
    audioEnabled = !audioEnabled;
    render();
    if(audioEnabled){
      // try to unlock with a user gesture (important for autoplay policies)
      const unlocked = await tryUnlockAudio();
      console.info('Audio unlocked?', unlocked);
    }
  });
  render();
})();

function twoLineHeaderHTML(label){
  if(!label) return '';
  const parts = String(label).trim().split(/\s+/);
  if(parts.length <= 1) return escapeHtml(label);
  const first = escapeHtml(parts[0]);
  const rest = escapeHtml(parts.slice(1).join(' '));
  return `${first}<br><span class="small">${rest}</span>`;
}
/* ---------- Emoji rain logic (unchanged, but lastEmojiType is set in showCelebration) ---------- */
let emojiIntervalId = null;
function createEmojiBurst(type='celebrate', count=32){
  if(!celebrationFall) return;
  const celebrateSet = ['🎉','⭐','🌟','❤️','🌙','✨','💫','🎊','💥'];
  const sadSet = ['😢','😞','💔','😔','☁️','😓'];
  const set = (type === 'sad') ? sadSet : celebrateSet;
  for(let i=0;i<count;i++){
    const el = document.createElement('span');
    el.className = 'fall-emoji';
    el.textContent = set[Math.floor(Math.random()*set.length)];
    const size = 14 + Math.floor(Math.random()*44);
    el.style.fontSize = `${size}px`;
    el.style.left = (Math.random()*120) + '%';
    el.style.setProperty('--tx', (Math.random()*120 - 60) + 'vw');
    el.style.setProperty('--rot', (Math.random()*1080 - 540) + 'deg');
    const duration = 2400 + Math.random()*5600;
    const delay = Math.random()*900;
    el.style.animationDuration = `${duration}ms`;
    el.style.animationDelay = `${delay}ms`;
    el.style.opacity = `${0.8 + Math.random()*0.2}`;
    celebrationFall.appendChild(el);
    setTimeout(()=>{ try{ el.remove(); }catch(e){} }, duration + delay + 200);
  }
}
function startEmojiRain(type='celebrate'){ stopEmojiRain(); createEmojiBurst(type,48); emojiIntervalId = setInterval(()=> createEmojiBurst(type,36), 700); }
function stopEmojiRain(){ if(emojiIntervalId){ clearInterval(emojiIntervalId); emojiIntervalId=null; } if(celebrationFall) celebrationFall.innerHTML = ''; }

if(toggleEmojisBtn){
  toggleEmojisBtn.addEventListener('click', (e) => {
    emojisVisible = !emojisVisible;
    toggleEmojisBtn.setAttribute('aria-pressed', String(emojisVisible));
    if(emojisVisible){
      startEmojiRain(lastEmojiType || 'celebrate');
      if(toggleEmojisIcon) toggleEmojisIcon.textContent = '🎊';
    } else {
      stopEmojiRain();
      if(toggleEmojisIcon) toggleEmojisIcon.textContent = '🚫';
    }
  });
}

/* ---------- showCelebration (improved audio + emoji logic) ---------- */
function ordinalSuffixSomali(n){ return `${n}aad`; }

function showCelebration({ rankType = 'class', rank = null, total = null, studentName='', className='', totalMarks='', averageStr='', soundPath = 'assets/clap.mp3', percent = null, examLabel = '' } = {}) {
  if(!celebrationOverlay || !celebrationModal) return;
  const rankNum = Number(rank);
  const isFail = (typeof percent === 'number') ? (percent < 50) : false;

  console.info('Attempting to play celebration audio — audioEnabled=', audioEnabled, 'rank=', rankNum);

  // badge color...
  const colors = { 1:'#FFD700', 2:'#C0C0C0', 3:'#CD7F32' };
  const palette = ['#3b82f6','#8b5cf6','#06b6d4','#f97316','#10b981','#ef4444','#f59e0b'];
  const badgeColor = colors[rankNum] || (rankNum >=4 && rankNum <= 10 ? palette[(rankNum-4) % palette.length] : '#6b7280');

  // compute totals/avg...
  const totalParts = String(totalMarks || (total!=null? `${total}/${''}` : '')).split('/');
  const totalGot = totalParts[0] || (total != null ? String(total) : '');
  const totalMax = totalParts[1] || '';
  const avgRaw = averageStr || (typeof percent === 'number' ? `${Number(percent).toFixed(2)}%` : '');

  let gradeText = '';
  try { gradeText = (typeof percent === 'number') ? gradeForPercent(percent) : ''; } catch(e){ gradeText = ''; }
  const passfail = (typeof percent === 'number') ? (percent >= 50 ? 'Gudbay' : 'Dhacay') : '';

  // DOM nodes (structured fields)
  const modalBadgeEl = document.getElementById('modalBadge');
  const modalTitleEl = document.getElementById('modalTitle');
  const modalMsgEl = document.getElementById('modalMsg');
  const modalStudentName = document.getElementById('modalStudentName');
  const modalClassName = document.getElementById('modalClassName');

  const modalTotalGot = document.getElementById('modalTotalGot');
  const modalTotalMax = document.getElementById('modalTotalMax');
  const modalAverage = document.getElementById('modalAverage');
  const modalGrade = document.getElementById('modalGrade');
  const modalStatus = document.getElementById('modalStatus');

  if(modalBadgeEl){ modalBadgeEl.textContent = Number.isFinite(rankNum) ? String(rankNum) : ''; modalBadgeEl.style.background = badgeColor; modalBadgeEl.classList.add('glow'); }

  if(modalTitleEl){
    if(isFail) modalTitleEl.textContent = `Waan ka xunahay, ${studentName || ''}`;
    else if(Number.isFinite(rankNum) && rankNum >= 1) modalTitleEl.textContent = `Hambalyo! Kaalinta ${ordinalSuffixSomali(rankNum)}`;
    else modalTitleEl.textContent = examLabel ? `Natiijooyinka — ${examLabel}` : 'Natiijooyinka';
  }

  if(modalMsgEl){
    const examPart = examLabel ? ` — Imtixaanka: ${examLabel}` : '';
    modalMsgEl.textContent = isFail
      ? `${studentName || 'Arday'} — Ha quusan — nala soo xiriir si aan kuu caawinno haddii aad qabto dood.${examPart}`
      : `${studentName || 'Arday'} — Soo Dhawoow Arday — waan kuu hambalyeynaynaa!${examPart}`;
    modalMsgEl.style.color = '#2563eb';
  }

  if(modalStudentName) modalStudentName.textContent = studentName || '';
  if(modalClassName) modalClassName.textContent = className || '';

  if(modalTotalGot) { modalTotalGot.textContent = totalGot || ''; modalTotalGot.className = 'total-blue'; }
  if(modalTotalMax) { modalTotalMax.textContent = totalMax || ''; modalTotalMax.className = 'total-green'; }
  if(modalAverage) { modalAverage.textContent = avgRaw; modalAverage.className = (typeof percent === 'number' && percent < 50) ? 'avg-red' : 'avg-green'; }
  if(modalGrade){ modalGrade.textContent = gradeText || ''; modalGrade.className = 'grade-badge'; try { modalGrade.style.background = gradeColor(gradeText) || '#3b82f6'; } catch(e){ modalGrade.style.background = '#3b82f6'; } }
  if(modalStatus){ modalStatus.textContent = passfail || ''; modalStatus.className = (typeof percent === 'number' && percent < 50) ? 'status-fail' : 'status-pass'; }

  // show modal
  celebrationOverlay.classList.add('active');
  celebrationModal.style.display = 'block';
  celebrationModal.classList.remove('pop'); void celebrationModal.offsetWidth; celebrationModal.classList.add('pop');
  celebrationOverlay.setAttribute('aria-hidden','false');

  // emoji rain
  lastEmojiType = isFail ? 'sad' : 'celebrate';
  if(emojisVisible) startEmojiRain(lastEmojiType);

  // Try to unlock audio (best-effort). Then play if audio is enabled and not a fail.
  (async () => {
    try {
      // Try to unlock using earlier user gesture (if any)
      await tryUnlockAudio();
    } catch(e) { /* ignore */ }

    if (!isFail) {
      // Play using preloaded file (or fallback synth) when audioEnabled is true
      playAudioFileIfEnabled(soundPath, () => playClap(6, 0.06, 0.85));
    }
  })();


  // close handlers
  function closeSrv(){
    celebrationOverlay.classList.remove('active');
    celebrationModal.style.display = 'none';
    celebrationModal.classList.remove('pop');
    celebrationOverlay.setAttribute('aria-hidden','true');
    stopEmojiRain();
    celebrationOverlay.removeEventListener('click', clickOutside);
    celebrationClose.removeEventListener('click', closeSrv);
    celebrationCloseBtn.removeEventListener('click', closeSrv);
    if(modalBadgeEl) setTimeout(()=> modalBadgeEl.classList.remove('glow'), 300);
  }
  function clickOutside(e){
    if(e.target === celebrationOverlay || e.target.classList.contains('celebration-backdrop')) closeSrv();
  }
  celebrationClose.addEventListener('click', closeSrv);
  celebrationCloseBtn.addEventListener('click', closeSrv);
  celebrationOverlay.addEventListener('click', clickOutside);
}

/* ---------- renderResult (keeps your logic) with visual tweaks */
async function renderResult(doc, opts = {}) {
  resultArea.style.display = 'block';
  resultArea.innerHTML = '';

  const published = doc.publishedAt ? new Date(doc.publishedAt.seconds ? doc.publishedAt.seconds * 1000 : doc.publishedAt).toLocaleString() : '';
  const examName = doc.examName || doc.examId || '';

  let compsEnabled = doc.components || null;
  if(!compsEnabled){
    compsEnabled = { assignment:false, quiz:false, monthly:false, cw1:false, cw2:false, exam:false };
    if(Array.isArray(doc.subjects)) for(const s of doc.subjects){
      const c = s.components||{};
      if(c.assignment) compsEnabled.assignment = true;
      if(c.quiz) compsEnabled.quiz = true;
      if(c.monthly) compsEnabled.monthly = true;
      if(c.cw1) compsEnabled.cw1 = true;
      if(c.cw2) compsEnabled.cw2 = true;
      if(c.exam) compsEnabled.exam = true;
    }
  }
  
  const hasLinked = Boolean(doc.linkedExamName) || Boolean(doc.linkedExamId) || (Array.isArray(doc.subjects) && doc.subjects.some(s => s.components && s.components.linked));
  let tableHtml = `<div class="card"><div style="overflow:auto"><table><thead><tr><th>Subject</th>`;
  if(hasLinked) tableHtml += `<th>${twoLineHeaderHTML(doc.linkedExamName || 'Prev')}</th>`;
  if(compsEnabled.assignment) tableHtml += `<th>Assignment</th>`;
  if(compsEnabled.quiz) tableHtml += `<th>Quiz</th>`;
  if(compsEnabled.monthly) tableHtml += `<th>Monthly</th>`;
  if(compsEnabled.cw1) tableHtml += `<th>CW1</th>`;
  if(compsEnabled.cw2) tableHtml += `<th>CW2</th>`;
  if(compsEnabled.exam) tableHtml += `<th>${twoLineHeaderHTML(examName || 'Exam')}</th>`;
  
  tableHtml += `<th>Total</th><th>Max</th></tr></thead><tbody>`;

  let totGot = 0, totMax = 0;
  if(doc.subjects && Array.isArray(doc.subjects)){
    for(const s of doc.subjects){
      const comps = s.components || {};
      const combinedMark = typeof s.mark !== 'undefined' ? Number(s.mark) : Number(s.total || 0);
      let componentSum = 0;
      if(typeof s.mark === 'undefined'){
        if(comps.assignment != null) componentSum += Number(comps.assignment); else if(s.assignment != null) componentSum += Number(s.assignment);
        if(comps.quiz != null) componentSum += Number(comps.quiz); else if(s.quiz != null) componentSum += Number(s.quiz);
        if(comps.monthly != null) componentSum += Number(comps.monthly); else if(s.monthly != null) componentSum += Number(s.monthly);
        if(comps.cw1 != null) componentSum += Number(comps.cw1); else if(s.cw1 != null) componentSum += Number(s.cw1);
        if(comps.cw2 != null) componentSum += Number(comps.cw2); else if(s.cw2 != null) componentSum += Number(s.cw2);
        if(comps.exam != null) componentSum += Number(comps.exam); else if(s.exam != null) componentSum += Number(s.exam);
        
      }
      const rowTotal = (typeof s.mark !== 'undefined') ? combinedMark : componentSum;
      const rowMax = Number(s.max || 0);

      tableHtml += `<tr><td>${escapeHtml(s.name)}</td>`;
      if(hasLinked){
        const prevVal = (s.components && s.components.linked && (typeof s.components.linked.total !== 'undefined')) ? s.components.linked.total : (s.components && typeof s.components.linked === 'number' ? s.components.linked : '-');
        tableHtml += `<td style="text-align:center">${escapeHtml(String(prevVal!=null?prevVal:'-'))}</td>`;
      }
      if(compsEnabled.assignment) tableHtml += `<td style="text-align:center">${escapeHtml(String((comps.assignment!=null)?comps.assignment:(s.assignment!=null? s.assignment: '-')))}</td>`;
if(compsEnabled.quiz) tableHtml += `<td style="text-align:center">${escapeHtml(String((comps.quiz!=null)?comps.quiz:(s.quiz!=null? s.quiz: '-')))}</td>`;
if(compsEnabled.monthly) tableHtml += `<td style="text-align:center">${escapeHtml(String((comps.monthly!=null)?comps.monthly:(s.monthly!=null? s.monthly: '-')))}</td>`;
if(compsEnabled.cw1) tableHtml += `<td style="text-align:center">${escapeHtml(String((comps.cw1!=null)?comps.cw1:(s.cw1!=null? s.cw1: '-')))}</td>`;
if(compsEnabled.cw2) tableHtml += `<td style="text-align:center">${escapeHtml(String((comps.cw2!=null)?comps.cw2:(s.cw2!=null? s.cw2: '-')))}</td>`;
if(compsEnabled.exam) tableHtml += `<td style="text-align:center">${escapeHtml(String((comps.exam!=null)?comps.exam:(s.exam!=null? s.exam: '-')))}</td>`;

      tableHtml += `<td style="text-align:center">${escapeHtml(String(rowTotal))}</td><td style="text-align:center">${escapeHtml(String(rowMax||''))}</td></tr>`;

      totGot += Number(rowTotal||0); totMax += Number(rowMax||0);
    }
  }
  tableHtml += `</tbody></table></div></div>`;

  const total = typeof doc.total !== 'undefined' ? Number(doc.total) : totGot;
  const averageRaw = typeof doc.average !== 'undefined' ? Number(doc.average) : ((doc.subjects && doc.subjects.length) ? (total / doc.subjects.length) : 0);
  const sumMax = totMax;
  const percent = sumMax ? (total / sumMax * 100) : 0;
  const grade = gradeForPercent(percent);
  const passfail = percent >= 50 ? 'Gudbay' : 'Dhacay';
  const percentCol = percentColor(percent);
  const gradeBg = gradeColor(grade);

  const schoolName = 'AL-FATXI PRIMARY AND SECONDARY SCHOOL';
  const studentName = escapeHtml(doc.studentName || 'Magac aan la garanayn');
  const studentIdRaw = escapeHtml(doc.studentId || '');
  const className = escapeHtml(doc.className || doc.classId || '');
  const examLabel = escapeHtml(examName || '');
  const mother = doc.motherName ? escapeHtml(doc.motherName) : '';

  const nameColor = (percent < 50) ? '#0b74ff' : '#0f172a';      // blue when failed per your request
  const averageColor = (percent < 50) ? '#c0392b' : '#0b8a3e';  // red when failed else green
  const totalColor = '#246bff'; // blue for total number
  const maxColor = '#10b981';   // green for max

  const headerHtml = `
    <div class="card">
      <div class="result-school" style="font-weight:900;color:${nameColor}">${schoolName}</div>
      <div class="result-header">
        <div class="student-line">Magaca ardayga: 
          <span class="student-name" style="font-weight:900;color:${nameColor};">${studentName}</span>
        </div>

        <div class="id-class-line">
          ID: <strong id="studentIdText">${studentIdRaw}</strong>
          <button id="maskIdBtn" class="btn" title="Toggle displayed ID" style="padding:6px 8px;margin-left:8px;color:var(--primary);background:transparent;border:1px solid rgba(11,116,255,0.08)">
            <svg id="eyeOpen" class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:none;stroke:currentColor">
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" stroke-width="1.2" fill="none"/>
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.2" fill="none"/>
            </svg>
            <svg id="eyeClosed" class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;stroke:currentColor">
              <path d="M3 3l18 18" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" stroke-width="1.2" fill="none"/>
            </svg>
          </button>

          &nbsp;&nbsp; Class: <strong style="font-weight:900;color:${nameColor}">${className}</strong>
        </div>

        <div class="exam-line">Imtixaanka: <strong style="font-weight:900">${examLabel}</strong></div>
        ${mother ? `<div class="mother-line"><strong>Ina Hooyo:</strong> ${mother}</div>` : ''}
        <div class="published-line">Published: ${escapeHtml(published)}</div>
        <div class="source-line">Source: AL-Fatxi School</div>
      </div>
    </div>`;

  const totalsHtml = `
    <div class="totals-card card">
      <div class="totals-block">
        <div class="tot-line">
          <div>Total: <strong style="color:${totalColor};font-weight:900">${total}</strong> / <span style="color:${maxColor};font-weight:900">${sumMax}</span></div>
          <div>Percent: <strong style="color:${percentCol};font-weight:900">${percent.toFixed(2)}%</strong></div>
          <div>Average: <strong style="color:${averageColor};font-weight:900">${Number(averageRaw).toFixed(2)}</strong></div>
          <div>Grade: <span class="grade-badge" style="background:${gradeBg}">${grade}</span></div>
          <div>Status: <strong id="statusBadge" style="color:#fff;padding:6px 8px;border-radius:8px;font-weight:900;background:${percent>=50? '#0b8a3e':'#c0392b'}">${passfail}</strong></div>
          <div>School rank: <strong id="schoolRankCell">${escapeHtml(String(doc.schoolRank || '/—'))}</strong></div>
          <div>Class rank: <strong id="classRankCell">${escapeHtml(String(doc.classRank || '/—'))}</strong></div>
        </div>
      </div>

      <div class="actions-group" id="actionsGroup">
        <button id="printBtn" class="btn btn-primary" title="Download PDF" style="min-width:170px;font-size:15px">
          <svg class="icon" viewBox="0 0 24 24"><path d="M6 9h12V4H6v5zM6 13h12v-1H6v1zM6 15h12v5H6v-5z" fill="#fff"/></svg> Daabac (PDF)
        </button>

        <button id="moreExamsBtn" class="btn btn-ghost" title="More published exams">More published exams</button>

        <button id="screenshotBtn" class="btn" title="Screenshot (download image)">
          <svg class="icon" viewBox="0 0 24 24"><path d="M4 7h4l1-3h6l1 3h4v11H4z" stroke="currentColor" stroke-width="1.2" fill="none"/></svg> Screenshot
        </button>
      </div>
    </div>`;

  resultArea.innerHTML = headerHtml + tableHtml + totalsHtml;
  hideLoader();

  /* mask ID (display) - unchanged */
  const maskBtn = document.getElementById('maskIdBtn');
  const studentIdText = document.getElementById('studentIdText');
  const eyeOpen = document.getElementById('eyeOpen');
  const eyeClosed = document.getElementById('eyeClosed');
  let masked = true;
  const originalId = studentIdText ? studentIdText.textContent : '';

  function applyMask(){
    if(!studentIdText) return;
    if(masked){
      const s = originalId || '';
      studentIdText.textContent = s.length>3 ? '*'.repeat(Math.max(0,s.length-3)) + s.slice(-3) : '*'.repeat(s.length);
      if(eyeOpen) eyeOpen.style.display='none';
      if(eyeClosed) eyeClosed.style.display='inline-block';
      if(maskBtn) maskBtn.style.color = 'var(--primary)';
    } else {
      studentIdText.textContent = originalId;
      if(eyeOpen) eyeOpen.style.display='inline-block';
      if(eyeClosed) eyeClosed.style.display='none';
      if(maskBtn) maskBtn.style.color = 'var(--primary)';
    }
  }

  if(maskBtn){
    maskBtn.addEventListener('click', ()=>{
      masked = !masked;
      applyMask();
    });
    maskBtn.setAttribute('aria-label','Toggle student ID visibility');
  } else {
    if(studentIdText){
      const fb = document.createElement('button');
      fb.className = 'btn';
      fb.style.padding = '6px 8px';
      fb.style.marginLeft = '8px';
      fb.style.color = 'var(--primary)';
      fb.title = 'Toggle displayed ID';
      fb.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" stroke-width="1.2" fill="none"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>';
      studentIdText.parentNode.appendChild(fb);
      fb.addEventListener('click', ()=>{ masked = !masked; applyMask(); });
    }
  }
  applyMask();

  /* screenshot / pdf / published list logic are unchanged (kept from your original) */
  const screenshotBtn = document.getElementById('screenshotBtn');
  const actionsGroup = document.getElementById('actionsGroup');
  if(screenshotBtn){
    screenshotBtn.onclick = async () => {
      try {
        if(actionsGroup) actionsGroup.style.visibility = 'hidden';
        const el = resultArea;
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        const name = (doc.studentName || doc.studentId || 'result').replace(/\s+/g,'_');
        a.download = `${name}_result.png`; document.body.appendChild(a); a.click(); a.remove();
      } catch (e) {
        console.error('Screenshot failed', e); alert('Screenshot failed — isku day mar kale.');
      } finally {
        if(actionsGroup) actionsGroup.style.visibility = 'visible';
      }
    };
  }

  const printBtn = document.getElementById('printBtn');
  if(printBtn){
    printBtn.onclick = async () => {
      try {
        if(!(window.jspdf && window.jspdf.jsPDF)) throw new Error('jsPDF not available');
        const { jsPDF } = window.jspdf;
        const docPdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        const margin = 20; let y = margin;
        docPdf.setFontSize(18); docPdf.text(schoolName, margin, y); y += 24;
        docPdf.setFontSize(15); docPdf.text(`${doc.studentName || ''}    ID: ${doc.studentId || ''}`, margin, y); y += 20;
        if(mother) { docPdf.setFontSize(13); docPdf.text(`Ina Hooyo: ${mother}`, margin, y); y += 18; }
        docPdf.setFontSize(13); docPdf.text(`Class: ${className}    Exam: ${examLabel}`, margin, y); y += 20;
        docPdf.setFontSize(12); docPdf.text(`Published: ${published}    Source: AL-Fatxi School`, margin, y); y += 20;

        const cols = [];
        cols.push({ header: 'Subject', dataKey: 'subject' });
        if(hasLinked) cols.push({ header: (doc.linkedExamName || 'Prev'), dataKey: 'linked' });
        if(compsEnabled.assignment) cols.push({ header: 'Assignment', dataKey: 'assignment' });
        if(compsEnabled.quiz) cols.push({ header: 'Quiz', dataKey: 'quiz' });
        if(compsEnabled.monthly) cols.push({ header: 'Monthly', dataKey: 'monthly' });
        if(compsEnabled.exam) cols.push({ header: examName, dataKey: 'exam' });
        cols.push({ header: 'Total', dataKey: 'total' }); cols.push({ header: 'Max', dataKey: 'max' });

        const tableData = (doc.subjects||[]).map(s=>{
          const comps = s.components||{};
          const r = { subject: s.name };
          if(hasLinked) r.linked = (s.components && s.components.linked && typeof s.components.linked.total !== 'undefined') ? String(s.components.linked.total) : ((typeof s.components?.linked === 'number')? String(s.components.linked): '-');
          if(compsEnabled.assignment) r.assignment = (comps.assignment!=null)? String(comps.assignment) : (s.assignment!=null? String(s.assignment): '-');
          if(compsEnabled.quiz) r.quiz = (comps.quiz!=null)? String(comps.quiz) : (s.quiz!=null? String(s.quiz): '-');
          if(compsEnabled.monthly) r.monthly = (comps.monthly!=null)? String(comps.monthly) : (s.monthly!=null? String(s.monthly): '-');
          if(compsEnabled.exam) r.exam = (comps.exam!=null)? String(comps.exam) : (s.exam!=null? String(s.exam): '-');
          r.total = (typeof s.mark !== 'undefined') ? String(s.mark) : String(s.total != null ? s.total : ((comps.assignment||0)+(comps.quiz||0)+(comps.monthly||0)+(comps.exam||0)));
          r.max = String(s.max || '');
          return r;
        });

        docPdf.autoTable({
          startY: y,
          head: [cols.map(c=>c.header)],
          body: tableData.map(r => cols.map(c => r[c.dataKey] || '')),
          styles: { fontSize: 12, cellPadding: 6 },
          headStyles: { fillColor: [240,240,240], textColor: [20,20,20], fontStyle: 'bold' },
          margin: { left: margin, right: margin }
        });

        const finalY = docPdf.lastAutoTable ? docPdf.lastAutoTable.finalY + 18 : docPdf.internal.pageSize.getHeight() - 80;
        docPdf.setFontSize(13);
        docPdf.text(`Total: ${total} / ${sumMax}    Percent: ${percent.toFixed(2)}%`, margin, finalY);
        docPdf.text(`Average: ${Number(averageRaw).toFixed(2)}    Grade: ${grade}`, margin, finalY + 18);
        docPdf.text(`Status: ${passfail}`, margin, finalY + 36);
        docPdf.text(`School rank: ${doc.schoolRank || '/—'}    Class rank: ${doc.classRank || '/—'}`, margin, finalY + 54);

        const fname = `${(doc.studentName || doc.studentId || 'result').replace(/\s+/g,'_')}_result.pdf`;
        docPdf.save(fname);
      } catch (e) {
        console.warn('PDF failed, print fallback', e);
        window.print();
      }
    };
  }

  const moreBtn = document.getElementById('moreExamsBtn');
  if(moreBtn) moreBtn.onclick = () => togglePublishedList(doc.studentId);

  // show celebration if rank present — prefer classRank, otherwise schoolRank
  try {
    const classRankNum = Number(doc.classRank);
    const schoolRankNum = Number(doc.schoolRank);
    const totalMarksStr = `${total}/${sumMax}`;
    const avgStr = `${Number(averageRaw).toFixed(2)}%`;
    const soundPath = doc.soundPath || 'assets/clap.mp3';

    if(Number.isFinite(classRankNum) && classRankNum >= 1){
      showCelebration({ rankType:'class', rank: classRankNum, studentName, className, totalMarks: totalMarksStr, averageStr: avgStr, soundPath, percent, examLabel });
    } else if(Number.isFinite(schoolRankNum) && schoolRankNum >= 1){
      showCelebration({ rankType:'school', rank: schoolRankNum, studentName, className, totalMarks: totalMarksStr, averageStr: avgStr, soundPath, percent, examLabel });
    } else if(Number(percent) < 50){
      showCelebration({ rankType:'none', rank: null, studentName, className, totalMarks: totalMarksStr, averageStr: avgStr, soundPath, percent, examLabel });
    }
  } catch(e){ console.warn('celebration check failed', e); }

  if(doc.examId){
    (async ()=>{
      try{
        const qAll = query(collection(db,'examTotals'), where('examId','==', doc.examId));
        const snapAll = await getDocs(qAll);
        const schoolSize = snapAll.size || 0;
        let classSize = 0;
        if(doc.classId){
          snapAll.forEach(d => { const data = d.data(); if(data.classId === doc.classId) classSize++; });
        }
        const schoolRankCell = document.getElementById('schoolRankCell'), classRankCell = document.getElementById('classRankCell');
        if(schoolRankCell) schoolRankCell.textContent = doc.schoolRank && schoolSize ? `${doc.schoolRank} / ${schoolSize}` : (doc.schoolRank ? `${doc.schoolRank}` : '/—');
        if(classRankCell) classRankCell.textContent = doc.classRank && classSize ? `${doc.classRank} / ${classSize}` : (doc.classRank ? `${doc.classRank}` : '/—');
      }catch(e){ console.warn('Rank fetch failed', e); }
    })();
  }
}

/* ---------- togglePublishedList (unchanged) ---------- */
const publishedListState = {};
async function togglePublishedList(studentId){
  if(!studentId) return;
  const key = String(studentId);
  if(!publishedListState[key]) publishedListState[key] = { visible:false, container:null, selectedExamId:null };
  const state = publishedListState[key];
  if(state.visible){
    if(state.container && state.container.parentNode) state.container.parentNode.removeChild(state.container);
    state.visible = false;
    return;
  }
  const container = document.createElement('div');
  container.className = 'card';
  container.style.marginTop = '12px';
  container.innerHTML = `<div style="padding:10px;color:var(--muted)">Loading…</div>`;
  resultArea.appendChild(container);
  state.container = container; state.visible = true;
  try{
    const q = query(collection(db,'examTotals'), where('studentId','==', studentId));
    const snap = await getDocs(q);
    const arr = [];
    snap.forEach(d=> arr.push(d.data()));
    if(arr.length === 0){ container.innerHTML = '<div style="padding:10px;color:var(--muted)">No published exams found.</div>'; return; }
    arr.sort((a,b)=> (b.publishedAt?.seconds||0) - (a.publishedAt?.seconds||0));
    const html = arr.map(a => {
      const dateText = a.publishedAt ? new Date(a.publishedAt.seconds*1000).toLocaleDateString() : '';
      return `<div style="padding:8px;border-bottom:1px solid #eef2f7"><button class="pubBtn" data-id="${escapeHtml(a.examId)}" style="background:none;border:0;font-weight:800">${escapeHtml(a.examName||a.examId||'(exam)')}</button><span style="float:right;color:var(--muted)">${escapeHtml(dateText)}</span></div>`;
    }).join('');
    container.innerHTML = html;
    container.querySelectorAll('.pubBtn').forEach(b => {
      b.onclick = async () => {
        const exId = b.dataset.id;
        const snap = await getDoc(doc(db,'examTotals', `${exId}_${studentId}`));
        if(!snap.exists()) return alert('Not found');
        renderResult(snap.data(), { source: 'examTotals' });
      };
    });
  }catch(err){
    console.error(err);
    container.innerHTML = `<div style="padding:10px;color:#c0392b">Khalad ayaa dhacay, fadlan isku day mar kale.</div>`;
  }
}

/* ---------- fallback ----- */
async function fallbackFindLatestExamTotal(studentId){
  try{
    const q = query(collection(db,'examTotals'), where('studentId','==', studentId));
    const snap = await getDocs(q);
    const arr = [];
    snap.forEach(d => arr.push(d.data()));
    if(arr.length === 0) return null;
    arr.sort((a,b)=> (b.publishedAt?.seconds||0) - (a.publishedAt?.seconds||0));
    return arr[0];
  }catch(e){ console.error(e); return null; }
}

// after you call renderResult(alt, ... ) or renderResult(latest, ...)
// call this helper to update header
async function setHeaderStudentNameById(studentId){
  try {
    const snap = await getDoc(doc(db,'students', studentId));
    if(snap.exists()){
      const d = snap.data();
      const name = d.name || d.studentName || d.fullName || '';
      const tag = document.getElementById('studentTag');
      if(tag && name) tag.textContent = `— ${name}`;
    }
  } catch(e){ console.warn('setHeaderStudentNameById failed', e); }
}


/* ---------- helpers required by transactions view (updated) ---------- */

/** Format month label. Accepts:
 *  - "1-2026" or "01-2026" -> "Jan-2026"
 *  - "2026-01" or ISO -> "Jan-2026"
 *  - Date string -> formatted month-year
 *  - otherwise returns original string
 */
function formatMonthLabel(m) {
  if (!m && m !== 0) return '';
  const s = String(m).trim();
  // pattern: 1-2026 or 01-2026
  const mm1 = s.match(/^(\d{1,2})-(\d{4})$/);
  if (mm1) {
    const mon = Number(mm1[1]);
    const yr = mm1[2];
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return (mon >=1 && mon <=12) ? `${names[mon-1]}-${yr}` : s;
  }
  // pattern: 2026-01
  const mm2 = s.match(/^(\d{4})-(\d{1,2})$/);
  if (mm2) {
    const yr = mm2[1], mon = Number(mm2[2]);
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return (mon >=1 && mon <=12) ? `${names[mon-1]}-${yr}` : s;
  }
  // try Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${names[d.getMonth()]}-${d.getFullYear()}`;
  }
  return s;
}

/** Download CSV helper (rows: array of arrays) */
function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(cell => {
    if (cell == null) return '';
    const s = String(cell);
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Export transactions to PDF using jsPDF+autoTable if available, otherwise returns false
 *  meta: object with keys to print at top (e.g. { 'Student Name': 'Ali', 'Student ID': 'S001', 'Class': '5A' })
 *  totals: object with totals to print under the table
 */
async function exportTransactionsToPDF(filename, columns, rows, meta = {}, totals = {}) {
  try {
    if (!(window.jspdf && window.jspdf.jsPDF)) return false;
    const { jsPDF } = window.jspdf;
    const docPdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    const margin = 20;
    let y = margin;
    docPdf.setFontSize(14);
    docPdf.text('Transactions', margin, y); y += 18;

    // print meta (Student name, ID, class)
    docPdf.setFontSize(11);
    Object.keys(meta).forEach(k => {
      docPdf.text(`${k}: ${meta[k]}`, margin, y);
      y += 14;
    });
    y += 6;

    // build body for autoTable
    docPdf.autoTable({
      startY: y,
      head: [columns],
      body: rows,
      styles: { fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [240,240,240], textColor: [20,20,20], fontStyle: 'bold' },
      margin: { left: margin, right: margin }
    });

    const afterTableY = docPdf.lastAutoTable ? docPdf.lastAutoTable.finalY + 12 : docPdf.internal.pageSize.getHeight() - 80;
    docPdf.setFontSize(11);

    // print totals below the table
    Object.keys(totals).forEach((k) => {
      docPdf.text(`${k}: ${totals[k]}`, margin, afterTableY + 14 * (Object.keys(totals).indexOf(k) + 1));
    });

    docPdf.save(filename);
    return true;
  } catch(e) {
    console.warn('PDF export failed', e);
    return false;
  }
}

/* ---------- Updated renderStudentTransactionsModal (desktop table + mobile cards + exports + totals + Reesto Hore) ---------- */

async function renderStudentTransactionsModal(studentId){
  try{
    showLoader && showLoader();

    // fetch student info (best-effort)
    let student = null;
    try {
      const sSnap = await getDoc(doc(db,'students', studentId));
      if(sSnap.exists()) student = sSnap.data();
    } catch(e){ console.warn('student lookup failed', e); }

    // load transactions
    const q = query(collection(db,'transactions'), where('target_type','==','student'), where('target_id','==', studentId));
    const snap = await getDocs(q);
    const txs = snap.docs.map(d=> ({ id:d.id, ...d.data() })).sort((a,b)=> (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));

    // compute totals
    const totalMonthlyPaid = txs.filter(t => (t.type === 'monthly') && !t.is_deleted).reduce((s,t) => s + (t.amount_cents || 0), 0);
    const totalAllPaid = txs.filter(t => (t.type !== 'adjustment' && !t.is_deleted)).reduce((s,t) => s + (t.amount_cents || 0), 0);
    const totalReesto = txs.filter(t => (t.type === 'adjustment' || t.type === 'adjust') && !t.is_deleted).reduce((s,t) => s + (t.amount_cents || 0), 0);
    const currentBalance = (student && (typeof student.balance_cents !== 'undefined')) ? student.balance_cents : null;

    // small inline CSS for mobile cards + badges and theme variables
    const css = `
      <style>
        :root {
          --tx-badge-pay: #16a34a;
          --tx-badge-reesto: #0b6bd6;
          --tx-bg-card: #ffffff;
          --tx-text: #0f172a;
          --tx-muted: #6b7280;
          --tx-btn: #0b74ff;
        }
        .tx-header { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
        .tx-actions { display:flex; gap:8px; align-items:center; }
        .tx-btn { background:var(--tx-btn); color:#fff; border:0; padding:8px 10px; border-radius:8px; font-weight:700; cursor:pointer }
        .tx-btn.ghost { background:transparent; color:var(--tx-text); border:1px solid rgba(0,0,0,0.06); font-weight:600 }
        .tx-summary { text-align:right; min-width:180px; }
        table.tx-table { width:100%; border-collapse:collapse; font-size:14px; background:transparent; color:var(--tx-text) }
        table.tx-table thead th { text-align:left; padding:10px 8px; color:var(--tx-muted); font-weight:700; }
        table.tx-table tbody td { padding:10px 8px; vertical-align:top; border-bottom:1px solid #f1f5f9; }
        .badge-pay { background: rgba(16,163,127,0.08); color: var(--tx-badge-pay); padding:4px 8px; border-radius:999px; font-weight:700; display:inline-block }
        .badge-reesto { background: rgba(11,107,214,0.08); color: var(--tx-badge-reesto); padding:4px 8px; border-radius:999px; font-weight:700; display:inline-block }
        .tx-cards { display:none; gap:10px; }
        .tx-card { border-radius:12px; box-shadow:0 6px 18px rgba(2,6,23,0.06); padding:10px; display:flex; gap:10px; align-items:flex-start; background:var(--tx-bg-card); }
        .tx-card .left { flex:0 0 46px; display:flex; align-items:center; justify-content:center; }
        .tx-card .content { flex:1; }
        .tx-card .row { display:flex; justify-content:space-between; gap:8px; align-items:center; }
        .tx-card .muted { color:var(--tx-muted); font-size:12px; }
        .meta-line { font-size:13px; color:var(--tx-muted); }
        @media (max-width:720px){
          table.tx-table { display:none; }
          .tx-cards { display:flex; flex-direction:column; }
          .tx-summary { text-align:left; width:100%; margin-top:8px; }
          .tx-header { align-items:flex-start; }
          .tx-actions { order:2; width:100%; justify-content:flex-start; }
        }
      </style>
    `;

    // header + summary (inline card)
    const name = (student && (student.fullName || student.name || student.studentName)) ? escapeHtml(student.fullName || student.name || student.studentName) : escapeHtml(studentId);
    const className = student ? escapeHtml(student.className || student.classId || '') : '';

    // header HTML w/ export & print buttons
    let html = `${css}<div class="card"><div class="tx-header">
      <div>
        <div style="font-weight:900">${name}</div>
        <div class="meta-line">ID: ${escapeHtml(studentId)} ${className ? ' • Class: ' + className : ''}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end">
        <div class="tx-summary">
          <div style="font-weight:800">Total monthly paid: <span style="color:var(--tx-badge-pay)">${c2p(totalMonthlyPaid)}</span></div>
          <div style="font-weight:700">Total all paid: <span style="color:var(--tx-badge-pay)">${c2p(totalAllPaid)}</span></div>
          <div style="font-weight:700">Reesto Hore: <span style="color:var(--tx-badge-reesto)">${c2p(totalReesto)}</span></div>
          <div style="font-weight:700">Current balance: <span style="color:#ef4444">${currentBalance===null? '—' : c2p(currentBalance)}</span></div>
        </div>
        <div class="tx-actions" style="margin-top:8px">
          <button id="exportCsvBtn" class="tx-btn">⬇ CSV</button>
          <button id="exportPdfBtn" class="tx-btn ghost" title="Export PDF">📄 PDF</button>
          <button id="printBtn" class="tx-btn ghost" title="Print" style="padding:8px 10px" onclick="window.print()">🖨 Print</button>
        </div>
      </div>
    </div></div>`;

    // table header (no "By" column) and rows
    html += `<div class="card" style="margin-top:10px;overflow:auto">
      <table class="tx-table"><thead><tr>
        <th>Date</th><th>Type</th><th>Months</th><th style="text-align:right">Amount</th><th>Method</th><th>Note</th>
      </tr></thead><tbody>`;

    // export rows: start with meta rows (student info)
    const exportRows = [];
    exportRows.push(['Student Name', name]);
    exportRows.push(['Student ID', studentId]);
    exportRows.push(['Class', className || '']);
    exportRows.push([]); // blank line
    exportRows.push(['Date','Type','Months','Amount','Method','Note']); // header

    // build mobile card markup container
    let cardsHtml = `<div class="tx-cards" style="margin-top:10px">`;

    for(const tx of txs){
      if(tx.is_deleted) continue; // hide soft-deleted
      const d = tx.createdAt ? new Date(tx.createdAt.seconds * 1000) : null;
      const date = d ? d.toLocaleString() : (tx.date || '');
      const typeRaw = String(tx.type || '');
      // display label: if adjustment -> Reesto Hore
      const typeLabel = (typeRaw === 'adjustment' || typeRaw === 'adjust') ? 'Reesto Hore' : (typeRaw || '');
      const typeEsc = escapeHtml(typeLabel);

      // months may be array or single
      let monthsLabel = '';
      if (tx.related_months && Array.isArray(tx.related_months) && tx.related_months.length) {
        monthsLabel = tx.related_months.map(m => formatMonthLabel(m)).join(', ');
      } else if (tx.related_month) {
        monthsLabel = formatMonthLabel(tx.related_month);
      } else {
        monthsLabel = '';
      }
      const amount = c2p(tx.amount_cents || 0);
      const method = escapeHtml((tx.payment_method || '') + (tx.mobile_provider ? (' / ' + tx.mobile_provider) : ''));
      const note = escapeHtml(tx.note || '');

      // badge & classes: use Reesto label for adjustment
      const badgeHtml = (typeRaw === 'adjustment' || typeRaw === 'adjust')
        ? `<span class="badge-reesto">Reesto Hore</span>`
        : `<span class="badge-pay">${escapeHtml(typeRaw || 'Payment')}</span>`;

      html += `<tr>
        <td style="padding:8px;white-space:nowrap">${escapeHtml(date)}</td>
        <td style="padding:8px">${badgeHtml}</td>
        <td style="padding:8px;white-space:nowrap">${escapeHtml(monthsLabel)}</td>
        <td style="padding:8px;text-align:right">${amount}</td>
        <td style="padding:8px;white-space:nowrap">${method}</td>
        <td style="padding:8px">${note}</td>
      </tr>`;

      // export row (plain values)
      exportRows.push([date, typeLabel, monthsLabel, amount, method, note]);

      // mobile card for this tx (inline SVG icons)
      const iconPay = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 7h16v10H4z" stroke="#16a34a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 12h8" stroke="#16a34a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const iconReesto = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5v14M5 12h14" stroke="#0b6bd6" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const iconHtml = (typeRaw === 'adjustment' || typeRaw === 'adjust') ? iconReesto : iconPay;

      cardsHtml += `<div class="tx-card">
        <div class="left">${iconHtml}</div>
        <div class="content">
          <div class="row"><div style="font-weight:800">${escapeHtml(date)}</div><div style="font-weight:900;color:${typeRaw==='adjustment' ? 'var(--tx-badge-reesto)':'var(--tx-badge-pay)'}">${amount}</div></div>
          <div class="muted" style="margin-top:6px">${typeEsc}${monthsLabel ? ' • ' + monthsLabel : ''}${method ? ' • ' + method : ''}</div>
          <div style="margin-top:8px">${note}</div>
        </div>
      </div>`;
    }

    // totals rows in export (blank line then totals)
    exportRows.push([]);
    exportRows.push(['Totals', '', 'Total monthly paid', c2p(totalMonthlyPaid), '', '']);
    exportRows.push(['Totals', '', 'Total all paid', c2p(totalAllPaid), '', '']);
    exportRows.push(['Totals', '', 'Reesto Hore', c2p(totalReesto), '', '']);
    exportRows.push(['Totals', '', 'Current balance', currentBalance===null? '—' : c2p(currentBalance), '', '']);

    html += `</tbody></table>${cardsHtml}</div>`; // close cards container in string
    html += `</div>`; // close outer card div

    // render into resultArea (clear previous)
    resultArea.style.display = 'block';
    resultArea.innerHTML = html;
    hideLoader && hideLoader();
    try { resultArea.scrollIntoView({ behavior: 'smooth' }); } catch(e){}

    // wire export buttons
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    const printBtn = document.getElementById('printBtn');

    exportCsvBtn && (exportCsvBtn.onclick = () => {
      try {
        const safeName = (student && (student.fullName||student.name)) ? (student.fullName||student.name).replace(/\s+/g,'_') : studentId;
        const fname = `${safeName}_transactions.csv`;
        downloadCSV(fname, exportRows);
        toast && toast('CSV downloaded');
      } catch(e) { console.warn('CSV export failed', e); toast && toast('CSV export failed'); }
    });

    exportPdfBtn && (exportPdfBtn.onclick = async () => {
      try {
        const safeName = (student && (student.fullName||student.name)) ? (student.fullName||student.name).replace(/\s+/g,'_') : studentId;
        const fname = `${safeName}_transactions.pdf`;
        const cols = ['Date','Type','Months','Amount','Method','Note'];
        // meta and totals for PDF (plain strings)
        const meta = { 'Student Name': name, 'Student ID': studentId, 'Class': className || '' };
        const totals = {
          'Total monthly paid': c2p(totalMonthlyPaid),
          'Total all paid': c2p(totalAllPaid),
          'Reesto Hore': c2p(totalReesto),
          'Current balance': (currentBalance===null? '—' : c2p(currentBalance))
        };
        // rows for PDF body: take exportRows, remove first meta lines and blank
        const bodyRows = exportRows.slice(4, exportRows.length - 5); // between header and totals
        // bodyRows contains arrays; pass to PDF exporter
        const ok = await exportTransactionsToPDF(fname, cols, bodyRows, meta, totals);
        if (!ok) {
          // fallback to CSV
          downloadCSV(fname.replace(/\.pdf$/,'') + '.csv', exportRows);
          toast && toast('PDF export not available — downloaded CSV instead');
        } else {
          toast && toast('PDF downloaded');
        }
      } catch(e) {
        console.warn('PDF export failed fallback to CSV', e);
        downloadCSV(`${studentId}_transactions.csv`, exportRows);
        toast && toast('Export failed — CSV saved');
      }
    });

    printBtn && (printBtn.onclick = () => { try { window.print(); } catch(e){ console.warn(e); } });

  }catch(err){
    console.error('renderStudentTransactionsModal failed', err);
    hideLoader && hideLoader();
    message.textContent = 'Ma la soo bixi karo macluumaadka lacagaha. Fadlan isku day mar kale.';
    toast && toast('Failed to load transactions');
    throw err;
  }
}


// Replace your existing renderStudentAttendanceModal with this function.
async function renderStudentAttendanceModal(studentId){
  // small helpers
  function escapeHtml(s){ if(!s && s!==0) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function computePercentFromFlags(flags){ if(!Array.isArray(flags)||flags.length===0) return 0; const present = flags.reduce((s,f)=>s + (f?1:0),0); return Math.round((present/flags.length)*100); }
  function attendanceMessageForPercent(pct, name){
    if(pct >= 100) return `<div style="padding:10px;border-radius:8px;background:#ecfdf5;color:#065f46">Congratulations, ${escapeHtml(name)}! Perfect attendance (${pct}%).</div>`;
    if(pct >= 90) return `<div style="padding:10px;border-radius:8px;background:#ecfeff;color:#036666">Great job — excellent attendance (${pct}%).</div>`;
    if(pct >= 80) return `<div style="padding:10px;border-radius:8px;background:#fff7ed;color:#92400e">Good — aim for 90%+ (${pct}%).</div>`;
    if(pct >= 50) return `<div style="padding:10px;border-radius:8px;background:#fff1f2;color:#9f1239">Warning — your attendance is low (${pct}%). Please contact the school office.</div>`;
    return `<div style="padding:10px;border-radius:8px;background:#fee2e2;color:#7f1d1d">Danger — very low attendance (${pct}%). Contact administration immediately.</div>`;
  }

  // canvas pie generator (returns dataURL)
  function createPieDataUrl(presentPct, size = 180){
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const W = size * dpr;
    const H = size * dpr;
    const cx = W/2, cy = H/2, r = Math.min(W,H)/2 - 6*dpr;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);

    // base ring (light grey)
    g.beginPath();
    g.arc(size/2, size/2, r/dpr, 0, Math.PI*2);
    g.fillStyle = '#f3f4f6';
    g.fill();

    if(!Number.isFinite(presentPct) || presentPct <= 0){
      // no data -> black circle center to show 0%
      g.beginPath();
      g.arc(size/2, size/2, (r/dpr)*0.88, 0, Math.PI*2);
      g.fillStyle = '#111'; // black inner
      g.fill();
    } else if(presentPct >= 100){
      // full present -> full blue circle
      g.beginPath();
      g.arc(size/2, size/2, (r/dpr)*0.88, 0, Math.PI*2);
      g.fillStyle = '#0ea5e9'; // blue
      g.fill();
    } else {
      // draw absent (red) full inner, then draw present arc (blue) on top
      // draw full inner as red (absent) proportion
      g.beginPath();
      g.arc(size/2, size/2, (r/dpr)*0.88, 0, Math.PI*2);
      g.fillStyle = '#ef4444'; // red for absent base
      g.fill();

      const start = -Math.PI/2; // top
      const sweep = (presentPct/100) * Math.PI * 2;
      const end = start + sweep;

      // draw present arc (blue)
      g.beginPath();
      g.moveTo(size/2, size/2);
      g.arc(size/2, size/2, (r/dpr)*0.88, start, end, false);
      g.closePath();
      g.fillStyle = '#0ea5e9';
      g.fill();
    }

    // draw inner donut to make ring look nicer (white center)
    g.beginPath();
    g.arc(size/2, size/2, (r/dpr)*0.6, 0, Math.PI*2);
    g.fillStyle = 'rgba(255,255,255,0.98)';
    g.fill();

    // text percent
    g.font = `${14 * (dpr)}px sans-serif`;
    g.fillStyle = '#0f1724';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`${Math.round(presentPct||0)}%`, size/2, size/2);

    return c.toDataURL('image/png');
  }

  // render helpers
  function showHtml(html){
    if(typeof resultArea !== 'undefined' && resultArea){
      resultArea.style.display = 'block';
      resultArea.innerHTML = html;
      try{ resultArea.scrollIntoView({ behavior:'smooth' }); }catch(e){}
    } else {
      showModal(`Attendance • ${escapeHtml(studentNameForHdr)}`, html);
    }
  }

  // loaders if present
  try { if(typeof showLoader === 'function') showLoader(); } catch(e){}

  try {
    // 1) load student
    let student = null;
    try {
      const sSnap = await getDoc(doc(db,'students', studentId));
      if(sSnap && sSnap.exists()) student = { id: sSnap.id, ...sSnap.data() };
    } catch(e){ console.warn('student lookup failed', e); }
    const studentNameForHdr = (student && (student.fullName || student.name)) ? (student.fullName || student.name) : studentId;
    const studentClassName = student ? (student.classId || student.class || student.className || '') : '';

    // 2) class doc subjects
    let classSubjectsList = [];
    try {
      if(studentClassName){
        const classesSnap = await getDocs(collection(db,'classes'));
        classesSnap.forEach(snap => {
          const d = snap.data();
          if(String(d.name) === String(studentClassName) || snap.id === String(studentClassName)) {
            if(Array.isArray(d.subjects)) classSubjectsList = d.subjects.slice();
          }
        });
      }
    } catch(e){ console.warn('class read failed', e); }

    // 3) subjects map
    const subjectsMap = {};
    try {
      const subsSnap = await getDocs(collection(db,'subjects'));
      subsSnap.forEach(snap => {
        const d = snap.data();
        subjectsMap[snap.id] = d.name || d.title || snap.id;
        if(d.name) subjectsMap[d.name] = d.name;
      });
    } catch(e){ /* ignore */ }

    // 4) structured records
    const structuredEntries = [];
    try {
      const recSnap = await getDocs(collection(db,'attendance_records'));
      recSnap.forEach(snap => {
        const r = snap.data();
        if(studentClassName && r.class_id && String(r.class_id) !== String(studentClassName)) return;
        if(!Array.isArray(r.entries)) return;
        r.entries.forEach(e => {
          if(String(e.studentId) === String(studentId)){
            const percent = (typeof e.percent !== 'undefined') ? e.percent : computePercentFromFlags(e.flags || []);
            structuredEntries.push({
              source:'record',
              recordId:snap.id,
              date: r.date || '',
              class: r.class_id || '',
              subject: r.subject_id || r.subject || '',
              periods: r.periods_count || r.periods || (e.flags ? e.flags.length : 0),
              flags: e.flags || [],
              present_count: (typeof e.present_count !== 'undefined') ? e.present_count : (e.flags ? e.flags.reduce((s,f)=>s + (f?1:0),0) : 0),
              percent
            });
          }
        });
      });
    } catch(e){ console.warn('attendance_records read failed', e); }

    // 5) legacy attendance
    const legacyRecs = [];
    try {
      const q1 = query(collection(db,'attendance'), where('studentId','==', studentId));
      const snap1 = await getDocs(q1);
      snap1.forEach(d => legacyRecs.push({ id:d.id, ...d.data() }));
    } catch(e){ /* ignore */ }
    try {
      const q2 = query(collection(db,'attendance'), where('student_id','==', studentId));
      const snap2 = await getDocs(q2);
      snap2.forEach(d => legacyRecs.push({ id:d.id, ...d.data() }));
    } catch(e){ /* ignore */ }

    const normalizedLegacy = legacyRecs.map(r => {
      const st = (r.status || r.attendance || '').toString().toLowerCase();
      const present = (st === 'present' || st === 'p' || st === '1' || st === 'true');
      return {
        source:'legacy',
        id: r.id,
        date: r.date || (r.createdAt ? (r.createdAt.seconds ? new Date(r.createdAt.seconds*1000).toISOString().slice(0,10) : new Date(r.createdAt).toISOString().slice(0,10)) : ''),
        class: r.class_id || r.class || '',
        subject: r.subject || r.subject_id || '',
        status: present ? 'present' : (st ? st : 'absent'),
        note: r.note || ''
      };
    });

    // combine and sort by date (desc)
    const combined = [...structuredEntries, ...normalizedLegacy];
    combined.sort((a,b) => (b.date||'').localeCompare(a.date||''));

    // build subject set
    const subjSet = new Set();
    if(Array.isArray(classSubjectsList) && classSubjectsList.length) classSubjectsList.forEach(s=> subjSet.add(String(s)));
    combined.forEach(r => { if(r.subject) subjSet.add(String(r.subject)); });
    const availableSubjects = Array.from(subjSet).map(s => ({ id: s, label: subjectsMap[s] || s }));

    // compute totals by subject filter
    function computeTotals(filterSubject){
      let totalPeriods = 0, totalPresent = 0;
      normalizedLegacy.forEach(r => {
        if(filterSubject && String(r.subject) !== String(filterSubject)) return;
        totalPeriods += 1;
        const st = (r.status||'').toString().toLowerCase();
        if(st === 'present' || st === 'p') totalPresent += 1;
      });
      structuredEntries.forEach(r => {
        if(filterSubject && String(r.subject) !== String(filterSubject)) return;
        totalPeriods += (r.periods || 0);
        totalPresent += (r.present_count || 0);
      });
      const totalAbsent = Math.max(0, totalPeriods - totalPresent);
      const pct = totalPeriods ? Math.round((totalPresent/totalPeriods)*100) : 0;
      return { totalPeriods, totalPresent, totalAbsent, percent: pct };
    }

    // initial selected subject
    let selectedSubject = '';

    // function to render UI and attach handlers
    function renderUI(){
      const totals = computeTotals(selectedSubject);
      const pieDataUrl = createPieDataUrl(totals.percent, 180);
      const subjOptionsHtml = `<option value="">All subjects</option>` + availableSubjects.map(s => `<option value="${escapeHtml(s.id)}"${s.id === selectedSubject ? ' selected' : ''}>${escapeHtml(s.label)}</option>`).join('');

      const rowsHtml = combined.filter(r => {
        if(selectedSubject && String(r.subject) !== String(selectedSubject)) return false;
        return true;
      }).map(r => {
        const subjLabel = subjectsMap[r.subject] || r.subject || '';
        const details = r.source === 'legacy' ? `${escapeHtml(r.status || '')}${r.note ? ' • ' + escapeHtml(r.note) : ''}` : `Present ${r.present_count}/${r.periods || 0} • ${r.percent || 0}%`;
        return `<tr style="border-bottom:1px solid #f1f5f9">
          <td style="padding:8px;white-space:nowrap">${escapeHtml(r.date||'')}</td>
          <td style="padding:8px">${escapeHtml(r.class||'')}</td>
          <td style="padding:8px">${escapeHtml(subjLabel)}</td>
          <td style="padding:8px">${details}</td>
        </tr>`;
      }).join('');

      let tableSection = '';
      if(rowsHtml.length === 0) {
        tableSection = `<div class="card"><div class="muted">No attendance records for this filter.</div></div>`;
      } else {
        tableSection = `<div class="card" style="overflow:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="text-align:left"><th style="padding:8px">Date</th><th style="padding:8px">Class</th><th style="padding:8px">Subject</th><th style="padding:8px">Details</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>`;
      }

      const html = `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
            <div>
              <div style="font-weight:900;font-size:1.05rem">${escapeHtml(studentNameForHdr)}</div>
              <div class="muted">ID: ${escapeHtml(studentId)} ${studentClassName ? ' • Class: ' + escapeHtml(studentClassName) : ''}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <select id="studentSubjFilter" style="padding:8px;border-radius:8px;border:1px solid #e6eef8">${subjOptionsHtml}</select>
              <button id="exportPdfBtn" class="btn btn-ghost">Export PDF</button>
            </div>
          </div>
        </div>

        <div class="card" style="display:flex;gap:16px;align-items:center">
          <div style="min-width:160px;text-align:center">
            <img id="pieImg" src="${pieDataUrl}" alt="attendance pie" width="160" height="160" style="border-radius:8px;display:block;margin:0 auto"/>
            <div style="font-weight:800;margin-top:6px">${totals.percent}% Present</div>
          </div>
          <div style="flex:1">
            <div style="display:flex;gap:16px;align-items:center">
              <div><strong>Total periods</strong><div class="muted">${totals.totalPeriods}</div></div>
              <div><strong>Present</strong><div class="muted">${totals.totalPresent}</div></div>
              <div><strong>Absent</strong><div class="muted">${totals.totalAbsent}</div></div>
            </div>
            <div style="margin-top:8px">${attendanceMessageForPercent(totals.percent, studentNameForHdr)}</div>
          </div>
        </div>

        ${tableSection}
      `;
      showHtml(html);

      // attach events AFTER DOM injection
      const subjSelect = (typeof resultArea !== 'undefined' && resultArea) ? resultArea.querySelector('#studentSubjFilter') : modalBody.querySelector('#studentSubjFilter');
      const exportBtn = (typeof resultArea !== 'undefined' && resultArea) ? resultArea.querySelector('#exportPdfBtn') : modalBody.querySelector('#exportPdfBtn');

      if(subjSelect){
        subjSelect.onchange = () => {
          selectedSubject = subjSelect.value || '';
          renderUI(); // re-render entirely (safe and simple)
        };
      }

      if(exportBtn){
        exportBtn.onclick = async () => {
          // prepare rows for PDF (filtered)
          const rows = combined.filter(r => {
            if(selectedSubject && String(r.subject) !== String(selectedSubject)) return false;
            return true;
          }).map(r => {
            const subjLabel = subjectsMap[r.subject] || r.subject || '';
            const details = r.source === 'legacy' ? `${r.status}${r.note ? ' • ' + r.note : ''}` : `Present ${r.present_count}/${r.periods || 0} • ${r.percent || 0}%`;
            return [ r.date || '', r.class || '', subjLabel, details ];
          });

          // create PDF
          try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ unit:'pt', format:'a4' });

            // header
            doc.setFontSize(14);
            doc.text('Attendance Report', 40, 48);
            doc.setFontSize(10);
            doc.text(`Student: ${studentNameForHdr}`, 40, 64);
            doc.text(`ID: ${studentId}`, 40, 78);
            doc.text(`Class: ${studentClassName || '—'}`, 40, 92);
            doc.text(`Subject (filter): ${selectedSubject ? (subjectsMap[selectedSubject] || selectedSubject) : 'All'}`, 40, 106);

            // add pie image (recreate to ensure high quality)
            const totals = computeTotals(selectedSubject);
            const pieData = createPieDataUrl(totals.percent, 240); // bigger for PDF
            const imgProps = doc.getImageProperties(pieData);
            const imgW = 120;
            const imgH = (imgProps.height / imgProps.width) * imgW;
            doc.addImage(pieData, 'PNG', doc.internal.pageSize.getWidth() - imgW - 40, 40, imgW, imgH);

            // add table (autoTable)
            if(rows.length){
              doc.autoTable({
                startY: 140,
                head: [['Date','Class','Subject','Details']],
                body: rows,
                styles: { fontSize: 9 },
                headStyles: { fillColor: [240,240,240], textColor: 20, fontStyle:'bold' },
                theme: 'grid',
                margin: { left: 40, right: 40 }
              });
            } else {
              doc.text('No attendance rows for selected filter.', 40, 160);
            }

            // footer: totals
            const footerY = doc.internal.pageSize.getHeight() - 60;
            doc.setFontSize(10);
            doc.text(`Total periods: ${totals.totalPeriods}   Present: ${totals.totalPresent}   Absent: ${totals.totalAbsent}   (${totals.percent}% present)`, 40, footerY);

            doc.save(`attendance_${studentId}_${selectedSubject || 'all'}.pdf`);
          } catch(err){
            console.error('PDF export failed', err);
            if(typeof toast === 'function') toast('Export failed. See console.');
          }
        };
      }
    } // end renderUI

    // initial render
    renderUI();

    try { if(typeof hideLoader === 'function') hideLoader(); } catch(e){}
    return combined;
  } catch(err){
    console.error('renderStudentAttendanceModal failed', err);
    try { if(typeof hideLoader === 'function') hideLoader(); } catch(e){}
    if(typeof toast === 'function') toast('Failed to load attendance');
    const fallback = `<div class="card"><div class="muted">Ma la soo bixi karo macluumaadka joogitaanka. Fadlan isku day mar kale.</div></div>`;
    if(typeof resultArea !== 'undefined' && resultArea) resultArea.innerHTML = fallback;
    else showModal('Attendance', fallback);
    throw err;
  }
}


/* -----------------------------
  STUDENT: render announcements for the currently found student
  Paste into main.js where you have student object available after login/search.
------------------------------*/
// helper: format cents -> "xx.xx"
// function c2p(cents){
//   const n = Number(cents || 0);
//   if(Number.isNaN(n)) return '0.00';
//   return (n/100).toFixed(2);
// } this function already created  please

function getMonthNameNum(n){
  const m = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return m[(Number(n||0)-1)] || '';
}

// Robust helper: fetchTop10Results(examId) -> returns array of docs (max 10), sorted by total desc
async function fetchTop10Results(examId) {
  try {
    // If Firestore query helpers are available, try server-side ordered query first
    if (typeof query !== 'undefined' && typeof where !== 'undefined' && typeof getDocs !== 'undefined' && typeof collection !== 'undefined' && typeof limit !== 'undefined' && typeof orderBy !== 'undefined') {
      try {
        const q = query(collection(db, 'results'), where('examId','==', examId), orderBy('total','desc'), limit(10));
        const snap = await getDocs(q);
        if (snap && snap.size) return snap.docs;
      } catch(e){
        // ignore and fallback below
        console.warn('server-side results query failed, falling back', e);
      }
    }

    // Fallback 1: examTotals collection (often has aggregated totals per student)
    try {
      const snapTotals = await getDocs(query(collection(db, 'examTotals'), where('examId','==', examId)));
      if (snapTotals && snapTotals.size) {
        // convert to array, choose best sort key available: total -> average -> schoolRank
        const docs = snapTotals.docs.slice();
        docs.sort((a,b) => {
          const A = a.data(), B = b.data();
          const aVal = (typeof A.total !== 'undefined') ? Number(A.total)
                     : (typeof A.average !== 'undefined') ? Number(A.average)
                     : (typeof A.schoolRank !== 'undefined') ? -Number(A.schoolRank) // rank small=better so invert
                     : -Infinity;
          const bVal = (typeof B.total !== 'undefined') ? Number(B.total)
                     : (typeof B.average !== 'undefined') ? Number(B.average)
                     : (typeof B.schoolRank !== 'undefined') ? -Number(B.schoolRank)
                     : -Infinity;
          return bVal - aVal;
        });
        return docs.slice(0,10);
      }
    } catch(e){
      console.warn('examTotals query failed', e);
    }

    // Fallback 2: results collection client-side sort
    try {
      const snap = await getDocs(query(collection(db, 'results'), where('examId','==', examId)));
      if (snap && snap.size) {
        const docs = snap.docs.slice();
        docs.sort((a,b) => {
          const ar = a.data(), br = b.data();
          const at = (typeof ar.total !== 'undefined') ? Number(ar.total) : -Infinity;
          const bt = (typeof br.total !== 'undefined') ? Number(br.total) : -Infinity;
          return bt - at;
        });
        return docs.slice(0,10);
      }
    } catch(e){
      console.warn('fallback results fetch failed', e);
    }

    return [];
  } catch(err){
    console.warn('fetchTop10Results unexpected error', err);
    return [];
  }
}

/* --------- Helper: try to read full student doc if studentObj lacks amounts ---------- */
async function ensureStudentFullData(studentObj) {
  if (!studentObj) return studentObj;
  // if studentObj already contains common balance keys, return as-is
  const candidateKeys = ['balance','balance_cents','outstanding','amount_due','monthlyFee','monthly_amount'];
  for (const k of candidateKeys) {
    if (studentObj[k] !== undefined && studentObj[k] !== null) return studentObj;
  }
  // attempt to fetch from students collection by id or studentId
  try {
    // If studentObj.id looks like Firestore doc id
    if (studentObj.id) {
      const sdoc = await getDoc(doc(db, 'students', String(studentObj.id)));
      if (sdoc && sdoc.exists()) return { id: sdoc.id, ...sdoc.data() };
    }
    // fallback: query where studentId == studentObj.id or studentObj.studentId
    const sid = studentObj.studentId || studentObj.id;
    if (sid) {
      const q = query(collection(db,'students'), where('studentId','==', String(sid)));
      const sSnap = await getDocs(q);
      if (sSnap && sSnap.size) {
        const dd = sSnap.docs[0].data();
        return { id: sSnap.docs[0].id, ...dd };
      }
    }
  } catch(e) {
    console.warn('ensureStudentFullData failed', e);
  }
  return studentObj;
}

/* --------- Helper: extended detection of student amounts ---------- */
function detectStudentAmounts(student) {
  if(!student) return { monthlyAmount: null, balance: null };

  const tryKeys = (obj, keys) => {
    for(const k of keys) {
      if (k.includes('.')) {
        // nested key support "fees.balance"
        const parts = k.split('.');
        let cur = obj;
        let ok = true;
        for (const p of parts) {
          if (cur && typeof cur[p] !== 'undefined') cur = cur[p];
          else { ok = false; break; }
        }
        if (ok && cur !== null && cur !== undefined) return cur;
      } else {
        if(typeof obj[k] !== 'undefined' && obj[k] !== null) return obj[k];
      }
    }
    return null;
  };

  // broaden the candidate list to include nested and alternative names
  const monthlyCandidates = [
    'monthlyFee','monthly_fee','monthly_amount','monthly_amount_cents','fee','monthly','tuition_monthly','monthly_tuition',
    'fees.monthly','fees.monthly_fee','charges.monthly'
  ];
  const balCandidates = [
    'balance','balance_cents','outstanding','due','amount_due','balanceAmount','current_balance','fees.balance','finances.balance'
  ];

  let monthlyRaw = tryKeys(student, monthlyCandidates);
  let balanceRaw = tryKeys(student, balCandidates);

  // also check if there's an 'accounts' or 'ledger' array
  if(balanceRaw === null && Array.isArray(student.ledger)) {
    for(const item of student.ledger) {
      if(item && (item.balance || item.amount)) { balanceRaw = item.balance || item.amount; break; }
    }
  }

  const normalize = (v) => {
    if(v === null || typeof v === 'undefined') return null;
    if(typeof v === 'number') {
      if(Number.isInteger(v) && Math.abs(v) > 10000) return (v/100).toFixed(2); // treat as cents
      return Number(v).toFixed(2);
    }
    const s = String(v).trim();
    if(/^[\d]+$/.test(s)) {
      return (s.length > 4) ? (Number(s)/100).toFixed(2) : Number(s).toFixed(2);
    }
    if(/^\d+(\.\d+)?$/.test(s)) return Number(s).toFixed(2);
    const pf = parseFloat(s.replace(/[^0-9.-]/g,''));
    return isNaN(pf) ? null : pf.toFixed(2);
  };

  const monthlyAmount = normalize(monthlyRaw);
  const balance = normalize(balanceRaw);

  return { monthlyAmount, balance };
}

// -----------------------------
// Replace expandAnnouncementForStudent in main.js (student inline announcements)
// -----------------------------
// ---------- expandAnnouncementForStudent (student-side) ----------
// ---------- expandAnnouncementForStudent (student-side) ----------
async function expandAnnouncementForStudent(a, studentObj) {
  if (!a) return { title: a?.title || '', body: a?.body || '' };

  // ensure full student data if possible
  const enrichedStudent = await ensureStudentFullData(studentObj);

  const titleTemplate = a.title || '';
  let bodyTemplate = a.body || '';

  const replaceTokens = (text, subs) => (text || '').replace(/\{([^\}]+)\}/g, (m, k) => (subs && subs[k] !== undefined) ? subs[k] : m );

  // Try detect amounts (existing helper)
  let { monthlyAmount, balance } = detectStudentAmounts(enrichedStudent);

  // Fallback: if balance still null try to compute from payments/transactions collections
  async function fetchBalanceFallback(sid) {
    if (!sid) return null;
    const candidateColls = ['payments','student_payments','transactions','fees_ledger','payments_v1'];
    try {
      for (const c of candidateColls) {
        try {
          const q = query(collection(db, c), where('studentId','==', String(sid)));
          const snap = await getDocs(q);
          if (!snap || !snap.size) continue;
          // Attempt: if doc contains a balance/outstanding field return first seen
          for (const d of snap.docs) {
            const data = d.data();
            if (data && (data.balance || data.outstanding || data.amount_due || data.due)) {
              const val = data.balance || data.outstanding || data.amount_due || data.due;
              const n = (typeof val === 'number') ? Number(val).toFixed(2) : (String(val).replace(/[^0-9.-]/g,'') || null);
              if (n !== null && n !== '') return Number(n).toFixed(2);
            }
          }
          // Otherwise try to compute outstanding: sum(charges) - sum(paid)
          let sumCharge = 0, sumPaid = 0;
          snap.docs.forEach(d => {
            const dd = d.data();
            const ch = dd.charge || dd.amount || dd.debit || 0;
            const pd = dd.paid || dd.payment || dd.credit || 0;
            if (!isNaN(Number(ch))) sumCharge += Number(ch);
            if (!isNaN(Number(pd))) sumPaid += Number(pd);
          });
          if (sumCharge !== 0 || sumPaid !== 0) {
            return (sumCharge - sumPaid).toFixed(2);
          }
        } catch(e){ /* ignore coll error, try next */ }
      }
    } catch(e){
      console.warn('fetchBalanceFallback failed', e);
    }
    return null;
  }

  // If monthlyAmount missing: try class default from classesCache
  if ((!monthlyAmount || monthlyAmount === null || monthlyAmount === '') && enrichedStudent) {
    try {
      const classKey = enrichedStudent.classId || enrichedStudent.class || enrichedStudent.className;
      if (classKey && typeof window !== 'undefined') {
        const cls = (window.classesCache || []).find(c => String(c.id) === String(classKey) || c.name === classKey);
        if (cls) {
          const classFee = cls.monthlyFee || cls.monthly_fee || cls.fee || cls.defaultMonthly || cls.tuition;
          if (typeof classFee !== 'undefined' && classFee !== null) {
            const norm = (v) => {
              if (v === null || typeof v === 'undefined') return null;
              if (typeof v === 'number') {
                if (Number.isInteger(v) && Math.abs(v) > 10000) return (v / 100).toFixed(2);
                return Number(v).toFixed(2);
              }
              const s = String(v).trim();
              if (/^[\d]+$/.test(s)) return (s.length > 4) ? (Number(s) / 100).toFixed(2) : Number(s).toFixed(2);
              if (/^\d+(\.\d+)?$/.test(s)) return Number(s).toFixed(2);
              const pf = parseFloat(s.replace(/[^0-9.-]/g, ''));
              return isNaN(pf) ? null : pf.toFixed(2);
            };
            monthlyAmount = monthlyAmount || norm(classFee);
          }
        }
      }
    } catch(e){ /* ignore */ }
  }

  // If balance missing, try fallback lookups
  if (balance === null || typeof balance === 'undefined') {
    try {
      const sid = enrichedStudent?.id || enrichedStudent?.studentId || enrichedStudent?.student_id;
      if (sid) {
        const fb = await fetchBalanceFallback(sid);
        if (fb !== null) balance = fb;
      }
    } catch(e){/* ignore */ }
  }

  // normalize balance to string or null
  if (balance === null || typeof balance === 'undefined') balance = null;
  else if (typeof balance === 'number') balance = Number(balance).toFixed(2);
  else balance = String(balance);

  const monthName = (a.meta && a.meta.month) ? a.meta.month : (new Date()).toLocaleString(undefined, { month: 'long' });

  const subs = {
    student_name: enrichedStudent?.fullName || enrichedStudent?.name || enrichedStudent?.displayName || (enrichedStudent?.firstName ? `${enrichedStudent.firstName} ${enrichedStudent.lastName || ''}`.trim() : 'Student'),
    month: monthName,
    balance: (balance !== null) ? balance : null,
    monthly_amount: monthlyAmount || '',
    amount: monthlyAmount || '',
    exam: a.meta?.examName || a.meta?.examId || ''
  };

  // Monthly payments: show announcement when either balance is known OR monthlyAmount exists.
  if (a.type === 'monthly_payment') {
    // If balance unknown but monthlyAmount exists -> use monthlyAmount as balance fallback (so message appears)
    if (subs.balance === null && (subs.monthly_amount && subs.monthly_amount !== '')) {
      subs.balance = subs.monthly_amount;
    }
    // Final fallback: if still null, show 0.00 (avoids skipping when you want to inform even zero-fee students)
    if (subs.balance === null) subs.balance = '0.00';

    // Ensure monthly amount text visible
    if (monthlyAmount) {
      const monthlyText = ` :${monthlyAmount}`;
      if (!/\{monthly_amount\}/i.test(bodyTemplate)) {
        if (/monthly fee/i.test(bodyTemplate)) {
          bodyTemplate = bodyTemplate.replace(/monthly fee/i, match => `${match}${monthlyText}`);
        } else {
          bodyTemplate = bodyTemplate + `\n\nMonthly amount: ${monthlyAmount}`;
        }
      }
    }
    if (!/\{balance\}/i.test(bodyTemplate)) {
      bodyTemplate = bodyTemplate + `\n\nYour balance: ${subs.balance !== null ? subs.balance : '0.00'}`;
    }
  }

  // Top10: produce text summary (render will upgrade to medal UI)
  if (a.type === 'top10' && a.meta && a.meta.examId) {
    try {
      const docs = await fetchTop10Results(a.meta.examId);
      if (docs && docs.length) {
        const rows = [];
        for (let i=0;i<docs.length;i++){
          const d = docs[i];
          const r = (typeof d.data === 'function') ? d.data() : (d||{});
          const name = r.studentName || r.student_name || r.name || r.student || '—';
          const sid = r.studentId || r.student_id || r.student || (d.id || 'xxxx');
          const shortId = String(sid||'').slice(-4) || 'xxxx';
          const className = r.className || r.class || r.classId || '';
          const total = (typeof r.total !== 'undefined' && r.total !== null) ? Number(r.total) : '—';
          let maxPossible = 0;
          if (Array.isArray(r.subjects) && r.subjects.length) maxPossible = r.subjects.reduce((s,sub)=>s+(Number(sub.max)||0),0);
          else if (typeof r.max !== 'undefined' && r.max !== null) maxPossible = Number(r.max);
          else if (a.meta && a.meta.examMax) maxPossible = Number(a.meta.examMax)||0;
          const percent = (total!=='—' && maxPossible>0) ? ((total/maxPossible)*100).toFixed(2)+'%' : (r.average ? String(r.average) : '');
          rows.push(`${i+1}. ${name} • ID ${shortId} • ${className} • ${total} • ${percent}`);
        }
        bodyTemplate = `Top 10 — ${a.meta?.examName || a.meta?.examId || ''}\n\n${rows.join('\n')}`;
      } else {
        bodyTemplate = (bodyTemplate||'').replace(/\{rank\d+\}/g,'').trim() + `\n\n(No top-10 data found)`;
      }
    } catch(e){
      console.warn('expandAnnouncementForStudent top10 error', e);
    }
  }

  const finalTitle = replaceTokens(titleTemplate, subs);
  const finalBody = replaceTokens(bodyTemplate, subs);
  return { title: finalTitle, body: finalBody };
}


async function fetchAnnouncementsAll(){
  try {
    const s = await getDocs(query(collection(db,'announcements')));
    return s.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(err){ console.error('fetchAnnouncementsAll', err); return []; }
}

/* ===============================
   STUDENT – INLINE ANNOUNCEMENTS
   (NO MODALS – Spark-safe)
================================ */
// ---------- renderAnnouncementsForStudent (improved top-10 UI + mobile fit) ----------

// ---------- renderAnnouncementsForStudent (improved top-10 UI + mobile fit) ----------
// ---------- renderAnnouncementsForStudent (improved short titles, badges, top10 percent + mobile fit) ----------
async function renderAnnouncementsForStudent(studentObj){
  if(!studentObj) return;
  try {
    try { hideCardsUI(); } catch(e){}
    const all = await fetchAnnouncementsAll();

    // initial filter (same as before)
    const applicableRaw = (all || []).filter(a => {
      const aud = a.audience || [];
      if (aud.includes('all') || aud.includes('students')) return true;
      for (const it of aud) {
        if (it.startsWith('class:') && it.split(':')[1] === (studentObj.classId || studentObj.class)) return true;
        if (it.startsWith('student:') && it.split(':')[1] === studentObj.id) return true;
      }
      if (a.type === 'monthly_payment') return true;
      return false;
    }).sort((a,b)=> (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));

    // expand and filter (skip null results)
    const expandedPromises = applicableRaw.map(a => expandAnnouncementForStudent(a, studentObj));
    const expandedResults = await Promise.all(expandedPromises);
    const applicable = [];
    for (let i=0;i<applicableRaw.length;i++){
      const ex = expandedResults[i];
      if (ex === null) continue;
      applicable.push({ raw: applicableRaw[i], expanded: ex });
    }

    const lastSeenKey = `ann_lastSeen_student_${studentObj.id}`;
    const lastSeen = Number(localStorage.getItem(lastSeenKey) || '0');
    let unread = 0;
    applicable.forEach(a=> {
      const ts = a.raw.createdAt?.seconds ? a.raw.createdAt.seconds * 1000 : 0;
      if(ts > lastSeen) unread++;
    });

    const counterEl = document.getElementById('announcementsCounter');
    if(counterEl){
      if(unread > 0){
        counterEl.textContent = unread;
        counterEl.style.display = 'inline-block';
        counterEl.classList.add('pulse');
      } else {
        counterEl.textContent = '';
        counterEl.style.display = 'none';
        counterEl.classList.remove('pulse');
      }
    }

    const resultArea = document.getElementById('resultArea');
    if(!resultArea) return;
    resultArea.style.display = 'block';

    if (!applicable.length) {
      resultArea.innerHTML = `<div class="card muted">No announcements</div>`;
      return;
    }

    // small helper for short title (first line, truncated)
    const short = (s, n=48) => {
      if(!s) return '';
      const one = String(s).split('\n')[0].trim();
      return (one.length > n) ? one.slice(0,n-1) + '…' : one;
    };

    // map type -> badge
    const typeBadge = (t) => {
      switch(t){
        case 'monthly_payment': return { text: 'Fee', cls: 'badge-fee' };
        case 'top10': return { text: 'Top10', cls: 'badge-top10' };
        case 'exam': return { text: 'Exam', cls: 'badge-exam' };
        case 'holiday': return { text: 'Fasax', cls: 'badge-holiday' };
        case 'urgent': return { text: 'Urgent', cls: 'badge-urgent' };
        case 'system_maintenance': return { text: 'System', cls: 'badge-system' };
        case 'payment_received': return { text: 'Paid', cls: 'badge-paid' };
        default: return { text: '', cls: '' };
      }
    };

    // Render list
    resultArea.innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3 style="margin:0">📢 Announcements</h3>
          <button id="markReadBtn" class="btn btn-ghost">Mark all read</button>
        </div>
      </div>

      ${applicable.map((item, idx) => {
        const a = item.raw;
        const expanded = item.expanded;
        const tsMs = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0;
        const ts = tsMs ? new Date(tsMs).toLocaleString() : '';
        const isUnread = tsMs > lastSeen;
        const preview = expanded.body && expanded.body.length > 80 ? expanded.body.slice(0,80) + '...' : (expanded.body||'');
        const top10Attr = (a.type === 'top10' && a.meta && a.meta.examId) ? `data-top10="true" data-examid="${escapeHtml(a.meta.examId||'')}" data-examname="${escapeHtml(a.meta.examName||'')}"` : '';
        const tb = typeBadge(a.type);
        const shortTitle = escapeHtml(short(expanded.title || a.title || 'Announcement', 56));
        const badgeHtml = tb.text ? `<div class="ann-type ${tb.cls}">${escapeHtml(tb.text)}</div>` : '';
        return `
          <div class="card ann-inline ${isUnread ? 'ann-unread' : ''}" data-id="${escapeHtml(a.id)}" data-ts="${tsMs}" ${top10Attr} style="cursor:pointer;padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <div style="min-width:0">
                <div class="ann-title">${shortTitle}</div>
                <div class="muted small" style="margin-top:6px">${escapeHtml(ts)}</div>
                <div class="ann-preview" style="margin-top:8px">${escapeHtml(preview)}</div>
              </div>
              <div style="margin-left:12px;flex-shrink:0;display:flex;flex-direction:column;gap:6px;align-items:flex-end">
                ${badgeHtml}
              </div>
            </div>
            <div class="ann-body" style="display:none;margin-top:12px;white-space:pre-wrap">${escapeHtml(expanded.body || '')}</div>
          </div>
        `;
      }).join('')}
    `;

    // After render: enhance top10 blocks with styled medal UI (async fetch + show percent)
    (async () => {
      const topNodes = Array.from(document.querySelectorAll('.ann-inline[data-top10="true"]'));
      for (const node of topNodes) {
        try {
          const examId = node.getAttribute('data-examid');
          const examName = node.getAttribute('data-examname') || '';
          const annBody = node.querySelector('.ann-body');
          const docs = await fetchTop10Results(examId);
          if (!docs || !docs.length) continue;

          // Build HTML list with medals for top3 and include percentage
          const items = docs.map((d, i) => {
            const r = (typeof d.data === 'function') ? d.data() : d.data ? d.data() : (d||{});
            const name = escapeHtml(r.studentName || r.student_name || r.name || r.student || '—');
            const sidRaw = (r.studentId || r.student_id || r.student || (d.id||'xxxx'));
            const sid = escapeHtml(String(sidRaw));
            const shortId = String(sid).slice(-4) || 'xxxx';
            const className = escapeHtml(r.className || r.class || r.classId || '');
            const total = (typeof r.total !== 'undefined' && r.total !== null && r.total !== '') ? Number(r.total) : null;

            let maxPossible = 0;
            if (Array.isArray(r.subjects) && r.subjects.length) maxPossible = r.subjects.reduce((s,sub)=>s+(Number(sub.max)||0),0);
            else if (typeof r.max !== 'undefined' && r.max !== null) maxPossible = Number(r.max);
            else {
              // try reading meta stored on announcement (if available)
              const annId = node.getAttribute('data-id') || node.dataset.id;
              // many announcements include meta.examMax already (expandAnnouncementForStudent sets it)
              const ann = (window._cachedAnnouncements || []).find(x => x.id === annId);
              if (ann && ann.meta && ann.meta.examMax) maxPossible = Number(ann.meta.examMax) || 0;
            }

            const percent = (total !== null && maxPossible > 0) ? ((total / maxPossible) * 100).toFixed(2) + '%' : (r.average ? String(r.average) : '—');

            // medal / rank icon
            let medalHtml = `<div class="rank-num">${i+1}</div>`;
            if (i === 0) medalHtml = `<div class="medal medal-gold">🥇</div>`;
            if (i === 1) medalHtml = `<div class="medal medal-silver">🥈</div>`;
            if (i === 2) medalHtml = `<div class="medal medal-bronze">🥉</div>`;

            return `
              <div class="top10-row ${i<3 ? 'top3' : ''}">
                <div class="top10-medal">${medalHtml}</div>
                <div class="top10-info">
                  <div class="top10-name">${name}</div>
                  <div class="top10-meta">ID ${shortId} • ${className}</div>
                </div>
                <div class="top10-score">
                  <div style="font-weight:900">${total !== null ? String(total) : '—'}</div>
                  <div style="font-size:12px;color:var(--muted)">${percent}</div>
                </div>
              </div>
            `;
          }).join('');

          annBody.style.whiteSpace = 'normal';
          annBody.innerHTML = `<div class="top10-grid"><div style="font-weight:900;margin-bottom:8px">${escapeHtml(examName || ('Top 10 — ' + examId))}</div>${items}</div>`;
        } catch(e){
          console.warn('top10 enhancement failed', e);
        }
      }
    })();

    // click behaviour expand/collapse
    document.querySelectorAll('.ann-inline').forEach(card=>{
      card.onclick = ()=>{
        const body = card.querySelector('.ann-body');
        const ts = Number(card.dataset.ts || 0);
        const isOpen = body.style.display === 'block';
        body.style.display = isOpen ? 'none' : 'block';
        card.classList.add('opened');
        card.classList.remove('ann-unread');
        if(ts) localStorage.setItem(lastSeenKey, Date.now());
        if(counterEl){
          counterEl.textContent = '';
          counterEl.style.display = 'none';
        }
      };
    });

    // mark all read
    const markBtn = document.getElementById('markReadBtn');
    if(markBtn){
      markBtn.onclick = ()=>{
        localStorage.setItem(lastSeenKey, Date.now());
        if(counterEl){
          counterEl.textContent = '';
          counterEl.style.display = 'none';
        }
        toast && toast('All announcements marked as read');
      };
    }

  } catch(err){
    console.error('renderAnnouncementsForStudent failed', err);
  }
}
window.renderAnnouncementsForStudent = renderAnnouncementsForStudent;


// ---------- renderTimetableViewerForStudent (day-columns only, time under teacher name) ----------
async function renderTimetableViewerForStudent(classId){
  if(!classId) return toast && toast('Class ID required');

  const resultArea = document.getElementById('resultArea');
  if(!resultArea) return console.warn('renderTimetableViewerForStudent: #resultArea missing');

  try {
    resultArea.style.display = 'block';
    resultArea.innerHTML = `<div class="card muted">Loading timetable…</div>`;

    const classValues = Array.from(new Set([ String(classId).trim() ]));

    // fetch published timetables and pick the latest matching class
    const q = query(collection(db, 'timetables'), where('published', '==', true), orderBy('generatedAt','desc'));
    const snap = await getDocs(q);

    const match = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .find(t => {
        const cid = String(t.classId || '').trim();
        const cname = String(t.className || '').trim();
        return classValues.includes(cid) || classValues.includes(cname);
      });

    if(!match){
      resultArea.innerHTML = `
        <div class="card muted">
          No published timetable found for class
          <strong>${escapeHtml(classId)}</strong>.
        </div>`;
      return;
    }

    const tt = match;
    const schedule = tt.schedule || {};

    // canonical order
    const canonicalDays = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday'];
    const selDays = canonicalDays.filter(d => Array.isArray(schedule[d]));
    if(selDays.length === 0){
      const keys = Object.keys(schedule || {});
      if(keys.length === 0){
        resultArea.innerHTML = `<div class="card muted">Timetable is empty.</div>`;
        return;
      }
      selDays.push(...keys.sort());
    }

    // compute max rows (periods)
    let maxPeriods = 0;
    selDays.forEach(d => { maxPeriods = Math.max(maxPeriods, (schedule[d]||[]).length); });
    if(maxPeriods === 0) maxPeriods = 1;

    // ensure teachers cache available
    if (!window.teachersCache || !Array.isArray(window.teachersCache)) {
      try {
        const tSnap = await getDocs(collection(db, 'teachers'));
        window.teachersCache = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch(e){
        console.warn('Failed to load teachers for timetable viewer:', e);
        window.teachersCache = window.teachersCache || [];
      }
    }
    const teacherById = {};
    (window.teachersCache || []).forEach(t => {
      const tid = t.id || t.teacherId || t.email;
      if(tid) teacherById[tid] = t.fullName || t.name || t.teacherId || t.id;
    });

    // time helpers
    function toMinutes(hhmm){ if(!hhmm) return 0; const [h,m] = String(hhmm).split(':').map(Number); return (h||0)*60 + (m||0); }
    function fromMinutes(mins){ mins = Math.max(0, Math.floor(mins % (24*60))); const h = Math.floor(mins/60); const m = mins % 60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
    function formatAMPM(hhmm){
      if(!hhmm) return '';
      const [hStr,mStr] = String(hhmm).split(':');
      let h = Number(hStr), m = Number(mStr);
      h = ((h + 11) % 12) + 1;
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
    }

    const classStart = tt.startTime || '07:30';
    const periodMinMeta = Number(tt.periodMinutes || 60);
    const breakStartMeta = tt.breakStart || null;
    const breakEndMeta = tt.breakEnd || null;

    function computePeriodRangeForIndex(p){
      let running = toMinutes(classStart);
      for(let k=0;k<p;k++){
        running += periodMinMeta;
        if(breakStartMeta && breakEndMeta){
          const bS = toMinutes(breakStartMeta), bE = toMinutes(breakEndMeta);
          if(running >= bS && running < bE) running = bE;
        }
      }
      const start = fromMinutes(running);
      const end = fromMinutes(running + periodMinMeta);
      if(breakStartMeta && breakEndMeta){
        const bS = toMinutes(breakStartMeta), bE = toMinutes(breakEndMeta);
        const s = toMinutes(start), e = toMinutes(end);
        if(s >= bS && e <= bE) return { isBreak: true, start, end };
      }
      return { isBreak: false, start, end };
    }

    // build HTML (days-only header)
    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-weight:800">Class Timetable — ${escapeHtml(String(classId))}</div>
          <div class="muted" style="font-size:12px">Generated: ${tt.generatedAt ? (tt.generatedAt.seconds ? new Date(tt.generatedAt.seconds*1000).toLocaleString() : new Date(tt.generatedAt).toLocaleString()) : '—'}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div class="muted" style="font-size:12px">Status: ${tt.published ? '<strong>Published</strong>' : '<em>Unpublished</em>'}</div>
          <button id="ttDownloadPdfBtn" class="btn btn-ghost btn-sm">Download PDF</button>
        </div>
      </div>

      <div style="overflow:auto">
        <table class="tt-table" style="width:100%;border-collapse:collapse">
          <thead><tr>`;

    selDays.forEach(d => html += `<th style="border:1px solid #e6eef8;padding:10px;text-align:left">${escapeHtml(d)}</th>`);
    html += `</tr></thead><tbody>`;

    // rows (no period column) — each row is only day cells
    for(let p=0;p<maxPeriods;p++){
      const computed = computePeriodRangeForIndex(p);
      const anyDayMarkedBreak = selDays.some(d => !!(schedule[d] && schedule[d][p] && schedule[d][p].isBreak));
      const globalIsBreak = anyDayMarkedBreak || !!computed.isBreak;

      html += `<tr>`;
      selDays.forEach(d => {
        const cell = schedule[d] && schedule[d][p] ? schedule[d][p] : null;

        // derive time for this cell (prefer cell.start/end, else computed)
        const start = (cell && cell.start) ? cell.start : computed.start;
        const end = (cell && cell.end) ? cell.end : computed.end;
        const timeLine = `${formatAMPM(start)} – ${formatAMPM(end)}`;

        // global break handling
        if(!cell && globalIsBreak){
          html += `<td style="border:1px solid #f6ecd7;padding:10px;min-width:120px;background:#fff7e6;text-align:center">
                     <div style="font-weight:800">Break</div>
                     <div class="muted tt-small" style="margin-top:6px">${timeLine}</div>
                   </td>`;
          return;
        }

        if(!cell){
          html += `<td style="border:1px solid #eef4fb;padding:10px;min-width:120px"><div class="muted">—</div></td>`;
          return;
        }

        if(cell.isBreak){
          html += `<td style="border:1px solid #f6ecd7;padding:10px;min-width:120px;background:#fff7e6;text-align:center">
                     <div style="font-weight:800">Break</div>
                     <div class="muted tt-small" style="margin-top:6px">${timeLine}</div>
                   </td>`;
        } else {
          const subj = escapeHtml(cell.subject || 'Free');
          const teacherNames = (cell.teacherIds || []).map(id => escapeHtml(teacherById[id] || id)).join(', ');

          // time should appear under the teacher name; if no teacher, show under subject
          if(teacherNames){
            html += `<td style="border:1px solid #eef4fb;padding:10px;min-width:120px;vertical-align:top">
                       <div style="font-weight:700">${subj}</div>
                       <div style="margin-top:6px;font-size:13px;color:#334155">${teacherNames}
                         <div class="tt-small muted" style="margin-top:4px">${escapeHtml(timeLine)}</div>
                       </div>
                     </td>`;
          } else {
            html += `<td style="border:1px solid #eef4fb;padding:10px;min-width:120px;vertical-align:top">
                       <div style="font-weight:700">${subj}</div>
                       <div class="tt-small muted" style="margin-top:6px">${escapeHtml(timeLine)}</div>
                     </td>`;
          }
        }
      });
      html += `</tr>`;
    }

    html += `</tbody></table></div>`;

    resultArea.innerHTML = `<div class="card">${html}</div>`;

    // Download button logic (renders the same day-only table)
    const downloadBtn = document.getElementById('ttDownloadPdfBtn');
    if(downloadBtn){
      downloadBtn.onclick = async () => {
        try {
          const tbl = resultArea.querySelector('.tt-table');
          if(!tbl) { toast && toast('No timetable to print'); return; }

          const canvas = await html2canvas(tbl, { scale: 2, useCORS: true, logging: false });
          const imgData = canvas.toDataURL('image/png');

          const jsPDFLib = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (window.jsPDF ? window.jsPDF : null);
          if(!jsPDFLib){
            const win = window.open('', '_blank', 'noopener');
            if(!win){ toast && toast('Popup blocked — allow popups to print'); return; }
            win.document.open();
            win.document.write(`<html><body><img src="${imgData}" style="max-width:100%"/></body></html>`);
            win.document.close();
            return;
          }

          const pdf = new jsPDFLib('landscape','pt','a4');
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const margin = 20;
          const scale = Math.min((pageWidth - margin*2) / canvas.width, (pageHeight - margin*2) / canvas.height);
          const imgW = canvas.width * scale;
          const imgH = canvas.height * scale;
          const x = (pageWidth - imgW) / 2;
          const y = margin;

          pdf.addImage(imgData, 'PNG', x, y, imgW, imgH);
          const safeClass = String(classId).replace(/\s+/g,'-').replace(/[^\w\-]/g,'').toLowerCase();
          const filename = `timetable-${safeClass}-${(new Date()).toISOString().slice(0,10)}.pdf`;
          pdf.save(filename);
        } catch(e){
          console.error('Auto PDF generation failed:', e);
          toast && toast('Failed to generate PDF');
        }
      };
    }

    function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  } catch(err){
    console.error('renderTimetableViewerForStudent failed', err);
    resultArea.innerHTML = `<div class="card muted">Failed to load timetable.</div>`;
    toast && toast('Failed to load timetable');
  }
}
window.renderTimetableViewerForStudent = renderTimetableViewerForStudent;



// ensure value is an array
function ensureArray(v){
  if(!v && v !== 0) return [];
  return Array.isArray(v) ? v : [v];
}
// Intersection of subjects lists across multiple class ids/names

function subjectsIntersectionForClassIds(classIds){
  if(!classIds || classIds.length === 0) return [];
  const lists = classIds.map(cid => {
    const cls = (classesCache||[]).find(c => String(c.id) === String(cid) || String(c.name) === String(cid));
    if(!cls) return [];
    return Array.isArray(cls.subjects) ? cls.subjects.map(String) : [];
  }).filter(l => l && l.length);
  if(lists.length === 0) return [];
  return lists.reduce((acc, list) => acc.filter(x => list.includes(x)));
}

// Display helpers for UI prints (class/subject)
function displayClassList(q){
  const arr = ensureArray(q.classIds || q.classId || q.class);
  return arr.length ? arr.map(x => escapeHtml(String(x))).join(', ') : '—';
}
function displaySubjectList(q){
  const arr = ensureArray(q.subjectIds || q.subjectId || q.subject || q.subjectName);
  if(!arr.length) return '—';
  return arr.map(sid => {
    const sdoc = (subjectsCache||[]).find(s => String(s.id) === String(sid) || String(s.name) === String(sid));
    return escapeHtml(sdoc ? (sdoc.name || sdoc.id) : sid);
  }).join(', ');
}


function shuffleWithIndex(arr){
  const tmp = arr.map((it,i)=>({it,i}));
  for(let i=tmp.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [tmp[i],tmp[j]]=[tmp[j],tmp[i]]; }
  return tmp.map(x => ({ item: x.it, originalIndex: x.i }));
}

function shuffleArray(arr){ const a=(arr||[]).slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]] } return a; }
/* ---------- Helpers (safe/fallback) ---------- */
if (typeof escapeHtml !== 'function') {
  function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
}
if (typeof ensureArray !== 'function') {
  function ensureArray(v){ if(!v && v !== 0) return []; return Array.isArray(v) ? v : [v]; }
}
if (typeof shuffleArray !== 'function') {
  function shuffleArray(arr){ const a=(arr||[]).slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]] } return a; }
}
if (typeof shuffleWithIndex !== 'function') {
  function shuffleWithIndex(arr){
    const tmp = arr.map((it,i)=>({it,i}));
    for(let i=tmp.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [tmp[i],tmp[j]]=[tmp[j],tmp[i]]; }
    return tmp.map(x => ({ item: x.it, originalIndex: x.i }));
  }
}

/* Try to load subjectsCache if missing (best-effort) */
async function _ensureSubjectsCache(){
  if(window.subjectsCache && Array.isArray(window.subjectsCache) && window.subjectsCache.length) return;
  try {
    const snap = await getDocs(collection(db,'subjects'));
    window.subjectsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e){
    console.warn('Failed to load subjectsCache', e);
    window.subjectsCache = window.subjectsCache || [];
  }
}
function displaySubjectListSync(q){
  const arr = ensureArray(q.subjectIds || q.subjectId || q.subject || q.subjectName);
  if(!arr.length) return '—';
  const cache = (window.subjectsCache && Array.isArray(window.subjectsCache)) ? window.subjectsCache : [];
  return arr.map(sid => {
    const sdoc = cache.find(s => String(s.id) === String(sid) || String(s.name) === String(sid));
    return escapeHtml(sdoc ? (sdoc.name || sdoc.id) : sid);
  }).join(', ');
}

/* ---------- renderStudentSummaryInline (updated: shows quiz title + id) ---------- */
function renderStudentSummaryInline(responseDoc, quizDocOrId, studentData){
  // quizDocOrId can be id string or a quiz doc object
  const quizTitle = (typeof quizDocOrId === 'object' && quizDocOrId?.title) ? quizDocOrId.title : (responseDoc.quizTitle || 'Quiz');
  const quizId = (typeof quizDocOrId === 'object' && quizDocOrId?.id) ? quizDocOrId.id : (typeof quizDocOrId === 'string' ? quizDocOrId : (responseDoc.quizId || '—'));

  const answers = responseDoc.answers || [];
  const answered = answers.filter(a => typeof a.selectedOriginalIndex !== 'undefined' && a.selectedOriginalIndex !== null).length;
  const skipped = answers.length - answered;
  const correct = typeof responseDoc.correctCount !== 'undefined'
    ? responseDoc.correctCount
    : answers.reduce((s,a)=> s + ((a.selectedOriginalIndex !== null && a.selectedOriginalIndex === a.correctIndex) ? 1 : 0),0);
  const incorrect = answered - correct;
  const score = responseDoc.score ?? 0;
  const maxScore = responseDoc.maxScore ?? answers.reduce((s,a)=> s + (a.pointsPossible || a.pointsGot || 0),0);
  const studentName = studentData?.fullName || studentData?.name || responseDoc.studentName || 'Student';
  const sid = studentData?.id || responseDoc.studentId || '—';
  const cls = studentData?.classId || studentData?.class || studentData?.className || responseDoc.classId || '—';

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:900;color:#1e3a8a">${escapeHtml(quizTitle)}</div>
          <div class="muted small">Quiz ID: ${escapeHtml(quizId)}</div>
        </div>
        <div class="muted small">Result</div>
      </div>
      <div style="margin-top:8px">
        <div><strong>Name:</strong> ${escapeHtml(studentName)}</div>
        <div><strong>ID:</strong> ${escapeHtml(String(sid))}</div>
        <div><strong>Class:</strong> ${escapeHtml(String(cls))}</div>
        <div style="margin-top:8px"><strong>Score:</strong> ${escapeHtml(String(score))} / ${escapeHtml(String(maxScore))}</div>
        <div style="margin-top:8px"><strong>Answered:</strong> ${answered} • <strong>Skipped:</strong> ${skipped} • <strong>Correct:</strong> ${correct} • <strong>Incorrect:</strong> ${incorrect}</div>
      </div>
    </div>
  `;
}
/* ---------- renderQuizzesForStudent (responsive + shows ID, classes, subjects, duration) ---------- */

async function renderQuizzesForStudent(studentId){
  const resultArea = document.getElementById('resultArea');
  if(!resultArea) return;

  resultArea.style.display = 'block';
  resultArea.innerHTML = `<div class="card muted">Loading quizzes…</div>`;

  try {
    // load student
    const sSnap = await getDoc(doc(db,'students', studentId)).catch(()=>null);
    if(!sSnap || !sSnap.exists()){ resultArea.innerHTML = `<div class="card muted">Student not found.</div>`; return; }
    const sData = sSnap.data();
    const classId = sData.classId || sData.class || sData.className;
    if(!classId){ resultArea.innerHTML = `<div class="card muted">No class assigned.</div>`; return; }

    // ensure subjects cache for display
    await _ensureSubjectsCache();

    // fetch quizzes (ordered newest first)
    const snap = await getDocs(query(collection(db,'quizzes'), orderBy('createdAt','desc')));
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // fetch student's existing responses (to prevent retakes)
    const respSnap = await getDocs(query(collection(db,'quiz_responses'), where('studentId','==', String(studentId))));
    const respondedIds = new Set(respSnap.docs.map(d=>d.data().quizId));

    // helpers
    const toMs = (ts) => {
      if(!ts) return null;
      if(typeof ts === 'number') return Number(ts);
      if(ts.seconds) return Number(ts.seconds)*1000;
      const p = Date.parse(ts); return isNaN(p) ? null : p;
    };
    const nowMs = Date.now();
    const formatHMS = (ms) => {
      if(ms <= 0) return '00:00:00';
      const s = Math.floor(ms/1000);
      const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); const r = s%60;
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
    };

    // determine visible quizzes: active, open now, include this student's class
    const visible = docs.filter(qd => {
      if(!qd.active) return false;
      const startMs = toMs(qd.startAt) || toMs(qd.createdAt) || null;
      const endMsExplicit = toMs(qd.endAt) || null;
      const durationMs = (Number(qd.durationMinutes) || 0) * 60 * 1000;
      const endMsComputed = startMs ? (startMs + durationMs) : null;
      const endMs = endMsExplicit || endMsComputed;
      if(!startMs || !endMs) return false;
      if(!(nowMs >= startMs && nowMs < endMs)) return false;

      const qClasses = ensureArray(qd.classIds || qd.classId || qd.class);
      return qClasses.some(c => String(c) === String(classId));
    });

    if(!visible.length){
      resultArea.innerHTML = `<div class="card muted">No active quizzes for your class right now.</div>`;
      return;
    }

    // Responsive grid / card layout (one column on mobile, two on wider screens)
    // we use inline styles so it's a drop-in
    const cardsHtml = visible.map(qd => {
      const startMs = toMs(qd.startAt) || toMs(qd.createdAt) || 0;
      const endMsExplicit = toMs(qd.endAt) || null;
      const durationMs = (Number(qd.durationMinutes) || 0) * 60 * 1000;
      const endMs = endMsExplicit || (startMs ? startMs + durationMs : 0);
      const left = Math.max(0, endMs - nowMs);
      const totalPoints = (qd.questions||[]).reduce((s,q)=> s + (Number(q.points||1)),0);
      const already = respondedIds.has(qd.id);
      const subjectsText = displaySubjectListSync(qd);
      const classesText = displayClassList(qd);
      // compact card
      return `
        <article class="quiz-card" data-end="${endMs}" data-quiz="${escapeHtml(qd.id)}" style="background:linear-gradient(180deg, #fff, #fbfdff);border:1px solid #eef4fb;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;min-width:220px">
          <div style="display:flex;justify-content:space-between;align-items:start;gap:12px;flex-wrap:wrap">
            <div style="min-width:0;flex:1">
              <div style="font-weight:900;color:#1e3a8a;font-size:16px;white-space:normal">${escapeHtml(qd.title || '(untitled)')}</div>
              <div class="muted small" style="margin-top:6px;font-size:13px;display:flex;gap:6px;flex-wrap:wrap">
                <div style="background:#eef2ff;padding:4px 8px;border-radius:999px;font-size:12px">ID: ${escapeHtml(qd.id)}</div>
                <div style="background:#f0fdf4;padding:4px 8px;border-radius:999px;font-size:12px;color:#065f46">Subjects: <strong style="margin-left:6px;color:#065f46">${escapeHtml(subjectsText)}</strong></div>
                <div style="background:#f8fafc;padding:4px 8px;border-radius:999px;font-size:12px">Classes: ${escapeHtml(classesText)}</div>
              </div>
              <div style="margin-top:8px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
                <div style="font-size:13px" class="muted">Duration: <strong>${escapeHtml(String(qd.durationMinutes||0))}m</strong></div>
                <div style="font-size:13px" class="muted">Total pts: <strong>${String(totalPoints)}</strong></div>
              </div>
            </div>

            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
              <div style="text-align:right">
                <div class="muted small" style="font-size:12px">Time left</div>
                <div class="quiz-time-left" style="font-weight:900;color:#dc2626">${formatHMS(left)}</div>
              </div>

              <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
                ${ already
                  ? `<button class="btn btn-ghost btn-sm view-summary" data-id="${escapeHtml(qd.id)}">View summary</button>`
                  : `<button class="btn btn-primary btn-sm take-quiz" data-id="${escapeHtml(qd.id)}">Take quiz</button>`
                }
                <div class="muted small" style="font-size:12px">Created: ${qd.createdAt && qd.createdAt.seconds ? new Date(qd.createdAt.seconds*1000).toLocaleString() : (qd.createdAt || '')}</div>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // container with responsive grid styling
    resultArea.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="font-weight:900;font-size:18px">Active quizzes</div>
        <div class="muted small">Class: ${escapeHtml(String(classId))}</div>
      </div>

      <div style="margin-top:10px;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">
        ${cardsHtml}
      </div>
    `;

    // live countdown: update each card's .quiz-time-left every second
    if(window._studentQuizTicker) clearInterval(window._studentQuizTicker);
    window._studentQuizTicker = setInterval(()=> {
      document.querySelectorAll('[data-quiz]').forEach(card => {
        const end = Number(card.dataset.end||0);
        const leftMs = Math.max(0, end - Date.now());
        const span = card.querySelector('.quiz-time-left');
        if(!span) return;
        if(leftMs <= 0){
          span.textContent = '00:00:00';
          const btn = card.querySelector('.take-quiz');
          if(btn){ btn.disabled = true; btn.classList.remove('btn-primary'); btn.classList.add('btn-ghost'); btn.textContent = 'Ended'; }
        } else {
          const s = Math.floor(leftMs/1000);
          const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), r = s%60;
          span.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
        }
      });
    }, 1000);

    // wire actions
    resultArea.querySelectorAll('.take-quiz').forEach(b => b.onclick = ev => {
      const qid = ev.currentTarget.dataset.id;
      openTakeQuizInline(studentId, qid);
    });
    resultArea.querySelectorAll('.view-summary').forEach(b => b.onclick = async ev => {
      const qid = ev.currentTarget.dataset.id;
      const rSnap = await getDocs(query(collection(db,'quiz_responses'), where('quizId','==', qid), where('studentId','==', String(studentId))));
      if(!rSnap || !rSnap.size){ alert('Summary not found.'); return; }
      const rDoc = rSnap.docs[0];
      const r = { id: rDoc.id, ...rDoc.data() };
      const qSnap = await getDoc(doc(db,'quizzes', qid));
      const quizDoc = qSnap && qSnap.exists() ? { id: qSnap.id, ...qSnap.data() } : { id: qid, title: '(unknown)' };
      resultArea.innerHTML = renderStudentSummaryInline(r, quizDoc, sData);
    });

  } catch(err){
    console.error('renderQuizzesForStudent', err);
    resultArea.innerHTML = `<div class="card muted">Failed to load quizzes.</div>`;
  }
}
window.renderQuizzesForStudent = renderQuizzesForStudent;

/* ---------- openTakeQuizInline (updated; robust randomize + timer + end modal) ---------- */
/* ----------------- New helpers ------------------ */
/* ---------------- Settings & CSS ---------------- */
window.quizSettings = window.quizSettings || { autoRefreshDelaySec: 3, warningThresholdSec: 300, dangerThresholdSec: 60 };

/* inject timer CSS once */
(function _injectQuizTimerCSS(){
  if(document.getElementById('_quiz_timer_styles')) return;
  const style = document.createElement('style');
  style.id = '_quiz_timer_styles';
  style.textContent = `
    .quiz-timer { font-weight:900; transition: color 300ms ease, transform 200ms ease; }
    .quiz-timer.timer-normal { color: inherit; transform: none; }
    .quiz-timer.timer-warning { color: #f97316; } /* orange */
    .quiz-timer.timer-danger { color: #dc2626; animation: _qq_flash 1s linear infinite; } /* red + flash */
    @keyframes _qq_flash {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.03); opacity: 0.85; }
      100% { transform: scale(1); opacity: 1; }
    }
    /* little top reload banner */
    .qq-reload-banner { position:fixed; left:12px; right:12px; top:12px; z-index:120000; display:flex; justify-content:space-between; align-items:center; gap:12px; background:#fff; border-radius:8px; padding:10px; box-shadow:0 8px 30px rgba(2,6,23,0.12) }
    .qq-reload-banner .muted { opacity:0.8; }
    .qq-toast { position:fixed; right:12px; bottom:12px; z-index:120000; background:#111827; color:#fff; padding:8px 12px; border-radius:8px; box-shadow:0 6px 20px rgba(2,6,23,0.18); font-size:13px; }
  `;
  document.head.appendChild(style);
})();

/* fallback toast if not present */
if(typeof toast !== 'function'){
  window.toast = function(message, type){
    // simple ephemeral toast
    try {
      const el = document.createElement('div');
      el.className = 'qq-toast';
      el.textContent = message;
      document.body.appendChild(el);
      setTimeout(()=> el.remove(), 5000);
    } catch(e){ console.log('toast:', message); }
  };
}

/* fallback modalConfirm if not present (returns Promise<boolean>) */
if(typeof modalConfirm !== 'function'){
  window.modalConfirm = async function(title, msg, opts = { okText:'OK', cancelText:'Cancel' }){
    return Promise.resolve(window.confirm(`${title}\n\n${msg}`));
  };
}

/* show timed decision modal (unchanged except we keep it) */
function showTimedDecisionModal(message, countdownSec = 5){
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.left = '0'; overlay.style.top = '0'; overlay.style.right = '0'; overlay.style.bottom = '0';
    overlay.style.background = 'rgba(0,0,0,0.6)';
    overlay.style.zIndex = 99999;
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.padding = '20px';

    const box = document.createElement('div');
    box.style.width = 'min(720px,100%)';
    box.style.maxHeight = '90vh';
    box.style.overflow = 'auto';
    box.style.background = '#fff';
    box.style.borderRadius = '8px';
    box.style.padding = '18px';
    box.style.boxShadow = '0 8px 30px rgba(2,6,23,0.3)';
    box.style.display = 'flex';
    box.style.flexDirection = 'column';
    box.style.gap = '12px';

    const title = document.createElement('div');
    title.style.fontWeight = 800;
    title.style.fontSize = '18px';
    title.textContent = 'Time is up — Submit your answers?';

    const body = document.createElement('div');
    body.style.whiteSpace = 'pre-line';
    body.style.lineHeight = '1.4';
    body.textContent = message;

    const countdownWrap = document.createElement('div');
    countdownWrap.style.display = 'flex';
    countdownWrap.style.alignItems = 'center';
    countdownWrap.style.justifyContent = 'space-between';

    const countdownText = document.createElement('div');
    countdownText.style.fontWeight = 800;
    countdownText.style.color = '#dc2626';
    countdownText.textContent = `Auto action in ${countdownSec}s`;

    countdownWrap.appendChild(countdownText);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.justifyContent = 'flex-end';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'btn btn-ghost';
    btnCancel.textContent = 'Cancel (forfeit)';

    const btnSubmit = document.createElement('button');
    btnSubmit.className = 'btn btn-primary';
    btnSubmit.textContent = 'Submit answers';

    actions.appendChild(btnCancel);
    actions.appendChild(btnSubmit);

    box.appendChild(title);
    box.appendChild(body);
    box.appendChild(countdownWrap);
    box.appendChild(actions);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (ev) => {
      if(ev.target === overlay) { /* blocked intentionally */ }
    });

    let secondsLeft = countdownSec;
    countdownText.textContent = `Auto action in ${secondsLeft}s`;
    const interval = setInterval(() => {
      secondsLeft--;
      countdownText.textContent = `Auto action in ${secondsLeft}s`;
      if(secondsLeft <= 0){
        clearInterval(interval);
        cleanup();
        resolve('auto');
      }
    }, 1000);

    function cleanup(){
      clearInterval(interval);
      btnCancel.onclick = null;
      btnSubmit.onclick = null;
      if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    btnCancel.onclick = () => { cleanup(); resolve('cancel'); };
    btnSubmit.onclick = () => { cleanup(); resolve('submit'); };
  });
}



/* ---------- Helper: showReloadBanner (appears after submit/auto-submit) ---------- */
function showReloadBanner(message, countdownSec = window.quizSettings.autoRefreshDelaySec){
  // remove existing banner
  const existing = document.getElementById('_qq_reload_banner');
  if(existing) existing.remove();

  const wrap = document.createElement('div');
  wrap.id = '_qq_reload_banner';
  wrap.className = 'qq-reload-banner';
  wrap.innerHTML = `<div><strong>${escapeHtml(message)}</strong><div class="muted" id="_qq_reload_countdown">Reloading in ${countdownSec}s</div></div>
    <div style="display:flex;gap:8px"><button id="_qq_reload_now" class="btn btn-ghost btn-sm">Reload now</button><button id="_qq_dismiss_reload" class="btn btn-ghost btn-sm">Dismiss</button></div>`;

  document.body.appendChild(wrap);

  let s = countdownSec;
  const cdEl = document.getElementById('_qq_reload_countdown');
  const iv = setInterval(()=> {
    s--;
    if(cdEl) cdEl.textContent = `Reloading in ${s}s`;
    if(s <= 0){
      clearInterval(iv);
      try{ location.reload(); }catch(e){}
    }
  }, 1000);

  document.getElementById('_qq_reload_now').onclick = () => { clearInterval(iv); try{ location.reload(); }catch(e){} };
  document.getElementById('_qq_dismiss_reload').onclick = () => { clearInterval(iv); wrap.remove(); };
}

/* ---------- openTakeQuizInline (updated: flashing + realtime extra-time toast + reload banner) ---------- */
async function openTakeQuizInline(studentId, quizId){
  const resultArea = document.getElementById('resultArea');
  if(!resultArea) return;

  let quizDocUnsub = null;
  let timerInterval = null;

  try {
    // load student & quiz
    const sSnap = await getDoc(doc(db,'students', studentId)).catch(()=>null);
    if(!sSnap || !sSnap.exists()){ resultArea.innerHTML = `<div class="card muted">Student not found.</div>`; return; }
    const sData = sSnap.data();

    const qSnap = await getDoc(doc(db,'quizzes', quizId)).catch(()=>null);
    if(!qSnap || !qSnap.exists()){ resultArea.innerHTML = `<div class="card muted">Quiz not found or removed.</div>`; return; }
    let quiz = { id: qSnap.id, ...qSnap.data() };

    // existing response check
    const existing = await getDocs(query(collection(db,'quiz_responses'), where('quizId','==', quiz.id), where('studentId','==', String(studentId))));
    if(existing.size > 0){
      const docResp = { id: existing.docs[0].id, ...existing.docs[0].data() };
      resultArea.innerHTML = renderStudentSummaryInline(docResp, quiz, sData);
      return;
    }

    // class check
    const classId = sData.classId || sData.class || sData.className;
    const quizClasses = ensureArray(quiz.classIds || quiz.classId || quiz.class);
    if(!quizClasses.some(c => String(c) === String(classId))){ resultArea.innerHTML = `<div class="card muted">This quiz is not for your class.</div>`; return; }

    // timing helpers
    const toMs = (ts) => { if(!ts) return null; if(typeof ts === 'number') return Number(ts); if(ts.seconds) return Number(ts.seconds)*1000; const p = Date.parse(ts); return isNaN(p)?null:p; };
    const now = Date.now();
    let startMs = toMs(quiz.startAt) || toMs(quiz.createdAt) || null;
    let endMs = toMs(quiz.endAt) || (startMs ? (startMs + (Number(quiz.durationMinutes||0)*60*1000)) : null);
    if(!startMs || !endMs){ resultArea.innerHTML = `<div class="card muted">Quiz timing info missing. Contact teacher.</div>`; return; }
    if(now < startMs){ resultArea.innerHTML = `<div class="card muted">This quiz starts at ${new Date(startMs).toLocaleString()}</div>`; return; }
    if(now >= endMs){ resultArea.innerHTML = `<div class="card muted">This quiz ended at ${new Date(endMs).toLocaleString()}</div>`; return; }

    // prepare questions preserving orig indices
    const origQuestions = quiz.questions || [];
    let qObjs = origQuestions.map((q,i)=>({
      origIndex: i,
      text: q.text||'',
      origChoices: (q.choices||[]).map((c,ci)=>({ origIndex:ci, text:c })),
      origCorrectIndex: typeof q.correctIndex !== 'undefined' ? Number(q.correctIndex) : null,
      points: Number(q.points||1)
    }));
    if(quiz.randomizeQuestions) qObjs = shuffleWithIndex(qObjs).map(x=>({...x.item}));
    const renderedQuestions = qObjs.map(q=>{
      const choices = q.origChoices.map(c=>({ text:c.text, origIndex:c.origIndex }));
      const shuffled = quiz.randomizeChoices ? shuffleWithIndex(choices).map(x=>({ text:x.item.text, origIndex:x.originalIndex })) : choices;
      return { origQuestionIndex: q.origIndex, text: q.text, renderedChoices: shuffled, origCorrectIndex: q.origCorrectIndex, points: q.points };
    });

    // answers state
    const answersState = renderedQuestions.map(()=>({ selectedOrigIndex: null }));

    // initial seconds left
    let timeLeftSec = Math.max(0, Math.ceil((endMs - Date.now())/1000));

    // build UI — timer element uses class 'quiz-timer'
    function buildQuestionHtml(idx){
      const Q = renderedQuestions[idx];
      return `
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="font-weight:800">${escapeHtml(Q.text||`Q${idx+1}`)}</div>
          <div>
            ${Q.renderedChoices.map((c,ui)=>`<div style="margin:6px 0"><label><input type="radio" name="qchoice" data-orig="${c.origIndex}" data-ui="${ui}" ${answersState[idx].selectedOrigIndex===c.origIndex ? 'checked':''} /> ${escapeHtml(c.text)}</label></div>`).join('')}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center"><div class="muted">Points: ${Q.points}</div></div>
        </div>
      `;
    }

    let currentIndex = 0;

    function renderInline(){
      resultArea.innerHTML = `
        <div class="card" style="display:flex;flex-direction:column;gap:8px;max-height:80vh">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:900;color:#1e3a8a">${escapeHtml(quiz.title||'Quiz')}</div>
              <div class="muted small">Quiz ID: ${escapeHtml(quiz.id)} • Subject: <span style="color:#15803d">${escapeHtml(quiz.subjectName||quiz.subject||'—')}</span></div>
            </div>
            <div style="text-align:right">
              <div class="muted small">Time left</div>
              <div id="inlineQuizTimer" class="quiz-timer">${formatHMS(timeLeftSec*1000)}</div>
            </div>
          </div>

          <div id="inlineQuestionArea" style="overflow:auto;padding:8px;border:1px solid #f1f5f9;border-radius:6px;flex:1">
            ${buildQuestionHtml(currentIndex)}
          </div>

          <div style="position:sticky;bottom:0;background:var(--card,#fff);padding-top:8px;padding-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div>
              <button id="prevQ" class="btn btn-ghost btn-sm">Prev</button>
              <button id="nextQ" class="btn btn-ghost btn-sm">Next</button>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <div class="muted small" id="inlineProgress">Question ${currentIndex+1} / ${renderedQuestions.length}</div>
              <div class="muted small">Duration: ${escapeHtml(String(quiz.durationMinutes||0))}m</div>
              <button id="submitInline" class="btn btn-primary">Submit</button>
            </div>
          </div>
        </div>
      `;

      const qArea = document.getElementById('inlineQuestionArea');
      qArea.querySelectorAll('input[name="qchoice"]').forEach(inp => {
        inp.onchange = () => {
          const orig = typeof inp.dataset.orig !== 'undefined' ? Number(inp.dataset.orig) : null;
          answersState[currentIndex].selectedOrigIndex = (orig !== null ? orig : null);
        };
      });

      document.getElementById('prevQ').onclick = () => { if(currentIndex>0){ currentIndex--; refreshQuestionArea(); } };
      document.getElementById('nextQ').onclick = () => { if(currentIndex < renderedQuestions.length-1){ currentIndex++; refreshQuestionArea(); } };
      document.getElementById('submitInline').onclick = async () => {
        const ok = await modalConfirm('Submit quiz','Are you sure you want to submit now? You will not be able to change your answers after submitting.');
        if(!ok) return;
        await submitResponses();
      };
      document.getElementById('inlineProgress').textContent = `Question ${currentIndex+1} / ${renderedQuestions.length}`;
      updateTimerDisplay(); // set initial class
    }

    function refreshQuestionArea(){
      const qArea = document.getElementById('inlineQuestionArea');
      if(!qArea) return;
      qArea.innerHTML = buildQuestionHtml(currentIndex);
      qArea.querySelectorAll('input[name="qchoice"]').forEach(inp => {
        inp.onchange = () => {
          const orig = typeof inp.dataset.orig !== 'undefined' ? Number(inp.dataset.orig) : null;
          answersState[currentIndex].selectedOrigIndex = (orig !== null ? orig : null);
        };
      });
      document.getElementById('inlineProgress').textContent = `Question ${currentIndex+1} / ${renderedQuestions.length}`;
    }

    function updateTimerDisplay(){
      const timerEl = document.getElementById('inlineQuizTimer');
      if(!timerEl) return;
      // set text
      timerEl.textContent = formatHMS(timeLeftSec*1000);
      // apply classes based on thresholds
      const w = window.quizSettings.warningThresholdSec || 300;
      const d = window.quizSettings.dangerThresholdSec || 60;
      timerEl.classList.remove('timer-normal','timer-warning','timer-danger');
      if(timeLeftSec <= d) timerEl.classList.add('timer-danger');
      else if(timeLeftSec <= w) timerEl.classList.add('timer-warning');
      else timerEl.classList.add('timer-normal');
    }

    async function startTimer(){
      const timerEl = document.getElementById('inlineQuizTimer');
      if(timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(async () => {
        // update timeLeftSec using endMs (handles extra-time updates)
        timeLeftSec = Math.max(0, Math.ceil((endMs - Date.now())/1000));
        updateTimerDisplay();

        if(timeLeftSec <= 0){
          clearInterval(timerInterval);
          // show the 5-second blocking modal
          const studentName = sData?.fullName || sData?.name || '';
          const studentIdStr = String(studentId);
          const classStr = String(classId || '');
          const msg = `Time has ended for this quiz.\nStudent: ${studentName || '(unknown)'} · ID: ${studentIdStr} · Class: ${classStr}\n\nYou can Submit what you answered so far (we will grade those answers) or Cancel to discard your work. If you Cancel, you will receive 0 points for this quiz.`;
          const choice = await showTimedDecisionModal(msg, 5);

          if(choice === 'submit' || choice === 'auto'){
            await submitResponses();
            // show reload banner (configurable)
            showReloadBanner('Answers saved — showing summary. Page will refresh to update lists.', window.quizSettings.autoRefreshDelaySec || 3);
          } else if(choice === 'cancel'){
            if(typeof renderQuizzesForStudent === 'function') renderQuizzesForStudent(studentId);
            setTimeout(()=>{ try{ location.reload(); }catch(e){} }, 1500);
          }
        }
      }, 1000);
    }

    async function submitResponses(){
      // grade and build payload
      const answersPayload = [];
      let total = 0, answeredCount = 0, skippedCount = 0, correctCount = 0, incorrectCount = 0;
      for(let i=0;i<renderedQuestions.length;i++){
        const selOrig = answersState[i].selectedOrigIndex;
        const q = renderedQuestions[i];
        const pts = q.points || 1;
        const isAnswered = (selOrig !== null && typeof selOrig !== 'undefined');
        if(isAnswered) answeredCount++; else skippedCount++;
        const isCorrect = isAnswered && (q.origCorrectIndex !== null) && (Number(selOrig) === Number(q.origCorrectIndex));
        const got = isCorrect ? pts : 0;
        if(isCorrect) correctCount++; else if(isAnswered) incorrectCount++;
        total += got;
        answersPayload.push({
          questionRenderedIndex: i,
          questionOriginalIndex: q.origQuestionIndex,
          selectedOriginalIndex: selOrig,
          selectedText: (function(){
            if(selOrig === null || typeof selOrig === 'undefined') return null;
            const origQ = origQuestions[q.origQuestionIndex] || {};
            const origC = (origQ.choices || [])[selOrig];
            if(typeof origC !== 'undefined') return origC;
            const rc = q.renderedChoices.find(rc => Number(rc.origIndex) === Number(selOrig));
            return rc ? rc.text : null;
          })(),
          correctIndex: q.origCorrectIndex,
          pointsGot: got,
          pointsPossible: pts
        });
      }

      const payload = {
        quizId: quiz.id,
        quizTitle: quiz.title || '',
        studentId: String(studentId),
        studentName: sData?.fullName || sData?.name || '',
        classId,
        answers: answersPayload,
        score: total,
        maxScore: renderedQuestions.reduce((s,q)=> s + (q.points||1),0),
        createdAt: Timestamp.now(),
        answeredCount, skippedCount, correctCount, incorrectCount
      };

      try {
        await addDoc(collection(db,'quiz_responses'), payload);
        toast && toast('Quiz submitted');
        // show summary inline
        resultArea.innerHTML = renderStudentSummaryInline(payload, quiz, sData);
        // show reload banner
        showReloadBanner('Answers saved — showing summary. Page will refresh to update lists.', window.quizSettings.autoRefreshDelaySec || 3);
      } catch(e){
        console.error('submitResponses failed', e);
        toast && toast('Submission failed');
        resultArea.innerHTML = `<div class="card muted">Submission failed. Try again.</div>`;
      } finally {
        if(typeof quizDocUnsub === 'function') try{ quizDocUnsub(); }catch(e){}
        if(timerInterval) clearInterval(timerInterval);
      }
    }

    // realtime listener for extra time (and toast notification)
    if(typeof onSnapshot === 'function'){
      try {
        const qDocRef = doc(db,'quizzes',quiz.id);
        quizDocUnsub = onSnapshot(qDocRef, snap => {
          if(!snap.exists()) return;
          const data = snap.data();
          const prevEnd = endMs;
          quiz = { id: snap.id, ...data };
          const newEndMs = toMs(data.endAt) || (toMs(data.startAt) || toMs(data.createdAt) || startMs) + (Number(data.durationMinutes||quiz.durationMinutes||0) * 60*1000);
          if(newEndMs && newEndMs !== prevEnd){
            const deltaMs = newEndMs - prevEnd;
            endMs = newEndMs;
            // update timeLeft and UI
            timeLeftSec = Math.max(0, Math.ceil((endMs - Date.now())/1000));
            updateTimerDisplay();
            // show toast describing extra time added
            if(deltaMs > 0){
              const minsAdded = Math.ceil(deltaMs / 60000);
              toast && toast(`Teacher added ${minsAdded} minute(s). Your timer has been updated.`);
            }
          }
        });
      } catch(e){
        console.warn('realtime quiz listener failed', e);
        quizDocUnsub = null;
      }
    }

    // render & start
    renderInline();
    startTimer();

    // helper
    function formatHMS(ms){ if(ms<=0) return '00:00:00'; const s = Math.floor(ms/1000); const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); const r = s%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`; }

  } catch(err){
    console.error('openTakeQuizInline', err);
    resultArea.innerHTML = `<div class="card muted">Failed to open quiz.</div>`;
    if(typeof quizDocUnsub === 'function') try{ quizDocUnsub(); }catch(e){}
    if(timerInterval) try{ clearInterval(timerInterval); }catch(e){}
  }
}
window.openTakeQuizInline = openTakeQuizInline;




// ------------------ Cards + Remember logic ------------------
// global selected mode (defaults to exam)
let selectedMode = 'exam';
const cardsRow = document.getElementById('cardsRow');
const showCardsBtn = document.getElementById('showCardsBtn');
const rememberCheckbox = document.getElementById('rememberCheckbox');

// load remembered id on page load
(function loadRememberedId(){
  try {
    const stored = localStorage.getItem('rememberedStudentId');
    if (stored) {
      studentIdInput.value = stored;
      if(rememberCheckbox) rememberCheckbox.checked = true;
    }
  } catch(e){ console.warn('remember load failed', e); }
})();

// when checkbox changed, update storage (but only store a valid id)
if(rememberCheckbox){
  rememberCheckbox.addEventListener('change', () => {
    try {
      const val = studentIdInput.value.trim();
      if(rememberCheckbox.checked && val){
        localStorage.setItem('rememberedStudentId', val);
      } else {
        localStorage.removeItem('rememberedStudentId');
      }
    } catch(e){ console.warn(e); }
  });
}

// helper: hide & show cards
function hideCardsUI(){
  if(cardsRow) cardsRow.style.display = 'none';
  if(showCardsBtn) showCardsBtn.style.display = 'inline-block';
}
function showCardsUI(){
  if(cardsRow) cardsRow.style.display = 'flex';
  if(showCardsBtn) showCardsBtn.style.display = 'none';
}

// wire show cards button
if(showCardsBtn){
  showCardsBtn.addEventListener('click', () => {
    showCardsUI();
  });
}

// wire the individual cards
document.querySelectorAll('.mode-card').forEach(card => {
  card.addEventListener('click', async (e) => {
    e.preventDefault();
    const mode = card.dataset.mode || 'exam';
    selectedMode = mode;

    // ensure ID present
    const id = studentIdInput.value.trim();
    if(!id){
      message.textContent = 'Fadlan geli ID sax ah oo ka hor tag sanduuqa.';
      studentIdInput.focus();
      return;
    } else {
      message.textContent = '';
    }

    // if remember checked, save
    try { if(rememberCheckbox && rememberCheckbox.checked) localStorage.setItem('rememberedStudentId', id); } catch(e){}

    // perform action similar to the search button, but using the selected card
    showLoader();
    try {
      if(mode === 'test'){
        sessionStorage.setItem('visitorStudentId', id);
        // hide cards for UX
        hideCardsUI();
        window.location.href = 'leaderboard.html';
        return;
      }
      if(mode === 'payments'){
        await renderStudentTransactionsModal(id);
        hideCardsUI();
        return;
      }
      if(mode === 'attendance'){
        await renderStudentAttendanceModal(id);
        hideCardsUI();
        return;
      }
// -------- TIMETABLE (STUDENT) --------
if(mode === 'timetable'){
  hideCardsUI();
  showLoader && showLoader();

  try {
    const sDoc = await getDoc(doc(db,'students', id));
    if(!sDoc.exists()){
      toast('Student not found');
      hideLoader && hideLoader();
      return;
    }

    // accept many forms (classId, class, className)
    const cls = sDoc.data().classId || sDoc.data().class || sDoc.data().className;
    if(!cls){
      toast('No class assigned');
      hideLoader && hideLoader();
      return;
    }

    // call the viewer. it will handle published check + print button
    await renderTimetableViewerForStudent(String(cls).trim());
  } catch(err){
    console.error('Student timetable error', err);
    toast('Failed to load timetable');
  } finally {
    hideLoader && hideLoader();
  }

  return;
}
if(mode === 'quizzes'){
  hideCardsUI();
  const id = studentIdInput.value.trim();
  if(!id){ message.textContent = 'Fadlan geli ID sax ah.'; studentIdInput.focus(); hideLoader(); return; }
  await renderQuizzesForStudent(id);
  hideLoader();
  return;
}


      // exam flow
      if(mode === 'exam'){
        const latestSnap = await getDoc(doc(db,'studentsLatest', id));
        let latest = latestSnap.exists() ? latestSnap.data() : null;
        if(latest && !latest.motherName){
          try{
            const sSnap = await getDoc(doc(db,'students', id));
            if(sSnap.exists()){
              const sData = sSnap.data();
              if(sData?.motherName) latest.motherName = sData.motherName;
            }
          }catch(e){ console.warn(e); }
        }
        if(!latest){
          const alt = await fallbackFindLatestExamTotal(id);
          if(!alt){
            message.textContent = 'Natiijo la heli waayey. Fadlan hubi ID-ga.';
            hideLoader();
            return;
          }
          await renderResult(alt, { source: 'examTotals' });
          hideLoader();
          hideCardsUI();
          return;
        }
        if(latest.blocked){
          resultArea.style.display='block';
          resultArea.innerHTML = `<div class="card"><h2>Access blocked</h2><p>${escapeHtml(latest.blockMessage || 'You are not allowed to view results.')}</p></div>`;
          hideLoader();
          hideCardsUI();
          return;
        }
        const alt = await fallbackFindLatestExamTotal(id);
        if(alt && alt.publishedAt && latest.publishedAt){
          const altSeconds = alt.publishedAt.seconds || Date.parse(alt.publishedAt)/1000;
          const latestSeconds = latest.publishedAt.seconds || Date.parse(latest.publishedAt)/1000;
          if(altSeconds > latestSeconds){
            await renderResult(alt, { source: 'examTotals' });
            hideLoader();
            hideCardsUI();
            return;
          }
        }
    

        await renderResult(latest, { source: 'AL-Fatxi School' });
        setHeaderStudentNameById(id);

        // NEW: also render announcements for this student (safe: uses existing function)
        try {
          const sDoc = await getDoc(doc(db,'students', id));
          const studentObj = sDoc.exists() ? {
            id,
            fullName: sDoc.data().name || sDoc.data().fullName || '',
            classId: sDoc.data().classId || sDoc.data().class || sDoc.data().className || '',
            balance: sDoc.data().balance_cents ?? sDoc.data().balance ?? 0
          } : { id };
          // call function you already added earlier
          renderAnnouncementsForStudent(studentObj).catch(e => console.warn('ann render error', e));
        } catch(e){
          console.warn('ann render fetch student failed', e);
        }

        hideLoader();
        hideCardsUI();
        return;

      }
      // NEW: announcements card behavior
      if (mode === 'announcements') {
        // hide cards right away so UI matches other cards
        hideCardsUI();

        // load student profile (so renderAnnouncementsForStudent has balance + class info)
        try {
          const sDoc = await getDoc(doc(db, 'students', id));
          const studentObj = sDoc.exists() ? {
            id,
            fullName: sDoc.data().name || sDoc.data().fullName || '',
            classId: sDoc.data().classId || sDoc.data().class || sDoc.data().className || '',
            balance: sDoc.data().balance_cents ?? sDoc.data().balance ?? 0
          } : { id };

          // render announcements (function you already added earlier)
          // don't await too long — function shows modal or renders into resultArea
          await renderAnnouncementsForStudent(studentObj);
        } catch (err) {
          console.warn('Announcements load failed', err);
        } finally {
          hideLoader();
        }
        return;
      }

      
    } catch(err){
      console.error('Card action failed', err);
      message.textContent = 'Khalad ayaa dhacay. Fadlan isku day mar kale.';
      hideLoader();
    }
  });
});

// ------------------ Replace search button handler ------------------
// Use the selectedMode (card click sets it) OR default to 'exam'
// searchBtn.onclick = async () => {
//   tryUnlockAudio().catch(()=>{});
//   const studentIdVal = studentIdInput.value.trim();
//   if(!studentIdVal){
//     message.textContent = 'Fadlan geli ID sax ah.';
//     return;
//   }
//   // save preference if checked
//   try { if(rememberCheckbox && rememberCheckbox.checked) localStorage.setItem('rememberedStudentId', studentIdVal); } catch(e){}

//   // if current selectedMode is payments/attendance/test/exam, reuse same behavior as cards
//   const mode = selectedMode || 'exam';

//   // trigger same flows as cards (delegated to the card handler logic above)
//   // to avoid duplicating large code, just simulate a click on the matching card if visible
//   const card = document.querySelector(`.mode-card[data-mode="${mode}"]`);
//   if(card){
//     card.click();
//   } else {
//     // fallback — if cards not present just run exam flow
//     selectedMode = 'exam';
//     const evt = new Event('click');
//     const examCard = document.querySelector(`.mode-card[data-mode="exam"]`);
//     if(examCard) examCard.dispatchEvent(evt);
//   }
// };

export { renderResult  };
