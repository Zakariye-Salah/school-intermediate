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
function nowSeconds(){ return Math.floor(Date.now()/1000); }
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
  subscribeStats();

  // wire UI actions
  newGameBtn.onclick = onNewGameClick;
  codeSearchBtn.onclick = onCodeSearch;
  filterStudentsBtn.onclick = () => { filterStudentsBtn.classList.add('btn-ghost'); filterBotsBtn.classList.remove('btn-ghost'); renderGames('students'); };
  filterBotsBtn.onclick = () => { filterBotsBtn.classList.add('btn-ghost'); filterStudentsBtn.classList.remove('btn-ghost'); renderGames('bots'); };
  filterStudentsBtn.classList.add('btn-ghost');
}


/* ---------- load games ---------- */
async function loadGames(){
  try {
    const q = query(collection(db,'games'), orderBy('createdAt','desc'), limit(100));
    const snaps = await getDocs(q);
    gamesCache = [];
    snaps.forEach(d => gamesCache.push({ id:d.id, ...d.data() }));
    renderGames('students');
  } catch(e){ console.error('loadGames failed', e); toast('Failed to load games'); }
}

/* ---------- render games + bots list ---------- */
function renderGames(mode='students'){
  gamesList.innerHTML = '';
  // if mode is bots, show bot cards first and games that are bot games afterwards
  if(mode === 'bots'){
    renderBotsList(); // shows the 10 bots
    // also append any existing bot games
    const botGames = gamesCache.filter(g => g.opponentType === 'bot' && (!g.expiresAt || new Date(g.expiresAt).getTime() > Date.now()));
    if(botGames.length === 0){
      const el = document.createElement('div'); el.className='small-muted'; el.textContent = 'No active bot games — choose a bot to play.'; gamesList.appendChild(el);
    } else {
      for(const g of botGames) appendGameCard(g);
    }
    statActive.textContent = botGames.length;
    return;
  }

  // students mode
  const now = Date.now();
  const filtered = gamesCache.filter(g => {
    if(g.expiresAt && new Date(g.expiresAt).getTime() < now) return false;
    if(g.opponentType === 'bot') return false;
    return true;
  });

  if(filtered.length === 0){
    gamesList.innerHTML = `<div class="small-muted">No games found.</div>`;
    statActive.textContent = '0';
    return;
  }
  statActive.textContent = filtered.length;
  for(const g of filtered) appendGameCard(g);
}

