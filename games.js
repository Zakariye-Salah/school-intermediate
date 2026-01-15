// games.js - updated: local JSON loading + bots list + games.css compatibility
import { auth, db } from './firebase-config.js';
import { SoundManager } from './sound.js';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import {
  collection, doc, getDoc, getDocs, query, where, addDoc, setDoc, updateDoc,
  runTransaction, serverTimestamp, orderBy, limit, onSnapshot
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

/* ---------- global caches ---------- */
let localSetsCache = []; // array of sets loaded from local JSON (math_questions_100.json etc.)
let localQuestionsIndex = null; // map title -> [questions]

/* ---------- existing variables & DOM refs ---------- */
const newGameBtn = document.getElementById('newGameBtn');
const gamesList = document.getElementById('gamesList');
const modalRoot = document.getElementById('modalRoot');
const matchRoot = document.getElementById('matchRoot');
const enterCodeInput = document.getElementById('enterCodeInput');
const codeSearchBtn = document.getElementById('codeSearchBtn');
const filterStudentsBtn = document.getElementById('filterStudentsBtn');
const filterBotsBtn = document.getElementById('filterBotsBtn');
const miniProfileTag = document.getElementById('miniProfileTag');
const statActive = document.getElementById('statActive');
const statInvites = document.getElementById('statInvites');
const statBots = document.getElementById('statBots');

const autoStartTimers = new Map(); // gameId -> timeoutId


let currentUser = null;
let currentRole = null; // 'student' | 'admin' | null
let currentStudentId = null;
let currentStudentProfile = null;

let gamesCache = [];
let botsCache = []; // preload bot profiles

const LEVEL_THRESHOLDS = [0, 10, 20, 50, 100, 150, 200, 500, 750, 1000];
const POST_LEVEL_INCREMENT = 500;
const MIN_JOIN_POINTS = 100;
const STAKES = [50,100,500,1000,2500,5000,7500,10000,15000,20000,30000,50000,100000];

/* ---------- prepare SoundManager ---------- */
SoundManager.preloadAll && SoundManager.preloadAll();

/* ---------- helpers ---------- */
function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }
function showModal(html, opts = {}) {
  modalRoot.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="modal-card">
    <div class="modal-head"><div><h3>${opts.title||''}</h3><div class="small-muted">${opts.sub||''}</div></div><div><button id="modalCloseBtn" class="btn">✕</button></div></div>
    <div class="modal-body">${html}</div>
  </div></div>`;
  modalRoot.classList.remove('hidden'); modalRoot.removeAttribute('aria-hidden');
  document.getElementById('modalCloseBtn').onclick = () => closeModal();
  if(typeof opts.onOpen === 'function') opts.onOpen();
}
function closeModal(){ modalRoot.innerHTML=''; modalRoot.classList.add('hidden'); modalRoot.setAttribute('aria-hidden','true'); }

function nowMillis() {
  return Date.now(); // number
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function toast(msg, t = 2800){ const el = document.createElement('div'); el.className='card'; el.style.position='fixed'; el.style.right='18px'; el.style.bottom='18px'; el.style.zIndex=5000; el.textContent = msg; document.body.appendChild(el); setTimeout(()=>el.remove(),t); }
function maskId(id){ if(!id) return '—'; const s=String(id); if(s.length<=4) return '*'.repeat(s.length); return '***'+s.slice(-4); }
function getVerifiedRole(){ return sessionStorage.getItem('verifiedRole') || localStorage.getItem('verifiedRole') || null; }
function getVerifiedStudentId(){ return sessionStorage.getItem('verifiedStudentId') || localStorage.getItem('verifiedStudentId') || null; }
function getVerifiedStudentName(){ return sessionStorage.getItem('verifiedStudentName') || localStorage.getItem('verifiedStudentName') || ''; }

// Fetch freshest student profile and fallbacks (competitionScores) if needed
async function refreshStudentProfile() {
  if(!currentStudentId) return null;
  let prof = currentStudentProfile || {};
  try {
    const sSnap = await getDoc(doc(db, 'students', currentStudentId));
    if (sSnap.exists()) {
      prof = sSnap.data();
      // accept different point field names
      prof.totalPoints = Number(prof.totalPoints ?? prof.points ?? 0);
      currentStudentProfile = prof;
    }
  } catch (e) {
    console.warn('refresh student doc failed', e);
  }

  // if points are 0 or missing, try competitionScores fallback (leaderboard)
  const pts = Number(prof.totalPoints || 0);
  if(pts <= 0) {
    try {
      // try to find best available competitionScore for this student
      const q = query(collection(db, 'competitionScores'), where('studentId', '==', currentStudentId), orderBy('points','desc'), limit(1));
      const snaps = await getDocs(q);
      if (snaps.size > 0) {
        const docSnap = snaps.docs[0];
        const cs = docSnap.data();
        const csPoints = Number(cs.points || 0);
        if (csPoints > pts) {
          // write back to students doc as a non-destructive helpful sync (optional)
          try { 
            await updateDoc(doc(db,'students', currentStudentId), { totalPoints: csPoints, updatedAt: serverTimestamp() });
          } catch(e){ /* ignore write failures (security rules) */ }
          // ensure local profile shows accurate points
          currentStudentProfile = { ...(currentStudentProfile||{}), totalPoints: csPoints };
        }
      }
    } catch(e){
      console.warn('competitionScores fallback failed', e);
    }
  }

  // final ensure numeric
  currentStudentProfile = currentStudentProfile || {};
  currentStudentProfile.totalPoints = Number(currentStudentProfile.totalPoints || 0);
  return currentStudentProfile;
}


// Helper to mark current active game for this client (helps re-join/leave checks)
function setLocalActiveGame(gameId) {
  try { localStorage.setItem('currentActiveGame', gameId || ''); } catch(e){}
}
function getLocalActiveGame() {
  try { return localStorage.getItem('currentActiveGame') || null; } catch(e){ return null; }
}
function clearLocalActiveGame() {
  try { localStorage.removeItem('currentActiveGame'); } catch(e){}
}

// Small helper to format the creator line the way you requested
function formatCreatorLine(game) {
  const id = game.creatorId || '';
  const masked = maskId(id); // returns '***1234' but we show **last4 per your preference
  const last4 = String(id).slice(-4);
  const idDisplay = last4 ? `**${last4}` : masked;
  const name = game.creatorName || '—';
  const stake = Number(game.stake || 0);
  const secs = Number(game.secondsPerQuestion || 15);
  return `${idDisplay} • ${escapeHtml(name)} • Stakes ${stake} pts • ${secs}s`;
}

/* ---------- local JSON loader (your function, integrated) ---------- */
async function loadLocalTestSets() {
  const paths = ['./math_questions_100.json', '/math_questions_100.json', './data/math_questions_100.json', '/data/math_questions_100.json'];
  for (const p of paths) {
    try {
      const res = await fetch(p, { cache: "no-store" });
      if (!res.ok) continue;
      const json = await res.json();
      if (json && Array.isArray(json.sets) && json.sets.length) {
        // normalize sets to have id/title/questions
        const sets = json.sets.map(s => ({ id: s.id || (s.title? s.title.replace(/\s+/g,'_').toLowerCase():undefined), title: s.title || s.id || '', questions: s.questions || s.questions || [], ...s }));
        return sets;
      }
    } catch (err) { /* try next */ }
  }
  return null;
}

/* ---------- load bots (unchanged but ensure 10) ---------- */
async function loadBots(){
  try {
    const snaps = await getDocs(collection(db,'bots'));
    if(snaps.size){
      botsCache = snaps.docs.map(d => ({ id:d.id, ...d.data() }));
    }
  } catch(e){ console.warn('loadBots failed', e); }
  if(botsCache.length === 0){
    botsCache = [
      { id:'bot1', name:'Bot Easy 1', difficultyTag:'easy', level:1, accuracyEstimate:0.65, wins:0, losses:0 },
      { id:'bot2', name:'Bot Easy 2', difficultyTag:'easy', level:2, accuracyEstimate:0.70, wins:0, losses:0 },
      { id:'bot3', name:'Bot Normal', difficultyTag:'normal', level:3, accuracyEstimate:0.8, wins:0, losses:0 },
      { id:'bot4', name:'Bot Normal+', difficultyTag:'normal+', level:4, accuracyEstimate:0.84, wins:0, losses:0 },
      { id:'bot5', name:'Bot Intermediate', difficultyTag:'intermediate', level:5, accuracyEstimate:0.86, wins:0, losses:0 },
      { id:'bot6', name:'Bot Advanced', difficultyTag:'advanced', level:6, accuracyEstimate:0.9, wins:0, losses:0 },
      { id:'bot7', name:'Bot Pro', difficultyTag:'pro', level:7, accuracyEstimate:0.93, wins:0, losses:0 },
      { id:'bot8', name:'Bot Pro+', difficultyTag:'pro+', level:8, accuracyEstimate:0.95, wins:0, losses:0 },
      { id:'bot9', name:'Bot Ultra', difficultyTag:'ultra', level:9, accuracyEstimate:0.97, wins:0, losses:0 },
      { id:'bot10', name:'Bot Ultra Pro Max', difficultyTag:'ultra+', level:10, accuracyEstimate:0.99, wins:0, losses:0, nearUnbeatable:true }
    ];
  }
  document.getElementById('statBots').textContent = botsCache.length;
}

/* ---------- startup / auth ---------- */
onAuthStateChanged(auth, async user => {
  currentUser = user;
  const vrole = getVerifiedRole();
  if(vrole === 'student'){ currentRole = 'student'; currentStudentId = getVerifiedStudentId(); }
  else if(vrole === 'admin'){ currentRole = 'admin'; }
  await initPage();
});

/* ---------- header buttons and profile edit ---------- */
function injectHeaderButtons(){
  // try to find manageCompBtn parent to append buttons
  try {
    const manageBtn = document.getElementById('manageCompBtn');
    const parent = manageBtn ? manageBtn.parentNode : document.querySelector('.comp-actions');
    if(!parent) return;
    // avoid duplicates
    if(document.getElementById('goToGamesBtn')) return;

    // Game button (visible only to verified students)
    const gameBtn = document.createElement('button');
    gameBtn.id = 'goToGamesBtn';
    gameBtn.className = 'btn';
    gameBtn.textContent = 'Games';
    gameBtn.onclick = () => { window.location.href = 'games.html'; };

    // Leaderboard button
    const lbBtn = document.createElement('button');
    lbBtn.id = 'goToLeaderboardBtn';
    lbBtn.className = 'btn';
    lbBtn.textContent = 'Leaderboard';
    lbBtn.onclick = () => { window.location.href = 'leaderboard.html'; };

    // Gear/profile button
    const gear = document.createElement('button');
    gear.id = 'profileGearBtn';
    gear.className = 'btn';
    gear.title = 'Edit profile';
    gear.innerHTML = '⚙';
    gear.onclick = () => {
      const vrole = getVerifiedRole();
      if(vrole !== 'student') { toast('Verify as a student to edit profile'); return; }
      openEditProfileModal();
    };

    // Only show Games button for verified students
    parent.appendChild(lbBtn);
    parent.appendChild(gameBtn);
    parent.appendChild(gear);
    // show/hide based on verification every time
    const refreshVisibility = () => {
      const v = getVerifiedRole();
      gameBtn.style.display = v === 'student' ? '' : 'none';
      lbBtn.style.display = v ? '' : 'none';
      gear.style.display = v === 'student' ? '' : 'none';
    };
    refreshVisibility();
    // watch storage changes (user may verify)
    window.addEventListener('storage', refreshVisibility);
  } catch(e){ console.warn('injectHeaderButtons failed', e); }
}


function showRequestSidebar(game){
  // create a small top-right sidebar with cancel button
  hideRequestSidebar(game.id); // ensure only one exists per game
  const div = document.createElement('div');
  div.id = 'requestSidebar';
  div.dataset.gameId = game.id;
  div.style.position = 'fixed';
  div.style.top = '18px';
  div.style.right = '18px';
  div.style.zIndex = 6000;
  div.style.background = '#fff';
  div.style.border = '1px solid #e6eef8';
  div.style.padding = '10px';
  div.style.borderRadius = '8px';
  div.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
  div.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px">Request sent</div>
    <div class="small-muted" style="margin-bottom:8px">Waiting for ${escapeHtml(game.creatorName || 'creator')} to accept</div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="cancelRequestSidebarBtn" class="btn">Cancel</button>
      <button id="closeRequestSidebarBtn" class="btn btn-primary">Close</button>
    </div>
  `;
  document.body.appendChild(div);
  document.getElementById('closeRequestSidebarBtn').onclick = () => { div.remove(); };
  document.getElementById('cancelRequestSidebarBtn').onclick = async () => {
    try {
      await cancelJoinRequest(game.id);
      hideRequestSidebar(game.id);
      toast('Request canceled');
    } catch(e){ console.warn('cancel via sidebar failed', e); toast('Cancel failed'); }
  };
}

function hideRequestSidebar(gameId){
  const el = document.getElementById('requestSidebar');
  if(!el) return;
  if(gameId && el.dataset.gameId && String(el.dataset.gameId) !== String(gameId)) return; // other game
  el.remove();
}

let activeMatchUnsub = null;

function watchMyActiveMatch() {
  if (activeMatchUnsub) return;

  const me = getVerifiedStudentId();
  if (!me) return;

  const q = query(
    collection(db, 'games'),
    where('status', '==', 'playing')
  );

  activeMatchUnsub = onSnapshot(q, snap => {
    snap.forEach(d => {
      const g = d.data();
      if (!g || !Array.isArray(g.players)) return;

      const isPlayer = g.players.some(
        p => String(p.playerId) === String(me)
      );

      if (isPlayer && g.matchId) {
        console.log('[RECONNECT] Opening active match', g.matchId);
        openMatchOverlay(d.id);
      }
    });
  }, err => console.warn('watchMyActiveMatch error', err));
}



