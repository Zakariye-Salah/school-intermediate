

// leaderboard.js (updated)
// required imports (your firebase-config.js should export auth and db)
// replace your existing auth import line with this
import { auth, db } from './firebase-config.js';
import { SoundManager } from './sound.js';
import {
  onAuthStateChanged,
  signOut,
  signInWithPopup,
  GoogleAuthProvider
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
  setDoc, updateDoc, runTransaction, addDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
/* ---------- DOM refs ---------- */
/* ---------- DOM refs ---------- */
const backBtn = document.getElementById('backBtn');
const verifyBtn = document.getElementById('verifyBtn');
const viewAroundBtn = document.getElementById('viewAroundBtn');
const testYourselfBtn = document.getElementById('testYourselfBtn');
const toggleBgBtn = document.getElementById('toggleBgBtn');
const toggleFxBtn = document.getElementById('toggleFxBtn');
const logoutBtn = document.getElementById('logoutBtn');
const leaderTbody = document.getElementById('leaderTbody');
const compTitleEl = document.getElementById('compTitle');
const compRangeEl = document.getElementById('compRange');
const competitionSub = document.getElementById('competitionSub');
const studentTag = document.getElementById('studentTag');
const adminControls = document.getElementById('adminControls');

// These may be missing in your new HTML; guard before using them elsewhere
const compNameInput = document.getElementById('compNameInput');
const compSaveBtn = document.getElementById('compSaveBtn');
const compToggleActiveBtn = document.getElementById('compToggleActiveBtn');

// manage button and view-all button (must exist in new HTML)
const manageCompBtn = document.getElementById('manageCompBtn');
const viewAllBtn = document.getElementById('viewAllBtn');

const modalRoot = document.getElementById('modalRoot');

let currentUser = null;
let currentRole = null; // 'admin' | 'student' | null
let currentStudentId = null;
let currentStudentName = '';
let currentCompetition = null;
let scoresCache = [];

let adminShowAll = false; // when true, admin sees full list under top ranks

/* ---------- init ---------- */
SoundManager.preloadAll();
/* ---------- modal helpers ---------- */
/* ---------- modal helpers (replacement) ---------- */

/**
 * showModalInner(html, opts)
 * opts: { title, sub, actions (HTML string), onClose (fn) }
 */
function showModalInner(html, opts = {}) {
  if (!modalRoot) {
    console.warn('modalRoot not found');
    return;
  }

  // Build modal markup
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-role="backdrop"></div>
    <div class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(opts.title || 'Modal')}">
      <div class="modal-head">
        <div>
          <h3 class="modal-title">${escapeHtml(opts.title || '')}</h3>
          <div class="modal-sub">${escapeHtml(opts.sub || '')}</div>
        </div>
        <div>
          <button id="modalCloseBtn" class="btn" aria-label="Close modal">✕</button>
        </div>
      </div>
      <div class="modal-body">${html || ''}</div>
      <div class="modal-actions">${opts.actions || ''}</div>
    </div>
  `;

  // Show modal (match CSS .visible / .hidden patterns)
  modalRoot.classList.remove('hidden');
  modalRoot.classList.add('visible');

  // Lock body scroll
  document.body.classList.add('modal-open');

  // Wire close button
  const closeBtn = document.getElementById('modalCloseBtn');
  if (closeBtn) closeBtn.onclick = () => closeModal(opts.onClose);

  // Backdrop click closes modal
  const backdrop = modalRoot.querySelector('[data-role="backdrop"]');
  if (backdrop) backdrop.onclick = () => closeModal(opts.onClose);

  // Escape key closes modal (store handler so we can remove it)
  const escHandler = (e) => { if (e.key === 'Escape') closeModal(opts.onClose); };
  // remove any previous handler first (safety)
  if (modalRoot._escHandler) document.removeEventListener('keydown', modalRoot._escHandler);
  modalRoot._escHandler = escHandler;
  document.addEventListener('keydown', escHandler);
}

/**
 * closeModal(optionalCallback)
 */
function closeModal(cb) {
  if (!modalRoot) return;
  // hide & clear content
  modalRoot.classList.add('hidden');
  modalRoot.classList.remove('visible');
  modalRoot.innerHTML = '';

  // unlock body scroll
  document.body.classList.remove('modal-open');

  // remove escape handler
  if (modalRoot._escHandler) {
    document.removeEventListener('keydown', modalRoot._escHandler);
    modalRoot._escHandler = null;
  }

  // call optional onClose callback
  if (typeof cb === 'function') {
    try { cb(); } catch (e) { console.error('modal onClose error', e); }
  }
}

// function closeModal(){ modalRoot.innerHTML = ''; modalRoot.classList.add('hidden'); }
function toast(msg, t=2500){ const el = document.createElement('div'); el.className='card'; el.style.position='fixed'; el.style.right='18px'; el.style.bottom='18px'; el.style.zIndex=80; el.textContent = msg; document.body.appendChild(el); setTimeout(()=>el.remove(), t); }
/* ---------- helpers ---------- */
function isAdmin(){
  return sessionStorage.getItem('verifiedRole') === 'admin' || currentRole === 'admin';
}
function maskId(id){ if(!id) return '—'; 
  const s=String(id); 
  if(s.length<=4) return '*'.repeat(s.length); 
  return '***'+s.slice(-4); 
}
function daysLeftUntil(endDate){ 
  const now=new Date(); 
  const e=new Date(endDate); 
  const diff=Math.ceil((e-now)/(1000*60*60*24)); 
  return diff>=0?diff:0; 
}
function escapeHtml(s){ 
  if(s==null) return ''; 
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); 
}
function shuffleArray(a){ 
  for(let i=a.length-1;i>0;i--){ 
    const j=Math.floor(Math.random()*(i+1)); 
    [a[i],a[j]]=[a[j],a[i]]; 
  } }
function arraysEqualNoOrder(a,b){ 
  if(!Array.isArray(a)||!Array.isArray(b)) return false; 
  if(a.length!==b.length) return false; 
  const sa=[...a].map(String).sort(), sb=[...b].map(String).sort(); 
  for(let i=0;
    i<sa.length;
    i++) if(sa[i]!==sb[i]) return false; 
  return true; 
}
// Local storage helpers: prefer localStorage (persistence across refresh)
// Keys used: verifiedRole, verifiedStudentId, verifiedStudentName, visitorStudentId
// Local/session helpers (unified so refresh and checks are consistent)
function setVerifiedRole(role){
  if(role == null){
    localStorage.removeItem('verifiedRole');
    sessionStorage.removeItem('verifiedRole');
  } else {
    localStorage.setItem('verifiedRole', role);
    sessionStorage.setItem('verifiedRole', role);
  }
}
function getVerifiedRole(){
  return sessionStorage.getItem('verifiedRole') || localStorage.getItem('verifiedRole') || null;
}

function setVerifiedStudentId(id){
  if(id == null){
    localStorage.removeItem('verifiedStudentId');
    sessionStorage.removeItem('verifiedStudentId');
  } else {
    localStorage.setItem('verifiedStudentId', id);
    sessionStorage.setItem('verifiedStudentId', id);
  }
}
function getVerifiedStudentId(){
  return sessionStorage.getItem('verifiedStudentId') || localStorage.getItem('verifiedStudentId') || null;
}

function setVerifiedStudentName(n){
  if(n == null){
    localStorage.removeItem('verifiedStudentName');
    sessionStorage.removeItem('verifiedStudentName');
  } else {
    localStorage.setItem('verifiedStudentName', n);
    sessionStorage.setItem('verifiedStudentName', n);
  }
}
function getVerifiedStudentName(){
  return sessionStorage.getItem('verifiedStudentName') || localStorage.getItem('verifiedStudentName') || '';
}
function setVisitorStudentId(id){ if(id==null) localStorage.removeItem('visitorStudentId'); else localStorage.setItem('visitorStudentId', id); }
function getVisitorStudentId(){ return localStorage.getItem('visitorStudentId'); }
function clearAppStorageForAuth(){
  // only clear the keys this app uses for verification/session
  localStorage.removeItem('verifiedRole');
  localStorage.removeItem('verifiedStudentId');
  localStorage.removeItem('verifiedStudentName');
  localStorage.removeItem('visitorStudentId');
  sessionStorage.removeItem('verifiedRole');
  sessionStorage.removeItem('verifiedStudentId');
  sessionStorage.removeItem('verifiedStudentName');
  sessionStorage.removeItem('visitorStudentId');
}
/* ---------- auth & startup (adjusted to allow unauthenticated visitors) ---------- */
onAuthStateChanged(auth, async user => {
  if(user){
    currentUser = user;
    const vs = getVerifiedRole();
    if(vs){
      const vrole = vs;
      if(vrole === 'student'){
        currentRole = 'student';
        currentStudentId = getVerifiedStudentId() || null;
        currentStudentName = getVerifiedStudentName() || '';
      } else if(vrole === 'admin'){
        currentRole = 'admin';
      }
    }
    await resolveRole();
        // after resolveRole() succeeds for a signed-in user:
    // attempt auto admin verification so a logged-in admin is auto-verified
    try { await attemptAdminVerifyAuto(); } catch(e){ console.warn('auto-admin-verify failed', e); }

  } else {
    currentUser = null;
    currentRole = null;
    const visitorId = getVisitorStudentId();
    if(visitorId){
      showStudentVerifyModal(visitorId);
    }
  }

  await loadCompetitionAndScores();
// after admin verification or when role changes:
applyVerifiedUIState();
applyAdminHeaderUI();
applyManageButtonUI();
renderCompetitionHeader();
});
function applyAdminHeaderUI(){
  const admin = isAdmin();

  // HARD HIDE old header controls (in case they exist in DOM)
  if (compNameInput) compNameInput.style.display = 'none';
  if (compSaveBtn) compSaveBtn.style.display = 'none';
  if (compToggleActiveBtn) compToggleActiveBtn.style.display = 'none';

  // Manage & viewAll should be visible only to admins
  if (viewAllBtn) viewAllBtn.style.display = admin ? '' : 'none';
  if (manageCompBtn) manageCompBtn.style.display = admin ? '' : 'none';
}


// applyVerifiedUIState();
// applyAdminHeaderUI();


// --- Manage competition modal & wiring ---
// ensure element exists in DOM (if you added HTML snippet above)
function applyManageButtonUI(){
  if(!manageCompBtn) return;
  manageCompBtn.style.display = isAdmin() ? '' : 'none';
  manageCompBtn.textContent = 'Manage';
}
applyManageButtonUI(); // initial call

// call after any verify/change events too: ensure you call applyManageButtonUI() in applyVerifiedUIState success paths

if(manageCompBtn){
  manageCompBtn.onclick = () => {
    if(!isAdmin()) return toast('Admin only');
    if(!currentCompetition) return toast('No competition loaded');
    const status = currentCompetition.active ? 'Active' : 'Inactive';
    const html = `
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <strong style="font-size:1.05rem">${escapeHtml(currentCompetition.name || 'Competition')}</strong>
          <button id="manageEditNameBtn" class="btn" title="Edit name">✎</button>
        </div>

        <div id="manageNameRow" style="display:none">
          <input id="manageNameInput" class="input-small" value="${escapeHtml(currentCompetition.name||'')}" style="width:100%"/>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">
            <button id="manageCancelName" class="btn">Cancel</button>
            <button id="manageSaveName" class="btn btn-primary">Save</button>
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div class="small-muted">Status</div>
            <div id="manageStatus" style="font-weight:700">${status}</div>
          </div>
          <div style="display:flex;gap:8px">
            <button id="manageToggleActive" class="btn">${currentCompetition.active ? 'Deactivate' : 'Activate'}</button>
            <button id="manageClose" class="btn">Close</button>
          </div>
        </div>
      </div>
    `;
    showModalInner(html, { title: 'Manage competition' });

    // wire events
    document.getElementById('manageClose').onclick = () => closeModal();
    const editBtn = document.getElementById('manageEditNameBtn');
    const nameRow = document.getElementById('manageNameRow');
    const manageNameInput = document.getElementById('manageNameInput');
    const manageSaveName = document.getElementById('manageSaveName');
    const manageCancelName = document.getElementById('manageCancelName');
    const manageToggleActive = document.getElementById('manageToggleActive');
    const manageStatus = document.getElementById('manageStatus');

    editBtn.onclick = () => {
      nameRow.style.display = '';
      manageNameInput.focus();
    };
    manageCancelName.onclick = () => { nameRow.style.display = 'none'; manageNameInput.value = currentCompetition.name || ''; };
    manageSaveName.onclick = async () => {
      const newName = (manageNameInput.value||'').trim();
      if(!newName) return toast('Enter name');
      try {
        await updateDoc(doc(db,'competitions', currentCompetition.id), { name: newName, updatedAt: serverTimestamp() });
        currentCompetition.name = newName;
        renderCompetitionHeader();
        manageStatus.textContent = currentCompetition.active ? 'Active' : 'Inactive';
        nameRow.style.display = 'none';
        toast('Competition name updated');
      } catch(e){ console.error(e); toast('Save failed'); }
    };

    manageToggleActive.onclick = async () => {
      try {
        const newActive = !Boolean(currentCompetition.active);
        await updateDoc(doc(db,'competitions', currentCompetition.id), { active: newActive, updatedAt: serverTimestamp() });
        currentCompetition.active = newActive;
        renderCompetitionHeader();
        manageToggleActive.textContent = currentCompetition.active ? 'Deactivate' : 'Activate';
        manageStatus.textContent = currentCompetition.active ? 'Active' : 'Inactive';
        toast(currentCompetition.active ? 'Activated' : 'Deactivated');
      } catch(e){ console.error(e); toast('Toggle failed'); }
    };
  };
}

async function openHistoryModal(studentId){
  try {
    const snap = await getDocs(query(collection(db,'pointsHistory'), where('studentId','==', studentId), orderBy('createdAt', 'desc'), limit(50)));
    const rows = [];
    snap.forEach(d => {
      const dd = d.data();
      rows.push({ id: d.id, delta: dd.delta, reason: dd.reason || '', adminUid: dd.adminUid || '', createdAt: dd.createdAt ? new Date(dd.createdAt.seconds * 1000).toLocaleString() : '' });
    });
    let html = `<div style="max-height:60vh;overflow:auto"><h3>Points history — ${escapeHtml(studentId)}</h3><table style="width:100%;border-collapse:collapse"><thead><tr><th>Date</th><th>Delta</th><th>Admin</th><th>Reason</th></tr></thead><tbody>`;
    if(rows.length === 0){
      html += `<tr><td colspan="4" class="small-muted">No history found.</td></tr>`;
    } else {
      for(const r of rows){
        html += `<tr><td>${escapeHtml(r.createdAt)}</td><td>${escapeHtml(String(r.delta))}</td><td>${escapeHtml(r.adminUid||'—')}</td><td>${escapeHtml(r.reason||'')}</td></tr>`;
      }
    }
    html += `</tbody></table></div><div style="text-align:right;margin-top:8px"><button id="historyClose" class="btn">Close</button></div>`;
    showModalInner(html, { title: 'History' });
    const closeBtn = document.getElementById('historyClose');
    if(closeBtn) closeBtn.onclick = () => closeModal();
  } catch(e){
    console.error('openHistoryModal failed', e);
    toast('Failed to load history');
  }
}
/* ---------- role detection and persistence ---------- */
async function resolveRole(){
  try {
    // first try users mapping
    const uDoc = await getDoc(doc(db, 'users', currentUser.uid));
    if(uDoc.exists()){
      const u = uDoc.data();
      currentRole = u.role || currentRole;
      if(currentRole === 'student') currentStudentId = currentStudentId || u.studentId || null;
    }

    // admin collection check (if not set)
    if(!currentRole){
      const snaps = await getDocs(query(collection(db,'admin'), where('uid','==', currentUser.uid)));
      if(snaps.size>0){
        currentRole = 'admin';
        // persist
        try { await setDoc(doc(db,'users', currentUser.uid), { role:'admin', adminUid: currentUser.uid, updatedAt: serverTimestamp() }, { merge:true }); } catch(e){ console.warn(e); }
      }
    }

    // students with authUid
    if(!currentRole){
      const sQuery = query(collection(db,'students'), where('authUid','==', currentUser.uid));
      const sSnap = await getDocs(sQuery);
      if(sSnap.size>0){
        currentRole = 'student';
        currentStudentId = sSnap.docs[0].id;
        try { await setDoc(doc(db,'users', currentUser.uid), { role:'student', studentId: currentStudentId, updatedAt: serverTimestamp() }, { merge:true }); } catch(e){ console.warn(e); }
      }
    }

    // email fallback
    if(!currentRole && currentUser.email){
      const sQuery2 = query(collection(db,'students'), where('email','==', currentUser.email));
      const sSnap2 = await getDocs(sQuery2);
      if(sSnap2.size>0){
        currentRole = 'student';
        currentStudentId = sSnap2.docs[0].id;
        try { await setDoc(doc(db,'users', currentUser.uid), { role:'student', studentId: currentStudentId, updatedAt: serverTimestamp() }, { merge:true }); } catch(e){ console.warn(e); }
      }
    }

    // fetch student name if we have studentId
    if(currentRole === 'student' && currentStudentId){
      try {
        const s = await getDoc(doc(db,'students', currentStudentId));
        if(s.exists()){
          const d = s.data();
          currentStudentName = d.name || d.studentName || d.fullName || '';
          if(currentStudentName) studentTag.textContent = `— ${currentStudentName}`;
          // persist in session if verified previously
          sessionStorage.setItem('verifiedStudentName', currentStudentName || '');
        }
      } catch(e){ console.warn('get student doc failed', e); }
    } else {
      studentTag.textContent = '';
    }

    // show/hide admin controls
    if(currentRole === 'admin') adminControls.classList.remove('hidden'); else adminControls.classList.add('hidden');

  } catch(err){ console.warn('resolveRole failed', err); }
}
/* ---------- verification flows ---------- */
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
// Accepts optional prefillId (string).
function showStudentVerifyModal(prefillId = ''){
  showModalInner(`<div>
    <div class="small-muted">Enter your Student ID and 4-digit BIN to verify. If this is your first time, you'll set a 4-digit BIN.</div>
    <div style="margin-top:10px"><input id="verifyStudentId" class="input-small" placeholder="Student ID (e.g. S11225)" value="${escapeHtml(prefillId)}"></div>
    <div style="margin-top:8px"><input id="verifyBin" class="input-small" placeholder="4-digit BIN"></div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="verifyCancel" class="btn">Cancel</button>
      <button id="verifyDo" class="btn btn-primary">Verify</button>
    </div>
  </div>`, { title: 'Verify as student' });

  document.getElementById('verifyCancel').onclick = () => { closeModal(); applyVerifiedUIState(); };

  document.getElementById('verifyDo').onclick = async () => {
    const sid = document.getElementById('verifyStudentId').value.trim();
    const bin = document.getElementById('verifyBin').value.trim();
    if(!sid){ alert('Enter Student ID'); return; }
    if(!/^\d{4}$/.test(bin)){ alert('Enter a 4-digit BIN'); return; }

    try {
      const sRef = doc(db,'students', sid);
      const sSnap = await getDoc(sRef);
      if(!sSnap.exists()){
        alert('Student ID not found'); return;
      }
      const sData = sSnap.data();

      // if blocked, stop
      if(sData.blocked){
        alert('Account blocked by admin. Please contact administrator.');
        return;
      }

      // if student doc has no bin -> create it (first time)
      if(!sData.bin || !/^\d{4}$/.test(String(sData.bin))){
        if(!confirm('No BIN exists for this Student account. Create this BIN now?')) return;
        // set bin on students doc
        await updateDoc(sRef, { bin: bin });
      } else {
        // verify bin matches
        if(String(sData.bin) !== bin){
          alert('BIN does not match.'); return;
        }
      }

      // If we have a signed-in user, persist mapping in users/collection
      if(currentUser){
        try { await setDoc(doc(db,'users', currentUser.uid), { role:'student', studentId: sid, linkedAt: serverTimestamp() }, { merge:true }); } catch(e){ console.warn('users mapping write failed', e); }
      } else {
        // For visitors (not signed-in) we store visitorStudentId so index->leaderboard flows work
        // store verified info in sessionStorage so logout clears it
        sessionStorage.setItem('visitorStudentId', sid);
      }

      // set verification in sessionStorage (used by the page to enable buttons)

      // after successful verification...
// set verification using localStorage helpers
setVerifiedRole('student');
setVerifiedStudentId(sid);
const name = sData.name || sData.studentName || sData.fullName || '';

if(name){
  setVerifiedStudentName(name);
  studentTag.textContent = `— ${name}`;
}
currentStudentId = sid; currentStudentName = name; currentRole = 'student';


      closeModal();
      applyVerifiedUIState();
      toast('Verified as student');

      // reload leaderboard (so appended "your rank" can appear)
      await loadCompetitionScores();
    } catch(err){
      console.error('verify failed', err);
      alert('Verification failed. Check console.');
    }
  };
}
// showAdminVerifyModal (robust: tries popup but falls back to login.html)
function showAdminVerifyModal(){
  // If no user, offer Google sign-in then verify; if user present, verify directly
  if(!currentUser){
    showModalInner(`<div>
      <div class="small-muted">You must sign in to verify as admin. Use Google sign-in to continue, or sign in on the login page.</div>
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
        <button id="verifyAdminCancel" class="btn">Cancel</button>
        <button id="verifyAdminSignIn" class="btn btn-primary">Sign in with Google</button>
        <button id="verifyAdminViaLogin" class="btn">Open login page</button>
      </div>
    </div>`, { title: 'Verify as admin' });

    document.getElementById('verifyAdminCancel').onclick = () => { closeModal(); applyVerifiedUIState(); };
    document.getElementById('verifyAdminViaLogin').onclick = () => {
      // redirect to login page; include next param so login can forward back if you want
      window.location.href = 'login.html?next=leaderboard.html';
    };

    document.getElementById('verifyAdminSignIn').onclick = async () => {
      try {
        const provider = new GoogleAuthProvider();
        const cred = await signInWithPopup(auth, provider);
        currentUser = cred.user || auth.currentUser;
        // Now check admin collection
        const snaps = await getDocs(query(collection(db,'admin'), where('uid','==', currentUser.uid)));
        if(snaps.size === 0){
          // fallback: allow trying login page
          closeModal();
          const tryLogin = confirm('No admin record found for this account. Try signing in with a different admin account on the login page?');
          if(tryLogin) window.location.href = 'login.html?next=leaderboard.html';
          else applyVerifiedUIState();
          return;
        }
        // mark verified
        setVerifiedRole('admin');
        setVerifiedStudentId(null);
        currentRole = 'admin';
        try { await setDoc(doc(db,'users', currentUser.uid), { role:'admin', adminUid: currentUser.uid, linkedAt: serverTimestamp() }, { merge:true }); } catch(e){}
        applyVerifiedUIState();
        toast('Verified as admin');
        closeModal();
      } catch(e){
        console.warn('Google sign-in failed (popup may be blocked / unauthorized):', e);
        // Common case: iframe/OAuth domain not authorized. Redirect to login page as fallback.
        const goLogin = confirm('Popup sign-in failed (maybe OAuth not authorized). Open login page instead?');
        if(goLogin) window.location.href = 'login.html?next=leaderboard.html';
        else closeModal();
      }
    };
    return;
  }

  // User exists -> verify against admin collection
  showModalInner(`<div>
    <div class="small-muted">To verify as admin we will check your account against the admin list. Click Verify to continue.</div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="verifyAdminCancel" class="btn">Cancel</button>
      <button id="verifyAdminDo" class="btn btn-primary">Verify</button>
    </div>
  </div>`, { title: 'Verify as admin' });

  document.getElementById('verifyAdminCancel').onclick = () => { closeModal(); applyVerifiedUIState(); };
  document.getElementById('verifyAdminDo').onclick = async () => {
    try {
      const snaps = await getDocs(query(collection(db,'admin'), where('uid','==', currentUser.uid)));
      if(snaps.size === 0){
        const trySign = confirm('No admin record found for this account. Would you like to sign in with a different account now?');
        if(!trySign) { alert('No admin record found. Contact the system administrator.'); return; }
        // attempt popup sign-in as alternative; if popup blocked we will fall back and let user go to login
        try {
          const provider = new GoogleAuthProvider();
          const cred = await signInWithPopup(auth, provider);
          currentUser = cred.user || auth.currentUser;
          const snaps2 = await getDocs(query(collection(db,'admin'), where('uid','==', currentUser.uid)));
          if(snaps2.size === 0){ alert('Still no admin record for that account. Contact the system administrator.'); return; }
          // OK admin found
        } catch(e){
          console.warn('Popup sign-in failed', e);
          if(confirm('Popup sign-in failed (maybe OAuth not authorized). Open login.html to sign in with email/password?')) {
            closeModal();
            return window.location.href = 'login.html?next=leaderboard.html';
          }
          return;
        }
      }

      // Persist mapping and mark verified
      const uidToUse = currentUser && currentUser.uid ? currentUser.uid : (auth && auth.currentUser && auth.currentUser.uid) || null;
      if(uidToUse){
        try { await setDoc(doc(db,'users', uidToUse), { role:'admin', adminUid: uidToUse, linkedAt: serverTimestamp() }, { merge:true }); } catch(e){}
        setVerifiedRole('admin');
        setVerifiedStudentId(null);
        currentRole = 'admin';
        closeModal();
        applyVerifiedUIState();
        toast('Verified as admin');
      } else {
        alert('Unable to determine signed-in user. Please try signing in.');
      }
    } catch(e){ console.error(e); alert('Admin verify failed'); }
  };
}
/* wire verifyBtn */
verifyBtn.onclick = () => {
  // if user is recognized admin -> show admin verify modal; otherwise student
  const ref = (document.referrer || '').toLowerCase();
  if(ref.includes('admin.html') || currentRole === 'admin') showAdminVerifyModal();
  else showStudentVerifyModal();
};
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

/* ---------------- disable old toggle handler (we show full names) ---------------- */
(function attachToggleHandler() { return; })();

/* ---------- ensureShortNames (no-op, full names shown) ---------- */
function ensureShortNames(){ /* intentionally blank */ }



/* ---------- appendOrShowMyRow (verif student row) ---------- */
function appendOrShowMyRow(me, isPlaceholder){
  const tr = document.createElement('tr'); tr.className = 'me-row';
  const rankCell = `<div class="rank-badge">${escapeHtml(String(me.rank || '—'))}</div>`;
  const idMasked = maskId(me.studentId || '');
  const points = escapeHtml(String(me.points || 0));
  const nameHtml = `<div class="student-full">${escapeHtml(me.studentName || '—')}</div>`;
  const classHtml = `<div class="class-full">${escapeHtml(me.className || '—')}</div>`;

  // Desktop actions go into action-cell only. Points-cell only shows points + mobile-only more button.
  let actionHtml = `<div class="actions-wrap">`;
  actionHtml += `<button class="btn" data-view="${escapeHtml(me.id||'__me')}">View</button>`;
  if(getVerifiedRole() === 'student' && getVerifiedStudentId() === me.studentId){
    actionHtml += ` <button class="btn" data-clear="${escapeHtml(me.id||'__me')}">Clear my points</button>`;
  }
  if(isAdmin()){
    actionHtml += ` <button class="btn" data-history="${escapeHtml(me.studentId)}">History</button>`;
    actionHtml += ` <button class="icon-btn settingsBtn" data-student="${escapeHtml(me.studentId)}" data-scoredoc="${escapeHtml(me.id||'__me')}">⚙</button>`;
  }
  actionHtml += `</div>`;

  const mobileMoreBtn = `<button class="more-btn mobile-only" data-student="${escapeHtml(me.studentId)}" data-scoredoc="${escapeHtml(me.id||'__me')}">⋯</button>`;

  tr.innerHTML = `
    <td>${rankCell}</td>
    <td class="name-cell">${nameHtml}<div class="mobile-id">${escapeHtml(idMasked)}</div></td>
    <td class="class-cell">${classHtml}</td>
    <td class="id-mask desktop-only">${escapeHtml(idMasked)}</td>
    <td class="points-cell"><div class="points-value">${points}</div><div class="points-actions">${mobileMoreBtn}</div></td>
    <td class="action-cell desktop-only">${actionHtml}</td>
  `;

  leaderTbody.appendChild(tr);
  // no individual binding here — event delegation handles clicks
}

/* ---------- showStudentViewModal (re-used) ---------- */
function showStudentViewModal(item){
  const canAdmin = isAdmin();
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
  const histBtn = document.getElementById('modalHistoryBtn');
  if(histBtn) histBtn.onclick = async () => { closeModal(); await openHistoryModal(item.studentId); };
  const adminBtn = document.getElementById('modalAdminSettingsBtn');
  if(adminBtn) adminBtn.onclick = () => { if(!isAdmin()){ toast('Only admin'); return; } closeModal(); openStudentSettingsModal(item.studentId, item.id); };
  const closeLocal = document.getElementById('modalCloseLocal');
  if(closeLocal) closeLocal.onclick = () => closeModal();
}

/* ---------- openMoreModalForStudent (vertical options list) ---------- */
function openMoreModalForStudent(studentId, scoreDocId){
  const me = (getVerifiedRole() === 'student' && getVerifiedStudentId() === studentId);
  const admin = isAdmin();

  const viewBtn = `<button id="mm_view" class="btn">View</button>`;
  const clearBtn = `<button id="mm_clear" class="btn">Clear my points</button>`;
  const historyBtn = `<button id="mm_history" class="btn">View history</button>`;
  const settingsBtn = `<button id="mm_settings" class="btn">Settings</button>`;

  let html = `<div style="display:flex;flex-direction:column;gap:10px;padding:6px">`;
  const isMe = getVerifiedRole() === 'student' && getVerifiedStudentId() === studentId;
  const displayId = isMe ? studentId : maskId(studentId);
  
  html += `<div style="font-weight:800;margin-bottom:6px">
    Student ID: ${escapeHtml(displayId || '—')}
  </div>`;
    html += viewBtn;
  if(admin) html += historyBtn + settingsBtn;
  else if(me) html += clearBtn;
  html += `<div style="text-align:right;margin-top:6px"><button id="mm_close" class="btn">Close</button></div>`;
  html += `</div>`;

  showModalInner(html, { title: 'Options' });

  document.getElementById('mm_close').onclick = () => closeModal();

  const viewEl = document.getElementById('mm_view');
  if(viewEl) viewEl.onclick = async () => {
    closeModal();
    const item = (scoresCache || []).find(s => s.studentId === studentId || s.id === scoreDocId) || { studentId, id: scoreDocId, studentName: getVerifiedStudentName() };
    showStudentViewModal(item);
  };

  const clearEl = document.getElementById('mm_clear');
  if(clearEl) clearEl.onclick = async () => {
    if(!confirm('Clear your points for this competition? This action cannot be undone.')) return;
    try {
      const docId = `${currentCompetition.id}_${getVerifiedStudentId()}`;
      await setDoc(doc(db,'competitionScores', docId), { competitionId: currentCompetition.id, studentId: getVerifiedStudentId(), points: 0, updatedAt: serverTimestamp() }, { merge:true });
      toast('Your points cleared.');
      closeModal();
      if(typeof loadCompetitionScores === 'function') await loadCompetitionScores();
    } catch(err){ console.error(err); toast('Failed to clear points'); }
  };

  const histEl = document.getElementById('mm_history');
  if(histEl) histEl.onclick = async () => { closeModal(); await openHistoryModal(studentId); };
  const setEl = document.getElementById('mm_settings');
  if(setEl) setEl.onclick = () => { closeModal(); openStudentSettingsModal(studentId, scoreDocId); };
}

/* ---------- renderLeaderboard (fixed: no actionHtml inside points column) ---------- */
async function renderLeaderboard(){
  leaderTbody.innerHTML = '';
  if(!scoresCache || scoresCache.length === 0){
    leaderTbody.innerHTML = `<tr><td colspan="6" class="small-muted">No scores yet. Be the first —</td></tr>`;
    return;
  }

  const { ranked, topRanks } = buildRankedList(scoresCache);
  const admin = isAdmin();
  const primaryRows = admin ? (adminShowAll ? ranked : topRanks) : topRanks;

  for(const r of primaryRows){
    const tr = document.createElement('tr');

    const rankCell = `<div class="rank-badge" style="background:${r.rank===1? '#FFD700': r.rank===2? '#C0C0C0' : r.rank===3? '#CD7F32': '#eef6ff'}">${r.rank}</div>`;
    const nameHtml = `<div class="student-full">${escapeHtml(r.studentName || '—')}</div>`;
    const classHtml = `<div class="class-full">${escapeHtml(r.className || '—')}</div>`;
    const idMasked = maskId(r.studentId || r.id || '');
    const points = escapeHtml(String(r.points || 0));

    // Desktop action column only
    let actionHtml = `<div class="actions-wrap">`;
    actionHtml += `<button class="btn" data-view="${escapeHtml(r.id)}">View</button>`;
    if(admin){
      actionHtml += ` <button class="btn" data-history="${escapeHtml(r.studentId)}">History</button>`;
      actionHtml += ` <button class="icon-btn settingsBtn" data-student="${escapeHtml(r.studentId)}" data-scoredoc="${escapeHtml(r.id)}">⚙</button>`;
    } else {
      if(getVerifiedRole() === 'student' && getVerifiedStudentId() === r.studentId){
        actionHtml += ` <button class="btn" data-clear="${escapeHtml(r.id)}">Clear my points</button>`;
      }
    }
    actionHtml += `</div>`;

    // Mobile-only more button in points column
    const mobileMoreBtn = `<button class="more-btn mobile-only" data-student="${escapeHtml(r.studentId)}" data-scoredoc="${escapeHtml(r.id)}">⋯</button>`;

    tr.innerHTML = `
      <td>${rankCell}</td>
      <td class="name-cell">${nameHtml}<div class="mobile-id">${escapeHtml(idMasked)}</div></td>
      <td class="class-cell">${classHtml}</td>
      <td class="id-mask desktop-only">${escapeHtml(idMasked)}</td>
      <td class="points-cell"><div class="points-value">${points}</div><div class="points-actions">${mobileMoreBtn}</div></td>
      <td class="action-cell desktop-only">${actionHtml}</td>
    `;
    leaderTbody.appendChild(tr);
  }

  // After DOM updated: no per-button listeners — event delegation will catch clicks.
}

/* ---------- event delegation on the table body (reliable) ---------- */
leaderTbody.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button');
  if(!btn) return;

  // more button (mobile)
  if(btn.classList.contains('more-btn')){
    const sid = btn.dataset.student;
    const scid = btn.dataset.scoredoc;
    openMoreModalForStudent(sid, scid);
    return;
  }

  // view button (data-view)
  if(btn.hasAttribute('data-view')){
    const id = btn.getAttribute('data-view');
    const item = (scoresCache || []).find(s => s.id === id);
    if(!item) return toast('Not found');
    showStudentViewModal(item);
    return;
  }

  // clear points (data-clear)
  if(btn.hasAttribute('data-clear')){
    if(!confirm('Clear your points for this competition? This action cannot be undone.')) return;
    try {
      const docId = `${currentCompetition.id}_${getVerifiedStudentId()}`;
      await setDoc(doc(db,'competitionScores', docId), { competitionId: currentCompetition.id, studentId: getVerifiedStudentId(), points: 0, updatedAt: serverTimestamp() }, { merge:true });
      toast('Your points cleared.');
      if(typeof loadCompetitionScores === 'function') await loadCompetitionScores();
    } catch(err){ console.error(err); toast('Failed to clear points'); }
    return;
  }

  // history (data-history)
  if(btn.hasAttribute('data-history')){
    const sid = btn.getAttribute('data-history');
    closeModal();
    if(typeof openHistoryModal === 'function') await openHistoryModal(sid);
    return;
  }

  // settings gear (settingsBtn)
  if(btn.classList.contains('settingsBtn') || btn.classList.contains('icon-btn')){
    const stu = btn.dataset.student;
    const sd = btn.dataset.scoredoc;
    if(!isAdmin() && !(getVerifiedRole() === 'student' && getVerifiedStudentId() === stu)){ toast('Only admin or the student may access settings'); return; }
    if(typeof openStudentSettingsModal === 'function') openStudentSettingsModal(stu, sd);
    return;
  }
});







ensureShortNames() 


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
  html.push(`<div class="test-footer" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
  <div style="display:flex;gap:8px;align-items:center">
    <button id="toggleModalBgBtn" class="btn">BG: OFF</button>
    <button id="toggleModalFxBtn" class="btn">FX: ON</button>
  </div>
  <div style="display:flex;flex-direction:column;align-items:flex-end">
    <div class="stats-line"><span id="qProgress"></span> <span id="streakInfo"></span></div>
    <div style="margin-top:6px"><button id="testPrev" class="btn">← Prev</button> <button id="testNext" class="btn">Next →</button> <button id="testFinish" class="btn btn-primary">Finish</button> <button id="testCancel" class="btn">Cancel</button></div>
  </div>
</div>
`);

  // Insert modal first (DOM elements will exist after this)
  showModalInner(html.join(''), { title: 'Test' });

    // ----------------------------
  // SOUND TOGGLE BUTTONS (modal-level)
  // ----------------------------
  (function wireModalSoundToggles(){
    // The SoundManager must be imported/available in this file scope.
    const bgBtn = document.getElementById('toggleModalBgBtn');
    const fxBtn = document.getElementById('toggleModalFxBtn');
    if(!bgBtn || !fxBtn) return;

    // initialize labels from current manager state
    bgBtn.textContent = `BG: ${SoundManager.bgEnabled ? 'ON' : 'OFF'}`;
    fxBtn.textContent = `FX: ${SoundManager.effectsEnabled ? 'ON' : 'OFF'}`;

    bgBtn.onclick = () => {
      const newOn = !SoundManager.bgEnabled;
      SoundManager.setBgEnabled(newOn);
      bgBtn.textContent = `BG: ${newOn ? 'ON' : 'OFF'}`;
    };

    fxBtn.onclick = () => {
      const newOn = !SoundManager.effectsEnabled;
      SoundManager.setEffectsEnabled(newOn);
      fxBtn.textContent = `FX: ${newOn ? 'ON' : 'OFF'}`;
    };

    // if bg is enabled we start it (safe; may be blocked until user interacts)
    if(SoundManager.bgEnabled) SoundManager.setBgEnabled(true);
  })();


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

/* ---------- admin adjust points modal (existing logic) ---------- */
async function openAdjustPointsModal(scoreDocId, studentId){
  if(getVerifiedRole() !== 'admin'){ toast('Only admin can adjust points'); return; }
  // ... existing content follows

  showModalInner(`<div><h3>Adjust points</h3>
    <div style="margin-top:6px">Student ID: <strong>${escapeHtml(studentId)}</strong></div>
    <div style="margin-top:12px"><input id="pointsDelta" class="input-small" placeholder="+5 or -3" /></div>
    <div style="margin-top:12px"><textarea id="pointsReason" rows="3" style="width:100%;border:1px solid #e6eefc;padding:8px" placeholder="Reason (optional)"></textarea></div>
    <div style="text-align:right;margin-top:8px"><button id="applyPointsBtn" class="btn btn-primary">Apply</button></div></div>`, { title: 'Adjust Points' });
  document.getElementById('applyPointsBtn').onclick = async () => {
    const deltaRaw = document.getElementById('pointsDelta').value.trim();
    const reason = document.getElementById('pointsReason').value.trim();
    const delta = Number(deltaRaw);
    if(!deltaRaw || isNaN(delta)){ alert('Enter numeric delta (positive or negative)'); return; }
    try {
      await runTransaction(db, async (t) => {
        const ref = doc(db,'competitionScores', scoreDocId);
        const snap = await t.get(ref);
        let currentPoints = 0;
        if(snap.exists()) currentPoints = snap.data().points || 0;
        const newPoints = Math.max(0, currentPoints + delta);
        t.set(ref, { competitionId: currentCompetition.id, studentId, points: newPoints, updatedAt: serverTimestamp() }, { merge:true });
        const logRef = doc(collection(db,'pointsHistory'));
        const adminUid = (currentUser && currentUser.uid) || (auth && auth.currentUser && auth.currentUser.uid) || 'unknown';
        t.set(logRef, { competitionId: currentCompetition.id, studentId, delta, reason, adminUid, createdAt: serverTimestamp() });

      });
      toast('Points updated');
      closeModal();
      await loadCompetitionScores();
    } catch(err){ console.error(err); toast('Update failed'); }
  };
}
/* ---------- keyboard/back button ---------- */
backBtn.onclick = () => {
  if(currentRole === 'admin') window.location.href = 'admin.html';
  else window.location.href = 'index.html';
};
/* ---------- small: get highest streak holder (used in test modal) ---------- */
async function getHighestStreakHolder(){
  try {
    const snap = await getDocs(query(collection(db,'testResults'), orderBy('runHighest','desc'), limit(1)));
    if(snap.size === 0) return null;
    const d = snap.docs[0].data();
    return { studentId: d.studentId, studentUid: d.studentUid, runHighest: d.runHighest, studentName: d.studentName || d.student || '' };
  } catch(e){ console.warn('getHighestStreakHolder failed', e); return null; }
}
/* ---------- export minor helpers if you reuse in other files ---------- */
export { renderCompetitionHeader, loadCompetitionScores, loadCompetitionAndScores, getHighestStreakHolder };
