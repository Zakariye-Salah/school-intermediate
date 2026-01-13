now let's come for the sond please for the take test yourself please odla please add for icon soundplease togle so it can please in the modal test your self please add for this button so appear for two drobdown button off/on bg and off/on FX sound please add for these because i do that for the studnet can't turn on/off sounds when he is for the test your self please add for this pleasae in the bottom please 
also please i want to make for the sound please for bg sounds like 20 or more than please now i have for 20 so i want to hear for rendom please also i have wrong sounds for 30 please no i want to make it more also for the correct i have for 30 please bg1.mp3-bg30.mp3 please make that for the correct and wrong also 1 to 30 mpt please correct1-30.mp3 wrong1-wrong30.mp3 for the straek same plelase streak10,20,30,-100 please make that for more than 100 we apear for more please untill 1000 please 
note please for the streak ,wrong and correct sound if they turn on and for the background turn when strak,correct and wrong sound hear please for the bg sound pleasae make it slow please like 0 volume or pause the sound bg please please when they end then resume please make for that please:

sound.js:
// sound.js — robust, tolerant sound manager
// Exports SoundManager
const defaultPaths = {
  correct: 'assets/correct.mp3',
  incorrect: 'assets/wrong.mp3',
  streak: 'assets/streak.mp3',
  bg: 'assets/bg.mp3',
  clap: 'assets/clap.mp3'
};

// small synth fallback (keeps UX consistent if files fail)
function synthClap(count = 6, speed = 0.06, volume = 0.85) {
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
  } catch (e) { console.warn('synthClap failed', e); }
}

/**
 * Try to play a path safely. Returns a Promise that always resolves (true if played, false otherwise).
 * It will attempt a few extensions (.mp3/.ogg/.wav) if the original path fails.
 */
async function safePlayPath(path) {
  if (!path) return false;
  // if the path looks like an element id pointer (existing preloaded), try it first
  try {
    // try with HTMLAudioElement instance
    const a = new Audio(path);
    a.preload = 'auto';
    a.muted = false;
    try {
      await a.play();
      return true;
    } catch (e) {
      // swallow and try alternatives
      console.warn('initial audio play failed for', path, e);
    }
  } catch (e) {
    console.warn('creating Audio() failed', e);
  }

  // try alternative extensions
  try {
    const base = path.replace(/\.(mp3|ogg|wav)$/i, '');
    const exts = ['.mp3', '.ogg', '.wav'];
    for (const ext of exts) {
      try {
        const a2 = new Audio(base + ext);
        a2.preload = 'auto';
        await a2.play();
        return true;
      } catch (e) {
        // try next
      }
    }
  } catch (e) {
    console.warn('alternative extension attempts failed', e);
  }

  // fallback to synth (non-blocking)
  try { synthClap(); } catch (e) { console.warn('fallback synth failed', e); }
  return false;
}

export const SoundManager = {
  bgEnabled: false,
  effectsEnabled: true,
  bgAudio: null,

  preloadAll() {
    // attempt to create a bg audio element but do not assume it will play
    try {
      this.bgAudio = new Audio(defaultPaths.bg);
      this.bgAudio.loop = true;
      this.bgAudio.preload = 'auto';
    } catch (e) { this.bgAudio = null; }
  },

  setBgEnabled(on) {
    this.bgEnabled = !!on;
    if (this.bgEnabled && this.bgAudio) {
      // try to play but swallow errors
      this.bgAudio.play().catch(() => {});
    } else if (this.bgAudio) {
      try { this.bgAudio.pause(); } catch (e) {}
    }
  },

  setEffectsEnabled(on) {
    this.effectsEnabled = !!on;
  },

  async playFile(path) {
    try {
      if (!this.effectsEnabled) return false;
      const ok = await safePlayPath(path);
      return ok;
    } catch (e) {
      console.warn('playFile unexpected error', e);
      try { synthClap(); } catch (e2) {}
      return false;
    }
  },

  async playCorrect() {
    return this.playFile(defaultPaths.correct);
  },

  async playIncorrect() {
    return this.playFile(defaultPaths.incorrect);
  },

  async playStreak(n = 10) {
    // small variation for streak
    if (!this.effectsEnabled) return false;
    try {
      await this.playFile(defaultPaths.streak);
      return true;
    } catch (e) {
      synthClap(Math.max(4, Math.min(12, Math.floor(n/2))));
      return false;
    }
  },

  async playClapFallback() {
    try { synthClap(); return true; } catch(e){ return false; }
  }
};

export default SoundManager;


function applyVerifiedUIState(){
  const vrole = getVerifiedRole();
  if(vrole === 'student'){
    viewAroundBtn.style.display = ''; testYourselfBtn.disabled = false; verifyBtn.style.display = 'none';
    adminControls.classList.add('hidden');
    logoutBtn.style.display = ''; // show logout when verified as student
  } else if(vrole === 'admin'){
    viewAroundBtn.style.display = ''; testYourselfBtn.disabled = false; verifyBtn.style.display = 'none';
    adminControls.classList.remove('hidden');
    logoutBtn.style.display = ''; // show logout for admin
  } else {
    verifyBtn.style.display = '';
    viewAroundBtn.style.display = 'none';
    testYourselfBtn.disabled = true;
    adminControls.classList.add('hidden');
    logoutBtn.style.display = 'none'; // hide logout if not verified
  }
}
// Attempt auto admin verify (called when referrer admin.html)
async function attemptAdminVerifyAuto(){
  try {
    const snaps = await getDocs(query(collection(db,'admin'), where('uid','==', currentUser.uid)));
    if(snaps.size > 0){
      sessionStorage.setItem('verifiedRole','admin');
      sessionStorage.removeItem('verifiedStudentId');
      applyVerifiedUIState();
      toast('Verified as admin');
      // persist users mapping (ensure)
      try { await setDoc(doc(db,'users', currentUser.uid), { role:'admin', adminUid: currentUser.uid, linkedAt: serverTimestamp() }, { merge:true }); } catch(e){}
      return;
    }
    // not an admin; fall back to regular UI
    applyVerifiedUIState();
  } catch(e){ console.error(e); applyVerifiedUIState(); }
}
// Show student verify modal (user-entered ID + BIN). If BIN missing, ask to create one.