/* ---------- Edit profile modal (avatar select & save) ---------- */
function openEditProfileModal(){
  const vId = getVerifiedStudentId();

  if(!vId) return toast('Verify first');
  // build avatar grid for assets/avatar1.png .. avatar10.png
  let optionsHtml = '<div style="display:flex;flex-wrap:wrap;gap:8px">';
  for(let i=1;i<=10;i++){
    const src = `assets/avatar${i}.png`;
    optionsHtml += `<label style="cursor:pointer"><input type="radio" name="avatarPick" value="${src}" style="display:none"><img src="${src}" data-src="${src}" style="width:64px;height:64px;border-radius:8px;border:2px solid transparent;object-fit:cover" class="avatar-pick" /></label>`;
  }
  optionsHtml += '</div>';
  optionsHtml += `<div style="margin-top:8px"><label>Avatar frame (name): <input id="avatarFrameInput" class="input-small" placeholder="frame_level_1"></label></div>`;
  optionsHtml += `<div style="text-align:right;margin-top:10px"><button id="cancelProfileEdit" class="btn">Cancel</button> <button id="saveProfileEdit" class="btn btn-primary">Save</button></div>`;

  showModal(optionsHtml, { title: 'Edit profile' });

  // pre-select current avatar if exists
  const currentAvatar = currentStudentProfile?.avatar || null;
  if(currentAvatar){
    const all = modalRoot.querySelectorAll('.avatar-pick');
    all.forEach(img => {
      if(img.dataset.src === currentAvatar || img.src.endsWith(currentAvatar.split('/').pop())){
        img.style.borderColor = '#2563eb';
        const radio = img.previousElementSibling;
        if(radio) radio.checked = true;
      }
    });
  }

  // wire image clicks
  modalRoot.querySelectorAll('.avatar-pick').forEach(img => {
    img.onclick = () => {
      // clear borders then highlight
      modalRoot.querySelectorAll('.avatar-pick').forEach(i => i.style.borderColor = 'transparent');
      img.style.borderColor = '#2563eb';
      const radio = img.previousElementSibling;
      if(radio) radio.checked = true;
    };
  });

  // fill avatarFrame input with current value
  const frameInput = modalRoot.querySelector('#avatarFrameInput');
  if(frameInput) frameInput.value = currentStudentProfile?.avatarFrame || '';

  document.getElementById('cancelProfileEdit').onclick = closeModal;
  document.getElementById('saveProfileEdit').onclick = async () => {
    const sel = modalRoot.querySelector('input[name="avatarPick"]:checked');
    const frame = document.getElementById('avatarFrameInput').value.trim() || null;
    if(!sel){ alert('Choose an avatar'); return; }
    const avatarSrc = sel.value;
    try {
      await updateDoc(doc(db,'students', vId), { avatar: avatarSrc, avatarFrame: frame, updatedAt: serverTimestamp() });
      // refresh local profile cache from authoritative doc
      const sSnap = await getDoc(doc(db,'students', vId));
      if(sSnap.exists()) currentStudentProfile = sSnap.data();
      toast('Profile updated');
      closeModal();
      renderHeaderMiniProfile();
    } catch(e){ console.error('save profile failed', e); alert('Save failed'); }
  };
}



async function initPage(){
  // try to load local sets first
  try {
    const localSets = await loadLocalTestSets();
    if(localSets && localSets.length){
      localSetsCache = localSets;
      // build index title -> questions
      localQuestionsIndex = {};
      for(const s of localSetsCache){
        const title = (s.title || s.id || 'Unknown').toString();
        localQuestionsIndex[title] = (localQuestionsIndex[title] || []).concat((s.questions || []).map((q, idx) => ({ ...q, title, _setId: s.id, _idx: idx })));
      }
    }
  } catch(e){ console.warn('local sets load failed', e); }

  await loadBots();

  // refresh student profile from Firestore (authoritative)
  if(currentRole === 'student' && currentStudentId){
    try {
      await refreshStudentProfile(); // ensures currentStudentProfile is freshest (and syncs fallback)
    } catch(e){ console.warn('refreshStudentProfile failed', e); }
  }

  // render header mini-profile (uses currentStudentProfile)
  renderHeaderMiniProfile();
  subscribeNotificationsForCurrentStudent()

  // inject header buttons (leaderboard/games/gear) if page has appropriate container
  injectHeaderButtons();

  // Ensure the page-level settings button (#settingsBtn) is visible and wired
  const settingsBtnEl = document.getElementById('settingsBtn');
  if(settingsBtnEl){
    // make sure it is visible and accessible
    settingsBtnEl.style.display = (currentRole === 'student') ? '' : 'none';
    settingsBtnEl.style.visibility = (currentRole === 'student') ? 'visible' : 'hidden';
    settingsBtnEl.onclick = () => {
      const vrole = getVerifiedRole();
      if(vrole !== 'student') { toast('Verify as a student to edit profile'); return; }
      openEditProfileModal();
    };
  }

  // show/hide newGame button for verified students
  if(newGameBtn){
    newGameBtn.style.display = (currentRole === 'student') ? '' : 'none';
  }

  await loadGames();
    watchMyActiveMatch(); 

  subscribeStats();

  // wire UI actions
  newGameBtn.onclick = onNewGameClick;
  codeSearchBtn.onclick = onCodeSearch;
  filterStudentsBtn.onclick = () => { filterStudentsBtn.classList.add('btn-ghost'); filterBotsBtn.classList.remove('btn-ghost'); renderGames('students'); };
  filterBotsBtn.onclick = () => { filterBotsBtn.classList.add('btn-ghost'); filterStudentsBtn.classList.remove('btn-ghost'); renderGames('bots'); };
  filterStudentsBtn.classList.add('btn-ghost');
}

async function cancelJoinRequest(gameId){
  const vId = getVerifiedStudentId();
  if(!vId) return;
  try {
    const q = query(collection(db,'notifications'),
                    where('from','==', vId),
                    where('gameId','==', gameId),
                    where('type','==','join_attempt'),
                    where('seen','==', false));
    const snaps = await getDocs(q);
    if(snaps.size === 0){ toast('No active request found'); return; }
    const batch = [];
    snaps.forEach(docu => {
      // mark handled/seen
      updateDoc(doc(db,'notifications', docu.id), { seen:true, handled:true, handledAt: serverTimestamp() }).catch(()=>{});
    });
    toast('Request canceled');
    // nothing else to do
  } catch(e){
    console.warn('cancelJoinRequest failed', e);
    toast('Cancel request failed');
  }
}

async function setPlayerReady(gameId, studentId, ready){
  try {
    await runTransaction(db, async (t) => {
      const gRef = doc(db,'games', gameId);
      const gSnap = await t.get(gRef);
      if(!gSnap.exists()) throw new Error('Game missing');
      const g = gSnap.data();
      
      if (g.status !== 'waiting')
        throw new Error('Game already started');
      
      if (g.matchId)
        throw new Error('Match already created');
      
      const players = Array.isArray(g.players) ? g.players.slice() : [];
      const idx = players.findIndex(p => String(p.playerId) === String(studentId));
      if(idx === -1) throw new Error('Not a player');
      players[idx] = { ...players[idx], ready: Boolean(ready) };
      t.update(gRef, { players, updatedAt: serverTimestamp() }, { merge:true });
    });
    toast(ready ? 'Ready' : 'Unready');
  } catch(e){
    console.warn('setPlayerReady failed', e);
    throw e;
  }
}

async function leaveGame(gameId, studentId){
  try {
    await runTransaction(db, async (t) => {
      const gRef = doc(db,'games', gameId);
      const sRef = doc(db,'students', studentId);
      const gSnap = await t.get(gRef);
      if(!gSnap.exists()) throw new Error('Game missing');
      const g = gSnap.data();
      const reserved = g.reservedPoints || {};
      const players = Array.isArray(g.players) ? g.players.slice() : [];
      // remove player entry
      const idx = players.findIndex(p => String(p.playerId) === String(studentId));
      if(idx !== -1) players.splice(idx, 1);

      // if they had reserved points, refund
      const refundAmount = Number(reserved[studentId] || 0);
      if(refundAmount > 0){
        const sSnap = await t.get(sRef);
        if(sSnap.exists()){
          const before = Number((sSnap.data().totalPoints || 0));
          t.update(sRef, { totalPoints: before + refundAmount, updatedAt: serverTimestamp() });
          await addDoc(collection(db,'pointsHistory'), { userId: studentId, type:'game_refund_leave', amount: refundAmount, before, after: before + refundAmount, referenceGameId: gameId, timestamp: nowMillis() });
        }
        // remove reservation
        delete reserved[studentId];
      }

      // Do not auto-expire the game just because players.length === 0.
      // Expiry should be handled by explicit cancel or by expireAndRefund/timeouts.
      t.update(gRef, { players, reservedPoints: reserved, updatedAt: serverTimestamp() }, { merge:true });
    });

    // if the leaving user is local user, clear local active marker
    if(String(getVerifiedStudentId()) === String(studentId)) clearLocalActiveGame();
    await loadGames();
    toast('Left game — points refunded if any');
  } catch(e){
    console.warn('leaveGame failed', e);
    throw e;
  }
}



