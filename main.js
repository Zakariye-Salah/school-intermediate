// main.js (updated)
// Keep your firebase imports etc.
import { db } from './firebase-config.js';
import { doc, getDoc, getDocs, collection, query, where } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

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

/* ---------- main search click (unchanged flow) ---------- */
// searchBtn.onclick = async () => {
//   tryUnlockAudio().catch(()=>{});


//   const resultModeSelect = document.getElementById('resultModeSelect');
// // inside searchBtn.onclick:
// const mode = resultModeSelect ? resultModeSelect.value : 'exam';
// if(mode === 'test'){
//   // if student wants testing/leaderboard, pass the searched ID to leaderboard so it can auto-open verify
//   sessionStorage.setItem('visitorStudentId', studentId); // <-- add this
//   window.location.href = 'leaderboard.html';
//   return;
// }

// // otherwise continue existing exam search behaviour...

//   const studentId = studentIdInput.value.trim();
//   message.textContent = '';
//   resultArea.style.display = 'none'; resultArea.innerHTML = '';
//   if(!studentId){ message.textContent = 'Fadlan geli ID sax ah.'; return; }
//   showLoader();
//   try{
//     const latestSnap = await getDoc(doc(db,'studentsLatest', studentId));
//     let latest = latestSnap.exists() ? latestSnap.data() : null;

//     if(latest && !latest.motherName){
//       try{ const sSnap = await getDoc(doc(db,'students', studentId)); if(sSnap.exists()){ const sData = sSnap.data(); if(sData && sData.motherName) latest.motherName = sData.motherName; } }catch(e){ console.warn(e); }
//     }

//     if(!latest){
//       const alt = await fallbackFindLatestExamTotal(studentId);
//       if(!alt){ message.textContent = 'Natiijo la heli waayey. Fadlan hubi ID-ga.'; hideLoader(); return; }
//       await renderResult(alt, { source: 'examTotals' }); return;
//     }

//     if(latest.blocked){
//       resultArea.style.display='block'; resultArea.innerHTML = `<div class="card"><h2>Access blocked</h2><p>${escapeHtml(latest.blockMessage || 'You are not allowed to view results.')}</p></div>`; hideLoader(); return;
//     }

//     const alt = await fallbackFindLatestExamTotal(studentId);
//     if(alt && alt.publishedAt && latest.publishedAt){
//       const altSeconds = alt.publishedAt.seconds || (new Date(alt.publishedAt).getTime()/1000);
//       const latestSeconds = latest.publishedAt.seconds || (new Date(latest.publishedAt).getTime()/1000);
//       if(altSeconds > latestSeconds){ await renderResult(alt, { source: 'examTotals' }); return; }
//     } else if(alt && !latest.publishedAt){ await renderResult(alt, { source: 'examTotals' }); return; }

//     await renderResult(latest, { source: 'AL-Fatxi School' });

//     setHeaderStudentNameById();
//     }catch(err){
//     console.error(err); message.textContent = 'Khalad ayaa dhacay. Fadlan isku day mar kale.'; hideLoader();
//   }


searchBtn.onclick = async () => {
  tryUnlockAudio().catch(()=>{});

  // ✅ DECLARE FIRST
  const studentId = studentIdInput.value.trim();

  const resultModeSelect = document.getElementById('resultModeSelect');
  const mode = resultModeSelect ? resultModeSelect.value : 'exam';

  // validate early
  if(!studentId){
    message.textContent = 'Fadlan geli ID sax ah.';
    return;
  }

  // ✅ TEST MODE (leaderboard / quiz)
  if(mode === 'test'){
    sessionStorage.setItem('visitorStudentId', studentId);
    window.location.href = 'leaderboard.html';
    return;
  }

  // ---------------- NORMAL EXAM FLOW ----------------
  message.textContent = '';
  resultArea.style.display = 'none';
  resultArea.innerHTML = '';
  showLoader();

  try {
    const latestSnap = await getDoc(doc(db,'studentsLatest', studentId));
    let latest = latestSnap.exists() ? latestSnap.data() : null;

    if(latest && !latest.motherName){
      try{
        const sSnap = await getDoc(doc(db,'students', studentId));
        if(sSnap.exists()){
          const sData = sSnap.data();
          if(sData?.motherName) latest.motherName = sData.motherName;
        }
      }catch(e){ console.warn(e); }
    }

    if(!latest){
      const alt = await fallbackFindLatestExamTotal(studentId);
      if(!alt){
        message.textContent = 'Natiijo la heli waayey. Fadlan hubi ID-ga.';
        hideLoader();
        return;
      }
      await renderResult(alt, { source: 'examTotals' });
      return;
    }

    if(latest.blocked){
      resultArea.style.display='block';
      resultArea.innerHTML = `
        <div class="card">
          <h2>Access blocked</h2>
          <p>${escapeHtml(latest.blockMessage || 'You are not allowed to view results.')}</p>
        </div>`;
      hideLoader();
      return;
    }

    const alt = await fallbackFindLatestExamTotal(studentId);
    if(alt && alt.publishedAt && latest.publishedAt){
      const altSeconds = alt.publishedAt.seconds || Date.parse(alt.publishedAt)/1000;
      const latestSeconds = latest.publishedAt.seconds || Date.parse(latest.publishedAt)/1000;
      if(altSeconds > latestSeconds){
        await renderResult(alt, { source: 'examTotals' });
        return;
      }
    }

    await renderResult(latest, { source: 'AL-Fatxi School' });
    setHeaderStudentNameById(studentId);

  } catch(err){
    console.error(err);
    message.textContent = 'Khalad ayaa dhacay. Fadlan isku day mar kale.';
    hideLoader();
  }
};

export { renderResult , };