/* ---------- logout ---------- */
logoutBtn.onclick = async () => {
  try {
    // clear verification/session info for both visitors and signed-in users
    clearAppStorageForAuth();
    // sign out if signed-in
    if(currentUser){
      await signOut(auth);
      currentUser = null;
    }
    currentRole = null;
    currentStudentId = null;
    currentStudentName = '';
    applyVerifiedUIState();
    window.location.href = 'index.html';
  } catch(e){ console.error(e); toast('Logout failed'); }
};
/* ---------- competition load + create ---------- */
function monthKeyForDate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
async function loadCompetitionAndScores(){
  try {
    const now = new Date();
    const monthKey = monthKeyForDate(now);
    const compsSnap = await getDocs(query(collection(db,'competitions'), where('monthKey','==', monthKey)));
    if(compsSnap.size === 0){
      const startAt = new Date(now.getFullYear(), now.getMonth(), 1);
      const endAt = new Date(now.getFullYear(), now.getMonth()+1, 0, 23, 59, 59);
      const newComp = {
        name: `${startAt.toLocaleString('en', { month: 'long' })} Competition ${startAt.getFullYear()}`,
        month: startAt.getMonth()+1, year: startAt.getFullYear(), monthKey,
        active:true, startAt: startAt.toISOString(), endAt: endAt.toISOString(), createdAt: serverTimestamp(), highestStreak: 0
      };
      const cRef = await addDoc(collection(db,'competitions'), newComp);
      currentCompetition = { id: cRef.id, ...newComp };
    } else {
      let found = null;
      compsSnap.forEach(d => { const data = d.data(); if(!found) found = { id: d.id, ...data }; });
      currentCompetition = found;
    }
    renderCompetitionHeader();
    await loadCompetitionScores();
  } catch(err){ console.error('loadCompetitionAndScores', err); }
}
function renderCompetitionHeader(){
  if(!currentCompetition) return;
  compTitleEl.textContent = currentCompetition.name || 'Competition';
  const startAt = currentCompetition.startAt ? new Date(currentCompetition.startAt) : null;
  const endAt = currentCompetition.endAt ? new Date(currentCompetition.endAt) : null;
  compRangeEl.textContent = startAt && endAt ? `${startAt.toLocaleDateString()} — ${endAt.toLocaleDateString()}` : '';
  const daysLeft = endAt ? daysLeftUntil(endAt) : 0;
  competitionSub.textContent = `${currentCompetition.active ? 'Active' : 'Inactive'} • ${daysLeft} day(s) remaining`;


  // admin controls values
if (isAdmin()) {
  if (compNameInput) compNameInput.value = currentCompetition.name || '';
  if (compToggleActiveBtn) compToggleActiveBtn.textContent = currentCompetition.active ? 'Deactivate' : 'Activate';
}


  // header tag: prefer admin displayName when admin, otherwise verified student name
  const vrole = getVerifiedRole();
  if(vrole === 'admin' && currentUser && (currentUser.displayName || currentUser.email)){
    const disp = currentUser.displayName || currentUser.email;
    studentTag.textContent = `— Admin: ${disp}`;
  } else if(vrole === 'student' && getVerifiedStudentName()){
    studentTag.textContent = `— ${getVerifiedStudentName()}`;
  } else {
    studentTag.textContent = '';
  }
}