function appendGameCard(g){
  const card = document.createElement('div'); card.className = 'game-card';
  const left = document.createElement('div'); left.className='game-left';
  const avatar = document.createElement('div'); avatar.className='avatar'; avatar.textContent = (g.creatorName ? g.creatorName.split(' ').map(x=>x[0]).join('').slice(0,2) : '??');
  if(g.creatorFrame) avatar.classList.add(`frame-${g.creatorFrame}`);
  const meta = document.createElement('div'); meta.className='game-meta';
  const title = document.createElement('div'); title.className='game-title'; title.textContent = `${g.name || 'Untitled'} ${g.isPublic? '':'(Private)'}`;
  const sub = document.createElement('div'); sub.className='game-sub small-muted';
  sub.innerHTML = `Creator: ${escapeHtml(g.creatorName||g.creatorId||'—')} • Class ${escapeHtml(g.creatorClass||'—')} • Stakes ${g.stake||0} pts • ${g.secondsPerQuestion||15}s`;
  meta.appendChild(title); meta.appendChild(sub);
  left.appendChild(avatar); left.appendChild(meta);

  const right = document.createElement('div'); right.className='game-right';
  const tag = document.createElement('div'); tag.className = `tag ${g.isPublic? 'public':'private'}`; tag.textContent = g.isPublic? 'Public' : 'Private';
  const status = document.createElement('div'); status.className='small-muted'; status.textContent = g.status || 'waiting';
  const playBtn = document.createElement('button'); playBtn.className='btn btn-primary'; playBtn.textContent = '▶ Play'; playBtn.onclick = () => onPlayClick(g);
  const infoBtn = document.createElement('button'); infoBtn.className='btn'; infoBtn.textContent='ℹ'; infoBtn.onclick = () => showGameOverview(g);
  const moreBtn = document.createElement('button'); moreBtn.className='btn'; moreBtn.textContent='⋯'; moreBtn.onclick = () => openGameMoreMenu(g);
  right.appendChild(tag); right.appendChild(status); right.appendChild(playBtn); right.appendChild(infoBtn); right.appendChild(moreBtn);

  card.appendChild(left); card.appendChild(right); gamesList.appendChild(card);
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

  // ALWAYS fetch fresh student doc before any point checks
  let prof = {};
  try {
    const snap = await getDoc(doc(db,'students', vId));
    prof = snap.exists() ? snap.data() : {};
    currentStudentProfile = prof; // refresh cached profile for UI
  } catch(err){
    console.warn('fetch student doc failed', err);
    prof = currentStudentProfile || {};
  }

  const stake = 50; // minimal default for quick games
  const available = Number(prof.totalPoints || 0);
  if(available < stake) {
    toast('Not enough points to start a quick bot game.');
    throw new Error('insufficient');
  }

  const titlesToUse = titles && titles.length ? titles
                      : (localSetsCache && localSetsCache.length ? [localSetsCache[0].title || localSetsCache[0].id] : []);

  const newGame = {
    name: `Quick vs ${botId}`,
    titles: titlesToUse,
    isPublic: false,
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
  // auto-join creator (transaction enforces points)
  const joined = await joinGameById(ref.id, vId);
  if(!joined){
    // joining failed (race or transaction error) -> clean up the game doc
    try { await updateDoc(doc(db,'games', ref.id), { status:'expired', updatedAt: serverTimestamp() }); } catch(e){}
    throw new Error('join_failed');
  }
  // start match
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
  statActive.textContent = gamesCache.filter(g => g.status !== 'finished' && (!g.expiresAt || new Date(g.expiresAt).getTime() > Date.now())).length;
  statInvites.textContent = gamesCache.filter(g => g.players && g.players.some(p => p.playerId === currentStudentId) && g.status === 'waiting').length;
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
  // if private, ask for code
  const vrole = getVerifiedRole(), vId = getVerifiedStudentId();
  if(vrole !== 'student' || !vId) { toast('Verify as student to play'); return; }

  if(game.isPublic === false){
    // prompt code
    const code = prompt('Enter private code:');
    if(!code) return;
    if(String(code).trim().toUpperCase() !== String(game.code || '').toUpperCase()) { alert('Invalid code'); return; }
  }

  // check sufficient points
  const studentDoc = await getDoc(doc(db,'students', vId));
  const studentData = studentDoc.exists() ? studentDoc.data() : {};
  const points = Number(studentData.totalPoints || 0);
  if(points < Math.min(MIN_JOIN_POINTS, game.stake)) {
    showModal(`<div><div class="small-muted">Not enough points to join. Earn points by tests or contact staff.</div><div style="text-align:right;margin-top:10px"><button id="closeNoPts" class="btn btn-primary">Close</button></div></div>`, { title:'Insufficient points' });
    document.getElementById('closeNoPts').onclick = closeModal;
    return;
  }

  // prevent join if already in active game
  if(await isStudentInActiveGame(vId)){
    return alert('You are already in an active game. Finish or leave it first.');
  }

  // join flow
  if(game.opponentType === 'bot'){
    // join and start
    await joinGameById(game.id, vId);
    await startMatchForGame(game.id);
    return;
  } else {
    // join waiting student game
    try {
      const joined = await joinGameById(game.id, vId);
      if(joined){
        toast('Joined — waiting for start');
        await loadGames();
      } else {
        toast('Failed to join');
      }
    } catch(e){
      console.error('join failed', e);
      toast('Failed to join');
    }
  }
}

// open overview modal
function showGameOverview(game){
  const html = `<div>
    <div><strong>${escapeHtml(game.name)}</strong></div>
    <div class="small-muted">Creator: ${escapeHtml(game.creatorName||game.creatorId||'—')} • Class: ${escapeHtml(game.creatorClass||'—')}</div>
    <div style="margin-top:8px">Titles: ${escapeHtml((game.titles||[]).join(', '))}</div>
    <div style="margin-top:6px">Stakes: <strong>${game.stake}</strong> • Seconds: <strong>${game.secondsPerQuestion}</strong></div>
    <div style="margin-top:8px" class="small-muted">Wrong penalty: ${escapeHtml(game.wrongPenalty||'none')}</div>
    <div style="text-align:right;margin-top:10px"><button id="closeInfoBtn" class="btn btn-primary">Close</button></div>
  </div>`;
  showModal(html, { title:'Game overview' });
  document.getElementById('closeInfoBtn').onclick = closeModal;
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

// ---------- join & reserve ----------
async function joinGameById(gameId, studentId){
  // join with transaction: add player to games.players and reserve points (decrement from student.totalPoints into game's reservedPoints map)
  try {
    const gameRef = doc(db,'games', gameId);
    const studentRef = doc(db,'students', studentId);
    await runTransaction(db, async (t) => {
      const gSnap = await t.get(gameRef);
      if(!gSnap.exists()) throw new Error('Game not found');
      const g = gSnap.data();
      if(g.status === 'playing' && g.opponentType !== 'bot' && g.players && g.players.length >= 2) throw new Error('Already playing');
      // verify points
      const sSnap = await t.get(studentRef);
      const sdata = sSnap.exists() ? sSnap.data() : {};
      const available = Number(sdata.totalPoints || 0);
      if(available < g.stake) throw new Error('Insufficient points');

      // deduct stake and add to reserved
      const newPoints = Math.max(0, available - g.stake);
      t.update(studentRef, { totalPoints: newPoints });

      // update game's reservedPoints (plain object)
      const reserved = g.reservedPoints || {};
      reserved[studentId] = (reserved[studentId] || 0) + g.stake;

      // build players array (avoid serverTimestamp() inside array elements)
      const players = Array.isArray(g.players) ? g.players.slice() : [];
      const joinedAtNumeric = nowSeconds(); // numeric timestamp (seconds)
      const pObj = {
        playerId: studentId,
        joinedAt: joinedAtNumeric,         // <-- numeric, not serverTimestamp()
        playerName: sdata.name || sdata.displayName || sdata.fullName || '',
        avatarFrame: sdata.avatarFrame || null,
        className: sdata.className || sdata.class || ''
      };
      players.push(pObj);

      // commit: updatedAt can still be serverTimestamp() (top-level field allowed)
      t.update(gameRef, { reservedPoints: reserved, players, updatedAt: serverTimestamp() }, { merge:true });
    });
    return true;
  } catch(e){
    console.warn('joinGame transaction failed', e);
    alert(e.message || 'Failed to join game');
    return false;
  }
}


async function isStudentInActiveGame(studentId){
  try {
    const q = query(collection(db,'games'), where('players', 'array-contains', { playerId: studentId }), where('status','in',['waiting','playing']));
    // Firestore cannot query array-contains for objects easily; fallback: scan small cache
    for(const g of gamesCache){
      if(g.players && g.players.some(p=>p.playerId === studentId) && (g.status === 'waiting' || g.status === 'playing')) return true;
    }
  } catch(e){}
  return false;
}

// ---------- start match ----------
async function startMatchForGame(gameId){
  // server-side should be authoritative; client attempts to create a match doc that both clients subscribe to
  try {
    const gameRef = doc(db,'games', gameId);
    await runTransaction(db, async (t) => {
      const gSnap = await t.get(gameRef);
      if(!gSnap.exists()) throw new Error('game missing');
      const g = gSnap.data();
      if(g.status === 'playing') { return; } // already started
      // require at least 1 player (creator) or bot
      const players = g.players || [];
      if(g.opponentType === 'student' && players.length < 2) throw new Error('Need 2 players to start');
      // pick questions by titles (simplified: pull 10 random questions matching chosen titles)
      const questions = await pickQuestionsForTitles(g.titles || [], 10);
      // create match doc in 'matches'
      const matchDoc = {
        gameId,
        gameName: g.name,
        stake: g.stake,
        scoringModel: g.scoringModel || 'perQuestion',
        wrongPenalty: g.wrongPenalty || 'none',
        secondsPerQuestion: g.secondsPerQuestion || 15,
        createdAt: serverTimestamp(),
        status: 'inprogress',
        currentIndex: 0,
        questions,
        players: players.map(p=>({ playerId: p.playerId, score:0, ready:true, answered: {} })), // answered: map qIdx -> { selected, correct, time }
        logs: [],
        tieOffers: {},
        expireSeconds: nowSeconds() + 60*60 // fallback
      };
      const mRef = await addDoc(collection(db,'matches'), matchDoc);
      // set game.status to playing and set matchId
      t.update(gameRef, { status:'playing', matchId: mRef.id, updatedAt: serverTimestamp() });
    });
    // subscribe to match doc
    await openMatchOverlay(gameId);
  } catch(e){
    console.error('startMatch failed', e);
    toast('Failed to start match');
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
          logs.push({
            type:'answer',
            playerId: pid,
            choice: choiceIdx,
            correct: isCorrect,
            delta,
            at: nowMillis()
          });
        
          

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