// show pending join attempts for a game (creator only)
async function showJoinRequestsForGame(gameId){
  try {
    const gSnap = await getDoc(doc(db,'games', gameId));
    if(!gSnap.exists()) return toast('Game not found');
    const g = gSnap.data();
    const me = getVerifiedStudentId();
    if(String(me) !== String(g.creatorId)) return toast('Only creator may manage requests');

    const q = query(collection(db,'notifications'),
                    where('to','==', me),
                    where('gameId','==', gameId),
                    where('type','==','join_attempt'),
                    where('seen','==', false),
                    orderBy('createdAt','desc'));
    const snaps = await getDocs(q);
    if(snaps.size === 0) return showModal(`<div class="small-muted">No requests</div>`, { title: 'Join requests' });

    let html = '<div style="display:flex;flex-direction:column;gap:8px">';
    const rows = [];
    snaps.forEach(docu => {
      const n = docu.data();
      rows.push({ notifId: docu.id, fromId: n.from, fromName: n.fromName || n.from, createdAt: n.createdAt });
    });

    for(const r of rows){
      html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div>
          <div style="font-weight:700">${escapeHtml(r.fromName)}</div>
          <div class="small-muted">ID ${escapeHtml('**'+String(r.fromId).slice(-4))}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button data-from="${escapeHtml(r.fromId)}" data-notif="${escapeHtml(r.notifId)}" class="acceptReq btn btn-primary">Accept</button>
          <button data-from="${escapeHtml(r.fromId)}" data-notif="${escapeHtml(r.notifId)}" class="acceptStartReq btn btn-success">Accept & Start</button>
          <button data-notif="${escapeHtml(r.notifId)}" class="rejectReq btn">Reject</button>
        </div>
      </div>`;
    }
    html += '</div>';
    showModal(html, { title: 'Join requests' });

    // wire actions
    modalRoot.querySelectorAll('.acceptReq').forEach(b => {
      b.onclick = async (ev) => {
        const requester = ev.currentTarget.getAttribute('data-from');
        const notifId = ev.currentTarget.getAttribute('data-notif');
        closeModal();
        try {
          await acceptJoinRequest(gameId, requester);
          // mark the handled notification
          await updateDoc(doc(db,'notifications', notifId), { seen:true, handled:true, handledAt: serverTimestamp() }).catch(()=>{});
          // notify requester (already handled in acceptJoinRequest)
          toast('Accepted and joined');
          await loadGames();
        } catch(e){ console.warn(e); toast('Accept failed'); }
      };
    });
    modalRoot.querySelectorAll('.acceptStartReq').forEach(b => {
      b.onclick = async (ev) => {
        const requester = ev.currentTarget.getAttribute('data-from');
        const notifId = ev.currentTarget.getAttribute('data-notif');
        closeModal();
        try {
          await acceptAndStartRequest(gameId, requester);
          await updateDoc(doc(db,'notifications', notifId), { seen:true, handled:true, handledAt: serverTimestamp() }).catch(()=>{});
          toast('Accepted & starting');
          await loadGames();
        } catch(e){ console.warn(e); toast('Accept & Start failed'); }
      };
    });
    modalRoot.querySelectorAll('.rejectReq').forEach(b => {
      b.onclick = async (ev) => {
        const notifId = ev.currentTarget.getAttribute('data-notif');
        try { await updateDoc(doc(db,'notifications', notifId), { seen:true, handled:true, handledAt: serverTimestamp() }); } catch(e){ }
        toast('Rejected');
        closeModal();
      };
    });

  } catch(e){ console.warn('showJoinRequestsForGame failed', e); toast('Failed to fetch requests'); }
}


// accept a request: transactionally join the requester (creator -> accept)
async function acceptJoinRequest(gameId, requesterId){
  try {
    // transactionally add requester to players + reserve stake
    await runTransaction(db, async (t) => {
      const gRef = doc(db,'games', gameId);
      const sRef = doc(db,'students', requesterId);
      const gSnap = await t.get(gRef);
      if(!gSnap.exists()) throw new Error('Game not found');
      const g = gSnap.data();
      if(g.status !== 'waiting') throw new Error('Game no longer waiting');
      const sSnap = await t.get(sRef);
      if(!sSnap.exists()) throw new Error('Requester not found');
      const sdata = sSnap.data();
      const available = Number(sdata.totalPoints || 0);
      if(available < g.stake) throw new Error('Requester has insufficient points');

      // deduct requester stake and set reserved
      const newPoints = Math.max(0, available - g.stake);
      t.update(sRef, { totalPoints: newPoints });

      const reserved = g.reservedPoints || {};
      reserved[requesterId] = (reserved[requesterId] || 0) + g.stake;

      const players = Array.isArray(g.players) ? g.players.slice() : [];
      // ensure we don't duplicate if they somehow already present
      if(!players.some(p=>String(p.playerId) === String(requesterId))){
        players.push({
          playerId: requesterId,
          joinedAt: nowSeconds(),
          playerName: sdata.name || '',
          avatarFrame: sdata.avatarFrame || null,
          className: sdata.className || '',
          ready: false
        });
      }

      t.update(gRef, { reservedPoints: reserved, players, updatedAt: serverTimestamp() }, { merge:true });

      // mark related notifications seen/handled (in-transaction read then write is okay)
      const notifQ = query(collection(db,'notifications'),
                           where('to','==', g.creatorId),
                           where('from','==', requesterId),
                           where('gameId','==', gameId),
                           where('type','==','join_attempt'));
      const notifSnaps = await getDocs(notifQ);
      notifSnaps.forEach(async nDoc => {
        try { await updateDoc(doc(db,'notifications', nDoc.id), { seen:true, handled:true, handledAt: serverTimestamp() }); } catch(e){}
      });
    });

    // After transaction: send a notification to the requester that they were accepted
    try {
      await addDoc(collection(db,'notifications'), {
        to: requesterId,
        type: 'join_accepted',
        gameId,
        gameName: (await (await getDoc(doc(db,'games',gameId))).data())?.name || '',
        from: getVerifiedStudentId(),
        fromName: getVerifiedStudentName() || '',
        createdAt: serverTimestamp(),
        seen: false,
        message: 'Your join request was accepted'
      });
    } catch(e){ console.warn('send accept notif failed', e); }

  } catch(e){
    console.warn('acceptJoinRequest failed', e);
    throw e;
  }
}


// place near top of file (global)
let notificationsUnsub = null;
const gameReadyUnsubs = new Map(); // gameId -> unsubscribe function

// Helper: watch a single game doc and if current user is the creator and ALL players.ready === true -> start match
function monitorGameReadyAndAutoStart(gameId) {
  if (!gameId) return;
  if (gameReadyUnsubs.has(gameId)) return;
  try {
    const gRef = doc(db, 'games', gameId);
    const unsub = onSnapshot(gRef, async snap => {
      if (!snap.exists()) {
        // game removed, cleanup
        if (gameReadyUnsubs.has(gameId)) { gameReadyUnsubs.get(gameId)(); gameReadyUnsubs.delete(gameId); }
        return;
      }
      const g = { id: snap.id, ...snap.data() };
      try {
        const me = getVerifiedStudentId();
        if (!me) return; // not verified -> ignore
        if (String(me) !== String(g.creatorId)) return; // only creator auto-starts
        if ((g.status || '').toString().toLowerCase() !== 'waiting') {
          // if game changed status, we can stop monitoring
          if (gameReadyUnsubs.has(gameId)) { gameReadyUnsubs.get(gameId)(); gameReadyUnsubs.delete(gameId); }
          return;
        }
        const players = Array.isArray(g.players) ? g.players : [];
        if (players.length < 2) return;
        const allReady = players.every(p => Boolean(p.ready) === true);
   
        if (!allReady && autoStartTimers.has(gameId)) {
          clearTimeout(autoStartTimers.get(gameId));
          autoStartTimers.delete(gameId);
          toast('Auto-start canceled — someone is not ready');
        }
        

        if (allReady) {
  if (autoStartTimers.has(gameId)) return;

  toast('All players ready — starting in 5 seconds ⏱');

  const timer = setTimeout(async () => {
    autoStartTimers.delete(gameId);

    // stop listener before starting
    if (gameReadyUnsubs.has(gameId)) {
      gameReadyUnsubs.get(gameId)();
      gameReadyUnsubs.delete(gameId);
    }

    try {
      await startMatchForGame(gameId);
    } catch (e) {
      console.warn('auto-start failed', e);
    }
  }, 5000);

  autoStartTimers.set(gameId, timer);
}

      } catch (e) {
        console.warn('monitorGameReadyAndAutoStart callback failed', e);
      }
    }, err => console.warn('monitorGameReadyAndAutoStart onSnapshot err', err));
    gameReadyUnsubs.set(gameId, unsub);
  } catch (e) {
    console.warn('monitorGameReadyAndAutoStart failed', e);
  }
}

// The fixed subscribeNotificationsForCurrentStudent() function
function subscribeNotificationsForCurrentStudent() {
  if (notificationsUnsub) { notificationsUnsub(); notificationsUnsub = null; }
  const to = getVerifiedStudentId();
  if (!to) return;
  try {
    const q = query(collection(db, 'notifications'), where('to', '==', to), orderBy('createdAt', 'desc'), limit(20));
    // onSnapshot callback can be async so we can await inside
    notificationsUnsub = onSnapshot(q, async snap => {
      // iterate using for..of so await works correctly
      for (const ch of snap.docChanges()) {
        try {
          if (ch.type !== 'added') continue;
          const n = ch.doc.data();
          const notifId = ch.doc.id;
          if (n && n.seen) continue;

          // Creator sees an incoming join attempt
          if (n.type === 'join_attempt') {
            toast(`Join attempt: ${n.fromName || n.from} → ${n.gameName}`);
            showModal(`
              <div>
                <div><strong>${escapeHtml(n.fromName || n.from)}</strong> tried to join your game <strong>${escapeHtml(n.gameName)}</strong>.</div>
                <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end">
                  <button id="notifAccept" class="btn btn-primary">Accept</button>
                  <button id="notifAcceptStart" class="btn btn-success">Accept & Start</button>
                  <button id="notifReject" class="btn">Reject</button>
                  <button id="notifClose" class="btn">Close</button>
                </div>
              </div>
            `, { title: 'Join attempt' });

            document.getElementById('notifClose').onclick = closeModal;

            document.getElementById('notifReject').onclick = async () => {
              try {
                await updateDoc(doc(db, 'notifications', notifId), { seen: true, handled: true, handledAt: serverTimestamp() });
              } catch (e) { console.warn('reject notif failed', e); }
              toast('Rejected');
              closeModal();
            };

            document.getElementById('notifAccept').onclick = async () => {
              closeModal();
              try {
                await acceptJoinRequest(n.gameId, n.from);
                // start monitoring for auto-start in case creator wants auto-start when both ready
                monitorGameReadyAndAutoStart(n.gameId);
                // mark the notification handled
                await updateDoc(doc(db, 'notifications', notifId), { seen: true, handled: true, handledAt: serverTimestamp() }).catch(() => {});
                toast('Accepted');
                await loadGames();
              } catch (e) { console.warn('accept failed', e); toast('Accept failed'); }
            };

            document.getElementById('notifAcceptStart').onclick = async () => {
              closeModal();
              try {
                await acceptAndStartRequest(n.gameId, n.from);
                // mark the notification handled
                await updateDoc(doc(db, 'notifications', notifId), { seen: true, handled: true, handledAt: serverTimestamp() }).catch(() => {});
                toast('Accepted & starting');
                await loadGames();
              } catch (e) { console.warn('accept&start failed', e); toast('Accept & Start failed'); }
            };

            // best-effort mark as seen (we also mark when action occurs)
            try { await updateDoc(doc(db, 'notifications', notifId), { seen: true, seenAt: serverTimestamp() }); } catch (e) { /* ignore */ }
            continue;
          }

          // Requester sees that they were accepted
          if (n.type === 'join_accepted') {
            // hide request sidebar if any
            hideRequestSidebar(n.gameId);
            toast(`Accepted: ${n.gameName}`);
            try {
              const gSnap = await getDoc(doc(db, 'games', n.gameId));
              if (!gSnap.exists()) {
                showModal(`<div class="small-muted">Game no longer available</div>`, { title: 'Request accepted' });
                // mark notif seen
                await updateDoc(doc(db, 'notifications', notifId), { seen: true, seenAt: serverTimestamp() }).catch(() => {});
                continue;
              }
              const g = { id: gSnap.id, ...gSnap.data() };

              // If match already created and game is playing -> open match directly
              if ((g.status || '').toString().toLowerCase() === 'playing' && g.matchId) {
                showModal(`
                  <div>
                    <div><strong>${escapeHtml(n.gameName)}</strong> — ${escapeHtml(n.fromName || n.from)} accepted and match started.</div>
                    <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end">
                      <button id="notifOpenGame" class="btn btn-primary">Open match</button>
                      <button id="notifClose2" class="btn">Close</button>
                    </div>
                  </div>
                `, { title: 'Request accepted' });
                document.getElementById('notifClose2').onclick = closeModal;
                document.getElementById('notifOpenGame').onclick = async () => {
                  closeModal();
                  try {
                    await openMatchOverlay(g.id);
                  } catch (e) {
                    console.warn('openMatchOverlay failed', e);
                    showGameOverview(g);
                  }
                };
                // mark notif seen
                await updateDoc(doc(db, 'notifications', notifId), { seen: true, seenAt: serverTimestamp() }).catch(() => {});
                continue;
              }

              // Otherwise: show prepare-to-play modal (Ready + Open overview)
              showModal(`
                <div>
                  <div><strong>${escapeHtml(n.gameName)}</strong> — your request was accepted by ${escapeHtml(n.fromName || n.from)}.</div>
                  <div class="small-muted" style="margin-top:8px">The creator hasn't started the match yet. Mark yourself as ready and wait for them to start.</div>
                  <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
                    <button id="notifReady" class="btn btn-primary">I'm ready</button>
                    <button id="notifOpenGame" class="btn">Open overview</button>
                    <button id="notifClose2" class="btn">Close</button>
                  </div>
                </div>
              `, { title: 'Request accepted' });

              document.getElementById('notifClose2').onclick = closeModal;
              document.getElementById('notifOpenGame').onclick = async () => {
                closeModal();
                showGameOverview(g);
              };

              document.getElementById('notifReady').onclick = async () => {
                try {
                  const me = getVerifiedStudentId();
                  if (!me) { toast('Verify as student'); return; }
                  await setPlayerReady(g.id, me, true);
                  // optionally open overview to let player watch
                  closeModal();
                  showGameOverview(g);
                } catch (e) {
                  console.warn('set ready failed', e);
                  toast('Failed to set ready');
                }
              };

              // mark notif seen
              await updateDoc(doc(db, 'notifications', notifId), { seen: true, seenAt: serverTimestamp() }).catch(() => {});
            } catch (e) {
              console.warn('open accepted game failed', e);
              showModal(`<div class="small-muted">Failed to fetch game details</div>`, { title: 'Request accepted' });
              await updateDoc(doc(db, 'notifications', notifId), { seen: true, seenAt: serverTimestamp() }).catch(() => {});
            }
            continue;
          }

          // Other notification types -> default handling
          toast(n.message || 'Notification');
          try { await updateDoc(doc(db, 'notifications', notifId), { seen: true, seenAt: serverTimestamp() }); } catch (e) { /* ignore */ }

        } catch (innerErr) {
          console.warn('notification handling inner error', innerErr);
        }
      } // end for..of
    }, err => console.warn('notif onSnapshot err', err));
  } catch (e) {
    console.warn('subscribeNotifications failed', e);
  }
}


async function acceptAndStartRequest(gameId, requesterId){
  try {
    await acceptJoinRequest(gameId, requesterId); // transactionally adds requester
    // After accept, try to start the match (startMatchForGame will pick questions and create match doc)
    try {
      await startMatchForGame(gameId);
    } catch(e){
      console.warn('start after accept failed', e);
    }
    // send an immediate "accepted_and_started" notification
    try {
      await addDoc(collection(db,'notifications'), {
        to: requesterId,
        type: 'join_started',
        gameId,
        gameName: (await (await getDoc(doc(db,'games',gameId))).data())?.name || '',
        from: getVerifiedStudentId(),
        fromName: getVerifiedStudentName() || '',
        createdAt: serverTimestamp(),
        seen: false,
        message: 'You were accepted and the match is starting'
      });
    } catch(e){ console.warn('send join_started notif failed', e); }
  } catch(e){
    console.warn('acceptAndStartRequest failed', e);
    throw e;
  }
}






subscribeNotificationsForCurrentStudent();
// update subscription on storage change (verified user switch)
window.addEventListener('storage', subscribeNotificationsForCurrentStudent);

async function expireAndRefund(game){
  try {
    // We'll collect refund details to record history AFTER transaction completes
    const refundDetails = [];

    await runTransaction(db, async (t) => {
      const gRef = doc(db,'games', game.id);
      const gSnap = await t.get(gRef);
      if(!gSnap.exists()) return;
      const g = gSnap.data();
      if(['expired','deleted','finished'].includes(g.status || '')) return;

      const reserved = g.reservedPoints || {};
      const uids = Object.keys(reserved);

      // 1) READ ALL student docs first (required by Firestore: all reads before writes)
      const studentData = {};
      for(const uid of uids){
        const sRef = doc(db,'students', uid);
        const sSnap = await t.get(sRef);
        studentData[uid] = sSnap.exists() ? sSnap.data() : null;
      }

      // 2) Now perform writes: update each student's points
      for(const uid of uids){
        const amount = Number(reserved[uid] || 0);
        if(amount <= 0) continue;
        const sRef = doc(db,'students', uid);
        const before = Number((studentData[uid]?.totalPoints) || 0);
        t.update(sRef, { totalPoints: before + amount, updatedAt: serverTimestamp() });
        refundDetails.push({ userId: uid, amount, before, after: before + amount });
      }

      // 3) Mark game expired and clear reserved/players
      t.update(gRef, { status:'expired', reservedPoints: {}, players: [], updatedAt: serverTimestamp(), expiredAt: serverTimestamp() });
    });

    // 4) After transaction: record pointsHistory entries (best-effort)
    for(const r of refundDetails){
      try {
        await addDoc(collection(db,'pointsHistory'), {
          userId: r.userId,
          type: 'game_refund_expire',
          amount: r.amount,
          before: r.before,
          after: r.after,
          referenceGameId: game.id,
          timestamp: nowMillis()
        });
      } catch(e){
        console.warn('pointsHistory add failed', e);
      }
    }

    // update local cache/UI
    gamesCache = gamesCache.filter(g => String(g.id) !== String(game.id));
    renderGames('students');
  } catch(e){
    console.warn('expireAndRefund failed', e);
  }
}





async function loadGames(){
  try {
    const q = query(collection(db,'games'), orderBy('createdAt','desc'), limit(200));
    const snaps = await getDocs(q);
    gamesCache = [];
    snaps.forEach(d => gamesCache.push({ id:d.id, ...d.data() }));

    const now = Date.now();

    // 1) expire long-dead games (expiresAt in past)
    const toExpire = gamesCache.filter(g => g.expiresAt && new Date(g.expiresAt).getTime() < now && !['expired','deleted','finished'].includes(g.status || ''));
    for(const g of toExpire){ expireAndRefund(g).catch(()=>{}); }

    // 2) special waiting-timeout: if a game is 'waiting' and was created >60s ago and still lacks opponents -> expire/refund
    const waitingTimeoutMs = 60 * 1000;
    const waitingToCancel = gamesCache.filter(g => {
      try {
        const created = g.createdAt ? (typeof g.createdAt === 'number' ? g.createdAt : (new Date(g.createdAt).getTime ? new Date(g.createdAt).getTime() : Date.parse(g.createdAt))) : 0;
        // some docs use serverTimestamp() -> object; try fallback
        const createdAtMs = created || (g.createdAt && g.createdAt.toMillis ? g.createdAt.toMillis() : 0);
        const isOld = createdAtMs && (now - createdAtMs) > waitingTimeoutMs;
        const playersCount = Array.isArray(g.players) ? g.players.length : 0;
        return g.status === 'waiting' && isOld && playersCount < 2;
      } catch(e){ return false; }
    });
    for(const g of waitingToCancel){ expireAndRefund(g).catch(()=>{}); }

    // remove deleted/expired/finished from local view and expired by created sweep above
    gamesCache = gamesCache.filter(g => !['deleted','expired','finished'].includes((g.status||'')) && !(g.expiresAt && new Date(g.expiresAt).getTime() < now));

    renderGames('students');
  } catch(e){ console.error('loadGames failed', e); toast('Failed to load games'); }
}



/* ---------- render games + bots list ---------- */
function renderGames(mode = 'students') {
  gamesList.innerHTML = '';

  // bots mode: show bots first then bot games
  if (mode === 'bots') {
    renderBotsList();
    const botGames = gamesCache.filter(g => g.opponentType === 'bot' && !isExpired(g));
    if (botGames.length === 0) {
      const el = document.createElement('div'); el.className = 'small-muted'; el.textContent = 'No active bot games — choose a bot to play.';
      gamesList.appendChild(el);
    } else {
      botGames.forEach(g => appendGameCard(g));
    }
    statActive.textContent = botGames.length;
    return;
  }

  // students mode: show only non-expired, non-deleted, non-finished games and only allowed statuses
  const allowedStatuses = new Set(['waiting', 'playing', 'open', 'pending']);
  const filtered = gamesCache.filter(g => {
    if (!g) return false;
    if (['deleted', 'expired', 'finished'].includes((g.status || '').toLowerCase())) return false;
    if (g.expiresAt && new Date(g.expiresAt).getTime() < Date.now()) return false;
    // hide bot games in students mode
    if (g.opponentType === 'bot') return false;
    // allow only known active-like statuses (fallback: if no status, treat as waiting)
    const st = (g.status || 'waiting').toString().toLowerCase();
    return allowedStatuses.has(st);
  });

  statActive.textContent = String(filtered.length);

  if (filtered.length === 0) {
    gamesList.innerHTML = `<div class="small-muted">No games found.</div>`;
    return;
  }

  filtered.forEach(g => appendGameCard(g));
}

// small helper: checks expiresAt safely
function isExpired(g) {
  try {
    return g.expiresAt && new Date(g.expiresAt).getTime() < Date.now();
  } catch (e) { return false; }
}



// --- appendGameCard (replace your existing appendGameCard) ---
// Note: list cards are intentionally minimal: Avatar / title / tag / status / Play / Info only.
function appendGameCard(g) {
  const card = document.createElement('div');
  card.className = 'game-card';

  // LEFT: avatar + meta
  const left = document.createElement('div');
  left.className = 'game-left';

  // Avatar (round)
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  const avatarUrl = g.creatorAvatar || g.creatorAvatarUrl || g.creatorFrame || g.avatar || null;
  if (avatarUrl && typeof avatarUrl === 'string' && (avatarUrl.startsWith('http') || avatarUrl.startsWith('/'))) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = (g.creatorName || 'Creator').slice(0, 20);
    img.style.width = '48px';
    img.style.height = '48px';
    img.style.borderRadius = '50%';
    img.style.objectFit = 'cover';
    avatar.appendChild(img);
  } else {
    const initials = (g.creatorName ? g.creatorName.split(' ').map(x => x[0]).join('').slice(0, 2) : '??');
    avatar.textContent = initials;
    avatar.style.width = '48px';
    avatar.style.height = '48px';
    avatar.style.borderRadius = '50%';
    avatar.style.display = 'flex';
    avatar.style.alignItems = 'center';
    avatar.style.justifyContent = 'center';
    avatar.style.fontWeight = '700';
    avatar.style.background = '#eef2f6';
    if (g.creatorFrame) avatar.classList.add(`frame-${g.creatorFrame}`);
  }

  const meta = document.createElement('div');
  meta.className = 'game-meta';

  const title = document.createElement('div');
  title.className = 'game-title';
  title.textContent = `${g.name || 'Untitled'} ${g.isPublic ? '' : '(Private)'}`;

  const sub = document.createElement('div');
  sub.className = 'game-sub small-muted';
  sub.innerHTML = `${formatCreatorLine(g)}${g.creatorClass ? ` • Class ${escapeHtml(g.creatorClass)}` : ''}`;

  meta.appendChild(title);
  meta.appendChild(sub);
  left.appendChild(avatar);
  left.appendChild(meta);

  // RIGHT: actions (minimal)
  const right = document.createElement('div');
  right.className = 'game-right';

  // Tag (Public/Private)
  const tag = document.createElement('div');
  tag.className = `tag ${g.isPublic ? 'public' : 'private'}`;
  tag.textContent = g.isPublic ? 'Public' : 'Private';
  right.appendChild(tag);

  // status single line
  const status = document.createElement('div');
  status.className = 'small-muted';
  status.style.marginTop = '6px';
  status.textContent = g.status || 'waiting';
  right.appendChild(status);

  // Play button
  const playBtn = document.createElement('button');
  playBtn.className = 'btn btn-primary';
  playBtn.textContent = '▶ Play';
  playBtn.onclick = () => onPlayClick(g);
  right.appendChild(playBtn);

  // Info button -> opens overview modal (all actions there)
  const infoBtn = document.createElement('button');
  infoBtn.className = 'btn';
  infoBtn.textContent = 'ℹ';
  infoBtn.onclick = () => showGameOverview(g);
  right.appendChild(infoBtn);

  // assemble
  card.appendChild(left);
  card.appendChild(right);
  gamesList.appendChild(card);
}





async function openCreatorProfileForGame(game){
  try {
    const studentId = game.creatorId;
    const sSnap = await getDoc(doc(db,'students', studentId));
    if(!sSnap.exists()){
      // still show minimal game info if profile not found
      const html = `<div><div><strong>${escapeHtml(game.name)}</strong></div><div class="small-muted">Creator: ${escapeHtml(game.creatorName||'—')}</div><div style="margin-top:8px">Stakes: ${game.stake} • Seconds: ${game.secondsPerQuestion}</div><div style="text-align:right;margin-top:8px"><button id="closeView" class="btn btn-primary">Close</button></div></div>`;
      showModal(html, { title:'Game / Creator' });
      document.getElementById('closeView').onclick = closeModal;
      return;
    }
    const p = sSnap.data();
    const name = p.name || p.displayName || p.fullName || '—';
    const className = p.className || p.class || p.cls || '—';
    const idMasked = `**${String(studentId).slice(-4)}`;
    const avatarHtml = p.avatar ? `<img src="${escapeHtml(p.avatar)}" style="width:80px;height:80px;border-radius:8px;object-fit:cover" alt="avatar">`
                                : `<div class="avatar-initials" style="width:80px;height:80px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:#eef2f6;font-weight:700;font-size:20px">${escapeHtml((name||'').slice(0,2))}</div>`;

    // fetch small game history (best-effort) — use student's stats fields
    const level = p.level || 1;
    const points = Number(p.totalPoints || 0);
    const wins = Number(p.totalWins || 0);
    const gamesPlayed = Number(p.totalGames || 0);
    const losses = Number(p.totalLosses || 0);

    // build modal HTML
    let html = `<div style="display:flex;gap:12px;align-items:center">
      <div>${avatarHtml}</div>
      <div>
        <div style="font-weight:800">${escapeHtml(name)}</div>
        <div class="small-muted">ID ${escapeHtml(idMasked)} • Class ${escapeHtml(className)}</div>
        <div class="small-muted" style="margin-top:8px">Level: ${level} • Games: ${gamesPlayed} • Wins: ${wins} • Losses: ${losses} • Points: ${points}</div>
      </div>
    </div>`;

    // show a short game summary under profile
    html += `<div style="margin-top:10px"><strong>Game:</strong> ${escapeHtml(game.name || '—')} <div class="small-muted">Titles: ${escapeHtml((game.titles||[]).join(', '))}</div></div>`;

    // bottom buttons: if viewer is creator show Code / Edit / Delete, else just Close
    const me = getVerifiedStudentId();
    if(String(me) === String(studentId)){
      const codeLine = game.isPublic ? '' : `<div style="margin-top:8px">Code: <strong>${escapeHtml(game.code || '—')}</strong></div>`;
      html += `${codeLine}<div style="text-align:right;margin-top:10px"><button id="editGameBtn" class="btn">Edit</button> <button id="delGameBtn" class="btn">Delete</button> <button id="closeViewBtn" class="btn btn-primary">Close</button></div>`;
      showModal(html, { title:'Creator & Game' });
      document.getElementById('editGameBtn').onclick = () => { closeModal(); openEditGameModal(game); };
      document.getElementById('delGameBtn').onclick = () => { closeModal(); deleteGameConfirm(game); };
      document.getElementById('closeViewBtn').onclick = closeModal;
    } else {
      html += `<div style="text-align:right;margin-top:10px"><button id="cancelViewBtn" class="btn">Cancel</button> <button id="closeViewBtn" class="btn btn-primary">Close</button></div>`;
      showModal(html, { title:'Creator & Game' });
      document.getElementById('cancelViewBtn').onclick = closeModal;
      document.getElementById('closeViewBtn').onclick = closeModal;
    }
  } catch(e){
    console.error('openCreatorProfileForGame failed', e);
    toast('Failed to open profile');
  }
}

/* ---------- render bots list ---------- */
function renderBotsList(){
  // header row
  const header = document.createElement('div');
  header.style.display='flex';
  header.style.justifyContent='space-between';
  header.style.alignItems='center';
  header.style.marginBottom='0.4rem';
  const hleft = document.createElement('div'); hleft.style.fontWeight='800'; hleft.textContent = 'Bots (harder bots only)';
  const hright = document.createElement('div'); hright.className='small-muted'; hright.textContent = `${botsCache.length} total`;
  header.appendChild(hleft); header.appendChild(hright);
  gamesList.appendChild(header);

  // filter: show only bots with level >= 6 (the five hardest + ultra)
  const hardBots = botsCache.filter(b => Number(b.level || 0) >= 1);

  // bot cards grid
  const grid = document.createElement('div');
  grid.style.display='grid';
  grid.style.gridTemplateColumns='repeat(auto-fit,minmax(220px,1fr))';
  grid.style.gap='0.5rem';
  for(const b of hardBots){
    const c = document.createElement('div'); c.className='game-card';
    c.style.alignItems='center';
    const left = document.createElement('div'); left.className='game-left';
    const av = document.createElement('div'); av.className='avatar'; av.textContent = (b.name||'B').split(' ').map(x=>x[0]).join('').slice(0,2);
    const meta = document.createElement('div'); meta.className='game-meta';
    const t = document.createElement('div'); t.className='game-title'; t.textContent = `${b.name} (${b.difficultyTag})`;
    const s = document.createElement('div'); s.className='game-sub small-muted'; s.textContent = `Level ${b.level} • Est. acc ${Math.round((b.accuracyEstimate||0)*100)}% • Stake: 50`;
    meta.appendChild(t); meta.appendChild(s); left.appendChild(av); left.appendChild(meta);
    const right = document.createElement('div'); right.className='game-right';
    const playBtn = document.createElement('button'); playBtn.className='btn btn-primary'; playBtn.textContent='▶ Play'; 
    playBtn.onclick = () => onPlayBotNow(b);
    const infoBtn = document.createElement('button'); infoBtn.className='btn'; infoBtn.textContent='ℹ'; infoBtn.onclick = () => showBotOverview(b);
    right.appendChild(playBtn); right.appendChild(infoBtn);
    c.appendChild(left); c.appendChild(right); grid.appendChild(c);
  }
  gamesList.appendChild(grid);
}


/* ---------- quick bot helpers ---------- */
function showBotOverview(bot){
  const html = `<div><div><strong>${escapeHtml(bot.name)}</strong> <span class="small-muted">(${escapeHtml(bot.difficultyTag)})</span></div>
    <div class="small-muted" style="margin-top:6px">Level: ${bot.level} • Accuracy: ${Math.round((bot.accuracyEstimate||0)*100)}%</div>
    <div style="text-align:right;margin-top:10px"><button id="closeBot" class="btn btn-primary">Close</button></div></div>`;
  showModal(html, { title:'Bot' });
  document.getElementById('closeBot').onclick = closeModal;
}

async function onPlayBotNow(bot){
  closeModal(); // in case modal open
  // show small modal asking choose title or use default random
  const titles = await loadAvailableTitles(); // includes local titles
  const opts = (titles && titles.length) ? titles.map(t=>`<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('') : '<option value="">Default</option>';
  const html = `<div>
    <label class="small">Title</label>
    <select id="botTitleSelect" style="width:100%">${opts}</select>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button id="cancelBotCreate" class="btn">Cancel</button><button id="confirmBotCreate" class="btn btn-primary">Play vs ${escapeHtml(bot.name)}</button></div>
  </div>`;
  showModal(html, { title:`Play vs ${bot.name}` });
  document.getElementById('cancelBotCreate').onclick = closeModal;
  document.getElementById('confirmBotCreate').onclick = async () => {
    const titleSel = document.getElementById('botTitleSelect').value || null;
    closeModal();
    try {
      // create a quick game vs this bot: use createGameForBot
      await createQuickBotGame(bot.id, titleSel ? [titleSel] : null);
      toast('Quick game created — starting');
      await loadGames();
    } catch(e){
      console.error('create quick bot game failed', e);
      toast('Failed to create bot game');
    }
  };
}

async function createQuickBotGame(botId, titles = null){
  const vrole = getVerifiedRole(), vId = getVerifiedStudentId();
  if(vrole !== 'student' || !vId) { toast('Verify as student'); throw new Error('not verified'); }

  let prof = {};
  try {
    const snap = await getDoc(doc(db,'students', vId));
    prof = snap.exists() ? snap.data() : {};
    currentStudentProfile = prof;
  } catch(err){ prof = currentStudentProfile || {}; }

  const stake = 50;
  const available = Number(prof.totalPoints || 0);
  if(available < stake) {
    toast('Not enough points to start a quick bot game.');
    throw new Error('insufficient');
  }

  const titlesToUse = titles && titles.length ? titles : (localSetsCache && localSetsCache.length ? [localSetsCache[0].title || localSetsCache[0].id] : []);

  const newGame = {
    name: `Quick vs ${botId}`,
    titles: titlesToUse,
    isPublic: true,
    stake,
    secondsPerQuestion: 15,
    wrongPenalty: 'none',
    scoringModel: 'perQuestion',
    tieBehavior: 'reduceTime',
    opponentType: 'bot',
    botId,
    creatorId: vId,
    creatorName: prof.name || '',
    creatorClass: prof.className || '',
    creatorFrame: prof.avatarFrame || null,
    status: 'playing',
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + (10 * 60 * 60 * 1000)).toISOString(),
    reservedPoints: {},
    players: []
  };

  // create game doc
  const ref = await addDoc(collection(db,'games'), newGame);
newGame.id = ref.id;

// --- OPTIMISTIC UI: make the just-created game visible immediately ---
try {
  // use a client-side createdAt for immediate sorting/display
  newGame.createdAt = Date.now();
  // ensure status is normalized
  newGame.status = newGame.status || 'waiting';
  // push to local cache and re-render students list
  gamesCache.unshift(newGame);
  renderGames('students');
} catch(e){ console.warn('optimistic UI push failed', e); }

// if it's a bot-opponent creation you may auto-join & start (existing logic)
if(opponentType === 'bot' && botId){
  await joinGameById(ref.id, currentStudentId);
  await startMatchForGame(ref.id);
}

toast('Game created');
closeModal();
// still refresh from server to get canonical createdAt/server fields
loadGames().catch(()=>{});


  // optimistic UI
  try {
    newGame.players = newGame.players || [];
    newGame.players.push({
      playerId: vId,
      joinedAt: nowSeconds(),
      playerName: prof.name || '',
      avatarFrame: prof.avatarFrame || null,
      className: prof.className || ''
    });
    gamesCache.unshift(newGame);
    renderGames('bots');
  } catch(e){}

  // join transaction (server authorizes and deducts points)
  const joined = await joinGameById(ref.id, vId);
  if(!joined){
    try { await updateDoc(doc(db,'games', ref.id), { status:'expired', updatedAt: serverTimestamp() }); } catch(e){}
    throw new Error('join_failed');
  }

  // mark local active game and start
  setLocalActiveGame(ref.id);
  await startMatchForGame(ref.id);
  return ref.id;
}



/* ---------- new game modal (unchanged except titles uses local sets) ---------- */
async function onNewGameClick(){
  const vrole = getVerifiedRole();
  const vId = getVerifiedStudentId();
  if(vrole !== 'student' || !vId){ toast('Only verified students may create games.'); return; }

  const titlesSnap = await loadAvailableTitles(); // now prefers local sets
  const titlesOptions = (titlesSnap || []).map(t => `<label style="display:block;margin-bottom:6px"><input type="checkbox" class="titleCheckbox" value="${escapeHtml(t)}"> ${escapeHtml(t)}</label>`).join('');

  const html = `
    <div style="display:flex;flex-direction:column;gap:8px">
      <label class="small">Game name</label>
      <input id="gameName" class="input-small" placeholder="e.g. Quick Math" />
      <label class="small">Select titles (choose at least one)</label>
      <div style="max-height:180px;overflow:auto;border:1px solid #eef2f6;padding:8px;border-radius:8px">${titlesOptions || '<div class="small-muted">No titles available</div>'}</div>
      <div style="display:flex;gap:8px;align-items:center">
        <label><input type="checkbox" id="isPublic" checked /> Public</label>
        <label>Make visible to class only <input type="checkbox" id="classOnly" /></label>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <label class="small">Stake</label>
        <select id="stakeSelect">${STAKES.map(s=>`<option value="${s}">${s}</option>`).join('')}</select>
        <label class="small">Seconds/question</label>
        <select id="secsSelect"><option>10</option><option selected>15</option><option>30</option></select>
        <label class="small">Wrong penalty</label>
        <select id="wrongPenalty"><option value="none">No penalty</option><option value="sub1">Subtract 1</option></select>
      </div>

      <div style="display:flex;gap:8px;align-items:center">
        <label class="small">Scoring model</label>
        <select id="scoringModel"><option value="perQuestion">Per-question (default)</option><option value="winnerTakes">Winner-takes-stakes</option></select>
        <label class="small">Tie behavior</label>
        <select id="tieBehavior"><option value="reduceTime">Continue with reduced time</option><option value="nextTitle">Next title</option><option value="split">Split stake/refund</option><option value="rematch">Rematch vote</option></select>
        <label class="small">Opponent</label>
        <select id="opponentSelect"><option value="public">Public</option><option value="private">Private (code)</option><option value="invite">Invite specific</option><option value="bot">Play vs Bot</option></select>
        <select id="botSelect" style="display:none">${botsCache.map(b=>`<option value="${b.id}">${escapeHtml(b.name)} (${b.difficultyTag})</option>`).join('')}</select>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px">
        <button id="cancelCreate" class="btn">Cancel</button>
        <button id="doCreate" class="btn btn-primary">Create</button>
      </div>
    </div>
  `;
  showModal(html, { title:'Create new game' });

  document.getElementById('cancelCreate').onclick = closeModal;
  const opponentSelect = document.getElementById('opponentSelect');
  opponentSelect.onchange = (e) => {
    const val = e.target.value;
    document.getElementById('botSelect').style.display = val === 'bot' ? '' : 'none';
  };

  document.getElementById('doCreate').onclick = async () => {
    const name = document.getElementById('gameName').value.trim();
    const chosen = Array.from(document.querySelectorAll('.titleCheckbox')).filter(c=>c.checked).map(c=>c.value);
    const isPublic = document.getElementById('isPublic').checked;
    const classOnly = document.getElementById('classOnly').checked;
    const stake = Number(document.getElementById('stakeSelect').value || 50);
    const secondsPerQuestion = Number(document.getElementById('secsSelect').value || 15);
    const wrongPenalty = document.getElementById('wrongPenalty').value;
    const scoringModel = document.getElementById('scoringModel').value;
    const tieBehavior = document.getElementById('tieBehavior').value;
    const opponentType = document.getElementById('opponentSelect').value;
    const botId = document.getElementById('botSelect').value || null;

    if(!name) return alert('Enter game name');
    if(chosen.length === 0) return alert('Select at least one title');
    if(stake < 50) return alert('Minimum stake is 50');
      // refresh profile BEFORE validating stake (avoid stale cache)
      let profData = currentStudentProfile || {};
      try {
        const sSnap = await getDoc(doc(db,'students', currentStudentId));
        if(sSnap.exists()) profData = sSnap.data();
        currentStudentProfile = profData;
      } catch(e){
        console.warn('refresh student doc failed', e);
      }
      const availablePoints = Number(profData.totalPoints || 0);
      if(stake > availablePoints) {
        return alert('Not enough points to create this stake');
      }
  
    try {
      const newGame = {
        name,
        titles: chosen,
        isPublic: Boolean(isPublic),
        stake,
        secondsPerQuestion,
        wrongPenalty,
        scoringModel,
        tieBehavior,
        opponentType: opponentType === 'bot' ? 'bot' : 'student',
        botId: botId || null,
        creatorId: currentStudentId,
        creatorName: currentStudentProfile?.name || '',
        creatorClass: currentStudentProfile?.className || '',
        creatorFrame: currentStudentProfile?.avatarFrame || null,
        status: (opponentType === 'bot') ? 'playing' : 'waiting',
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + (10 * 60 * 60 * 1000)).toISOString(),
        reservedPoints: {},
        players: [],
        isVisibleToClass: classOnly || false
      };

      if(!isPublic || opponentType === 'private' || opponentType === 'invite'){
        newGame.isPublic = false;
        newGame.code = generateCode(6);
      }

      const ref = await addDoc(collection(db,'games'), newGame);
      newGame.id = ref.id;
      if(opponentType === 'bot' && botId){
        await joinGameById(ref.id, currentStudentId);
        await startMatchForGame(ref.id);
      }

      toast('Game created');
      closeModal();
      await loadGames();
    } catch(e){
      console.error('create game failed', e);
      alert('Create failed - check console');
    }
  };
}