/* ---------- scores loading & rendering (async to enrich student names/class) ---------- */
async function loadCompetitionScores(){
  if(!currentCompetition) return;
  try {
    const q = query(collection(db,'competitionScores'), where('competitionId','==', currentCompetition.id));
    const snap = await getDocs(q);
    const arr = [];
    snap.forEach(d => arr.push({ id:d.id, ...d.data() }));
    // enrich missing names/class by batch reading students docs
    const missingStudentIds = new Set();
    arr.forEach(r => { if(!r.studentName || !r.className) missingStudentIds.add(r.studentId); });
    const studentMap = {};
    if(missingStudentIds.size > 0){
      // fetch in parallel (could optimize)
      await Promise.all(Array.from(missingStudentIds).map(async sid => {
        try {
          const sSnap = await getDoc(doc(db,'students', sid));
          if(sSnap.exists()) studentMap[sid] = sSnap.data();
        } catch(e){}
      }));
      // merge into arr
      arr.forEach(r => {
        if(studentMap[r.studentId]){
          const d = studentMap[r.studentId];
          // name fallback to several fields
          if(!r.studentName) r.studentName = d.name || d.studentName || d.fullName || r.studentName || '';
          // class fallback: className or class or classId or section
          if(!r.className) r.className = d.className || d.class || d.classId || d.section || r.className || '';
        }
      });
      
    }

    arr.sort((a,b) => (b.points || 0) - (a.points || 0));
    scoresCache = arr;
    await renderLeaderboard();
  } catch(err){ console.error('loadCompetitionScores', err); }
}
/* ---------- ranking helpers ---------- */
function buildRankedList(arr){
  const ranked = [];
  let currentRank = 0;
  let lastPoints = null;
  let idx = 0;
  for(const item of arr){
    idx++;
    if(lastPoints === null || item.points < lastPoints){
      currentRank = idx;
      lastPoints = item.points;
    }
    ranked.push({ ...item, rank: currentRank });
  }
  const topRanks = [];
  const rankSet = new Set();
  for(const r of ranked){
    if(rankSet.size < 10) { rankSet.add(r.rank); topRanks.push(r); }
    else if(rankSet.has(r.rank)) { topRanks.push(r); }
    else break;
  }
  return { ranked, topRanks };
}
/* ---------- render leaderboard (async) ---------- */
async function renderLeaderboard(){
  leaderTbody.innerHTML = '';
  if(!scoresCache || scoresCache.length === 0){
    leaderTbody.innerHTML = `<tr><td colspan="6" class="small-muted">No scores yet. Be the first —</td></tr>`;
    return;
  }

  const { ranked, topRanks } = buildRankedList(scoresCache);
  const vrole = getVerifiedRole();
  const admin = isAdmin();

  // Decide which primary rows to show:
  // - Admins: if not expanded -> show topRanks; if expanded -> show ranked (all)
  // - Non-admins: show topRanks only
  const primaryRows = admin ? (adminShowAll ? ranked : topRanks) : topRanks;

  // Build primary rows:
  for(const r of primaryRows){
    const tr = document.createElement('tr');
    const rankCell = `<div class="rank-badge" style="background:${r.rank===1? '#FFD700': r.rank===2? '#C0C0C0' : r.rank===3? '#CD7F32': '#eef6ff'}">${r.rank}</div>`;
    const name = `<strong>${escapeHtml(r.studentName || '—')}</strong>`;
    const className = escapeHtml(r.className || '—');
    const idMasked = maskId(r.studentId || r.id || '');
    const points = escapeHtml(String(r.points || 0));

    // action column
    let actionHtml = `<button class="btn" data-view="${escapeHtml(r.id)}">View</button>`;
    if(admin){
      actionHtml += ` <button class="btn settingsBtn" data-student="${escapeHtml(r.studentId)}" data-scoredoc="${escapeHtml(r.id)}">⚙</button>`;
    } else {
      if(getVerifiedRole() === 'student' && getVerifiedStudentId() === r.studentId){
        actionHtml += ` <button class="btn" id="clearMyPointsBtn">Clear my points</button>`;
      }
    }

    tr.innerHTML = `<td>${rankCell}</td><td>${name}</td><td>${className}</td><td>${idMasked}</td><td><strong>${points}</strong></td><td>${actionHtml}</td>`;
    leaderTbody.appendChild(tr);
  }

  // If admin expanded and there are additional scorers with points > 0 that are NOT in primaryRows, append them
  if(admin && adminShowAll){
    // show a divider row first
    const divider = document.createElement('tr');
    divider.innerHTML = `<td colspan="6" class="small-muted" style="text-align:center;padding:10px">Other scorers (points &gt; 0)</td>`;
    leaderTbody.appendChild(divider);

    // compute remaining (points > 0) excluding those already displayed
    const shownIds = new Set(primaryRows.map(r => r.id));
    const remaining = ranked.filter(r => !shownIds.has(r.id) && (r.points || 0) > 0);
    for(const r of remaining){
      const tr = document.createElement('tr');
      const rankCell = `<div class="rank-badge">${r.rank}</div>`;
      const name = `<strong>${escapeHtml(r.studentName || '—')}</strong>`;
      const className = escapeHtml(r.className || '—');
      const idMasked = maskId(r.studentId || r.id || '');
      const points = escapeHtml(String(r.points || 0));
      let actionHtml = `<button class="btn" data-view="${escapeHtml(r.id)}">View</button> <button class="btn settingsBtn" data-student="${escapeHtml(r.studentId)}" data-scoredoc="${escapeHtml(r.id)}">⚙</button>`;
      tr.innerHTML = `<td>${rankCell}</td><td>${name}</td><td>${className}</td><td>${idMasked}</td><td><strong>${points}</strong></td><td>${actionHtml}</td>`;
      leaderTbody.appendChild(tr);
    }
  }

  // --- wiring (same as before) ---
  // wire view buttons
  leaderTbody.querySelectorAll('button[data-view]').forEach(b => {
    b.onclick = async () => {
      const id = b.getAttribute('data-view');
      const item = scoresCache.find(s => s.id === id);
      if(!item) return toast('Not found');

      const canAdmin = isAdmin();
      // now include history button only if admin
      const html = `<div>
        <h3 style="margin-top:0">${escapeHtml(item.studentName || '—')}</h3>
        <div class="small-muted">Class: <strong>${escapeHtml(item.className || item.class || item.classId || '—')}</strong></div>
        <div style="margin-top:8px">Points: <strong>${escapeHtml(String(item.points || 0))}</strong></div>
        <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
          ${canAdmin ? `<button id="modalHistoryBtn" class="btn">View history</button>` : ''}
          ${canAdmin ? `<button id="modalAdminSettingsBtn" class="btn">Settings</button>` : ''}
          <button id="modalCloseLocal" class="btn">Close</button>
        </div>
      </div>`;

      showModalInner(html, { title: 'Student' });

      // history only if it exists
      const histBtn = document.getElementById('modalHistoryBtn');
      if(histBtn){
        histBtn.onclick = async () => { closeModal(); await openHistoryModal(item.studentId); };
      }
      const adminBtn = document.getElementById('modalAdminSettingsBtn');
      if(adminBtn){
        adminBtn.onclick = () => {
          if(!isAdmin()){ toast('Only admin'); return; }
          closeModal();
          openStudentSettingsModal(item.studentId, item.id);
        };
      }
      const closeLocal = document.getElementById('modalCloseLocal');
      if(closeLocal) closeLocal.onclick = () => closeModal();
    };
  });

  // wire clear my points if present
  const clearBtn = document.getElementById('clearMyPointsBtn');
  if(clearBtn){
    clearBtn.onclick = async () => {
      if(!confirm('Clear your points for this competition? This action cannot be undone.')) return;
      try {
        const docId = `${currentCompetition.id}_${getVerifiedStudentId()}`;
        await setDoc(doc(db,'competitionScores', docId), { competitionId: currentCompetition.id, studentId: getVerifiedStudentId(), points: 0, updatedAt: serverTimestamp() }, { merge:true });
        toast('Your points cleared.');
        await loadCompetitionScores();
      } catch(err){ console.error(err); toast('Failed to clear points'); }
    };
  }

  // wire settings gear for admin
  leaderTbody.querySelectorAll('.settingsBtn').forEach(b => {
    b.onclick = async () => {
      const studentId = b.dataset.student;
      const scoreDocId = b.dataset.scoredoc;
      if(!isAdmin()) return toast('Only admin may access settings');
      openStudentSettingsModal(studentId, scoreDocId);
    };
  });

  // show verified student's own row if not already present
  const verifiedSid = getVerifiedStudentId();
  if(verifiedSid){
    const { ranked } = buildRankedList(scoresCache);
    const me = ranked.find(r => r.studentId === verifiedSid);
    const topShown = admin ? ranked : buildRankedList(scoresCache).topRanks;
    const isDisplayed = topShown.some(r => r.studentId === verifiedSid);
    if(!isDisplayed && me){
      appendOrShowMyRow(me, false);
    } else if(!isDisplayed && !me){
      appendOrShowMyRow({ rank: '—', studentName: getVerifiedStudentName() || verifiedSid, className: '—', studentId: verifiedSid, points: 0 }, true);
    }
  }
}

/* ---------- admin student settings modal ---------- */
function openStudentSettingsModal(studentId, scoreDocId){
  // admin-only guard
  if(!isAdmin()) { toast('Only admin may access settings'); return; }

  showModalInner(`<div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div><strong>Student: ${escapeHtml(studentId)}</strong><div id="settingsStudentName" class="small-muted"></div></div>
      <div id="settingsCurrentPoints" class="small-muted" style="text-align:right">Points: —</div>
    </div>

    <hr style="margin:8px 0"/>

    <!-- Points adjust area -->
    <div id="pointsAdjustArea">
      <label style="font-weight:700">Adjust points</label>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
        <button id="ptsDec" class="btn">−</button>
        <input id="ptsValue" type="number" value="0" class="input-small" style="width:100px;text-align:center"/>
        <button id="ptsInc" class="btn">+</button>
        <input id="ptsReason" placeholder="Reason (optional)" style="flex:1;border:1px solid #e6eefc;padding:6px;border-radius:6px" />
        <button id="applyPoints" class="btn btn-primary">Apply</button>
      </div>
      <div class="small-muted" style="margin-top:6px">Use + / − to increment, then Apply to save (writes history).</div>
    </div>

    <hr style="margin:8px 0"/>

    <!-- Reset BIN area (hidden until clicked) -->
    <div id="resetBinArea">
      <label style="font-weight:700">Reset BIN</label>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
        <button id="revealResetBin" class="btn">Reset</button>
        <div id="resetBinInputs" style="display:none;width:100%;margin-left:8px">
          <input id="resetBinValue" class="input-small" placeholder="1234" style="width:120px"/>
          <button id="doResetBin" class="btn btn-primary">Save BIN</button>
        </div>
      </div>
      <div class="small-muted" style="margin-top:6px">Click Reset to reveal BIN field and save.</div>
    </div>

    <hr style="margin:8px 0"/>

    <!-- Block/Unblock and Save -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
      <div>
        <button id="settingsToggleBlock" class="btn">...</button>
        <span class="small-muted" id="blockedNote" style="margin-left:8px"></span>
      </div>
      <div style="display:flex;gap:8px">
        <button id="settingsCancel" class="btn">Cancel</button>
        <button id="settingsSave" class="btn btn-primary">Save</button>
      </div>
    </div>
  </div>`, { title: 'Student settings' });

  const sRef = doc(db,'students', studentId);

  // Populate existing state
  (async ()=>{
    try {
      const sSnap = await getDoc(sRef);
      const toggle = document.getElementById('settingsToggleBlock');
      const nameEl = document.getElementById('settingsStudentName');
      const ptsEl = document.getElementById('settingsCurrentPoints');
      if(sSnap.exists()){
        const d = sSnap.data();
        nameEl.textContent = d.name || d.studentName || '';
        const desiredBlocked = !!d.blocked;
        toggle.dataset.desired = desiredBlocked ? 'true' : 'false';
        toggle.textContent = desiredBlocked ? 'Unblock' : 'Block';
        document.getElementById('blockedNote').textContent = desiredBlocked ? 'Currently blocked' : '';
      } else {
        nameEl.textContent = '';
        toggle.dataset.desired = 'false';
        toggle.textContent = 'Block';
      }

      // try to fetch current competitionPoints doc if present
      if(scoreDocId){
        const scoreSnap = await getDoc(doc(db,'competitionScores', scoreDocId));
        if(scoreSnap.exists()){
          const pts = scoreSnap.data().points || 0;
          document.getElementById('settingsCurrentPoints').textContent = `Points: ${pts}`;
        } else {
          document.getElementById('settingsCurrentPoints').textContent = `Points: 0`;
        }
      } else {
        document.getElementById('settingsCurrentPoints').textContent = `Points: —`;
      }
    } catch(e){ console.warn(e); }
  })();

  // Toggle block button flips local desired state
  document.getElementById('settingsToggleBlock').onclick = () => {
    const btn = document.getElementById('settingsToggleBlock');
    btn.dataset.desired = (btn.dataset.desired === 'true') ? 'false' : 'true';
    btn.textContent = (btn.dataset.desired === 'true') ? 'Unblock' : 'Block';
    document.getElementById('blockedNote').textContent = btn.dataset.desired === 'true' ? '' : '';
  };

  // Points increment/decrement wiring
  const ptsInc = document.getElementById('ptsInc');
  const ptsDec = document.getElementById('ptsDec');
  const ptsValue = document.getElementById('ptsValue');
  const applyPoints = document.getElementById('applyPoints');
  ptsInc.onclick = () => { ptsValue.value = Number(ptsValue.value||0) + 1; };
  ptsDec.onclick = () => { ptsValue.value = Number(ptsValue.value||0) - 1; };

  applyPoints.onclick = async () => {
    const deltaRaw = Number(document.getElementById('ptsValue').value || 0);
    const reason = document.getElementById('ptsReason').value.trim() || '';
    if(!scoreDocId){ alert('score document id missing'); return; }
    try {
      await runTransaction(db, async (t) => {
        const ref = doc(db,'competitionScores', scoreDocId);
        const snap = await t.get(ref);
        let currentPoints = 0;
        if(snap.exists()) currentPoints = snap.data().points || 0;
        const newPoints = Math.max(0, currentPoints + deltaRaw);
        t.set(ref, { competitionId: currentCompetition.id, studentId, points: newPoints, updatedAt: serverTimestamp() }, { merge:true });
        const logRef = doc(collection(db,'pointsHistory'));
        const adminUid = (currentUser && currentUser.uid) || (auth && auth.currentUser && auth.currentUser.uid) || 'unknown';
        t.set(logRef, { competitionId: currentCompetition.id, studentId, delta: deltaRaw, reason, adminUid, createdAt: serverTimestamp() });
      });
      toast('Points updated');
      closeModal();
      await loadCompetitionScores();
    } catch(err){ console.error(err); alert('Update failed'); }
  };

  // Reveal Reset BIN inputs
  document.getElementById('revealResetBin').onclick = () => {
    document.getElementById('resetBinInputs').style.display = '';
    document.getElementById('resetBinValue').focus();
  };
  document.getElementById('doResetBin').onclick = async () => {
    const val = (document.getElementById('resetBinValue').value||'').trim();
    if(!/^\d{4}$/.test(val)){ alert('BIN must be 4 digits'); return; }
    try {
      await updateDoc(sRef, { bin: val });
      toast('BIN saved');
      closeModal();
      await loadCompetitionScores();
    } catch(e){ console.error(e); toast('Failed to save BIN'); }
  };

  // Save button (block/unblock + optional other fields)
  document.getElementById('settingsSave').onclick = async () => {
    try {
      if(!isAdmin()) { toast('Only admins'); return; }
      const toggle = document.getElementById('settingsToggleBlock');
      if(toggle){
        const sSnap2 = await getDoc(sRef);
        const cur = sSnap2.exists() ? sSnap2.data() : {};
        const curBlocked = !!cur.blocked;
        const desiredBlocked = toggle.dataset.desired === 'true';
        if(curBlocked !== desiredBlocked){
          const adminUid = (currentUser && currentUser.uid) || (auth && auth.currentUser && auth.currentUser.uid) || 'unknown';
          await updateDoc(sRef, { blocked: desiredBlocked, blockMessage: desiredBlocked ? 'Blocked by admin' : '', blockedBy: desiredBlocked ? adminUid : null, blockedAt: desiredBlocked ? serverTimestamp() : null });
        }
      }
      closeModal();
      toast('Saved');
      await loadCompetitionScores();
    } catch(e){ console.error(e); alert('Save failed'); }
  };

  document.getElementById('settingsCancel').onclick = () => closeModal();
}