/* ---------- generate code ---------- */
function generateCode(len=6){
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for(let i=0;i<len;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

/* ---------- title loading (prefers local JSON) ---------- */
async function loadAvailableTitles(){
  // prefer local sets if loaded
  if(localSetsCache && localSetsCache.length){
    return localSetsCache.map(s => s.title || s.id).filter(Boolean);
  }

  // fallback to Firestore titles
  try {
    const snaps = await getDocs(collection(db,'titles'));
    if(snaps.size) return snaps.docs.map(d => d.data().name || d.id);
  } catch(e){ console.warn('titles fetch failed', e); }
  // fallback: sample from questions collection
  try {
    const snaps = await getDocs(collection(db,'questions'), limit(200));
    const set = new Set();
    snaps.forEach(d=>{ const dd = d.data(); if(dd.title) set.add(dd.title); });
    return Array.from(set);
  } catch(e){ console.warn('fallback titles failed', e); }
  return [];
}

/* ---------- pickQuestionsForTitles (uses local JSON if available) ---------- */
async function pickQuestionsForTitles(titles, count){
  const out = [];
  try {
    if(localQuestionsIndex && Object.keys(localQuestionsIndex).length){
      // pick questions from local index matching any of the requested titles
      const pool = [];
      if(!titles || titles.length === 0){
        // gather all
        for(const k of Object.keys(localQuestionsIndex)) pool.push(...localQuestionsIndex[k]);
      } else {
        for(const t of titles){
          if(localQuestionsIndex[t]) pool.push(...localQuestionsIndex[t]);
          // also try matching by id normalization
          const alt = t.toString().replace(/\s+/g,'_').toLowerCase();
          for(const s of localSetsCache){
            if((s.id || '').toLowerCase() === alt || (s.title || '').toLowerCase() === t.toString().toLowerCase()){
              pool.push(...(s.questions || []).map((q,i)=>({ ...q, title: s.title || s.id, _setId: s.id, _idx:i })));
            }
          }
        }
      }
      shuffleArray(pool);
      for(const q of pool.slice(0,count)) {
        // normalize question to expected shape
        const choices = Array.isArray(q.choices) ? q.choices.map(c => (typeof c === 'string' ? c : (c.text||String(c)))) : [];
        const correct = (typeof q.correct !== 'undefined') ? q.correct : 0;
        out.push({ id: q.id || ('loc_'+Math.random().toString(36).slice(2,8)), text: q.text || q.question || q.q || '', choices, correct, timeLimit: q.timeLimit || 15 });
      }
      if(out.length >= count) return out.slice(0,count).map((q,i)=>({...q, _idx:i}));
    }

    // fallback to Firestore
    if(!titles || titles.length === 0){
      const q = query(collection(db,'questions'), limit(count));
      const snaps = await getDocs(q);
      snaps.forEach(d => out.push({ id:d.id, ...d.data() }));
    } else {
      for(const t of titles){
        const q = query(collection(db,'questions'), where('title','==', t), limit(Math.ceil(count / Math.max(titles.length,1))));
        const snaps = await getDocs(q);
        snaps.forEach(d => out.push({ id:d.id, ...d.data() }));
      }
    }
  } catch(e){
    console.warn('pickQuestions failed', e);
  }

  while(out.length < count){
    out.push({ id: 'local_'+Math.random().toString(36).slice(2,8), text: 'Placeholder: 2+2 = ?', choices: ['1','2','3','4'], correct: 3, timeLimit:10 });
  }
  shuffleArray(out);
  return out.slice(0, count).map((q, i) => ({ ...q, _idx:i, timeLimit: q.timeLimit || 15 }));
}



/* ---------- small utility ---------- */
function shuffleArray(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }

/* ---------- rendering header mini-profile (unchanged) ---------- */
function renderHeaderMiniProfile(){
  // show only for verified student
  if(currentRole === 'student' && currentStudentProfile){
    const name = currentStudentProfile.name || getVerifiedStudentName() || '';
    const cls = currentStudentProfile.className || '';
    // prefer explicit studentId field, fallback to verified id
    const docId = currentStudentProfile.studentId || currentStudentProfile.id || getVerifiedStudentId() || '';
    const isOwner = String(docId) && String(docId) === String(getVerifiedStudentId());
    const idDisplay = isOwner ? escapeHtml(docId) : maskId(docId);
    const level = currentStudentProfile.level || 1;
    const points = Number(currentStudentProfile.totalPoints || 0);

    // Avatar: either image (if avatar field present) or initials
    const avatarHtml = (currentStudentProfile.avatar)
      ? `<img src="${escapeHtml(currentStudentProfile.avatar)}" alt="avatar" style="width:40px;height:40px;border-radius:8px;object-fit:cover">`
      : `<div class="avatar-initials" style="width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:#eef2f6;font-weight:700">${escapeHtml((name||'').slice(0,2))}</div>`;

    miniProfileTag.innerHTML = `
      <div class="mini-profile" style="display:flex;align-items:center;gap:10px">
        <div class="avatar-wrap" style="width:40px;height:40px">${avatarHtml}</div>
        <div class="profile-txt" style="min-width:0">
          <div class="name" style="font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${escapeHtml(name)}
          </div>
          <div class="meta small-muted" style="font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ID: <span class="id">${idDisplay}</span> • Lv ${level} • ${points} pts
          </div>
        </div>
      </div>
    `;
  } else {
    miniProfileTag.innerHTML = '';
  }
}


  // --- put this after renderHeaderMiniProfile(); and after injectHeaderButtons(); in initPage() ---

  // wire existing settings button in your HTML (id="settingsBtn")
  const settingsBtnEl = document.getElementById('settingsBtn');
  if(settingsBtnEl){
    settingsBtnEl.onclick = () => {
      const vrole = getVerifiedRole();
      if(vrole !== 'student') { toast('Verify as a student to edit profile'); return; }
      openEditProfileModal();
    };
    // show/hide settings based on verification (only students)
    settingsBtnEl.style.display = (currentRole === 'student') ? '' : 'none';
  }

  // make New Game visible only to verified students
  if(newGameBtn){
    newGameBtn.style.display = (currentRole === 'student') ? '' : 'none';
  }

  // ensure mini-profile reflects freshest data (if profile was updated above)
  renderHeaderMiniProfile();


/* ---------- subscribeStats (unchanged) ---------- */
function subscribeStats(){
  const now = Date.now();
  const activeCount = gamesCache.filter(g => g.status !== 'finished' && g.status !== 'deleted' && (!g.expiresAt || new Date(g.expiresAt).getTime() > now)).length;
  statActive.textContent = activeCount;

  const invitesCount = gamesCache.filter(g => g.players && g.players.some(p => p.playerId === currentStudentId) && g.status === 'waiting').length;
  statInvites.textContent = invitesCount;

  if(typeof statBots !== 'undefined' && statBots) statBots.textContent = botsCache.length || 0;

  // joined games (playing or waiting) for this student
  const joined = gamesCache.filter(g => g.players && g.players.some(p => p.playerId === currentStudentId) && (g.status === 'waiting' || g.status === 'playing')).length;
  const statJoinedEl = document.getElementById('statJoined');
  if(statJoinedEl) statJoinedEl.textContent = joined;
}


/* ---------- code search (unchanged) ---------- */
async function onCodeSearch(){
  const code = (enterCodeInput.value || '').trim();
  if(!code) return toast('Enter code');
  try {
    const snaps = await getDocs(query(collection(db,'games'), where('code','==', code)));
    if(snaps.size === 0) return alert('No matching game code found');
    const docSnap = snaps.docs[0];
    const game = { id: docSnap.id, ...docSnap.data() };
    const html = `<div><div><strong>${escapeHtml(game.name)}</strong></div><div class="small-muted">Creator: ${escapeHtml(game.creatorName||'—')}</div><div style="margin-top:8px">Stakes: ${game.stake} • Seconds: ${game.secondsPerQuestion}</div><div style="text-align:right;margin-top:8px"><button id="joinCodeBtn" class="btn btn-primary">Join</button> <button id="closeCodeBtn" class="btn">Close</button></div></div>`;
    showModal(html, { title:'Private game' });
    document.getElementById('closeCodeBtn').onclick = closeModal;
    document.getElementById('joinCodeBtn').onclick = async () => {
      closeModal();
      await onPlayClick(game);
    };
  } catch(e){ console.error(e); toast('Search failed'); }
}

/* ---------- End of updated games.js (paste remainder of your original file after pickQuestionsForTitles) ---------- */


// ---------- play / join ----------
async function onPlayClick(game){
  const vrole = getVerifiedRole(), vId = getVerifiedStudentId();
  if(vrole !== 'student' || !vId) { toast('Verify as student to play'); return; }

  // if private, ask for code
  if(game.isPublic === false){
    const code = prompt('Enter private code:');
    if(!code) return;
    if(String(code).trim().toUpperCase() !== String(game.code || '').toUpperCase()) { alert('Invalid code'); return; }
  }

  // Bot games: join & start immediately
  if(game.opponentType === 'bot'){
    try {
      const joined = await joinGameById(game.id, vId);
      if(joined){
        await startMatchForGame(game.id);
      } else {
        toast('Failed to join bot game');
      }
    } catch(e){
      console.error('bot join/start failed', e);
      toast('Failed to start bot game');
    }
    return;
  }

  try {
    if(vId && String(vId) === String(game.creatorId)){
      // open own game overview
      showGameOverview(game);
      return;
    }

    // create join_attempt notification
    await addDoc(collection(db,'notifications'), {
      to: game.creatorId || null,
      type: 'join_attempt',
      gameId: game.id,
      gameName: game.name || '',
      from: vId,
      fromName: currentStudentProfile?.name || getVerifiedStudentName() || '',
      createdAt: serverTimestamp(),
      seen: false,
      message: `${currentStudentProfile?.name || getVerifiedStudentName() || vId} tried to join "${game.name || 'your game'}".`
    });

    // Show request sidebar (persistent) with Cancel action
    showRequestSidebar(game);

    toast('Request sent');

  } catch(e){
    console.warn('notify creator failed', e);
    toast('Failed to send request');
  }
}


function showGameOverview(game){
  const me = String(getVerifiedStudentId() || '');
  const isCreator = String(me) === String(game.creatorId);

  // Build modal skeleton with placeholders so we can update them live
  const creatorName = game.creatorName || '—';
  const creatorIdMasked = game.creatorId ? `**${String(game.creatorId).slice(-4)}` : '—';
  const creatorClass = game.creatorClass || '—';
  const codeLine = (!game.isPublic && String(me) === String(game.creatorId)) ? `<div id="overviewCode" style="margin-top:8px">Code: <strong>${escapeHtml(game.code || '—')}</strong></div>` : '';

  const html = `<div id="overviewWrap">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:800">${escapeHtml(game.name)}</div>
        <div class="small-muted">Creator: ${escapeHtml(creatorName)} • ID ${escapeHtml(creatorIdMasked)} • Class: ${escapeHtml(creatorClass)}</div>
      </div>
      <div style="text-align:right">
        <div class="tag ${game.isPublic ? 'public' : 'private'}">${game.isPublic ? 'Public' : 'Private'}</div>
        <div id="overviewStatus" class="small-muted" style="margin-top:6px">${escapeHtml(game.status || 'waiting')}</div>
      </div>
    </div>

    <div style="margin-top:10px">Titles: ${escapeHtml((game.titles||[]).join(', '))}</div>
    <div style="margin-top:6px">Stakes: <strong>${escapeHtml(String(game.stake||0))}</strong> • Seconds: <strong>${escapeHtml(String(game.secondsPerQuestion||15))}</strong></div>
    ${codeLine}
    <div style="margin-top:8px" class="small-muted">Wrong penalty: ${escapeHtml(game.wrongPenalty||'none')}</div>
    <div style="margin-top:12px" class="small-muted">Players: <span id="overviewPlayers">Loading…</span></div>

    <div style="text-align:right;margin-top:12px" id="overviewActions"></div>
  </div>`;

  showModal(html, { title: 'Game overview' });

  // helper to render actions area depending on latest game data
  let gameUnsub = null;
  async function renderForGameDoc(gDoc){
    const meId = String(getVerifiedStudentId() || '');
    const isCreatorNow = String(meId) === String(gDoc.creatorId);
    const amPlayerNow = Array.isArray(gDoc.players) && gDoc.players.some(p => String(p.playerId) === meId);
    // players display
    const playersDisplay = (Array.isArray(gDoc.players) && gDoc.players.length) ? gDoc.players.map(p => {
      const pName = escapeHtml(p.playerName || p.playerId || '—');
      const pIdMask = p.playerId ? ` **${String(p.playerId).slice(-4)}` : '';
      const readyFlag = p.ready ? ' (ready)' : '';
      return `${pName}${pIdMask}${readyFlag}`;
    }).join(', ') : '—';
    const playersEl = modalRoot.querySelector('#overviewPlayers');
    if(playersEl) playersEl.textContent = playersDisplay;

    // status
    const statusEl = modalRoot.querySelector('#overviewStatus');
    if(statusEl) statusEl.textContent = gDoc.status || 'waiting';

    // actions area
    const actionsWrap = modalRoot.querySelector('#overviewActions');
    if(!actionsWrap) return;
    // build buttons
    actionsWrap.innerHTML = '';
    // view creator always
    const viewCreatorBtn = document.createElement('button');
    viewCreatorBtn.className = 'btn';
    viewCreatorBtn.textContent = 'View creator';
    viewCreatorBtn.onclick = () => { closeModal(); openCreatorProfileForGame(gDoc); };
    actionsWrap.appendChild(viewCreatorBtn);

    if(isCreatorNow){
      const requestsBtn = document.createElement('button'); requestsBtn.className='btn'; requestsBtn.textContent='Requests';
      requestsBtn.onclick = () => { closeModal(); showJoinRequestsForGame(gDoc.id); };
      actionsWrap.appendChild(requestsBtn);

      const editBtn = document.createElement('button'); editBtn.className='btn'; editBtn.textContent='Edit';
      editBtn.onclick = () => { closeModal(); openEditGameModal(gDoc); };
      actionsWrap.appendChild(editBtn);

      const delBtn = document.createElement('button'); delBtn.className='btn'; delBtn.textContent='Delete';
      delBtn.onclick = () => { closeModal(); deleteGameConfirm(gDoc); };
      actionsWrap.appendChild(delBtn);

      const cancelBtn = document.createElement('button'); cancelBtn.className='btn'; cancelBtn.textContent = gDoc.status === 'waiting' ? 'Cancel' : 'Remove';
      cancelBtn.onclick = () => {
        if(!confirm('Cancel this game? This will refund reserved points.')) return;
        expireAndRefund(gDoc).then(()=>{ toast('Game cancelled'); closeModal(); loadGames(); }).catch(()=>{ toast('Cancel failed'); });
      };
      actionsWrap.appendChild(cancelBtn);

      const startBtn = document.createElement('button'); startBtn.className='btn btn-primary'; startBtn.textContent='Start';
      startBtn.disabled = (gDoc.opponentType === 'student' && (!Array.isArray(gDoc.players) || gDoc.players.length < 2));
      startBtn.onclick = async () => {
        try { await startMatchForGame(gDoc.id); closeModal(); } catch(e){ console.warn(e); toast('Start failed'); }
      };
      actionsWrap.appendChild(startBtn);
    } else if(amPlayerNow){
      const readyBtn = document.createElement('button'); readyBtn.className='btn';
      const myP = gDoc.players.find(p => String(p.playerId) === meId) || {};
      readyBtn.textContent = (myP && myP.ready) ? 'Unready' : 'Ready';
      readyBtn.onclick = async () => {
        try { await setPlayerReady(gDoc.id, meId, !(myP && myP.ready)); } catch(e){ console.warn(e); toast('Ready toggle failed'); }
      };
      actionsWrap.appendChild(readyBtn);

      const leaveBtn = document.createElement('button'); leaveBtn.className='btn'; leaveBtn.textContent='Leave';
      leaveBtn.onclick = async () => {
        if(!confirm('Leave this game?')) return;
        try { await leaveGame(gDoc.id, meId); closeModal(); await loadGames(); } catch(e){ console.warn(e); toast('Leave failed'); }
      };
      actionsWrap.appendChild(leaveBtn);

      const closeBtn = document.createElement('button'); closeBtn.className='btn btn-primary'; closeBtn.textContent='Close';
      closeBtn.onclick = closeModal;
      actionsWrap.appendChild(closeBtn);
    } else {
      const joinBtn = document.createElement('button'); joinBtn.className='btn btn-primary'; joinBtn.textContent='Request to join';
      joinBtn.onclick = () => { closeModal(); onPlayClick(gDoc); };
      actionsWrap.appendChild(joinBtn);

      const closeBtn = document.createElement('button'); closeBtn.className='btn'; closeBtn.textContent='Close';
      closeBtn.onclick = closeModal;
      actionsWrap.appendChild(closeBtn);
    }
  }

  // subscribe the specific game doc for live updates while modal open
  const gRef = doc(db,'games', game.id);
  if(modalRoot.__gameUnsub){ modalRoot.__gameUnsub(); modalRoot.__gameUnsub = null; }
  modalRoot.__gameUnsub = onSnapshot(gRef, snap => {
    if(!snap.exists()) { toast('Game removed'); closeModal(); return; }
    const gDoc = { id: snap.id, ...snap.data() };
    // update content live
    renderForGameDoc(gDoc);
  }, err => {
    console.warn('game doc onSnapshot err', err);
  });

  // Make sure to clean up unsub when modal closed
  const closeBtnEls = modalRoot.querySelectorAll('#modalCloseBtn, #closeInfoBtn');
  // hook our close to also remove snapshot
  const oldClose = closeModal;
  function cleanupAndClose(){
    if(modalRoot.__gameUnsub){ modalRoot.__gameUnsub(); modalRoot.__gameUnsub = null; }
    hideRequestSidebar(game.id); // in case this client had a request
    oldClose();
  }
  // replace modal close handler
  const closeElem = document.getElementById('modalCloseBtn');
  if(closeElem) closeElem.onclick = cleanupAndClose;
}







function openGameMoreMenu(game){
  const html = `<div style="display:flex;flex-direction:column;gap:8px">
    <button id="viewProfile" class="btn">View creator profile</button>
    <button id="inviteBtn" class="btn">Invite (copy link/code)</button>
    <button id="spectate" class="btn">Spectate</button>
    <button id="reportBtn" class="btn">Report</button>
    <div style="text-align:right"><button id="moreClose" class="btn btn-primary">Close</button></div>
  </div>`;
  showModal(html, { title:'More' });
  document.getElementById('moreClose').onclick = closeModal;
  document.getElementById('inviteBtn').onclick = () => {
    const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}games.html?code=${game.code||game.id}`;
    navigator.clipboard?.writeText(url).then(()=>toast('Invite copied'), ()=>toast('Copy failed'));
  };
  document.getElementById('viewProfile').onclick = async () => {
    closeModal();
    await openPlayerProfileModal(game.creatorId);
  };
  document.getElementById('reportBtn').onclick = () => {
    // create a flag doc
    closeModal();
    showModal(`<div><div class="small-muted">Report reason</div><textarea id="reportReason" style="width:100%;height:80px"></textarea><div style="text-align:right;margin-top:8px"><button id="sendReport" class="btn btn-primary">Send</button></div></div>`, { title:'Report player' });
    document.getElementById('sendReport').onclick = async () => {
      const reason = document.getElementById('reportReason').value || 'No reason';
      await addDoc(collection(db,'collusionFlags'), { gameId: game.id, users: [game.creatorId], reason, evidence:[], status:'open', createdAt: serverTimestamp() });
      toast('Reported — moderators will review');
      closeModal();
    };
  };
  document.getElementById('spectate').onclick = () => {
    closeModal();
    openMatchOverlayForSpectate(game.id);
  };
}

async function openEditGameModal(game) {
  // only allow the creator
  const me = getVerifiedStudentId();
  if(String(me) !== String(game.creatorId)) return toast('Only creator may edit');
  const titles = await loadAvailableTitles();
  const titlesHtml = (titles||[]).map(t => `<label style="display:block"><input type="checkbox" class="editTitle" value="${escapeHtml(t)}" ${ (game.titles||[]).includes(t) ? 'checked' : '' } /> ${escapeHtml(t)}</label>`).join('');
  const html = `<div style="display:flex;flex-direction:column;gap:8px">
    <label>Game name</label><input id="editGameName" class="input-small" value="${escapeHtml(game.name||'')}">
    <label>Titles</label><div style="max-height:160px;overflow:auto;border:1px solid #eef;padding:8px">${titlesHtml || '<div class="small-muted">No titles</div>'}</div>
    <label>Stake</label><input id="editStake" type="number" value="${Number(game.stake||50)}">
    <div style="text-align:right;margin-top:10px"><button id="cancelEditGame" class="btn">Cancel</button> <button id="saveEditGame" class="btn btn-primary">Save</button></div>
  </div>`;
  showModal(html, { title:'Edit game' });
  document.getElementById('cancelEditGame').onclick = closeModal;
  document.getElementById('saveEditGame').onclick = async () => {
    const name = document.getElementById('editGameName').value.trim();
    const chosen = Array.from(document.querySelectorAll('.editTitle')).filter(i=>i.checked).map(i=>i.value);
    const stake = Number(document.getElementById('editStake').value || 50);
    try {
      await updateDoc(doc(db,'games', game.id), { name, titles: chosen, stake, updatedAt: serverTimestamp() });
      toast('Game updated');
      closeModal();
      await loadGames();
    } catch(e){ console.error('saveEdit failed', e); alert('Save failed'); }
  };
}

async function deleteGameConfirm(game){
  const me = getVerifiedStudentId();
  if(String(me) !== String(game.creatorId)) return toast('Only creator may delete');
  if(!confirm('Delete this game? This will refund reserved points and remove the game.')) return;
  try {
    // transaction: refund reservedPoints to students and mark the game deleted
    await runTransaction(db, async (t) => {
      const gRef = doc(db,'games', game.id);
      const gSnap = await t.get(gRef);
      if(!gSnap.exists()) throw new Error('Game not found');
      const g = gSnap.data();
      const reserved = g.reservedPoints || {};
      // refund each reserved entry
      for(const uid of Object.keys(reserved)){
        const amount = Number(reserved[uid] || 0);
        if(amount <= 0) continue;
        const sRef = doc(db,'students', uid);
        const sSnap = await t.get(sRef);
        if(!sSnap.exists()) continue;
        const sData = sSnap.data();
        const before = Number(sData.totalPoints || 0);
        t.update(sRef, { totalPoints: before + amount, updatedAt: serverTimestamp() });
        // log refund
        await addDoc(collection(db,'pointsHistory'), { userId: uid, type:'game_refund', amount, before, after: before + amount, referenceGameId: game.id, timestamp: nowMillis() });
      }
      // mark game deleted
      t.update(gRef, { status:'deleted', deletedAt: serverTimestamp(), reservedPoints: {} });
    });
    toast('Game removed and points refunded');
    // update local cache and UI
    gamesCache = gamesCache.filter(g => String(g.id) !== String(game.id));
    await loadGames();
  } catch(e){
    console.error('delete failed', e);
    alert('Delete failed: ' + (e.message || 'unknown'));
  }
}


// ---------- join & reserve ----------
async function joinGameById(gameId, studentId){
  try {
    const gameRef = doc(db,'games', gameId);
    const studentRef = doc(db,'students', studentId);
    await runTransaction(db, async (t) => {
      const gSnap = await t.get(gameRef);
      if(!gSnap.exists()) throw new Error('Game not found');
      const g = gSnap.data();
      if(g.status === 'playing' && g.opponentType !== 'bot' && g.players && g.players.length >= 2) throw new Error('Already playing');
      const sSnap = await t.get(studentRef);
      const sdata = sSnap.exists() ? sSnap.data() : {};
      const available = Number(sdata.totalPoints || 0);
      if(available < g.stake) throw new Error('Insufficient points');

      // deduct stake and add to reserved
      const newPoints = Math.max(0, available - g.stake);
      t.update(studentRef, { totalPoints: newPoints });

      // update reservedPoints
      const reserved = g.reservedPoints || {};
      reserved[studentId] = (reserved[studentId] || 0) + g.stake;

      // build players array
      const players = Array.isArray(g.players) ? g.players.slice() : [];
      const joinedAtNumeric = nowSeconds();
      const pObj = {
        playerId: studentId,
        joinedAt: joinedAtNumeric,
        playerName: sdata.name || sdata.displayName || sdata.fullName || '',
        avatarFrame: sdata.avatarFrame || null,
        className: sdata.className || sdata.class || ''
      };
      players.push(pObj);

      t.update(gameRef, { reservedPoints: reserved, players, updatedAt: serverTimestamp() }, { merge:true });
    });

    // success — mark local active game (so isStudentInActiveGame can be quicker)
    setLocalActiveGame(gameId);
    return true;
  } catch(e){
    console.warn('joinGame transaction failed', e);
    alert(e.message || 'Failed to join game');
    return false;
  }
}



async function isStudentInActiveGame(studentId){
  try {
    // quick local marker check
    const localActive = getLocalActiveGame();
    if(localActive) {
      // verify it still exists in cache as active
      if(gamesCache.some(g => g.id === localActive && (g.status === 'waiting' || g.status === 'playing'))) return true;
      // else clear it (stale)
      clearLocalActiveGame();
    }

    // scan gamesCache for active membership (best-effort)
    for(const g of gamesCache){
      if(g.players && g.players.some(p=>p.playerId === studentId) && (g.status === 'waiting' || g.status === 'playing')) return true;
    }

  } catch(e){}
  return false;
}


// ---------- start match ----------
async function startMatchForGame(gameId) {
  const me = getVerifiedStudentId();
  if (!me) throw new Error('Not verified');

  console.log('[START] startMatchForGame', gameId);

  try {
    let matchId = null;

    await runTransaction(db, async (t) => {
      const gRef = doc(db, 'games', gameId);
      const gSnap = await t.get(gRef);
      if (!gSnap.exists()) throw new Error('Game not found');

      const g = gSnap.data();

      if (String(g.creatorId) !== String(me))
        throw new Error('Only creator can start');

      if (g.status !== 'waiting')
        throw new Error('Game already started');

      const players = Array.isArray(g.players) ? g.players : [];
      if (players.length < 2)
        throw new Error('Not enough players');

      // 🔴 SAFETY: require all ready
      const allReady = players.every(p => p.ready === true);
      if (!allReady)
        throw new Error('All players must be ready');

      // create match id
      matchId = doc(collection(db, 'matches')).id;

      t.set(doc(db, 'matches', matchId), {
        gameId,
        players,
        startedAt: serverTimestamp(),
        status: 'playing'
      });

      t.update(gRef, {
        status: 'playing',
        matchId,
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });

    console.log('[START] Match created:', matchId);
    toast('Game started 🎮');

    // 🔥 IMPORTANT: open match for creator immediately
    await openMatchOverlay(gameId);

    return true;

  } catch (e) {
    console.error('[START FAILED]', e);
    toast(e.message || 'Failed to start game');
    throw e;
  }
}


// pick questions: tries to fetch from Firestore 'questions' collection; fallbacks included


// ---------- match overlay (subscribe & UI) ----------
let currentMatchUnsub = null;
let currentMatchState = null;

async function openMatchOverlay(gameId){
  // find latest game doc -> check matchId
  const gSnap = await getDoc(doc(db,'games', gameId));
  if(!gSnap.exists()) return toast('Game not found');
  const g = gSnap.data();
  if(!g.matchId) return toast('Match not started yet');
  openMatchById(g.matchId);
}

async function openMatchById(matchId){
  // subscribe to match doc
  const matchRef = doc(db,'matches', matchId);
  if(currentMatchUnsub){ currentMatchUnsub(); currentMatchUnsub = null; }
// robust onSnapshot with retry
let snapshotRetries = 0;
function subscribeMatch() {
  if(currentMatchUnsub){ currentMatchUnsub(); currentMatchUnsub = null; }
  try {
    currentMatchUnsub = onSnapshot(matchRef, snap => {
      snapshotRetries = 0;
      if(!snap.exists()) { toast('Match ended or removed'); closeMatchOverlay(); return; }
      const data = snap.data();
      currentMatchState = data;
      renderMatchUI(data, matchRef);
    }, err => {
      console.warn('match onSnapshot error', err);
      // try a few times to recover (transient Listen errors)
      snapshotRetries++;
      if(snapshotRetries <= 4){
        const delay = 1000 * Math.pow(2, snapshotRetries); // exponential backoff
        toast('Realtime connection lost — retrying...');
        setTimeout(() => subscribeMatch(), delay);
      } else {
        toast('Realtime unavailable — using fallback (refresh page to retry).');
      }
    });
  } catch(e){
    console.warn('subscribeMatch failed', e);
  }
}
subscribeMatch();

  // open blank overlay until snapshot arrives
  matchRoot.innerHTML = `<div class="match-pane"><div class="match-top"><div>Loading match…</div><div><button id="closeMatchBtn" class="btn">Close</button></div></div><div class="match-body"></div></div>`;
  matchRoot.classList.remove('hidden'); matchRoot.removeAttribute('aria-hidden');
  document.getElementById('closeMatchBtn').onclick = () => { closeMatchOverlay(); };
}

function closeMatchOverlay(){ if(currentMatchUnsub) currentMatchUnsub(); currentMatchUnsub = null; matchRoot.innerHTML=''; matchRoot.classList.add('hidden'); matchRoot.setAttribute('aria-hidden','true'); }

// render match UI and wire answer submission
function renderMatchUI(match, matchRef){
  const body = matchRoot.querySelector('.match-body');
  if(!body) return;

  // top: scoreboard & meta
  const leftPlayers = (match.players || []);
  const currentIndex = match.currentIndex || 0;
  const q = match.questions && match.questions[currentIndex];

  let playerHtml = leftPlayers.map(p => {
    const frame = p.avatarFrame ? `frame-${p.avatarFrame}` : '';
    return `<div style="display:flex;align-items:center;gap:8px">
      <div class="avatar ${frame}">${(p.playerName||p.playerId||'P').slice(0,2)}</div>
      <div style="display:flex;flex-direction:column">
        <div style="font-weight:700">${escapeHtml(p.playerName||p.playerId||'—')}</div>
        <div class="small-muted">Lvl ${p.level||'-'} • ${p.score||0} pts</div>
      </div>
    </div>`;
  }).join('<div style="width:18px"></div>');

  // question UI
  const questionHtml = q ? `<div class="question-card"><div style="font-weight:700">Q${currentIndex+1}: ${escapeHtml(q.text || '')}</div></div>` : '<div class="small-muted">No current question</div>';
  // choices
  const choiceHtml = (q && q.choices && Array.isArray(q.choices)) ? q.choices.map((c, idx) => `<div class="choice" data-choice="${idx}" id="choice_${idx}">${escapeHtml(c)}</div>`).join('') : '';

  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="display:flex;gap:12px;align-items:center">${playerHtml}</div>
      <div class="timer" id="matchTimer">--</div>
    </div>
    <div style="margin-top:12px">${questionHtml}</div>
    <div style="margin-top:8px" id="choicesWrap">${choiceHtml}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
      <div><button id="surrenderBtn" class="btn">Surrender</button> <button id="rematchBtn" class="btn">Rematch</button></div>
      <div class="small-muted">Stake: ${match.stake} • Model: ${match.scoringModel}</div>
    </div>
  `;

  // timer: show remaining seconds for current question using the match doc's question timeLimit minus a stored startEpoch (match should include questionStartEpoch)
  // For simplicity: if match.questions[currentIndex].startEpoch exists, compute countdown; else show per-question seconds
  // wire choices:
  body.querySelectorAll('.choice').forEach(ch => {
    ch.onclick = async () => {
      const choiceIdx = Number(ch.getAttribute('data-choice'));
      // find player's id
      const pid = getVerifiedStudentId();
      if(!pid) return toast('Verify as student to play');
      // anti-cheat: if time between question start and answer < 120ms mark suspicious
      const timeNow = Date.now();
      // We cannot fully trust client times; we will send answer object and server should validate
      try {
        // Use a transaction to add answer into matches.answers map; simple approach: append log and update scores
        await runTransaction(db, async (t) => {
          const snap = await t.get(matchRef);
          if(!snap.exists()) throw new Error('match missing');
          const m = snap.data();
          if(m.status !== 'inprogress') throw new Error('not in progress');
          const currentIdx = m.currentIndex || 0;
          if(currentIdx !== currentIndex) throw new Error('question changed; try again');
          // find player's object
          const players = m.players || [];
          const pIdx = players.findIndex(p=>p.playerId === pid);
          if(pIdx === -1) throw new Error('you are not part of this match');
          // determine correctness via stored correct in question (server should validate)
          const qobj = m.questions[currentIdx];
          const correctArr = Array.isArray(qobj.correct) ? qobj.correct.map(Number) : [Number(qobj.correct)];
          const isCorrect = correctArr.includes(choiceIdx);
          // scoring rules
          let delta = 0;
          if(isCorrect){
            // assigned player correct = 2 points
            delta = 2;
          } else {
            // if wrong, penalty per match settings
            if(m.wrongPenalty === 'sub1') delta = -1;
            else delta = 0;
          }
          // half credit if opponent answers after assigned player fail — simplified: if firstAnswer exists and not by this player and was wrong then this player gets 1
          // Implement naive: if m.logs has last log with {type:'answer', playerId: X, correct:false} then give 1
          const lastAnswer = (m.logs || []).slice(-1)[0];
          if(!isCorrect && lastAnswer && lastAnswer.type === 'answer' && lastAnswer.playerId !== pid && lastAnswer.correct === false){
            // this player answering after opponent fail -> if they are correct they should receive 1 (already covered when isCorrect true)
            // else nothing
          }

          // update player's score
          if(!players[pIdx].score) players[pIdx].score = 0;
          players[pIdx].score = Math.max(0, (players[pIdx].score || 0) + delta);

          // update logs
          const logs = m.logs || [];
       
          logs.push({ type:'answer', playerId: pid, choice: choiceIdx, correct: isCorrect, delta, at: nowMillis() });
          
          

          // update question answered map to prevent double answer
          const answered = m.answered || {};
          answered[`${currentIdx}_${pid}`] = { selected: choiceIdx, correct: isCorrect, at: nowMillis() };

          // optionally advance question index if both players answered (simplified: advance immediately)
          let newIndex = currentIdx;
          // count players who have answered this question
          const answeredCount = Object.keys(answered).filter(k => k.startsWith(`${currentIdx}_`)).length;
          const playersCount = (players || []).length || 1;
          if(answeredCount >= playersCount) newIndex = currentIdx + 1;

          // write back
          t.update(matchRef, { players, logs, answered, currentIndex: newIndex, updatedAt: serverTimestamp() });
        });
      } catch(err){
        console.warn('submit answer failed', err);
        toast(err.message || 'Answer failed');
      }
    };
  });

  // wire surrender/rematch
  const surrenderBtn = document.getElementById('surrenderBtn'); if(surrenderBtn) surrenderBtn.onclick = async () => {
    if(!confirm('Surrender match? You will lose.')) return;
    try {
      await updateDoc(matchRef, { status:'finished', winner: 'remote', finishedAt: serverTimestamp() });
    } catch(e){ console.warn(e); }
  };
  // simplistic rematch: open modal to ask both clients later

  // detect match end conditions: if match.status === 'finished' call onMatchFinish
  if(match.status === 'finished'){
    onMatchFinish(match, matchRef);
    return;
  }

  // if bot present and a player is a bot, schedule bot moves
  for(const p of match.players || []){
    if(p.playerId && p.playerId.startsWith && p.playerId.startsWith('bot')){
      // simulate bot answering after random delay based on bot accuracy
      simulateBotForMatch(match, matchRef);
      break;
    }
  }
}

// handle match finish: compute winner, update profiles, release reserved points, level progression
async function onMatchFinish(match, matchRef){
  try {
    // compute winner by score
    const players = match.players || [];
    if(players.length === 0) return;
    players.sort((a,b)=> (b.score||0) - (a.score||0));
    const top = players[0];
    const second = players[1];
    let winnerId = top.playerId;
    let loserId = second ? second.playerId : null;
    const winnerScore = top.score || 0;
    const loserScore = second ? second.score || 0 : 0;
    // update points based on scoringModel
    if(match.scoringModel === 'perQuestion'){
      // per-question scoring — players already have score field representing earned points for this match
      // compute final: winner gets their earned points and bonus of final match bonus (50% stake by default)
      const finalBonus = Math.floor((match.stake || 0) * 0.5);
      // Update Firestore: add points to winner, leave loser (reserved was already deducted)
      await runTransaction(db, async (t) => {
        // for each player, release any reserved points (we reserved stake amount on join)
        const gameRef = doc(db,'games', match.gameId);
        const gSnap = await t.get(gameRef);
        if(gSnap.exists()){
          const g = gSnap.data();
          const reserved = g.reservedPoints || {};
          // release losers' reserved (no refund in winner-takes? per spec: depends on scoring model; here we return losers stake - they lost stake is subtracted)
          // Simplified approach: winners keep their stake + earned points; losers lost their reserved stake. We will add winner earned points + bonus to their student.totalPoints.
        }
        // update winner profile
        const winnerRef = doc(db,'students', winnerId);
        const winnerSnap = await t.get(winnerRef);
        const w = winnerSnap.exists() ? winnerSnap.data() : {};
        const winnerBefore = Number(w.totalPoints || 0);
        const addPoints = Math.max(0, (top.score || 0) + finalBonus);
        const winnerAfter = winnerBefore + addPoints;
        t.update(winnerRef, {
          totalPoints: winnerAfter,
          totalWins: (Number(w.totalWins||0) + 1),
          totalGames: (Number(w.totalGames||0) + 1),
          updatedAt: serverTimestamp()
        });
        // log pointsHistory
        await addDoc(collection(db,'pointsHistory'), { userId: winnerId, type:'game_win', amount: addPoints, before: winnerBefore, after: winnerAfter, referenceGameId: match.gameId, timestamp: nowMillis() });
        // update loser stats
        if(loserId){
          const loserRef = doc(db,'students', loserId);
          const loserSnap = await t.get(loserRef);
          const L = loserSnap.exists() ? loserSnap.data() : {};
          t.update(loserRef, {
            totalLosses: (Number(L.totalLosses||0) + 1),
            totalGames: (Number(L.totalGames||0) + 1),
            updatedAt: serverTimestamp()
          });
          await addDoc(collection(db,'pointsHistory'), { userId: loserId, type:'game_loss', amount: 0, before: Number(L.totalPoints||0), after: Number(L.totalPoints||0), referenceGameId: match.gameId, timestamp: serverTimestamp() });
        }

        // mark match as archived/finished
        t.update(matchRef, { archivedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        // also update games doc status
        t.update(doc(db,'games', match.gameId), { status:'finished', updatedAt: serverTimestamp() });
      });
    } else if(match.scoringModel === 'winnerTakes'){
      // winner takes stake pool
      const pool = (match.stake || 0) * (match.players ? match.players.length : 1);
      await runTransaction(db, async (t) => {
        const wRef = doc(db,'students', winnerId);
        const wSnap = await t.get(wRef);
        const w = wSnap.exists() ? wSnap.data() : {};
        const before = Number(w.totalPoints||0);
        const after = before + pool;
        t.update(wRef, { totalPoints: after, totalWins: (Number(w.totalWins||0)+1), totalGames: (Number(w.totalGames||0)+1), updatedAt: serverTimestamp() });
        await addDoc(collection(db,'pointsHistory'), { userId: winnerId, type:'game_win', amount: pool, before, after, referenceGameId: match.gameId, timestamp: nowMillis() });
        // losers recorded similarly
        for(const p of match.players || []){
          if(p.playerId === winnerId) continue;
          const lRef = doc(db,'students', p.playerId);
          const lSnap = await t.get(lRef);
          const L = lSnap.exists() ? lSnap.data() : {};
          t.update(lRef, { totalLosses: (Number(L.totalLosses||0)+1), totalGames: (Number(L.totalGames||0)+1), updatedAt: serverTimestamp() });
        }
        // finalize match and game
        t.update(matchRef, { archivedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        t.update(doc(db,'games', match.gameId), { status:'finished', updatedAt: serverTimestamp() });
      });
    }

    // level progression: check winner totalWins and award level/badges
    await applyLevelProgressionForPlayers(match);
    toast('Match finished — results applied');
    // clear local active marker so client can join other games
clearLocalActiveGame();
await loadGames(); // refresh UI

  } catch(e){
    console.error('onMatchFinish failed', e);
    toast('Match finalize failed');
  }
}

// apply level progression for players after a match
async function applyLevelProgressionForPlayers(match){
  try {
    for(const p of match.players || []){
      const sRef = doc(db,'students', p.playerId);
      await runTransaction(db, async (t) => {
        const sSnap = await t.get(sRef);
        if(!sSnap.exists()) return;
        const s = sSnap.data();
        const totalWins = Number(s.totalWins || 0);
        const prevLevel = Number(s.level || 1);
        const newLevel = computeLevelFromWins(totalWins);
        if(newLevel > prevLevel){
          // award badge/frame URLs (simple scheme)
          const badge = `badge_level_${newLevel}`;
          const frame = `frame_level_${newLevel}`;
          const badges = Array.isArray(s.badges) ? s.badges.slice() : [];
          badges.push(badge);
          t.update(sRef, { level: newLevel, avatarFrame: frame, badges, updatedAt: serverTimestamp() });
          // inform user by creating notification doc (or show immediate modal if current user)
          if(getVerifiedStudentId() === p.playerId){
            showModal(`<div><h3>Congratulations</h3><div>You reached Level ${newLevel} — new badge awarded.</div><div style="text-align:right;margin-top:8px"><button id="lvlClose" class="btn btn-primary">OK</button></div></div>`, { title:'Level up' });
            document.getElementById('lvlClose').onclick = closeModal;
          }
        }
      });
    }
  } catch(e){ console.warn('applyLevelProgression failed', e); }
}

function computeLevelFromWins(totalWins){
  // iterate thresholds
  for(let i=LEVEL_THRESHOLDS.length-1;i>=0;i--){
    if(totalWins >= LEVEL_THRESHOLDS[i]) return i+1; // level index starting at 1
  }
  // if beyond last, compute additional increments
  if(totalWins >= LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length-1]){
    const extra = totalWins - LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length-1];
    const adds = Math.floor(extra / POST_LEVEL_INCREMENT);
    return LEVEL_THRESHOLDS.length + 1 + adds;
  }
  return 1;
}

// ---------- bot simulation (simplified) ----------
let botSimTimers = {};
async function simulateBotForMatch(match, matchRef){
  // only schedule if a bot exists in match.players
  const botPlayer = (match.players || []).find(p => p.playerId && p.playerId.startsWith && p.playerId.startsWith('bot'));
  if(!botPlayer) return;
  // find bot from cache
  const bot = botsCache.find(b => b.id === botPlayer.playerId) || botsCache[0];
  // bot will answer current question after delay between 700ms and secondsPerQuestion*800ms
  const delay = 700 + Math.floor(Math.random() * ( (match.secondsPerQuestion || 15) * 600 ));
  clearTimeout(botSimTimers[match.id || match.gameId]);
  botSimTimers[match.id || match.gameId] = setTimeout(async () => {
    // choose correct or wrong based on accuracyEstimate
    const chance = Math.random();
    const willBeCorrect = chance <= (bot.accuracyEstimate || 0.8);
    const currentIdx = match.currentIndex || 0;
    const q = match.questions && match.questions[currentIdx];
    const correctArr = Array.isArray(q.correct) ? q.correct.map(Number) : [Number(q.correct)];
    let chosen;
    if(willBeCorrect) chosen = correctArr[0];
    else {
      // pick wrong
      const choices = q.choices || [];
      const wrongIdx = Array.from({length:choices.length}, (_,i)=>i).filter(i=>!correctArr.includes(i));
      chosen = wrongIdx[Math.floor(Math.random()*wrongIdx.length)] || 0;
    }
    // submit answer as bot (server-side authoritative approach required in production)
    try {
      await runTransaction(db, async (t) => {
        const snap = await t.get(matchRef);
        if(!snap.exists()) return;
        const m = snap.data();
        const players = m.players || [];
        const pIdx = players.findIndex(p => p.playerId === bot.id || p.playerId === botPlayer.playerId);
        if(pIdx === -1) return;
        // determine correctness & update
        const correct = Array.isArray(q.correct) ? q.correct.map(Number).includes(chosen) : Number(q.correct) === chosen;
        players[pIdx].score = Math.max(0, (players[pIdx].score || 0) + (correct ? 2 : (m.wrongPenalty === 'sub1' ? -1 : 0)));
        const logs = m.logs || [];
        logs.push({ type:'answer', playerId: bot.id, choice: chosen, correct, at: nowMillis() });
        t.update(matchRef, { players, logs, currentIndex: (m.currentIndex || 0) + 1, updatedAt: serverTimestamp() });

      });
    } catch(e){ console.warn('bot answer failed', e); }
  }, delay);
}

// ---------- anti-cheat & collusion flagging (basic) ----------
async function flagCollusion(gameId, users, reason, evidence = []){
  try {
    await addDoc(collection(db,'collusionFlags'), { gameId, users, reason, evidence, status:'open', createdAt: serverTimestamp() });
  } catch(e){ console.warn('flagCollusion failed', e); }
}

// ---------- small utilities ----------
// ---------- open player profile modal ----------
async function openPlayerProfileModal(studentId){
  try {
    const sSnap = await getDoc(doc(db,'students', studentId));
    if(!sSnap.exists()) return alert('Profile not found');
    const p = sSnap.data();

    // robust fallbacks for name/class
    const name = p.name || p.displayName || p.fullName || p.studentName || '—';
    const className = p.className || p.class || p.cls || '—';
    const avatarHtml = p.avatar ? `<img src="${escapeHtml(p.avatar)}" style="width:56px;height:56px;border-radius:8px;object-fit:cover" alt="avatar">`
                                : `<div class="avatar-initials" style="width:56px;height:56px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:#eef2f6;font-weight:700">${escapeHtml((name||'').slice(0,2))}</div>`;

    const html = `<div>
      <div style="display:flex;gap:12px;align-items:center">
        <div>${avatarHtml}</div>
        <div>
          <div style="font-weight:800">${escapeHtml(name)}</div>
          <div class="small-muted">Class ${escapeHtml(className)} • ID ${maskId(p.studentId || studentId || '')}</div>
        </div>
      </div>
      <div style="margin-top:8px" class="small-muted">Level: ${p.level||1} • Wins: ${p.totalWins||0} • Games: ${p.totalGames||0} • Points: ${p.totalPoints||0}</div>
      <div style="margin-top:10px">${(p.badges||[]).map(b=>`<span class="tag">${escapeHtml(b)}</span>`).join(' ')}</div>
      <div style="text-align:right;margin-top:10px"><button id="closeProfile" class="btn btn-primary">Close</button></div>
    </div>`;
    showModal(html, { title:'Player profile' });
    document.getElementById('closeProfile').onclick = closeModal;
  } catch(e){ console.error(e); }
}


// ---------- spectator (open match overlay read-only) ----------
async function openMatchOverlayForSpectate(gameId){
  const gSnap = await getDoc(doc(db,'games', gameId));
  if(!gSnap.exists()) return toast('Game not found');
  const g = gSnap.data();
  if(!g.matchId) return toast('Match not started');
  // open match by id but mark UI as spectator
  openMatchById(g.matchId);
  // we might need to set a spectator flag in UI — omitted for brevity
}


/* ---------- End of file: games.js ---------- */