// ---------- admin competition controls (wire buttons) ----------
// if (compSaveBtn) {
//   compSaveBtn.onclick = async () => {
//     // admin-only
//     if (sessionStorage.getItem('verifiedRole') !== 'admin' && currentRole !== 'admin') {
//       return toast('Only admins may perform this action');
//     }
//     if (!currentCompetition || !currentCompetition.id) return toast('No competition loaded');
//     const newName = (compNameInput.value || '').trim();
//     if (!newName) return toast('Enter a competition name');
//     try {
//       await updateDoc(doc(db, 'competitions', currentCompetition.id), { name: newName, updatedAt: serverTimestamp() });
//       currentCompetition.name = newName;
//       renderCompetitionHeader();
//       toast('Competition name updated');
//     } catch (e) {
//       console.error('Failed to update competition name', e);
//       toast('Failed to save competition name');
//     }
//   };
// }
// if (compToggleActiveBtn) {
//   compToggleActiveBtn.onclick = async () => {
//     if (sessionStorage.getItem('verifiedRole') !== 'admin' && currentRole !== 'admin') {
//       return toast('Only admins may perform this action');
//     }
//     if (!currentCompetition || !currentCompetition.id) return toast('No competition loaded');
//     try {
//       const newActive = !Boolean(currentCompetition.active);
//       await updateDoc(doc(db, 'competitions', currentCompetition.id), { active: newActive, updatedAt: serverTimestamp() });
//       currentCompetition.active = newActive;
//       renderCompetitionHeader();
//       toast(newActive ? 'Competition activated' : 'Competition deactivated');
//     } catch (e) {
//       console.error('Failed to toggle competition active', e);
//       toast('Failed to update competition status');
//     }
//   };
// }
/* ---------- View around me / show your rank inline ---------- */
viewAroundBtn.onclick = async () => {
  const verifiedRole = sessionStorage.getItem('verifiedRole');
  if(verifiedRole !== 'student'){
    // If not student, prompt verify modal (pre-fill with visitorStudentId if present)
    const pre = sessionStorage.getItem('visitorStudentId') || '';
    showStudentVerifyModal(pre);
    return;
  }

  const sid = sessionStorage.getItem('verifiedStudentId');
  if(!sid) return toast('No student linked');

  // build ranked list and find student
  const { ranked } = buildRankedList(scoresCache);
  const me = ranked.find(r => r.studentId === sid);
  if(!me){
    // student has no score yet: show small message and scroll to bottom
    appendOrShowMyRow({ rank: '—', studentName: sessionStorage.getItem('verifiedStudentName') || sid, className: '—', studentId: sid, points: 0 }, true);
    return;
  }

  // if student is already in the displayed rows, show alert instead
  const topShown = (sessionStorage.getItem('verifiedRole') === 'admin' || currentRole === 'admin') ? ranked : buildRankedList(scoresCache).topRanks;
  const isShown = topShown.some(r => r.studentId === sid);
  if(isShown){
    // they are already in top list -> show concise message
    toast(`You are already ranked #${me.rank} — see table above.`);
    // highlight row in table (if visible)
    highlightRowForStudent(sid);
    return;
  }

  // otherwise append an explicit "Your rank" row at the bottom and scroll
  appendOrShowMyRow(me, false);
};
// helper: highlight row for studentId in current table (if present)
function highlightRowForStudent(studentId){
  // remove previous highlights
  leaderTbody.querySelectorAll('tr').forEach(tr => tr.style.boxShadow = '');
  const rows = Array.from(leaderTbody.querySelectorAll('tr'));
  for(const tr of rows){
    if(tr.innerHTML.includes(escapeHtml(maskId(studentId)))){ // crude but effective matching for masked id column
      tr.style.boxShadow = '0 6px 20px rgba(37,99,235,0.08)';
      tr.scrollIntoView({ behavior:'smooth', block:'center' });
      return;
    }
  }
}
// helper: append or update a "Your rank" row at the bottom of the table
function appendOrShowMyRow(me, isEmpty){
  // remove existing my-rank row
  const old = document.getElementById('myRankRow');
  if(old) old.remove();

  const tr = document.createElement('tr');
  tr.id = 'myRankRow';
  tr.style.background = '#f7fbff';
  const rankCell = `<div class="rank-badge">${escapeHtml(String(me.rank || '—'))}</div>`;
  const name = `<strong>${escapeHtml(me.studentName || sessionStorage.getItem('verifiedStudentName') || '—')}</strong>`;
  const className = escapeHtml(me.className || '—');
  const idMasked = maskId(me.studentId || '');
  const points = escapeHtml(String(me.points || 0));
  tr.innerHTML = `<td>${rankCell}</td><td>${name}</td><td>${className}</td><td>${idMasked}</td><td><strong>${points}</strong></td><td class="small-muted">Your rank</td>`;
  leaderTbody.appendChild(tr);
  tr.scrollIntoView({ behavior:'smooth', block:'center' });
}
/* ---------- Test-yourself (kept disabled until verified student) ---------- */
/* The test flow you already have is preserved; we hook testYourselfBtn to check verification first */
toggleBgBtn.onclick = () => { const on = !SoundManager.bgEnabled; SoundManager.setBgEnabled(on); toggleBgBtn.textContent = `BG Sound: ${on? 'ON':'OFF'}`; };
toggleFxBtn.onclick = () => { const on = !SoundManager.effectsEnabled; SoundManager.setEffectsEnabled(on); toggleFxBtn.textContent = `FX Sound: ${on? 'ON':'OFF'}`; };
///dheeri
// try local JSON first then Firestore
async function loadLocalTestSets() {
  const paths = ['./math_questions_100.json', '/math_questions_100.json', './data/math_questions_100.json', '/data/math_questions_100.json'];
  for (const p of paths) {
    try {
      const res = await fetch(p, { cache: "no-store" });
      if (!res.ok) continue;
      const json = await res.json();
      if (json && Array.isArray(json.sets) && json.sets.length) {
        return json.sets.map(s => ({ id: s.id || (s.title? s.title.replace(/\s+/g,'_').toLowerCase():undefined), ...s }));
      }
    } catch (err) { /* try next */ }
  }
  return null;
}
async function loadRemoteTestSets(){
  try {
    const snap = await getDocs(collection(db,'testSets'));
    if(snap.size === 0) return [];
    return snap.docs.map(d => ({ id:d.id, ...d.data() }));
  } catch(e){ console.warn('loadRemoteTestSets failed', e); return []; }
}
async function loadAvailableSets(){
  const local = await loadLocalTestSets();
  if(local && local.length) return local;
  const remote = await loadRemoteTestSets();
  return remote;
}
function showSetsSelectionModal(sets){
  // build list with checkbox per set
  const html = ['<div style="max-height:60vh;overflow:auto;padding-top:6px">'];
  html.push('<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><label><input type="checkbox" id="selectAllSets" /> Select all</label><label style="margin-left:8px"><input type="checkbox" id="randomizeSets" checked /> Randomize questions</label></div>');
  sets.forEach((s, idx) => {
    const cnt = Array.isArray(s.questions) ? s.questions.length : (s.count||0);
    html.push(`<div style="margin-bottom:6px"><label><input type="checkbox" class="setCheckbox" data-idx="${idx}" ${idx===0? 'checked':''}/> <strong>${escapeHtml(s.title||s.id||'Set')}</strong> — <span class="small-muted">${cnt} questions</span></label></div>`);
  });
  html.push('</div>');
  html.push('<div style="text-align:right;margin-top:12px"><button id="cancelSets" class="btn">Cancel</button> <button id="startSets" class="btn btn-primary">Start test</button></div>');
  showModalInner(html.join(''), { title: 'Choose tests' });

  document.getElementById('selectAllSets').onchange = (e) => {
    document.querySelectorAll('.setCheckbox').forEach(cb => cb.checked = e.target.checked);
  };
  document.getElementById('cancelSets').onclick = () => closeModal();
  document.getElementById('startSets').onclick = () => {
    const chosenIdx = Array.from(document.querySelectorAll('.setCheckbox')).filter(cb => cb.checked).map(cb => Number(cb.dataset.idx));
    if(chosenIdx.length === 0) return alert('Select at least one set');
    const randomize = document.getElementById('randomizeSets').checked;
    const chosenSets = chosenIdx.map(i => sets[i]);
    closeModal();
    // prepare questions: shuffle each set, then interleave round-robin
    const pool = chosenSets.map(s => {
      const qarr = (s.questions || []).map(q => ({ ...q, _setTitle: s.title || s.id }));
      if(randomize) shuffleArray(qarr);
      return qarr;
    });
    const interleaved = [];
    let taken = true;
    let cursor = 0;
    while(taken){
      taken = false;
      for(let i=0;i<pool.length;i++){
        if(pool[i].length > 0){
          interleaved.push(pool[i].shift());
          taken = true;
        }
      }
    }
    // attach a title for the combined set
    const combinedTitle = chosenSets.map(s => s.title || s.id).join(' + ');
    openTestModal({ id: 'combined_'+Date.now(), title: combinedTitle, questions: interleaved });
  };
}

testYourselfBtn.onclick = async () => {
  const vrole = getVerifiedRole();
  // admin cannot take tests
  if(isAdmin()){
    showModalInner(`<div><div class="small-muted">You are verified as an admin and cannot take tests. If you want to test, create/verify a student account first.</div><div style="text-align:right;margin-top:12px"><button id="adminTestClose" class="btn btn-primary">Close</button></div></div>`, { title: 'Admin — cannot test' });
    document.getElementById('adminTestClose').onclick = () => closeModal();
    return;
  }
  if(vrole !== 'student'){
    // clearer message + show verify modal
    toast('You are not verified — please verify as a student to take tests.');
    showStudentVerifyModal();
    return;
  }

  // verified student -> load tests
  try {
    const sets = await loadAvailableSets();
    if(!sets || sets.length === 0) return toast('No test sets available.');
    return showSetsSelectionModal(sets);
  } catch(err){ console.error(err); toast('Failed to load tests'); }
};

/* ---------- admin save/toggle competition ---------- */
// compSaveBtn.onclick = async () => {
//   // if(sessionStorage.getItem('verifiedRole') !== 'admin') return toast('Admin only');

//   if(!isAdmin()) return toast('Admin only');

//   if(!currentCompetition) return;
//   const name = compNameInput.value.trim();
//   if(!name) return alert('Enter name');
//   try {
//     await updateDoc(doc(db,'competitions', currentCompetition.id), { name, updatedAt: serverTimestamp() });
//     currentCompetition.name = name;
//     renderCompetitionHeader();
//     toast('Saved');
//   } catch(err){ console.error(err); toast('Save failed'); }
// };
// compToggleActiveBtn.onclick = async () => {
//   if(!isAdmin()) return toast('Admin only');
//   if(!currentCompetition) return;
//   const newActive = !currentCompetition.active;
//   try {
//     await updateDoc(doc(db,'competitions', currentCompetition.id), { active: newActive, updatedAt: serverTimestamp() });
//     currentCompetition.active = newActive;
//     renderCompetitionHeader();
//     toast(newActive ? 'Activated' : 'Deactivated');
//   } catch(err){ console.error(err); toast('Failed'); }
// };

// Toggle "show all scorers" inline under the top list
if (viewAllBtn) {
  viewAllBtn.onclick = () => {
    if(!isAdmin()) return toast('Admin only');
    adminShowAll = !adminShowAll;
    viewAllBtn.textContent = adminShowAll ? 'Hide extra scorers' : 'View all scorers';
    renderLeaderboard();
  };
}

/* ---------- openTestModal (improved) ---------- */
function openTestModal(set){
  const questions = (set.questions || []).map((q, idx) => {
    const choices = Array.isArray(q.choices) ? q.choices.map(c => ({ text: typeof c === 'string' ? c : (c.text||String(c)) })) : [];
    const correct = q.correct;
    return { ...q, choices, correct, _idx: idx };
  });
  shuffleArray(questions);

  const state = {
    setId: set.id, setTitle: set.title || 'Test', questions,
    index: 0, answers: Array(questions.length).fill(null),
    correctCount: 0, skipped: 0, incorrect: 0,
    currentStreak: 0, runHighest: 0, timeoutId: null, timerSec: 20,
    highestHolder: null
  };

  const html = [
    `<div style="padding:6px 0">
       <div id="testHeader" style="display:flex;justify-content:space-between;align-items:center">
         <div><strong>${escapeHtml(state.setTitle)}</strong><div class="small-muted" id="testSub">Questions: ${state.questions.length}</div></div>
         <div class="small-muted" id="testRight">Highest: —</div>
       </div>
     </div>`
  ];
  html.push(`<div id="testContainer"></div>`);
  html.push(`<div class="test-footer">
    <div class="stats-line"><span id="qProgress"></span><span id="streakInfo"></span></div>
    <div><button id="testPrev" class="btn">← Prev</button> <button id="testNext" class="btn">Next →</button> <button id="testFinish" class="btn btn-primary">Finish</button> <button id="testCancel" class="btn">Cancel</button></div>
  </div>`);

  // Insert modal first (DOM elements will exist after this)
  showModalInner(html.join(''), { title: 'Test' });

  // now it's safe to fetch async data and then render
  getHighestStreakHolder().then(h => {
    state.highestHolder = h;
    // only call renderQuestion AFTER the modal DOM is present
    renderQuestion();
  }).catch(()=>{ /* ignore errors */ });

  const testContainer = document.getElementById('testContainer');

  function renderQuestion(){
    const headerRight = document.getElementById('testRight');
    try {
      if(headerRight) {
        if(state.highestHolder){
          headerRight.textContent = `Highest: ${state.highestHolder.runHighest} • ${state.highestHolder.studentName || state.highestHolder.studentId || '—'}`;
        } else {
          headerRight.textContent = `Highest: ${currentCompetition?.highestStreak || 0}`;
        }
      }
    } catch(e){ /* ignore DOM write errors */ }
    

    const q = state.questions[state.index];
    if(!q){ testContainer.innerHTML = '<div class="small-muted">No question</div>'; return; }
    const qNum = state.index + 1;
    const total = state.questions.length;
    const timeLimit = q.timeLimit || 20;
    state.timerSec = timeLimit;

    const choicesHtml = q.choices.map((c, i) => {
      // when answered show selected stylings
      const answered = state.answers[state.index];
      const isSelected = answered && Array.isArray(answered.selected) && answered.selected.includes(i);
      const correctArr = Array.isArray(q.correct) ? q.correct.map(Number) : [Number(q.correct)];
      const isCorrectChoice = correctArr.includes(i);
      let cls = '';
      let meta = '';
      if(answered){
        if(isCorrectChoice && isSelected){ cls = 'choice-correct choice-selected'; meta = '<span class="choice-meta">✓</span>'; }
        else if(isCorrectChoice && !isSelected){ cls = 'choice-correct'; meta = '<span class="choice-meta">✓</span>'; }
        else if(!isCorrectChoice && isSelected){ cls = 'choice-wrong choice-selected'; meta = '<span class="choice-meta">✖</span>'; }
      }
      return `<label class="${cls}" data-choice-index="${i}" id="label_${state.index}_${i}">${escapeHtml(c.text||'')}${meta}</label>`;
    }).join('');

    testContainer.innerHTML = `<div style="margin-bottom:8px"><div style="font-size:1.05rem;margin-bottom:8px">${escapeHtml(q.text)}</div>
      <div class="choices">${choicesHtml}</div>
      <div style="margin-top:8px" class="small-muted">Time left: <span id="timeLeft">${state.timerSec}</span>s</div>
      <div style="margin-top:8px" id="explanationArea"></div></div>`;

    // wire new labels to inputs (we implement click-on-label to submit)
    testContainer.querySelectorAll('.choices label').forEach(lbl => {
      lbl.onclick = () => {
        // ignore if already answered
        if(state.answers[state.index] !== null) return;
        const idx = Number(lbl.dataset.choiceIndex || lbl.getAttribute('data-choice-index') || lbl.id.split('_').pop());
        // determine if multiple-answer (checkbox) — if q.correct is array length > 1 treat as multi; here we treat as single by default
        const isMulti = Array.isArray(q.correct) && q.correct.length > 1;
        const selected = isMulti ? [idx] : [idx]; // we only allow single selection via click
        submitAnswer(state.index, selected);
      };
    });

    // update progress + streak
    const qProgress = document.getElementById('qProgress');
    if(qProgress) qProgress.textContent = `Question ${qNum} / ${total}`;
    const streakInfo = document.getElementById('streakInfo');
    if(streakInfo) streakInfo.textContent = `Current streak: x${state.currentStreak} • This run highest: ${state.runHighest}`;

    // timer
    if(state.timeoutId) clearInterval(state.timeoutId);
    state.timeoutId = setInterval(() => {
      state.timerSec--;
      const timeLeft = document.getElementById('timeLeft');
     if(timeLeft) timeLeft.textContent = state.timerSec;


      if(state.timerSec <= 0){
        clearInterval(state.timeoutId);
        state.timeoutId = null;
        if(state.answers[state.index] === null) submitAnswer(state.index, []); // empty
        // auto move
        setTimeout(()=> goNext(), 350);
      }
    }, 1000);
  }

// change: make submitAnswer async
async function submitAnswer(qIndex, selectedIndexes){
  const q = state.questions[qIndex];
  const correctArr = Array.isArray(q.correct) ? q.correct.map(Number) : [Number(q.correct)];
  const isCorrect = arraysEqualNoOrder(correctArr.map(String), selectedIndexes.map(String));
  state.answers[qIndex] = { selected: selectedIndexes, correct: isCorrect, timeLeft: state.timerSec };

  if(isCorrect){
    state.correctCount++;
    state.currentStreak++;
    state.runHighest = Math.max(state.runHighest, state.currentStreak);
    // play sound but make sure errors are swallowed
    try { await Promise.resolve(SoundManager.playCorrect && SoundManager.playCorrect()); } catch(e) { /* ignore */ }

    if([10,20,30,40,50,60,70,80,90,100].includes(state.currentStreak)){
      try { await Promise.resolve(SoundManager.playStreak && SoundManager.playStreak(state.currentStreak)); } catch(e) {}
    }
  } else {
    if(selectedIndexes.length === 0) state.skipped++; else state.incorrect++;
    state.currentStreak = 0;
    try { await Promise.resolve(SoundManager.playIncorrect && SoundManager.playIncorrect()); } catch(e) { /* ignore */ }
  }

  // rest of your existing UI update code unchanged...
  const correctText = correctArr.map(i => escapeHtml(q.choices[i]?.text || q.choices[i] || '')).join(', ');
  const explanationArea = document.getElementById('explanationArea');
  if(explanationArea){
    if(isCorrect){
      explanationArea.innerHTML = `<div style="color:green;font-weight:700">✓ Correct</div><div class="small-muted">${escapeHtml(q.explanation || '')}</div>`;
    } else {
      explanationArea.innerHTML = `<div style="color:#d43f3f;font-weight:700">✖ Incorrect</div><div class="small-muted">Correct answer: ${correctText}</div><div class="small-muted" style="margin-top:6px">${escapeHtml(q.explanation || '')}</div>`;
    }
  }
  
  // update labels (your existing code)...
  state.questions[qIndex].choices.forEach((c,i) => {
    const lbl = document.getElementById(`label_${qIndex}_${i}`);
    if(!lbl) return;
    const isSelected = state.answers[qIndex].selected.includes(i);
    if(correctArr.includes(i)){
      lbl.classList.add('choice-correct'); lbl.classList.remove('choice-wrong'); lbl.innerHTML = `${escapeHtml(c.text||'')}<span class="choice-meta">✓</span>`;
    } else if(isSelected){
      lbl.classList.add('choice-wrong'); lbl.classList.remove('choice-correct'); lbl.innerHTML = `${escapeHtml(c.text||'')}<span class="choice-meta">✖</span>`;
    } else {
      lbl.innerHTML = `${escapeHtml(c.text||'')}`;
    }
    if(isSelected) lbl.classList.add('choice-selected');
  });

  if(state.timeoutId){ clearInterval(state.timeoutId); state.timeoutId = null; }

  const streakInfo = document.getElementById('streakInfo');
  if(streakInfo) streakInfo.textContent = `Current streak: x${state.currentStreak} • This run highest: ${state.runHighest}`;
}



  function goPrev(){ if(state.index <= 0) return; state.index--; renderQuestion(); }
  function goNext(){ if(state.index >= state.questions.length - 1) return; state.index++; renderQuestion(); }

  document.getElementById('testPrev').onclick = goPrev;
  document.getElementById('testNext').onclick = goNext;
  document.getElementById('testCancel').onclick = () => { if(confirm('Cancel test? Progress will be lost.')) closeModal(); };
  document.getElementById('testFinish').onclick = async () => {
    if(state.timeoutId){ clearInterval(state.timeoutId); state.timeoutId = null; }
    const correct = state.correctCount;
    const incorrect = state.incorrect;
    const skipped = state.skipped + state.questions.filter((_,i)=> state.answers[i] === null).length;
    const total = state.questions.length;
    const scoreDelta = correct * 3; // 3 points per correct (user request)

    // const studentUidForPayload = (currentUser && currentUser.uid) || (auth && auth.currentUser && auth.currentUser.uid) || null;

    const studentUidForPayload =
  currentUser?.uid ||
  auth?.currentUser?.uid ||
  null;

const resultPayload = {
  setId: state.setId, setTitle: state.setTitle, studentUid: studentUidForPayload, studentId: currentStudentId,
      studentName: currentStudentName || '', correct, incorrect, skipped, total, scoreDelta, runHighest: state.runHighest, currentStreak: state.currentStreak,
      createdAt: serverTimestamp()
    };
    try {
      await addDoc(collection(db,'testResults'), resultPayload);
      if(currentCompetition && currentStudentId){
        const scoreDocId = `${currentCompetition.id}_${currentStudentId}`;
        await runTransaction(db, async (t) => {
          const ref = doc(db,'competitionScores', scoreDocId);
          const snap = await t.get(ref);
          const prevPoints = snap.exists() ? (snap.data().points || 0) : 0;
          const newPoints = prevPoints + scoreDelta;
          t.set(ref, { competitionId: currentCompetition.id, studentId: currentStudentId, studentName: currentStudentName || '', points: newPoints, updatedAt: serverTimestamp() }, { merge:true });
        });
      }
      // update competition highest streak if applicable
      if(currentCompetition && state.runHighest > (currentCompetition.highestStreak || 0)){
        await updateDoc(doc(db,'competitions', currentCompetition.id), { highestStreak: state.runHighest, highestStreakHolder: currentStudentId || '', highestStreakHolderName: currentStudentName || '', updatedAt: serverTimestamp() });
        currentCompetition.highestStreak = state.runHighest;
      }
      // fetch latest highest holder for display
      const holder = await getHighestStreakHolder();
      await loadCompetitionScores();
      // show summary modal (centered, clean)
      const holderText = holder ? `${holder.runHighest} — ${escapeHtml(holder.studentName || holder.studentId || '')}` : '—';
      showModalInner(`<div><h3>Test complete</h3>
        <div style="margin-top:6px">Correct: <strong>${correct}</strong></div>
        <div>Incorrect: <strong>${incorrect}</strong></div>
        <div>Skipped: <strong>${skipped}</strong></div>
        <div style="margin-top:8px">Points gained: <strong>${scoreDelta}</strong></div>
        <div style="margin-top:10px" class="small-muted">Highest streak this server: <strong>${holderText}</strong></div>
        <div style="text-align:right;margin-top:12px"><button id="summaryClose" class="btn btn-primary">Close</button></div></div>`, { title: 'Summary' });
      document.getElementById('summaryClose').onclick = () => { closeModal(); };
    } catch(err){ console.error(err); toast('Saving result failed'); }
  };

  // keyboard nav
  window.addEventListener('keydown', keyHandler);
  function keyHandler(e){ if(e.key === 'ArrowLeft') goPrev(); if(e.key === 'ArrowRight') goNext(); }

  // render first
  renderQuestion();

  // ensure to cleanup handler on modal close
  const origClose = closeModal;
  const newClose = () => { window.removeEventListener('keydown', keyHandler); origClose(); };
  document.getElementById('modalCloseBtn').onclick = newClose;
}
note i have for folder asses so all sounds n here please 