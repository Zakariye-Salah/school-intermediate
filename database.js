
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, sendPasswordResetEmail } 
from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';

// add orderBy and limit to your firebase/firestore imports
import { 
  collection, doc, getDocs, getDoc, query, where, orderBy, limit, addDoc, updateDoc, deleteDoc, startAfter, setDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

  // add to your firestore imports
import { getCountFromServer } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

// or your project's firebase import style — just ensure orderBy & limit are present


/* UI refs (same as before + teachers) */
const tabStudents = document.getElementById('tabStudents');
const tabClasses = document.getElementById('tabClasses');
const tabSubjects = document.getElementById('tabSubjects');
const tabExams = document.getElementById('tabExams');
const tabTeachers = document.getElementById('tabTeachers'); // NEW: should exist in HTML


const openAddClass =document.getElementById('openAddClassDesktop');


// const openAddClass = document.getElementById('openAddClass');
const classesList = document.getElementById('classesList');
const classSearch = document.getElementById('classSearch');

const pageStudents = document.getElementById('pageStudents');
const pageClasses = document.getElementById('pageClasses');
const pageSubjects = document.getElementById('pageSubjects');
const pageExams = document.getElementById('pageExams');
const pageTeachers = document.getElementById('pageTeachers'); // NEW page for teachers

const btnLogout = document.getElementById('btnLogout');

const studentsSearch = document.getElementById('studentsSearch');
const studentsClassFilter = document.getElementById('studentsClassFilter');
const studentsList = document.getElementById('studentsList');
const openAddStudent = document.getElementById('openAddStudent');
const studentsExamForTotals = document.getElementById('studentsExamForTotals');



const openAddSubject = document.getElementById('openAddSubject');
const subjectsList = document.getElementById('subjectsList');
const subjectSearch = document.getElementById('subjectSearch');

const openAddExam = document.getElementById('openAddExam');
const examsList = document.getElementById('examsList');
const examSearch = document.getElementById('examSearch');
const examClassFilter = document.getElementById('examClassFilter');


const gotoLeaderboardBtn = document.getElementById('gotoLeaderboardBtn');
if(gotoLeaderboardBtn) gotoLeaderboardBtn.onclick = () => { window.location.href = 'leaderboard.html'; };

// exam sort controls (created programmatically if not present)
let examSortMode = 'date'; // default: date

// Teachers UI
const teachersSearch = document.getElementById('teachersSearch'); // optional in HTML
const teachersSubjectFilter = document.getElementById('teachersSubjectFilter');
const teachersList = document.getElementById('teachersList');
const openAddTeacher = document.getElementById('openAddTeacher');

// ---------- ADMIN QUIZZES: UI refs & wiring ----------
const tabQuizzes = document.getElementById('tabQuizzes');
const pageQuizzes = document.getElementById('pageQuizzes');
const adminQuizzesList = document.getElementById('adminQuizzesList');
const adminQuizFilterClass = document.getElementById('adminQuizFilterClass');
const adminQuizFilterSubject = document.getElementById('adminQuizFilterSubject');
const adminQuizSearch = document.getElementById('adminQuizSearch');
const btnNewQuizAdmin = document.getElementById('btnNewQuizAdmin');

// Tab wiring: show page + call render function
if (tabQuizzes) tabQuizzes.onclick = async () => {
  showPage('quizzes');
  try { await renderAdminQuizzesPage(); } catch(e){ console.error('renderAdminQuizzesPage failed', e); }
};


const modalBackdrop = document.getElementById('modalBackdrop');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalClose = document.getElementById('modalClose');
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





let currentUser = null;
let studentsCache = [];
let classesCache = [];
let subjectsCache = [];
let examsCache = [];
let teachersCache = []; // NEW
let examTotalsCache = {}; // examId -> { studentId: payload }


/* ---------------------------
   New UI refs: dashboard/payments/attendance/users
   --------------------------- */
   const tabDashboard = document.getElementById('tabDashboard');
   const tabPayments = document.getElementById('tabPayments');
   const tabAttendance = document.getElementById('tabAttendance');
   const tabUsers = document.getElementById('tabUsers');
   
   const pageDashboard = document.getElementById('pageDashboard');
   const pagePayments = document.getElementById('pagePayments');
   const pageAttendance = document.getElementById('pageAttendance');
   const pageUsers = document.getElementById('pageUsers');

   
   // Tab wiring: show page + call render function if available
if(tabDashboard) tabDashboard.onclick = async () => { showPage('dashboard'); if(typeof renderDashboard === 'function') try{ await renderDashboard(); }catch(e){ console.error('renderDashboard failed', e); } };
if(tabPayments) tabPayments.onclick = async () => { showPage('payments'); if(typeof renderPayments === 'function') try{ await renderPayments(); }catch(e){ console.error('renderPayments failed', e); } };
if(tabAttendance) tabAttendance.onclick = async () => { showPage('attendance'); if(typeof renderAttendance === 'function') try{ await renderAttendance(); }catch(e){ console.error('renderAttendance failed', e); } };
if(tabUsers) tabUsers.onclick = async () => { showPage('users'); if(typeof renderUsers === 'function') try{ await renderUsers(); }catch(e){ console.error('renderUsers failed', e); } };

/* UI helpers */


const recycleTypeFilter = document.getElementById('recycleTypeFilter');
const recycleSearch = document.getElementById('recycleSearch');
const recycleDateFrom = document.getElementById('recycleDateFrom');
const recycleDateTo = document.getElementById('recycleDateTo');
const recycleApplyFilters = document.getElementById('recycleApplyFilters');
const recycleRestoreAll = document.getElementById('recycleRestoreAll');
const recycleDeleteAll = document.getElementById('recycleDeleteAll');
const recycleCounts = document.getElementById('recycleCounts');

const recycleTbody = document.getElementById('recycleTbody');
const recycleCardList = document.getElementById('recycleCardList');
const tabRecycle = document.getElementById('tabRecycle');
const pageRecycle = document.getElementById('pageRecycle');

// wire tab button (if exists)
if(tabRecycle){
  tabRecycle.onclick = () => { showPage('recycle'); renderRecycleBin().catch(console.error); };
}

if(recycleApplyFilters) recycleApplyFilters.onclick = () => renderRecycleBin().catch(console.error);
if(recycleRestoreAll) recycleRestoreAll.onclick = () => bulkRestore().catch(console.error);
if(recycleDeleteAll) recycleDeleteAll.onclick = () => bulkDeleteAll().catch(console.error);


function showPage(id) {
  // Remove active from all tabs
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

  // Hide all pages (any element that uses the .page class)
  document.querySelectorAll('.page').forEach(p => {
    p.style.display = 'none';
  });

  // Helper to find and show the first existing candidate id
  function showFirstExisting(candidates) {
    for (const cid of candidates) {
      const el = document.getElementById(cid);
      if (el) {
        el.style.display = 'block';
        return true;
      }
    }
    return false;
  }

  // Map logical page id -> DOM id candidates (tries in order)
  const pageMap = {
    dashboard: ['pageDashboard', 'dashboardCard', 'pageDashboardCard'],
    payments: ['pagePayments'],
    attendance: ['pageAttendance'],
    users: ['pageUsers'],
    students: ['pageStudents'],
    classes: ['pageClasses'],
    subjects: ['pageSubjects'],
    exams: ['pageExams'],
    teachers: ['pageTeachers'],
    announcements: ['pageAnnouncements'],
    recycleBin: ['pageRecycle'], 

    // add other pages here if needed
  };

  // Show the desired page (try mapped ids, then fallback to page-{id})
  const candidates = pageMap[id] || [`page${id[0].toUpperCase()}${id.slice(1)}`, `page-${id}`];
  const shown = showFirstExisting(candidates);

  // Activate matching tab button if present (tabId = 'tab' + Capitalized(id))
  const tabId = 'tab' + (id[0] ? id[0].toUpperCase() + id.slice(1) : id);
  const tabEl = document.getElementById(tabId);
  if (tabEl) tabEl.classList.add('active');

  // If nothing was shown, optionally show first pageStudents as safe default
  if (!shown) {
    const fallback = document.getElementById('pageStudents') || document.getElementById('dashboardCard');
    if (fallback) fallback.style.display = 'block';
    // Also try to set Students tab active
    const t = document.getElementById('tabStudents');
    if (t) t.classList.add('active');
  }
}


function showModal(title, html, fullscreen = false){
  modalTitle.textContent = title;
  modalBody.innerHTML = html;

  modal.classList.toggle('fullscreen', fullscreen);

  modalBackdrop.style.display = 'flex';
  modalBackdrop.offsetHeight;
  modalBackdrop.classList.add('show');
}

// Replace your existing closeModal() with this robust version
function closeModal(){
  // hide visual modal immediately (start CSS hide animation)
  modalBackdrop.classList.remove('show');

  // determine modalRoot now (before we clear modalBody)
  const modalRoot = (modalBody && modalBody.closest && modalBody.closest('.modal-root')) || modalBody || document.body.lastElementChild;

  // Ask our backdrop manager to release watchers for this modalRoot (safe if manager not defined)
  try { releaseModalBackdrop(modalRoot); } catch (e) { /* ignore if not present */ }

  // After the same timeout used for hiding animation, clear modal DOM
  setTimeout(()=>{
    try { modalBackdrop.style.display = 'none'; } catch(e) {}
    try { modalBody.innerHTML = ''; } catch(e) {}
    try { modal.classList.remove('fullscreen'); } catch(e) {}

    // final cleanup: ensure the manager removes any orphaned backdrops/watchers
    try {
      if(window.__modalBackdropManager && typeof window.__modalBackdropManager.cleanupOrphans === 'function'){
        window.__modalBackdropManager.cleanupOrphans();
      }
    } catch (e) { /* ignore */ }
  }, 200);
}


modalClose.onclick = closeModal;
modalBackdrop.onclick = (e) => { if(e.target === modalBackdrop) closeModal(); };


document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape' && modalBackdrop.classList.contains('show')){
    closeModal();
  }
});


/**
 * toast(message, type, duration)
 * type: success | error | warning | info
 */

/** helper: pad number */
function pad(n, width){ n = String(n||''); return n.length >= width ? n : '0'.repeat(width - n.length) + n; }
/* id generator */
async function generateDefaultId(collectionName, prefix, digits){
  const t = Date.now() % (10**(digits));
  return `${prefix}${String(t).padStart(digits,'0')}`;
}

function escapeHtml(s){ if(!s && s!==0) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// returns true if another teacher uses this email (case-insensitive). excludeId optional to ignore same teacher on edit.
function isTeacherEmailDuplicate(email, excludeId) {
  if (!email) return false;
  const e = String(email).trim().toLowerCase();
  const list = teachersCache || [];
  return list.some(t => {
    if (!t.email) return false;
    if (excludeId && (t.id === excludeId || t.teacherId === excludeId)) return false;
    return String(t.email).trim().toLowerCase() === e;
  });
}

/* init/auth */
let appLoaded = false;
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'login.html'; return; }
  currentUser = user;
  if (!appLoaded) {
    await loadAll();    // now paginated & cached
    appLoaded = true;
  } else {
    // small refresh for meta or quick UI updates (cheap)
    await Promise.all([loadMetaStats().catch(()=>{}), loadMetaLookups().catch(()=>{})]);
  }
  try { await ensureMonthlyAnnouncementIfNeeded(); } catch(e){ console.warn(e); }
});

btnLogout.onclick = async ()=>{ await signOut(auth); window.location.href='login.html'; };

/* data loading */

// ------------------ Persistence (optional but recommended) ------------------
(async function enablePersistenceSafely(){
  try {
    // enable local cache (reduces network reads when data is in cache)
    await enableIndexedDbPersistence(db);
    console.info('Firestore persistence enabled');
  } catch (err) {
    console.warn('IndexedDB persistence unavailable:', err && err.message ? err.message : err);
  }
})();

// ------------------ Generic paginator factory ------------------
function createPaginator({ collectionName, orderByField = '__name__', orderDir = 'asc', pageSize = 60 }) {
  let cache = [];
  let lastDoc = null;
  let lastFetched = 0;

  const STALE_MS = 1000 * 60 * 5; // 5 minutes cache

  async function refresh({ force = false } = {}) {
    if (!force && cache.length && (Date.now() - lastFetched) < STALE_MS) {
      return cache;
    }
    cache = [];
    lastDoc = null;
    const first = await loadNext({ reset: true });
    lastFetched = Date.now();
    return cache;
  }

  async function loadNext({ reset = false } = {}) {
    try {
      const col = collection(db, collectionName);
      let q;
      if (reset || !lastDoc) {
        q = query(col, orderBy(orderByField, orderDir), limit(pageSize));
      } else {
        q = query(col, orderBy(orderByField, orderDir), startAfter(lastDoc), limit(pageSize));
      }
      const snap = await getDocs(q);
      if (snap.empty) return [];
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      cache = reset ? arr : cache.concat(arr);
      lastDoc = snap.docs[snap.docs.length - 1];
      return arr;
    } catch (e) {
      console.warn(`Paginator loadNext ${collectionName} failed`, e);
      return [];
    }
  }

  function getCache() { return cache; }
  function clearCache() { cache = []; lastDoc = null; lastFetched = 0; }

  return { refresh, loadNext, getCache, clearCache };
}

// ------------------ Create paginators for your collections ------------------
// Adjust pageSize per collection (larger for small collections like classes/subjects)
const studentsPager = createPaginator({ collectionName: 'students', orderByField: 'name', pageSize: 80 });
const classesPager  = createPaginator({ collectionName: 'classes',  orderByField: 'name', pageSize: 200 });
const subjectsPager = createPaginator({ collectionName: 'subjects', orderByField: 'name', pageSize: 200 });
const examsPager    = createPaginator({ collectionName: 'exams',    orderByField: 'date', orderDir: 'desc', pageSize: 50 });
const teachersPager = createPaginator({ collectionName: 'teachers', orderByField: 'name', pageSize: 80 });

// ------------------ Meta docs (small single-doc reads) ------------------
let metaStats = {};
let metaLookups = {};

async function loadMetaStats() {
  try {
    const snap = await getDoc(doc(db, 'meta', 'stats'));
    if (snap.exists()) metaStats = snap.data();
  } catch (e) { console.warn('loadMetaStats failed', e); }
}

async function loadMetaLookups() {
  try {
    const snap = await getDoc(doc(db, 'meta', 'lookups'));
    if (snap.exists()) {
      metaLookups = snap.data();
      // optionally copy to caches if present
      if (metaLookups.classes) classesCache = metaLookups.classes.slice();
      if (metaLookups.subjects) subjectsCache = metaLookups.subjects.slice();
    }
  } catch (e) { console.warn('loadMetaLookups failed', e); }
}

// ------------------ Backwards-compatible load* functions (replace originals) ------------------
async function loadAll({ force = false } = {}) {
  // load small meta docs first (cheap)
  await Promise.all([loadMetaStats(), loadMetaLookups()]);

  // Fetch first pages in parallel (limited reads)
  const results = await Promise.allSettled([
    classesPager.refresh({ force }),
    subjectsPager.refresh({ force }),
    studentsPager.refresh({ force }),
    examsPager.refresh({ force }),
    teachersPager.refresh({ force })
  ]);

  // copy caches into your existing variables so rest of app works unchanged
  try { classesCache = classesPager.getCache(); } catch(_) { classesCache = []; }
  try { subjectsCache = subjectsPager.getCache(); } catch(_) { subjectsCache = []; }
  try { studentsCache = studentsPager.getCache(); } catch(_) { studentsCache = []; }
  try { examsCache = examsPager.getCache(); } catch(_) { examsCache = []; }
  try { teachersCache = teachersPager.getCache(); } catch(_) { teachersCache = []; }

  // Populate filters and renderers (same calls you had)
  populateClassFilters();
  populateStudentsExamDropdown();
  populateTeachersSubjectFilter();

  try {
    if (typeof renderStudents === 'function') renderStudents();
    if (typeof renderClasses === 'function') renderClasses();
    if (typeof renderSubjects === 'function') renderSubjects();
    if (typeof renderExams === 'function') renderExams();
    if (typeof renderTeachers === 'function') renderTeachers();
  } catch (err) {
    console.warn('one or more render*() calls failed during loadAll()', err);
  }

  // render dashboard if present
  try {
    if (typeof renderDashboard === 'function') await renderDashboard({ defaultFilter: 'This Month' });
  } catch (err) {
    console.error('renderDashboard failed in loadAll()', err);
  }

  try { showPage('dashboard'); } catch (e) { console.warn('showPage failed', e); }
}

// Keep small wrappers for compatibility (if other code calls these specific functions)
async function loadClasses()  { classesCache = classesPager.getCache().length ? classesPager.getCache() : await classesPager.refresh(); }
async function loadSubjects() { subjectsCache = subjectsPager.getCache().length ? subjectsPager.getCache() : await subjectsPager.refresh(); }
async function loadStudents() { studentsCache = studentsPager.getCache().length ? studentsPager.getCache() : await studentsPager.refresh(); }
async function loadExams()    { examsCache = examsPager.getCache().length ? examsPager.getCache() : await examsPager.refresh(); }
async function loadTeachers() { teachersCache = teachersPager.getCache().length ? teachersPager.getCache() : await teachersPager.refresh(); }

// Functions you can call to load NEXT page (use for "load more" or infinite scroll)
async function loadMoreStudents() { const page = await studentsPager.loadNext(); studentsCache = studentsPager.getCache(); return page; }
async function loadMoreExams()    { const page = await examsPager.loadNext(); examsCache = examsPager.getCache(); return page; }
async function loadMoreTeachers() { const page = await teachersPager.loadNext(); teachersCache = teachersPager.getCache(); return page; }
async function loadMoreClasses()  { const page = await classesPager.loadNext(); classesCache = classesPager.getCache(); return page; }

// helper to clear caches (for admin forced refresh)
function clearAllCaches() {
  studentsPager.clearCache(); classesPager.clearCache(); subjectsPager.clearCache(); examsPager.clearCache(); teachersPager.clearCache();
  studentsCache = classesCache = subjectsCache = examsCache = teachersCache = [];
  metaStats = metaLookups = {};
}

// when user scrolls to bottom or presses "Load more"
loadMoreStudents().then(newPage => {
  if(!newPage || newPage.length === 0) {
    // no more
  } else {
    renderStudents(); // your renderer should read studentsCache
  }
});



function isMobileViewport(){ return window.matchMedia && window.matchMedia('(max-width:768px)').matches; }
/* populate helpers */
function populateClassFilters(){
  studentsClassFilter && (studentsClassFilter.innerHTML = '<option value="">All classes</option>');
  examClassFilter && (examClassFilter.innerHTML = '<option value="">All classes</option>');
  for(const c of classesCache){
    const opt = document.createElement('option'); opt.value = c.name; opt.textContent = c.name;
    studentsClassFilter && studentsClassFilter.appendChild(opt);
    examClassFilter && examClassFilter.appendChild(opt.cloneNode(true));
  }
}
function populateStudentsExamDropdown(){
  if(!studentsExamForTotals) return;
  studentsExamForTotals.innerHTML = '<option value="">— Show totals for exam —</option>';
  for(const e of examsCache){
    const opt = document.createElement('option'); opt.value = e.id; opt.textContent = e.name;
    studentsExamForTotals.appendChild(opt);
  }
}



// safe array wrapper (ensure array)

/* ------------ small helpers used by the replacements ------------ */

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
/* ============================
   Robust Modal Backdrop Manager
   ============================ */
   (function(){
    if(window.__modalBackdropManager) return;
  
    const manager = {
      count: 0,
      backdrop: null,
      watchers: new Map(), // key -> { targetEl, observer, escHandler }
  
      createBackdrop(){
        if(this.backdrop) return this.backdrop;
        const b = document.createElement('div');
        b.id = '__modalBackdropBlur';
        Object.assign(b.style, {
          position: 'fixed',
          inset: '0',
          zIndex: '9998',
          pointerEvents: 'auto',
          background: 'rgba(0,0,0,0.22)', // slightly stronger overlay for clarity
          backdropFilter: 'blur(6px)'
        });
        // clicking backdrop tries to close modal via closeModal (safe) or removes last dialog
        b.addEventListener('click', () => {
          try { if (typeof window.closeModal === 'function') return window.closeModal(); } catch(_) {}
          const last = document.querySelector('[role="dialog"]:last-of-type') || document.querySelector('.modal-root') || document.body.lastElementChild;
          if(last && last.parentNode) last.parentNode.removeChild(last);
        });
        document.body.appendChild(b);
        this.backdrop = b;
        return b;
      },
  
      removeBackdropIfUnused(){
        if(this.watchers.size === 0){
          if(this.backdrop && this.backdrop.parentNode) this.backdrop.parentNode.removeChild(this.backdrop);
          this.backdrop = null;
          this.count = 0;
        }
      },
  
      addFor(targetEl){
        if(!targetEl) {
          // fallback to body last child
          targetEl = document.querySelector('.modal-root') || document.body.lastElementChild;
          if(!targetEl) return;
        }
  
        const b = this.createBackdrop();
        this.count++;
  
        const key = targetEl.__mbk || (targetEl.__mbk = 'mbk_' + Math.random().toString(36).slice(2));
        if(this.watchers.has(key)) return;
  
        const observer = new MutationObserver(() => {
          // when targetEl removed from DOM -> cleanup watcher
          if(!targetEl || !document.body.contains(targetEl)){
            try{ observer.disconnect(); }catch(e){}
            this.watchers.delete(key);
            this.count = Math.max(0, this.count - 1);
            if(this.watchers.size === 0) this.removeBackdropIfUnused();
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
  
        const escHandler = (ev) => {
          if(ev.key === 'Escape') {
            try { if (typeof window.closeModal === 'function') window.closeModal(); } catch(_) {}
          }
        };
        window.addEventListener('keydown', escHandler);
  
        this.watchers.set(key, { targetEl, observer, escHandler });
  
        // safety: if element already removed
        setTimeout(() => {
          if(!targetEl || !document.body.contains(targetEl)){
            try{ observer.disconnect(); }catch(e){}
            this.watchers.delete(key);
            this.count = Math.max(0, this.count - 1);
            if(this.watchers.size === 0) this.removeBackdropIfUnused();
          }
        }, 80);
      },
  
      releaseFor(targetEl){
        if(!targetEl){
          // best-effort: try to find any watcher whose target is not in DOM, else force cleanup
          let foundKey = null;
          for(const [k,w] of this.watchers.entries()){
            if(!w.targetEl || !document.body.contains(w.targetEl)){
              foundKey = k; break;
            }
          }
          if(foundKey){
            const w = this.watchers.get(foundKey);
            try{ w.observer.disconnect(); }catch(_){} 
            try{ window.removeEventListener('keydown', w.escHandler); }catch(_){} 
            this.watchers.delete(foundKey);
            this.count = Math.max(0, this.count - 1);
            if(this.watchers.size === 0) this.removeBackdropIfUnused();
          } else {
            // fallback: force cleanup
            if(this.backdrop) try{ this.backdrop.parentNode.removeChild(this.backdrop); }catch(_){} this.backdrop = null; this.watchers.clear(); this.count = 0;
          }
          return;
        }
  
        // find matching watcher
        let found = null;
        for(const [k,w] of this.watchers.entries()){
          if(w.targetEl === targetEl){ found = k; break; }
        }
        if(found){
          const w = this.watchers.get(found);
          try{ w.observer.disconnect(); }catch(_){} 
          try{ window.removeEventListener('keydown', w.escHandler); }catch(_){} 
          this.watchers.delete(found);
          this.count = Math.max(0, this.count - 1);
          if(this.watchers.size === 0) this.removeBackdropIfUnused();
        } else {
          // fallback: force cleanup
          if(this.backdrop) try{ this.backdrop.parentNode.removeChild(this.backdrop); }catch(_){} this.backdrop = null; this.watchers.clear(); this.count = 0;
        }
      },
  
      cleanupOrphans(){
        try{
          for(const [k,w] of Array.from(this.watchers.entries())){
            if(!w.targetEl || !document.body.contains(w.targetEl)){
              try{ w.observer.disconnect(); }catch(e){}
              try{ window.removeEventListener('keydown', w.escHandler); }catch(e){}
              this.watchers.delete(k);
              this.count = Math.max(0, this.count - 1);
            }
          }
          if(this.watchers.size === 0) this.removeBackdropIfUnused();
        }catch(e){ console.warn('cleanupOrphans error', e); }
      },
  
      forceCleanup(){
        try{ if(this.backdrop && this.backdrop.parentNode) this.backdrop.parentNode.removeChild(this.backdrop); }catch(_) {}
        this.backdrop = null; this.count = 0;
        for(const [k,w] of this.watchers.entries()){
          try{ w.observer.disconnect(); }catch(_){} 
          try{ window.removeEventListener('keydown', w.escHandler); }catch(_){} 
        }
        this.watchers.clear();
      }
    };
  
    window.__modalBackdropManager = manager;
  
    // convenience functions
    window.addModalBackdropBlur = function(modalRoot){
      try{ window.__modalBackdropManager.addFor(modalRoot || (typeof modalBody !== 'undefined' ? (modalBody.closest('.modal-root') || modalBody) : document.body.lastElementChild)); }catch(e){ console.warn(e); }
    };
    window.releaseModalBackdrop = function(modalRoot){
      try{ window.__modalBackdropManager.releaseFor(modalRoot || (typeof modalBody !== 'undefined' ? (modalBody.closest('.modal-root') || modalBody) : null)); }catch(e){ console.warn(e); }
    };
    window.__removeAllModalBackdrops = function(){ try{ window.__modalBackdropManager.forceCleanup(); }catch(e){ console.warn(e); } };
  
    // Wrap closeModal to ensure cleanup after any close path
    (function wrapCloseModal(){
      const orig = window.closeModal || null;
      window.closeModal = function(...args){
        try{ if(typeof orig === 'function') orig.apply(this, args); }catch(e){ /* ignore original errors */ }
        // slight delay for DOM removal then cleanup
        setTimeout(()=>{ try{ window.__modalBackdropManager.cleanupOrphans(); }catch(e){} }, 40);
      };
    })();
  
    // document-level catch for any close/X elements to release backdrop
    document.addEventListener('click', (ev) => {
      try{
        const el = ev.target.closest('.modal-close, .close, [data-modal-close]');
        if(!el) return;
        const modalRoot = el.closest('.modal-root') || document.querySelector('.modal-root') || document.body.lastElementChild;
        try{ window.releaseModalBackdrop(modalRoot); }catch(e){}
      }catch(e){}
    });
  })();
  /* End modal manager */
  


// ensure filters are populated after loadAll() runs (loadAll already calls populateClassFilters/populateSubjects)
function populateAdminQuizFilters(){
  if(adminQuizFilterClass){
    adminQuizFilterClass.innerHTML = '<option value="__all">All classes</option>';
    (classesCache||[]).forEach(c => {
      const o = document.createElement('option'); o.value = c.name || c.id; o.textContent = c.name || c.id;
      adminQuizFilterClass.appendChild(o);
    });
  }
  if(adminQuizFilterSubject){
    adminQuizFilterSubject.innerHTML = '<option value="__all">All subjects</option>';
    (subjectsCache||[]).forEach(s => {
      const o = document.createElement('option'); o.value = s.id || s.name; o.textContent = s.name || s.id;
      adminQuizFilterSubject.appendChild(o);
    });
  }
}

// Call populateAdminQuizFilters after loadAll()
window.populateAdminQuizFilters = populateAdminQuizFilters; // optional global

function formatLeftHMS(ms){
  if(!ms || ms<=0) return '00:00:00';
  const s = Math.floor(ms/1000); const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); const r = s%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
}
// ---------- renderAdminQuizzesPage ----------
const QUIZ_PAGE_SIZE = 20; // adjust down if needed for Spark

async function renderAdminQuizzesPage(){
  if(!adminQuizzesList || !adminQuizFilterClass || !adminQuizFilterSubject) return;

  adminQuizzesList.innerHTML = `<div class="card muted">Loading quizzes…</div>`;
  try {
    populateAdminQuizFilters();

    // internal paging state (keeps across reopen while page alive)
    if(!window._adminQuizPaging) window._adminQuizPaging = { lastDoc: null, finished: false, loaded: [] };
    const paging = window._adminQuizPaging;
    paging.lastDoc = null;
    paging.finished = false;
    paging.loaded = [];

    // helper: build Firestore query based on selected class/subject
// helper: build Firestore query based on selected class/subject (safer)
function buildQueryForPage(pageSize = QUIZ_PAGE_SIZE, startAfterDoc = null){
  const cls = adminQuizFilterClass.value || '__all';
  const subj = adminQuizFilterSubject.value || '__all';

  const col = collection(db, 'quizzes');
  const constraints = [];

  // server-side filters first
  if (cls && cls !== '__all') {
    constraints.push(where('classIds', 'array-contains', cls));
  }
  if (subj && subj !== '__all') {
    constraints.push(where('subjectIds', 'array-contains', subj));
  }

  // ordering & pagination
  constraints.push(orderBy('createdAt', 'desc'));
  if (startAfterDoc) constraints.push(startAfter(startAfterDoc));
  constraints.push(limit(pageSize));

  return query(col, ...constraints);
}

async function loadFirstPage(){
  paging.lastDoc = null;
  paging.finished = false;
  paging.loaded = [];

  const q = buildQueryForPage(QUIZ_PAGE_SIZE, null);
  const snap = await getDocs(q);
  const docs = snap.docs.map(d => ({ id: d.id, _snap: d, ...d.data() })).filter(d => !d.is_deleted);
  paging.loaded = docs;
  paging.lastDoc = snap.docs[snap.docs.length-1] || null;
  if(!paging.lastDoc || docs.length < QUIZ_PAGE_SIZE) paging.finished = true;
  renderListFromLoaded();
}

async function loadNextPage(){
  if(paging.finished) return;
  if(!paging.lastDoc) return; // nothing to page after
  const q = buildQueryForPage(QUIZ_PAGE_SIZE, paging.lastDoc);
  const snap = await getDocs(q);
  const docs = snap.docs.map(d => ({ id: d.id, _snap: d, ...d.data() })).filter(d => !d.is_deleted);
  paging.loaded = paging.loaded.concat(docs);
  paging.lastDoc = snap.docs[snap.docs.length-1] || paging.lastDoc;
  if(!snap.docs.length || docs.length < QUIZ_PAGE_SIZE) paging.finished = true;
  renderListFromLoaded();
}

    // client rendering from paging.loaded with client-side search/filtering
    function renderListFromLoaded(){
      const docs = paging.loaded;
      function matchesFilters(q, cls, subj, search){
        if(cls && cls !== '__all'){
          const qClasses = ensureArray(q.classIds || q.classId || q.class);
          if(!qClasses.some(x => String(x).toLowerCase() === String(cls).toLowerCase())) return false;
        }
        if(subj && subj !== '__all'){
          const qSubs = ensureArray(q.subjectIds || q.subjectId || q.subject || q.subjectName);
          if(!qSubs.some(x => String(x).toLowerCase() === String(subj).toLowerCase())) return false;
        }
        if(search){
          const s = String(search).toLowerCase();
          if(!(String(q.title||'').toLowerCase().includes(s) || String(q.id||'').toLowerCase().includes(s))) return false;
        }
        return true;
      }

      const cls = adminQuizFilterClass.value || '__all';
      const subj = adminQuizFilterSubject.value || '__all';
      const search = (adminQuizSearch && adminQuizSearch.value) ? adminQuizSearch.value.trim() : '';

      const rows = docs.filter(q => matchesFilters(q, cls, subj, search));
      if(!rows.length){
        adminQuizzesList.innerHTML = '<div class="muted">No quizzes found.</div>';
        // show load more if not finished
        if(!paging.finished){
          adminQuizzesList.innerHTML += `<div style="text-align:center;margin-top:8px"><button id="adminQuizLoadMore" class="btn btn-ghost">Load more</button></div>`;
          modalBody.querySelector('#adminQuizLoadMore')?.addEventListener('click', loadNextPage);
        }
        return;
      }

      adminQuizzesList.innerHTML = rows.map(q => {
        const subjName = displaySubjectList(q);
        const totalPoints = (q.questions||[]).reduce((s,qq)=> s + (qq.points||1), 0);
        const toMs = (ts) => { if(!ts) return null; if(typeof ts === 'number') return Number(ts); if(ts.seconds) return Number(ts.seconds)*1000; const p = Date.parse(ts); return isNaN(p)?null:p; };
        const startMs = toMs(q.startAt) || toMs(q.createdAt) || null;
        const endMsExplicit = toMs(q.endAt) || null;
        const durMs = (Number(q.durationMinutes)||0)*60*1000;
        const endMs = endMsExplicit || (startMs ? startMs + durMs : null);
        const left = endMs ? Math.max(0, endMs - Date.now()) : null;
        const leftText = left === null ? '—' : formatLeftHMS(left);

        let createdByLabel = String(q.createdBy || '');
        const t = (teachersCache||[]).find(x => x.id === q.createdBy || x.teacherId === q.createdBy || x.email === q.createdBy);
        if(t) createdByLabel = t.fullName || t.teacherId || t.email || createdByLabel;
        else if(q.createdBy === currentUser?.uid) createdByLabel = 'You';

        const classesDisplay = displayClassList(q);

        return `
          <div class="quiz-card quiz-row-admin" data-quizid="${escapeHtml(q.id)}" style="padding:10px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center">
            <div class="left" style="min-width:0">
              <div class="q-top" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                <div class="q-title" style="font-weight:800">${escapeHtml(q.title || '(untitled)')}</div>
                <div class="q-status ${q.active ? 'active' : 'inactive'}" style="white-space:nowrap">${q.active ? 'Active' : 'Inactive'}</div>
              </div>

              <div class="q-meta" style="margin-top:6px">
                <div class="muted small"><strong>ID:</strong> ${escapeHtml(q.id)}</div>
                <div class="muted small"><strong>Class:</strong> ${classesDisplay}</div>
                <div class="muted small"><strong>Subject:</strong> ${subjName}</div>
              </div>

              <div class="q-pills" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                <span class="pill duration">Duration: ${escapeHtml(String(q.durationMinutes||0))}m</span>
                <span class="pill timeleft" data-end="${endMs||0}">Time left: ${escapeHtml(leftText)}</span>
                <span class="muted" style="font-weight:700">Points: ${totalPoints}</span>
                <span class="muted small">Created by: ${escapeHtml(createdByLabel)}</span>
              </div>
            </div>

            <div class="right" style="display:flex;align-items:center;margin-left:12px">
              <div class="q-actions" style="margin:0;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
                <button class="btn btn-ghost btn-sm open-quiz" data-id="${escapeHtml(q.id)}">Open</button>
                <button class="btn btn-ghost btn-sm edit-quiz" data-id="${escapeHtml(q.id)}">Edit</button>
                <button class="btn btn-ghost btn-sm history-quiz" data-id="${escapeHtml(q.id)}">History</button>
                <button class="btn ${q.active ? 'btn-ghost' : 'btn-primary'} btn-sm toggle-quiz" data-id="${escapeHtml(q.id)}">${q.active ? 'Deactivate' : 'Activate'}</button>
                <button class="btn btn-sm btn-outline add-time" data-id="${escapeHtml(q.id)}">+ Add time</button>
                <button class="btn btn-danger btn-sm del-quiz" data-id="${escapeHtml(q.id)}">Delete</button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // wire actions (same as before)
      adminQuizzesList.querySelectorAll('.open-quiz').forEach(b => b.onclick = ev => openViewQuizModal(ev.currentTarget.dataset.id));
      adminQuizzesList.querySelectorAll('.edit-quiz').forEach(b => b.onclick = ev => showEditQuizModalFullAdmin(ev.currentTarget.dataset.id));
      adminQuizzesList.querySelectorAll('.history-quiz').forEach(b => b.onclick = ev => openQuizHistoryModal(ev.currentTarget.dataset.id));
      adminQuizzesList.querySelectorAll('.toggle-quiz').forEach(b => b.onclick = async ev => { await toggleActivateQuiz(ev.currentTarget.dataset.id); await renderAdminQuizzesPage(); });
      adminQuizzesList.querySelectorAll('.del-quiz').forEach(b => b.onclick = async ev => { await deleteQuiz(ev.currentTarget.dataset.id); await renderAdminQuizzesPage(); });
      adminQuizzesList.querySelectorAll('.add-time').forEach(b => b.onclick = async ev => { await addExtraTime(ev.currentTarget.dataset.id); await renderAdminQuizzesPage(); });

      // live ticker
      if(window._adminTimeTicker) clearInterval(window._adminTimeTicker);
      window._adminTimeTicker = setInterval(() => {
        document.querySelectorAll('.quiz-card .timeleft').forEach(el => {
          const end = Number(el.dataset.end || 0);
          if(!end || end <= 0){ el.textContent = 'Time left: —'; return; }
          const left = end - Date.now();
          if(left <= 0) el.textContent = 'Time left: 00:00:00';
          else el.textContent = 'Time left: ' + formatLeftHMS(left);
        });
      }, 1000);

      // show Load more if not finished
      if(!paging.finished){
        adminQuizzesList.innerHTML += `<div style="text-align:center;margin-top:8px"><button id="adminQuizLoadMore" class="btn btn-ghost">Load more</button></div>`;
        modalBody.querySelector('#adminQuizLoadMore')?.addEventListener('click', loadNextPage);
      }
    }

    // wire filters/search
    adminQuizFilterClass.onchange = async () => { await loadFirstPage(); };
    adminQuizFilterSubject.onchange = async () => { await loadFirstPage(); };
    if(adminQuizSearch) adminQuizSearch.oninput = debounce(() => renderListFromLoaded(), 250);

    // initial load
    await loadFirstPage();

  } catch(err){
    console.error('renderAdminQuizzesPage', err);
    adminQuizzesList.innerHTML = `<div class="muted">Failed to load quizzes.</div>`;
  }
}




// small debounce helper
function debounce(fn, wait=200){
  let t = null;
  return function(...args){ clearTimeout(t); t = setTimeout(()=>fn(...args), wait); };
}

// ---------- Admin create / edit UI (similar to teacher but admin may select any class/subject) ----------

// remove undefined values from object (Firestore rejects undefined)
function cleanUndefined(obj){
  for(const k of Object.keys(obj)){
    if(typeof obj[k] === 'undefined') delete obj[k];
    // convert empty string -> delete (optional: keep if you prefer null)
    if(typeof obj[k] === 'string' && obj[k].trim() === '') delete obj[k];
  }
  return obj;
}

// ---------- CREATE (updated: two-column subjects grid + backdrop blur + scrollbar) ----------
/* ============================
   openCreateQuizModalAdmin (complete)
   - polls for classes/subjects if caches empty
   - builds subjects grid, syncs hidden select
   - safe doc build (no undefined)
   - releases backdrop on X + Cancel reliably
   ============================ */
   async function openCreateQuizModalAdmin(prefill = {}){
    // build initial classes options from classesCache if present (we will re-populate if cache arrives later)
    const initialClassOptions = (classesCache || []).map(c => `<option value="${escapeHtml(c.id || c.name)}">${escapeHtml(c.name || c.id)}</option>`).join('');
    const html = `
      <style>
        .subjects-grid{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px; max-height:220px; overflow:auto; padding:6px; border:1px solid #e6eef8; border-radius:8px; background:var(--card,#fff); }
        .subjects-grid .sub-item{ display:flex; gap:8px; align-items:center; padding:6px 8px; border-radius:6px; cursor:pointer; user-select:none; }
        .subjects-grid .sub-item input{ transform:scale(1.05); }
        .chip-blue{ background:#eef2ff;padding:6px 10px;border-radius:999px;color:#1e3a8a;font-size:13px; }
        .chip-green{ background:#f0fdf4;padding:6px 10px;border-radius:999px;color:#065f46;font-size:13px; }
        .top-two-col{ display:grid; grid-template-columns:1fr 1fr; gap:12px; align-items:start; }
        @media (max-width:720px){ .top-two-col{ grid-template-columns:1fr; } }
      </style>
  
      <div style="display:flex;flex-direction:column;max-height:80vh">
        <div style="overflow:auto;padding:12px;display:flex;flex-direction:column;gap:10px">
          <div>
            <label style="font-weight:700">Title</label>
            <input id="a_quizTitle" value="${escapeHtml(prefill?.title||'')}" placeholder="Enter quiz title" />
          </div>
  
          <div class="top-two-col">
            <div style="display:flex;flex-direction:column;gap:6px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <label style="font-weight:700">Classes</label>
                <small class="muted">Select one or more</small>
              </div>
              <select id="a_quizClasses" multiple size="6" style="width:100%">${initialClassOptions}</select>
              <div id="a_quizClassesSelected" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"></div>
            </div>
  
            <div style="display:flex;flex-direction:column;gap:6px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <label style="font-weight:700">Subjects</label>
                <small class="muted">Common to selected classes (two-column)</small>
              </div>
              <select id="a_quizSubjects" multiple size="8" style="display:none"></select>
              <div id="a_quizSubjectsGrid" class="subjects-grid" aria-hidden="false"></div>
              <div id="a_quizSubjectsSelected" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"></div>
            </div>
          </div>
  
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
            <div style="flex:1;min-width:160px">
              <label style="font-weight:700">Duration (minutes)</label>
              <input id="a_quizDuration" type="number" min="1" value="${prefill?.durationMinutes || 30}" />
            </div>
            <div style="flex:1;min-width:160px">
              <label style="font-weight:700">Note (optional)</label>
              <input id="a_quizNote" value="${escapeHtml(prefill?.note||'')}" placeholder="Short note for students (optional)" />
            </div>
          </div>
  
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">
            <label style="font-weight:700">Options</label>
            <div style="display:flex;gap:12px;flex-wrap:wrap">
              <label style="display:inline-flex;align-items:center;gap:6px"><input id="a_randQuestions" type="checkbox" ${prefill?.randomizeQuestions ? 'checked' : ''} /> Randomize questions</label>
              <label style="display:inline-flex;align-items:center;gap:6px"><input id="a_randChoices" type="checkbox" ${prefill?.randomizeChoices ? 'checked' : ''} /> Randomize choices</label>
            </div>
          </div>
  
          <div id="a_questionsEditor" style="margin-top:8px"></div>
        </div>
  
        <div style="position:sticky;bottom:0;background:var(--card,#fff);padding:10px;border-top:1px solid #eee;display:flex;justify-content:flex-end;gap:8px">
          <button id="a_cancelQuiz" class="btn btn-ghost">Cancel</button>
          <button id="a_addQuestionBtn" class="btn btn-ghost">+ Add question</button>
          <button id="a_saveQuizBtn" class="btn btn-primary">Save quiz</button>
        </div>
      </div>
    `;
    showModal('Create quiz (admin)', html);
  
    // locate modal root/body and attach backdrop
    const modalRoot = modalBody && modalBody.closest('.modal-root') || modalBody || document.body.lastElementChild;
    addModalBackdropBlur(modalRoot);
  
    // element refs (supports both create/edit id prefixes if reused)
    const classesEl = modalBody.querySelector('#a_quizClasses');
    const subjectsHiddenEl = modalBody.querySelector('#a_quizSubjects');
    const subjectsGrid = modalBody.querySelector('#a_quizSubjectsGrid');
    const classesSelectedEl = modalBody.querySelector('#a_quizClassesSelected');
    const subjectsSelectedEl = modalBody.querySelector('#a_quizSubjectsSelected');
  
    // helper: render chips
    function renderSelectedChipsAdmin(){
      try {
        const selectedClasses = Array.from(classesEl.selectedOptions||[]).map(o=>o.textContent || o.value);
        classesSelectedEl.innerHTML = selectedClasses.map(c => `<div class="chip-blue" title="${escapeHtml(c)}">${escapeHtml(c)}</div>`).join('') || `<div class="muted small">(no class selected)</div>`;
        const selectedSubjects = Array.from(subjectsHiddenEl.selectedOptions||[]).map(o=>o.textContent || o.value);
        subjectsSelectedEl.innerHTML = selectedSubjects.map(s => `<div class="chip-green" title="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join('') || `<div class="muted small">(no subject selected)</div>`;
      }catch(e){}
    }
  
    // build visible grid from allowed subject ids
    function buildSubjectsGrid(allowed, preSelected=[]){
      subjectsHiddenEl.innerHTML = '';
      subjectsGrid.innerHTML = '';
      const allowedDocs = (allowed || []).map(sid => {
        const sdoc = (subjectsCache||[]).find(s => String(s.id) === String(sid) || String(s.name) === String(sid));
        return { id: sdoc ? sdoc.id : sid, label: sdoc ? (sdoc.name || sdoc.id) : sid };
      });
      for(const s of allowedDocs){
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.label;
        if(preSelected.includes(String(s.id)) || preSelected.includes(String(s.label))) opt.selected = true;
        subjectsHiddenEl.appendChild(opt);
  
        const item = document.createElement('label');
        item.className = 'sub-item';
        item.innerHTML = `<input type="checkbox" data-val="${escapeHtml(s.id)}" ${opt.selected ? 'checked' : ''}/> <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(s.label)}</span>`;
        const cb = item.querySelector('input');
        cb.addEventListener('change', () => {
          for(const o of subjectsHiddenEl.options) {
            if(String(o.value) === String(cb.dataset.val)) o.selected = cb.checked;
          }
          renderSelectedChipsAdmin();
        });
        subjectsGrid.appendChild(item);
      }
      renderSelectedChipsAdmin();
    }
  
    // populate classes select if classesCache arrives late — we poll briefly
    function populateClassesSelect(preselectIds){
      if(!classesEl) return;
      classesEl.innerHTML = '';
      (classesCache || []).forEach(c => {
        const o = document.createElement('option');
        o.value = String(c.id || c.name || '');
        o.textContent = c.name || c.id || o.value;
        if(preselectIds && preselectIds.includes(String(o.value))) o.selected = true;
        classesEl.appendChild(o);
      });
      renderSelectedChipsAdmin();
      // call refresh subjects because classes have changed
      try { refreshASubjects(); } catch(e){}
    }
  
    // if classesCache empty, poll until it arrives (small interval)
    if((classesCache||[]).length === 0){
      classesSelectedEl.innerHTML = `<div class="muted small">Loading classes…</div>`;
      const poll = setInterval(() => {
        if((classesCache||[]).length > 0){
          clearInterval(poll);
          populateClassesSelect( prefill?.classId ? [String(prefill.classId)] : [] );
        }
      }, 150);
    } else {
      // already present
      populateClassesSelect( prefill?.classId ? [String(prefill.classId)] : []);
    }
  
    // subjects label refresh if subjectsCache arrives later
    function refreshSubjectLabelsIfNeeded(){
      if(!subjectsGrid) return;
      subjectsGrid.querySelectorAll('.sub-item span').forEach(sp => {
        const checkbox = sp.previousElementSibling;
        const val = checkbox?.dataset?.val;
        if(!val) return;
        const found = (subjectsCache||[]).find(s => String(s.id) === String(val) || String(s.name) === String(val));
        if(found) sp.textContent = found.name || found.id;
      });
    }
    if((subjectsCache||[]).length === 0){
      const pollSub = setInterval(() => {
        if((subjectsCache||[]).length > 0){
          clearInterval(pollSub);
          refreshSubjectLabelsIfNeeded();
          renderSelectedChipsAdmin();
        }
      }, 150);
    }
  
    // when classes change, rebuild subjects grid from intersection
    function refreshASubjects(){
      const selected = Array.from(classesEl.selectedOptions || []).map(o => o.value);
      if(selected.length === 0){
        subjectsGrid.innerHTML = `<div style="grid-column:1/-1;color:#64748b;padding:8px">(select classes first)</div>`;
        subjectsHiddenEl.innerHTML = '';
        renderSelectedChipsAdmin();
        return;
      }
      const allowed = subjectsIntersectionForClassIds(selected);
      const preSubjects = ensureArray(prefill?.subjectIds || prefill?.subjectId || prefill?.subject || []);
      buildSubjectsGrid(allowed, preSubjects);
      // try to replace ids with names if subjectsCache exists
      refreshSubjectLabelsIfNeeded();
    }
  
    classesEl.onchange = () => { refreshASubjects(); renderSelectedChipsAdmin(); };
    subjectsHiddenEl.onchange = renderSelectedChipsAdmin;
  
    // preselect classes if user passed classId in prefill
    if(prefill?.classId && (classesEl.options || []).length){
      for(const opt of classesEl.options) if(opt.value === String(prefill.classId)) opt.selected = true;
    } else if((classesEl.options||[]).length === 0 && (classesCache||[]).length > 0){
      // if classesCache loaded but no prefill selected -> select first
      if(classesEl.options.length) classesEl.options[0].selected = true;
    }
    refreshASubjects();
  
    // questions editor
    const questions = prefill?.questions ? JSON.parse(JSON.stringify(prefill.questions)) : [{ text:'Example: 1+2 = ?', choices:['1','2','3','4'], correctIndex:2, points:1 }];
    function renderQuestionsEditorA(arr){
      const root = modalBody.querySelector('#a_questionsEditor');
      if(!arr.length){ root.innerHTML = `<div class="muted">No questions yet.</div>`; return; }
      root.innerHTML = arr.map((q,i)=> {
        const choicesHtml = (q.choices||[]).map((c,ci)=>`<div style="display:flex;gap:8px;align-items:center"><input name="a_q${i}_choice" data-q="${i}" data-c="${ci}" type="radio" ${q.correctIndex===ci?'checked':''}/> <input class="a_choiceText" data-q="${i}" data-c="${ci}" value="${escapeHtml(c||'')}" /></div>`).join('');
        return `<div style="border:1px dashed #e6eef8;padding:8px;margin-bottom:8px;border-radius:8px">
          <div style="display:flex;justify-content:space-between"><div style="font-weight:700">Q${i+1}</div><div><button class="btn btn-ghost btn-sm a_remove_question" data-i="${i}">Remove</button></div></div>
          <div style="margin-top:6px"><input class="a_qText" data-q="${i}" value="${escapeHtml(q.text||'')}" style="width:100%" /></div>
          <div style="margin-top:6px">Points: <input type="number" class="a_qPoints" data-q="${i}" value="${q.points||1}" min="0" style="width:80px" /></div>
          <div style="margin-top:8px">${choicesHtml}</div>
          <div style="margin-top:6px"><button class="btn btn-ghost btn-sm a_add_choice" data-q="${i}">+ Choice</button></div>
        </div>`;
      }).join('');
  
      root.querySelectorAll('.a_remove_question').forEach(b => b.onclick = () => { questions.splice(Number(b.dataset.i),1); renderQuestionsEditorA(arr); });
      root.querySelectorAll('.a_add_choice').forEach(b => b.onclick = () => { const qi = Number(b.dataset.q); arr[qi].choices = arr[qi].choices || []; arr[qi].choices.push('New'); renderQuestionsEditorA(arr); });
      root.querySelectorAll('.a_choiceText').forEach(inp => inp.oninput = () => { const qi = Number(inp.dataset.q), ci = Number(inp.dataset.c); arr[qi].choices[ci] = inp.value; });
      root.querySelectorAll('.a_qText').forEach(inp => inp.oninput = () => { arr[Number(inp.dataset.q)].text = inp.value; });
      root.querySelectorAll('.a_qPoints').forEach(inp => inp.oninput = () => { arr[Number(inp.dataset.q)].points = Number(inp.value) || 0; });
      root.querySelectorAll(`input[name^="a_q"]`).forEach(r => r.onchange = () => { const qi = Number(r.dataset.q), ci = Number(r.dataset.c); arr[qi].correctIndex = ci; });
    }
    renderQuestionsEditorA(questions);
    modalBody.querySelector('#a_addQuestionBtn').onclick = () => { questions.push({ text:'New question', choices:['Option A','Option B'], correctIndex:0, points:1 }); renderQuestionsEditorA(questions); };
  
    // close helper that releases backdrop reliably
    function closeAndRelease(){
      try{ closeModal(); }catch(e){}
      try{ releaseModalBackdrop(modalRoot); }catch(e){}
    }
  
    // cancel
    modalBody.querySelector('#a_cancelQuiz').onclick = () => { closeAndRelease(); };
  
    // wire X inside modalRoot (may be outside modalBody in templates)
    try{
      const x = modalRoot && (modalRoot.querySelector('.modal-close') || modalRoot.querySelector('.close') || modalRoot.querySelector('[data-modal-close]'));
      if(x) x.addEventListener('click', closeAndRelease);
      // also catch any [data-modal-close] inside modalBody
      modalBody.addEventListener('click', ev => {
        if(ev.target && (ev.target.matches('[data-modal-close]') || ev.target.closest('[data-modal-close]'))){
          closeAndRelease();
        }
      });
    }catch(e){}
  
    // SAVE (build doc safely: no undefined fields)
    modalBody.querySelector('#a_saveQuizBtn').onclick = async () => {
      const btn = modalBody.querySelector('#a_saveQuizBtn'); setButtonLoading(btn, true, 'Saving...');
      try {
        const title = (modalBody.querySelector('#a_quizTitle').value||'').trim();
        const selectedClassIds = Array.from(modalBody.querySelector('#a_quizClasses').selectedOptions || []).map(o=>o.value);
        const selectedSubjectIds = Array.from(subjectsHiddenEl.selectedOptions || []).map(o=>o.value);
        const durationMinutes = Number(modalBody.querySelector('#a_quizDuration').value) || 30;
        const noteRaw = modalBody.querySelector('#a_quizNote').value;
        const note = (typeof noteRaw === 'string') ? noteRaw.trim() : '';
        const randomizeQuestions = !!modalBody.querySelector('#a_randQuestions').checked;
        const randomizeChoices = !!modalBody.querySelector('#a_randChoices').checked;
        if(!title || !selectedClassIds.length || !selectedSubjectIds.length){ toast('Title, classes and subjects are required', 'error'); setButtonLoading(btn,false); return; }
  
        const qs = questions.map(q => ({ text: (q.text||'').toString(), choices: (q.choices||[]).map(c=> (c||'').toString()), correctIndex: Number(q.correctIndex||0), points: Number(q.points||1) }));
        const docObj = {
          title,
          classIds: selectedClassIds,
          subjectIds: selectedSubjectIds,
          durationMinutes,
          randomizeQuestions,
          randomizeChoices,
          questions: qs,
          active: false,
          createdBy: currentUser?.uid || 'admin',
          createdAt: Timestamp.now()
        };
        if(selectedClassIds.length === 1) docObj.classId = selectedClassIds[0];
        if(selectedSubjectIds.length === 1) docObj.subjectId = selectedSubjectIds[0];
        if(note) docObj.note = note;
        cleanUndefined(docObj);
  
        await addDoc(collection(db,'quizzes'), docObj);
        toast('Quiz created', 'success');
        closeAndRelease();
        await renderAdminQuizzesPage();
      } catch(e){
        console.error('saveQuizAdmin failed', e);
        toast('Failed to save quiz (see console)', 'error');
      } finally { setButtonLoading(btn,false); }
    };
  }
  window.openCreateQuizModalAdmin = openCreateQuizModalAdmin;
  

// ---------- EDIT (updated: two-column subjects grid + backdrop blur + scrollbar) ----------
/* ============================
   showEditQuizModalFullAdmin (complete)
   - fetches quiz doc if id passed
   - populates classes/subjects with polling (if caches empty)
   - preselects classes/subjects, syncs hidden select
   - safe update with cleanUndefined
   - releases backdrop on X + Cancel reliably
   ============================ */
   async function showEditQuizModalFullAdmin(quizIdOrDoc){
    let qdoc = null;
    if(typeof quizIdOrDoc === 'string'){
      const snap = await getDoc(doc(db,'quizzes', quizIdOrDoc));
      if(!snap.exists()) return toast('Quiz not found', 'error');
      qdoc = { id: snap.id, ...snap.data() };
    } else qdoc = quizIdOrDoc;
  
    // initial class options from cache (we will repopulate if cache arrives later)
    const initClassOptions = (classesCache || []).map(c => `<option value="${escapeHtml(c.id || c.name)}">${escapeHtml(c.name || c.id)}</option>`).join('');
    const html = `
      <style>
        .subjects-grid{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px; max-height:220px; overflow:auto; padding:6px; border:1px solid #e6eef8; border-radius:8px; background:var(--card,#fff); }
        .sub-item{ display:flex; gap:8px; align-items:center; padding:6px 8px; border-radius:6px; cursor:pointer; user-select:none; }
        .chip-blue{ background:#eef2ff;padding:6px 10px;border-radius:999px;color:#1e3a8a;font-size:13px; }
        .chip-green{ background:#f0fdf4;padding:6px 10px;border-radius:999px;color:#065f46;font-size:13px; }
        @media (max-width:720px){ .subjects-grid{ grid-template-columns:repeat(1, minmax(0,1fr)); } }
      </style>
  
      <div style="display:flex;flex-direction:column;max-height:80vh">
        <div style="overflow:auto;padding:10px;display:flex;flex-direction:column;gap:8px">
          <label>Title</label><input id="ae_quizTitle" value="${escapeHtml(qdoc.title||'')}" />
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label style="margin-top:8px">Classes (select one or more)</label>
              <select id="ae_quizClasses" multiple size="6">${initClassOptions}</select>
              <div id="ae_quizClassesSelected" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"></div>
            </div>
  
            <div>
              <label style="margin-top:8px">Subjects (common to selected classes)</label>
              <select id="ae_quizSubjects" multiple size="8" style="display:none"></select>
              <div id="ae_quizSubjectsGrid" class="subjects-grid"></div>
              <div id="ae_quizSubjectsSelected" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"></div>
            </div>
          </div>
  
          <label style="margin-top:8px">Duration (minutes)</label><input id="ae_quizDuration" type="number" min="1" value="${qdoc.durationMinutes||30}" />
          <div style="display:flex;gap:8px;margin-top:8px">
            <label><input id="ae_randQuestions" type="checkbox" ${qdoc.randomizeQuestions ? 'checked' : ''} /> Randomize questions</label>
            <label><input id="ae_randChoices" type="checkbox" ${qdoc.randomizeChoices ? 'checked' : ''} /> Randomize choices</label>
          </div>
          <div id="ae_questionsEditor" style="margin-top:12px"></div>
        </div>
  
        <div style="position:sticky;bottom:0;background:var(--card,#fff);padding:10px;border-top:1px solid #eee;display:flex;justify-content:flex-end;gap:8px">
          <button id="ae_cancelQuiz" class="btn btn-ghost">Cancel</button>
          <button id="ae_saveQuizBtn" class="btn btn-primary">Save changes</button>
        </div>
      </div>
    `;
    showModal('Edit quiz (admin)', html);
  
    const modalRoot = modalBody && modalBody.closest('.modal-root') || modalBody || document.body.lastElementChild;
    addModalBackdropBlur(modalRoot);
  
    const classesEl = modalBody.querySelector('#ae_quizClasses');
    const subjectsHiddenEl = modalBody.querySelector('#ae_quizSubjects');
    const subjectsGrid = modalBody.querySelector('#ae_quizSubjectsGrid');
    const classesSelectedEl = modalBody.querySelector('#ae_quizClassesSelected');
    const subjectsSelectedEl = modalBody.querySelector('#ae_quizSubjectsSelected');
  
    function renderSelectedChipsAdmin(){
      try {
        const selectedClasses = Array.from(classesEl.selectedOptions||[]).map(o=>o.textContent || o.value);
        classesSelectedEl.innerHTML = selectedClasses.map(c => `<div class="chip-blue" title="${escapeHtml(c)}">${escapeHtml(c)}</div>`).join('') || `<div class="muted small">(no class selected)</div>`;
        const selectedSubjects = Array.from(subjectsHiddenEl.selectedOptions||[]).map(o=>o.textContent || o.value);
        subjectsSelectedEl.innerHTML = selectedSubjects.map(s => `<div class="chip-green" title="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join('') || `<div class="muted small">(no subject selected)</div>`;
      }catch(e){}
    }
  
    function buildSubjectsGrid(allowed, preSelected=[]){
      subjectsHiddenEl.innerHTML = '';
      subjectsGrid.innerHTML = '';
      const allowedDocs = (allowed || []).map(sid => {
        const sdoc = (subjectsCache||[]).find(s => String(s.id) === String(sid) || String(s.name) === String(sid));
        return { id: sdoc ? sdoc.id : sid, label: sdoc ? (sdoc.name || sdoc.id) : sid };
      });
      for(const s of allowedDocs){
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.label;
        if(preSelected.includes(String(s.id)) || preSelected.includes(String(s.label))) opt.selected = true;
        subjectsHiddenEl.appendChild(opt);
  
        const item = document.createElement('label');
        item.className = 'sub-item';
        item.innerHTML = `<input type="checkbox" data-val="${escapeHtml(s.id)}" ${opt.selected ? 'checked' : ''}/> <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(s.label)}</span>`;
        const cb = item.querySelector('input');
        cb.addEventListener('change', () => {
          for(const o of subjectsHiddenEl.options) {
            if(String(o.value) === String(cb.dataset.val)) o.selected = cb.checked;
          }
          renderSelectedChipsAdmin();
        });
        subjectsGrid.appendChild(item);
      }
      renderSelectedChipsAdmin();
    }
  
    // populate classes select when cache arrives (or immediately if present)
    function populateClassesSelect(preselectIds){
      if(!classesEl) return;
      classesEl.innerHTML = '';
      (classesCache || []).forEach(c => {
        const o = document.createElement('option');
        o.value = String(c.id || c.name || '');
        o.textContent = c.name || c.id || o.value;
        classesEl.appendChild(o);
      });
      // preselect based on qdoc
      if(Array.isArray(preselectIds) && preselectIds.length){
        for(const opt of classesEl.options) { if(preselectIds.includes(opt.value)) opt.selected = true; }
      } else if(classesEl.options.length && !(Array.from(classesEl.selectedOptions||[]).length)) {
        classesEl.options[0].selected = true;
      }
      renderSelectedChipsAdmin();
    }
  
    if((classesCache||[]).length === 0){
      // poll for classesCache
      const poll = setInterval(() => {
        if((classesCache||[]).length > 0){
          clearInterval(poll);
          const preClassIds = ensureArray(qdoc.classIds || qdoc.classId || qdoc.class);
          populateClassesSelect(preClassIds);
          refreshAESubjects();
        }
      }, 150);
    } else {
      const preClassIds = ensureArray(qdoc.classIds || qdoc.classId || qdoc.class);
      populateClassesSelect(preClassIds);
    }
  
    // subject label refresh
    function refreshSubjectLabelsIfNeeded(){
      if(!subjectsGrid) return;
      subjectsGrid.querySelectorAll('.sub-item span').forEach(sp => {
        const checkbox = sp.previousElementSibling;
        const val = checkbox?.dataset?.val;
        if(!val) return;
        const found = (subjectsCache||[]).find(s => String(s.id) === String(val) || String(s.name) === String(val));
        if(found) sp.textContent = found.name || found.id;
      });
    }
    if((subjectsCache||[]).length === 0){
      const pollSub = setInterval(() => {
        if((subjectsCache||[]).length > 0){
          clearInterval(pollSub);
          refreshSubjectLabelsIfNeeded();
          renderSelectedChipsAdmin();
        }
      }, 150);
    }
  
    // preselect classes locally if present in DOM already
    const preClassIds = ensureArray(qdoc.classIds || qdoc.classId || qdoc.class);
    if(preClassIds.length && (classesEl.options || []).length){
      for(const opt of classesEl.options) { if(preClassIds.includes(opt.value)) opt.selected = true; }
    }
  
    // refresh allowed subjects for selected classes and preselect qdoc.subjectIds
    function refreshAESubjects(){
      const selected = Array.from(classesEl.selectedOptions || []).map(o => o.value);
      if(selected.length === 0){
        subjectsGrid.innerHTML = `<div style="grid-column:1/-1;color:#64748b;padding:8px">(select classes first)</div>`;
        subjectsHiddenEl.innerHTML = '';
        renderSelectedChipsAdmin();
        return;
      }
      const allowed = subjectsIntersectionForClassIds(selected);
      const preSubjects = ensureArray(qdoc.subjectIds || qdoc.subjectId || qdoc.subject || []);
      buildSubjectsGrid(allowed, preSubjects);
      refreshSubjectLabelsIfNeeded();
    }
    classesEl.onchange = refreshAESubjects;
    subjectsHiddenEl.onchange = renderSelectedChipsAdmin;
    refreshAESubjects();
  
    // questions editor
    const questions = JSON.parse(JSON.stringify(qdoc.questions || []));
    function renderAE(){
      const root = modalBody.querySelector('#ae_questionsEditor');
      if(!questions.length){ root.innerHTML = `<div class="muted">No questions</div>`; return; }
      root.innerHTML = questions.map((q,i)=>`<div style="border:1px dashed #eee;padding:8px;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between"><div style="font-weight:700">Q${i+1}</div><div><button class="ae_remove_q btn btn-ghost btn-sm" data-i="${i}">Remove</button></div></div>
        <div style="margin-top:6px"><input class="ae_qText" data-q="${i}" value="${escapeHtml(q.text||'')}" style="width:100%"/></div>
        <div style="margin-top:6px">Points: <input class="ae_qPoints" data-q="${i}" value="${q.points||1}" style="width:80px" type="number" min="0"/></div>
        <div style="margin-top:6px">${(q.choices||[]).map((c,ci)=>`<div style="display:flex;gap:8px;align-items:center"><input name="ae_q${i}_choice" data-q="${i}" data-c="${ci}" type="radio" ${q.correctIndex===ci ? 'checked':''}/> <input class="ae_choiceText" data-q="${i}" data-c="${ci}" value="${escapeHtml(c||'')}" /></div>`).join('')}</div>
        <div style="margin-top:6px"><button class="ae_add_choice btn btn-ghost btn-sm" data-q="${i}">+ Choice</button></div>
      </div>`).join('');
      root.querySelectorAll('.ae_remove_q').forEach(b=>b.onclick=()=>{questions.splice(Number(b.dataset.i),1);renderAE();});
      root.querySelectorAll('.ae_add_choice').forEach(b=>b.onclick=()=>{const qi=Number(b.dataset.q);questions[qi].choices.push('New');renderAE();});
      root.querySelectorAll('.ae_choiceText').forEach(inp=>inp.oninput=()=>{questions[Number(inp.dataset.q)].choices[Number(inp.dataset.c)] = inp.value;});
      root.querySelectorAll('.ae_qText').forEach(inp=>inp.oninput=()=>{questions[Number(inp.dataset.q)].text = inp.value;});
      root.querySelectorAll('.ae_qPoints').forEach(inp=>inp.oninput=()=>{questions[Number(inp.dataset.q)].points = Number(inp.value)||0;});
      root.querySelectorAll(`input[name^="ae_q"]`).forEach(r=>r.onchange=()=>{const qi=Number(r.dataset.q), ci=Number(r.dataset.c);questions[qi].correctIndex = ci;});
    }
    renderAE();
  
    // close helper
    function closeAndRelease(){
      try{ closeModal(); }catch(e){}
      try{ releaseModalBackdrop(modalRoot); }catch(e){}
    }
  
    // wire cancel + X
    const cancelBtn = modalBody.querySelector('#ae_cancelQuiz');
    if(cancelBtn) cancelBtn.onclick = () => closeAndRelease();
    try{
      const x = modalRoot && (modalRoot.querySelector('.modal-close') || modalRoot.querySelector('.close') || modalRoot.querySelector('[data-modal-close]'));
      if(x) x.addEventListener('click', closeAndRelease);
      modalBody.addEventListener('click', ev => {
        if(ev.target && (ev.target.matches('[data-modal-close]') || ev.target.closest('[data-modal-close]'))){
          closeAndRelease();
        }
      });
    }catch(e){}
  
    // SAVE
    modalBody.querySelector('#ae_saveQuizBtn').onclick = async () => {
      const btn = modalBody.querySelector('#ae_saveQuizBtn'); setButtonLoading(btn,true,'Saving...');
      try {
        const title = (modalBody.querySelector('#ae_quizTitle').value||'').trim();
        const selectedClassIds = Array.from(modalBody.querySelector('#ae_quizClasses').selectedOptions || []).map(o=>o.value);
        const selectedSubjectIds = Array.from(subjectsHiddenEl.selectedOptions || []).map(o=>o.value);
        const durationMinutes = Number(modalBody.querySelector('#ae_quizDuration').value) || 30;
        const randomizeQuestions = !!modalBody.querySelector('#ae_randQuestions').checked;
        const randomizeChoices = !!modalBody.querySelector('#ae_randChoices').checked;
        if(!title || !selectedClassIds.length || !selectedSubjectIds.length){ toast('Title/classes/subjects required', 'error'); setButtonLoading(btn,false); return; }
  
        const updates = {
          title,
          classIds: selectedClassIds,
          subjectIds: selectedSubjectIds,
          durationMinutes,
          randomizeQuestions,
          randomizeChoices,
          questions,
          updatedAt: Timestamp.now()
        };
        if(selectedClassIds.length === 1) updates.classId = selectedClassIds[0];
        if(selectedSubjectIds.length === 1) updates.subjectId = selectedSubjectIds[0];
        cleanUndefined(updates);
  
        await updateDoc(doc(db,'quizzes', qdoc.id), updates);
        toast('Quiz updated', 'success');
        closeAndRelease();
        await renderAdminQuizzesPage();
      } catch(e){
        console.error('update quiz admin', e);
        toast('Failed to update', 'error');
      } finally { setButtonLoading(btn,false); }
    };
  }
  window.showEditQuizModalFullAdmin = showEditQuizModalFullAdmin;
  




// Soft delete: move quiz to recycle bin (only soft delete)
async function deleteQuiz(id){
  const ok = await modalConfirm('Delete quiz','Move this quiz to Recycle Bin? It can be restored later. Only superadmin can permanently delete.');
  if(!ok) return;
  try {
    await updateDoc(doc(db,'quizzes', id), {
      deleted: true,
      is_deleted: true,
      deletedAt: Timestamp.now(),
      deletedBy: currentUser?.uid || null,
      deletedByName: getCachedUserDisplayName(currentUser?.uid) || currentUser?.email || null,
      updatedAt: Timestamp.now()
    });
  
    toast('Quiz moved to Recycle Bin', 'success');
    // re-render admin/teacher lists
    await renderAdminQuizzesPage();
    try { await renderTeacherQuizzesPage(); } catch(_) {}
  } catch(e){
    console.error('deleteQuiz (soft) failed', e);
    toast('Delete failed', 'error');
  }
}


async function toggleActivateQuiz(id){
  try {
    const snap = await getDoc(doc(db,'quizzes',id));
    if(!snap.exists()) return toast('Quiz not found');
    const cur = snap.data();
    const isActive = !!cur.active;
    const updates = { active: !isActive, updatedAt: Timestamp.now() };

    // if activating now and no startAt, set startAt = now, and endAt = now + duration (or existing endAt)
    if(!isActive){
      const hasStart = !!cur.startAt;
      const nowTs = Timestamp.now();
      if(!hasStart){
        updates.startAt = nowTs;
        // compute endAt from durationMinutes if not present
        const dur = Number(cur.durationMinutes || 0);
        if(dur > 0){
          const endMs = Date.now() + dur * 60 * 1000;
          updates.endAt = Timestamp.fromMillis ? Timestamp.fromMillis(endMs) : nowTs; // fallback if fromMillis missing
          // If fromMillis not available in your SDK, set endAt as plain number or use admin to set it.
          // Many SDKs support Timestamp.fromMillis — keep this line.
        }
      }
    }
    await updateDoc(doc(db,'quizzes',id), updates);
    toast(!isActive ? 'Activated' : 'Deactivated');
    await renderTeacherQuizzesPage();
  } catch(e){ console.error('Toggle failed', e); toast('Toggle failed'); }
}



// ---------- open quick view modal (teacher) ----------
async function openQuizHistoryModal(quizId){
  const snap = await getDoc(doc(db,'quizzes',quizId));
  if(!snap.exists()) return toast && toast('Quiz not found');
  const qd = { id: snap.id, ...snap.data() };

  const respSnap = await getDocs(query(collection(db,'quiz_responses'), where('quizId','==', quizId), orderBy('score','desc')));
  const responses = respSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // fill missing studentName by looking up studentsCache
  responses.forEach(r => {
    if(!r.studentName || String(r.studentName).trim() === ''){
      const s = (window.studentsCache||[]).find(ss => String(ss.id) === String(r.studentId) || String(ss.studentId) === String(r.studentId) || String(ss.number) === String(r.studentId));
      r.studentName = s ? (s.fullName || s.name || s.studentId || r.studentId) : (r.studentId || 'Student');
    }
  });

  // compute question-level summary
  const questions = qd.questions || [];
  const qStats = questions.map((q,i)=>({ index:i, total:0, correct:0 }));
  responses.forEach(r => {
    (r.answers||[]).forEach((a, ai) => {
      qStats[ai] = qStats[ai] || { index:ai, total:0, correct:0 };
      qStats[ai].total++;
      const selectedOriginal = (typeof a.selectedOriginalIndex !== 'undefined' && a.selectedOriginalIndex !== null) ? a.selectedOriginalIndex : (typeof a.selectedIndex !== 'undefined' ? a.selectedIndex : null);
      if(selectedOriginal !== null && selectedOriginal === (questions[ai]?.correctIndex)) qStats[ai].correct++;
    });
  });
  const summaryHtml = qStats.map(s => {
    const pct = s.total ? Math.round((s.correct/s.total)*100) : 0;
    const qtxt = escapeHtml(questions[s.index]?.text || `Q${s.index+1}`);
    return `<div style="padding:6px;border-bottom:1px solid #f1f5f9"><div style="font-weight:700">${qtxt}</div><div class="muted">${pct}% correct (${s.correct}/${s.total})</div></div>`;
  }).join('') || `<div class="muted">No question data yet.</div>`;

  // students list HTML
  const studentsHtml = responses.map((r, idx) => {
    const name = escapeHtml(r.studentName || r.studentId || 'Student');
    const sid = escapeHtml(r.studentId || '');
    const cls = escapeHtml(r.classId || r.class || '');
    const score = String(r.score || 0);
    return `<div style="padding:8px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center">
      <div style="min-width:0">
        <div style="font-weight:700">${idx+1}. ${name}</div>
        <div class="muted small">ID: ${sid} • Class: ${cls}</div>
      </div>
      <div style="text-align:right;display:flex;flex-direction:column;gap:6px;align-items:flex-end">
        <div style="font-weight:900">${score}</div>
        <div><button class="btn btn-ghost btn-sm view-resp" data-id="${r.id}">View</button></div>
      </div>
    </div>`;
  }).join('') || `<div class="muted">No responses yet.</div>`;

  const subj = qd.subjectName || ((window.subjectsCache||[]).find(s=>s.id===qd.subjectId)||{}).name || '—';
  const status = qd.active ? '<span style="color:#0ea5e9;font-weight:700">Active</span>' : '<span class="muted">Inactive</span>';
  const html = `
    <div style="max-height:80vh;overflow:auto;padding:10px">
      <div style="margin-bottom:8px">
        <div style="font-weight:900">${escapeHtml(qd.title)}</div>
        <div class="muted small">Quiz ID: ${qd.id} • Class: ${escapeHtml(displayClassList(qd))} • Subject: ${escapeHtml(subj)} • ${status}</div>
      </div>

      <div style="margin-top:12px">
        <div style="font-weight:800">Question summary</div>
        <div style="margin-top:8px">${summaryHtml}</div>
      </div>

      <div style="margin-top:12px">
        <div style="font-weight:800">Student responses (${responses.length})</div>
        <div style="margin-top:8px">${studentsHtml}</div>
      </div>

      <div style="margin-top:12px;text-align:right">
        <button id="qhAddTime" class="btn btn-sm">+ Add time</button>
        <button id="qhClose" class="btn btn-ghost btn-sm">Close</button>
      </div>
    </div>
  `;

  // show as standard modal (replace your existing showModal call) - it will be scrollable and responsive
  showModal(`History — ${escapeHtml(qd.title)}`, html);

  // wire buttons
  document.getElementById('qhClose').onclick = closeModal;
  document.getElementById('qhAddTime').onclick = async () => {
    closeModal();
    // your existing addExtraTime function should update quiz.endAt in Firestore
    await addExtraTime(qd.id);
  };

  // wire view buttons to open stacked (so history modal stays underneath)
  modalBody.querySelectorAll('.view-resp').forEach(b => b.onclick = async (ev) => {
    const rid = ev.currentTarget.dataset.id;
    const rdoc = await getDoc(doc(db,'quiz_responses',rid));
    if(!rdoc.exists()) return toast && toast('Response not found');
    const r = { id: rdoc.id, ...rdoc.data() };
    if(!r.studentName || String(r.studentName).trim()===''){
      const s = (window.studentsCache||[]).find(ss => String(ss.id) === String(r.studentId) || String(ss.studentId) === String(r.studentId) || String(ss.number) === String(r.studentId));
      r.studentName = s ? (s.fullName || s.name || s.studentId || r.studentId) : (r.studentId || 'Student');
    }

    // build answers HTML using question list from qd.questions (fallback if missing)
    const answersHtml = (r.answers || []).map((a,i)=> {
      const q = (qd.questions || [])[i] || {};
      const selectedOriginal = (typeof a.selectedOriginalIndex !== 'undefined' && a.selectedOriginalIndex !== null) ? a.selectedOriginalIndex : (typeof a.selectedIndex !== 'undefined' ? a.selectedIndex : null);
      const correctIdx = q.correctIndex;
      const choiceText = selectedOriginal!==null && q.choices ? escapeHtml(q.choices[selectedOriginal]||'') : '<em>Skipped</em>';
      const correctText = (q.choices && typeof correctIdx!=='undefined') ? escapeHtml(q.choices[correctIdx]||'') : '—';
      const pts = (selectedOriginal === correctIdx) ? (q.points||1) : 0;
      return `<div style="padding:8px;border-bottom:1px solid #f1f5f9"><div style="font-weight:700">${escapeHtml(q.text||`Q${i+1}`)}</div><div class="muted">Selected: ${choiceText} · Correct: ${correctText} · Points: ${pts}</div></div>`;
    }).join('');

    showStackedModal(`${escapeHtml(r.studentName||r.studentId||'Student')} — ${escapeHtml(qd.title)}`, `<div style="font-weight:800">${escapeHtml(r.studentName||r.studentId||'Student')}</div>
       <div class="muted">Score: ${r.score || 0} / ${r.maxScore || 0}</div>
       <div style="margin-top:8px">${answersHtml}</div>`);
  });
}



// openQuizHistoryModal — single column layout (header -> summary -> students list with rank)
async function openQuizHistoryModal(quizId){
  const snap = await getDoc(doc(db,'quizzes',quizId));
  if(!snap.exists()) return toast('Quiz not found');
  const qd = { id: snap.id, ...snap.data() };

  // Try to use precomputed stats first (cheap single doc read)
  let responses = [];
  try {
    const statsSnap = await getDoc(doc(db, 'quiz_stats', quizId)); // <-- precomputed doc (recommended)
    if (statsSnap && statsSnap.exists()) {
      const s = statsSnap.data();
      // assume s.top is an array of small objects: { responseId, studentId, studentName, classId, score, answersSummary? }
      responses = (s.top || []).slice(0, 500).map(r => ({ id: r.responseId || r.id, ...r }));
    }
  } catch(e){
    console.warn('quiz_stats read failed', e);
  }

  // Fallback: fetch a bounded number of top responses directly (use limit to avoid full-collection reads)
  if(!responses || responses.length === 0){
    const TOP_LIMIT = 200; // tune this: lower => cheaper reads
    const respSnap = await getDocs(query(collection(db,'quiz_responses'),
                                          where('quizId','==', quizId),
                                          orderBy('score','desc'),
                                          limit(TOP_LIMIT)));
    responses = respSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // fill missing studentName by looking up studentsCache (cheap local operation)
  responses.forEach(r => {
    if(!r.studentName || String(r.studentName).trim() === ''){
      const s = (studentsCache||[]).find(ss => String(ss.id) === String(r.studentId) || String(ss.studentId) === String(r.studentId) || String(ss.number) === String(r.studentId));
      r.studentName = s ? (s.fullName || s.name || s.studentId || r.studentId) : (r.studentId || 'Student');
    }
  });

  // compute question-level summary — same as your existing logic
  const questions = qd.questions || [];
  const qStats = questions.map((q,i)=>({ index:i, total:0, correct:0 }));
  responses.forEach(r => {
    (r.answers||[]).forEach((a, ai) => {
      qStats[ai] = qStats[ai] || { index: ai, total:0, correct:0 };
      qStats[ai].total++;
      const selectedOriginal = (typeof a.selectedOriginalIndex !== 'undefined' && a.selectedOriginalIndex !== null)
                                ? a.selectedOriginalIndex
                                : (typeof a.selectedIndex !== 'undefined' ? a.selectedIndex : null);
      if(selectedOriginal !== null && selectedOriginal === (questions[ai]?.correctIndex)) qStats[ai].correct++;
    });
  });

  // render summaryHtml / studentsHtml same as before (copy your existing markup using responses array)
  // ... (you can reuse your existing rendering code that maps qStats and responses)
  // ensure you still use bounded responses.length (<= TOP_LIMIT) so modal stays fast and cheap.
  // For full response view ("View" button) you can still fetch a single response with getDoc(doc(db,'quiz_responses',rid)) — that's a single doc read and fine.

  // rest of your UI logic follows exactly as before (buttons wired to view single response, add time, close, etc.)


  const summaryHtml = qStats.map(s => {
    const pct = s.total ? Math.round((s.correct/s.total)*100) : 0;
    const qtxt = escapeHtml(questions[s.index]?.text || `Q${s.index+1}`);
    return `<div style="padding:6px;border-bottom:1px solid #f1f5f9"><div style="font-weight:700">${qtxt}</div><div class="muted">${pct}% correct (${s.correct}/${s.total})</div></div>`;
  }).join('') || `<div class="muted">No question data yet.</div>`;

  // students list (rank, name, id, class, score, view)
  const studentsHtml = responses.map((r, idx) => {
    const name = escapeHtml(r.studentName || r.studentId || 'Student');
    const sid = escapeHtml(r.studentId || '');
    const cls = escapeHtml(r.classId || r.class || '');
    const score = String(r.score || 0);
    return `<div style="padding:8px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center">
      <div style="min-width:0">
        <div style="font-weight:700">${idx+1}. ${name}</div>
        <div class="muted small">ID: ${sid} • Class: ${cls}</div>
      </div>
      <div style="text-align:right;display:flex;flex-direction:column;gap:6px;align-items:flex-end">
        <div style="font-weight:900">${score}</div>
        <div><button class="btn btn-ghost btn-sm view-resp" data-id="${r.id}">View</button></div>
      </div>
    </div>`;
  }).join('') || `<div class="muted">No responses yet.</div>`;

  const subj = qd.subjectName || (subjectsCache.find(s=>s.id===qd.subjectId)||{}).name || '—';
  const status = qd.active ? '<span style="color:#0ea5e9;font-weight:700">Active</span>' : '<span class="muted">Inactive</span>';
  const html = `
    <div style="max-height:80vh;overflow:auto;padding:10px">
      <div style="margin-bottom:8px">
        <div style="font-weight:900">${escapeHtml(qd.title)}</div>
        <div class="muted small">Quiz ID: ${qd.id} • Class: ${displayClassList(qd)} • Subject: ${escapeHtml(subj)} • ${status}</div>
      </div>

      <div style="margin-top:12px">
        <div style="font-weight:800">Question summary</div>
        <div style="margin-top:8px">${summaryHtml}</div>
      </div>

      <div style="margin-top:12px">
        <div style="font-weight:800">Student responses (${responses.length})</div>
        <div style="margin-top:8px">${studentsHtml}</div>
      </div>

      <div style="margin-top:12px;text-align:right">
        <button id="qhAddTime" class="btn btn-sm">+ Add time</button>
        <button id="qhClose" class="btn btn-ghost btn-sm">Close</button>
      </div>
    </div>
  `;

  showModal(`History — ${escapeHtml(qd.title)}`, html);

  document.getElementById('qhClose').onclick = closeModal;
  document.getElementById('qhAddTime').onclick = async () => {
    closeModal();
    await addExtraTime(qd.id);
  };

  // wire view buttons
  modalBody.querySelectorAll('.view-resp').forEach(b => b.onclick = async (ev) => {
    const rid = ev.currentTarget.dataset.id;
    const rdoc = await getDoc(doc(db,'quiz_responses',rid));
    if(!rdoc.exists()) return toast('Response not found');
    const r = { id: rdoc.id, ...rdoc.data() };
    // ensure name present
    if(!r.studentName || String(r.studentName).trim()===''){
      const s = (studentsCache||[]).find(ss => String(ss.id) === String(r.studentId) || String(ss.studentId) === String(r.studentId) || String(ss.number) === String(r.studentId));
      r.studentName = s ? (s.fullName || s.name || s.studentId || r.studentId) : (r.studentId || 'Student');
    }

    const answersHtml = (r.answers || []).map((a,i)=> {
      const q = questions[i] || {};
      const selOriginal = (typeof a.selectedOriginalIndex !== 'undefined' && a.selectedOriginalIndex !== null) ? a.selectedOriginalIndex : (typeof a.selectedIndex !== 'undefined' ? a.selectedIndex : null);
      const correctIdx = q.correctIndex;
      const choiceText = selOriginal!==null && q.choices ? escapeHtml(q.choices[selOriginal]||'') : '<em>Skipped</em>';
      const correctText = (q.choices && typeof correctIdx!=='undefined') ? escapeHtml(q.choices[correctIdx]||'') : '—';
      const pts = (selOriginal === correctIdx) ? (q.points||1) : 0;
      return `<div style="padding:8px;border-bottom:1px solid #f1f5f9"><div style="font-weight:700">${escapeHtml(q.text||`Q${i+1}`)}</div><div class="muted">Selected: ${choiceText} · Correct: ${correctText} · Points: ${pts}</div></div>`;
    }).join('');

    showModal(`${escapeHtml(r.studentName||r.studentId||'Student')} — ${escapeHtml(qd.title)}`,
      `<div style="font-weight:800">${escapeHtml(r.studentName||r.studentId||'Student')}</div>
       <div class="muted">Score: ${r.score || 0} / ${r.maxScore || 0}</div>
       <div style="margin-top:8px">${answersHtml}</div>`
    );
  });
}



async function addExtraTime(quizId){
  const minutes = Number(prompt('Add how many minutes to this quiz? (enter integer minutes)', '5'));
  if(!minutes || isNaN(minutes) || minutes <= 0) return toast('Cancelled or invalid minutes');
  try {
    const snap = await getDoc(doc(db,'quizzes', quizId));
    if(!snap.exists()) return toast('Quiz not found');
    const q = snap.data();
    // compute existing endMs
    const toMs = (ts) => {
      if(!ts) return null;
      if(typeof ts === 'number') return Number(ts);
      if(ts.seconds) return Number(ts.seconds) * 1000;
      const p = Date.parse(ts); return isNaN(p) ? null : p;
    };
    const startMs = toMs(q.startAt) || toMs(q.createdAt) || Date.now();
    const endMsExplicit = toMs(q.endAt) || null;
    const durationMs = (Number(q.durationMinutes) || 0) * 60 * 1000;
    const endMsComputed = startMs ? startMs + durationMs : (Date.now() + durationMs);
    const currentEnd = endMsExplicit || endMsComputed || Date.now();
    const newEnd = currentEnd + minutes * 60 * 1000;
    // update endAt (use Timestamp.fromMillis)
    await updateDoc(doc(db,'quizzes', quizId), { endAt: Timestamp.fromMillis ? Timestamp.fromMillis(newEnd) : newEnd, updatedAt: Timestamp.now() });
    toast(`Added ${minutes} minutes`);
    await renderTeacherQuizzesPage();
  } catch(e){ console.error('addExtraTime failed', e); toast('Failed to add time'); }
}

// ensure admin "New Quiz" button works
if(btnNewQuizAdmin) btnNewQuizAdmin.onclick = (e) => { e.preventDefault(); openCreateQuizModalAdmin({}); };



/*
 * Helper: fetch deleted docs from a collection.
 * Accepts collectionName and returns array of { id, collection, data, deletedAt }
 */
async function fetchDeletedFromCollection(collectionName){
  try {
    // Preferred: query the recycle_bin index for that collection (cheap)
    const idxQuery = query(collection(db, 'recycle_bin'), where('collection','==', collectionName), orderBy('deletedAt','desc'), limit(500));
    const idxSnap = await getDocs(idxQuery);
    if(idxSnap && idxSnap.size){
      return idxSnap.docs.map(d => {
        const data = d.data();
        return {
          id: data.docId || data.id,
          collection: collectionName,
          data: data.doc || {},
          deletedAt: data.deletedAt || null,
          deletedBy: data.deletedBy || null,
          recycleMetaId: d.id
        };
      });
    }

    // Fallback: query the actual collection but ONLY items flagged deleted and LIMIT results
    // NOTE: Firestore doesn't allow OR across fields easily; try the most common flag names one-by-one
    const candidates = [
      query(collection(db, collectionName), where('is_deleted','==', true), orderBy('deletedAt','desc'), limit(500)),
      query(collection(db, collectionName), where('deleted','==', true), orderBy('deletedAt','desc'), limit(500)),
      query(collection(db, collectionName), where('status','==','deleted'), orderBy('deletedAt','desc'), limit(500))
    ];
    for(const q of candidates){
      try {
        const snap = await getDocs(q);
        if(snap && snap.size) {
          return snap.docs.map(d => ({ id: d.id, collection: collectionName, data: d.data(), deletedAt: d.data().deletedAt || null }));
        }
      } catch(e) {
        // ignore and try next candidate
      }
    }

    // last fallback: empty result (do not scan whole collection)
    return [];
  } catch(err) {
    console.warn('fetchDeletedFromCollection failed', collectionName, err);
    return [];
  }
}


/**
 * Fetch all deleted items across configured collections.
 * collectionsToCheck can be subset (filter by type)
 */
async function fetchAllDeleted(collectionsToCheck){
  // If recycle_bin exists, fetch from it once
  try {
    let q = collection(db, 'recycle_bin');
    if(Array.isArray(collectionsToCheck) && collectionsToCheck.length){
      // we will fetch per-collection to avoid scanning unrelated rows or use a single small query
      const promises = collectionsToCheck.map(cname =>
        getDocs(query(collection(db,'recycle_bin'), where('collection','==', cname), orderBy('deletedAt','desc'), limit(1000)))
      );
      const res = await Promise.all(promises);
      const flat = res.flatMap(snap => snap.docs.map(d => ({ id: d.id, collection: d.data().collection, data: d.data().doc || {}, deletedAt: d.data().deletedAt || null, deletedBy: d.data().deletedBy || null })));
      return flat;
    } else {
      // fetch all entries in recycle_bin (bounded)
      const snap = await getDocs(query(collection(db,'recycle_bin'), orderBy('deletedAt','desc'), limit(2000)));
      return snap.docs.map(d => ({ id: d.id, collection: d.data().collection, data: d.data().doc || {}, deletedAt: d.data().deletedAt || null, deletedBy: d.data().deletedBy || null }));
    }
  } catch(e){
    // fallback: run per-collection fetchDeletedFromCollection (which uses limited queries)
    const collections = collectionsToCheck || ['students','teachers','classes','subjects','exams','quizzes','staff','expense','transactions','users','announcements'];
    const promises = collections.map(c => fetchDeletedFromCollection(c));
    const results = await Promise.all(promises);
    return results.flat();
  }
}


// index.js (Cloud Functions)
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.onSoftDeleteCreateRecycle = functions.firestore.document('{coll}/{docId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const coll = context.params.coll;
    const id = context.params.docId;

    const becameDeleted = (!before.is_deleted && after.is_deleted) || (!before.deleted && after.deleted);
    const restored = ((before.is_deleted || before.deleted) && !(after.is_deleted || after.deleted));

    const rbRef = admin.firestore().collection('recycle_bin').doc(`${coll}__${id}`);

    if(becameDeleted){
      await rbRef.set({
        collection: coll,
        docId: id,
        deletedAt: after.deletedAt || admin.firestore.FieldValue.serverTimestamp(),
        deletedBy: after.deletedBy || after.deleted_by || null,
        doc: after
      }, { merge: true });
    } else if(restored) {
      await rbRef.delete().catch(()=>{});
    }
  });

/**
 * Render Recycle Bin list
 */
async function renderRecycleBin(){
  if(!pageRecycle) return;
  showPage('recycle');

  const type = recycleTypeFilter ? recycleTypeFilter.value : 'all';
  const q = (recycleSearch && recycleSearch.value || '').trim().toLowerCase();
  const from = recycleDateFrom && recycleDateFrom.value ? new Date(recycleDateFrom.value) : null;
  const to = recycleDateTo && recycleDateTo.value ? new Date(recycleDateTo.value) : null;

  const collectionsToCheck = (type && type !== 'all') ? [type] : undefined;
  const allDeleted = await fetchAllDeleted(collectionsToCheck);

  const filtered = allDeleted.filter(it => {
    if(q){
      const hay = `${it.title} ${it.details} ${it.id} ${it.collection}`.toLowerCase();
      if(!hay.includes(q)) return false;
    }
    if(from && it.deletedAt){
      if(it.deletedAt < from) return false;
    }
    if(to && it.deletedAt){
      const toEnd = new Date(to); toEnd.setHours(23,59,59,999);
      if(it.deletedAt > toEnd) return false;
    }
    return true;
  });

  // counts by type
  const counts = {};
  allDeleted.forEach(it => counts[it.collection] = (counts[it.collection] || 0) + 1);
  const total = filtered.length;
  if(recycleCounts) {
    const parts = [`Total deleted: ${total}`];
    for(const k of ['students','teachers','classes','subjects','exams','quizzes','staff','transactions','users','announcements']){
      if(counts[k]) parts.push(`${k}: ${counts[k]}`);
    }
    // mobile wrap: use <br> for small widths
    if(window.innerWidth && window.innerWidth < 720) {
      recycleCounts.innerHTML = parts.join('<br>');
    } else {
      recycleCounts.textContent = parts.join(' • ');
    }
  }

  // render table (desktop)
  if(recycleTbody){
    recycleTbody.innerHTML = '';
    filtered.forEach((it, idx) => {
      const deletedAtStr = it.deletedAt ? (new Date(it.deletedAt)).toLocaleString() : '—';
      // compute display name (sync or cached)
      const deletedByUid = it.deletedBy || it.raw && (it.raw.deletedBy || it.raw.deleted_by) || '';
      const deletedByCached = getCachedUserDisplayName(deletedByUid) || '';
      // We'll show cached name first; if it's still the UID we'll launch an async fetch to replace
      const deletedByHtml = deletedByCached ? escapeHtml(deletedByCached) : `<span class="recycled-by-pending" data-uid="${escapeHtml(deletedByUid)}">${escapeHtml(String(deletedByUid||''))}</span>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:8px;vertical-align:middle">${idx+1}</td>
        <td style="padding:8px;vertical-align:middle"><span class="recycle-type-pill">${escapeHtml(it.collection)}</span></td>
        <td style="padding:8px;vertical-align:middle">${escapeHtml(it.title)}</td>
        <td style="padding:8px;vertical-align:middle">${escapeHtml(it.details)}</td>
        <td style="padding:8px;vertical-align:middle">${escapeHtml(deletedAtStr)}<div class="recycled-meta">${deletedByHtml ? 'by '+deletedByHtml : ''}</div></td>
        <td style="padding:8px;vertical-align:middle" class="recycle-actions">
          <button class="btn btn-ghost btn-sm recycle-restore" data-idx="${idx}">Restore</button>
          <button class="btn btn-danger btn-sm recycle-delete" data-idx="${idx}" ${!isSuperAdminUserAsync() ? 'disabled' : ''}>Delete Permanently</button>
        </td>`;
      recycleTbody.appendChild(tr);
    });

    // wire buttons
    recycleTbody.querySelectorAll('.recycle-restore').forEach(b=>{
      b.onclick = async (ev) => {
        const idx = ev.currentTarget.dataset.idx;
        const item = filtered[idx];
        if(!item) return;
        await restoreItem(item);
        await renderRecycleBin();
      };
    });
    recycleTbody.querySelectorAll('.recycle-delete').forEach(b=>{
      b.onclick = async (ev) => {
        if(!isSuperAdminUserAsync()) { toast('Only superadmin can permanently delete'); return; }
        const idx = ev.currentTarget.dataset.idx;
        const item = filtered[idx];
        if(!item) return;
        if(!confirm('Delete permanently? This cannot be undone.')) return;
        await permanentlyDeleteItem(item);
        await renderRecycleBin();
      };
    });
  }

  // mobile cards
  if(recycleCardList){
    recycleCardList.innerHTML = '';
    filtered.forEach((it, idx) => {
      const deletedAtStr = it.deletedAt ? (new Date(it.deletedAt)).toLocaleString() : '—';
      const deletedByUid = it.deletedBy || it.raw && (it.raw.deletedBy || it.raw.deleted_by) || '';
      const deletedByCached = getCachedUserDisplayName(deletedByUid) || '';
      const deletedByHtml = deletedByCached ? escapeHtml(deletedByCached) : `<span class="recycled-by-pending" data-uid="${escapeHtml(deletedByUid)}">${escapeHtml(String(deletedByUid||''))}</span>`;

      const card = document.createElement('div');
      card.className = 'user-card';
      card.style.display = 'flex';
      card.style.justifyContent = 'space-between';
      card.style.alignItems = 'center';
      card.style.padding = '10px';
      card.innerHTML = `
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(it.title)}</div>
          <div style="font-size:13px;color:#6b7280">${escapeHtml(it.collection)} • ${escapeHtml(it.details)}</div>
          <div style="font-size:12px;color:#94a3b8">${escapeHtml(deletedAtStr)} ${deletedByHtml ? ' • by '+deletedByHtml : ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-left:12px">
          <button class="btn btn-ghost btn-sm recycle-restore" data-idx="${idx}">Restore</button>
          <button class="btn btn-danger btn-sm recycle-delete" data-idx="${idx}" ${!isSuperAdminUserAsync ? 'disabled' : ''}>Delete</button>
        </div>
      `;
      recycleCardList.appendChild(card);
    });

    recycleCardList.querySelectorAll('.recycle-restore').forEach(b=>{
      b.onclick = async (ev) => { const idx=ev.currentTarget.dataset.idx; const item=filtered[idx]; if(item){ await restoreItem(item); await renderRecycleBin(); } };
    });
    recycleCardList.querySelectorAll('.recycle-delete').forEach(b=>{
      b.onclick = async (ev) => { if(!isSuperAdminUserAsync()){ toast('Only superadmin'); return; } const idx=ev.currentTarget.dataset.idx; const item=filtered[idx]; if(item && confirm('Delete permanently?')){ await permanentlyDeleteItem(item); await renderRecycleBin(); } };
    });
  }

  // --- Async: try to resolve any pending 'recycled-by-pending' spans to friendly names ---
  (async function resolvePendingDeletedBy(){
    // gather unique UIDs from DOM
    const pendingEls = Array.from(document.querySelectorAll('.recycled-by-pending[data-uid]'));
    const uids = [...new Set(pendingEls.map(el => el.dataset.uid).filter(x=>x))];
    for(const uid of uids){
      try{
        const name = await fetchAndCacheUserDisplayName(uid) || getCachedUserDisplayName(uid) || uid;
        // replace all elements
        document.querySelectorAll(`.recycled-by-pending[data-uid="${CSS.escape(uid)}"]`).forEach(el => {
          el.textContent = name;
        });
      }catch(e){ /* continue */ }
    }
  })();
}




/** Restore an item object from fetchAllDeleted() */
async function restoreItem(item){
  try{
    const { collection: collName, id, raw } = item;
    const ref = doc(db, collName, id);
    if(collName === 'students'){
      await updateDoc(ref, { status: 'active', deleted: false, deletedAt: null, deletedBy: null, updatedAt: Timestamp.now() });
    } else if(collName === 'transactions'){
      await updateDoc(ref, { is_deleted: false, deleted_by: null, deleted_at: null });
    } else if(collName === 'quizzes'){
      await updateDoc(ref, { deleted: false, is_deleted: false, deletedAt: null, deleted_by: null, deletedBy: null, updatedAt: Timestamp.now() });
    } else {
      await updateDoc(ref, { deleted: false, deletedAt: null, deletedBy: null, deleted_at: null, deleted_by: null, updatedAt: Timestamp.now() });
    }
    toast('Restored' , 'success');
  }catch(err){
    console.error('restoreItem failed', err);
    toast('Failed to restore', 'error', 3000);
  }
}


/** Permanently delete a record (only for superadmin) */
async function permanentlyDeleteItem(item){
  try{
    const { collection: collName, id } = item;
    await deleteDoc(doc(db, collName, id));
    toast('Deleted permanently', 'warning');
  }catch(err){
    console.error('permanentlyDeleteItem failed', err);
    toast('Failed to delete permanently', 'error', 3000);
  }
}

/** Bulk restore visible items (applies current filters) */
async function bulkRestore(){
  if(!confirm('Restore all visible deleted items?')) return;
  // fetch current filtered list same as renderRecycleBin
  const type = recycleTypeFilter ? recycleTypeFilter.value : 'all';
  const collectionsToCheck = (type && type !== 'all') ? [type] : undefined;
  const items = await fetchAllDeleted(collectionsToCheck);

  const q = (recycleSearch && recycleSearch.value || '').trim().toLowerCase();
  const from = recycleDateFrom && recycleDateFrom.value ? new Date(recycleDateFrom.value) : null;
  const to = recycleDateTo && recycleDateTo.value ? new Date(recycleDateTo.value) : null;

  const filtered = items.filter(it=>{
    if(q){
      const hay = `${it.title} ${it.details} ${it.id} ${it.collection}`.toLowerCase();
      if(!hay.includes(q)) return false;
    }
    if(from && it.deletedAt && it.deletedAt < from) return false;
    if(to && it.deletedAt){
      const toEnd = new Date(to); toEnd.setHours(23,59,59,999);
      if(it.deletedAt > toEnd) return false;
    }
    return true;
  });

  for(const it of filtered){
    await restoreItem(it);
  }
  toast('Restored all visible items', 'info');
  await renderRecycleBin();
}

/** Bulk delete visible items (only superadmin) */
async function bulkDeleteAll(){
  if(!isSuperAdminUserAsync()){
    toast('Only superadmin can delete permanently', 'warning');
    return;
  }
  if(!confirm('Permanently delete ALL visible items? This cannot be undone.')) return;

  const type = recycleTypeFilter ? recycleTypeFilter.value : 'all';
  const collectionsToCheck = (type && type !== 'all') ? [type] : undefined;
  const items = await fetchAllDeleted(collectionsToCheck);

  const q = (recycleSearch && recycleSearch.value || '').trim().toLowerCase();
  const from = recycleDateFrom && recycleDateFrom.value ? new Date(recycleDateFrom.value) : null;
  const to = recycleDateTo && recycleDateTo.value ? new Date(recycleDateTo.value) : null;

  const filtered = items.filter(it=>{
    if(q){
      const hay = `${it.title} ${it.details} ${it.id} ${it.collection}`.toLowerCase();
      if(!hay.includes(q)) return false;
    }
    if(from && it.deletedAt && it.deletedAt < from) return false;
    if(to && it.deletedAt){
      const toEnd = new Date(to); toEnd.setHours(23,59,59,999);
      if(it.deletedAt > toEnd) return false;
    }
    return true;
  });

  for(const it of filtered){
    await permanentlyDeleteItem(it);
  }
  toast('Deleted permanently all visible items' , 'warning');
  await renderRecycleBin();
}

/* ----------------------------
  ANNOUNCEMENTS: admin functions 
------------------------------*/
/* ====== Admin announcements (drop-in replacement) ======
   Requires existing imports already present:
   getDocs, getDoc, addDoc, updateDoc, deleteDoc, setDoc, doc, collection, query, where, orderBy, limit, Timestamp
   Also uses: toast(), escapeHtml(), currentUser, classesCache, examsCache, studentsCache, db
*/
const ANNOUNCEMENTS_COLL = 'announcements';
const ANNOUNCE_LOG_COLL = 'announcements_log';
const ANNOUNCEMENT_TEMPLATES_COLL = 'announcement_templates';
const ADMIN_QUOTA_COLL = 'admin_quota';
const ANNOUNCEMENTS_SETTINGS_DOC = doc(db, 'settings', 'announcements');

let _cachedTemplates = null;
let _cachedAnnouncements = null;
let _annRenderLock = false;

/* ---------- built-in templates (unchanged) ---------- */
function builtInTemplates(){
  return [
    { key: 'monthly_payment_default', title: 'Monthly Fee — {month}', body: '{student_name}, please pay the monthly fee{monthly_amount} for {month} before the 5th. Your balance: {balance}', type: 'monthly_payment', audience: ['students'], allowMonthly: true },
    { key: 'exam_announce', title: 'EXAM NOTICE — {exam}', body: 'OGEYSIIS: Imtixaanka {exam} waxaa uu bilaaban doonaa on {date}. Good luck!', type: 'exam', audience: ['students'] },
    { key: 'top10_school', title: 'Top 10 — {exam}', body: '10ka arday ee ugu sareysa imtixaanka {exam}:\n1) {rank1}\n2) {rank2}\n3) {rank3}\n... up to 10', type: 'top10', audience: ['students'] },
    { key: 'holiday_notice', title: 'School Holiday', body: 'Fasax: School will be closed on {date}. Enjoy the break!', type: 'holiday', audience: ['all'] },    
    { key: 'urgent_alert', title: 'Urgent Notice', body: 'URGENT: {message} — please contact the school immediately.', type: 'urgent', audience: ['all'] },
    { key: 'fee_reminder', title: 'Fee Reminder', body: '{student_name}, your school fees are overdue. Please settle before {due_date}.', type: 'general', audience: ['students'] },
    { key: 'exam_published', title: 'Exam Results Published', body: 'Results for {exam} are published. Check your student portal for details.', type: 'exam', audience: ['students'] },
    { key: 'attendance_warn', title: 'Attendance Notice', body: '{student_name}, your attendance is low. Please meet the class teacher.', type: 'general', audience: ['students'] },
    { key: 'competition', title: 'Competition Update', body: 'Competition scores updated: check the Leaderboard for the latest rankings.', type: 'general', audience: ['all'] },
    { key: 'payment_received', title: 'Payment Confirmed', body: 'Payment of {amount} received. Thank you — Finance Office.', type: 'general', audience: ['students'] },
    { key: 'parent_meeting', title: 'Parent Meeting', body: 'Parents meeting on {date} at {time}. Attendance is mandatory.', type: 'general', audience: ['all'] },
    { key: 'system_maintenance', title: 'System Maintenance', body: 'Portal maintenance planned on {date}. Some services may be unavailable.', type: 'general', audience: ['all'] },
    { key: 'exam_tips', title: 'Exam Tips', body: 'Exam tips for {exam}: revise past papers, sleep well, and arrive early.', type: 'general', audience: ['students'] },
    { key: 'library', title: 'Library Update', body: 'New books added to the library. Visit to borrow your copy.', type: 'general', audience: ['students'] },
    { key: 'covid_notice', title: 'Health Notice', body: 'Health advisory: please follow hygiene guidelines and report any symptoms.', type: 'general', audience: ['all'] }
  ];
}

/* ---------- settings helpers ---------- */
async function getAnnouncementsSettings(){
  try {
    const s = await getDoc(ANNOUNCEMENTS_SETTINGS_DOC);
    if(!s.exists()) return { monthlyEnabled: false, excludedMonths: [], dailyLimit: 100 };
    const data = s.data();
    data.dailyLimit = 10; // always enforced
    return data;
  } catch(e){ console.warn(e); return { monthlyEnabled:false, excludedMonths: [], dailyLimit:10 }; }
}

async function saveAnnouncementsSettings(settings){
  try {
    const safe = { monthlyEnabled: !!settings.monthlyEnabled, excludedMonths: Array.isArray(settings.excludedMonths) ? settings.excludedMonths : [], dailyLimit: 10 };
    await setDoc(ANNOUNCEMENTS_SETTINGS_DOC, safe, { merge:true });
    toast('Settings saved', 'success');
    return true;
  } catch(e){ console.error(e); toast('Failed to save settings' , 'error', 3000); return false; }
}

async function ensureMonthlyAnnouncementIfNeeded(){
  try {
    const settings = await getAnnouncementsSettings();
    if(!settings.monthlyEnabled) return;

    const now = new Date();
    const month = now.getMonth() + 1; // 1..12
    const year = now.getFullYear();
    const monthKey = `${String(month).padStart(2,'0')}-${year}`; // e.g. "01-2026"

    if(Array.isArray(settings.excludedMonths) && settings.excludedMonths.includes(month)) return;
    if(now.getDate() !== 1) return; // only auto-create on the 1st

    const snap = await getDocs(query(collection(db, ANNOUNCEMENTS_COLL)));
    const exists = snap.docs.some(d => {
      const data = d.data();
      return data && data.type === 'monthly_payment' && data.monthYear === monthKey;
    });
    if(exists) return;

    const defaultTitle = `Monthly Fee — ${getMonthName(month)} ${year}`;
    const defaultBody = `{student_name},\n\nPlease pay the monthly fee for ${getMonthName(month)} ${year} before 05-${String(month).padStart(2,'0')}-${year}. Your outstanding balance is: {balance}.\n\nThank you.`;

    await createAnnouncementDoc({
      title: defaultTitle,
      body: defaultBody,
      type: 'monthly_payment',
      audience: ['students'],
      allowMonthly: true,
      monthYear: monthKey,
      meta: { autoCreated: true }
    }, { autoCreated: true });

    console.log('Auto-created monthly payment announcement', monthKey);
  } catch(err){
    console.warn('ensureMonthlyAnnouncementIfNeeded error', err);
  }
}



// Robust fetchTop10Results for admin (tries multiple collections and falls back to client-side sort)
async function fetchTop10Results(examId) {
  if (!examId) return [];

  const attemptServerQuery = async (collName, useOrder) => {
    try {
      if (useOrder) {
        // this may require an index (catch below)
        const q = query(collection(db, collName), where('examId', '==', examId), orderBy('total', 'desc'), limit(10));
        const snap = await getDocs(q);
        return snap && snap.docs ? snap.docs : [];
      } else {
        // query without orderBy, we'll sort client-side
        const q = query(collection(db, collName), where('examId', '==', examId));
        const snap = await getDocs(q);
        return snap && snap.docs ? snap.docs : [];
      }
    } catch (err) {
      // pass error up to caller
      throw { err, collName, useOrder };
    }
  };

  try {
    // Try the most likely collection names & strategies in order:
    // 1) 'exam_results' server-side ordered (fastest if index exists)
    // 2) fallback to 'results' server-side ordered
    // 3) fallback to non-ordered queries + client-side sort for 'exam_results' or 'results'
    const preferred = ['exam_results', 'results', 'examResults', 'results_v1'];
    // first try server-side ordered queries (may throw index error)
    for (const name of preferred) {
      try {
        const docs = await attemptServerQuery(name, true);
        if (docs && docs.length) return docs.slice(0, 10);
      } catch (info) {
        // If it's an index-required error, remember and fall back later.
        // Otherwise, ignore and continue to next collection name.
        // We'll handle fallback after trying preferred names.
        // console.warn('server-ordered attempt failed', info);
      }
    }

    // If we reach here, server-side ordered queries likely failed or returned no rows.
    // Try non-ordered queries on those collections and sort client-side.
    for (const name of preferred) {
      try {
        const docs = await attemptServerQuery(name, false);
        if (docs && docs.length) {
          // sort client-side by numeric total (desc). documents may not have total -> treat as -Infinity
          docs.sort((a, b) => {
            const A = a.data ? a.data() : {};
            const B = b.data ? b.data() : {};
            const at = (typeof A.total !== 'undefined' && A.total !== null) ? Number(A.total) : -Infinity;
            const bt = (typeof B.total !== 'undefined' && B.total !== null) ? Number(B.total) : -Infinity;
            return bt - at;
          });
          return docs.slice(0, 10);
        }
      } catch (e) {
        // ignore and try next name
      }
    }

    // Last fallback: try 'examTotals' aggregation collection (different shape but common)
    try {
      const snapTotals = await getDocs(query(collection(db, 'examTotals'), where('examId', '==', examId)));
      if (snapTotals && snapTotals.size) {
        const docs = snapTotals.docs.slice();
        docs.sort((a, b) => {
          const A = a.data(), B = b.data();
          const aVal = (typeof A.total !== 'undefined' && A.total !== null) ? Number(A.total)
                     : (typeof A.average !== 'undefined' ? Number(A.average) : -Infinity);
          const bVal = (typeof B.total !== 'undefined' && B.total !== null) ? Number(B.total)
                     : (typeof B.average !== 'undefined' ? Number(B.average) : -Infinity);
          return bVal - aVal;
        });
        return docs.slice(0, 10);
      }
    } catch (e) {
      // ignore
    }

    return [];
  } catch (err) {
    console.warn('fetchTop10Results unexpected error', err);
    return [];
  }
}

/* ---------- templates helpers ---------- */
async function getAnnouncementTemplates(){
  try {
    if(_cachedTemplates) return _cachedTemplates;
    const snap = await getDocs(collection(db, ANNOUNCEMENT_TEMPLATES_COLL));
    const docs = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    _cachedTemplates = docs.length ? docs : builtInTemplates().map((t,i)=>({ id:`builtin_${i}`, builtin:true, ...t }));
    return _cachedTemplates;
  } catch(e){ console.warn(e); _cachedTemplates = builtInTemplates().map((t,i)=>({ id:`builtin_${i}`, builtin:true, ...t })); return _cachedTemplates; }
}

async function saveTemplate(template){
  try {
    const ref = await addDoc(collection(db, ANNOUNCEMENT_TEMPLATES_COLL), { ...template, createdBy: currentUser ? (currentUser.uid||currentUser.email) : 'unknown', createdAt: Timestamp.now() });
    _cachedTemplates = null;
    toast('Template saved', 'success');
    return ref.id;
  } catch(e){ console.error(e); toast('Failed to save template', 'error', 3000); throw e; }
}

async function deleteTemplate(id){
  try { await deleteDoc(doc(db, ANNOUNCEMENT_TEMPLATES_COLL, id)); _cachedTemplates = null; toast('Template deleted', 'warning'); return true; }
  catch(e){ console.error(e); toast('Failed to delete template', 'error', 3000); throw e; }
}

/* ---------- admin quota and create announcement ---------- */
async function getAdminQuotaCountForToday(adminId){
  try {
    const todayKey = (new Date()).toISOString().slice(0,10);
    const qId = `${adminId}_${todayKey}`;
    const qDoc = await getDoc(doc(db, ADMIN_QUOTA_COLL, qId));
    if(!qDoc.exists()) return 0;
    return qDoc.data().count || 0;
  } catch(e){ console.warn(e); return 0; }
}

async function createAnnouncementDoc(announcement, opts={}) {
  const adminId = currentUser ? (currentUser.uid || currentUser.email) : 'unknown';
  const todayKey = (new Date()).toISOString().slice(0,10);
  const quotaId = `${adminId}_${todayKey}`;
  const quotaRef = doc(db, ADMIN_QUOTA_COLL, quotaId);
  try {
    const settings = await getAnnouncementsSettings();
    const dailyLimit = settings.dailyLimit || 10;
    const qDoc = await getDoc(quotaRef);
    let count = 0; if(qDoc.exists()) count = qDoc.data().count || 0;
    if(!opts.autoCreated && count >= dailyLimit) throw new Error(`Daily send limit reached (${dailyLimit}).`);
    const annRef = await addDoc(collection(db, ANNOUNCEMENTS_COLL), { ...announcement, createdBy: announcement.createdBy || adminId, createdAt: Timestamp.now() });
    if(!opts.autoCreated) await setDoc(quotaRef, { count: count+1, lastUpdated: Timestamp.now(), adminId }, { merge:true });
    await addDoc(collection(db, ANNOUNCE_LOG_COLL), { announcementId: annRef.id, createdBy: adminId, createdAt: Timestamp.now(), auto: !!opts.autoCreated, meta: announcement.meta || null });
    _cachedAnnouncements = null;
    return annRef;
  } catch(e){ console.error(e); throw e; }
}

/* ---------- Composer modal (improved, templates + save-as-template) ---------- */
function openComposeAnnouncementModal(pref = {}) {
  getAnnouncementTemplates().then(async templates => {
    const classOptions = (classesCache||[]).map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
    const templateOptions = (templates||[]).map(t => `<option value="${escapeHtml(t.id||t.key)}">${escapeHtml(t.title||t.key||'(template)')}</option>`).join('');
    const examOptions = (examsCache||[]).map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.name||e.title||e.id)}</option>`).join('');
    const adminId = currentUser ? (currentUser.uid || currentUser.email) : 'unknown';
    const used = await getAdminQuotaCountForToday(adminId);
    const remaining = Math.max(0, 10 - (Number(used) || 0));

    // default for annAllowMonthly: false unless pref.allowMonthly
    const annAllowMonthlyChecked = pref.allowMonthly ? 'checked' : '';

    const html = `
      <div style="min-width:320px;max-width:820px;display:flex;flex-direction:column;gap:10px;padding:10px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:800">Compose Announcement</div>
          <div class="muted small">Remaining today: <strong id="composeQuotaRem">${remaining}</strong></div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <select id="annTemplateSelect" class="input" style="min-width:220px">
            <option value="">— Select template —</option>
            ${templateOptions}
          </select>
          <button id="annLoadTemplate" class="btn">Load</button>
          <button id="openTemplatesFromCompose" class="btn btn-ghost" title="Manage Templates" style="margin-left:auto">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" stroke="currentColor" stroke-width="1.2"/><rect x="14" y="3" width="7" height="7" stroke="currentColor" stroke-width="1.2"/><rect x="3" y="14" width="7" height="7" stroke="currentColor" stroke-width="1.2"/></svg>
            <span style="margin-left:6px">Templates</span>
          </button>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <label style="flex:1">Type
            <select id="annType" class="input">
              <option value="general">General</option>
              <option value="monthly_payment">Monthly Payment</option>
              <option value="exam">Exam</option>
              <option value="top10">Top10 (Exam)</option>
              <option value="holiday">Holiday</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>

          <label style="flex:1">Audience
            <select id="annAudience" class="input">
              <option value="students" selected>Students</option>
              <option value="teachers">Teachers</option>
              <option value="all">All</option>
              <option value="specific_class">Specific class</option>
              <option value="specific_student">Specific student</option>
            </select>
          </label>
        </div>

        <div id="annExamRow" style="display:none">
          <label>Exam
            <select id="annExamSelect" class="input">
              <option value="">— Select exam —</option>
              ${examOptions}
            </select>
          </label>
        </div>

        <div id="annClassRow" style="display:none">
          <label>Select class
            <select id="annClassSelect" class="input">
              <option value="">-- choose class --</option>
              ${classOptions}
            </select>
          </label>
        </div>

        <div id="annStudentRow" style="display:none">
          <label>Student ID
            <input id="annStudentId" class="input" placeholder="STD042687284" />
          </label>
        </div>

        <label>Title <input id="annTitle" class="input" value="${escapeHtml(pref.title||'')}" maxlength="200" /></label>
        <label>Body <textarea id="annBody" rows="7" class="input" maxlength="4000">${escapeHtml(pref.body||'')}</textarea></label>

        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <label style="display:flex;gap:8px;align-items:center">
            <input type="checkbox" id="annAllowMonthly" ${annAllowMonthlyChecked}/>
            <span>Mark as monthly template (auto-create)</span>
          </label>

          <label style="margin-left:auto;display:flex;gap:8px;align-items:center">
            <input type="checkbox" id="saveAsTemplate" />
            <span>Save this message as a template</span>
          </label>
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <button id="annCancel" class="btn btn-ghost">Cancel</button>
          <button id="annCreate" class="btn btn-primary">Create & Send</button>
        </div>
      </div>
    `;
    showModal('Compose Announcement', html);

    // wiring
    const annAudience = document.getElementById('annAudience');
    const annClassRow = document.getElementById('annClassRow');
    const annStudentRow = document.getElementById('annStudentRow');
    const annExamRow = document.getElementById('annExamRow');
    const annCreate = document.getElementById('annCreate');
    const annCancel = document.getElementById('annCancel');
    const annTemplateSelect = document.getElementById('annTemplateSelect');
    const annLoadTemplate = document.getElementById('annLoadTemplate');
    const annType = document.getElementById('annType');
    const annExamSelect = document.getElementById('annExamSelect');
    const openTemplatesFromCompose = document.getElementById('openTemplatesFromCompose');

    // submission guard + loading helper
    let annSubmitting = false;
    function setCreateLoading(on) {
      if(!annCreate) return;
      if (on) {
        // store original text
        if (!annCreate.dataset.orig) annCreate.dataset.orig = annCreate.innerHTML;
        // spinner SVG + text
        annCreate.innerHTML = '<svg width="16" height="16" viewBox="0 0 50 50" style="vertical-align:middle;margin-right:8px"><circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-dasharray="31.4 31.4"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.9s" repeatCount="indefinite"/></svg><span style="vertical-align:middle">Sending…</span>';
        annCreate.disabled = true;
        if(annCancel) annCancel.disabled = true;
        annCreate.setAttribute('aria-busy','true');
        annSubmitting = true;
      } else {
        annCreate.innerHTML = annCreate.dataset.orig || 'Create & Send';
        annCreate.disabled = false;
        if(annCancel) annCancel.disabled = false;
        annCreate.removeAttribute('aria-busy');
        annSubmitting = false;
      }
    }

    function refreshAudienceUI(){
      const v = annAudience ? annAudience.value : '';
      annClassRow.style.display = v === 'specific_class' ? 'block' : 'none';
      annStudentRow.style.display = v === 'specific_student' ? 'block' : 'none';
    }
    function refreshTypeUI(){
      const t = annType.value;
      annExamRow.style.display = (t === 'exam' || t === 'top10') ? 'block' : 'none';
      if(t === 'monthly_payment'){
        if(annAudience.value === 'teachers' || annAudience.value === 'all') annAudience.value = 'students';
        const opt = annAudience.querySelector('option[value="teachers"]'); if(opt) opt.disabled = true;
      } else {
        const opt = annAudience.querySelector('option[value="teachers"]'); if(opt) opt.disabled = false;
      }
    }
    if(annAudience) annAudience.addEventListener('change', refreshAudienceUI);
    if(annType) annType.addEventListener('change', refreshTypeUI);
    refreshAudienceUI(); refreshTypeUI();

    annLoadTemplate.onclick = () => {
      const id = annTemplateSelect.value; if(!id) return toast('Select a template first' , 'warning');
      const t = (_cachedTemplates||[]).find(x => (x.id === id || x.key === id)); if(!t) return toast('Template not found', 'info');
      const titleEl = document.getElementById('annTitle'); const bodyEl = document.getElementById('annBody');
      if(titleEl) titleEl.value = t.title || ''; if(bodyEl) bodyEl.value = t.body || '';
      if(annType) annType.value = t.type || 'general'; if(document.getElementById('annAllowMonthly')) document.getElementById('annAllowMonthly').checked = !!t.allowMonthly;
      refreshTypeUI();
      if((t.type === 'exam' || t.type === 'top10') && examsCache && examsCache.length){
        const prefer = (t.meta && t.meta.examId) ? t.meta.examId : examsCache[0].id;
        setTimeout(()=> { if(annExamSelect) annExamSelect.value = prefer; }, 40);
      }
      if(t.type === 'monthly_payment') { annAudience.value = 'students'; refreshAudienceUI(); }
      toast('Template loaded', 'success');
    };

    openTemplatesFromCompose.onclick = (e) => { e.preventDefault(); openTemplatesModal(); };

    annCancel.onclick = closeModal;

    // unified Create / Save handler: if pref.editId is present we update the announcement doc
    annCreate.onclick = async () => {
      if (annSubmitting) return; // block double/subsequent clicks
      setCreateLoading(true);
      try {
        const type = annType.value;
        const title = document.getElementById('annTitle').value.trim() || 'Announcement';
        const body = document.getElementById('annBody').value.trim() || '';
        const audienceMode = annAudience.value;
        const allowMonthly = !!document.getElementById('annAllowMonthly').checked;
        const saveAsTemplate = !!document.getElementById('saveAsTemplate').checked;

        let audience = [];
        if(audienceMode === 'students') audience = ['students'];
        else if(audienceMode === 'teachers') audience = ['teachers'];
        else if(audienceMode === 'all') audience = ['all'];
        else if(audienceMode === 'specific_class'){
          const cls = document.getElementById('annClassSelect').value;
          if(!cls){ toast('Please choose class', 'warning'); setCreateLoading(false); return; }
          audience = [`class:${cls}`];
        } else if(audienceMode === 'specific_student'){
          const sid = document.getElementById('annStudentId').value.trim();
          if(!sid){ toast('Please enter student ID', 'warning'); setCreateLoading(false); return; }
          audience = [`student:${sid}`];
        }

        if(type === 'monthly_payment' && (audienceMode === 'teachers' || audienceMode === 'all')){
          toast('Monthly announcements are students-only; switched to "students".', 'warning');
          audience = ['students'];
        }

        let meta = {};
        if(type === 'exam' || type === 'top10'){
          const examId = annExamSelect ? annExamSelect.value : '';
          if(examId){
            meta.examId = examId;
            const ex = (window.examsCache || []).find(e => e.id === examId);
            if(ex && (ex.name || ex.title)) meta.examName = ex.name || ex.title;
            else {
              try { const d = await getDoc(doc(db,'exams', examId)); if(d && d.exists()) meta.examName = d.data().name || d.data().title || examId; } catch(_) { meta.examName = examId; }
            }

            // also compute examMax (sum of subject max) if exam doc has subjects
            try {
              if(!meta.examMax) {
                const exDoc = await getDoc(doc(db,'exams', examId)).catch(()=>null);
                if(exDoc && exDoc.exists()){
                  const exData = exDoc.data();
                  if(Array.isArray(exData.subjects) && exData.subjects.length){
                    meta.examMax = exData.subjects.reduce((s, sub) => s + (Number(sub.max)||0), 0);
                  }
                }
              }
            } catch(e){}
          }
        }

        const ann = { title, body, type, audience, allowMonthly, createdBy: currentUser ? (currentUser.uid||currentUser.email) : 'unknown', meta, updatedAt: Timestamp.now() };

        // if editing existing announcement -> update
        if (pref && pref.editId) {
          try {
            // update doc
            await updateDoc(doc(db, ANNOUNCEMENTS_COLL, pref.editId), { ...ann, updatedAt: Timestamp.now() });
            // optionally save as template
            if (saveAsTemplate) {
              try { await saveTemplate({ title, body, type, audience, allowMonthly, meta }); } catch(e){ console.warn('save template failed', e); }
            }
            toast('Announcement updated.', 'success');
            closeModal();
            _cachedAnnouncements = null; _cachedTemplates = null;
            renderAnnouncements();
            return;
          } catch (e) {
            console.error('Update failed', e);
            toast('Failed to update announcement', 'error', 3000);
            return;
          }
        }

        // otherwise create new announcement
        if(type === 'monthly_payment' && allowMonthly){
          const now = new Date(); ann.monthYear = `${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`;
        }

        await createAnnouncementDoc({ ...ann, createdAt: Timestamp.now() }, { autoCreated:false });

        if(saveAsTemplate){
          try { await saveTemplate({ title, body, type, audience, allowMonthly, meta }); } catch(e){ console.warn('save template failed', e); }
        }

        toast('Announcement created.', 'success');
        closeModal();
        _cachedAnnouncements = null; _cachedTemplates = null;
        renderAnnouncements();
      } catch(err){
        console.error(err);
        toast(err.message || 'Failed to create announcement', 'error', 3000);
      } finally {
        // ensure we clear the loading state (if modal closed, this is harmless)
        setCreateLoading(false);
      }
    };


  }).catch(err => {
    console.warn('templates fetch failed', err);
    showModal('Compose Announcement', '<div style="padding:12px">Failed to load templates. Try again later.</div>');
  });
}


/* ---------- Templates modal (used from Settings and Compose) ---------- */
function openTemplatesModal(){
  const templates = _cachedTemplates || [];
  const html = `
    <div style="min-width:320px;max-width:760px;padding:12px;display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:900">Templates</div>
        <div class="muted small">Use / Edit / Delete</div>
      </div>
      <div style="max-height:60vh;overflow:auto;display:flex;flex-direction:column;gap:8px">
        ${templates.map(t => {
          const id = escapeHtml(t.id||t.key||'');
          const title = escapeHtml(t.title||t.key||'(untitled)');
          const body = escapeHtml((t.body||'').slice(0,140));
          return `<div style="display:flex;gap:10px;align-items:center;padding:8px;border-radius:8px;border:1px solid #eef2f7">
            <div style="flex:1;min-width:0">
              <div style="font-weight:800">${title}</div>
              <div class="muted small" style="margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${body}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <button class="tpl-use" data-id="${id}" title="Use" style="border:0;background:transparent;cursor:pointer" aria-label="Use">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="#0ea5e9" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button class="tpl-edit" data-id="${id}" title="Edit" style="border:0;background:transparent;cursor:pointer" aria-label="Edit">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" stroke="#111827" stroke-width="1.2"/></svg>
              </button>
              <button class="tpl-del" data-id="${id}" title="Delete" style="border:0;background:transparent;cursor:pointer" aria-label="Delete">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6v14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6" stroke="#ef4444" stroke-width="1.2"/></svg>
              </button>
            </div>
          </div>`; }).join('')}
      </div>
      <div style="text-align:right;margin-top:8px"><button id="tplClose" class="btn btn-ghost">Close</button></div>
    </div>
  `;
  showModal('Templates', html);
  setTimeout(()=> {
    document.getElementById('tplClose').onclick = closeModal;
    document.querySelectorAll('.tpl-use').forEach(b => b.onclick = (e) => { const id = b.dataset.id; const tpl = (_cachedTemplates||[]).find(x => (x.id===id||x.key===id)); if(!tpl) return toast('Template not found', 'info'); closeModal(); openComposeAnnouncementModal({ title: tpl.title, body: tpl.body, allowMonthly: !!tpl.allowMonthly, type: tpl.type, meta: tpl.meta||{} }); });
    document.querySelectorAll('.tpl-edit').forEach(b => b.onclick = (e) => { const id = b.dataset.id; const tpl = (_cachedTemplates||[]).find(x => (x.id===id||x.key===id)); if(!tpl) return toast('Template not found', 'info'); closeModal(); openComposeAnnouncementModal({ title: tpl.title, body: tpl.body, allowMonthly: !!tpl.allowMonthly, type: tpl.type, meta: tpl.meta||{} }); setTimeout(()=> { const btn = document.getElementById('annCreate'); if(btn) btn.textContent = 'Save changes (template)'; }, 90); });
    document.querySelectorAll('.tpl-del').forEach(b => b.onclick = async (e) => { const id = b.dataset.id; const tpl = (_cachedTemplates||[]).find(x => (x.id===id||x.key===id)); if(!tpl) return toast('Template not found'); if(String(tpl.id||tpl.key).startsWith('builtin_')) return toast('Cannot delete built-in template', 'warning'); if(!confirm('Delete template?')) return; try { await deleteTemplate(tpl.id); _cachedTemplates = null; toast('Deleted'); closeModal(); } catch(err){ console.error(err); toast('Delete failed', 'error', 3000); } });
  },60);
}

/* ---------- Announcements page renderer (header + list) ---------- */
async function renderAnnouncements(){
  if(_annRenderLock) return;
  _annRenderLock = true;
  try {
    const page = document.getElementById('pageAnnouncements'); if(!page) return;
    const listContainer = page.querySelector('#announcementsList'); if(!listContainer) return;

    // ensure only one header control group (prevent duplicates)
    const headerBar = page.querySelector(':scope > div:first-child');
    if(headerBar){
      // remove any previous ann-controls to avoid duplicates then re-add
      const existingControls = headerBar.querySelectorAll('.ann-controls');
      existingControls.forEach(el => el.remove());

      const btnWrap = document.createElement('div');
      btnWrap.className = 'ann-controls';
      btnWrap.style.display = 'flex';
      btnWrap.style.gap = '8px';
      btnWrap.style.alignItems = 'center';
     // when injecting header controls, use valid SVG paths (no "...")
btnWrap.innerHTML = `
<button id="openComposeAnnouncement" class="btn btn-primary header-new" title="New Announcement" aria-label="New">
  <svg class="icon-new" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
  <span style="margin-left:6px">+ New</span>
</button>
<button id="refreshAnnouncements" class="btn header-refresh" title="Refresh" aria-label="Refresh">
  <svg class="icon-refresh" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 12a8 8 0 10-2.2 5.2L20 20" stroke="#0f1724" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
</button>
<button id="annSettingsBtn" class="btn header-settings" title="Settings" aria-label="Settings">
  <svg class="icon-gear" width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z" stroke="#0f1724" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06A2 2 0 1 1 2.28 18.9l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09c.67 0 1.23-.45 1.51-1a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 6.6 2.28l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V2a2 2 0 1 1 4 0v.09c0 .61.38 1.17 1 1.51h.54a1.65 1.65 0 0 0 1.82-.33l.06-.06A2 2 0 1 1 21.72 5.1l-.06.06a1.65 1.65 0 0 0-.33 1.82V8c.4.35.83.8 1 1.51H21a2 2 0 1 1 0 4h-.09c-.67 0-1.23.45-1.51 1z" stroke="#0f1724" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
</button>
`;

      headerBar.appendChild(btnWrap);
    }

    listContainer.innerHTML = '<div style="padding:8px">Loading announcements…</div>';

    // fetch announcements and templates (cache)
    const [annSnap, templates] = await Promise.all([ getDocs(query(collection(db, ANNOUNCEMENTS_COLL))), getAnnouncementTemplates() ]);
    const announcements = annSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    _cachedAnnouncements = announcements;
    _cachedTemplates = templates;

    // build list (title + date + first 10 body chars). edit/delete icons (colored).
    const itemsHtml = announcements.map(a => {
      const ts = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().toLocaleString() : '';
      const shortBody = escapeHtml((a.body||'').slice(0,10)) + ((a.body||'').length>10 ? '…' : '');
      const titleShort = escapeHtml((a.title||'').slice(0,80));
      return `
        <div class="card ann-row" data-id="${escapeHtml(a.id)}" style="padding:10px;margin-bottom:10px;display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
            <div style="min-width:0">
              <div style="font-weight:900;cursor:pointer" data-action="open-ann" data-id="${escapeHtml(a.id)}">${titleShort}</div>
              <div class="muted small" style="margin-top:4px">${escapeHtml(ts)}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <button class="btn btn-ghost btn-edit" data-id="${escapeHtml(a.id)}" title="Edit" aria-label="Edit">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" stroke="#0f1724" stroke-width="1.2"/></svg>
              </button>
              <button class="btn btn-danger btn-delete" data-id="${escapeHtml(a.id)}" title="Delete" aria-label="Delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6v14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6" stroke="#ef4444" stroke-width="1.2"/></svg>
              </button>
            </div>
          </div>
          <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer" data-action="open-ann" data-id="${escapeHtml(a.id)}">${shortBody}</div>
        </div>
      `;
    }).join('');

    listContainer.innerHTML = itemsHtml || '<div class="muted">No announcements.</div>';

    // button wiring
    const openComposeBtn = document.getElementById('openComposeAnnouncement');
    if(openComposeBtn) openComposeBtn.onclick = (e) => { e.preventDefault(); openComposeAnnouncementModal(); };

    const refreshBtn = document.getElementById('refreshAnnouncements');
    if(refreshBtn) refreshBtn.onclick = (e) => { e.preventDefault(); _cachedAnnouncements = null; renderAnnouncements(); };

    const settingsBtn = document.getElementById('annSettingsBtn');
    if(settingsBtn) settingsBtn.onclick = (e) => { e.preventDefault(); openAnnouncementsSettingsModal(); };

    // list item wiring (open / edit / delete)
    Array.from(listContainer.querySelectorAll('[data-action="open-ann"]')).forEach(el => {
      el.onclick = async (ev) => {
        ev.preventDefault();
        const id = el.getAttribute('data-id');
        const a = (announcements||[]).find(x => x.id === id);
        if(!a) return toast('Announcement not found', 'info');
        await openAnnouncementModalWithDetails(a);
      };
    });

    Array.from(listContainer.querySelectorAll('.btn-edit')).forEach(b => b.onclick = async (ev) => {
      ev.preventDefault();
      const id = b.dataset.id;
      try {
        const d = await getDoc(doc(db, ANNOUNCEMENTS_COLL, id));
        if(!d.exists()) return toast('Not found', 'info');
        const dat = d.data();
        openComposeAnnouncementModal({ editId: id, title: dat.title, body: dat.body, allowMonthly: !!dat.allowMonthly, type: dat.type, meta: dat.meta || {}, monthYear: dat.monthYear || '' });
        setTimeout(()=> {
          const btn = document.getElementById('annCreate');
          if(!btn) return;
          btn.textContent = 'Save changes';
          btn.onclick = async () => {
            try {
              const newTitle = document.getElementById('annTitle').value.trim();
              const newBody = document.getElementById('annBody').value.trim();
              const newType = document.getElementById('annType').value;
              const newAllow = !!document.getElementById('annAllowMonthly').checked;
              await updateDoc(doc(db, ANNOUNCEMENTS_COLL, id), { title: newTitle, body: newBody, type: newType, allowMonthly: newAllow, updatedAt: Timestamp.now() });
              toast('Saved', 'success');
              closeModal();
              _cachedAnnouncements = null;
              renderAnnouncements();
            } catch(err){ console.error(err); toast('Save failed', 'error', 3000); }
          };
        }, 120);
      } catch(err){ console.error(err); toast('Open failed', 'error', 3000); }
    });

    Array.from(listContainer.querySelectorAll('.btn-delete')).forEach(b => b.onclick = async (ev) => {
      ev.preventDefault();
      const id = b.dataset.id;
      if(!confirm('Delete announcement?')) return;
      try { await deleteDoc(doc(db, ANNOUNCEMENTS_COLL, id)); toast('Deleted', 'warning'); _cachedAnnouncements = null; renderAnnouncements(); } catch(err){ console.error(err); toast('Delete failed', 'error', 3000); }
    });

  } catch(e){
    console.error('renderAnnouncements', e);
    const page = document.getElementById('pageAnnouncements');
    if(page){ const listContainer = page.querySelector('#announcementsList'); if(listContainer) listContainer.innerHTML = '<div class="muted">Failed to load announcements</div>'; }
  } finally {
    setTimeout(()=>{ _annRenderLock = false; }, 220);
  }
}

/* ---------- Show announcement modal with Top-10 lookup & student info ---------- */
// -----------------------------
// Replace or drop into database.js
// -----------------------------



// -----------------------------
// Replace openAnnouncementModalWithDetails in database.js (admin modal)
// -----------------------------
async function openAnnouncementModalWithDetails(a) {
  try {
    // start from the stored announcement body (the template)
    let bodyTemplate = a.body || '';

    // If this is top10, build the expanded Top-10 text BEFORE we render the modal.
    if (a.type === 'top10' && a.meta && a.meta.examId) {
      try {
        const docs = await fetchTop10Results(a.meta.examId);
        if (docs && docs.length) {
          const rows = [];
          for (let i = 0; i < docs.length; i++) {
            const d = docs[i];
            const r = (typeof d.data === 'function') ? d.data() : (d || {});
            const name = r.studentName || r.student_name || r.name || r.student || '—';
            const sid = r.studentId || r.student_id || r.student || (d.id || 'xxxx');
            const shortId = String(sid || '').slice(-4) || 'xxxx';
            const className = r.className || r.class || r.classId || '';
            const total = (typeof r.total !== 'undefined' && r.total !== null) ? Number(r.total) : null;

            // compute maxPossible using subjects array or meta
            let maxPossible = 0;
            if (Array.isArray(r.subjects) && r.subjects.length) {
              maxPossible = r.subjects.reduce((s, sub) => s + (Number(sub.max) || 0), 0);
            } else if (typeof r.max !== 'undefined' && r.max !== null) {
              maxPossible = Number(r.max);
            } else if (a.meta && a.meta.examMax) {
              maxPossible = Number(a.meta.examMax) || 0;
            }

            const percent = (total !== null && maxPossible > 0) ? ((total / maxPossible) * 100).toFixed(2) + '%' : (r.average ? String(r.average) : '');
            rows.push(`${i+1}. ${name} • ID ${shortId} • ${className} • ${total !== null ? String(total) : '—'} • ${percent}`);
          }
          bodyTemplate = `Top 10 — ${escapeHtml(a.meta?.examName || a.meta?.examId || '')}\n\n${rows.join('\n')}`;
        } else {
          // No results found — remove template tokens and show informative message
          bodyTemplate = (bodyTemplate || '').replace(/\{rank\d+\}/g, '').replace(/\{exam\}/g, a.meta?.examName || a.meta?.examId || '').trim();
          bodyTemplate += `\n\n(No top-10 data found for this exam.)`;
        }
      } catch (e) {
        console.warn('openAnnouncementModalWithDetails top10 expansion failed', e);
        bodyTemplate += '\n\n(Unable to load Top-10 details.)';
      }
    }

    // Build modal HTML only after bodyTemplate is final
    let bodyHtml = `<div style="padding:10px;max-width:820px">
      <div style="font-weight:900">${escapeHtml(a.title)}</div>
      <div class="muted small" style="margin-top:6px">${a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().toLocaleString() : ''}</div>
      <div style="white-space:pre-wrap;margin-top:12px">${escapeHtml(bodyTemplate)}</div>
    `;

    bodyHtml += `</div><div style="text-align:right;margin-top:10px">
      <button id="modalEditAnn" class="btn btn-ghost">Edit</button>
      <button id="modalDeleteAnn" class="btn btn-danger">Delete</button>
    </div>`;

    showModal('Announcement', bodyHtml);

    // preserve your existing edit/delete wiring (kept mostly unchanged)
    setTimeout(() => {
      const editBtn = document.getElementById('modalEditAnn');
      const delBtn = document.getElementById('modalDeleteAnn');
      if (editBtn) editBtn.onclick = async () => {
        closeModal();
        openComposeAnnouncementModal({ title: a.title, body: a.body, allowMonthly: !!a.allowMonthly, type: a.type, meta: a.meta || {}, monthYear: a.monthYear || '' });
        setTimeout(() => {
          const btn = document.getElementById('annCreate');
          if (!btn) return;
          btn.textContent = 'Save changes';
          btn.onclick = async () => {
            try {
              const newTitle = document.getElementById('annTitle').value.trim();
              const newBody = document.getElementById('annBody').value.trim();
              const newType = document.getElementById('annType').value;
              const newAllow = !!document.getElementById('annAllowMonthly').checked;
              await updateDoc(doc(db, ANNOUNCEMENTS_COLL, a.id), { title: newTitle, body: newBody, type: newType, allowMonthly: newAllow, updatedAt: Timestamp.now() });
              toast('Saved' , 'success'); closeModal(); _cachedAnnouncements = null; renderAnnouncements();
            } catch (err) { console.error(err); toast('Save failed', 'error', 3000); }
          };
        }, 120);
      };
      if (delBtn) delBtn.onclick = async () => {
        if (!confirm('Delete announcement?')) return;
        try { await deleteDoc(doc(db, ANNOUNCEMENTS_COLL, a.id)); toast('Deleted', 'warning'); closeModal(); _cachedAnnouncements = null; renderAnnouncements(); } catch (err) { console.error(err); toast('Delete failed', 'error', 3000); }
      };
    }, 80);

  } catch (e) {
    console.error('openAnnouncementModalWithDetails failed', e);
    toast('Failed to open announcement', 'error', 3000);
  }
}


/* ---------- Settings modal (monthly options + templates inside) ---------- */
async function openAnnouncementsSettingsModal(){
  try {
    const [settings, templates] = await Promise.all([ getAnnouncementsSettings(), getAnnouncementTemplates() ]);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const excluded = settings.excludedMonths || [];
    const adminId = currentUser ? (currentUser.uid||currentUser.email) : 'unknown';
    const used = await getAdminQuotaCountForToday(adminId);
    const remaining = Math.max(0, 10 - (Number(used) || 0));

    const templatesHtml = (templates||[]).map(t => {
      const id = escapeHtml(t.id||t.key||'');
      const title = escapeHtml(t.title||t.key||'(template)');
      const short = escapeHtml((t.body||'').slice(0,60)) + ((t.body||'').length>60 ? '…' : '');
      return `
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px;border-radius:8px;border:1px solid #eef2f7">
          <div style="min-width:0">
            <div style="font-weight:800">${title}</div>
            <div class="muted small" style="margin-top:4px">${short}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="tpl-use-btn" data-id="${id}" title="Use" style="border:0;background:transparent;cursor:pointer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="#0ea5e9" stroke-width="1.4"/></svg>
            </button>
            <button class="tpl-edit-btn" data-id="${id}" title="Edit" style="border:0;background:transparent;cursor:pointer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" stroke="#111827" stroke-width="1.2"/></svg>
            </button>
            <button class="tpl-del-btn" data-id="${id}" title="Delete" style="border:0;background:transparent;cursor:pointer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6v14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6" stroke="#ef4444" stroke-width="1.2"/></svg>
            </button>
          </div>
        </div>`;
    }).join('');

    const html = `
      <div style="min-width:320px;max-width:820px;display:flex;flex-direction:column;gap:12px;padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:900">Announcements Settings</div>
          <div class="muted small">Daily limit is fixed to <strong>10</strong></div>
        </div>

        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <label style="display:flex;gap:8px;align-items:center">
            <input type="checkbox" id="sets_monthlyEnabled" ${settings.monthlyEnabled ? 'checked' : ''}/>
            <span>Auto-create monthly template (1st of month)</span>
          </label>
          <div style="margin-left:auto;text-align:right">
            <div class="muted small">Used today: <strong id="quotaUsed">${escapeHtml(String(used))}</strong></div>
            <div class="muted small">Remaining today: <strong id="quotaRemaining">${escapeHtml(String(remaining))}</strong></div>
          </div>
        </div>

        <div>
          <div style="font-weight:800;margin-bottom:6px">Excluded months (auto-create will skip these)</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${months.map((m,i)=>`<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" class="sets_excl" value="${i+1}" ${ (settings.excludedMonths||[]).includes(i+1) ? 'checked' : '' }/> ${m}</label>`).join('')}
          </div>
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="sets_cancel" class="btn btn-ghost">Cancel</button>
          <button id="sets_save" class="btn btn-primary">Save settings</button>
        </div>

        <hr/>

        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:900">Templates</div>
          <div class="muted small">Use / Edit / Delete templates</div>
        </div>
        <div style="max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:8px">
          ${templatesHtml || '<div class="muted">No templates</div>'}
        </div>
      </div>
    `;
    showModal('Announcements Settings', html);

    setTimeout(()=>{
      document.getElementById('sets_cancel').onclick = closeModal;
      document.getElementById('sets_save').onclick = async () => {
        try {
          const monthlyEnabled = !!document.getElementById('sets_monthlyEnabled').checked;
          const exclEls = Array.from(document.querySelectorAll('.sets_excl'));
          const excludedMonths = exclEls.filter(x=>x.checked).map(x=>Number(x.value));
          await saveAnnouncementsSettings({ monthlyEnabled, excludedMonths });
          closeModal();
          _cachedTemplates = null; _cachedAnnouncements = null;
          renderAnnouncements();
        } catch(err){ console.error(err); toast('Save failed', 'error', 3000); }
      };

      // template action wiring inside settings
      document.querySelectorAll('.tpl-use-btn').forEach(b => b.onclick = (ev)=> { const id = b.getAttribute('data-id'); const tpl = (_cachedTemplates||[]).find(t => (t.id===id||t.key===id)); if(!tpl) return toast('Template not found', 'info'); closeModal(); openComposeAnnouncementModal({ title: tpl.title, body: tpl.body, allowMonthly: !!tpl.allowMonthly, type: tpl.type, meta: tpl.meta||{} }); });
      document.querySelectorAll('.tpl-edit-btn').forEach(b => b.onclick = (ev)=> { const id = b.getAttribute('data-id'); const tpl = (_cachedTemplates||[]).find(t => (t.id===id||t.key===id)); if(!tpl) return toast('Template not found', 'info'); closeModal(); openComposeAnnouncementModal({ title: tpl.title, body: tpl.body, allowMonthly: !!tpl.allowMonthly, type: tpl.type, meta: tpl.meta||{} }); setTimeout(()=>{ const btn = document.getElementById('annCreate'); if(btn) btn.textContent='Save changes (template)'; }, 90); });
      document.querySelectorAll('.tpl-del-btn').forEach(b => b.onclick = async (ev)=> { const id = b.getAttribute('data-id'); const tpl = (_cachedTemplates||[]).find(t => (t.id===id||t.key===id)); if(!tpl) return toast('Template not found', 'info'); if(String(tpl.id||tpl.key).startsWith('builtin_')) return toast('Cannot delete built-in template'); if(!confirm('Delete template?')) return; try { await deleteTemplate(tpl.id); _cachedTemplates = null; toast('Template deleted', 'warning'); closeModal(); renderAnnouncements(); } catch(e){ console.error(e); toast('Delete failed', 'error', 3000); } });
    }, 60);

  } catch(e){ console.error('openAnnouncementsSettingsModal failed', e); showModal('Settings', '<div style="padding:12px">Failed to load settings</div>'); }
}

/* ---------- expose to global if you need ---------- */
window.renderAnnouncements = renderAnnouncements;
window.openAnnouncementsSettingsModal = openAnnouncementsSettingsModal;
window.openTemplatesModal = openTemplatesModal;
window.openComposeAnnouncementModal = openComposeAnnouncementModal;
window.ensureMonthlyAnnouncementIfNeeded = ensureMonthlyAnnouncementIfNeeded;



/* ----------------------------
  Admin UI wiring for announcements buttons + auto-load (kept but improved)
------------------------------*/
try {
  // Compose + Refresh are created in renderAnnouncements, but keep old wiring in case page markup changed
  const openComposeBtn = document.getElementById('openComposeAnnouncement');
  if (openComposeBtn) openComposeBtn.addEventListener('click', (e) => { e.preventDefault(); openComposeAnnouncementModal(); });

  const refreshBtn = document.getElementById('refreshAnnouncements');
  if (refreshBtn) refreshBtn.addEventListener('click', (e) => { e.preventDefault(); renderAnnouncements().catch(err => console.warn('refreshAnnouncements failed', err)); });

  const tabAnn = document.getElementById('tabAnnouncements');
  if (tabAnn) tabAnn.addEventListener('click', (e) => {
    e.preventDefault();
    try { if (typeof showPage === 'function') showPage('announcements'); else {
      document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
      const p = document.getElementById('pageAnnouncements'); if (p) p.style.display = 'block';
    } } catch(e){ console.warn(e); }
    renderAnnouncements().catch(err => console.warn('renderAnnouncements failed', err));
  });

  // Auto-load on page load if admin opens the announcements page
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (document.getElementById('pageAnnouncements')) {
        renderAnnouncements().catch(err => console.warn('initial renderAnnouncements failed', err));
      }
    }, 300);
  });

  const modalCloseBtn = document.getElementById('modalClose');
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', (e) => { e.preventDefault(); closeModal(); });

} catch (e) {
  console.warn('Admin announcements wiring failed', e);
}


/* rendering */

/* -------------------------
   New list + view UI logic
   Paste into database.js
   Replace old renderStudents/renderTeachers/renderClasses/renderSubjects
---------------------------*/

/** helper: count students assigned to a class (by class.name) */
function countStudentsInClass(className){
  if(!className) return 0;
  return (studentsCache || []).filter(s => (s.classId || '') === className).length;
}

/** ---------- TEACHERS (table view + View modal) ---------- */

/* ---------- Teachers: updated render + modals (prevent full-page reload) ---------- */

/* populate teachers subject filter (keeps subjectsCache) */
function populateTeachersSubjectFilter(){
  if(!teachersSubjectFilter) return;
  teachersSubjectFilter.innerHTML = '<option value="">All subjects</option>';
  for(const s of (subjectsCache || [])){
    const opt = document.createElement('option');
    opt.value = s.name || s.id;
    opt.textContent = s.name || s.id;
    teachersSubjectFilter.appendChild(opt);
  }
}

/* ---------- TEACHERS (mobile row salary pinned right before more icon) ---------- */
function renderTeachers(){
  if(!teachersList) return;
  const total = (teachersCache || []).length;

  const q = (teachersSearch && teachersSearch.value||'').trim().toLowerCase();
  const subjFilter = (teachersSubjectFilter && teachersSubjectFilter.value) || '';
  const mobileClassVal = (document.getElementById('_mobileTeacherClass') && document.getElementById('_mobileTeacherClass').value) || '';
  let list = (teachersCache || []).slice();
  list = list.filter(t => {
    if(mobileClassVal && !((t.classes || []).includes(mobileClassVal))) return false;
    if(subjFilter && (!(t.subjects || []).includes(subjFilter))) return false;
    if(!q) return true;
    return (t.fullName||'').toLowerCase().includes(q) || (t.phone||'').toLowerCase().includes(q) || (String(t.id||t.teacherId||'')).toLowerCase().includes(q) || ((t.email||'').toLowerCase().includes(q));
  });

  // MOBILE
  if(isMobileViewport()){
    try {
      if(teachersSearch) teachersSearch.style.display = 'none';
      if(teachersSubjectFilter) teachersSubjectFilter.style.display = 'none';
      if(openAddTeacher) openAddTeacher.style.display = 'none';
    } catch(e){}

    const subjOptions = (subjectsCache || []).map(s=>`<option value="${escape(s.name||s.id)}">${escape(s.name||s.id)}</option>`).join('');
    const classOptions = (classesCache || []).map(c=>`<option value="${escape(c.name)}">${escape(c.name)}</option>`).join('');

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px">
        <div style="flex:1;display:flex;gap:8px;align-items:center">
          <input id="_mobileTeacherSearch" placeholder="Search teachers..." value="${escape(teachersSearch && teachersSearch.value||'')}" style="flex:1;padding:8px;border-radius:8px;border:1px solid #e6eef8" />
          <button type="button" id="_mobileAddTeacher" class="btn btn-primary" style="white-space:nowrap">+ Add</button>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center">
        <div style="flex:1;position:relative">
          <select id="_mobileTeacherClass" style="width:100%;padding:10px 40px 10px 12px;border-radius:10px;border:1px solid #e6eef8;background:#f8fafc">
            <option value="">All classes</option>
            ${classOptions}
          </select>
          <button type="button" id="_mobileClearClass" title="Clear class" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:transparent;font-size:16px;padding:6px;line-height:1;color:#6b7280">×</button>
        </div>

        <div style="flex:1;">
          <select id="_mobileTeacherSubject" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid #e6eef8;background:#fff">
            <option value="">All subjects</option>
            ${subjOptions}
          </select>
        </div>
      </div>

      <div style="
        margin:6px 0 10px;
        text-align:right;
        font-size:13px;
        font-weight:600;
        color:#334155
      ">
        Total teachers: ${total}
      </div>

      <div id="teachersMobileList">
    `;

    list.forEach((t, idx) => {
      const id = escape(t.id || t.teacherId || '');
      const name = escape(t.fullName || '—');
      const salaryVal = (typeof t.salary !== 'undefined' && t.salary !== null) ? escape(String(t.salary)) : '—';
      const subsArr = (t.subjects || []).map(sid => {
        const found = (subjectsCache||[]).find(x => x.id === sid || x.name === sid);
        return found ? found.name : sid;
      });
      const subsText = subsArr.length ? escape(subsArr.join(', ')) : '—';

      // layout: left block (index + name + id/subjects) | salary container (fixed, right) | more button
      html += `
        <div class="mobile-row" style="padding:10px;border-bottom:1px solid #f1f5f9">
          <div style="display:flex;align-items:flex-start;gap:12px">
            <div style="min-width:28px;text-align:center;font-weight:700;margin-top:2px">${idx+1}</div>

            <div style="flex:1;min-width:0;overflow:hidden">
              <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>

              <div style="font-size:12px;color:#667085;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:6px">
                ID ${id} &middot; <span style="color:#60a5fa">${subsText}</span>
              </div>
            </div>

            <div style="flex:0 0 auto;min-width:70px;text-align:right;margin-left:8px;font-weight:600;font-size:13px;color:#10b981">
              ${salaryVal !== '—' ? '$' + salaryVal : '—'}
            </div>

            <div style="margin-left:8px;flex:0 0 auto">
              <button type="button" class="btn btn-ghost btn-sm mobile-teacher-more" data-id="${escape(t.id||t.teacherId||'')}">⋮</button>
            </div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    teachersList.innerHTML = html;

    // --- Attach mobile handlers ONCE using delegation to avoid duplicates ---
    if(!teachersList.dataset.mobileHandlersAttached){
      teachersList.addEventListener('click', function(ev){
        const el = ev.target;
        if(!el) return;
        if(el.id === '_mobileAddTeacher' || (el.closest && el.closest('#_mobileAddTeacher'))){
          if(ev.preventDefault) ev.preventDefault();
          if(typeof openAddTeacher !== 'undefined' && openAddTeacher) openAddTeacher.click();
          return;
        }
        if(el.classList && el.classList.contains('mobile-teacher-more')){
          const sid = el.dataset.id;
          if(ev.preventDefault) ev.preventDefault();
          openViewTeacherModal({ target: { dataset: { id: sid } } });
          return;
        }
        if(el.id === '_mobileClearClass' || (el.closest && el.closest('#_mobileClearClass'))){
          if(ev.preventDefault) ev.preventDefault();
          const sel = document.getElementById('_mobileTeacherClass');
          if(sel) sel.value = '';
          renderTeachers();
          return;
        }
      });

      teachersList.addEventListener('input', function(ev){
        const t = ev.target;
        if(!t) return;
        if(t.id === '_mobileTeacherSearch'){
          if(teachersSearch) teachersSearch.value = t.value;
          renderTeachers();
        }
      });

      teachersList.addEventListener('change', function(ev){
        const t = ev.target;
        if(!t) return;
        if(t.id === '_mobileTeacherSubject'){
          if(teachersSubjectFilter) teachersSubjectFilter.value = t.value;
          renderTeachers();
        }
        if(t.id === '_mobileTeacherClass'){
          renderTeachers();
        }
      });

      teachersList.dataset.mobileHandlersAttached = '1';
    }

    return;
  }

  // DESKTOP: restore page header visibility (if it was hidden earlier)
  try {
    if(teachersSearch) teachersSearch.style.display = '';
    if(teachersSubjectFilter) teachersSubjectFilter.style.display = '';
    if(openAddTeacher) openAddTeacher.style.display = '';
  } catch(e){}

  // Desktop table with Subjects column
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>Total teachers: ${total}</strong>
      <div class="muted">Showing ID, Name, Subjects, Salary — click View for more</div>
    </div>`;
  html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="text-align:left;border-bottom:1px solid #e6eef8">
        <th style="padding:8px;width:48px">No</th>
        <th style="padding:8px;width:140px">ID</th>
        <th style="padding:8px">Name</th>
        <th style="padding:8px;width:200px">Subjects</th>
        <th style="padding:8px;width:120px">Salary</th>
        <th style="padding:8px;width:220px">Actions</th>
      </tr>
    </thead><tbody>`;

  list.forEach((t, idx) => {
    const id = escape(t.id || t.teacherId || '');
    const name = escape(t.fullName || '');
    const salary = (typeof t.salary !== 'undefined' && t.salary !== null) ? escape(String(t.salary)) : '—';
    const subsText = (t.subjects || []).map(sid => {
      const found = (subjectsCache||[]).find(x => x.id === sid || x.name === sid);
      return found ? found.name : sid;
    }).join(', ') || '—';

    html += `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px;vertical-align:middle">${idx+1}</td>
      <td style="padding:8px;vertical-align:middle">${id}</td>
      <td style="padding:8px;vertical-align:middle">${name}</td>
      <td style="padding:8px;vertical-align:middle;max-width:240px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${escape(subsText)}</td>
      <td style="padding:8px;vertical-align:middle">${salary}</td>
      <td style="padding:8px;vertical-align:middle">
        <button type="button" class="btn btn-ghost btn-sm view-teacher" data-id="${id}">View</button>
        <button type="button" class="btn btn-ghost btn-sm edit-teacher" data-id="${id}">Edit</button>
        <button type="button" class="btn btn-danger btn-sm del-teacher" data-id="${id}">Delete</button>
      </td>
    </tr>`;
  });

  html += `</tbody></table></div>`;
  teachersList.innerHTML = html;

  // desktop wiring
  teachersList.querySelectorAll('.view-teacher').forEach(b => b.onclick = openViewTeacherModal);
  teachersList.querySelectorAll('.edit-teacher').forEach(b => b.onclick = openEditTeacherModal);
  teachersList.querySelectorAll('.del-teacher').forEach(b => b.onclick = deleteTeacher);
}




/* ---------- View teacher modal (delete uses modalConfirm + loading) ---------- */
async function openViewTeacherModal(e){
  const id = (e && e.target) ? e.target.dataset.id : (e && e.dataset ? e.dataset.id : e);
  if(!id) return;
  let t = teachersCache.find(x => (x.id === id) || (x.teacherId === id) );
  if(!t && typeof getDoc === 'function'){
    try {
      const snap = await getDoc(doc(db,'teachers', id));
      if(snap.exists()) t = { id: snap.id, ...snap.data() };
    } catch(err){ console.error('load teacher for view failed', err); }
  }
  if(!t) return toast('Teacher not found', 'info');

  const classesText = (t.classes && t.classes.length) ? t.classes.join(', ') : 'No classes';
  const subsText = (t.subjects && t.subjects.length) ? (t.subjects.map(s=>{ const found = (subjectsCache||[]).find(x => x.id === s || x.name === s); return found ? found.name : s; }).join(', ')) : 'No subjects';
  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><strong>ID</strong><div class="muted">${escape(t.id || t.teacherId || '')}</div></div>
      <div><strong>Name</strong><div class="muted">${escape(t.fullName||'')}</div></div>
      <div><strong>Phone</strong><div class="muted">${escape(t.phone||'')}</div></div>
      <div><strong>Email</strong><div class="muted">${escape(t.email||'—')}</div></div>
      <div><strong>Salary</strong><div class="muted">${typeof t.salary !== 'undefined' ? escape(String(t.salary)) : '—'}</div></div>
      <div><strong>Created</strong><div class="muted">${t.createdAt ? (new Date(t.createdAt.seconds ? t.createdAt.seconds*1000 : t.createdAt)).toLocaleString() : '—'}</div></div>
      <div style="grid-column:1 / -1"><strong>Classes</strong><div class="muted">${escape(classesText)}</div></div>
      <div style="grid-column:1 / -1"><strong>Subjects</strong><div class="muted">${escape(subsText)}</div></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button type="button" class="btn btn-ghost" id="viewTeacherClose">Close</button>
      <button type="button" class="btn btn-ghost" id="viewTeacherEdit">Edit</button>
      <button type="button" class="btn btn-ghost" id="viewTeacherSendReset">Send reset email</button>
      <button type="button" class="btn btn-ghost" id="viewTeacherAdminReset">Admin reset (server)</button>
      <button type="button" class="btn btn-danger" id="viewTeacherDel">Delete</button>
    </div>
  `;
  showModal(`${escape(t.fullName||'')} — Teacher`, html);

  modalBody.querySelector('#viewTeacherClose').onclick = closeModal;
  modalBody.querySelector('#viewTeacherEdit').onclick = () => {
    closeModal();
    openEditTeacherModal({ target:{ dataset:{ id: t.id || t.teacherId } }});
  };

  modalBody.querySelector('#viewTeacherSendReset').onclick = async () => {
    const email = t.email;
    if(!email) return toast('Teacher has no email set' , 'info');
    await sendResetEmailFor(email);
  };

  modalBody.querySelector('#viewTeacherAdminReset').onclick = async () => {
    const newPass = prompt('Enter new password for teacher (min 6 chars):');
    if(!newPass || newPass.length < 6) return toast('Password must be at least 6 characters' , 'warning');
    if(!t.authUid) return toast('Teacher has no linked auth account', 'warning');
    try {
      const token = currentUser && currentUser.getIdToken ? await currentUser.getIdToken(true) : null;
      const resp = await fetch('/admin/setTeacherPassword', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ uid: t.authUid, password: newPass })
      });
      if (!resp.ok) { const txt = await resp.text(); console.error('admin reset failed', resp.status, txt); return toast('Admin reset failed (server).' , 'error', 3000); }
      toast('Password updated via admin API' );
    } catch(err){ console.error(err); toast('Admin reset API not available', 'error', 3000); }
  };

  modalBody.querySelector('#viewTeacherDel').onclick = async (ev) => {
    if(ev && ev.preventDefault) ev.preventDefault();
    const delBtn = modalBody.querySelector('#viewTeacherDel');
    const ok = await modalConfirm('Confirm delete', 'Move teacher to Recycle Bin?');
    if(!ok) return;
    setButtonLoading(delBtn, true, 'Deleting...');
    try{
      const who = (currentUser && currentUser.uid) || (auth && auth.currentUser && auth.currentUser.uid) || null;
      await updateDoc(doc(db,'teachers', t.id), { deleted: true, deletedAt: Timestamp.now(), deletedBy: who });
      toast('Teacher moved to Recycle Bin', 'info');
      await loadTeachers(); renderTeachers();
      closeModal();
    } catch(err){ console.error('delete teacher failed', err); toast('Failed to delete teacher' , 'error', 3000); }
    setButtonLoading(delBtn, false);
  };
}

/* ---------- Add teacher (save button loading, now prevents default submit) ---------- */
function openAddTeacherModal(){
  const classOptions = (classesCache || []).map(c => `<option value="${escape(c.name)}">${escape(c.name)}</option>`).join('');
  const subjectOptions = (subjectsCache || []).map(s => `<option value="${escape(s.name)}">${escape(s.name)}</option>`).join('');
  showModal('Add Teacher', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><label>Teacher ID (optional)</label><input id="teacherId" placeholder="TEC00001" /></div>
      <div><label>Salary</label><input id="teacherSalary" type="number" min="0" /></div>
      <div style="grid-column:1 / -1"><label>Full name</label><input id="teacherName" /></div>
      <div><label>Phone</label><input id="teacherPhone" /></div>
      <div><label>Parent phone</label><input id="teacherParentPhone" /></div>
      <div><label>Email (optional)</label><input id="teacherEmail" type="email" /></div>
      <div><label>Password (optional)</label><input id="teacherPassword" type="password" placeholder="min 6 characters" /></div>
      <div style="grid-column:1 / -1"><label>Assign classes (select multiple)</label><select id="teacherClasses" multiple size="6" style="width:100%">${classOptions}</select></div>
      <div style="grid-column:1 / -1"><label>Assign subjects (select multiple)</label><select id="teacherSubjects" multiple size="6" style="width:100%">${subjectOptions}</select></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button type="button" id="cancelTeacher" class="btn btn-ghost">Cancel</button>
      <button type="button" id="saveTeacher" class="btn btn-primary">Save</button>
    </div>
  `);

  modalBody.querySelector('#cancelTeacher').onclick = (ev) => { if(ev && ev.preventDefault) ev.preventDefault(); closeModal(); };

  modalBody.querySelector('#saveTeacher').onclick = async (ev) => {
    if(ev && ev.preventDefault) ev.preventDefault();
    const btn = ev.currentTarget;
    try{
      setButtonLoading(btn, true, 'Saving...');
      let id = modalBody.querySelector('#teacherId').value.trim();
      const name = (modalBody.querySelector('#teacherName').value || '').trim();
      const phone = (modalBody.querySelector('#teacherPhone').value || '').trim();
      const parentPhone = (modalBody.querySelector('#teacherParentPhone').value || '').trim();
      const salaryVal = modalBody.querySelector('#teacherSalary').value;
      const salary = salaryVal ? Number(salaryVal) : null;
      const emailRaw = (modalBody.querySelector('#teacherEmail').value || '').trim();
      const email = emailRaw ? emailRaw.toLowerCase() : '';
      const password = modalBody.querySelector('#teacherPassword').value || '';
      const classesSelected = Array.from(modalBody.querySelectorAll('#teacherClasses option:checked')).map(o => o.value);
      const subjectsSelected = Array.from(modalBody.querySelectorAll('#teacherSubjects option:checked')).map(o => o.value);

      if(!name){ toast('Teacher name is required' , 'warning'); setButtonLoading(btn, false); return; }
      if(email && isTeacherEmailDuplicate(email)) { toast('Email already used by another teacher' , 'warning'); setButtonLoading(btn, false); return; }
      if(password && password.length < 6) { toast('Password must be at least 6 characters', 'warning'); setButtonLoading(btn, false); return; }

      if(!id) id = await generateDefaultId('teachers','TEC',5);

      const payload = { id, teacherId: id, fullName: name, phone: phone||'', parentPhone: parentPhone||'', salary: salary, classes: classesSelected, subjects: subjectsSelected, createdAt: Timestamp.now(), createdBy: currentUser ? currentUser.uid : null };
      if(email) payload.email = email;

      if(email && password){
        try {
          const userCred = await createUserWithEmailAndPassword(auth, email, password);
          payload.authUid = userCred.user.uid;
        } catch(err){
          console.warn('createUserWithEmailAndPassword failed', err);
          if(err && err.code === 'auth/email-already-in-use') { toast('Email already exists in Auth. Teacher saved without auth link.', 'warning'); }
          else toast('Failed to create auth user (teacher will be created without login).', 'warning');
        }
      }

      await setDoc(doc(db,'teachers', id), payload);
      toast('Teacher created' , 'success');
      closeModal();
      await loadTeachers();
      renderTeachers();
      showPage('teachers'); // ← FORCE stay on Teachers
      // refresh teachers only (no page reload)
    } catch(err){ console.error('create teacher failed', err); toast('Failed to create teacher', 'error', 3000); }
    setButtonLoading(btn, false);
  };
}

/* ---------- Edit teacher (save button loading, refresh teachers only) ---------- */
async function openEditTeacherModal(e){
  const id = e && e.target ? e.target.dataset.id : e;
  if(!id) return;
  let t = teachersCache.find(x => x.id === id || x.teacherId === id);
  if(!t){
    try{ const snap = await getDoc(doc(db,'teachers', id)); if(!snap.exists()) return toast('Teacher not found'); t = { id: snap.id, ...snap.data() }; } catch(err){ console.error(err); return toast('Failed to load teacher' , 'error', 3000); }
  }

  const classOptions = (classesCache || []).map(c => `<option value="${escape(c.name)}" ${ (t.classes||[]).includes(c.name) ? 'selected' : '' }>${escape(c.name)}</option>`).join('');
  const subjectOptions = (subjectsCache || []).map(s => `<option value="${escape(s.name)}" ${ (t.subjects||[]).includes(s.name) ? 'selected' : '' }>${escape(s.name)}</option>`).join('');

  showModal('Edit Teacher', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><label>Teacher ID</label><input id="teacherId" value="${escape(t.teacherId||t.id||'')}" disabled /></div>
      <div><label>Salary</label><input id="teacherSalary" type="number" min="0" value="${escape(String(t.salary||''))}" /></div>
      <div style="grid-column:1 / -1"><label>Full name</label><input id="teacherName" value="${escape(t.fullName||'')}" /></div>
      <div><label>Phone</label><input id="teacherPhone" value="${escape(t.phone||'')}" /></div>
      <div><label>Parent phone</label><input id="teacherParentPhone" value="${escape(t.parentPhone||'')}" /></div>
      <div><label>Email</label><input id="teacherEmail" type="email" value="${escape(t.email||'')}" /></div>
      <div><label>New password (optional)</label><input id="teacherNewPassword" type="password" placeholder="Leave blank to keep current password" /></div>
      <div style="grid-column:1 / -1"><label>Assign classes (select multiple)</label><select id="teacherClasses" multiple size="6" style="width:100%">${classOptions}</select></div>
      <div style="grid-column:1 / -1"><label>Assign subjects (select multiple)</label><select id="teacherSubjects" multiple size="6" style="width:100%">${subjectOptions}</select></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button type="button" id="cancelTeacher" class="btn btn-ghost">Cancel</button>
      <button type="button" id="sendReset" class="btn btn-ghost">Send password reset email</button>
      <button type="button" id="adminReset" class="btn btn-ghost">Admin reset password</button>
      <button type="button" id="updateTeacher" class="btn btn-primary">Save</button>
    </div>
  `);

  modalBody.querySelector('#cancelTeacher').onclick = (ev) => { if(ev && ev.preventDefault) ev.preventDefault(); closeModal(); };

  modalBody.querySelector('#sendReset').onclick = async () => {
    const email = (modalBody.querySelector('#teacherEmail').value || '').trim().toLowerCase();
    if(!email) return toast('Teacher has no email set' , 'warning');
    await sendResetEmailFor(email);
  };

  modalBody.querySelector('#adminReset').onclick = async () => {
    const newPass = (modalBody.querySelector('#teacherNewPassword').value || '').trim();
    if(!newPass || newPass.length < 6) return toast('Enter a new password of at least 6 characters to admin-reset');
    if(!t.authUid) return toast('Teacher has no linked auth account.');
    try{
      const token = currentUser && currentUser.getIdToken ? await currentUser.getIdToken(true) : null;
      const resp = await fetch('/admin/setTeacherPassword', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{}) },
        body: JSON.stringify({ uid: t.authUid, password: newPass })
      });
      if(!resp.ok){ toast('Admin reset failed (server)'); }
      else toast('Password updated via admin API');
    } catch(err){ console.error(err); toast('Admin reset API not available'); }
  };

  modalBody.querySelector('#updateTeacher').onclick = async (ev) => {
    if(ev && ev.preventDefault) ev.preventDefault();
    const btn = ev.currentTarget;
    try{
      setButtonLoading(btn, true, 'Saving...');
      const name = (modalBody.querySelector('#teacherName').value || '').trim();
      const phone = (modalBody.querySelector('#teacherPhone').value || '').trim();
      const parentPhone = (modalBody.querySelector('#teacherParentPhone').value || '').trim();
      const salaryVal = modalBody.querySelector('#teacherSalary').value;
      const salary = salaryVal ? Number(salaryVal) : null;
      const emailRaw = (modalBody.querySelector('#teacherEmail').value || '').trim();
      const email = emailRaw ? emailRaw.toLowerCase() : '';
      const newPass = (modalBody.querySelector('#teacherNewPassword').value || '').trim();
      const classesSelected = Array.from(modalBody.querySelectorAll('#teacherClasses option:checked')).map(o => o.value);
      const subjectsSelected = Array.from(modalBody.querySelectorAll('#teacherSubjects option:checked')).map(o => o.value);

      if(!name){ toast('Teacher name is required', 'warning'); setButtonLoading(btn, false); return; }
      if(email && isTeacherEmailDuplicate(email, t.id)) { toast('Email already used by another teacher', 'warning'); setButtonLoading(btn, false); return; }
      if(newPass && newPass.length < 6) { toast('New password must be at least 6 characters', 'warning'); setButtonLoading(btn, false); return; }

      if(email && !t.authUid && newPass){
        try {
          const uc = await createUserWithEmailAndPassword(auth, email, newPass);
          t.authUid = uc.user.uid;
        } catch(err){
          console.warn('createUserDuringUpdate failed', err);
          if(err && err.code === 'auth/email-already-in-use') toast('Email exists in Auth; saved without linking auth.' , 'warning');
          else toast('Failed to create auth user; saved without auth link.', 'error', 3000);
        }
      }

      await updateDoc(doc(db,'teachers', t.id), {
        fullName: name, phone: phone||'', parentPhone: parentPhone||'', salary: salary,
        classes: classesSelected, subjects: subjectsSelected, email: email||'', updatedAt: Timestamp.now(), updatedBy: currentUser ? currentUser.uid : null,
        ...(t.authUid ? { authUid: t.authUid } : {})
      });

      if(newPass && t.authUid){
        try {
          const token = currentUser && currentUser.getIdToken ? await currentUser.getIdToken(true) : null;
          const resp = await fetch('/admin/setTeacherPassword', {
            method:'POST',
            headers:{ 'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{}) },
            body: JSON.stringify({ uid: t.authUid, password: newPass })
          });
          if(!resp.ok){
            const em = email || t.email;
            if(em) { await sendPasswordResetEmail(auth, em); toast('Saved. Admin reset not available — reset email sent.' , 'warning'); }
            else toast('Saved. Admin reset not available (no email).', 'warning');
          } else {
            toast('Saved and password updated via admin API','success');
          }
        } catch(err){
          console.warn('admin reset failed in update flow', err);
          const em = email || t.email;
          if(em) { await sendPasswordResetEmail(auth, em); toast('Saved. Admin reset failed — reset email sent.'); }
          else toast('Saved. Admin reset failed (no email).', 'warning');
        }
      } else {
        toast('Teacher updated', 'success');
      }

      closeModal();
      await loadTeachers(); renderTeachers(); // refresh teachers only
    } catch(err){
      console.error('update teacher failed', err); toast('Failed to update teacher');
    }
    setButtonLoading(btn, false);
  };
}

/* ---------- Delete teacher (used by desktop rows) ---------- */
async function deleteTeacher(e){
  if(e && e.preventDefault) e.preventDefault();
  const id = e && e.target ? e.target.dataset.id : e;
  if(!id) return;
  const ok = await modalConfirm('Confirm delete', 'Move teacher to Recycle Bin?');
  if(!ok) return;
  const btn = (e && e.currentTarget) || null;
  if(btn) setButtonLoading(btn, true, 'Deleting...');
  try {
    const who = (currentUser && currentUser.uid) || (auth && auth.currentUser && auth.currentUser.uid) || null;
    await updateDoc(doc(db,'teachers', id), { 
      deleted: true,
      is_deleted: true,
      deletedAt: Timestamp.now(),
      deletedBy: currentUser?.uid || null,
      deletedByName: getCachedUserDisplayName(currentUser?.uid) || currentUser?.email || null,
      updatedAt: Timestamp.now()
       });
    toast('Teacher moved to Recycle Bin');
    await loadTeachers(); renderTeachers();
  } catch(err){
    console.error('delete teacher failed', err); toast('Failed to delete teacher');
  }
  if(btn) setButtonLoading(btn, false);
}

/* ensure add button wired (prevent default to avoid accidental form submit) */
if(typeof openAddTeacher !== 'undefined' && openAddTeacher){
  openAddTeacher.onclick = (ev) => { if(ev && ev.preventDefault) ev.preventDefault(); openAddTeacherModal(); };
}


async function sendResetEmailFor(email) {
  try {
    console.log('sendPasswordResetEmail -> requesting reset for', email);
    await sendPasswordResetEmail(auth, email);
    console.log('sendPasswordResetEmail -> accepted by Firebase (no network error)');
    toast('Password reset email sent. Ask teacher to check spam/junk and Promotions tabs.');
    return { ok: true };
  } catch (err) {
    console.error('sendPasswordResetEmail error', err);
    if (err.code === 'auth/user-not-found') {
      toast('No Auth user found with that email. Create an Auth account first (Firebase Console).');
    } else if (err.code === 'auth/invalid-email') {
      toast('Invalid email address.');
    } else if (err.code === 'auth/operation-not-allowed') {
      toast('Email/password sign-in is disabled in Firebase Console (enable it).');
    } else if (err.code === 'auth/network-request-failed') {
      toast('Network error. Check your connection.');
    } else {
      toast(err.message || 'Failed to send reset email (see console for details)');
    }
    return { ok: false, err };
  }
}






/* ---------- Improved renderClasses + Move Students modal & logic ---------- */


// REPLACE your existing renderClasses() with this version.
// Key change: delete button now shows modalConfirm(...) first. If user confirms,
// we mark the class deleted, remove it from classesCache and update UI immediately.
async function renderClasses(){
  try{
    const classesList = document.getElementById('classesList');
    if(!classesList) return;

    const desktopSearchEl = document.getElementById('classSearch');
    if(typeof window.classSearch === 'undefined' && desktopSearchEl) window.classSearch = desktopSearchEl;

    const q = (window.classSearch && window.classSearch.value || '').trim().toLowerCase();

    const allRaw = Array.isArray(classesCache) ? classesCache.slice() : [];
    const all = allRaw.filter(c => !c.deleted); // hide deleted
    let list = all.slice();
    if(q){
      list = list.filter(c => ((c.name||'').toLowerCase().includes(q) || String(c.id||'').toLowerCase().includes(q)));
    }

    const totalAll = all.length;
    const totalFiltered = list.length;
    const mobile = typeof isMobileViewport === 'function' ? isMobileViewport() : (window.innerWidth <= 900);

    const headerCounterEl = document.getElementById('classesTotalCount');
    if(headerCounterEl){
      headerCounterEl.textContent = (totalFiltered === totalAll)
        ? `Total classes: ${totalAll}`
        : `Total classes: ${totalAll} · Showing: ${totalFiltered}`;
    }

    const originalAddBtn = document.getElementById('openAddClass');
    if(originalAddBtn) originalAddBtn.style.display = 'none';

    // MOBILE (unchanged)
    if(mobile){
      let html = `
        <div class="mobile-only-header" style="margin-bottom:8px">
          <div style="display:flex;gap:8px;align-items:center">
            <input id="classSearchMobile" class="input" placeholder="Search class name or id..." style="flex:1;padding:8px;border:1px solid #e6eef8;border-radius:6px" value="${escapeHtml(window.classSearch?.value || '')}" />
            <button id="openAddClassMobile" class="btn btn-primary btn-sm">+ Add</button>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
            <div style="font-weight:700">Total: ${totalAll}</div>
            <div style="display:flex;gap:8px;align-items:center">
              ${ totalFiltered !== totalAll ? `<div class="muted">Showing: ${totalFiltered}</div>` : '' }
              <button id="openMoveAllMobile" class="btn btn-ghost btn-sm">Move all</button>
            </div>
          </div>
        </div>
      `;

      html += `<div id="classesMobileList">`;
      list.forEach((c, idx) => {
        const name = escapeHtml(c.name || '');
        const id = escapeHtml(c.id || '');
        const studentsCount = (typeof countStudentsInClass === 'function') ? countStudentsInClass(c.name || '') : (c._studentsCount || 0);
        const subjectsCount = (c.subjects || []).length;

        html += `
        <div style="padding:12px;border-bottom:1px solid #f1f5f9">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div style="display:flex;gap:10px;align-items:center;flex:1;min-width:0">
              <div style="min-width:28px;text-align:center;font-weight:700">${idx+1}</div>
              <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:800">${name}</div>
              <div style="font-size:12px;color:#64748b;margin-left:6px">Subjects ${subjectsCount}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
              <button class="btn btn-ghost btn-sm mobile-more" data-id="${id}" aria-label="Open view">⋮</button>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
            <div style="font-size:12px;color:#6b7280">ID: ${id}</div>
            <div style="font-size:12px;color:#059669">Students ${studentsCount}</div>
          </div>
        </div>`;
      });
      html += `</div>`;

      classesList.innerHTML = html;

      const addMobileBtn = document.getElementById('openAddClassMobile');
      if(addMobileBtn) addMobileBtn.onclick = () => { if(typeof openAddClass === 'function') openAddClass(); else document.getElementById('openAddClass')?.click(); };

      const openMoveAllMobileBtn = document.getElementById('openMoveAllMobile');
      if(openMoveAllMobileBtn) openMoveAllMobileBtn.onclick = () => { if(typeof openMoveStudentsModal === 'function') openMoveStudentsModal(); };

      const searchMobile = document.getElementById('classSearchMobile');
      if(searchMobile) searchMobile.oninput = (ev) => { if(window.classSearch) classSearch.value = ev.target.value; renderClasses(); };

      classesList.querySelectorAll('.mobile-more').forEach(btn => {
        btn.onclick = (ev) => {
          const cid = ev.currentTarget.dataset.id;
          if(typeof openViewClassModal === 'function') openViewClassModal({ target:{ dataset:{ id: cid } } });
          else window.location.href = `class.html?classId=${encodeURIComponent(cid)}`;
        };
      });

      return;
    }

    // DESKTOP
    const addBtnDesktop = document.getElementById('openAddClassDesktop');
    if(addBtnDesktop) addBtnDesktop.onclick = () => { if(typeof openAddClass === 'function') openAddClass(); else document.getElementById('openAddClass')?.click(); };
    const moveAllDesktop = document.getElementById('openMoveAllDesktop');
    if(moveAllDesktop) moveAllDesktop.onclick = () => { if(typeof openMoveStudentsModal === 'function') openMoveStudentsModal(); };

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:12px">
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;gap:12px;align-items:center">
            <strong style="font-size:1rem">Total classes: ${totalAll}</strong>
            ${ totalFiltered !== totalAll ? `<div class="muted">Showing: ${totalFiltered}</div>` : '' }
          </div>
          <div class="muted">Columns: No, Class, Total students, Total subjects</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center"></div>
      </div>
    `;

    html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="text-align:left;border-bottom:1px solid #e6eef8">
          <th style="padding:8px;width:48px">No</th>
          <th style="padding:8px">Class</th>
          <th style="padding:8px;width:140px">Total students</th>
          <th style="padding:8px;width:140px">Total subjects</th>
          <th style="padding:8px;width:220px">Actions</th>
        </tr>
      </thead><tbody>`;

    list.forEach((c, idx) => {
      const name = escapeHtml(c.name || '');
      const id = escapeHtml(c.id || '');
      const totalStudents = (typeof countStudentsInClass === 'function') ? countStudentsInClass(c.name || '') : (c._studentsCount || 0);
      const subjectsCount = (c.subjects || []).length;

      html += `<tr style="border-bottom:1px solid #f1f5f9" data-class-id="${id}">
        <td style="padding:8px;vertical-align:middle">${idx+1}</td>
        <td style="padding:8px;vertical-align:middle">
          <div style="font-weight:700">${name}</div>
          <div style="font-size:12px;color:#64748b">ID: ${id}</div>
        </td>
        <td style="padding:8px;vertical-align:middle">${totalStudents}</td>
        <td style="padding:8px;vertical-align:middle">${subjectsCount}</td>
        <td style="padding:8px;vertical-align:middle;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm view-class" data-id="${id}" title="View">View</button>
          <button class="btn btn-ghost btn-sm edit-class" data-id="${id}" title="Edit">Edit</button>
          <button class="btn btn-danger btn-sm del-class" data-id="${id}" title="Delete">Delete</button>
        </td>
      </tr>`;
    });

    html += `</tbody></table></div>`;
    classesList.innerHTML = html;

    // actions
    classesList.querySelectorAll('.view-class').forEach(b => {
      b.onclick = (ev) => {
        const id = ev.currentTarget.dataset.id;
        if(typeof openViewClassModal === 'function') openViewClassModal({ target:{ dataset:{ id } } });
        else window.location.href = `class.html?classId=${encodeURIComponent(id)}`;
      };
    });

    classesList.querySelectorAll('.edit-class').forEach(b => {
      b.onclick = (ev) => {
        const id = ev.currentTarget.dataset.id;
        if(typeof openEditClassModal === 'function'){
          try{ openEditClassModal(id); } catch(e){ try{ openEditClassModal({ currentTarget:{ dataset:{ id } } }); }catch(_){} }
        } else {
          window.location.href = `class-edit.html?classId=${encodeURIComponent(id)}`;
        }
      };
    });

    // DELETE: show modalConfirm first, then delete and update UI immediately if confirmed
    classesList.querySelectorAll('.del-class').forEach(b => {
      b.onclick = async (ev) => {
        const btn = ev.currentTarget;
        const id = btn.dataset.id;
        if(!id) return;

        // show modal confirm
        const ok = await modalConfirm('Delete Class', `Move <strong>${escapeHtml(id)}</strong> to Recycle Bin?`);
        if(!ok) return; // user cancelled

        setButtonLoading(btn, true, 'Deleting...');
        try {
          const who = (currentUser && currentUser.uid) || (auth && auth.currentUser && auth.currentUser.uid) || null;

          // Update Firestore to mark deleted
          await updateDoc(doc(db, 'classes', id), {
            deleted: true,
            deletedAt: Timestamp.now(),
            deletedBy: who
          });

          // remove from in-memory cache and DOM
          classesCache = (classesCache || []).filter(x => !(x.id === id));
          const row = classesList.querySelector(`tr[data-class-id="${CSS.escape(id)}"]`);
          if(row) row.remove();

          // adjust header count
          const visible = (classesCache || []).filter(c => !c.deleted);
          const visibleCount = visible.length;
          if(headerCounterEl){
            headerCounterEl.textContent = `Total classes: ${visibleCount}`;
          }

          // refresh filters/students
          if(typeof populateClassFilters === 'function') populateClassFilters();
          if(typeof loadStudents === 'function') await loadStudents();
          if(typeof renderStudents === 'function') renderStudents();

          toast('Class moved to Recycle Bin ' , 'info');
        } catch(err){
          console.error('delete class failed', err);
          toast('Delete failed' , 'error', 3000);
        } finally {
          setButtonLoading(btn, false);
          if(typeof renderClasses === 'function') renderClasses();
        }
      };
    });

    if(desktopSearchEl) desktopSearchEl.oninput = (ev) => { if(window.classSearch) classSearch.value = ev.target.value; renderClasses(); };

  }catch(err){
    console.error('renderClasses failed', err);
    const classesList = document.getElementById('classesList');
    if(classesList) classesList.innerHTML = `<div class="muted">Failed to render classes</div>`;
  }
}



/* ---------- Open Move Students Modal ---------- 
   - if sourceClassId provided, pre-select it in From list
   - supports:
     * manual mode (select From classes, pick To class)
     * auto-advance mode (advance every class to next class)
*/
// ---------- PICK UI (non-destructive overlay, DOES NOT close main modal) ----------
window.openPickClass = function openPickClass(initialSearch = '') {
  return new Promise((resolve) => {
    const classes = (classesCache || []).map(c => ({ id: c.id, name: c.name }));
    classes.sort((a,b) => {
      const ma = (a.name||'').match(/(\d+)/); const mb = (b.name||'').match(/(\d+)/);
      if(ma && mb && ma[1] !== mb[1]) return Number(ma[1]) - Number(mb[1]);
      return (a.name||'').localeCompare(b.name||'');
    });

    // create overlay container (keeps main modal intact)
    const overlay = document.createElement('div');
    overlay.className = 'pick-overlay';
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = 99999;
    overlay.style.background = 'rgba(0,0,0,0.32)';

    const inner = document.createElement('div');
    inner.style.minWidth = '320px';
    inner.style.maxWidth = '720px';
    inner.style.maxHeight = '80vh';
    inner.style.background = '#fff';
    inner.style.borderRadius = '10px';
    inner.style.boxShadow = '0 12px 40px rgba(2,6,23,0.2)';
    inner.style.padding = '12px';
    inner.style.overflow = 'hidden';
    inner.style.display = 'flex';
    inner.style.flexDirection = 'column';

    const listHtml = classes.map(c => `
      <div class="pick-row" data-name="${escape(c.name)}" data-id="${escape(c.id)}" style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #f1f5f9">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escape(c.name)}</div>
          <div style="font-size:12px;color:#64748b">${escape(c.id||'')}</div>
        </div>
        <div><button class="btn btn-ghost btn-sm pick-this">Pick</button></div>
      </div>`).join('');

    inner.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <input id="pickSearchInline" placeholder="Search by name or id..." style="flex:1;padding:8px;border-radius:8px;border:1px solid #e6eef8" value="${escapeHtml(initialSearch||'')}" />
        <button id="pickCancelInline" class="btn btn-ghost">Cancel</button>
      </div>
      <div id="pickListInline" style="max-height:60vh;overflow:auto;border:1px solid #f1f5f9;border-radius:8px;padding:6px">
        ${listHtml}
      </div>
    `;

    overlay.appendChild(inner);
    document.body.appendChild(overlay);

    const pickListEl = inner.querySelector('#pickListInline');
    const pickSearch = inner.querySelector('#pickSearchInline');

    // filter handler
    pickSearch.addEventListener('input', (ev) => {
      const q = (ev.target.value||'').trim().toLowerCase();
      Array.from(pickListEl.querySelectorAll('.pick-row')).forEach(r => {
        const txt = (r.textContent||'').toLowerCase();
        r.style.display = txt.includes(q) ? '' : 'none';
      });
    });

    // pick handlers (do NOT close main modal)
    pickListEl.querySelectorAll('.pick-this').forEach(btn => {
      btn.onclick = (ev) => {
        const row = ev.currentTarget.closest('.pick-row');
        const name = row.dataset.name;
        // remove overlay only
        overlay.remove();
        resolve(name);
      };
    });

    inner.querySelector('#pickCancelInline').onclick = () => {
      overlay.remove();
      resolve(null);
    };

    // allow clicking outside to cancel
    overlay.addEventListener('click', (ev) => {
      if(ev.target === overlay){ overlay.remove(); resolve(null); }
    });
  });
};

// ---------- openMoveStudentsModal (updated: numeric-only next, graduation handling, pick overlay) ----------

async function openMoveStudentsModal(sourceClassId){
  // prepare classes
  const classes = (classesCache || []).map(c => ({ id: c.id, name: c.name }));
  if(!classes || classes.length === 0) return toast('No classes available' , 'info');

  function classSortKey(c){
    const m = (c.name || '').match(/(\d+)/);
    if(m) return `${String(Number(m[1])).padStart(5,'0')}-${c.name}`;
    return `zz-${(c.name||'').toLowerCase()}`;
  }
  classes.sort((a,b) => classSortKey(a) < classSortKey(b) ? -1 : 1);

  // HELPER: extract first number in name (numeric only)
  function extractNumber(name){
    const m = String(name||'').match(/(\d+)/);
    return m ? Number(m[1]) : null;
  }

  // find best next by numeric part only (ignore letters)
  const orderedNames = classes.map(c => c.name);
  const findBestNext = (name) => {
    const num = extractNumber(name);
    if(num === null) {
      // fallback: next in order
      const idx = orderedNames.indexOf(name);
      if(idx >= 0 && idx < orderedNames.length - 1) return orderedNames[idx+1];
      return null;
    }
    const target = num + 1;
    // find any class whose numeric part equals target (ignore letters)
    const found = classes.find(c => {
      const n = extractNumber(c.name);
      return n === target;
    });
    if(found) return found.name;
    // fallback: next in order if numeric match not found
    const idx = orderedNames.indexOf(name);
    if(idx >= 0 && idx < orderedNames.length - 1) return orderedNames[idx+1];
    return null;
  };

  // Build initial rows
  const rows = classes.map(c => {
    const dest = findBestNext(c.name);
    return { id: c.id, name: c.name, checked: true, dest, studentsSelected: null, expanded: false };
  });

  // UI html responsive (same as before)
  const html = `
    <style>
      .mv-grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; min-width:420px; max-width:980px; }
      @media(max-width:900px){ .mv-grid { grid-template-columns: 1fr; } }
      .mv-left, .mv-right { border-radius:8px; background:#fff; padding:8px; border:1px solid #f1f5f9; box-shadow:0 6px 18px rgba(2,6,23,0.04); }
      .mv-row { display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #f3f6f9 }
      .mv-row-last { border-bottom: none; }
      .mv-name { font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .mv-id { font-size:12px;color:#64748b; margin-left:6px; white-space:nowrap; }
      .mv-actions { margin-left:auto; display:flex; gap:6px; align-items:center; }
      .mv-students { padding:8px 12px; background:#fafafa; border-radius:6px; margin-top:6px; max-height:240px; overflow:auto; border:1px solid #f1f5f9}
      .mv-student-row { display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid #f3f6f9 }
      .muted { color:#6b7280 }
      .pick-btn { min-width:80px; }
      .small-ghost { padding:6px 8px; font-size:13px; }
    </style>

    <div class="mv-grid">
      <div class="mv-left">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <input id="mvGlobalSearch" placeholder="Search classes (name or id)..." style="flex:1;padding:8px;border-radius:8px;border:1px solid #e6eef8" />
          <button id="mvSelectAllBtn" class="btn btn-ghost small-ghost">Select all</button>
        </div>
        <div id="mvFromList" style="max-height:420px;overflow:auto">
          <!-- rows inserted here -->
        </div>
      </div>

      <div class="mv-right">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <label style="font-weight:700;margin-right:auto">Move TO (destination)</label>
          <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="mvAutoAdvance" /> <span class="muted">Auto-advance</span></label>
        </div>

        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <input id="mvToSearch" placeholder="Search destination class..." style="flex:1;padding:8px;border-radius:8px;border:1px solid #e6eef8" />
          <select id="mvToSelect" style="padding:8px;border-radius:8px;border:1px solid #e6eef8;min-width:200px">
            <option value="">-- pick destination (applies to all if set) --</option>
            ${classes.map(c => `<option value="${escape(c.name)}">${escape(c.name)} (${escape(c.id||'')})</option>`).join('')}
          </select>
        </div>

        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <button id="mvPreviewBtn" class="btn btn-ghost">Preview</button>
          <div id="mvCountsPreview" class="muted" style="margin-left:auto"></div>
        </div>

        <div style="font-size:13px;color:#6b7280">Notes: Uncheck classes you don't want to move. Expand a class to choose specific students. "Auto-advance" ignores the global destination and maps each class to its next class automatically.</div>
      </div>
    </div>

    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="mvCancel" class="btn btn-ghost">Cancel</button>
      <button id="mvExecute" class="btn btn-primary">Move students</button>
    </div>
  `;

  showModal('Move Students — bulk', html);

  const $m = sel => (typeof modalBody !== 'undefined' && modalBody) ? modalBody.querySelector(sel) : null;
  const fromListEl = $m('#mvFromList');
  const mvGlobalSearch = $m('#mvGlobalSearch');
  const mvToSearch = $m('#mvToSearch');
  const mvToSelect = $m('#mvToSelect');
  const mvAutoAdvance = $m('#mvAutoAdvance');

  // render rows into left panel
  function renderFromRows(filterQ = '') {
    const q = (filterQ||'').trim().toLowerCase();
    const htmlRows = rows.map((r, idx) => {
      const hidden = q && !((r.name||'').toLowerCase().includes(q) || (r.id||'').toLowerCase().includes(q));
      return `
        <div class="mv-row ${idx === rows.length-1 ? 'mv-row-last' : ''}" data-idx="${idx}" style="${hidden ? 'display:none' : ''}">
          <input type="checkbox" class="mv-from-checkbox" data-idx="${idx}" ${r.checked ? 'checked' : ''} />
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px">
              <div class="mv-name">${escape(r.name)}</div>
              <div class="mv-id muted">${escape(r.id||'')}</div>
            </div>
            <div style="margin-top:4px;display:flex;gap:8px;align-items:center">
              <button class="btn btn-ghost btn-sm pick-btn" data-idx="${idx}">Pick destination</button>
              <button class="btn btn-ghost btn-sm toggle-students" data-idx="${idx}">${r.expanded ? 'Hide' : 'Students'}</button>
              <div class="muted" style="margin-left:auto">Dest: <span class="mv-dest">${escape(r.dest||'')}</span></div>
            </div>
            <div class="mv-students" data-idx="${idx}" style="display:${r.expanded ? 'block' : 'none'}"></div>
          </div>
        </div>
      `;
    }).join('');
    fromListEl.innerHTML = htmlRows;

    // wire per-row buttons
    fromListEl.querySelectorAll('.mv-from-checkbox').forEach(ch => {
      ch.onchange = (ev) => {
        const idx = Number(ev.currentTarget.dataset.idx);
        rows[idx].checked = !!ev.currentTarget.checked;
      };
    });
    fromListEl.querySelectorAll('.pick-btn').forEach(btn => {
      btn.onclick = async (ev) => {
        const idx = Number(ev.currentTarget.dataset.idx);
        // open pick overlay (does NOT close main modal)
        const chosen = await window.openPickClass(rows[idx].dest || '');
        if(chosen){
          rows[idx].dest = chosen;
          // reflect in UI
          const destSpan = fromListEl.querySelector(`.mv-row[data-idx="${idx}"] .mv-dest`);
          if(destSpan) destSpan.textContent = chosen;
          // keep main modal open (we did not call closeModal)
        }
      };
    });
    fromListEl.querySelectorAll('.toggle-students').forEach(btn => {
      btn.onclick = async (ev) => {
        const idx = Number(ev.currentTarget.dataset.idx);
        rows[idx].expanded = !rows[idx].expanded;
        const container = fromListEl.querySelector(`.mv-students[data-idx="${idx}"]`);
        // toggle
        if(!rows[idx].expanded){
          container.style.display = 'none';
          btn.textContent = 'Students';
          return;
        }
        // expand: load student list for that class (from cache or Firestore), excluding deleted
        btn.textContent = 'Hide';
        container.innerHTML = '<div class="muted">Loading students…</div>';
        container.style.display = 'block';
        try{
          let studs = [];
          if(Array.isArray(studentsCache) && studentsCache.length){
            studs = (studentsCache || []).filter(s => (s.classId||'') === rows[idx].name && s.status !== 'deleted');
          } else {
            const snap = await getDocs(query(collection(db,'students'), where('classId','==', rows[idx].name)));
            studs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.status !== 'deleted');
          }
          // by default, select all students for this class unless user previously set a selection
          const selSet = new Set(rows[idx].studentsSelected && Array.isArray(rows[idx].studentsSelected) ? rows[idx].studentsSelected : studs.map(s => s.id || s.studentId || s.id));
          const studsHtml = studs.map(s => `
            <div class="mv-student-row" data-stud-id="${escape(s.id||s.studentId||s.studentId||'')}">
              <input type="checkbox" class="mv-stud-ch" data-idx="${idx}" data-stud-id="${escape(s.id||s.studentId||s.id||'')}" ${selSet.has(s.id||s.studentId||s.id) ? 'checked' : ''} />
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escape(s.fullName||s.name||'—')}</div>
                <div class="muted" style="font-size:12px">ID: ${escape(s.studentId||s.id||'—')}</div>
              </div>
            </div>
          `).join('');
          container.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
              <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" class="mv-stud-selectall" data-idx="${idx}" checked /> <span class="muted">Select all students</span></label>
            </div>
            ${studsHtml || '<div class="muted">No students</div>'}
          `;
          // wire selects
          container.querySelectorAll('.mv-stud-ch').forEach(ch => {
            ch.onchange = () => {
              // recompute selected array
              const selected = Array.from(container.querySelectorAll('.mv-stud-ch:checked')).map(c => c.dataset.studId);
              rows[idx].studentsSelected = selected;
              // update select all checkbox
              const chkAll = container.querySelector('.mv-stud-selectall');
              if(chkAll) chkAll.checked = container.querySelectorAll('.mv-stud-ch:checked').length === container.querySelectorAll('.mv-stud-ch').length;
            };
          });
          container.querySelector('.mv-stud-selectall')?.addEventListener('change', (ev) => {
            const checked = !!ev.target.checked;
            container.querySelectorAll('.mv-stud-ch').forEach(c => c.checked = checked);
            rows[idx].studentsSelected = checked ? Array.from(container.querySelectorAll('.mv-stud-ch')).map(c => c.dataset.studId) : [];
          });
        } catch(e){
          console.error('failed load class students', e);
          container.innerHTML = '<div class="muted">Failed to load students</div>';
        }
      };
    });
  }

  // initial render
  renderFromRows();

  // global search handlers
  mvGlobalSearch?.addEventListener('input', (ev) => renderFromRows(ev.target.value));
  $m('#mvSelectAllBtn')?.addEventListener('click', () => {
    const visibleRows = Array.from(fromListEl.querySelectorAll('.mv-row')).filter(r => r.style.display !== 'none');
    visibleRows.forEach(r => {
      const idx = Number(r.dataset.idx);
      rows[idx].checked = true;
      const ch = r.querySelector('.mv-from-checkbox');
      if(ch) ch.checked = true;
    });
  });

  // destination search & select (applies to global mvToSelect)
  mvToSearch?.addEventListener('input', (ev) => {
    const q = (ev.target.value||'').trim().toLowerCase();
    Array.from(mvToSelect.options).forEach(opt => {
      if(!opt.value) { opt.style.display = ''; return; }
      const txt = (opt.textContent||'').toLowerCase();
      opt.style.display = txt.includes(q) ? '' : 'none';
    });
  });

  // Preview button - counts selected students
  function setPreviewText(txt){ try { const el = $m('#mvCountsPreview'); if(el) el.textContent = txt; } catch(e){} }
  $m('#mvPreviewBtn').onclick = async () => {
    try {
      setPreviewText('Counting…');
      const selectedRows = rows.filter(r => r.checked);
      if(selectedRows.length === 0){ setPreviewText('No classes selected'); return; }

      let total = 0;
      for(const r of selectedRows){
        if(r.studentsSelected === null){
          const cached = (studentsCache || []).filter(s => (s.classId||'') === r.name && s.status !== 'deleted');
          if(cached && cached.length) total += cached.length;
          else {
            const snap = await getDocs(query(collection(db,'students'), where('classId','==', r.name)));
            if(snap && snap.docs) total += snap.docs.filter(d => (d.data().status||'') !== 'deleted').length;
          }
        } else {
          total += (r.studentsSelected || []).length;
        }
      }
      setPreviewText(`Preview: ${total} student(s) will be moved`);
    } catch(err){
      console.error('preview failed', err);
      setPreviewText('Preview failed');
    }
  };

  // Execute move
  $m('#mvExecute').onclick = async (ev) => {
    const btn = ev.currentTarget;
    try {
      const selectedRows = rows.filter(r => r.checked);
      if(selectedRows.length === 0) return toast('Select at least one source class', 'info');
      const auto = mvAutoAdvance && mvAutoAdvance.checked;
      const globalDest = mvToSelect && mvToSelect.value && mvToSelect.value.trim();

      // Build mapping per source -> destination
      const mapping = {};
      if(auto){
        selectedRows.forEach(r => mapping[r.name] = findBestNext(r.name));
      } else {
        selectedRows.forEach(r => mapping[r.name] = (globalDest && globalDest !== '') ? globalDest : r.dest);
      }

      // detect sources that have no next (mapped to null or same)
      const finalSources = Object.entries(mapping).filter(([src,to]) => !to || String(to).trim() === '' || to === src).map(([s]) => s);

      // If some classes are final (no next), ask once whether to mark their students graduated
      let markGraduated = false;
      if(finalSources.length){
        const msg = `The following selected classes appear to be the last (no next-number class found):<br/><br/>${finalSources.map(s => escape(s)).join('<br/>')}<br/><br/>Would you like to mark the students in these classes as <strong>graduated</strong>? (Yes → set status='graduated', No → skip moving these students)`;
        markGraduated = await modalConfirm('Final class detected — graduate students?', msg);
        // if user declines, we'll skip those classes (mapping for them will be deleted)
        if(!markGraduated){
          finalSources.forEach(s => { delete mapping[s]; });
        }
      }

      // collect students to move (and students to graduate)
      const studentsToMove = [];
      const studentsToGraduate = [];

      for(const r of selectedRows){
        const to = mapping[r.name];
        // if mapping absent, skip this source
        if(!to) {
          // if user chose to graduate and this source was one of the finals, collect them to graduate
          if(markGraduated && finalSources.includes(r.name)){
            // fetch students for r.name
            let studs = [];
            if(Array.isArray(studentsCache) && studentsCache.length){
              studs = (studentsCache || []).filter(s => (s.classId||'') === r.name && s.status !== 'deleted');
            } else {
              const snap = await getDocs(query(collection(db,'students'), where('classId','==', r.name)));
              studs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.status !== 'deleted');
            }
            studs.forEach(s => studentsToGraduate.push({ id: s.id || s.studentId || s._id, name: s.fullName || s.name || '', from: r.name }));
          }
          continue;
        }

        // get students list for moving
        let studs = [];
        if(r.studentsSelected === null){
          if(Array.isArray(studentsCache) && studentsCache.length){
            studs = (studentsCache || []).filter(s => (s.classId||'') === r.name && s.status !== 'deleted');
          } else {
            const snap = await getDocs(query(collection(db,'students'), where('classId','==', r.name)));
            studs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.status !== 'deleted');
          }
        } else {
          const ids = r.studentsSelected || [];
          if(Array.isArray(studentsCache) && studentsCache.length){
            studs = studentsCache.filter(s => ids.includes((s.id||s.studentId||s.studentId)));
          } else {
            studs = [];
            for(const sid of ids){
              try {
                const docRef = doc(db,'students', sid);
                const docSnap = await getDoc(docRef);
                if(docSnap && docSnap.exists()) {
                  const data = docSnap.data();
                  if(data.status !== 'deleted') studs.push({ id: docSnap.id, ...data });
                }
              } catch(e){ console.warn('failed fetch student', sid, e); }
            }
          }
        }

        studs.forEach(s => {
          studentsToMove.push({ id: s.id || s.studentId || s._id, name: s.fullName || s.name || '', from: r.name, to });
        });
      }

      if(studentsToMove.length === 0 && studentsToGraduate.length === 0) return toast('No students found to move or graduate', 'info');

      // Confirmation: summarise mapping and grad count
      const mappingSummary = Object.entries(mapping).map(([s,t]) => `${escape(s)} → ${t ? escape(t) : '<em>(skipped)</em>'}`).join('<br/>');
      const gradSummary = studentsToGraduate.length ? `<br/><br/>Graduates: ${studentsToGraduate.length}` : '';
      const ok = await modalConfirm('Confirm move', `Move ${studentsToMove.length} students?<br/><br/>Mapping:<br/>${mappingSummary}${gradSummary}<br/><br/>Proceed?`);
      if(!ok) return;

      setButtonLoading(btn, true, 'Moving...');

      const chunkSize = 50;
      let done = 0;
      const errors = [];

      // 1) Move students
      for(let i=0;i<studentsToMove.length;i+=chunkSize){
        const chunk = studentsToMove.slice(i,i+chunkSize);
        await Promise.all(chunk.map(async sRec => {
          try {
            await updateDoc(doc(db,'students', sRec.id), { classId: sRec.to });
            done++;
            const sc = (studentsCache || []).find(x => (x.studentId===sRec.id || x.id===sRec.id));
            if(sc) sc.classId = sRec.to;
          } catch(err){
            console.error('move student failed', sRec, err);
            errors.push({ student: sRec, error: String(err && err.message ? err.message : err) });
          }
        }));
        setPreviewText && setPreviewText(`Progress: ${done}/${studentsToMove.length}`);
      }

      // 2) Graduate students (if confirmed)
      if(markGraduated && studentsToGraduate.length){
        for(let i=0;i<studentsToGraduate.length;i+=chunkSize){
          const chunk = studentsToGraduate.slice(i,i+chunkSize);
          await Promise.all(chunk.map(async sRec => {
            try {
              await updateDoc(doc(db,'students', sRec.id), { status: 'graduated', classId: '' });
              const sc = (studentsCache || []).find(x => (x.studentId===sRec.id || x.id===sRec.id));
              if(sc){ sc.status = 'graduated'; sc.classId = ''; }
            } catch(err){
              console.error('graduate student failed', sRec, err);
              errors.push({ student: sRec, error: String(err && err.message ? err.message : err) });
            }
          }));
        }
      }

      setButtonLoading(btn, false);

      if(errors.length){
        toast(`Some operations failed (${errors.length}). Check console.`, 'error', 3000);
      } else {
        toast(`Done: moved ${studentsToMove.length}${markGraduated ? `, graduated ${studentsToGraduate.length}` : ''}` , 'success');
      }

      // refresh caches and UI
      if(typeof loadStudents === 'function') await loadStudents();
      if(typeof renderStudents === 'function') renderStudents();
      if(typeof loadClasses === 'function') await loadClasses();
      if(typeof renderClasses === 'function') renderClasses();

      // keep UX: DO NOT close main modal automatically in case user wants further actions
      // (user requested pick should not close main modal), but you can close manually by Cancel or when you prefer.
      // If you want to auto-close, uncomment next line:
      // closeModal();

    } catch(err){
      console.error('move execution failed', err);
      setButtonLoading(ev.currentTarget, false);
      toast('Move failed' , 'error', 3000);
    }
  };

  // Cancel
  $m('#mvCancel').onclick = closeModal;
}


/* ---------- FIXED: openViewClassModal (single header, counters left, reliable handlers) ---------- */
async function openViewClassModal(e){
  const id = (e && e.target && e.target.dataset && e.target.dataset.id) ? e.target.dataset.id
           : (e && e.dataset && e.dataset.id) ? e.dataset.id
           : e;
  if(!id) return toast && toast('Class not found', 'info');

  const c = (classesCache || []).find(x => x.id === id || x.name === id);
  if(!c) return toast && toast('Class not found' , 'info');

  const assigned = (studentsCache || []).filter(s => (s.classId || '') === (c.name || c.id || ''));
  const teachersAssigned = (teachersCache || []).filter(t => {
    if(t.classIds && Array.isArray(t.classIds)) return t.classIds.includes(c.name) || t.classIds.includes(c.id);
    if(c.subjects && t.subjects) return t.subjects.some(sub => c.subjects.includes(sub));
    return false;
  });

  // inject small CSS (once) — updated so mobile rows stay in one horizontal line with ellipsis
  if(!document.getElementById('class-view-styles')){
    const style = document.createElement('style');
    style.id = 'class-view-styles';
    style.innerHTML = `
      .cv-root { display:flex;flex-direction:column;gap:12px;max-height:88vh;overflow:auto;font-family:Inter,system-ui,Arial,Helvetica,sans-serif }
      .cv-header { display:flex;justify-content:space-between;align-items:center;gap:12px; padding-bottom:6px; border-bottom:1px solid #eef2f7 }
      .cv-title { font-weight:800;font-size:18px }
      .cv-actions { display:flex;gap:8px;align-items:center }
      .cv-primary { display:flex;gap:8px;flex-wrap:wrap }
      .cv-tabs { display:flex;gap:8px;margin-top:8px }
      .cv-tab { padding:8px 12px;border-radius:8px;cursor:pointer;border:1px solid transparent; user-select:none }
      .cv-tab.active { background:#0ea5e9;color:#fff }
      .cv-panel { background:#fff;padding:12px;border-radius:8px;box-shadow:0 6px 18px rgba(2,6,23,0.04); margin-top:8px }
      /* rows: keep horizontal layout even on mobile; use ellipsis for overflow */
      .cv-row { padding:10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:12px;flex-wrap:nowrap }
      .cv-left-index { width:36px; text-align:left; font-weight:700; color:#0f172a; flex: 0 0 36px; }
      .cv-item-main { flex:1 1 auto; min-width:0; display:flex;gap:8px;align-items:center;overflow:hidden }
      .cv-item-main .cv-name { font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .cv-item-main .cv-meta-inline { color:#64748b;font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-left:6px; }
      .cv-actions-inline { display:flex;gap:8px; align-items:center; flex: 0 0 auto; margin-left:8px }
      .cv-bottom-actions { position:sticky;bottom:12px;left:0;right:0;display:flex;justify-content:center;gap:12px;padding:12px;background:linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.96)); }
      .cv-btn-edit { background:#0ea5e9;color:#fff;border-radius:8px;padding:10px 16px;border:0; cursor:pointer }
      .cv-btn-delete { background:#ef4444;color:#fff;border-radius:8px;padding:10px 16px;border:0; cursor:pointer }
      .subject-id-blue { color:#0ea5e9; font-weight:600; font-size:13px; margin-left:6px; }
      .muted { color:#6b7280 }
      /* Small screens: shrink index and meta, keep single-line behaviour */
      @media(max-width:900px){
        .cv-left-index { width:28px; flex: 0 0 28px; }
        .cv-item-main { gap:6px; }
        .cv-item-main .cv-name { font-size:14px; }
        .cv-item-main .cv-meta-inline { font-size:12px; color:#6b7280; }
        .cv-actions-inline { margin-left:8px }
      }
    `;
    document.head.appendChild(style);
  }

  // Build subjects using real subject ids from subjectsCache when present
  const subjectsList = (c.subjects || []).map((subName) => {
    let subObj = null;
    if(Array.isArray(subjectsCache)){
      subObj = subjectsCache.find(s => (s.name && String(s.name).trim() === String(subName).trim()) || (s.id && String(s.id) === String(subName)) || (s.subjectId && String(s.subjectId) === String(subName)));
    }
    return {
      displayName: subObj ? (subObj.name || subName) : subName,
      realId: subObj ? (subObj.id || subObj.subjectId || '') : ''
    };
  });

  // subjects HTML — single-line per subject (name + id inline)
  const subjectsHtml = subjectsList.length ? subjectsList.map((s,i)=> `
    <div class="cv-row" data-sub="${i}">
      <div class="cv-left-index">${i+1}</div>
      <div class="cv-item-main">
        <div class="cv-name">${escape(s.displayName)}</div>
        ${s.realId ? `<div class="cv-meta-inline subject-id-blue">${escape(s.realId)}</div>` : ''}
      </div>
      <div class="cv-actions-inline cv-meta">${i+1}</div>
    </div>
  `).join('') : `<div class="muted">No subjects assigned</div>`;

  // students HTML — single-line per student: name + small meta inline
  const studentsHtml = (assigned.length ? assigned.map((st,i)=> `
    <div class="cv-row" data-student-id="${escape(st.studentId||st.id||'')}">
      <div class="cv-left-index">${i+1}</div>
      <div class="cv-item-main">
        <div class="cv-name">${escape(st.fullName||'—')}</div>
        <div class="cv-meta-inline">ID: ${escape(st.studentId||st.id||'—')}${(typeof st.fee !== 'undefined' && st.fee !== null) ? ` • Fee: ${escape(String(st.fee))}` : ''}</div>
      </div>
      <div class="cv-actions-inline">
        <button class="btn btn-ghost btn-sm view-student" data-id="${escape(st.studentId||st.id||'')}">View</button>
      </div>
    </div>
  `).join('') : `<div class="muted">No students</div>`);

  // teachers HTML — single-line per teacher: name + meta inline
  const teachersHtml = (teachersAssigned.length ? teachersAssigned.map((t,i)=> {
    const assignedToThisClass = (t.subjects || []).filter(s => (c.subjects || []).includes(s));
    return `
      <div class="cv-row" data-teacher-id="${escape(t.id||t.teacherId||'')}">
        <div class="cv-left-index">${i+1}</div>
        <div class="cv-item-main">
          <div class="cv-name">${escape(t.fullName||t.name||'—')}</div>
          <div class="cv-meta-inline">ID: ${escape(t.id||t.teacherId||'—')} • Salary: ${escape(t.salary||'—')} ${assignedToThisClass.length ? `• ${escape(assignedToThisClass.join(', '))}` : ''}</div>
        </div>
        <div class="cv-actions-inline">
          <button class="btn btn-ghost btn-sm view-teacher" data-id="${escape(t.id||t.teacherId||'')}">View</button>
        </div>
      </div>
    `;
  }).join('') : `<div class="muted">No teachers</div>`);

  const html = `
    <div class="cv-root">
      <div class="cv-header">
        <div>
          <div class="cv-title">${escape(c.name||'')}</div>
          <div class="cv-meta">ID: ${escape(c.id||'')}</div>
        </div>
        <div class="cv-actions">
          <div class="cv-primary">
            <button id="cvMoveBtn" class="btn">Move students</button>
            <button id="cvFeeBtn" class="btn">Set fee</button>
            <button id="cvTTBtn" class="btn">Timetable</button>
          </div>
        </div>
      </div>

      <div class="cv-tabs" role="tablist">
        <div id="tabSubjects" class="cv-tab active" role="tab">Subjects</div>
        <div id="tabStudents" class="cv-tab" role="tab">Students</div>
        <div id="tabTeachers" class="cv-tab" role="tab">Teachers</div>
      </div>

      <div class="cv-panel">
        <div id="cvSubjectsArea" style="display:block">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <div style="font-weight:700">Subjects</div>
            <div class="muted">${subjectsList.length} total</div>
          </div>
          ${subjectsHtml}
        </div>

        <div id="cvStudentsArea" style="display:none">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <div style="font-weight:700">Students</div>
            <div class="muted">${assigned.length} total</div>
          </div>
          ${studentsHtml}
        </div>

        <div id="cvTeachersArea" style="display:none">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <div style="font-weight:700">Teachers</div>
            <div class="muted">${teachersAssigned.length} total</div>
          </div>
          ${teachersHtml}
        </div>
      </div>

      <div class="cv-bottom-actions">
        <button id="cvEditBtn" class="cv-btn-edit">Edit</button>
        <button id="cvDeleteBtn" class="cv-btn-delete">Delete</button>
      </div>
    </div>
  `;

  showModal(`Class — ${escape(c.name||'')}`, html);

  const modalRoot = (typeof modalBody !== 'undefined' && modalBody) ? modalBody : document;
  const el = (idStr) => modalRoot.querySelector && modalRoot.querySelector(`#${idStr}`);
  el('cvMoveBtn') && (el('cvMoveBtn').onclick = () => openMoveStudentsModal(c.id));
  el('cvFeeBtn') && (el('cvFeeBtn').onclick = () => openSetFeeModal(c.id));
  el('cvTTBtn') && (el('cvTTBtn').onclick = () => openTimetableModal(c.id));

  function setActiveTab(name){
    ['Subjects','Students','Teachers'].forEach(tn => {
      const tabEl = modalRoot.querySelector(`#tab${tn}`);
      const panel = modalRoot.querySelector(`#cv${tn}Area`);
      if(tabEl) tabEl.classList.toggle('active', tn === name);
      if(panel) panel.style.display = (tn === name) ? 'block' : 'none';
    });
  }
  modalRoot.querySelector('#tabSubjects')?.addEventListener('click', () => setActiveTab('Subjects'));
  modalRoot.querySelector('#tabStudents')?.addEventListener('click', () => setActiveTab('Students'));
  modalRoot.querySelector('#tabTeachers')?.addEventListener('click', () => setActiveTab('Teachers'));

  // delegation for internal buttons
  modalRoot.addEventListener('click', function delegatedClassView(ev){
    const t = ev.target;
    if(!t) return;
    const vs = t.closest && t.closest('.view-student');
    if(vs){ const sid = vs.dataset.id; if(typeof openViewStudentModal === 'function') openViewStudentModal({ target: { dataset: { id: sid } } }); else window.location.href = `student.html?studentId=${encodeURIComponent(sid)}`; return; }
    const vt = t.closest && t.closest('.view-teacher');
    if(vt){ const tid = vt.dataset.id; if(typeof openViewTeacherModal === 'function') openViewTeacherModal({ target: { dataset: { id: tid } } }); else window.location.href = `teacher.html?teacherId=${encodeURIComponent(tid)}`; return; }
    if(t.id === 'cvEditBtn' || (t.closest && t.closest('#cvEditBtn'))){
      if(typeof openEditClassModal === 'function'){ try{ openEditClassModal({ currentTarget:{ dataset:{ id: c.id } } }); }catch(e){ try{ openEditClassModal(c.id); }catch(_){} } return; }
      showModal('Edit class name', `<div><label>Class name</label><div><input id="plainClassName" value="${escape(c.name||'')}" style="width:100%;padding:8px;border:1px solid #e6eef8;border-radius:6px" /></div></div><div style="margin-top:10px;display:flex;justify-content:flex-end;gap:8px"><button id="plainEditCancel" class="btn btn-ghost">Cancel</button><button id="plainEditSave" class="btn btn-primary">Save</button></div>`);
      const root = (typeof modalBody !== 'undefined' && modalBody) ? modalBody : document;
      root.querySelector('#plainEditCancel')?.addEventListener('click', closeModal);
      root.querySelector('#plainEditSave')?.addEventListener('click', async (ev) => {
        const btn = ev.currentTarget; setButtonLoading(btn,true,'Saving...');
        const newName = (root.querySelector('#plainClassName')?.value||'').trim();
        if(!newName){ toast('Class name required' , 'info'); setButtonLoading(btn,false); return; }
        try{ await updateDoc(doc(db,'classes', c.id), { name: newName }); await loadClasses(); renderClasses(); toast('Class updated', 'success'); closeModal(); } catch(err){ console.error(err); toast('Update failed', 'error', 3000); }
        setButtonLoading(btn,false);
      });
      return;
    }
    if(t.id === 'cvDeleteBtn' || (t.closest && t.closest('#cvDeleteBtn'))){
      (async ()=>{
        const ok = await modalConfirm('Delete class', `Move <strong>${escape(c.name||'')}</strong> to Recycle Bin?`);
        if(!ok) return;
        const btn = modalRoot.querySelector('#cvDeleteBtn'); setButtonLoading(btn,true,'Deleting...');
        try{ await deleteClass({ target:{ dataset:{ id: c.id } } }); closeModal(); } catch(err){ console.error(err); toast('Delete failed', 'error', 3000); }
        setButtonLoading(btn,false);
      })();
      return;
    }
  }, { once:false });

  ['cvMoveBtn','cvFeeBtn','cvTTBtn','cvEditBtn','cvDeleteBtn'].forEach(idStr => { const elx = modalRoot.querySelector && modalRoot.querySelector(`#${idStr}`); if(elx) elx.setAttribute('aria-pressed','false'); });
}




// end openViewClassModal

/* ---------- UPDATED: openTimetableModal (editor + post-save read-only viewer) ---------- */
async function openTimetableModal(classId){
  const cls = classesCache.find(x => x.id===classId || x.name===classId);
  if(!cls) return toast('Class not found','info');

  // find existing timetable doc (if any)
  let timetableDoc = null;
  try {
    const snap = await getDocs(query(collection(db,'timetables'), where('classId','==', cls.id || cls.name)));
    if(snap && snap.docs && snap.docs.length) timetableDoc = { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch(err){ console.warn('load timetable failed', err); }

  // Data sources for dropdowns
  const classSubjects = (cls.subjects || []).slice();
  const teacherBySubject = {};
  const teacherById = {};
  (teachersCache || []).forEach(t => {
    const subjects = t.subjects || (t.subjectName ? [t.subjectName] : []);
    const teachesThisClass = (t.classIds && t.classIds.includes(cls.name)) || subjects.some(s => classSubjects.includes(s));
    if(!teachesThisClass) return;
    const tid = t.id || t.teacherId || t.email || ('t' + Math.random().toString(36).slice(2,6));
    subjects.forEach(s => {
      if(!classSubjects.includes(s)) return;
      teacherBySubject[s] = teacherBySubject[s] || [];
      teacherBySubject[s].push({ id: tid, name: t.fullName || t.name || t.teacherId || t.id });
      teacherById[tid] = t.fullName || t.name || t.teacherId || t.id;
    });
    const tid2 = t.id || t.teacherId || t.email;
    if(tid2) teacherById[tid2] = t.fullName || t.name || t.teacherId || t.id;
  });

  // canonical week order (Saturday → Friday)
  const days = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday'];
  const defaultDays = ['Saturday','Sunday','Monday','Tuesday','Wednesday'];

  // ensure modal CSS (small responsive & fit improvements + sticky header/first-col)
  if(!document.getElementById('tt-modal-styles')){
    const style = document.createElement('style');
    style.id = 'tt-modal-styles';
    style.innerHTML = `
      .tt-header { display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap }
      .tt-controls { display:flex;gap:8px;align-items:center;flex-wrap:wrap }
      .tt-days { display:flex;gap:8px;flex-wrap:wrap;align-items:center }
      .tt-editor { width:100%; overflow:auto; margin-top:10px; }
      .tt-table { width:100%; border-collapse:collapse; table-layout:fixed; word-break:break-word; }
      .tt-table thead th { position: sticky; top: 0; background: #fff; z-index: 5; }
      .tt-table th:first-child, .tt-table td:first-child { position: sticky; left: 0; background: #fff; z-index: 6; }
      .tt-table th, .tt-table td { border:1px solid #e6eef8; padding:8px; font-size:13px; vertical-align:middle; }
      .tt-day-column { min-width:160px; max-width:320px; }
      .tt-actions { display:flex; gap:8px; }
      .tt-small { font-size:12px; color:#6b7280; }
      .tt-day-btn { margin-left:6px; border-radius:6px; padding:2px 6px; font-weight:700; cursor:pointer; border:1px solid #e6eef8; background:#fff; }
      @media(max-width:900px){
        .tt-table thead { display:none; }
        .tt-table tr { display:block; margin-bottom:8px; border:1px solid #f1f5f9; border-radius:6px; overflow:hidden; }
        .tt-table td { display:block; border:none; padding:8px; }
      }
      .tt-break { background:#fff4e6; }
      .tt-period-id { font-weight:700; margin-right:6px; }
      .tt-view-toolbar { display:flex; justify-content:flex-end; gap:8px; margin-bottom:8px; align-items:center }
      .tt-view-only .tt-actions, .tt-view-only .tt-days, .tt-view-only .tt-controls { display:none !important; }
      .tt-status { font-weight:700; padding:6px 10px; border-radius:999px; font-size:12px; }
      .tt-day-add { color:#059669; border-color: #e6f6ef; }
      .tt-day-remove { color:#dc2626; border-color: #fdecea; }
      .tt-icon-btn { background:transparent;border:0;padding:6px;cursor:pointer;border-radius:6px }
      .tt-icon-btn svg{ width:16px;height:16px;vertical-align:middle }
    `;
    document.head.appendChild(style);
    
  }

  // initial schedule: use existing or empty
  let schedule = timetableDoc?.schedule ? JSON.parse(JSON.stringify(timetableDoc.schedule)) : {};
  // ensure keys exist for defaultDays only if missing
  defaultDays.forEach(d => { if(!schedule[d]) schedule[d] = []; });

  // compute the initial selected days list (preserve saved days when editing)
  const initialSelectedDays = (timetableDoc && timetableDoc.schedule) ? Object.keys(timetableDoc.schedule) : defaultDays.slice();

  const subjectOptionsHtml = classSubjects.length ? classSubjects.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('') : `<option value="">No subjects assigned</option>`;

  // small helper to render svg icon html (plus/minus/trash/edit)
  const ICONS = {
    plus: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    minus: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    addRow: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    removeRow: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 12h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  };

  // Render modal HTML with Clear All and status area
  showModal(`Timetable — ${escapeHtml(cls.name||'')}`, `
    <div id="ttRoot">
      <div class="tt-header">
        <div>
          <div style="font-weight:800">Class: ${escapeHtml(cls.name || '')}</div>
          <div class="tt-small">ID: ${escapeHtml(cls.id || '')}</div>
        </div>
        <div class="tt-actions">
          <span id="ttStatusIndicator" class="tt-small"></span>
          <button id="ttCloseBtn" class="btn btn-ghost">Close</button>
          <button id="ttGenerateBtn" class="btn btn-primary">Generate</button>
          <button id="ttClearBtn" class="btn btn-ghost">Clear All</button>
          <button id="ttSaveBtn" class="btn btn-primary">Save</button>
          <button id="ttDownloadBtn" class="btn btn-ghost">Download PDF</button>
        </div>
      </div>

      <div class="tt-controls" id="ttControlsRow" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <div>
          <label class="tt-small">Select days</label>
          <div class="tt-days">${days.map(d => {
            const checked = initialSelectedDays.includes(d) ? 'checked' : '';
            return `<label style="margin-right:8px;display:inline-flex;align-items:center">
                      <input type="checkbox" class="tt-day" value="${escapeHtml(d)}" ${checked} /> ${escapeHtml(d)}
                      <button type="button" class="tt-day-btn tt-day-add" data-day="${escapeHtml(d)}" title="Add period to ${escapeHtml(d)}">${ICONS.plus}</button>
                      <button type="button" class="tt-day-btn tt-day-remove" data-day="${escapeHtml(d)}" title="Remove last period from ${escapeHtml(d)}">${ICONS.minus}</button>
                    </label>`;
          }).join('')}</div>
        </div>

        <div>
          <label class="tt-small">Start time</label>
          <div><input id="ttStartTime" type="time" value="${timetableDoc?.startTime || '07:30'}" /></div>
        </div>

        <div>
          <label class="tt-small">Period minutes</label>
          <div><input id="ttPeriodMinutes" type="number" value="${timetableDoc?.periodMinutes || 60}" style="width:88px" /></div>
        </div>

        <div>
          <label class="tt-small">Initial periods (per day)</label>
          <div><input id="ttPeriods" type="number" value="${(timetableDoc && timetableDoc.defaultPeriods) || 7}" style="width:88px" /></div>
        </div>

        <div>
          <label class="tt-small">Break start</label>
          <div><input id="ttBreakStart" type="time" value="${timetableDoc?.breakStart || '09:30'}" /></div>
        </div>
        <div>
          <label class="tt-small">Break end</label>
          <div><input id="ttBreakEnd" type="time" value="${timetableDoc?.breakEnd || '10:00'}" /></div>
        </div>

      </div>

      <div style="margin-top:12px">
        <div class="tt-editor" id="ttEditorContainer"></div>
      </div>

    </div>
  `);
  

  // helpers scoped to modal
  const $ = (sel) => modalBody.querySelector(sel);
  const $$ = (sel) => Array.from(modalBody.querySelectorAll(sel));

  // helper to get selected days **in canonical Saturday-first order**
  function getSelectedDaysOrdered(){
    return days.filter(d => {
      const found = Array.from(modalBody.querySelectorAll('.tt-day')).find(n => n.value === d);
      return found && found.checked;
    });
  }

  // utility time functions
  function toMinutes(hhmm){ if(!hhmm) return 0; const [h,m] = String(hhmm).split(':').map(Number); return (h||0)*60 + (m||0); }
  function fromMinutes(mins){ mins = Math.max(0, Math.floor(mins % (24*60))); const h = String(Math.floor(mins/60)).padStart(2,'0'); const m = String(mins % 60).padStart(2,'0'); return `${h}:${m}`; }
  function formatAMPM(hhmm){ if(!hhmm) return ''; const [hStr,mStr] = String(hhmm).split(':'); let h = Number(hStr), m = Number(mStr); const ampm = h >= 12 ? 'PM' : 'AM'; h = ((h + 11) % 12) + 1; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ampm}`; }

  // render editor (uses canonical day order) - REPLACEMENT
  function renderTimetableEditor(){
    const container = $('#ttEditorContainer');
    if(!container) return;
    const selDays = getSelectedDaysOrdered();
    if(selDays.length === 0){ container.innerHTML = `<div class="muted">Select at least one day to edit the timetable.</div>`; return; }
    selDays.forEach(d => { if(!schedule[d]) schedule[d] = []; });
    const allLengths = selDays.map(d => schedule[d].length || 0);
    let maxRows = Math.max(...allLengths, Number($('#ttPeriods')?.value || 7));
    if(maxRows < 1) maxRows = 1;
  
    // Build table header (days only)
    let html = `<div style="overflow:auto"><table class="tt-table"><thead><tr>`;
    selDays.forEach(d => { html += `<th class="tt-day-column">${escapeHtml(d)}<div class="tt-small">Subjects & teachers</div></th>`; });
    html += `</tr></thead><tbody>`;
  
    
    for(let r=0;r<maxRows;r++){
      html += `<tr data-row="${r}">`;
  
      const startTimeVal = ($('#ttStartTime') && $('#ttStartTime').value) || '07:30';
      const periodMinutesVal = Number($('#ttPeriodMinutes')?.value || 60);
      const breakStartVal = $('#ttBreakStart')?.value;
      const breakEndVal = $('#ttBreakEnd')?.value;
  
      // compute time for this row (used inside each day cell)
      let runningStartBase = toMinutes(startTimeVal);
      for(let k=0;k<r;k++){
        runningStartBase += periodMinutesVal;
        if(breakStartVal && breakEndVal){
          const bS = toMinutes(breakStartVal), bE = toMinutes(breakEndVal);
          if(runningStartBase >= bS && runningStartBase < bE) runningStartBase = bE;
        }
      }
      const rowStart = fromMinutes(runningStartBase);
      const rowEnd = fromMinutes(runningStartBase + periodMinutesVal);
      const timeLine = `${formatAMPM(rowStart)} — ${formatAMPM(rowEnd)}`;
  
      // For each day column render the per-cell controls and inputs
      selDays.forEach(d => {
        const dayArr = schedule[d] || [];
        const cell = dayArr[r] || null;
        const isBreak = cell && cell.isBreak;
        const subjSel = `<select data-day="${escapeHtml(d)}" data-row="${r}" class="tt-subject">${subjectOptionsHtml}</select>`;
        const teacherSel = `<select multiple data-day="${escapeHtml(d)}" data-row="${r}" class="tt-teachers" style="width:100%;min-height:44px"></select>`;
  
        html += `<td class="${isBreak ? 'tt-break' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div style="font-weight:700;font-size:13px">${isBreak ? '<span class="muted">Break</span>' : '<span class="muted">Class</span>'}</div>
            <div style="display:flex;gap:6px;align-items:center">
              <button class="tt-icon-btn tt-cell-add" data-day="${escapeHtml(d)}" data-row="${r}" title="Add after for ${escapeHtml(d)}">${ICONS.addRow}</button>
              <button class="tt-icon-btn tt-cell-remove" data-day="${escapeHtml(d)}" data-row="${r}" title="Remove this row for ${escapeHtml(d)}">${ICONS.removeRow}</button>
            </div>
          </div>
  
          <div style="margin-top:6px"><label class="tt-small">Subject</label>${subjSel}</div>
          <div style="margin-top:6px"><label class="tt-small">Teacher(s)</label>${teacherSel}</div>
          <div style="margin-top:6px"><div class="tt-small muted">Time: ${escapeHtml(timeLine)}</div></div>
          <div style="margin-top:6px"><label><input type="checkbox" class="tt-is-break" data-day="${escapeHtml(d)}" data-row="${r}" ${isBreak ? 'checked' : ''} /> Mark as break</label></div>
        </td>`;
      });
  
      html += `</tr>`;
    }
  
    html += `</tbody></table></div>`;
    container.innerHTML = html;

    
  
    // populate selects & wire per-cell behavior (subject->teacher mapping, break toggles)
    selDays.forEach(d => {
      for(let r=0;r<maxRows;r++){
        const subjEl = container.querySelector(`select.tt-subject[data-day="${escapeHtml(d)}"][data-row="${r}"]`) || container.querySelector(`select.tt-subject[data-day="${d}"][data-row="${r}"]`);
        const teacherEl = container.querySelector(`select.tt-teachers[data-day="${escapeHtml(d)}"][data-row="${r}"]`) || container.querySelector(`select.tt-teachers[data-day="${d}"][data-row="${r}"]`);
        const isBreakEl = container.querySelector(`input.tt-is-break[data-day="${escapeHtml(d)}"][data-row="${r}"]`) || container.querySelector(`input.tt-is-break[data-day="${d}"][data-row="${r}"]`);
        const dayArr = schedule[d] || [];
        const cell = dayArr[r] || null;
  
        if(cell){
          if(subjEl) subjEl.value = cell.subject || '';
          if(isBreakEl) isBreakEl.checked = !!cell.isBreak;
        } else {
          if(subjEl) subjEl.value = '';
          if(isBreakEl) isBreakEl.checked = false;
        }
  
        function populateTeacherOptionsForSubject(subject){
          if(!teacherEl) return;
          teacherEl.innerHTML = '';
          if(!subject || !teacherBySubject[subject] || !teacherBySubject[subject].length){
            teacherEl.innerHTML = `<option value="">No teacher available</option>`;
            return;
          }
          const opts = teacherBySubject[subject].map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
          teacherEl.innerHTML = opts;
          if(cell && Array.isArray(cell.teacherIds) && cell.teacherIds.length){
            for(const opt of teacherEl.options) if(cell.teacherIds.includes(opt.value)) opt.selected = true;
          } else {
            if(teacherEl.options.length === 1) teacherEl.options[0].selected = true;
          }
        }
  
        const initialSubject = cell ? cell.subject : (classSubjects[ r % Math.max(1, classSubjects.length) ] || '');
        populateTeacherOptionsForSubject(initialSubject);
  
        subjEl && subjEl.addEventListener('change', (ev) => {
          populateTeacherOptionsForSubject(ev.target.value);
        });
  
        isBreakEl && isBreakEl.addEventListener('change', (ev) => {
          const checked = ev.target.checked;
          const rowCell = subjEl ? subjEl.closest('td') : null;
          if(rowCell){
            if(checked){ subjEl.disabled = true; teacherEl.disabled = true; rowCell.classList.add('tt-break'); }
            else { subjEl.disabled = false; teacherEl.disabled = false; rowCell.classList.remove('tt-break'); }
          }
        });
      }
    });
  
    // wire per-cell add/remove
    container.querySelectorAll('.tt-cell-add').forEach(btn => {
      btn.onclick = () => {
        const rowIndex = Number(btn.dataset.row);
        const d = btn.dataset.day;
        schedule[d] = schedule[d] || [];
        schedule[d].splice(rowIndex+1, 0, { subject:'', teacherIds:[], isBreak:false });
        renderTimetableEditor();
      };
    });
    container.querySelectorAll('.tt-cell-remove').forEach(btn => {
      btn.onclick = () => {
        const rowIndex = Number(btn.dataset.row);
        const d = btn.dataset.day;
        schedule[d] = schedule[d] || [];
        if(schedule[d].length <= rowIndex){
          toast('No such period to remove for ', 'warning' + d);
          return;
        }
        const ok = window.confirm(`Remove period ${rowIndex+1} for ${d}?`);
        if(!ok) return;
        schedule[d].splice(rowIndex, 1);
        renderTimetableEditor();
      };
    });
  }
  
  // Day-level add/remove buttons (per-day + / -)
  function wireDayButtons(){
    modalBody.querySelectorAll('.tt-day-add').forEach(btn => {
      btn.onclick = () => {
        const d = btn.dataset.day;
        schedule[d] = schedule[d] || [];
        // push a single empty period to that day (end)
        schedule[d].push({ subject:'', teacherIds:[], isBreak:false });
        // ensure the day checkbox checked
        const ch = modalBody.querySelector(`.tt-day[value="${d}"]`);
        if(ch) ch.checked = true;
        renderTimetableEditor();
      };
    });
    modalBody.querySelectorAll('.tt-day-remove').forEach(btn => {
      btn.onclick = () => {
        const d = btn.dataset.day;
        schedule[d] = schedule[d] || [];
        if(schedule[d].length === 0) return toast('No periods to remove for ', 'warning' + d);
        const ok = window.confirm(`Remove last period for ${d}?`);
        if(!ok) return;
        schedule[d].pop();
        renderTimetableEditor();
      };
    });
  }

// REPLACE renderTimetableViewer - viewer shows only day columns (no P# column)
function renderTimetableViewer(useSchedule, publishedFlag){
  const header = modalBody.querySelector('.tt-header');
  const controlsRow = modalBody.querySelector('#ttControlsRow');
  if(header) header.style.display = 'none';
  if(controlsRow) controlsRow.style.display = 'none';

  const container = modalBody.querySelector('.tt-editor');
  if(!container) return;
  container.classList.add('tt-view-only');

  const selDays = days.filter(d => Array.isArray(useSchedule[d])); // ordered Saturday-first
  if(selDays.length === 0){ container.innerHTML = `<div class="muted">No timetable data to display.</div>`; return; }

  let maxRows = 0;
  selDays.forEach(d => { maxRows = Math.max(maxRows, (useSchedule[d]||[]).length); });
  if(maxRows === 0) maxRows = 1;

  // status and publish/unpublish
  const statusText = publishedFlag ? 'Published' : 'Unpublished';
  const statusColor = publishedFlag ? '#059669' : '#dc2626';
  const statusIndicator = $('#ttStatusIndicator');
  if(statusIndicator){
    statusIndicator.innerHTML = `<span class="tt-status" style="background:${statusColor};color:#fff">${statusText}</span>`;
  }

  // viewer toolbar: edit, publish/unpublish, download (download only if published)
  let vhtml = `<div class="tt-view-toolbar">`;
  vhtml += `<button id="ttViewerEdit" class="btn btn-ghost">Edit timetable</button>`;
  vhtml += `<button id="ttTogglePublish" class="btn btn-ghost">${publishedFlag ? 'Unpublish' : 'Publish'}</button>`;
  if(publishedFlag) vhtml += `<button id="ttViewerDownload" class="btn btn-ghost">Download PDF</button>`;
  vhtml += `<button id="ttViewerClose" class="btn btn-ghost">Close</button>`;
  vhtml += `</div>`;

  // Table header with DAYS ONLY
  vhtml += `<div style="overflow:auto"><table class="tt-table"><thead><tr>`;
  selDays.forEach(d => vhtml += `<th class="tt-day-column">${escapeHtml(d)}</th>`);
  vhtml += `</tr></thead><tbody>`;

  for(let r=0;r<maxRows;r++){
    vhtml += `<tr>`;
    selDays.forEach(d => {
      const cell = (useSchedule[d] && useSchedule[d][r]) ? useSchedule[d][r] : null;

      // compute fallback time for this row
      const periodMinutes = Number((timetableDoc && timetableDoc.periodMinutes) ? timetableDoc.periodMinutes : ($('#ttPeriodMinutes')?.value || 60));
      const startMeta = (timetableDoc && timetableDoc.startTime) ? timetableDoc.startTime : ($('#ttStartTime')?.value || '07:30');
      let running = toMinutes(startMeta);
      for(let k=0;k<r;k++){
        running += periodMinutes;
        const bS = toMinutes($('#ttBreakStart')?.value || '00:00');
        const bE = toMinutes($('#ttBreakEnd')?.value || '00:00');
        if(bS && bE && running >= bS && running < bE) running = bE;
      }
      const compStart = fromMinutes(running);
      const compEnd = fromMinutes(running + periodMinutes);
      const timeLine = `${formatAMPM(cell && cell.start ? cell.start : compStart)} — ${formatAMPM(cell && cell.end ? cell.end : compEnd)}`;

      if(!cell){
        vhtml += `<td style="min-width:150px;padding:8px"><div class="muted">—</div></td>`;
        return;
      }

      if(cell.isBreak){
        vhtml += `<td class="tt-break" style="min-width:150px;padding:8px;text-align:center"><strong>Break</strong><div class="tt-small muted" style="margin-top:6px">${timeLine}</div></td>`;
      } else {
        const subj = escapeHtml(cell.subject || 'Free');
        const tnames = (cell.teacherIds || []).map(id => escapeHtml(teacherById[id] || id)).join(', ');
        vhtml += `<td style="min-width:150px;padding:8px;vertical-align:top">
          <div style="font-weight:700">${subj}</div>
          ${tnames ? `<div style="margin-top:6px;font-size:13px;color:#334155">${tnames}</div>` : ''}
          <div class="tt-small muted" style="margin-top:6px">${escapeHtml(timeLine)}</div>
        </td>`;
      }
    });
    vhtml += `</tr>`;
  }

  vhtml += `</tbody></table></div>`;
  container.innerHTML = vhtml;

  // wire viewer buttons
  const editBtn = modalBody.querySelector('#ttViewerEdit');
  const toggleBtn = modalBody.querySelector('#ttTogglePublish');
  const viewerDownload = modalBody.querySelector('#ttViewerDownload');
  const viewerClose = modalBody.querySelector('#ttViewerClose');

  if(viewerClose) viewerClose.onclick = closeModal;
  if(editBtn) editBtn.onclick = () => {
    if(header) header.style.display = '';
    if(controlsRow) controlsRow.style.display = '';
    container.classList.remove('tt-view-only');
    renderTimetableEditor();
    wireDayButtons();
  };
  if(toggleBtn) toggleBtn.onclick = async () => {
    const wantPublish = !(timetableDoc && timetableDoc.published);
    const ok = window.confirm(wantPublish ? 'Publish timetable?' : 'Unpublish timetable?');
    if(!ok) return;
    setButtonLoading(toggleBtn, true, wantPublish ? 'Publishing...' : 'Unpublishing...');
    try {
      if(timetableDoc && timetableDoc.id){
        await updateDoc(doc(db,'timetables', timetableDoc.id), { published: wantPublish });
        timetableDoc.published = wantPublish;
      } else {
        const ref = await addDoc(collection(db,'timetables'), { classId: cls.id||cls.name, schedule: schedule, published: wantPublish, generatedAt: Timestamp.now() });
        timetableDoc = { id: ref.id, published: wantPublish };
      }
      renderTimetableViewer(schedule, !!wantPublish);
      setButtonLoading(toggleBtn, false);
      toast(wantPublish ? 'Timetable published' : 'Timetable unpublished', 'success');
    } catch(err){ console.error('toggle publish failed', err); setButtonLoading(toggleBtn, false); toast('Failed to change publish state', 'error', 3000); }
  };
  if(viewerDownload) viewerDownload.onclick = () => modalBody.querySelector('#ttDownloadBtn')?.click();
}


  // initial render: if saved and has schedule show viewer, else editor
  if(timetableDoc && timetableDoc.schedule){
    schedule = JSON.parse(JSON.stringify(timetableDoc.schedule));
    // show viewer, use timetableDoc.published (default false if missing)
    renderTimetableViewer(schedule, !!timetableDoc.published);
  } else {
    renderTimetableEditor();
    wireDayButtons();
    // hide download until saved
    const globalDl = $('#ttDownloadBtn'); if(globalDl) globalDl.style.display = 'none';
  }

  // wire controls
  const closeBtn = $('#ttCloseBtn'); if(closeBtn) closeBtn.onclick = closeModal;

  // regenerate when controls change (use canonical selected order)
  ['ttStartTime','ttPeriodMinutes','ttPeriods','ttBreakStart','ttBreakEnd'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.onchange = () => renderTimetableEditor();
  });
  modalBody.querySelectorAll('.tt-day').forEach(ch => ch.onchange = () => { renderTimetableEditor(); wireDayButtons(); });

  const genBtn = $('#ttGenerateBtn');
  if(genBtn) genBtn.onclick = (ev) => {
    setButtonLoading(ev.currentTarget, true, 'Generating...');
    try {
      const selDays = getSelectedDaysOrdered();
      if(selDays.length === 0){ toast('Select days', 'warning'); setButtonLoading(ev.currentTarget,false); return; }
      const periods = Number($('#ttPeriods')?.value || 7);
      const startTime = $('#ttStartTime')?.value || '07:30';
      const periodMinutes = Number($('#ttPeriodMinutes')?.value || 60);
      const breakStart = $('#ttBreakStart')?.value;
      const breakEnd = $('#ttBreakEnd')?.value;

      selDays.forEach(d => {
        schedule[d] = schedule[d] || [];
        while(schedule[d].length < periods) schedule[d].push({ subject: '', teacherIds: [], isBreak: false });
        if(schedule[d].length > periods) schedule[d] = schedule[d].slice(0, periods);
      });

      selDays.forEach(d => {
        for(let i=0;i<schedule[d].length;i++){
          const subj = classSubjects.length ? classSubjects[i % classSubjects.length] : '';
          schedule[d][i].subject = subj;
          const teachers = teacherBySubject[subj] || [];
          schedule[d][i].teacherIds = teachers.length ? [teachers[0].id] : [];
          schedule[d][i].isBreak = false;
        }
      });

      if(breakStart && breakEnd){
        selDays.forEach(d => {
          for(let i=0;i<schedule[d].length;i++){
            let startMin = toMinutes($('#ttStartTime')?.value || startTime);
            for(let k=0;k<i;k++){
              startMin += periodMinutes;
              const bS = toMinutes(breakStart), bE = toMinutes(breakEnd);
              if(bS && bE && startMin >= bS && startMin < bE) startMin = bE;
            }
            const bS = toMinutes(breakStart), bE = toMinutes(breakEnd);
            if(bS && bE && startMin >= bS && startMin < bE){
              schedule[d][i].isBreak = true;
              schedule[d][i].subject = 'Break';
              schedule[d][i].teacherIds = [];
            }
          }
        });
      }

      renderTimetableEditor();
      wireDayButtons();
      toast('Generated timetable (edit as needed)','info');
    } catch(err){ console.error(err); toast('Generate failed', 'error', 3000); }
    setButtonLoading(ev.currentTarget, false);
  };

  // Clear All button (confirm then wipe selected days cells)
  const clearBtn = $('#ttClearBtn');
  if(clearBtn) clearBtn.onclick = (ev) => {
    const selDays = getSelectedDaysOrdered();
    if(selDays.length === 0) return toast('Select days to clear', 'warning');
    const ok = window.confirm(`Clear all periods for selected days (${selDays.join(', ')})? This will remove subjects & teachers from those days.`);
    if(!ok) return;
    // clear
    selDays.forEach(d => { schedule[d] = []; });
    renderTimetableEditor();
    wireDayButtons();
    toast('Cleared selected days', 'warning');
  };

  // Save button: build finalSchedule and save (automatically published)
  const saveBtn = $('#ttSaveBtn');
  if(saveBtn) saveBtn.onclick = async (ev) => {
    const selDays = getSelectedDaysOrdered();
    if(selDays.length === 0) return toast('Select days','info');
    const container = $('#ttEditorContainer');
    const table = container && container.querySelector('table.tt-table');
    if(!table) return toast('Nothing to save', 'warning');

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const finalSchedule = {};
    for(const d of selDays) finalSchedule[d] = [];

    for(let rIndex=0;rIndex<rows.length;rIndex++){
      const row = rows[rIndex];
      for(const d of selDays){
        const subjSel = row.querySelector(`select.tt-subject[data-day="${escapeHtml(d)}"][data-row="${rIndex}"]`) || row.querySelector(`select.tt-subject[data-day="${d}"][data-row="${rIndex}"]`);
        const teacherSel = row.querySelector(`select.tt-teachers[data-day="${escapeHtml(d)}"][data-row="${rIndex}"]`) || row.querySelector(`select.tt-teachers[data-day="${d}"][data-row="${rIndex}"]`);
        const isBreakEl = row.querySelector(`input.tt-is-break[data-day="${escapeHtml(d)}"][data-row="${rIndex}"]`) || row.querySelector(`input.tt-is-break[data-day="${d}"][data-row="${rIndex}"]`);
        let subject = subjSel ? subjSel.value : '';
        let teacherIds = teacherSel ? Array.from(teacherSel.selectedOptions).map(o=>o.value) : [];
        const isBreak = isBreakEl ? !!isBreakEl.checked : false;
        const startTime = $('#ttStartTime')?.value || '07:30';
        const periodMinutes = Number($('#ttPeriodMinutes')?.value || 60);
        let runningStart = toMinutes(startTime);
        for(let k=0;k<rIndex;k++){
          runningStart += periodMinutes;
          const bS = toMinutes($('#ttBreakStart')?.value || '00:00');
          const bE = toMinutes($('#ttBreakEnd')?.value || '00:00');
          if(bS && bE && runningStart >= bS && runningStart < bE) runningStart = bE;
        }
        const start = fromMinutes(runningStart);
        const end = fromMinutes(runningStart + periodMinutes);

        // If no subject chosen and not a marked break, set Fasax
        if(!subject && !isBreak){
          subject = 'Fasax';
        }

        // If teacherIds empty but subject has teachers -> default to first teacher
        if(!isBreak && (!teacherIds || teacherIds.length === 0)){
          const subs = teacherBySubject[subject] || teacherBySubject[subject === 'Fasax' ? '' : subject] || [];
          if(subs && subs.length) teacherIds = [subs[0].id];
        }

        // if subject is Break flag isBreak true
        finalSchedule[d].push({
          period: rIndex + 1,
          start, end,
          subject: isBreak ? 'Break' : subject || 'Fasax',
          teacherIds: isBreak ? [] : (teacherIds || []),
          isBreak: !!isBreak
        });
      }
    }

    const ok = window.confirm(`Save timetable for ${escapeHtml(cls.name)}?`);
    if(!ok) return;
    setButtonLoading(ev.currentTarget, true, 'Saving...');

    try {
      const payload = {
        classId: cls.id,
        className: cls.name,
        schedule: finalSchedule,
        startTime: $('#ttStartTime')?.value || '07:30',
        periodMinutes: Number($('#ttPeriodMinutes')?.value) || 60,
        defaultPeriods: Number($('#ttPeriods')?.value) || 7,
        breakStart: $('#ttBreakStart')?.value || null,
        breakEnd: $('#ttBreakEnd')?.value || null,
        generatedAt: Timestamp.now(),
        published: true
      };

      if(timetableDoc && timetableDoc.id){
        await updateDoc(doc(db,'timetables', timetableDoc.id), payload);
        timetableDoc = { id: timetableDoc.id, ...payload };
      } else {
        const ref = await addDoc(collection(db,'timetables'), payload);
        timetableDoc = { id: ref.id, ...payload };
      }

      toast('Timetable saved and published','success');
      // update schedule local & show viewer; ensure download visible
      schedule = JSON.parse(JSON.stringify(finalSchedule));
      renderTimetableViewer(schedule, true);
      // update classes UI
      await loadClasses();
      renderClasses();
      const globalDl = $('#ttDownloadBtn');
      if(globalDl) globalDl.style.display = '';
    } catch(err){ console.error('save timetable failed', err); toast('Save failed', 'error', 3000); }
    setButtonLoading(ev.currentTarget, false);
  };

  // Download / Print: auto-download PDF (no print popup). Append clone to body before rendering.
  const downloadBtn = $('#ttDownloadBtn');
  if(downloadBtn) downloadBtn.onclick = async () => {
    try {
      if(!(timetableDoc && timetableDoc.published)) return toast('Save and publish timetable first', 'warning');
      const useSchedule = schedule;
      const selDays = days.filter(d => Array.isArray(useSchedule[d]));
      if(selDays.length === 0) return toast('Nothing to print','warning');

      // build printable table element (same visual structure)
      const wrapper = document.createElement('div');
      wrapper.style.position = 'fixed';
      wrapper.style.left = '-9999px';
      wrapper.style.top = '0';
      wrapper.style.width = '1200px'; // fixed width for consistent rendering
      wrapper.style.padding = '18px';
      wrapper.style.background = '#fff';

      const titleEl = document.createElement('div');
      titleEl.style.fontSize = '18px';
      titleEl.style.fontWeight = '800';
      titleEl.style.marginBottom = '6px';
      titleEl.textContent = `Timetable — ${cls.name || classId}`;
      wrapper.appendChild(titleEl);

      const meta = document.createElement('div');
      meta.style.fontSize = '12px';
      meta.style.color = '#666';
      meta.style.marginBottom = '12px';
      meta.textContent = `Generated: ${timetableDoc && timetableDoc.generatedAt ? (timetableDoc.generatedAt.seconds ? new Date(timetableDoc.generatedAt.seconds*1000).toLocaleString() : new Date(timetableDoc.generatedAt).toLocaleString()) : new Date().toLocaleString()}`;
      wrapper.appendChild(meta);

      const tbl = document.createElement('table');
      tbl.style.width = '100%'; tbl.style.borderCollapse = 'collapse'; tbl.style.fontFamily = 'Arial,Helvetica,sans-serif';
      // header
      const thead = document.createElement('thead');
      const thr = document.createElement('tr');
      const thp = document.createElement('th'); thp.style.border='1px solid #ddd'; thp.style.padding='8px'; thp.textContent='Period';
      thr.appendChild(thp);
      selDays.forEach(d => { const th = document.createElement('th'); th.style.border='1px solid #ddd'; th.style.padding='8px'; th.textContent = d; thr.appendChild(th); });
      thead.appendChild(thr); tbl.appendChild(thead);
      const tbody = document.createElement('tbody');

      let maxRows = 0; selDays.forEach(d=>maxRows = Math.max(maxRows, (useSchedule[d]||[]).length));
      for(let r=0;r<maxRows;r++){
        const tr = document.createElement('tr');
        const tdp = document.createElement('td'); tdp.style.border='1px solid #ddd'; tdp.style.padding='8px'; tdp.style.fontWeight='700';
        // compute time label for row
        let timeLabel = '';
        for(const d of selDays){
          const c = useSchedule[d]?.[r];
          if(c && c.start && c.end){ timeLabel = `${formatAMPM(c.start)} — ${formatAMPM(c.end)}`; break; }
        }
        if(!timeLabel){
          const startMeta = (timetableDoc && timetableDoc.startTime) ? timetableDoc.startTime : ($('#ttStartTime')?.value || '07:30');
          const periodMinutes = Number((timetableDoc && timetableDoc.periodMinutes) ? timetableDoc.periodMinutes : ($('#ttPeriodMinutes')?.value || 60));
          let running = toMinutes(startMeta);
          for(let k=0;k<r;k++) running += periodMinutes;
          timeLabel = `${formatAMPM(fromMinutes(running))} — ${formatAMPM(fromMinutes(running + periodMinutes))}`;
        }
        tdp.textContent = `P${r+1} • ${timeLabel}`;
        tr.appendChild(tdp);
        selDays.forEach(d => {
          const c = useSchedule[d] && useSchedule[d][r] ? useSchedule[d][r] : null;
          const td = document.createElement('td'); td.style.border='1px solid #ddd'; td.style.padding='8px';
          if(!c) td.textContent = '—';
          else if(c.isBreak){
            const b = document.createElement('div'); b.style.fontWeight='700'; b.textContent='Break'; td.appendChild(b);
            const t = document.createElement('div'); t.style.marginTop='6px'; t.textContent = `${formatAMPM(c.start || '')} — ${formatAMPM(c.end || '')}`; td.appendChild(t);
          } else {
            const s = document.createElement('div'); s.style.fontWeight='700'; s.textContent = (c.subject || '');
            td.appendChild(s);
            const t = document.createElement('div'); t.style.marginTop='6px'; t.textContent = (c.teacherIds||[]).map(id => teacherById[id]||id).join(', ');
            td.appendChild(t);
            const tm = document.createElement('div'); tm.style.marginTop='6px'; tm.style.color='#666'; tm.textContent = `${formatAMPM(c.start || '')} — ${formatAMPM(c.end || '')}`; td.appendChild(tm);
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      wrapper.appendChild(tbl);

      // append to body off-screen (html2canvas requires in-document)
      document.body.appendChild(wrapper);

      // render canvas via html2canvas then save via jsPDF
      const canvas = await html2canvas(wrapper, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      // cleanup appended node
      wrapper.remove();

      const jsPDFLib = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (window.jsPDF ? window.jsPDF : null);
      if(!jsPDFLib) { toast('PDF library missing', 'warning'); return; }
      const pdf = new jsPDFLib('landscape','pt','a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      // scale to fit page
      const scale = Math.min((pageWidth - margin*2) / canvas.width, (pageHeight - margin*2) / canvas.height);
      const imgW = canvas.width * scale; const imgH = canvas.height * scale;
      const x = (pageWidth - imgW) / 2; const y = margin;
      pdf.addImage(imgData, 'PNG', x, y, imgW, imgH);
      const safeClass = String(cls.name || cls.id || classId).replace(/\s+/g,'-').replace(/[^\w\-]/g,'').toLowerCase();
      const filename = `timetable-${safeClass}-${(new Date()).toISOString().slice(0,10)}.pdf`;
      pdf.save(filename);
    } catch(e){
      console.error('Download PDF failed', e);
      toast('Failed to generate PDF', 'error', 3000);
    }
  };

  // small escape helper
  function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // initial wiring for day buttons
  wireDayButtons();
}





/* ---------- HELPER: create overlay modal (keeps underlying view modal intact) ---------- */
function createOverlay(title, contentHtml) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay-modal';
  Object.assign(overlay.style, {
    position: 'fixed', inset: 0, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.32)', zIndex: 99999, padding: '16px'
  });

  const panel = document.createElement('div');
  panel.style.maxWidth = '980px';
  panel.style.width = '100%';
  panel.style.maxHeight = '88vh';
  panel.style.overflow = 'auto';
  panel.style.background = '#fff';
  panel.style.borderRadius = '10px';
  panel.style.boxShadow = '0 12px 40px rgba(2,6,23,0.16)';
  panel.style.padding = '14px';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '8px';
  header.innerHTML = `<strong style="font-size:16px">${escapeHtml(title||'')}</strong><button class="ov-close btn btn-ghost">Close</button>`;

  const body = document.createElement('div');
  body.className = 'ov-body';
  body.innerHTML = contentHtml;

  panel.appendChild(header);
  panel.appendChild(body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // close handlers
  overlay.querySelector('.ov-close').onclick = () => overlay.remove();
  overlay.addEventListener('click', (ev) => { if(ev.target === overlay) overlay.remove(); });

  return { overlay, panel, body };
}

/* ---------- REPLACEMENT: Set Fee overlay (monthly-only, start date default today, notes under start) ---------- */
async function openSetFeeModal(classId, specificStudentIds = null) {
  const cls = classesCache.find(x => x.id===classId || x.name===classId);
  if(!cls) return toast('Class not found', 'info');

  // students list (exclude deleted)
  const assigned = (studentsCache||[]).filter(s => (s.classId||'') === (cls.name||cls.id||'') && (s.status || '') !== 'deleted');
  const studentsOptions = assigned.map(s => {
    const sidVal = escapeHtml(s.id||s.studentId||'');
    const checked = specificStudentIds ? (specificStudentIds.includes(s.id||s.studentId)?'checked':'') : 'checked';
    return `<label style="display:block;margin-bottom:6px"><input type="checkbox" class="fee-stu-chk" data-id="${sidVal}" ${checked} /> ${escapeHtml(s.fullName||'')} — <span class="muted">${escapeHtml(s.studentId||'')}</span></label>`;
  }).join('');

  // default start date = today in yyyy-mm-dd
  const today = new Date();
  const pad2 = n => String(n).padStart(2,'0');
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth()+1)}-${pad2(today.getDate())}`;

  const html = `
    <div style="display:flex;flex-direction:column;gap:10px">
      <div>
        <label style="font-weight:700">Apply to students</label>
        <div style="max-height:220px;overflow:auto;border:1px solid #eef2ff;padding:8px;border-radius:8px">${studentsOptions || '<div class="muted">No students</div>'}</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:start">
        <div>
          <label>Amount</label>
          <input id="feeAmount" type="number" style="width:100%;padding:8px;border-radius:8px;border:1px solid #e6eef8" />
        </div>

        <div>
          <label>Type</label>
          <!-- monthly only -->
          <select id="feeType" style="width:100%;padding:8px;border-radius:8px;border:1px solid #e6eef8">
            <option value="monthly">Monthly</option>
          </select>
        </div>

        <div>
          <label>Start date</label>
          <input id="feeStart" type="date" value="${todayStr}" style="width:100%;padding:8px;border-radius:8px;border:1px solid #e6eef8" />
          <div style="font-size:13px;color:#6b7280;margin-top:6px">Note: this is the first billing date for the monthly fee.</div>
        </div>

        <div>
          <label>Notes</label>
          <input id="feeNotes" style="width:100%;padding:8px;border-radius:8px;border:1px solid #e6eef8" />
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px">
        <button id="feeCancel" class="btn btn-ghost">Cancel</button>
        <button id="feeSave" class="btn btn-primary">Set fee</button>
      </div>
    </div>
  `;

  // open overlay (keeps underlying view modal intact)
  const { overlay, body } = createOverlay(`Set fee — ${escapeHtml(cls.name||'')}`, html);

  // helpers scoped to overlay body
  const $o = sel => body.querySelector(sel);
  $o('#feeCancel').onclick = () => overlay.remove();

  $o('#feeSave').onclick = async (ev) => {
    const btn = ev.currentTarget;
    const amount = Number($o('#feeAmount').value || 0);
    const type = $o('#feeType').value;
    const start = $o('#feeStart').value || null;
    const notes = $o('#feeNotes').value || '';

    if(!amount || amount <= 0) { toast('Enter fee amount'); return; }
    const selected = Array.from(body.querySelectorAll('.fee-stu-chk:checked')).map(i => i.dataset.id);
    if(selected.length === 0) { toast('No students selected'); return; }

    const ok = await modalConfirm('Set Fee', `Set fee ${amount} (${type}) for <strong>${selected.length}</strong> students?`);
    if(!ok) return;

    setButtonLoading(btn, true, 'Applying...');
    try {
      const now = Timestamp.now();
      await Promise.all(selected.map(async sid => {
        try {
          // fee history record
          await addDoc(collection(db,'students', sid, 'fees'), {
            amount,
            type,
            startDate: start ? new Date(start) : null,
            notes,
            createdAt: now,
            createdBy: currentUser?.uid || null
          });

          // update top-level student doc (merge)
          await updateDoc(doc(db,'students', sid), {
            fee: amount,
            feeType: type,
            feeStartDate: start ? new Date(start) : null,
            feeNotes: notes,
            feeUpdatedAt: now
          }).catch(async err => {
            await setDoc(doc(db,'students', sid), {
              fee: amount,
              feeType: type,
              feeStartDate: start ? new Date(start) : null,
              feeNotes: notes,
              feeUpdatedAt: now
            }, { merge: true });
          });

          // optimistic local cache update
          const sc = (studentsCache || []).find(x => (x.studentId === sid || x.id === sid));
          if(sc){
            sc.fee = amount; sc.feeType = type; sc.feeStartDate = start ? new Date(start) : null; sc.feeNotes = notes; sc.feeUpdatedAt = now;
          }
        } catch(inner){ console.error('apply fee for student failed', sid, inner); }
      }));

      // refresh lists
      if(typeof loadStudents === 'function') await loadStudents();
      if(typeof renderStudents === 'function') renderStudents();

      toast('Fees set');
      // close overlay only (do not touch underlying view modal)
      overlay.remove();
    } catch(err){
      console.error(err);
      toast('Failed to set fees');
    }
    setButtonLoading(btn, false);
  };
}






/* ---------- small helper fns used above ---------- */
function computeAverageAttendance(studentsArr){
  if(!studentsArr || studentsArr.length===0) return '—';
  const vals = studentsArr.map(s => Number(s.attendancePercent || 0));
  const avg = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
  return avg;
}
function hasTimetable(classId){
  if(!classId) return false;
  if(window.timetablesCache && Array.isArray(window.timetablesCache)){
    return window.timetablesCache.some(t => String(t.classId || t.className || '').trim() === String(classId).trim());
  }
  return false;
}

function hasFeesForClass(classId){
  if(!classId) return false;
  // if studentsCache loaded, check whether any student in that class has a fee assigned
  const list = (studentsCache || []).filter(s => (s.classId||'') === String(classId));
  if(list.length === 0) return false;
  return list.some(s => typeof s.fee !== 'undefined' && s.fee !== null && Number(s.fee) > 0);
}


openAddClass.onclick = () => {
  const subjectOptions = subjectsCache.map(s=>`<option value="${escape(s.name)}">${escape(s.name)}</option>`).join('');
  showModal('Add Class', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><label>Class ID (optional)</label><input id="modalClassId" placeholder="CLS0001" /></div>
      <div><label>&nbsp;</label></div>
      <div style="grid-column:1 / -1"><label>Class name</label><input id="modalClassName" placeholder="Grade 4A" /></div>
      <div style="grid-column:1 / -1"><label>Assign subjects (select multiple)</label>
        <select id="modalClassSubjects" multiple size="6" style="width:100%">${subjectOptions}</select></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="cancelClass" class="btn btn-ghost">Cancel</button>
      <button id="saveClass" class="btn btn-primary">Save</button>
    </div>
  `);
  modalBody.querySelector('#cancelClass').onclick = closeModal;
  modalBody.querySelector('#saveClass').onclick = async () => {
    const name = modalBody.querySelector('#modalClassName').value.trim();
    let id = modalBody.querySelector('#modalClassId').value.trim();
    if(!name) return alert('Enter class name');
    if(!id) id = await generateDefaultId('classes','CLS',4);
    const chosen = Array.from(modalBody.querySelectorAll('#modalClassSubjects option:checked')).map(o=>o.value);
    await setDoc(doc(db,'classes',id), { id, name, subjects: chosen });
    closeModal(); await loadClasses(); renderClasses(); populateClassFilters(); renderStudents();
  };
};

function openEditClassModal(e){
  const id = e && e.target ? e.target.dataset.id : e;
  const c = classesCache.find(x=>x.id===id);
  if(!c) return toast && toast('Class not found', 'info');
  const subjectsHtml = subjectsCache.map(s=>`<label style="margin-right:8px"><input type="checkbox" value="${escape(s.name)}" ${c.subjects?.includes(s.name)?'checked':''} /> ${escape(s.name)}</label>`).join('');
  showModal('Edit Class', `
    <div style="display:grid;grid-template-columns:1fr;gap:8px">
      <div><label>Class name</label><input id="modalClassName" value="${escape(c.name)}" /></div>
      <div><label>Assign subjects</label><div id="modalClassSubjects">${subjectsHtml || '<div class="muted">No subjects yet</div>'}</div></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="cancelClass" class="btn btn-ghost">Cancel</button>
      <button id="saveClass" class="btn btn-primary">Save</button>
    </div>
  `);
  modalBody.querySelector('#cancelClass').onclick = closeModal;
  modalBody.querySelector('#saveClass').onclick = async () => {
    const name = modalBody.querySelector('#modalClassName').value.trim();
    const chosen = Array.from(modalBody.querySelectorAll('#modalClassSubjects input[type=checkbox]:checked')).map(i=>i.value);
    if(!name) return alert('Enter name');
    await updateDoc(doc(db,'classes',id), { name, subjects: chosen });
    closeModal(); await loadClasses(); renderClasses(); populateClassFilters(); renderStudents();
  };
}

async function deleteClass(e){
  const id = e && e.target ? e.target.dataset.id : e;
  if(!id) return;
  if(!confirm('Move class to Recycle Bin?')) return;

  try {
    const who = (currentUser && currentUser.uid) || (auth && auth.currentUser && auth.currentUser.uid) || null;
    await updateDoc(doc(db,'classes', id), {
      deleted: true,
      deletedAt: Timestamp.now(),
      deletedBy: who,
      deleted_at: Timestamp.now(),
      deleted_by: who
    });
    toast('Class moved to Recycle Bin', 'info');
    await loadClasses();
    renderClasses();
    populateClassFilters && populateClassFilters();
    renderStudents && renderStudents();
  } catch(err){
    console.error('delete class failed', err);
    toast('Failed to delete class');
  }
}



/** ---------- SUBJECTS (mobile + desktop) ---------- */
function renderSubjects(){
  if(!subjectsList) return;
  const q = (subjectSearch && subjectSearch.value||'').trim().toLowerCase();
  let list = (subjectsCache || []).slice();
  list = list.filter(s => {
    if(!q) return true;
    return (s.name||'').toLowerCase().includes(q) || (String(s.id||'')).toLowerCase().includes(q);
  });

  const total = list.length;
  const mobile = isMobileViewport();

  // hide the top page header controls on mobile to avoid duplicate header
  try{
    if(subjectSearch) subjectSearch.style.display = mobile ? 'none' : '';
    if(openAddSubject) openAddSubject.style.display = mobile ? 'none' : '';
  } catch(e){}

  // MOBILE
  if(mobile){
    // header: search + add side-by-side (only on mobile)
    let html = `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <input id="_mobileSubjectSearch" placeholder="Search subjects..." value="${escape(subjectSearch && subjectSearch.value||'')}" style="flex:1;padding:10px;border-radius:10px;border:1px solid #e6eef8" />
        <button type="button" id="_mobileAddSubject" class="btn btn-primary" style="white-space:nowrap">+ Add</button>
      </div>

      <div style="margin-bottom:10px;font-size:13px;color:#374151;font-weight:600">Total subjects: ${total}</div>

      <div id="subjectsMobileList">
    `;

    list.forEach((s, idx) => {
      const id = escape(s.id || '');
      const name = escape(s.name || '');
      // mobile: show name then id below it (id is light blue text)
      html += `<div style="padding:10px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:flex-start">
        <div style="display:flex;gap:12px;align-items:flex-start;flex:1;min-width:0">
          <div style="min-width:28px;text-align:center;font-weight:700;margin-top:2px">${idx+1}</div>
          <div style="min-width:0;overflow:hidden">
            <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
            <div style="margin-top:4px;font-size:12px;color:#60a5fa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">ID: ${id}</div>
          </div>
        </div>
        <div><button type="button" class="btn btn-ghost btn-sm mobile-sub-view" data-id="${id}">⋮</button></div>
      </div>`;
    });

    html += `</div>`;
    subjectsList.innerHTML = html;

    // attach mobile handlers once (delegation)
    if(!subjectsList.dataset.mobileHandlersAttached){
      subjectsList.addEventListener('click', function(ev){
        const el = ev.target;
        if(!el) return;
        if(el.id === '_mobileAddSubject' || (el.closest && el.closest('#_mobileAddSubject'))){
          if(ev.preventDefault) ev.preventDefault();
          if(typeof openAddSubject !== 'undefined' && openAddSubject) openAddSubject.click();
          return;
        }
        if(el.classList && el.classList.contains('mobile-sub-view')){
          const sid = el.dataset.id;
          if(ev.preventDefault) ev.preventDefault();
          openViewSubjectModal({ target:{ dataset:{ id: sid } }});
          return;
        }
      });

      // mobile search sync
      subjectsList.addEventListener('input', function(ev){
        const t = ev.target;
        if(!t) return;
        if(t.id === '_mobileSubjectSearch'){
          if(subjectSearch) subjectSearch.value = t.value;
          renderSubjects();
        }
      });

      subjectsList.dataset.mobileHandlersAttached = '1';
    }

    return;
  }

  // DESKTOP (desktop header remains in page HTML)
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>Total subjects: ${total}</strong>
      <div class="muted">Columns: No, ID, Subject</div>
    </div>`;

  html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="text-align:left;border-bottom:1px solid #e6eef8">
        <th style="padding:8px;width:48px">No</th>
        <th style="padding:8px;width:140px">ID</th>
        <th style="padding:8px">Subject</th>
        <th style="padding:8px;width:220px">Actions</th>
      </tr>
    </thead><tbody>`;

  list.forEach((s, idx) => {
    const id = escape(s.id || '');
    const name = escape(s.name || '');
    html += `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px;vertical-align:middle">${idx+1}</td>
      <td style="padding:8px;vertical-align:middle">${id}</td>
      <td style="padding:8px;vertical-align:middle">${name}</td>
      <td style="padding:8px;vertical-align:middle">
        <button type="button" class="btn btn-ghost btn-sm view-sub" data-id="${id}">View</button>
        <button type="button" class="btn btn-ghost btn-sm edit-sub" data-id="${id}">Edit</button>
        <button type="button" class="btn btn-danger btn-sm del-sub" data-id="${id}">Delete</button>
      </td>
    </tr>`;
  });

  html += `</tbody></table></div>`;
  subjectsList.innerHTML = html;

  // wire desktop buttons
  subjectsList.querySelectorAll('.view-sub').forEach(b=> b.onclick = openViewSubjectModal);
  subjectsList.querySelectorAll('.edit-sub').forEach(b=> b.onclick = openEditSubjectModal);
  subjectsList.querySelectorAll('.del-sub').forEach(b=> b.onclick = deleteSubject);
}



/* ---------- View subject modal (unchanged but closes properly) ---------- */
function openViewSubjectModal(e){
  const id = (e && e.target) ? e.target.dataset.id : (e && e.dataset ? e.dataset.id : e);
  if(!id) return;
  const s = subjectsCache.find(x => x.id === id || x.name === id);
  if(!s) return toast('Subject not found', 'info');

  const includedIn = (classesCache || []).filter(c => Array.isArray(c.subjects) && c.subjects.includes(s.name || s.id));
  const classesHtml = includedIn.length ? `<div class="muted">${includedIn.map(c => escape(c.name)).join(', ')}</div>` : `<div class="muted">Not part of any class</div>`;
  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><strong>ID</strong><div class="muted">${escape(s.id||'')}</div></div>
      <div><strong>Subject</strong><div class="muted">${escape(s.name||'')}</div></div>
      <div style="grid-column:1 / -1"><strong>Used in classes (${includedIn.length})</strong>${classesHtml}</div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost" id="viewSubClose">Close</button>
      <button class="btn btn-ghost" id="viewSubEdit">Edit</button>
      <button class="btn btn-danger" id="viewSubDel">Delete</button>
    </div>
  `;
  showModal(`Subject — ${escape(s.name||'')}`, html);

  modalBody.querySelector('#viewSubClose').onclick = closeModal;
  modalBody.querySelector('#viewSubEdit').onclick = () => {
    closeModal();
    openEditSubjectModal({ target:{ dataset:{ id: s.id } }});
  };
  modalBody.querySelector('#viewSubDel').onclick = async (ev) => {
    const btn = ev && ev.currentTarget ? ev.currentTarget : modalBody.querySelector('#viewSubDel');
    if(!confirm('Delete subject?')) return;
    setButtonLoading(btn, true, 'Deleting...');
    try {
      await deleteSubject({ target:{ dataset:{ id: s.id } }});
      closeModal();
    } catch(err){
      console.error(err);
      toast('Delete failed', 'error', 3000);
    }
    setButtonLoading(btn, false);
  };
}
/* ---------- Add Subject ---------- */

openAddSubject && (openAddSubject.onclick = () => {
  showModal('Add Subject', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><label>Subject ID (optional)</label><input id="modalSubId" placeholder="SUB0001" /></div>
      <div>&nbsp;</div>
      <div style="grid-column:1 / -1"><label>Subject name</label><input id="modalSubName" placeholder="Mathematics" /></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button type="button" id="cancelSub" class="btn btn-ghost">Cancel</button>
      <button type="button" id="saveSub" class="btn btn-primary">Save</button>
    </div>
  `);

  modalBody.querySelector('#cancelSub').onclick = closeModal;

  modalBody.querySelector('#saveSub').onclick = async function(ev){
    const btn = ev && ev.currentTarget ? ev.currentTarget : this;
    setButtonLoading(btn, true, 'Saving...');
    try{
      let id = modalBody.querySelector('#modalSubId').value.trim();
      const name = modalBody.querySelector('#modalSubName').value.trim();
      if(!name){ toast('Name required', 'info'); setButtonLoading(btn, false); return; }
      if(!id) id = await generateDefaultId('subjects','SUB',4);
      await setDoc(doc(db,'subjects', id), { id, name });
      toast('Subject created', 'success');
      closeModal();
      await loadSubjects();
      renderSubjects();
      populateClassFilters();
      if(typeof populateTeachersSubjectFilter === 'function') populateTeachersSubjectFilter();
      showPage('subjects');
    } catch(err){
      console.error('create subject failed', err);
      toast('Failed to create subject', 'error', 3000);
    }
    setButtonLoading(btn, false);
  };
});

/* ---------- Edit Subject ---------- */
function openEditSubjectModal(e){
  const id = e && e.target ? e.target.dataset.id : e;
  const s = subjectsCache.find(x=>x.id===id);
  if(!s) return toast && toast('Subject not found', 'info');
  showModal('Edit Subject', `
    <div><label>Subject name</label><input id="modalSubName" value="${escape(s.name)}" /></div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button type="button" id="cancelSub" class="btn btn-ghost">Cancel</button>
      <button type="button" id="saveSub" class="btn btn-primary">Save</button>
    </div>
  `);
  modalBody.querySelector('#cancelSub').onclick = closeModal;

  modalBody.querySelector('#saveSub').onclick = async function(ev){
    const btn = ev && ev.currentTarget ? ev.currentTarget : this;
    setButtonLoading(btn, true, 'Saving...');
    try{
      const name = modalBody.querySelector('#modalSubName').value.trim();
      if(!name){ toast('Name required' , 'info'); setButtonLoading(btn, false); return; }
      await updateDoc(doc(db,'subjects',id), { name });
      toast('Subject updated', 'success');
      closeModal();
      await loadSubjects();
      renderSubjects();
      populateClassFilters();
      if(typeof populateTeachersSubjectFilter === 'function') populateTeachersSubjectFilter();
      showPage('subjects');
    } catch(err){
      console.error('update subject failed', err);
      toast('Failed to update subject' , 'error', 3000);
    }
    setButtonLoading(btn, false);
  };
}

/* ---------- Delete subject (desktop row or API) ---------- */
async function deleteSubject(e){
  const id = e && e.target ? e.target.dataset.id : e;
  if(!id) return;
  if(!confirm('Move subject to Recycle Bin?')) return;
  // If caller passed a button element, try to set loading on it (defensive)
  const btn = (e && e.currentTarget) || null;
  if(btn) setButtonLoading(btn, true, 'Deleting...');
  try {
    const who = (currentUser && currentUser.uid) || (auth && auth.currentUser && auth.currentUser.uid) || null;
    await updateDoc(doc(db,'subjects', id), {
      deleted: true,
      deletedAt: Timestamp.now(),
      deletedBy: who,
      deleted_at: Timestamp.now(),
      deleted_by: who
    });
    toast('Subject moved to Recycle Bin', 'info');
    await loadSubjects();
    renderSubjects();
    populateClassFilters && populateClassFilters();
    if(typeof populateTeachersSubjectFilter === 'function') populateTeachersSubjectFilter();
    showPage('subjects');
  } catch(err){
    console.error('delete subject failed', err);
    toast('Failed to delete subject' , 'error', 3000);
  }
  if(btn) setButtonLoading(btn, false);
}





/* events */
tabStudents && (tabStudents.onclick = ()=>showPage('students'));
tabClasses && (tabClasses.onclick = ()=>showPage('classes'));
tabSubjects && (tabSubjects.onclick = ()=>showPage('subjects'));
tabExams && (tabExams.onclick = ()=>showPage('exams'));
tabTeachers && (tabTeachers.onclick = ()=>showPage('teachers'));

studentsSearch && (studentsSearch.oninput = renderStudents);
studentsClassFilter && (studentsClassFilter.onchange = renderStudents);
studentsExamForTotals && (studentsExamForTotals.onchange = renderStudents);
classSearch && (classSearch.oninput = renderClasses);
subjectSearch && (subjectSearch.oninput = renderSubjects);
examSearch && (examSearch.oninput = renderExams);
examClassFilter && (examClassFilter.onchange = renderExams);
teachersSearch && (teachersSearch.oninput = renderTeachers);
teachersSubjectFilter && (teachersSubjectFilter.onchange = renderTeachers);




/** async renderStudents (awaits exam totals when the filter is set) */

/* ---------- Small helpers used by student UI (minimal, safe) ---------- */
// if your project already has `escape` or `escapeHtml`, this will reuse it

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



/* ---------- renderStudents (updated) ---------- */
async function renderStudents(){
  if(!studentsList) return;
  const q = (studentsSearch && studentsSearch.value||'').trim().toLowerCase();
  const classFilterVal = (studentsClassFilter && studentsClassFilter.value) || '';

  // If mobile, hide the top page header controls to avoid duplicates.
  const mobile = isMobileViewport();
  try {
    if(mobile){
      if(studentsSearch) studentsSearch.style.display = 'none';
      if(openAddStudent) openAddStudent.style.display = 'none';
      if(studentsClassFilter) studentsClassFilter.style.display = 'none';
    } else {
      // restore desktop header controls
      if(studentsSearch) studentsSearch.style.display = '';
      if(openAddStudent) openAddStudent.style.display = '';
      if(studentsClassFilter) studentsClassFilter.style.display = '';
    }
  } catch(e){ /* ignore styling errors if elements missing */ }

  // filter students (same logic as before)
  let filtered = (studentsCache || []).filter(s=>{
    if(s.deleted === true) return false;
    if(s.status === 'deleted') return false;
    if(classFilterVal && s.classId !== classFilterVal) return false;
    if(!q) return true;
    return (s.fullName||'').toLowerCase().includes(q) || (s.phone||'').toLowerCase().includes(q) || (s.studentId||'').toLowerCase().includes(q);
  });

  const total = filtered.length;

  // MOBILE: single header inside the list, class filter under header, total beneath header
  if(mobile){
    // build mobile class select HTML (use classesCache)
    const classOptions = (classesCache||[]).map(c=>`<option value="${escape(c.name)}">${escape(c.name)}</option>`).join('');
    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px">
        <div style="flex:1;display:flex;gap:8px;align-items:center">
          <input id="_mobileSearch" placeholder="Search students..." value="${escape(studentsSearch && studentsSearch.value||'')}" style="flex:1;padding:8px;border-radius:8px;border:1px solid #e6eef8" />
          <button id="_mobileAdd" class="btn btn-primary" style="white-space:nowrap">+ Add Student</button>
        </div>
      </div>

      <div style="margin-bottom:8px;display:flex;gap:8px;align-items:center">
        <select id="_mobileClassFilter" style="padding:8px;border-radius:8px;border:1px solid #e6eef8">
          <option value="">All classes</option>
          ${classOptions}
        </select>
        <div style="margin-left:auto;font-size:13px;color:#374151"><strong>Total: ${total}</strong></div>
      </div>

      <div id="studentsMobileList">
    `;

    filtered.forEach((s, idx) => {
      const sid = escape(s.studentId || s.id || '');
      const name = escape(s.fullName || '—');
      const cls = escape(s.classId || '—');
      html += `
        <div class="mobile-row" style="padding:10px;border-bottom:1px solid #f1f5f9">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="display:flex;gap:10px;align-items:center;flex:1;min-width:0">
              <div style="min-width:28px;text-align:center;font-weight:700">${idx+1}</div>
              <div style="min-width:0;overflow:hidden">
                <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
                <div style="font-size:12px;color:#667085;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">ID: ${sid} · Class: ${cls}</div>
              </div>
            </div>
            <div style="margin-left:8px"><button class="btn btn-ghost btn-sm mobile-more" data-id="${escape(s.studentId||s.id||'')}">⋮</button></div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    studentsList.innerHTML = html;

    // Attach mobile handlers once (delegation) to avoid duplicates
    if(!studentsList.dataset.mobileHandlersAttached){
      // click delegation (Add, More)
      studentsList.addEventListener('click', function(ev){
        const t = ev.target;
        if(!t) return;
        // Add Student
        if(t.id === '_mobileAdd' || (t.closest && t.closest('#_mobileAdd'))){
          if(typeof openAddStudent !== 'undefined' && openAddStudent) openAddStudent.click();
          return;
        }
        // More (view)
        if(t.classList && t.classList.contains('mobile-more')){
          const sid = t.dataset.id;
          openViewStudentModal({ target: { dataset: { id: sid } } });
          return;
        }
      });

      // input delegation for mobile search
      studentsList.addEventListener('input', function(ev){
        const t = ev.target;
        if(!t) return;
        if(t.id === '_mobileSearch'){
          if(studentsSearch) studentsSearch.value = t.value;
          renderStudents();
        }
      });

      // change delegation for mobile class filter
      studentsList.addEventListener('change', function(ev){
        const t = ev.target;
        if(!t) return;
        if(t.id === '_mobileClassFilter'){
          if(studentsClassFilter) studentsClassFilter.value = t.value;
          renderStudents();
        }
      });

      studentsList.dataset.mobileHandlersAttached = '1';
    }

    return;
  }

  // DESKTOP: table without Total column (unchanged)
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>Total students: ${total}</strong>
      <div class="muted">Columns: No, ID, Name, Parent, Class</div>
    </div>`;

  html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="text-align:left;border-bottom:1px solid #e6eef8">
        <th style="padding:8px;width:48px">No</th>
        <th style="padding:8px;width:140px">ID</th>
        <th style="padding:8px">Name</th>
        <th style="padding:8px;width:160px">Parent</th>
        <th style="padding:8px;width:120px">Class</th>
        <th style="padding:8px;width:220px">Actions</th>
      </tr>
    </thead><tbody>`;

  filtered.forEach((s, idx) => {
    const sid = escape(s.studentId || s.id || '');
    const parent = escape(s.parentPhone || s.motherName || '—');
    const cls = escape(s.classId || '—');
    html += `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px;vertical-align:middle">${idx+1}</td>
      <td style="padding:8px;vertical-align:middle">${sid}</td>
      <td style="padding:8px;vertical-align:middle">${escape(s.fullName||'')}</td>
      <td style="padding:8px;vertical-align:middle">${parent}</td>
      <td style="padding:8px;vertical-align:middle">${cls}</td>
      <td style="padding:8px;vertical-align:middle">
        <button class="btn btn-ghost btn-sm view-stu" data-id="${escape(s.studentId||s.id||'')}">View</button>
        <button class="btn btn-ghost btn-sm edit-stu" data-id="${escape(s.studentId||s.id||'')}">Edit</button>
        <button class="btn btn-danger btn-sm del-stu" data-id="${escape(s.studentId||s.id||'')}">${s.status==='deleted'?'Unblock':'Delete'}</button>
      </td>
    </tr>`;
  });

  html += `</tbody></table></div>`;
  studentsList.innerHTML = html;

  // desktop wiring
  studentsList.querySelectorAll('.view-stu').forEach(b=> b.addEventListener('click', openViewStudentModal));
  studentsList.querySelectorAll('.edit-stu').forEach(b=> b.addEventListener('click', openEditStudentModal));
  studentsList.querySelectorAll('.del-stu').forEach(b=> b.addEventListener('click', deleteOrUnblockStudent));
}



/* ---------- view student modal (updated delete flow) ---------- */


/* ---------- openViewStudentModal (show class NAME instead of raw id) ---------- */
async function openViewStudentModal(e){
  // Accept: event (with currentTarget.dataset.id), event.target, object with dataset, or plain string id
  let id = null;
  if(typeof e === 'string') id = e;
  else if(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) id = e.currentTarget.dataset.id;
  else if(e && e.target && e.target.dataset && e.target.dataset.id) id = e.target.dataset.id;
  else if(e && e.dataset && e.dataset.id) id = e.dataset.id;

  if(!id) return;
  let s = studentsCache.find(x => x.studentId === id || x.id === id);
  if(!s && typeof getDoc === 'function'){
    try {
      const snap = await getDoc(doc(db,'students', id));
      if(snap.exists()) s = { id: snap.id, ...snap.data() };
    } catch(err){ console.error('load student for view failed', err); }
  }
  if(!s) return toast && toast('Student not found');

  // compute class display name (prefer classesCache name lookup)
  const clsObj = (classesCache || []).find(c => c.id === s.classId || c.name === s.classId);
  const classDisplay = (clsObj && (clsObj.name || clsObj.id)) || (s.classId || '—');

  // inside openViewStudentModal, just before building html we try to read latest fee record
let latestFee = null;
try {
  if(s && (s.studentId || s.id)) {
    const sidDoc = s.studentId || s.id;
    // attempt to get the latest fee entry (ordered by createdAt desc)
    const feeQ = query(collection(db, 'students', sidDoc, 'fees'), orderBy('createdAt','desc'));
    const feeSnap = await getDocs(feeQ);
    if(feeSnap && feeSnap.docs && feeSnap.docs.length) latestFee = feeSnap.docs[0].data();
  }
} catch(e){
  console.warn('failed to load latest fee for student view', e);
}

// decide displayed fee (prefer explicit top-level field, fallback to latest fee record)
const displayedFee = (typeof s.fee !== 'undefined' && s.fee !== null) ? s.fee : (latestFee ? latestFee.amount : null);
const feeTypeDisplay = (s.feeType || (latestFee ? latestFee.type : '')) || '';
const feeStartDisplay = (s.feeStartDate ? (s.feeStartDate.seconds ? new Date(s.feeStartDate.seconds*1000) : new Date(s.feeStartDate)).toLocaleDateString() : (latestFee && latestFee.startDate ? (latestFee.startDate.toDate ? latestFee.startDate.toDate().toLocaleDateString() : new Date(latestFee.startDate).toLocaleDateString()) : '—'));

  const html = `

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div><strong>ID</strong><div class="muted">${escape(s.studentId||s.id||'')}</div></div>
      <div><strong>Name</strong><div class="muted">${escape(s.fullName||'')}</div></div>
      <div><strong>Mother</strong><div class="muted">${escape(s.motherName||'')}</div></div>
      <div><strong>Phone</strong><div class="muted">${escape(s.phone||'')}</div></div>
      <div><strong>Parent phone</strong><div class="muted">${escape(s.parentPhone||'')}</div></div>
      <div><strong>Age</strong><div class="muted">${escape(String(s.age||'—'))}</div></div>
      <div><strong>Gender</strong><div class="muted">${escape(s.gender||'—')}</div></div>
<div><strong>Fee</strong><div class="muted">${displayedFee ? escape(String(displayedFee)) + (feeTypeDisplay ? ' • ' + escape(feeTypeDisplay) : '') : '—'}${displayedFee ? `<div class="tt-small muted">Start: ${escape(feeStartDisplay)}</div>` : ''}</div></div>

<div style="grid-column:1 / -1"><strong>Class</strong><div class="muted">${escape(classDisplay)}</div></div>
      <div style="grid-column:1 / -1"><strong>Status</strong><div class="muted">${escape(s.status||'active')}</div></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost" id="viewStuEdit">Edit</button>
      <button class="btn btn-danger" id="viewStuDel">${s.status==='deleted' ? 'Unblock' : 'Delete'}</button>
      <button class="btn btn-primary" id="viewStuClose">Close</button>
    </div>
  `;
  showModal(`${escape(s.fullName||'Student')}`, html);

  // safe accessor for modal elements (tries modalBody first, then document)
  const getEl = (sel) => (typeof modalBody !== 'undefined' && modalBody && modalBody.querySelector(sel)) || document.getElementById(sel);

  const btnClose = getEl('#viewStuClose');
  const btnEdit = getEl('#viewStuEdit');
  const btnDel = getEl('#viewStuDel');

  if(btnClose) btnClose.onclick = closeModal;
  if(btnEdit) btnEdit.onclick = () => {
    closeModal();
    // call robust edit modal (can accept event-like or id)
    openEditStudentModal({ currentTarget:{ dataset:{ id: s.studentId || s.id } } });
  };

  if(btnDel) btnDel.onclick = async () => {
    const delBtn = btnDel;
    if(s.status === 'deleted'){
      setButtonLoading(delBtn, true, 'Unblocking...');
      try{
        await updateDoc(doc(db,'students', s.studentId), { status:'active' });
        await setDoc(doc(db,'studentsLatest', s.studentId), { blocked:false }, { merge:true });
        await loadStudents(); renderStudents(); toast(`${s.fullName} unblocked`);
        closeModal();
      }catch(err){ console.error(err); toast('Failed to unblock'); }
      setButtonLoading(delBtn, false);
      return;
    }

    const ok = await modalConfirm('Confirm delete', 'Delete student? This will mark student as deleted and move to recycle (blocked).');
    if(!ok) return;

    setButtonLoading(delBtn, true, 'Deleting...');
    try{
      await updateDoc(doc(db,'students', s.studentId), { status:'deleted' });
      await setDoc(doc(db,'studentsLatest', s.studentId), { blocked:true, blockMessage:'Removed by admin' }, { merge:true });
      await loadStudents(); renderStudents(); toast(`${s.fullName} deleted and blocked`);
      closeModal();
    }catch(err){ console.error(err); toast('Failed to delete'); }
    setButtonLoading(delBtn, false);
  };
}

/* ---------- openEditStudentModal (robust, guards missing elements) ---------- */
function openEditStudentModal(e){
  // Accept event/currentTarget/target/dataset string or plain id
  let id = null;
  if(typeof e === 'string') id = e;
  else if(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) id = e.currentTarget.dataset.id;
  else if(e && e.target && e.target.dataset && e.target.dataset.id) id = e.target.dataset.id;
  else if(e && e.dataset && e.dataset.id) id = e.dataset.id;

  if(!id) return;
  const s = studentsCache.find(x => x.studentId === id || x.id === id);
  if(!s) return toast && toast('Student not found');

  // build class options with selected match (use class.name as value)
  const options = (classesCache || []).map(c => {
    const val = escape(c.name || '');
    const selected = (c.name === s.classId || c.id === s.classId) ? 'selected' : '';
    return `<option value="${val}" ${selected}>${escape(c.name || c.id || '')}</option>`;
  }).join('');

  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><label>Student ID</label><input id="stuId" value="${escape(s.studentId || s.id || '')}" disabled /></div>
      <div><label>Class</label><select id="stuClass"><option value="">Select class</option>${options}</select></div>
      <div style="grid-column:1 / -1"><label>Full name</label><input id="stuName" value="${escape(s.fullName||'')}" /></div>
      <div><label>Mother's name</label><input id="stuMother" value="${escape(s.motherName||'')}" /></div>
      <div><label>Phone</label><input id="stuPhone" value="${escape(s.phone||'')}" /></div>
      <div><label>Parent phone</label><input id="stuParentPhone" value="${escape(s.parentPhone||'')}" /></div>
      <div><label>Age</label><input id="stuAge" type="number" value="${escape(String(s.age||''))}" /></div>
      <div><label>Gender</label>
        <select id="stuGender">
          <option value="">Select</option>
          <option value="Male" ${s.gender==='Male' ? 'selected' : ''}>Male</option>
          <option value="Female" ${s.gender==='Female' ? 'selected' : ''}>Female</option>
        </select>
      </div>
      <div style="grid-column:1 / -1"><label>Fee</label><input id="stuFee" type="number" value="${escape(String(s.fee||''))}" /></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="cancelStu" class="btn btn-ghost">Cancel</button>
      <button id="saveStu" class="btn btn-primary">Save</button>
    </div>
  `;

  showModal('Edit Student', html);

  // safe accessor for modal elements (tries modalBody then document)
  const getEl = (sel) => (typeof modalBody !== 'undefined' && modalBody && modalBody.querySelector(sel)) || document.getElementById(sel);

  const btnCancel = getEl('#cancelStu');
  const btnSave = getEl('#saveStu');

  if(btnCancel) btnCancel.onclick = closeModal;

  if(btnSave) {
    btnSave.onclick = async (ev) => {
      const btn = ev.currentTarget;
      try{
        setButtonLoading(btn, true, 'Saving...');
        const name = (getEl('#stuName') ? getEl('#stuName').value.trim() : '');
        const mother = (getEl('#stuMother') ? getEl('#stuMother').value.trim() : '');
        const phone = (getEl('#stuPhone') ? getEl('#stuPhone').value.trim() : '');
        const parentPhone = (getEl('#stuParentPhone') ? getEl('#stuParentPhone').value.trim() : '');
        const age = Number(getEl('#stuAge') ? getEl('#stuAge').value : null) || null;
        const gender = (getEl('#stuGender') ? getEl('#stuGender').value : null);
        const fee = (getEl('#stuFee') && getEl('#stuFee').value) ? Number(getEl('#stuFee').value) : null;
        const classId = getEl('#stuClass') ? getEl('#stuClass').value : null;

        if(!name){ alert('Name required'); setButtonLoading(btn, false); return; }
        if(gender && !['Male','Female'].includes(gender)){ alert('Gender must be Male or Female'); setButtonLoading(btn, false); return; }

        // update document (use studentId as doc id if that's how you store them)
        await updateDoc(doc(db,'students', s.studentId || s.id), {
          fullName: name,
          motherName: mother || '',
          phone,
          parentPhone: parentPhone || '',
          age,
          gender: gender || null,
          fee: fee,
          classId: classId || null
        });

        // optimistic local update if cache exists
        const sc = (studentsCache || []).find(x => (x.studentId === s.studentId || x.id === s.id));
        if(sc){
          sc.fullName = name;
          sc.motherName = mother || '';
          sc.phone = phone;
          sc.parentPhone = parentPhone || '';
          sc.age = age;
          sc.gender = gender || null;
          sc.fee = fee;
          sc.classId = classId || null;
        }

        closeModal();
        await loadStudents();
        renderStudents();
        toast(`${name} updated`,'success');
      }catch(err){
        console.error(err);
        toast('Failed to update', 'error', 3000);
      }
      setButtonLoading(btn, false);
    };
  } else {
    // if save button not found, log to console but don't throw
    console.warn('Edit student: save button not found in modal.');
  }
}


/* ---------- Add student (save button loading + prevent duplicate clicks) ---------- */
openAddStudent && (openAddStudent.onclick = () => {
  const options = (classesCache || []).map(c=>`<option value="${escape(c.name)}">${escape(c.name)}</option>`).join('');
  showModal('Add Student', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><label>Student ID</label><input id="stuId" placeholder="e.g. 12345" /></div>
      <div><label>Class</label><select id="stuClass"><option value="">Select class</option>${options}</select></div>
      <div style="grid-column:1 / -1"><label>Full name</label><input id="stuName" /></div>
      <div><label>Mother's name</label><input id="stuMother" placeholder="Faadum Abdi Ahmed" /></div>
      <div><label>Phone</label><input id="stuPhone" /></div>
      <div><label>Parent phone</label><input id="stuParentPhone" /></div>
      <div><label>Age</label><input id="stuAge" type="number" min="3" max="30" /></div>
      <div><label>Gender</label><select id="stuGender"><option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option></select></div>
      <div style="grid-column:1 / -1"><label>Fee</label><input id="stuFee" type="number" min="0" /></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="cancelStu" class="btn btn-ghost">Cancel</button>
      <button id="saveStu" class="btn btn-primary">Save</button>
    </div>
  `);

  modalBody.querySelector('#cancelStu').onclick = closeModal;
  modalBody.querySelector('#saveStu').onclick = async (ev) => {
    const btn = ev.currentTarget;
    try{
      setButtonLoading(btn, true, 'Saving...');
      let id = modalBody.querySelector('#stuId').value.trim();
      const name = modalBody.querySelector('#stuName').value.trim();
      const mother = modalBody.querySelector('#stuMother').value.trim();
      const phone = modalBody.querySelector('#stuPhone').value.trim();
      const parentPhone = modalBody.querySelector('#stuParentPhone').value.trim();
      const age = Number(modalBody.querySelector('#stuAge').value) || null;
      const gender = (modalBody.querySelector('#stuGender').value || null);
      const fee = modalBody.querySelector('#stuFee').value ? Number(modalBody.querySelector('#stuFee').value) : null;
      const classId = modalBody.querySelector('#stuClass').value;
      if(!name){ alert('Name required'); setButtonLoading(btn, false); return; }
      if(gender && !['Male','Female'].includes(gender)){ alert('Gender must be Male or Female'); setButtonLoading(btn, false); return; }
      if(!id) id = await generateDefaultId('students','STD',9);
      await setDoc(doc(db,'students',id), { studentId:id, fullName:name, motherName: mother || '', phone, parentPhone: parentPhone || '', age, gender: gender || null, fee: fee, classId, status:'active' });
      closeModal(); await loadStudents(); renderStudents(); toast(`${name} created`,'success');
    }catch(err){ console.error(err); toast('Failed to create', 'error', 3000); }
    setButtonLoading(btn, false);
  };
});



/* ---------- delete/unblock from list (desktop) - modalConfirm + loading ---------- */
async function deleteOrUnblockStudent(e){
  const id = e.target.dataset.id;
  const s = studentsCache.find(x=>x.studentId===id || x.id===id);
  if(!s) return;
  const btn = e.target;

  if(s.status === 'deleted'){
    setButtonLoading(btn, true, 'Unblocking...');
    try{
      await updateDoc(doc(db,'students',s.studentId), { status:'active' });
      await setDoc(doc(db,'studentsLatest', s.studentId), { blocked:false }, { merge:true });
      await loadStudents(); renderStudents(); toast(`${s.fullName} unblocked`);
    }catch(err){ console.error(err); toast('Failed to unblock'); }
    setButtonLoading(btn, false);
    return;
  }

  const ok = await modalConfirm('Confirm delete', 'Delete student? This will mark student as deleted and move to recycle (blocked).');
  if(!ok) return;

  setButtonLoading(btn, true, 'Deleting...');
  try{
    await updateDoc(doc(db,'students',s.studentId), { status:'deleted' });
    await setDoc(doc(db,'studentsLatest', s.studentId), { blocked:true, blockMessage:'Removed by admin' }, { merge:true });
    await loadStudents(); renderStudents(); toast(`${s.fullName} deleted and blocked`,'warning');
  }catch(err){ console.error(err); toast('Failed to delete', 'error', 3000); }
  setButtonLoading(btn, false);
}






/* -------------------------------------
   Exam open / add results / publish
   -------------------------------------*/

   function renderExams(){
    if(!examsList) return;
  
    // ensure sort control exists
    const controlsId = 'examControlsArea';
    let controls = document.getElementById(controlsId);
    if(!controls && pageExams){
      controls = document.createElement('div'); controls.id = controlsId; controls.style.marginBottom = '8px';
      const sel = document.createElement('select'); sel.id = 'examSortSelect';
      sel.innerHTML = `<option value="date">Sort: Date (default)</option><option value="a-z">A → Z</option><option value="z-a">Z → A</option>`;
      sel.value = examSortMode || 'date';
      sel.onchange = (ev)=>{ examSortMode = ev.target.value; renderExams(); };
      controls.appendChild(sel);
      pageExams.insertBefore(controls, examsList);
    } else if(controls){
      const sel = document.getElementById('examSortSelect'); if(sel) sel.value = examSortMode;
    }
  
    const q = (examSearch && examSearch.value||'').trim().toLowerCase();
    const classFilterVal = (examClassFilter && examClassFilter.value) || '';
    examsList.innerHTML = '';
  
    let list = (examsCache || []).filter(e => !e.deleted);
  
    // filter
    list = list.filter(e => {
      if(classFilterVal && (!e.classes || !e.classes.includes(classFilterVal))) return false;
      if(!q) return true;
      return (e.name||'').toLowerCase().includes(q) || (String(e.id||'')).toLowerCase().includes(q);
    });
  
    // sort
    if(examSortMode === 'date'){
      list.sort((a,b)=> {
        const ta = (a.date && a.date.seconds) ? a.date.seconds : (a.publishedAt?.seconds || 0);
        const tb = (b.date && b.date.seconds) ? b.date.seconds : (b.publishedAt?.seconds || 0);
        return tb - ta;
      });
    } else if(examSortMode === 'a-z'){
      list.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
    } else if(examSortMode === 'z-a'){
      list.sort((a,b)=> (b.name||'').localeCompare(a.name||''));
    }

    
  
  
    const mobile = (typeof isMobileViewport === 'function')
  ? isMobileViewport()
  : window.matchMedia('(max-width:768px)').matches;



// 🚫 do NOT render desktop controls on mobile
if(!mobile && !controls && pageExams){
  controls = document.createElement('div');
  controls.id = controlsId;
  controls.style.marginBottom = '8px';

  const sel = document.createElement('select');
  sel.id = 'examSortSelect';
  sel.innerHTML = `
    <option value="date">Sort: Date (default)</option>
    <option value="a-z">A → Z</option>
    <option value="z-a">Z → A</option>
  `;
  sel.value = examSortMode || 'date';
  sel.onchange = ev => { examSortMode = ev.target.value; renderExams(); };

  controls.appendChild(sel);
  pageExams.insertBefore(controls, examsList);
}

// --- find original global Add button if present (so we can hide it on mobile) ---
const originalAddBtn = (typeof openAddExam !== 'undefined' && openAddExam) ? openAddExam :
  (document.getElementById && document.getElementById('openAddExam')) ? document.getElementById('openAddExam') : null;

// hide desktop header controls on mobile (and hide the original Add button)
if(mobile){
  if(examSearch) examSearch.style.display = 'none';
  if(examClassFilter) examClassFilter.style.display = 'none';
  if(controls) controls.style.display = 'none';
  if(originalAddBtn) originalAddBtn.style.display = 'none';
} else {
  if(examSearch) examSearch.style.display = '';
  if(examClassFilter) examClassFilter.style.display = '';
  if(controls) controls.style.display = '';
  if(originalAddBtn) originalAddBtn.style.display = '';
}

// ... later: build mobile header/list HTML (replace your previous mobile html) ...
if(mobile){
  let html = `
  <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
    <input id="examSearchMobile" class="input" placeholder="Search exams..." style="flex:1" />
    <button id="examAddMobile" class="btn btn-primary btn-sm">+ Add</button>
  </div>

  <div style="display:flex;gap:8px;margin-bottom:6px">
    <select id="examClassFilterMobile" class="input" style="flex:1">
      <option value="">All Classes</option>
      ${(examClassFilter?.innerHTML || '')}
    </select>

    <select id="examSortMobile" class="input">
      <option value="date">Date</option>
      <option value="a-z">A → Z</option>
      <option value="z-a">Z → A</option>
    </select>
  </div>

  <div style="text-align:right;font-size:13px;font-weight:600;color:#334155;margin-bottom:8px">
    Total exams: ${list.length}
  </div>

  <div id="examsMobileList">
  `;

  list.forEach((e, idx) => {
    const status = e.status === 'published' ? 'Published' : (e.status === 'deactivated' ? 'Deactivated' : 'Unpublished');
    const statusBg = e.status === 'published' ? '#059669' : (e.status === 'deactivated' ? '#dc2626' : '#6b7280');
    const subjectsCount = (e.subjects || []).length;
    const classesCount = (e.classes || []).length;

    html += `
<div style="padding:12px;border-bottom:1px solid #f1f5f9">

  <!-- LINE 1 -->
  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
    <div style="flex:1;min-width:0;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
      ${escape(e.name || '')}
      <span style="font-size:12px;font-weight:600;margin-left:6px;color:#7c3aed">
        · ${classesCount} Classes
      </span>
    </div>

    <div style="background:${statusBg};color:#fff;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700">
      ${escape(status)}
    </div>
  </div>

  <!-- LINE 2 -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
    <div style="font-size:12px;color:#60a5fa">
      ID: ${escape(e.id || '')}
      <span style="color:#059669"> · ${subjectsCount} Subjects</span>
    </div>

    <button class="btn btn-ghost btn-sm mobile-exam-more" data-id="${escape(e.id)}">⋮</button>
  </div>

</div>
`;
  });

  html += `</div>`;
  examsList.innerHTML = html;

  // --- wire mobile controls (search / class filter / sort) ---
  const mSearch = document.getElementById('examSearchMobile');
  if(mSearch){
    mSearch.value = examSearch?.value || '';
    mSearch.oninput = e => {
      if(examSearch){
        examSearch.value = e.target.value;
      }
      renderExams();
    };
  }

  const mClass = document.getElementById('examClassFilterMobile');
  if(mClass){
    mClass.value = examClassFilter?.value || '';
    mClass.onchange = e => {
      if(examClassFilter){
        examClassFilter.value = e.target.value;
      }
      renderExams();
    };
  }

  const sortSel = document.getElementById('examSortMobile');
  if(sortSel){
    sortSel.value = examSortMode || 'date';
    sortSel.onchange = e => {
      examSortMode = e.target.value;
      renderExams();
    };
  }

  // wire the mobile Add button to open the existing Add modal (use originalAddBtn if available)
  const mobileAdd = document.getElementById('examAddMobile');
  if(mobileAdd){
    mobileAdd.onclick = () => {
      if(originalAddBtn && typeof originalAddBtn.click === 'function') originalAddBtn.click();
      else if(typeof openAddExam === 'object' && openAddExam && openAddExam.click) openAddExam.click();
      else {
        // fallback: try to find a button by a common id
        const fallback = document.getElementById('openAddExam');
        if(fallback) fallback.click();
      }
    };
  }

  // mobile more buttons: open modal summary
  examsList.querySelectorAll('.mobile-exam-more').forEach(b => {
    b.onclick = (ev) => openExamModal(ev.currentTarget.dataset.id);
  });

  return;
}

  
    // DESKTOP view: more complete rows, status pill + buttons (View/Open/Edit/Delete/Publish)
    for(const e of list){
      const status = e.status || 'draft';
      const statusBg = status === 'published' ? '#059669' : (status === 'deactivated' ? '#dc2626' : '#dc2626');
      const classesText = e.classes && e.classes.length ? e.classes.join(', ') : 'All classes';
      const dateText = e.date ? (new Date(e.date.seconds ? e.date.seconds*1000 : e.date)).toLocaleDateString() : '';
      const subjText = (e.subjects || []).map(s => s.name || s).join(', ') || 'No subjects';
  
      const div = document.createElement('div'); div.className='row';
      div.style.display = 'flex';
      div.style.justifyContent = 'space-between';
      div.style.alignItems = 'center';
      div.style.padding = '10px 0';
      div.style.borderBottom = '1px solid #f1f5f9';
      div.innerHTML = `<div style="flex:1;min-width:0">
          <strong style="display:block">${escape(e.name)}</strong>
          <div style="font-size:13px;color:#6b7280;margin-top:6px">ID: ${escape(e.id||'')} ·
  Total Subjects: ${(e.subjects||[]).length} · Total Classes: ${(e.classes||[]).length}
</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
          <div style="background:${statusBg};color:#fff;padding:6px 10px;border-radius:8px;font-weight:700;font-size:12px">${escape(status === 'published' ? 'Published' : (status === 'deactivated' ? 'Deactivated' : 'Unpublished'))}</div>
      <button class="btn btn-ghost btn-sm view-exam" data-id="${escape(e.id)}">${svgView()}</button>
<button class="btn btn-ghost btn-sm open-exam" data-id="${escape(e.id)}">Open</button>
<button class="btn btn-ghost btn-sm edit-exam" data-id="${escape(e.id)}">${svgEdit()}</button>
<button class="btn btn-ghost btn-sm del-exam" data-id="${escape(e.id)}">${svgDelete()}</button>

<button class="btn btn-primary btn-sm pub-exam" data-id="${escape(e.id)}">${e.status === 'published' ? 'Unpublish' : 'Publish'}</button>
        </div>`;
      examsList.appendChild(div);
    }
  
    // wire actions
    document.querySelectorAll('.view-exam').forEach(b => b.onclick = (ev) => openExamModal(ev.currentTarget.dataset.id));
    document.querySelectorAll('.open-exam').forEach(b => b.onclick = openExam);
    document.querySelectorAll('.edit-exam').forEach(b => b.onclick = openEditExamModal);
    document.querySelectorAll('.del-exam').forEach(b => b.onclick = deleteExam);
    document.querySelectorAll('.pub-exam').forEach(b => b.onclick = togglePublishExam);
  }


/* ---------- openExamModal (show exam details + footer actions) ---------- */
async function openExamModal(examId){
  if(!examId) return;
  let ex = examsCache.find(x => x.id === examId);
  if(!ex){
    try {
      const snap = await getDoc(doc(db,'exams', examId));
      if(!snap.exists()) return toast && toast('Exam not found' , 'error', 3000);
      ex = { id: snap.id, ...snap.data() };
    } catch(err){ console.error('openExamModal load failed', err); return toast && toast('Failed to load exam' , 'error', 3000); }
  }

  const statusLabel = ex.status === 'published' ? 'Published' : (ex.status === 'deactivated' ? 'Deactivated' : 'Unpublished');
  const statusBg = ex.status === 'published' ? '#059669' : (ex.status === 'deactivated' ? '#dc2626' : '#dc2626');
  const classesText = (ex.classes && ex.classes.length) ? ex.classes.join(', ') : 'All classes';
  const dateText = ex.date ? (new Date(ex.date.seconds ? ex.date.seconds*1000 : ex.date)).toLocaleDateString() : '—';
  const subjText = (ex.subjects || []).map(s => s.name || s).join(', ') || 'No subjects';

  const html = `
    <div style="display:grid;grid-template-columns:1fr;gap:8px">
      <div><strong>Exam</strong><div class="muted">${escape(ex.name||'')}</div></div>
      <div><strong>ID</strong><div class="muted">${escape(ex.id||'')}</div></div>
      <div><strong>Status</strong><div style="background:${statusBg};color:#fff;padding:6px 8px;border-radius:8px;display:inline-block;margin-top:6px">${escape(statusLabel)}</div></div>
      <div><strong>Classes assigned</strong><div class="muted">${escape(classesText)}</div></div>
      <div><strong>Subjects</strong><div class="muted">${escape(subjText)}</div></div>
      <div><strong>Date</strong><div class="muted">${escape(dateText)}</div></div>
      <div><strong>Created</strong><div class="muted">${ex.createdAt ? (new Date(ex.createdAt.seconds ? ex.createdAt.seconds*1000 : ex.createdAt)).toLocaleString() : '—'}</div></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
      <button class="btn btn-ghost" id="examModalOpen">Open</button>
      <button class="btn btn-ghost" id="examModalEdit">Edit</button>
      <button class="btn btn-danger" id="examModalDelete">Delete</button>
      <button class="btn btn-primary" id="examModalToggle">${ex.status==='published' ? 'Unpublish' : 'Publish'}</button>
      <button class="btn" id="examModalClose">Close</button>
    </div>
  `;

  showModal(`${escape(ex.name||'Exam')}`, html);

  const openBtn = document.getElementById('examModalOpen');
  const editBtn = document.getElementById('examModalEdit');
  const delBtn = document.getElementById('examModalDelete');

  if(ex.status === 'published'){
    delBtn.style.display = 'none';
  }
  
  const toggleBtn = document.getElementById('examModalToggle');
  const closeBtn = document.getElementById('examModalClose');

  if(openBtn) openBtn.onclick = () => { closeModal(); openExam({ target: { dataset: { id: ex.id } } }); };
  if(editBtn) editBtn.onclick = () => { closeModal(); openEditExamModal({ target: { dataset: { id: ex.id } } }); };
  if(delBtn){
    delBtn.onclick = async () => {
      const ok = await modalConfirm(
        'Move Exam to Recycle Bin',
        `Are you sure you want to move <strong>${escape(ex.name||'')}</strong> into the Recycle Bin?`
      );
      if(!ok) return;
  
      setButtonLoading(delBtn, true, 'Deleting...');
      try{
        await deleteExam({ target:{ dataset:{ id: ex.id } }, currentTarget: delBtn });
        closeModal();
      }catch(err){
        console.error(err);
        toast('Delete failed');
      }
      setButtonLoading(delBtn, false);
    };
  };  
  if(toggleBtn) toggleBtn.onclick = async (ev) => {
    setButtonLoading(toggleBtn, true, ex.status === 'published' ? 'Unpublishing...' : 'Publishing...');
    try {
      await togglePublishExam({ target: { dataset: { id: ex.id } }, currentTarget: toggleBtn });
      // refresh exam modal with fresh data
      await loadExams();
      closeModal();
      openExamModal(ex.id);
    } catch(err){
      console.error(err);
      toast('Publish toggle failed');
    }
    setButtonLoading(toggleBtn, false);
  };
  if(closeBtn) closeBtn.onclick = closeModal;
}

  
function openExam(e){
  const btn = e.currentTarget || e.target.closest('[data-id]');
  const id = btn?.dataset?.id;
  if(!id) return toast('Exam not found');

  window.location.href = `exam.html?examId=${encodeURIComponent(id)}`;
}

/* create / edit / delete / publish exam (same UI) */
openAddExam && (openAddExam.onclick = () => {
  // build examSubjects & examClasses HTML (same as earlier)
  const examLinkOptions = examsCache.map(e => `<option value="${e.id}">${escape(e.name)} ${e.status==='published'?'(published)':''}</option>`).join('');
  const subjHtml = subjectsCache.map(s => {
    const defMax = s.max || 100;
    return `<label style="display:inline-block;margin-right:8px; margin-bottom:6px;">
      <input type="checkbox" class="exam-sub" data-name="${escape(s.name)}" data-default-max="${escape(String(defMax))}" checked />
      ${escape(s.name)}
      <input class="exam-sub-max" data-name="${escape(s.name)}" value="${escape(String(defMax))}" style="width:66px;margin-left:6px;padding:2px" />
      <small style="margin-left:6px;color:#6b7280">max</small>
    </label>`;
  }).join('');
  const classHtml = classesCache.map(c => `<label style="display:inline-block;margin-right:6px"><input type="checkbox" class="exam-cls" data-name="${escape(c.name)}" checked /> ${escape(c.name)}</label>`).join('');

  showModal('Create Exam', `
    <label>Exam name</label><input id="examName" placeholder="Midterm 2026" />
    <label>Date</label><input id="examDate" type="date" />
    <div style="margin-top:8px">
      <label>Link from existing exam (optional)</label>
      <select id="linkFromExam"><option value="">— New exam —</option>${examLinkOptions}</select>
      <div style="font-size:0.9rem;color:#6b7280;margin-top:6px">If you select an existing exam, this new exam will use remaining per-subject max (100 - linked.max).</div>
    </div>

    <div style="margin-top:8px"><button id="toggleChkSubjects" class="btn btn-ghost btn-sm">Uncheck All Subjects</button> <button id="setMaxAll" class="btn btn-ghost btn-sm">Set max for checked</button></div>
    <label style="margin-top:8px">Subjects (each has its own max)</label><div id="examSubjects">${subjHtml || '<div class="muted">No subjects</div>'}</div>
    <div style="margin-top:8px"><button id="toggleChkClasses" class="btn btn-ghost btn-sm">Uncheck All Classes</button></div>
    <label style="margin-top:8px">Classes</label><div id="examClasses">${classHtml || '<div class="muted">No classes</div>'}</div>

    <div style="margin-top:8px">
      <label><input type="checkbox" id="enableAssignment" /> Enable Assignment</label>
      <label><input type="checkbox" id="enableQuiz" /> Enable Quiz</label>
      <label><input type="checkbox" id="enableMonthly" /> Enable Monthly</label>
      <label><input type="checkbox" id="enableCW1" /> Enable CW1</label>
      <label><input type="checkbox" id="enableCW2" /> Enable CW2</label>
      <label><input type="checkbox" id="enableExam" checked disabled /> Enable Exam</label>
    </div>

    <div style="margin-top:12px"><button id="saveExam" class="btn btn-primary">Create</button> <button id="cancelExam" class="btn btn-ghost">Cancel</button></div>
  `);

  // utilities for linking
  async function applyLinking(linkedId){
    // if not linking -> restore defaults (subjectsCache defaults)
    if(!linkedId){
      // rebuild UI subjects from subjectsCache (defaults)
      modalBody.querySelector('#examSubjects').innerHTML = subjectsCache.map(s=>{
        const defMax = s.max || 100;
        return `<label style="display:inline-block;margin-right:8px; margin-bottom:6px;">
          <input type="checkbox" class="exam-sub" data-name="${escape(s.name)}" data-default-max="${escape(String(defMax))}" checked />
          ${escape(s.name)}
          <input class="exam-sub-max" data-name="${escape(s.name)}" value="${escape(String(defMax))}" style="width:66px;margin-left:6px;padding:2px" />
          <small style="margin-left:6px;color:#6b7280">max</small>
        </label>`;
      }).join('');
      return;
    }

    // fetch linked exam data
    const linkedSnap = await getDoc(doc(db,'exams', linkedId));
    if(!linkedSnap.exists()){
      alert('Linked exam not found'); return;
    }
    const linked = linkedSnap.data();
    const linkedSubjectsMap = new Map((linked.subjects || []).map(s=>[s.name, s.max || 0]));

    // compute new subject list: for each subject that exists in linked, compute remainder = 100 - linkedMax
    // also include other subjects (not linked) but remainder = 100 (admin can choose)
    const htmlParts = subjectsCache.map(s=>{
      const linkedMax = linkedSubjectsMap.get(s.name);
      if(linkedMax != null){
        const remainder = Math.max(0, 100 - Number(linkedMax));
        if(remainder <= 0){
          // disabled: linked exam already uses full 100 for this subject
          return `<div style="display:inline-block;vertical-align:top;margin-right:8px;margin-bottom:10px;width:220px">
            <label style="display:block">
              <input type="checkbox" class="exam-sub" data-name="${escape(s.name)}" data-default-max="${escape(String(s.max||100))}" disabled />
              ${escape(s.name)} <small style="color:#b91c1c"> (no remainder)</small>
            </label>
            <div style="margin-top:4px">
              <input class="exam-sub-max" data-name="${escape(s.name)}" value="${escape(String(remainder))}" style="width:66px;margin-left:6px;padding:2px" disabled/>
              <small style="margin-left:6px;color:#6b7280">max (remaining)</small>
            </div>
            <div style="font-size:0.78rem;color:#6b7280;margin-top:4px">Linked exam already allocates ${linkedMax} — remainder ${remainder}</div>
          </div>`;
        } else {
          // enabled with remainder
          return `<div style="display:inline-block;vertical-align:top;margin-right:8px;margin-bottom:10px;width:220px">
            <label style="display:block">
              <input type="checkbox" class="exam-sub" data-name="${escape(s.name)}" data-default-max="${escape(String(remainder))}" checked />
              ${escape(s.name)}
            </label>
            <div style="margin-top:4px">
              <input class="exam-sub-max" data-name="${escape(s.name)}" value="${escape(String(remainder))}" style="width:66px;margin-left:6px;padding:2px" />
              <small style="margin-left:6px;color:#6b7280">max (remaining)</small>
            </div>
            <div style="font-size:0.78rem;color:#6b7280;margin-top:4px">Linked exam uses ${linkedMax}, remainder ${remainder}</div>
          </div>`;
        }
      } else {
        // subject not present in linked exam -> admin can choose full 100 (or any value)
        const defMax = s.max || 100;
        return `<div style="display:inline-block;vertical-align:top;margin-right:8px;margin-bottom:10px;width:220px">
          <label style="display:block">
            <input type="checkbox" class="exam-sub" data-name="${escape(s.name)}" data-default-max="${escape(String(defMax))}" checked />
            ${escape(s.name)}
          </label>
          <div style="margin-top:4px">
            <input class="exam-sub-max" data-name="${escape(s.name)}" value="${escape(String(defMax))}" style="width:66px;margin-left:6px;padding:2px" />
            <small style="margin-left:6px;color:#6b7280">max</small>
          </div>
        </div>`;
      }
    }).join('');
    modalBody.querySelector('#examSubjects').innerHTML = htmlParts;
  }

  // hook link change
  modalBody.querySelector('#linkFromExam').onchange = async (ev) => {
    await applyLinking(ev.target.value);
  };

  document.getElementById('toggleChkSubjects').onclick = ()=> {
    const inputs = modalBody.querySelectorAll('#examSubjects input.exam-sub');
    const allChecked = Array.from(inputs).every(i=>i.checked || i.disabled);
    inputs.forEach(i=> { if(!i.disabled) i.checked = !allChecked; });
    document.getElementById('toggleChkSubjects').textContent = allChecked ? 'Check All Subjects' : 'Uncheck All Subjects';
  };

  document.getElementById('toggleChkClasses').onclick = ()=> {
    const inputs = modalBody.querySelectorAll('#examClasses input.exam-cls');
    const allChecked = Array.from(inputs).every(i=>i.checked);
    inputs.forEach(i=> i.checked = !allChecked);
    document.getElementById('toggleChkClasses').textContent = allChecked ? 'Check All Classes' : 'Uncheck All Classes';
  };

  document.getElementById('setMaxAll').onclick = ()=> {
    const v = prompt('Set max for all checked subjects (number)', '100');
    if(v==null) return;
    const n = Number(v) || 100;
    modalBody.querySelectorAll('#examSubjects input.exam-sub:checked').forEach(i=>{
      const name = i.dataset.name;
      const maxInput = modalBody.querySelector(`#examSubjects input.exam-sub-max[data-name="${name}"]`);
      if(maxInput) maxInput.value = String(n);
    });
  };
  // Save handler with loading:
  modalBody.querySelector('#saveExam').onclick = async function(ev){
    const btn = ev && ev.currentTarget ? ev.currentTarget : this;
    setButtonLoading(btn, true, 'Saving...');
    try{
      const name = document.getElementById('examName').value.trim();
      const date = document.getElementById('examDate').value || null;
      const linkedFrom = modalBody.querySelector('#linkFromExam').value || null;
      if(!name){ toast('Name required' , 'info'); setButtonLoading(btn, false); return; }

      const chosenSubjects = Array.from(modalBody.querySelectorAll('#examSubjects input.exam-sub:checked')).map(i=>{
        const nm = i.dataset.name;
        const maxInput = modalBody.querySelector(`#examSubjects input.exam-sub-max[data-name="${nm}"]`);
        const maxVal = maxInput ? Number(maxInput.value || i.dataset.defaultMax) : Number(i.dataset.defaultMax);
        return { name: nm, max: Math.max(0, maxVal) };
      });

      // validation vs linked (if present)
      if(linkedFrom){
        const linkedSnap = await getDoc(doc(db,'exams', linkedFrom));
        if(linkedSnap.exists()){
          const linked = linkedSnap.data();
          const linkedMap = new Map((linked.subjects||[]).map(s=>[s.name, s.max||0]));
          for(const cs of chosenSubjects){
            const linkedMax = linkedMap.get(cs.name) || 0;
            if((linkedMax + cs.max) > 100){
              toast(`Subject ${cs.name} combined max (${linkedMax + cs.max}) exceeds 100.` , 'success');
              setButtonLoading(btn, false);
              return;
            }
          }
        }
      }

      const chosenClasses = Array.from(modalBody.querySelectorAll('#examClasses input.exam-cls:checked')).map(i=> i.dataset.name );
      const payloadComponents = {
        assignment: Boolean(document.getElementById('enableAssignment').checked),
        quiz: Boolean(document.getElementById('enableQuiz').checked),
        monthly: Boolean(document.getElementById('enableMonthly').checked),
        cw1: Boolean(document.getElementById('enableCW1').checked),
        cw2: Boolean(document.getElementById('enableCW2').checked),
        exam: true
      };

      const payload = {
        name,
        date: date ? new Date(date) : null,
        status: 'draft',
        classes: chosenClasses,
        subjects: chosenSubjects,
        components: payloadComponents,
        createdAt: Timestamp.now(),
        createdBy: currentUser && currentUser.uid ? currentUser.uid : null
      };
      if(linkedFrom) payload.linkedExamId = linkedFrom;

      await addDoc(collection(db,'exams'), payload);
      toast('Exam created', 'success');
      closeModal();
      await loadExams();
      renderExams();
      populateStudentsExamDropdown && populateStudentsExamDropdown();
      showPage('exams');
    }catch(err){
      console.error('create exam failed', err);
      toast('Failed to create exam', 'error', 3000);
    }
    setButtonLoading(btn, false);
  };

  modalBody.querySelector('#cancelExam').onclick = closeModal;
});


/* ---------- Replace openEditExamModal ---------- */
function openEditExamModal(e){
  const btn = e.currentTarget || e.target.closest('[data-id]');
  const id = btn?.dataset?.id;
  if(!id) return toast('Exam not found' , 'info');
  const ex = examsCache.find(x=>x.id===id);

  // compute exam subject name set (original exam selection)
  const exSubjectMap = new Map((ex.subjects || []).map(s => [s.name, s.max || 0]));

  // build exam link options and make current linked selected
  const examLinkOptions = `<option value="">— None —</option>` + examsCache.map(ev=>{
    if(ev.id === ex.id) return '';
    return `<option value="${ev.id}" ${ex.linkedExamId===ev.id ? 'selected' : ''}>${escape(ev.name)} ${ev.status==='published'?'(published)':''}</option>`;
  }).join('');

  // compute initial allowed subjects based on classes selected on this exam
  function computeAllowedFromClasses(classNames){
    const allowed = new Set();
    if(Array.isArray(classNames) && classNames.length){
      for(const clsName of classNames){
        const clsDoc = classesCache.find(c => c.name === clsName);
        if(clsDoc && Array.isArray(clsDoc.subjects)){
          for(const subName of clsDoc.subjects) allowed.add(subName);
        }
      }
    }
    return allowed;
  }
  const initialAllowed = computeAllowedFromClasses(ex.classes || []);

  // subject HTML (note: show max from exam subject definition if present)
  const subjHtml = subjectsCache.map(s=>{
    const curMax = exSubjectMap.get(s.name) ?? s.max ?? 100;
    const allowed = initialAllowed.size ? initialAllowed.has(s.name) : true;
    const checked = ex.subjects?.find(ss=>ss.name===s.name) ? 'checked' : '';
    const disabled = allowed ? '' : 'disabled';
    const hint = allowed ? '' : `<div style="font-size:0.78rem;color:#6b7280;margin-top:4px">Not part of currently selected classes — cannot enable until class includes it</div>`;
    return `<div style="display:inline-block;vertical-align:top;margin-right:8px;margin-bottom:10px;width:220px">
      <label style="display:block">
        <input type="checkbox" class="exam-sub" data-name="${escape(s.name)}" data-default-max="${escape(String(s.max||100))}" ${checked} ${disabled} />
        ${escape(s.name)}
      </label>
      <div style="margin-top:4px">
        <input class="exam-sub-max" data-name="${escape(s.name)}" value="${escape(String(curMax))}" style="width:66px;margin-left:6px;padding:2px" ${disabled}/>
        <small style="margin-left:6px;color:#6b7280">max</small>
      </div>
      ${hint}
    </div>`;
  }).join('');

  const classHtml = classesCache.map(c=>{
    const checked = ex.classes && ex.classes.includes(c.name) ? 'checked' : '';
    return `<label style="display:inline-block;margin-right:10px;margin-bottom:6px"><input type="checkbox" class="exam-cls" data-name="${escape(c.name)}" ${checked} /> ${escape(c.name)}</label>`;
  }).join('');

  showModal('Edit Exam', `
    <label>Exam name</label><input id="examName" value="${escape(ex.name)}" />
    <label>Date</label><input id="examDate" type="date" value="${ex.date? (new Date(ex.date.seconds?ex.date.seconds*1000:ex.date)).toISOString().slice(0,10):''}" />
    <div style="margin-top:8px">
      <label>Link from existing exam (optional)</label>
      <select id="linkFromExam">${examLinkOptions}</select>
      <div style="font-size:0.9rem;color:#6b7280;margin-top:6px">Linking will use remainder per-subject (100 - linked.max).</div>
    </div>

    <div style="margin-top:8px"><button id="toggleChkSubjects" class="btn btn-ghost btn-sm">Toggle Subjects</button> <button id="setMaxAll" class="btn btn-ghost btn-sm">Set max for checked</button></div>
    <label style="margin-top:8px">Subjects</label><div id="examSubjects" style="margin-top:6px">${subjHtml || '<div class="muted">No subjects</div>'}</div>

    <div style="margin-top:8px"><button id="toggleChkClasses" class="btn btn-ghost btn-sm">Toggle Classes</button></div>
    <label style="margin-top:8px">Classes</label><div id="examClasses" style="margin-top:6px">${classHtml || '<div class="muted">No classes</div>'}</div>

  <div style="margin-top:8px">
  <label><input type="checkbox" id="enableAssignment" ${ex.components?.assignment?'checked':''} /> Enable Assignment</label>
  <label><input type="checkbox" id="enableQuiz" ${ex.components?.quiz?'checked':''} /> Enable Quiz</label>
  <label><input type="checkbox" id="enableMonthly" ${ex.components?.monthly?'checked':''} /> Enable Monthly</label>
  <label><input type="checkbox" id="enableCW1" ${ex.components?.cw1?'checked':''} /> Enable CW1</label>
  <label><input type="checkbox" id="enableCW2" ${ex.components?.cw2?'checked':''} /> Enable CW2</label>
  <!-- exam locked -->
  <label><input type="checkbox" id="enableExam" checked disabled /> Enable Exam</label>
</div>


    <div style="margin-top:12px"><button id="saveExam" class="btn btn-primary">Save</button> <button id="cancelExam" class="btn btn-ghost">Cancel</button></div>
  `);

  // helper to recompute allowed subjects when classes changed
  function updateSubjectEnablesByClassSelection(){
    const checkedClasses = Array.from(modalBody.querySelectorAll('#examClasses input.exam-cls:checked')).map(i=>i.dataset.name);
    const newAllowed = computeAllowedFromClasses(checkedClasses);
    modalBody.querySelectorAll('#examSubjects input.exam-sub').forEach(inp=>{
      const nm = inp.dataset.name;
      const allowed = newAllowed.size ? newAllowed.has(nm) : true;
      inp.disabled = !allowed;
      const maxInput = modalBody.querySelector(`#examSubjects input.exam-sub-max[data-name="${nm}"]`);
      if(maxInput) maxInput.disabled = !allowed;
      if(!allowed) inp.checked = false;
      // update hint
      const parent = inp.closest('div');
      if(parent){
        let existingHint = parent.querySelector('.not-allowed-hint');
        if(!allowed){
          if(!existingHint){
            const hint = document.createElement('div');
            hint.className = 'not-allowed-hint';
            hint.style.fontSize = '0.78rem';
            hint.style.color = '#6b7280';
            hint.style.marginTop = '4px';
            hint.textContent = 'Not part of selected classes — cannot enable until class includes it';
            parent.appendChild(hint);
          }
        } else {
          if(existingHint) existingHint.remove();
        }
      }
    });
  }

  // when any class checkbox changes, refresh allowed subjects
  modalBody.querySelectorAll('#examClasses input.exam-cls').forEach(cb=> cb.onchange = updateSubjectEnablesByClassSelection);
  updateSubjectEnablesByClassSelection(); // initial state

  // when linkFromExam changes - similar behavior to create: recompute subject maxes based on selected linked exam
  modalBody.querySelector('#linkFromExam').onchange = async (ev) => {
    const linkedId = ev.target.value || null;
    if(!linkedId){
      // restore current exam's subject maxima from ex (the original)
      modalBody.querySelectorAll('#examSubjects input.exam-sub-max').forEach(inp => {
        const nm = inp.dataset.name;
        const cur = exSubjectMap.get(nm) ?? (subjectsCache.find(ss=>ss.name===nm)?.max || 100);
        inp.value = String(cur);
        inp.disabled = !computeAllowedFromClasses(ex.classes || []).size ? false : !computeAllowedFromClasses(ex.classes || []).has(nm);
      });
      return;
    }
    const linkedSnap = await getDoc(doc(db,'exams', linkedId));
    if(!linkedSnap.exists()) return alert('Linked exam not found');
    const linked = linkedSnap.data();
    const linkedMap = new Map((linked.subjects||[]).map(s=>[s.name, s.max||0]));

    // for each subject input: if subject exists in linked, set max = (100 - linkedMax) and disable if remainder <= 0
    modalBody.querySelectorAll('#examSubjects input.exam-sub-max').forEach(inp => {
      const nm = inp.dataset.name;
      const linkedMax = linkedMap.get(nm) || 0;
      const remainder = Math.max(0, 100 - linkedMax);
      inp.value = String(remainder);
      // disable if remainder <= 0
      const chk = modalBody.querySelector(`#examSubjects input.exam-sub[data-name="${nm}"]`);
      if(chk){
        chk.disabled = (remainder <= 0);
        if(remainder <= 0) chk.checked = false;
      }
    });
  };

  document.getElementById('toggleChkSubjects').onclick = ()=> {
    const inputs = modalBody.querySelectorAll('#examSubjects input.exam-sub');
    const enabledInputs = Array.from(inputs).filter(i=>!i.disabled);
    const allChecked = enabledInputs.length && enabledInputs.every(i=>i.checked);
    enabledInputs.forEach(i=> i.checked = !allChecked);
  };
  document.getElementById('toggleChkClasses').onclick = ()=> {
    const inputs = modalBody.querySelectorAll('#examClasses input.exam-cls');
    inputs.forEach(i=> i.checked = !i.checked);
    updateSubjectEnablesByClassSelection();
  };
  document.getElementById('setMaxAll').onclick = ()=> {
    const v = prompt('Set max for all checked subjects (number)', '100');
    if(v==null) return;
    const n = Number(v) || 100;
    modalBody.querySelectorAll('#examSubjects input.exam-sub:checked').forEach(i=>{
      const name = i.dataset.name;
      const maxInput = modalBody.querySelector(`#examSubjects input.exam-sub-max[data-name="${name}"]`);
      if(maxInput) maxInput.value = String(n);
    });
  };

  // after building modal HTML exactly as your earlier code did, wire save:
  modalBody.querySelector('#saveExam').onclick = async function(ev){
    const btn = ev && ev.currentTarget ? ev.currentTarget : this;
    setButtonLoading(btn, true, 'Saving...');
    try{
      const name = document.getElementById('examName').value.trim();
      const date = document.getElementById('examDate').value || null;
      if(!name){ toast('Name required','info'); setButtonLoading(btn, false); return; }

      const chosenSubjects = Array.from(modalBody.querySelectorAll('#examSubjects input.exam-sub:checked')).map(i=>{
        const nm = i.dataset.name;
        const maxInput = modalBody.querySelector(`#examSubjects input.exam-sub-max[data-name="${nm}"]`);
        const maxVal = maxInput ? Number(maxInput.value || i.dataset.defaultMax) : Number(i.dataset.defaultMax);
        return { name: nm, max: Math.max(0, maxVal) };
      });

      const chosenClasses = Array.from(modalBody.querySelectorAll('#examClasses input.exam-cls:checked')).map(i=> i.dataset.name );
      const payloadComponents = {
        assignment: Boolean(document.getElementById('enableAssignment').checked),
        quiz: Boolean(document.getElementById('enableQuiz').checked),
        monthly: Boolean(document.getElementById('enableMonthly').checked),
        cw1: Boolean(document.getElementById('enableCW1').checked),
        cw2: Boolean(document.getElementById('enableCW2').checked),
        exam: true
      };

      await updateDoc(doc(db,'exams',ex.id), {
        name,
        date: date ? new Date(date) : null,
        subjects: chosenSubjects,
        classes: chosenClasses,
        components: payloadComponents,
        linkedExamId: modalBody.querySelector('#linkFromExam').value || null,
        updatedAt: Timestamp.now(),
        updatedBy: currentUser && currentUser.uid ? currentUser.uid : null
      });

      toast('Exam updated' , 'success');
      closeModal();
      await loadExams();
      renderExams();
      populateStudentsExamDropdown && populateStudentsExamDropdown();
      showPage('exams');
    }catch(err){
      console.error('update exam failed', err);
      toast('Failed to update exam' , 'error', 3000);
    }
    setButtonLoading(btn, false);
  };

  modalBody.querySelector('#cancelExam').onclick = closeModal;
}

/* ---------- deleteExam (uses modalConfirm) ---------- */


async function deleteExam(e){

  // 1️⃣ get button & id FIRST
  const btn = e.currentTarget || e.target.closest('[data-id]');
  const id = btn?.dataset?.id;
  if(!id){
    toast('Exam not found');
    return;
  }

  // 2️⃣ now it is SAFE to find exam
  const ex = examsCache.find(x => x.id === id);

  // 3️⃣ block deleting published exams
  if(ex?.status === 'published'){
    toast('Unpublish exam before deleting');
    return;
  }

  const examName = ex ? ex.name : 'this exam';

  const ok = await modalConfirm(
    'Move Exam to Recycle Bin',
    `Are you sure you want to move <strong>${escape(examName)}</strong> into the Recycle Bin?`
  );
  if(!ok) return;

  if(btn) setButtonLoading(btn, true, 'Deleting...');

  try {
    const who =
      (currentUser && currentUser.uid) ||
      (auth && auth.currentUser && auth.currentUser.uid) ||
      null;

    await updateDoc(doc(db,'exams', id), {
      deleted: true,
      deletedAt: Timestamp.now(),
      deletedBy: who,
      deleted_at: Timestamp.now(),
      deleted_by: who
    });

    toast('Exam moved to Recycle Bin' , 'info');
    await loadExams();
    renderExams();
    populateStudentsExamDropdown && populateStudentsExamDropdown();
    showPage('exams');

  } catch(err){
    console.error('delete exam failed', err);
    toast('Failed to delete exam' , 'error', 3000);
  }

  if(btn) setButtonLoading(btn, false);
}





/* Toggle publish/unpublish - uses helper fallback to update studentsLatest */
async function togglePublishExam(e){
  // accepts either event or { target: { dataset: { id } } } or id string
  let id, btn;
  if(typeof e === 'string') id = e;
  else if(e && e.target && e.target.dataset) { id = e.target.dataset.id; btn = e.currentTarget || e.target; }
  else if(e && e.currentTarget && e.currentTarget.dataset) { id = e.currentTarget.dataset.id; btn = e.currentTarget; }

  if(!id) return toast && toast('No exam id');

  try{
    if(btn) setButtonLoading(btn, true, 'Updating...');
    // find exam in cache
    const ex = examsCache.find(x => x.id === id) || (await (async ()=>{
      const snap = await getDoc(doc(db,'exams',id));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    })());
    if(!ex) throw new Error('Exam not found');

    const newStatus = (ex.status === 'published') ? 'draft' : 'published';
    const updatePayload = { status: newStatus };
    if(newStatus === 'published') updatePayload.publishedAt = Timestamp.now();
    await updateDoc(doc(db,'exams', id), updatePayload);
    await loadExams();
    renderExams();
    showPage('exams');
    toast(newStatus === 'published' ? 'Exam published' : 'Exam unpublished');
  }catch(err){
    console.error('togglePublishExam failed', err);
    toast('Publish/unpublish failed' , 'error', 3000);
  } finally {
    if(btn) setButtonLoading(btn, false);
  }
}

/* ---------- Replace publishExam ---------- */
async function publishExam(examId){
  // reload students and classes to be safe
  await loadStudents();
  await loadClasses();

  const exSnap = await getDoc(doc(db,'exams',examId));
  if(!exSnap.exists()) return;
  const exam = { id: exSnap.id, ...exSnap.data() };

  // gather submitted results (drafts) from subcollection exams/{examId}/results
  const resultsSnap = await getDocs(collection(db,'exams',examId,'results'));
  const studentResults = {};
  resultsSnap.forEach(d => studentResults[d.id] = d.data().marks || {});

  // if linked exam exists and is published, we'll use examTotals snapshot for quick lookup
  let linkedTotalsCache = {}; // studentId -> { subjectName -> mark, subjectMax -> linkedMax }
  let linkedSubjectsMeta = {}; // subjectName -> linkedMax
  if(exam.linkedExamId){
    // fetch linked exam doc and its subjects meta
    const linkedSnap = await getDoc(doc(db,'exams', exam.linkedExamId));
    if(linkedSnap.exists()){
      const linkedExam = linkedSnap.data();
      (linkedExam.subjects || []).forEach(s => linkedSubjectsMeta[s.name] = s.max || 0);
    }
    // prefetch all examTotals for linkedExamId to speed up
    const q = query(collection(db,'examTotals'), where('examId','==', exam.linkedExamId));
    const snap = await getDocs(q);
    snap.forEach(d => {
      const data = d.data();
      const sid = data.studentId;
      if(!linkedTotalsCache[sid]) linkedTotalsCache[sid] = {};
      (data.subjects || []).forEach(s => {
        linkedTotalsCache[sid][s.name] = Number(s.mark || s.total || 0);
      });
    });
  }

  const allowedClasses = exam.classes && exam.classes.length ? exam.classes : null;
  const totals = [];

  for(const s of studentsCache){
    if(s.status === 'deleted') continue;
    if(allowedClasses && !allowedClasses.includes(s.classId)) continue;

    const classDoc = classesCache.find(c => c.name === s.classId) || null;
    const classAssigned = (classDoc && Array.isArray(classDoc.subjects)) ? new Set(classDoc.subjects) : null;

    // compute student-specific subject defs: intersection of exam.subjects and classAssigned
    let studentSubjectDefs = [];
    if(classAssigned){
      studentSubjectDefs = (exam.subjects || []).filter(sd => classAssigned.has(sd.name));
    } else {
      studentSubjectDefs = [];
    }

    const marks = studentResults[s.studentId] || {};
    let total = 0; let count = 0;
    const subs = [];

    for (const sub of studentSubjectDefs) {
      // current exam part (coerce to numeric defaults)
      const savedVal = marks[sub.name];
      let assignment = 0, quiz = 0, monthly = 0, cw1 = 0, cw2 = 0, paper = 0;
    
      if (typeof savedVal === 'number') {
        paper = Number(savedVal || 0);
      } else if (savedVal && typeof savedVal === 'object') {
        assignment = Number(savedVal.assignment || 0);
        quiz       = Number(savedVal.quiz || 0);
        monthly    = Number(savedVal.monthly || 0);
        cw1        = Number(savedVal.cw1 || 0);
        cw2        = Number(savedVal.cw2 || 0);
        paper      = Number(savedVal.exam || 0);
      } else {
        // ensure zeros for configured components (keeps consistent shape)
        if (exam.components?.assignment) assignment = 0;
        if (exam.components?.quiz)       quiz = 0;
        if (exam.components?.monthly)    monthly = 0;
        if (exam.components?.cw1)        cw1 = 0;
        if (exam.components?.cw2)        cw2 = 0;
        if (exam.components?.exam)       paper = 0;
      }
    
      // compute totals and clamp to subject max
      const curMax = Number(sub.max || 100);
      let curSubTotal = assignment + quiz + monthly + cw1 + cw2 + paper;
      if (curSubTotal > curMax) curSubTotal = curMax;
    
      // linked exam part (if any)
      let linkedPart = 0;
      let linkedMax = 0;
      if (exam.linkedExamId) {
        linkedMax = Number(linkedSubjectsMeta[sub.name] || 0);
        const linkedPerStudent = linkedTotalsCache[s.studentId] || {};
        linkedPart = Number(linkedPerStudent[sub.name] || 0);
      }
    
      // combined total for this subject (bounded)
      const combinedTotal = Math.min(curSubTotal + linkedPart, (linkedMax + curMax) || 100);
    
      // build components object with safe numeric values (no undefined)
      const compObj = {
        assignment: Number(assignment || 0),
        quiz:       Number(quiz || 0),
        monthly:    Number(monthly || 0),
        cw1:        Number(cw1 || 0),
        cw2:        Number(cw2 || 0),
        exam:       Number(paper || 0)
      };
      if (linkedPart > 0) {
        compObj.linked = { total: Number(linkedPart), max: Number(linkedMax) };
      }
    
      subs.push({
        name: sub.name,
        mark: Number(Math.round(combinedTotal)),
        max: Number((linkedMax + curMax) || 100),
        components: compObj
      });
    
      total += combinedTotal;
      count++;
    }
    
    const average = count ? (total / count) : 0;
    totals.push({ studentId: s.studentId, studentName: s.fullName, classId: s.classId, total, average, subjects: subs, motherName: s.motherName || '' });
  }

  // compute ranks (same as before)
  totals.sort((a,b)=> b.total - a.total);
  totals.forEach((t,i)=> t.schoolRank = i+1);
  const byClass = {};
  totals.forEach(t=>{ if(!byClass[t.classId]) byClass[t.classId]=[]; byClass[t.classId].push(t); });
  Object.keys(byClass).forEach(cls=>{
    byClass[cls].sort((a,b)=> b.total - a.total);
    byClass[cls].forEach((t,i)=> t.classRank = i+1);
  });

  // write examTotals and studentsLatest
  const writes = [];
  for (const t of totals) {
    const examTotalsId = `${examId}_${t.studentId}`;
  
    // ensure components is a plain object with booleans (no undefined)
    const safeComponents = Object.assign(
      { assignment:false, quiz:false, monthly:false, cw1:false, cw2:false, exam:false },
      (exam.components || {})
    );
  
    // ensure subjects array exists and subject entries have safe numeric values
    const safeSubjects = (t.subjects || []).map(s => {
      const comps = s.components || {};
      const safeComps = {
        assignment: Number(comps.assignment || 0),
        quiz:       Number(comps.quiz || 0),
        monthly:    Number(comps.monthly || 0),
        cw1:        Number(comps.cw1 || 0),
        cw2:        Number(comps.cw2 || 0),
        exam:       Number(comps.exam || 0)
      };
      if (comps.linked && typeof comps.linked.total !== 'undefined') {
        safeComps.linked = { total: Number(comps.linked.total || 0), max: Number(comps.linked.max || 0) };
      }
      return {
        name: s.name || '',
        mark: Number(s.mark || 0),
        max:  Number(s.max || 0),
        components: safeComps
      };
    });
  
    const payload = {
      examId,
      examName: String(exam.name || ''),
      components: safeComponents,
      studentId: String(t.studentId || ''),
      studentName: String(t.studentName || ''),
      motherName: String(t.motherName || ''),
      classId: String(t.classId || ''),
      className: String(t.classId || ''),
      subjects: safeSubjects,
      total: Number(t.total || 0),
      average: Number(t.average || 0),
      classRank: Number(t.classRank || 0),
      schoolRank: Number(t.schoolRank || 0),
      publishedAt: Timestamp.now()
    };
  
    writes.push(setDoc(doc(db,'examTotals', examTotalsId), payload));
    writes.push(setDoc(doc(db,'studentsLatest', t.studentId), payload));
  }
  
  writes.push(updateDoc(doc(db,'exams',examId), { status:'published', publishedAt: Timestamp.now() }));
  await Promise.all(writes);
}


/* When unpublishing, fallback studentsLatest */
async function fallbackStudentsLatestForUnpublishedExam(examId){
  for(const s of studentsCache){
    try {
      const latestSnap = await getDoc(doc(db,'studentsLatest',s.studentId));
      if(!latestSnap.exists()) continue;
      const latest = latestSnap.data();
      if(latest.examId !== examId) continue;
      const snap = await getDocs(query(collection(db,'examTotals'), where('studentId','==', s.studentId)));
      const arr = [];
      snap.forEach(d => {
        const data = d.data();
        if(data.examId !== examId) arr.push(data);
      });
      if(arr.length === 0){
        await setDoc(doc(db,'studentsLatest', s.studentId), { examId: null, blocked: latest.blocked || false }, { merge:true });
      } else {
        arr.sort((a,b)=> {
          const ta = a.publishedAt && a.publishedAt.seconds ? a.publishedAt.seconds : 0;
          const tb = b.publishedAt && b.publishedAt.seconds ? b.publishedAt.seconds : 0;
          return tb - ta;
        });
        await setDoc(doc(db,'studentsLatest', s.studentId), arr[0], { merge:true });
      }
    } catch(err){
      console.error('fallback err', err);
    }
  }
}


/* ---------- Replace openStudentResultModalFor ---------- */
async function openStudentResultModalFor(student){
  // find student's class doc (strict: do NOT fallback to all subjects)
  const classDoc = classesCache.find(c=>c.name === student.classId);
  let classSubjects = [];
  if(classDoc && Array.isArray(classDoc.subjects) && classDoc.subjects.length){
    classSubjects = classDoc.subjects.map(name => {
      const subj = subjectsCache.find(ss=>ss.name===name);
      return subj ? { name: subj.name, max: subj.max || 100 } : { name, max:100 };
    });
  } else {
    classSubjects = []; // no assigned subjects -> we will show message
  }

  const examOptions = examsCache.map(e=>`<option value="${e.id}">${escape(e.name)} ${e.status==='published'?'(published)':''}</option>`).join('');
  const momLine = student.motherName ? ` — Ina Hooyo: ${escape(student.motherName)}` : '';
  const classLine = student.classId ? ` — Class: ${escape(student.classId)}` : '';
  const idLine = student.studentId ? ` — (${escape(student.studentId)})` : '';

  showModal(`Add/Edit Result — ${escape(student.fullName)}${idLine}${momLine}${classLine}`, `
    <label>Select Exam</label><select id="resExamSelect"><option value="">Select exam</option>${examOptions}</select>
    <div id="resFormArea" style="margin-top:12px"></div>
    <div style="margin-top:12px"><button id="saveRes" class="btn btn-primary">Save</button> <button id="cancelRes" class="btn btn-ghost">Cancel</button></div>
  `);
  const resExamSelect = document.getElementById('resExamSelect');

  // helper to fetch linked exam totals for this student (if published) or linked results draft
  async function fetchLinkedMarksForStudent(linkedExamId){
    if(!linkedExamId) return {};
    // prefer published examTotals snapshot (if exists)
    const snap = await getDoc(doc(db,'examTotals', `${linkedExamId}_${student.studentId}`));
    if(snap.exists()){
      const data = snap.data();
      // construct map name -> mark (total for subject)
      const map = {};
      (data.subjects || []).forEach(s => {
        map[s.name] = { mark: s.mark != null ? s.mark : s.total || 0, components: s.components || {} };
      });
      return { examMeta: data, marksMap: map };
    } else {
      // fallback to draft results saved under exams/{linkedExamId}/results/{studentId}
      const r = await getDoc(doc(db,'exams', linkedExamId, 'results', student.studentId));
      if(r.exists()){
        const marks = r.data().marks || {};
        // marks may be object or number per subject. Normalize to mark number if number, or sum components if object
        const marksMap = {};
        for(const key of Object.keys(marks)){
          const v = marks[key];
          if(typeof v === 'number') marksMap[key] = { mark: Number(v), components: {} };
          else if(typeof v === 'object' && v !== null){
            const total = (Number(v.assignment||0) + Number(v.quiz||0) + Number(v.monthly||0) + Number(v.exam||0));
            marksMap[key] = { mark: total, components: v };
          }
        }
        return { examMeta: null, marksMap };
      }
    }
    return {};
  }

  async function renderForExamId(examId){
    const area = document.getElementById('resFormArea');
    if(!examId){
      area.innerHTML = `<div class="muted">Select an exam to load fields.</div>`;
      return;
    }
    const exSnap = await getDoc(doc(db,'exams', examId));
    const ex = exSnap.exists() ? { id: exSnap.id, ...exSnap.data() } : null;
    if(!ex) { area.innerHTML = `<div class="muted">Exam not found.</div>`; return; }

    const examSubNames = (ex.subjects || []).map(s=>s.name);
    // strict intersection
    const enabledSubjects = classSubjects.filter(cs => examSubNames.includes(cs.name));
    const missingSubjects = classSubjects.filter(cs => !examSubNames.includes(cs.name));
    const comps = ex.components || { assignment:false, quiz:false, monthly:false, exam:true };

    // if class has no subjects
    if(!classSubjects.length){
      area.innerHTML = `<div style="color:#b91c1c">This student's class has no subjects assigned. Please assign subjects to the class first.</div>`;
      return;
    }

    // If nothing in intersection -> show message + quick edit exam button
    if(enabledSubjects.length === 0){
      const missingList = missingSubjects.length ? `<div style="margin-top:8px">Class subjects not included in this exam: <strong>${missingSubjects.map(ms=>escape(ms.name)).join(', ')}</strong></div>` : '';
      area.innerHTML = `<div style="color:#b91c1c">No common subjects between this student's class and the selected exam. ${missingList} <div style="margin-top:8px"><button id="openEditExamQuick" class="btn btn-ghost btn-sm">Edit exam & check subjects</button></div></div>`;
      const btn = document.getElementById('openEditExamQuick');
      if(btn) btn.onclick = ()=> openEditExamModal({ target: { dataset: { id: ex.id } } });
      return;
    }

    // if this exam links to another exam, fetch linked marks for this student
    let linkedData = null;
    let linkedMarksMap = {};
    if(ex.linkedExamId){
      linkedData = await fetchLinkedMarksForStudent(ex.linkedExamId);
      linkedMarksMap = linkedData.marksMap || {};
    }

    // build HTML: for each enabledSubject show two columns if linked: linked read-only + current inputs
    const html = enabledSubjects.map(s=>{
      let parts = '';
      if(ex.linkedExamId){
        // show linked mark read-only (if available)
        const l = linkedMarksMap[s.name];
        const lmark = l ? Number(l.mark || 0) : 0;
        parts += `<div style="margin-bottom:4px;font-size:0.9rem;color:#374151">Linked (prev): <strong>${lmark}</strong></div>`;
      }
      // show components for current exam
      if(comps.assignment) parts += `<label>Assignment (max ${s.max})</label><input id="res_${escape(s.name)}_assignment" type="number" min="0" />`;
      if(comps.quiz)       parts += `<label>Quiz (max ${s.max})</label><input id="res_${escape(s.name)}_quiz" type="number" min="0" />`;
      if(comps.monthly)    parts += `<label>Monthly (max ${s.max})</label><input id="res_${escape(s.name)}_monthly" type="number" min="0" />`;
      if(comps.cw1)        parts += `<label>CW1 (max ${s.max})</label><input id="res_${escape(s.name)}_cw1" type="number" min="0" />`;
      if(comps.cw2)        parts += `<label>CW2 (max ${s.max})</label><input id="res_${escape(s.name)}_cw2" type="number" min="0" />`;
      if(comps.exam)       parts += `<label>Exam (max ${s.max})</label><input id="res_${escape(s.name)}_exam" type="number" min="0" />`;
      

      // show note about combined max if linked
      const combinedNote = ex.linkedExamId ? `<div style="font-size:0.85rem;color:#6b7280;margin-top:6px">Combined max for this subject = ${ (linkedMarksMap[s.name] && linkedMarksMap[s.name].components && typeof linkedMarksMap[s.name].components._max !== 'undefined') ? (Number(linkedMarksMap[s.name].components._max) + s.max) : '≤100' } (ensure combined ≤ 100)</div>` : '';

      return `<div style="margin-bottom:12px;padding:8px;border-bottom:1px solid #eee"><strong>${escape(s.name)}</strong>${parts}${combinedNote}</div>`;
    }).join('');

    // note about missing class subjects
    const notCheckedNote = missingSubjects.length ? `<div style="margin-top:8px;font-size:0.9rem;color:#6b7280">Note: other class subjects (${missingSubjects.map(ms=>escape(ms.name)).join(', ')}) are not enabled in this exam. Edit the exam to enable them.</div>` : '';

    area.innerHTML = html + notCheckedNote;

    // populate existing saved marks (current exam) and show linked marks (read-only already appended)
    const r = await getDoc(doc(db,'exams',ex.id,'results', student.studentId));
    const curMarks = r.exists() ? (r.data().marks || {}) : {};
    for(const s of showSubjects){
      const compObj = {};
      let isObject = false;
      let curSum = 0;
      for(const comp of ['assignment','quiz','monthly','cw1','cw2','exam']){
        if(ex.components?.[comp]){
          const el = document.getElementById('res_'+s.name+'_'+comp);
          const val = el && el.value ? Number(el.value) : 0;
          if(val > s.max){ alert(`${s.name} maximum for this exam is ${s.max}`); return; }
          compObj[comp] = val;
          curSum += val;
          isObject = true;
        }
      }
      if(isObject) marks[s.name] = compObj;
      else {
        const el = document.getElementById('res_'+s.name+'_exam') || document.getElementById('res_'+s.name+'_assignment');
        const val = el && el.value ? Number(el.value) : 0;
        marks[s.name] = Math.min(Number(val), s.max);
        curSum = Number(marks[s.name]);
      }
    
      // validate combined with linked
      const linkedVal = linkedMarksMap[s.name] ? Number(linkedMarksMap[s.name]) : 0;
      if((linkedVal + curSum) > 100){
        return alert(`Combined total for ${s.name} exceeds 100 (linked ${linkedVal} + current ${curSum}). Adjust values.`);
      }
    }
    

  }

  // onchange
  resExamSelect.onchange = async ()=> { await renderForExamId(resExamSelect.value); };

  // default selection logic (same as before)
  let defaultExamId = '';
  const examsForClass = examsCache.filter(e => !e.classes || e.classes.length === 0 || e.classes.includes(student.classId));
  if(examsForClass.length){
    examsForClass.sort((a,b)=>{
      const ta = (a.publishedAt?.seconds || a.createdAt?.seconds || 0);
      const tb = (b.publishedAt?.seconds || b.createdAt?.seconds || 0);
      return tb - ta;
    });
    const publishedForClass = examsForClass.find(x=>x.status === 'published');
    defaultExamId = (publishedForClass && publishedForClass.id) || examsForClass[0].id;
  } else if(examsCache.length){
    const sorted = examsCache.slice().sort((a,b)=> (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
    defaultExamId = sorted[0].id;
  }
  if(defaultExamId){
    resExamSelect.value = defaultExamId;
    resExamSelect.dispatchEvent(new Event('change'));
  }

  // Save handler - validates combined totals (linked + current) per subject <= 100
  document.getElementById('saveRes').onclick = async ()=>{
    const examId = document.getElementById('resExamSelect').value;
    if(!examId) return alert('Select exam');
    const exSnap = await getDoc(doc(db,'exams',examId));
    const ex = exSnap.exists() ? { id: exSnap.id, ...exSnap.data() } : null;
    if(!ex) return alert('Exam missing');

    // build showSubjects = strict intersection
    const examSubNames = (ex.subjects || []).map(s=>s.name);
    const showSubjects = classSubjects.filter(cs => examSubNames.includes(cs.name));
    // fetch linked marks map to validate combined totals
    let linkedMarksMap = {};
    if(ex.linkedExamId){
      const linkedSnap = await getDoc(doc(db,'examTotals', `${ex.linkedExamId}_${student.studentId}`));
      if(linkedSnap.exists()){
        const ld = linkedSnap.data();
        (ld.subjects || []).forEach(s => {
          linkedMarksMap[s.name] = Number(s.mark || s.total || 0);
        });
      } else {
        // fallback to draft results
        const rld = await getDoc(doc(db,'exams', ex.linkedExamId, 'results', student.studentId));
        if(rld.exists()){
          const mm = rld.data().marks || {};
          for(const k of Object.keys(mm)){
            const v = mm[k];
            if(typeof v === 'number') linkedMarksMap[k] = Number(v);
            else if(typeof v === 'object' && v !== null) linkedMarksMap[k] = (Number(v.assignment||0) + Number(v.quiz||0) + Number(v.monthly||0) + Number(v.exam||0));
          }
        }
      }
    }

    const marks = {};
    for(const s of showSubjects){
      const compObj = {};
      let isObject = false;
      // compute current exam components sum
      let curSum = 0;
      for(const comp of ['assignment','quiz','monthly','exam']){
        if(ex.components?.[comp]){
          const el = document.getElementById('res_'+s.name+'_'+comp);
          if(el){
            let val = el.value ? Number(el.value) : 0;
            if(val > s.max){ val = s.max; el.value = String(val); alert(`${s.name} maximum for this exam is ${s.max}`); }
            compObj[comp] = val; isObject = true;
            curSum += val;
          }
        }
      }
      if(isObject) marks[s.name] = compObj;
      else {
        const el = document.getElementById('res_'+s.name+'_exam') || document.getElementById('res_'+s.name+'_assignment') || document.getElementById('res_'+s.name+'_quiz');
        const val = el && el.value ? Number(el.value) : 0;
        marks[s.name] = Math.min(Number(val), s.max);
        curSum = Number(marks[s.name]);
      }

      // combined validation vs linked
      const linkedVal = linkedMarksMap[s.name] ? Number(linkedMarksMap[s.name]) : 0;
      if((linkedVal + curSum) > 100){
        return alert(`Combined total for ${s.name} exceeds 100 (linked ${linkedVal} + current ${curSum}). Adjust values.`);
      }
    }

    // save draft / result for current exam
    await setDoc(doc(db,'exams',examId,'results', student.studentId), { studentId:student.studentId, marks, savedAt: Timestamp.now() });

    // if exam is published, recompute published snapshot (keeps public view up-to-date)
    try {
      if(ex.status === 'published'){
        await publishExam(ex.id);
        await loadExams(); renderExams(); populateStudentsExamDropdown();
      }
    } catch(err){
      console.error('Error while updating published snapshot after save:', err);
    }

    closeModal();
    toast(`${student.fullName} successfully recorded exam results`, 'success');
  };

  document.getElementById('cancelRes').onclick = closeModal;
}




/* Load examTotals for quick per-exam lookup used by student list */
async function loadExamTotalsForExam(examId){
  const q = query(collection(db,'examTotals'), where('examId','==', examId));
  const snap = await getDocs(q);
  examTotalsCache[examId] = {};
  snap.forEach(d=> {
    const data = d.data();
    examTotalsCache[examId][data.studentId] = data;
  });
  renderStudents();
}

/* helper: escape */
function escape(s){ if(s==null) return ''; return String(s).replace(/[&<>"']/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }

/* expose reload function */
window._reloadAdmin = async ()=>{ await loadAll(); console.log('reloaded'); };






/* ------------------------
  Payments / Transactions
  Paste into database.js (append)
-------------------------*/

/* safe local caches if not present */
if(typeof transactionsCache === 'undefined') var transactionsCache = [];


/* small helpers (pennies <-> display currency) */
function p2c(amount){ // parse to cents (supports strings or numbers)
  if(amount === null || amount === undefined || amount === '') return 0;
  return Math.round(Number(amount) * 100);
}
function c2p(cents){ // cents -> display string with 2 decimals
  return (Number(cents || 0) / 100).toFixed(2);
}

/* ---------------- helpers & loaders ---------------- */
function capitalize(str){
  if(!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}


/* ---------------- Robust PDF export + export helpers ---------------- */

function getJsPDFConstructor() {
  // prefer window.jspdf.jsPDF (umd), then window.jsPDF (global), return null if none
  try {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if (window.jsPDF) return window.jsPDF;
    if (window.jspdf && window.jspdf.default && window.jspdf.default.jsPDF) return window.jspdf.default.jsPDF;
  } catch(e){ /* ignore */ }
  return null;
}

/** Render element to PNG using html2canvas and add to a pdf (fallback) */
async function exportElementToPdfFallback(filename, el) {
  // detect html2canvas (it normally exposes global html2canvas)
  const h2c = (typeof html2canvas !== 'undefined') ? html2canvas : (window.html2canvas || null);
  if (!h2c) {
    alert('PDF export not available (no jsPDF and no html2canvas).');
    return false;
  }
  try {
    const canvas = await h2c(el, { scale: 2, useCORS: true, logging: false });
    const img = canvas.toDataURL('image/png');
    const JsPDF = getJsPDFConstructor();
    if (!JsPDF) {
      // try older shape
      if (window.jspdf && window.jspdf.jsPDF) {
        const doc = new window.jspdf.jsPDF({ unit:'pt', format:'a4', orientation: 'portrait' });
        const w = doc.internal.pageSize.getWidth();
        const h = (canvas.height * (w / canvas.width));
        doc.addImage(img, 'PNG', 20, 20, w - 40, h);
        doc.save(filename);
        return true;
      }
      alert('PDF export not available');
      return false;
    }
    const doc = new JsPDF({ unit:'pt', format:'a4', orientation: 'portrait' });
    const w = doc.internal.pageSize.getWidth();
    const h = (canvas.height * (w / canvas.width));
    doc.addImage(img, 'PNG', 20, 20, w - 40, h);
    doc.save(filename);
    return true;
  } catch (e) {
    console.error('exportElementToPdfFallback failed', e);
    return false;
  }
}




/* ---------- inline SVG helpers & loader utilities ---------- */

function svgPay(){ 
  return `<svg class="icon-sm" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="1.4"/>
    <path d="M8 10h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M8 14h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`; 
}
function svgReesto(){ 
  return `<svg class="icon-sm" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 5v14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M5 12h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`; 
}


/* ---------------- Resolve target robustly ---------------- */
async function resolveTargetByAnyId(view, id) {
  // view: 'students'|'teachers'|'staff'
  id = String(id || '').trim();
  if(!id) return null;

  // local caches first (try multiple id fields)
  const tryFind = (pool) => {
    if(!pool || !pool.length) return null;
    return pool.find(x => {
      const fields = [x.id, x.studentId, x.teacherId, x.staffId, x.uid, x.code, x.regId, x.idNumber, x.documentId];
      for(const f of fields){
        if(!f) continue;
        if(String(f) === id) return true;
        // try match last digits
        const s = String(f);
        if(s.endsWith(id) || s.slice(-4) === id || s.slice(-6) === id) return true;
      }
      return false;
    }) || null;
  };

  let pool = (view === 'students') ? (studentsCache||[]) : (view === 'teachers' ? (teachersCache||[]) : (window.staffCache||[]));
  let found = tryFind(pool);
  if(found) return found;

  // try alternate caches
  found = tryFind(studentsCache||[]) || tryFind(teachersCache||[]) || tryFind(window.staffCache||[]) || null;
  if(found) return found;

  // final resort: try Firestore get by id (document id)
  try {
    const col = (view==='students'?'students': (view==='teachers'?'teachers':'staff'));
    const snap = await getDoc(doc(db, col, id));
    if(snap.exists()) return { id: snap.id, ...snap.data() };
  } catch(e){ /* ignore */ }

  // not found
  return null;
}

/** Put a loader inside a button: returns old content so caller can restore. */
function putButtonLoader(btn, opts = { colorOnPrimary: true }) {
  if(!btn) return null;
  const old = btn.innerHTML;
  // choose colours carefully: loader dots are white-ish; if button is ghost we add gray border
  btn.disabled = true;
  btn.innerHTML = `<span class="btn-loader"><span></span><span></span><span></span></span><span style="margin-left:8px">Saving</span>`;
  return old;
}
function restoreButton(btn, oldHtml){
  try{ if(btn){ btn.innerHTML = oldHtml; btn.disabled = false; } }catch(e){}
}

// resolve actor display name (uses usersCache if present, otherwise fetches)
async function resolveActorName(uid){
  if(!uid) return '';
  if(typeof usersCache !== 'undefined'){
    const u = (usersCache||[]).find(x => x.id === uid || x.uid === uid);
    if(u) return u.displayName || u.email || uid;
  }
  try{
    const snap = await getDoc(doc(db,'users', uid));
    if(snap.exists()){
      const d = snap.data();
      return d.displayName || d.email || uid;
    }
  }catch(e){ /* ignore */ }
  return uid;
}

/** small: format month label like "Jan-2026" from "1-2026", "2026-01", "2026-01-05", etc. */
function formatMonthLabel(m) {
  if (!m && m !== 0) return '';
  const s = String(m).trim();
  const mm1 = s.match(/^(\d{1,2})-(\d{4})$/);
  if (mm1) {
    const mon = Number(mm1[1]), yr = mm1[2];
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return (mon>=1 && mon<=12) ? `${names[mon-1]}-${yr}` : s;
  }
  const mm2 = s.match(/^(\d{4})-(\d{1,2})/);
  if (mm2) {
    const yr = mm2[1], mon = Number(mm2[2]);
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return (mon>=1 && mon<=12) ? `${names[mon-1]}-${yr}` : s;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${names[d.getMonth()]}-${d.getFullYear()}`;
  }
  return s;
}

/** display-friendly type label (maps 'adjustment' -> 'Reesto Hore') */
function displayTypeLabel(type) {
  if (!type) return '';
  if (String(type).toLowerCase() === 'adjustment' || String(type).toLowerCase() === 'adjust') return 'Reesto Hore';
  return capitalize(String(type));
}

/** get school meta for exports */
async function getSchoolMeta() {
  // try to read a 'settings' doc that may contain school info, fallback to static
  try {
    const snap = await getDoc(doc(db, 'settings', 'school'));
    if (snap.exists()) {
      const d = snap.data();
      return { name: d.name || 'AL-FATXI PRIMARY AND SECONDARY SCHOOL', logo: d.logo || 'assets/logo.png' };
    }
  } catch(e){ /* ignore */ }
  return { name: 'AL-FATXI PRIMARY AND SECONDARY SCHOOL', logo: 'assets/logo.png' };
}

async function loadStaff(){
  try{
    const snap = await getDocs(collection(db,'staff'));
    window.staffCache = snap.docs.map(d => ({ id:d.id, ...d.data() }));
  }catch(err){
    console.error('loadStaff failed', err);
    window.staffCache = [];
  }
}





/* load transactions into local cache */
async function loadTransactions(){
  try{
    const snap = await getDocs(collection(db,'transactions'));
    transactionsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }catch(err){
    console.error('loadTransactions failed', err);
    transactionsCache = [];
  }
}

/* generic update of target balance (students/teachers/staff)
   deltaCents may be positive or negative; positive increases owed balance */
async function updateTargetBalanceGeneric(targetType, targetId, deltaCents){
  if(!targetType || !targetId) return;
  const col = targetType === 'student' ? 'students' : (targetType === 'teacher' ? 'teachers' : (targetType === 'staff' ? 'staff' : null));
  if(!col) return;
  try{
    const ref = doc(db, col, targetId);
    const snap = await getDoc(ref);
    if(!snap.exists()){
      // create with balance_cents
      await setDoc(ref, { balance_cents: Number(deltaCents || 0) }, { merge: true });
      return;
    }
    const cur = snap.data();
    const curBalance = Number(cur.balance_cents || 0);
    const next = curBalance + Number(deltaCents || 0);
    await updateDoc(ref, { balance_cents: next, updatedAt: Timestamp.now(), updatedBy: (currentUser && currentUser.uid) || null });
    // also refresh local caches if possible
    if(targetType === 'student'){
      const s = (studentsCache||[]).find(x => x.studentId === targetId || x.id === targetId);
      if(s) s.balance_cents = next;
    } else if(targetType === 'teacher'){
      const t = (teachersCache||[]).find(x => x.teacherId === targetId || x.id === targetId);
      if(t) t.balance_cents = next;
    } else if(targetType === 'staff' && window.staffCache){
      const st = (window.staffCache||[]).find(x => x.id === targetId);
      if(st) st.balance_cents = next;
    }
  }catch(err){
    console.error('updateTargetBalanceGeneric failed', err);
  }
}

/* ---------- Fixes & improved Payments/Exports: paste to database.js replacing older functions ---------- */

/** Helper: returns YYYY-MM string for a Date or now */
function getYYYYMM(d = new Date()){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  return `${y}-${m}`;
}

/** Sum payments in current month for a target, returns cents (number).
 *  Ignores transactions with type 'adjustment' (Reesto Hore).
 *  Matches by target.id / studentId / teacherId / idNumber and by related_months / related_month / createdAt date.
 */
function getPaidThisMonthForTarget(targetType, target){
  if(!target) return 0;
  const idCandidates = [ String(target.id||''), String(target.studentId||''), String(target.teacherId||''), String(target.idNumber||'' ) ].filter(Boolean);
  if(!transactionsCache || !transactionsCache.length) return 0;
  const nowYm = getYYYYMM();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEnd = new Date(now.getFullYear(), now.getMonth()+1, 1).getTime();

  let sum = 0;
  for(const t of (transactionsCache||[])){
    if(t.is_deleted) continue;
    if(String(t.target_type) !== String(targetType)) continue;

    // don't count adjustments
    if(t.type && String(t.type).toLowerCase() === 'adjustment') continue;

    // match id candidates: target_id or legacy target field
    const tid = String(t.target_id || t.target || '');
    if(!idCandidates.includes(tid)) continue;

    // related_months
    if(Array.isArray(t.related_months) && t.related_months.length){
      if(t.related_months.some(m => String(m).startsWith(nowYm))) { sum += Number(t.amount_cents||0); continue; }
    }
    // related_month
    if(t.related_month && String(t.related_month).startsWith(nowYm)){ sum += Number(t.amount_cents||0); continue; }

    // fallback: createdAt in current month
    if(t.createdAt && (t.createdAt.seconds || t.createdAt._seconds)){
      const ts = (t.createdAt.seconds || t.createdAt._seconds) * 1000;
      if(ts >= monthStart && ts < monthEnd){
        sum += Number(t.amount_cents||0);
        continue;
      }
    }
  }
  return sum;
}


/* ---------- Small modals for Add Staff / Add Expense ---------- */
async function openAddStaffModal(){
  showModal('Add Staff', `
    <div style="display:grid;gap:8px">
      <input id="newStaffName" placeholder="Full name" />
      <input id="newStaffPhone" placeholder="Phone" />
      <input id="newStaffRole" placeholder="Role (e.g. cleaner, secretary)" />
      <input id="newStaffSalary" placeholder="Salary (e.g. 100.00)" type="number" step="0.01" />
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px">
        <button id="addStaffCancel" class="btn btn-ghost">Cancel</button>
        <button id="addStaffSave" class="btn btn-primary">Save</button>
      </div>
    </div>
  `);
  modalBody.querySelector('#addStaffCancel').onclick = closeModal;
  modalBody.querySelector('#addStaffSave').onclick = async () => {
    const name = (modalBody.querySelector('#newStaffName').value || '').trim();
    if(!name) return toast('Name required');
    const phone = (modalBody.querySelector('#newStaffPhone').value || '').trim();
    const role = (modalBody.querySelector('#newStaffRole').value || '').trim();
    const salaryRaw = modalBody.querySelector('#newStaffSalary').value;
    const salaryCents = salaryRaw ? p2c(salaryRaw) : 0;
    try{
      // create with a short staffId (best-effort unique)
      const staffId = `STF${String(Date.now()).slice(-6)}`;
      await addDoc(collection(db,'staff'), { fullName: name, phone, role, salary_cents: salaryCents, staffId, createdAt: Timestamp.now(), balance_cents: 0 });
      toast('Staff added' , 'success');
      closeModal();
      await loadStaff();
      await renderPaymentsList('staff');
    }catch(e){ console.error(e); toast('Failed to add staff'); }
  };
}
// ---------- Updated expense add/edit/delete (use 'expenses' collection, editable, soft-delete) ----------

/* -------------------- Add / Edit / Delete expense implementations -------------------- */
// Add expense (uses 'expenses' collection so it's editable and not auto-paid)
async function openAddExpenseModal(){
  showModal('New Expense', `
    <div style="display:grid;gap:8px;min-width:380px">
      <input id="newExpenseName" placeholder="Expense name" />
      <select id="newExpenseCategory">
        <option value="">Select category</option>
        <option>Rent</option>
        <option>Utilities</option>
        <option>Stationery</option>
        <option>Transport</option>
        <option>Maintenance</option>
        <option>Other</option>
      </select>
      <input id="newExpenseAmount" placeholder="Amount (e.g. 120.00)" type="number" step="0.01" />
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px">
        <button id="addExpenseCancel" class="btn btn-ghost">Cancel</button>
        <button id="addExpenseSave" class="btn btn-primary">Save</button>
      </div>
    </div>
  `);
  modalBody.querySelector('#addExpenseCancel').onclick = closeModal;
  modalBody.querySelector('#addExpenseSave').onclick = async function(){
    const btn = this;
    setButtonLoading(btn, true, 'Saving…');
    try{
      const name = (modalBody.querySelector('#newExpenseName').value || '').trim();
      const cat = (modalBody.querySelector('#newExpenseCategory').value || '').trim();
      const amtRaw = modalBody.querySelector('#newExpenseAmount').value;
      if(!name){ toast('Name required'); setButtonLoading(btn,false); return; }
      const amountCents = Math.round((parseFloat(amtRaw) || 0) * 100);
      await addDoc(collection(db,'expenses'), {
        note: name,
        subtype: cat || '',
        amount_cents: amountCents,
        is_paid: false,
        is_deleted: false,
        createdAt: Timestamp.now(),
        createdBy: currentUser?.uid || 'system'
      });
      toast('Expense created', 'success');
      closeModal();
      await loadExpenses();
      await renderPaymentsList('expenses');
    }catch(err){
      console.error('save expense failed', err);
      toast('Failed to save expense', 'error');
    }finally{
      setButtonLoading(btn, false);
    }
  };
}

// Edit expense (editable; doesn't mark as paid)
async function openEditExpenseModal(elOrId){
  const id = typeof elOrId === 'string' ? elOrId : (elOrId?.dataset?.id || getButtonIdFromEvent(elOrId));
  if(!id) return toast('Expense ID missing');
  const snap = await getDoc(doc(db,'expenses', id));
  if(!snap.exists()) return toast('Expense not found');
  const e = { id: snap.id, ...snap.data() };

  showModal('Edit Expense', `
    <div style="display:grid;gap:8px;min-width:380px">
      <input id="editExpenseName" value="${escapeHtml(e.note||'')}" placeholder="Expense name" />
      <select id="editExpenseCategory">
        <option value="">Select category</option>
        <option ${e.subtype==='Rent' ? 'selected' : ''}>Rent</option>
        <option ${e.subtype==='Utilities' ? 'selected' : ''}>Utilities</option>
        <option ${e.subtype==='Stationery' ? 'selected' : ''}>Stationery</option>
        <option ${e.subtype==='Transport' ? 'selected' : ''}>Transport</option>
        <option ${e.subtype==='Maintenance' ? 'selected' : ''}>Maintenance</option>
        <option ${e.subtype==='Other' ? 'selected' : ''}>Other</option>
      </select>
      <input id="editExpenseAmount" value="${((e.amount_cents||0)/100).toFixed(2)}" placeholder="Amount (e.g. 120.00)" type="number" step="0.01" />
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px">
        <button id="editExpenseCancel" class="btn btn-ghost">Cancel</button>
        <button id="editExpenseSave" class="btn btn-primary">Save</button>
        <button id="editExpenseDelete" class="btn btn-danger">Delete</button>
      </div>
    </div>
  `);

  modalBody.querySelector('#editExpenseCancel').onclick = closeModal;

  modalBody.querySelector('#editExpenseSave').onclick = async function(){
    const btn = this;
    setButtonLoading(btn, true, 'Saving…');
    try{
      const name = (modalBody.querySelector('#editExpenseName').value || '').trim();
      const cat = (modalBody.querySelector('#editExpenseCategory').value || '').trim();
      const amtRaw = modalBody.querySelector('#editExpenseAmount').value;
      if(!name){ toast('Name required'); setButtonLoading(btn,false); return; }
      const amountCents = Math.round((parseFloat(amtRaw) || 0) * 100);
      await updateDoc(doc(db,'expenses', id), {
        note: name,
        subtype: cat || '',
        amount_cents: amountCents,
        updatedAt: Timestamp.now(),
        updatedBy: currentUser?.uid || 'system'
      });
      toast('Expense updated', 'success');
      closeModal();
      await loadExpenses();
      await renderPaymentsList('expenses');
    }catch(err){
      console.error('update expense failed', err);
      toast('Failed to update expense', 'error');
    }finally{
      setButtonLoading(btn, false);
    }
  };

  modalBody.querySelector('#editExpenseDelete').onclick = async function(){
    if(!confirm('Move expense to Recycle Bin?')) return;
    const btn = this;
    setButtonLoading(btn, true, 'Deleting…');
    try{
      const who = currentUser?.uid || 'system';
      await updateDoc(doc(db,'expenses', id), {
        is_deleted: true,
        deleted_at: Timestamp.now(),
        deleted_by: who,
        updatedAt: Timestamp.now()
      });
      toast('Expense moved to Recycle Bin', 'info');
      closeModal();
      await loadExpenses();
      await renderPaymentsList('expenses');
    }catch(err){
      console.error('delete expense failed', err);
      toast('Failed to delete expense', 'error');
    }finally{
      setButtonLoading(btn, false);
    }
  };
}

// Soft-delete helper (can accept element or id)
async function deleteExpense(e){
  const id = (typeof e === 'string') ? e : (e?.dataset?.id || e?.currentTarget?.dataset?.id || getButtonIdFromEvent(e));
  if(!id) return;
  if(!confirm('Move expense to Recycle Bin?')) return;
  try{
    const who = currentUser?.uid || 'system';
    await updateDoc(doc(db,'expenses', id), {
      is_deleted: true,
      deleted_at: Timestamp.now(),
      deleted_by: who,
      updatedAt: Timestamp.now()
    });
    toast('Expense moved to Recycle Bin', 'info');
    await loadExpenses();
    renderPaymentsList && renderPaymentsList('expenses');
  }catch(err){
    console.error('deleteExpense failed', err);
    toast('Failed to delete expense', 'error');
  }
}
// ------------------- REPLACE openPayModal -------------------
async function openPayModal(btnOrEvent){
  // normalize to button element
  const btn = (btnOrEvent && btnOrEvent.dataset) ? btnOrEvent
            : (btnOrEvent && btnOrEvent.currentTarget) ? btnOrEvent.currentTarget
            : (btnOrEvent && btnOrEvent.target && btnOrEvent.target.closest && btnOrEvent.target.closest('button')) ? btnOrEvent.target.closest('button')
            : null;
  if(!btn) return;
  const id = btn.dataset.id;

  // determine active view
  const activeTab = document.querySelector('#pagePayments .tab.active');
  const view = activeTab ? activeTab.textContent.toLowerCase() : 'students';

  // If it's expenses, resolve differently (expenses are transactions/expenses collection)
  let target = null;
  let targetType = null;

  if(view === 'expenses'){
    targetType = 'expense';
    // try cached expenses first
    target = (window.expensesCache || []).find(e => String(e.id) === String(id)) ||
             (transactionsCache || []).find(t => String(t.id) === String(id)) ||
             null;

    // fallback: if still not found, try remote doc from 'expenses' collection
    if(!target){
      try{
        const snap = await getDoc(doc(db,'expenses', String(id)));
        if(snap && snap.exists()) target = { id: snap.id, ...snap.data() };
      }catch(e){ /* ignore */ }
    }

    if(!target) return toast('Expense not found');
  } else {
    // old logic for people
    targetType = view === 'students' ? 'student' : (view === 'teachers' ? 'teacher' : 'staff');
    // resolveTargetByAnyId should continue to work for students/teachers/staff
    target = await resolveTargetByAnyId(view, id);
    if(!target) return toast('Target not found');
  }

  // For expenses: set currentBalance from remaining/balance fields; for people use balance_cents
  const currentBalance = targetType === 'expense'
    ? Number(target.remaining_cents ?? target.balance_cents ?? target.amount_cents ?? 0)
    : Number(target.balance_cents || 0);

  const defaultPhone = targetType === 'expense' ? (target.contact_phone || '') : (target.parentPhone || target.phone || '');
  const now = new Date();
  const curMonth = now.getMonth()+1;
  const curYear = now.getFullYear();
  const desktop = !isMobileViewport();


  // months horizontal UI (buttons)
  const monthsShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthButtonsHtml = Array.from({length:12}, (_,i) => {
    const sel = (i+1) === curMonth ? 'month-selected' : '';
    return `<button type="button" class="month-btn ${sel}" data-month="${i+1}" aria-pressed="${sel? 'true':'false'}" style="padding:6px 8px;border-radius:6px;border:1px solid #e5e7eb;background:${sel? '#0b74de':'#fff'};color:${sel? '#fff':'#111'};cursor:pointer;flex:0 0 auto">${monthsShort[i]}</button>`;
  }).join('');

  // year list HTML for year picker (2025..2100)
  const yearOptionsHtml = Array.from({length: (2100-2025+1)}, (_,i) => {
    const y = 2025 + i;
    return `<div class="year-item" data-year="${y}" style="padding:8px;border-radius:6px;cursor:pointer;text-align:center;border:1px solid #f1f5f9">${y}</div>`;
  }).join('');

  const headerTitle = `${(view||'').toUpperCase()} PAYMENTS`;

  // modal HTML: responsive; scrollable content area + sticky footer so buttons remain visible
  const html = `
    <div style="display:flex;flex-direction:column;gap:0; font-size:${desktop ? '0.92rem' : '1rem'}; max-width:${desktop? '760px' : '96%'}; height:${desktop? 'auto' : '92vh'}; background:transparent;">
      <!-- scrollable content -->
      <div id="payModalScroll" style="overflow:auto; padding:12px; box-sizing:border-box; ${desktop ? '' : 'flex:1 1 auto;'}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
          <div style="min-width:0;flex:1 1 auto">
            <div style="font-size:0.85rem;font-weight:700;color:#374151">${escape(headerTitle)}</div>
            <div style="font-weight:900;font-size:1.05rem;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escape(target.fullName || target.teacherName || target.id || '')}</div>
            <div class="muted" style="font-size:0.85rem;margin-top:4px">ID: ${escape(target.studentId || target.teacherId || target.staffId || target.id || '')}</div>
          </div>
          <div style="text-align:right;min-width:0;flex:0 0 auto">
            <div class="muted" style="font-size:0.85rem">Balance</div>
            <div style="font-weight:900;color:#b91c1c;font-size:1.05rem">$${c2p(currentBalance)}</div>
          </div>
        </div>

        <!-- Amount + Type row (id=amountTypeRow so we can force same-row on mobile) -->
        <div id="amountTypeRow" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">
          <div style="flex:1 1 160px;min-width:0">
            <label style="display:block;font-weight:700;margin-bottom:6px">Amount</label>
            <input id="payAmount" type="number" step="0.01" value="${c2p(Math.max(0,currentBalance))}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #e5e7eb;box-sizing:border-box" />
          </div>

          <div style="flex:1 1 160px;min-width:0">
            <label style="display:block;font-weight:700;margin-bottom:6px">Type</label>
            <select id="payType" style="width:100%;padding:8px;border-radius:6px;border:1px solid #e5e7eb">
              <option value="monthly">Monthly</option>
              <option value="id-card">ID Card</option>
              <option value="registration">Registration</option>
              ${targetType!=='student'?'<option value="salary">Salary</option>':''}
              <option value="other">Other</option>
            </select>
          </div>

          <div style="flex:0 0 140px;min-width:120px">
            <label style="display:block;font-weight:700;margin-bottom:6px">Year</label>
            <div style="display:flex;gap:8px;align-items:center">
              <input id="payYear" readonly value="${curYear}" style="padding:8px;border-radius:6px;border:1px solid #e5e7eb;width:5.5ch;text-align:center" />
              <button id="openYearPicker" type="button" class="btn btn-ghost" style="padding:6px 8px">Change</button>
            </div>
          </div>
        </div>

        <!-- Month row (horizontal, wraps) -->
        <div id="monthPicker" style="margin-top:12px">
          <label style="display:block;font-weight:700;margin-bottom:6px">Month</label>
          <div id="monthsRow" style="display:flex;gap:6px;flex-wrap:wrap">${monthButtonsHtml}</div>
          <input id="payMonth" type="hidden" value="${curMonth}" />
        </div>

        <!-- Multi-month selector (hidden by default) -->
        <div id="multiMonthsWrapper" style="display:none;margin-top:10px">
          <label style="display:block;font-weight:700;margin-bottom:6px">Select months (multi)</label>
          <div id="monthsRowMulti" style="display:flex;gap:6px;flex-wrap:wrap">${monthButtonsHtml}</div>
        </div>

        <!-- Payment method / provider / payer phone -->
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">
          <div style="flex:1 1 160px;min-width:0">
            <label style="display:block;font-weight:700;margin-bottom:6px">Payment method</label>
            <select id="payMethod" style="width:100%;padding:8px;border-radius:6px;border:1px solid #e5e7eb">
              <option value="mobile" selected>Mobile</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div id="mobileProviderWrapper" style="flex:1 1 160px;min-width:0">
            <label style="display:block;font-weight:700;margin-bottom:6px">Mobile provider</label>
            <select id="mobileProvider" style="width:100%;padding:8px;border-radius:6px;border:1px solid #e5e7eb">
              <option value="Hormuud" selected>Hormuud (EVC)</option>
              <option value="Somtel">Somtel (Edahab)</option>
              <option value="Somnet">Somnet (Jeeb)</option>
              <option value="Telesom">Telesom</option>
              <option value="Amtel">Amtel</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div style="flex:1 1 160px;min-width:0">
            <label style="display:block;font-weight:700;margin-bottom:6px">Payer Phone</label>
            <input id="payerPhone" value="${escape(defaultPhone)}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #e5e7eb;box-sizing:border-box" />
          </div>
        </div>

        <div style="margin-top:12px">
          <label style="display:block;font-weight:700;margin-bottom:6px">Note</label>
          <input id="payNote" placeholder="Optional note" style="width:100%;padding:8px;border-radius:6px;border:1px solid #e5e7eb;box-sizing:border-box" />
        </div>
      </div>

      <!-- sticky footer: always visible (mobile + desktop). kept outside the scrollable area -->
      <div id="payModalFooter" style="position:sticky;bottom:0;background:#fff;padding:10px;border-top:1px solid #eef2f7;box-shadow:0 -6px 20px rgba(0,0,0,0.06);display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;z-index:5">
        <button id="payClose" class="btn btn-ghost">Close</button>
        <button id="toggleMultiMonths" class="btn btn-ghost">Select multiple months</button>
        <button id="paySave" class="btn btn-primary">Save</button>
      </div>
    </div>
  `;

  // show modal
  showModal(`Pay • ${escape(target.fullName||target.teacherName||target.id||'')}`, html);

  // remove extra bottom space under Note on mobile
// if(!desktop){
//   const scroll = modalBody.querySelector('#payModalScroll');
//   if(scroll){
//     scroll.style.paddingBottom = '6px';
//   }
// }


  // disable background scroll while modal open (restore when modal closed)
  if(!window.__modal_close_wrapped){
    const origClose = window.closeModal || (()=>{});
    window.closeModal = function(){ try{ origClose(); } finally { document.body.style.overflow = ''; } };
    window.__modal_close_wrapped = true;
  }
  document.body.style.overflow = 'hidden';

  // element refs
  const payType = modalBody.querySelector('#payType');
  const amountTypeRow = modalBody.querySelector('#amountTypeRow');
  const multiWrapper = modalBody.querySelector('#multiMonthsWrapper');
  const toggleMulti = modalBody.querySelector('#toggleMultiMonths');
  const payMonthHidden = modalBody.querySelector('#payMonth');
  const payYearEl = modalBody.querySelector('#payYear');
  const payNote = modalBody.querySelector('#payNote');
  const payMethodEl = modalBody.querySelector('#payMethod');
  const mobileProviderEl = modalBody.querySelector('#mobileProvider');
  const mobileProviderWrapper = modalBody.querySelector('#mobileProviderWrapper');
  const monthsRow = modalBody.querySelector('#monthsRow');
  const monthsRowMulti = modalBody.querySelector('#monthsRowMulti');

  // === UX fixes requested ===
  // 1) Show mobile provider only when payment method === 'mobile'
  function updateMobileProviderVisibility(){
    if(!mobileProviderWrapper) return;
    if(payMethodEl.value === 'mobile'){
      mobileProviderWrapper.style.display = 'block';
    } else {
      mobileProviderWrapper.style.display = 'none';
    }
  }
  payMethodEl.addEventListener('change', updateMobileProviderVisibility);
  // initial
  updateMobileProviderVisibility();

  // 2) Ensure Amount + Payment Type appear same row on mobile: force children widths when on mobile
  if(!desktop && amountTypeRow){
    amountTypeRow.style.flexWrap = 'nowrap';
    // first two children = amount and type; keep them side-by-side
    const children = Array.from(amountTypeRow.children);
    // give first two approx 48% each, but still responsive
    if(children[0]) children[0].style.flex = '1 1 48%';
    if(children[1]) children[1].style.flex = '1 1 48%';
    // year column can remain its fixed width
    if(children[2]) { children[2].style.flex = '0 0 120px'; children[2].style.minWidth = '90px'; }
  }

  // helpers for months buttons
  function getMonthButtons(container){ return Array.from(container.querySelectorAll('.month-btn')); }
  function clearSelected(btns){
    btns.forEach(b => {
      b.classList.remove('month-selected');
      b.style.background = '#fff';
      b.style.color = '#111';
      b.setAttribute('aria-pressed','false');
    });
  }
  function setSelectedButton(btn){
    btn.classList.add('month-selected');
    btn.style.background = '#0b74de';
    btn.style.color = '#fff';
    btn.setAttribute('aria-pressed','true');
  }
  function pickSingleMonth(container, month){
    const btns = getMonthButtons(container);
    clearSelected(btns);
    const btn = btns.find(b => String(b.dataset.month) === String(month));
    if(btn) setSelectedButton(btn);
    payMonthHidden.value = month;
  }
  function getSelectedMonthsFrom(container){
    return getMonthButtons(container).filter(b => b.classList.contains('month-selected')).map(b => b.dataset.month);
  }

  // init selection
  pickSingleMonth(monthsRow, curMonth);
  pickSingleMonth(monthsRowMulti, curMonth);

  // click handler
  function monthClickHandler(ev){
    const btn = ev.currentTarget;
    const isMulti = (multiWrapper.style.display !== 'none');
    if(isMulti){
      // toggle selection for multi
      if(btn.classList.contains('month-selected')){
        btn.classList.remove('month-selected');
        btn.style.background = '#fff';
        btn.style.color = '#111';
        btn.setAttribute('aria-pressed','false');
      } else {
        setSelectedButton(btn);
      }
    } else {
      // single selection behavior
      clearSelected(getMonthButtons(monthsRow));
      setSelectedButton(btn);
      payMonthHidden.value = btn.dataset.month;
    }
    // fillDefaultNote();
    fillDefaultNote(true);

  }

  getMonthButtons(monthsRow).forEach(b => b.addEventListener('click', monthClickHandler));
  getMonthButtons(monthsRowMulti).forEach(b => b.addEventListener('click', monthClickHandler));

  // Toggle multi-month UI; change button text to hide/show
  toggleMulti.addEventListener('click', () => {
    const showMulti = multiWrapper.style.display === 'none' || multiWrapper.style.display === '';
    if(showMulti){
      multiWrapper.style.display = 'block';
      monthsRow.style.display = 'none';
      toggleMulti.textContent = 'Hide multiple months';
      // ensure the same selections carry over
      const cur = payMonthHidden.value || curMonth;
      pickSingleMonth(monthsRowMulti, cur);
    } else {
      multiWrapper.style.display = 'none';
      monthsRow.style.display = 'flex';
      toggleMulti.textContent = 'Select multiple months';
      // when hiding multi, ensure single row has selection
      const sel = getSelectedMonthsFrom(monthsRowMulti)[0] || payMonthHidden.value || curMonth;
      pickSingleMonth(monthsRow, sel);
      // optionally clear the multi selections
      clearSelected(getMonthButtons(monthsRowMulti));
    }
    fillDefaultNote(true);
  });

  // Year picker popup (separate overlay, will not replace main modal)
  function openYearPickerPopup(){
    const overlay = document.createElement('div');
    overlay.className = 'year-picker-overlay';
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(0,0,0,0.35)';
    overlay.style.zIndex = '99999';

    const box = document.createElement('div');
    box.style.background = '#fff';
    box.style.borderRadius = '10px';
    box.style.padding = '12px';
    box.style.maxHeight = '70vh';
    box.style.overflow = 'auto';
    box.style.width = desktop ? '420px' : '94%';
    box.style.boxShadow = '0 8px 30px rgba(0,0,0,0.15)';
    box.innerHTML = `<div style="font-weight:900;margin-bottom:8px">Select Year</div>
      <div id="yearList" style="display:grid;grid-template-columns:repeat(${desktop?3:2},1fr);gap:8px">${yearOptionsHtml}</div>
      <div style="display:flex;justify-content:flex-end;margin-top:10px"><button id="closeYearPicker" class="btn btn-ghost">Close</button></div>`;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // wire year items
    box.querySelectorAll('.year-item').forEach(yEl => {
      yEl.addEventListener('click', () => {
        const y = yEl.dataset.year;
        const py = modalBody.querySelector('#payYear');
        if(py) py.value = y;
        fillDefaultNote(true);
        document.body.removeChild(overlay);
      });
    });
    box.querySelector('#closeYearPicker').addEventListener('click', () => {
      document.body.removeChild(overlay);
    });
  }

  modalBody.querySelector('#openYearPicker').addEventListener('click', openYearPickerPopup);

  // fill default note text using "Lacagta Bisha Jan-2026"
  function fillDefaultNote(force = false){
    // do not overwrite if user already typed something (unless forced)
    if(payNote.value && !force) return;
  
    const t = payType.value;
    const yVal = payYearEl ? payYearEl.value : curYear;
    const isMulti = (multiWrapper.style.display !== 'none');
  
    // collect selected months
    let months = [];
    if(t === 'monthly'){
      if(isMulti){
        months = getSelectedMonthsFrom(monthsRowMulti);
      } else {
        months = [getSelectedMonthsFrom(monthsRow)[0] || payMonthHidden.value || curMonth];
      }
    }
  
    // convert month numbers → names
    const monthNames = months
      .map(m => monthsShort[(Number(m) || curMonth) - 1])
      .filter(Boolean);
  
    let text = '';
  
    if(t === 'monthly'){
      const joined = monthNames.join('/');
      text = `Lacagta Bisha ${joined}-${yVal}`;
    }
    else if(t === 'id-card'){
      text = 'Lacagta-ID-card';
    }
    else if(t === 'registration'){
      text = 'Lacagta Registeration';
    }
    else if(t === 'salary'){
      text = 'Lacagta mushaar';
    }
    else {
      text = 'Lacagta Kale';
    }
  
    payNote.value = text;
  }
  
  // wire interactions & preserve original logic
  payType.onchange = () => {
    modalBody.querySelector('#monthPicker').style.display =
      payType.value === 'monthly' ? 'block' : 'none';
    fillDefaultNote(true);
  };
  
  // payType.onchange = () => { modalBody.querySelector('#monthPicker').style.display = payType.value==='monthly' ? 'block' : 'none'; fillDefaultNote(); };
  // fillDefaultNote();

  modalBody.querySelector('#payClose').onclick = () => { closeModal(); /* closeModal restores overflow */ };

  modalBody.querySelector('#paySave').onclick = async () => {
    const btnSave = modalBody.querySelector('#paySave');
    const oldHtml = putButtonLoader(btnSave);
    try{
      const raw = modalBody.querySelector('#payAmount').value;
      if(!raw) { toast('Amount required'); restoreButton(btnSave, oldHtml); return; }
      const amountCents = p2c(raw);
      if(amountCents <= 0) { toast('Amount must be > 0'); restoreButton(btnSave, oldHtml); return; }
      const type = payType.value;

      // determine related months
      let relatedMonths = [];
      if(multiWrapper && multiWrapper.style.display !== 'none'){
        relatedMonths = getSelectedMonthsFrom(monthsRowMulti).map(m => `${payYearEl.value}-${String(m).padStart(2,'0')}`);
        if(relatedMonths.length === 0){
          toast('Select at least one month'); restoreButton(btnSave, oldHtml); return;
        }
      } else {
        const sel = getSelectedMonthsFrom(monthsRow)[0] || payMonthHidden.value || curMonth;
        relatedMonths = [`${payYearEl.value}-${String(sel).padStart(2,'0')}`];
      }

      const payment_method = payMethodEl.value;
      const mobile_provider = mobileProviderEl ? mobileProviderEl.value : null;
      const payer_phone = modalBody.querySelector('#payerPhone').value.trim() || null;
      const note = modalBody.querySelector('#payNote').value.trim() || null;

      const tx = {
        actor: currentUser ? currentUser.uid : null,
        target_type: targetType,
        target_id: (targetType === 'expense') ? (target.id || target.txId || target.expense_id) : (target.id || target.studentId || target.teacherId || target.id),
        type,
        amount_cents: amountCents,
        payment_method,
        mobile_provider,
        payer_phone,
        note,
        related_months: type === 'monthly' ? relatedMonths : [],
        createdAt: Timestamp.now()
      };

      // create transaction
      await addDoc(collection(db,'transactions'), tx);

      // Expense-specific update: decrement remaining/balance on expense doc if exists
      if(targetType === 'expense'){
        try{
          const expId = tx.target_id;
          // preferred fields: remaining_cents or balance_cents
          const expRef = doc(db,'expenses', String(expId));
          // compute new remaining: try reading from cache target; fallback safe update
          const prevRemaining = Number(target.remaining_cents ?? target.balance_cents ?? target.amount_cents ?? 0);
          const newRemaining = prevRemaining - amountCents;
          const updates = {
            updatedAt: Timestamp.now(),
            updatedBy: currentUser?.uid || 'system'
          };
          if(typeof target.remaining_cents !== 'undefined'){
            updates.remaining_cents = Math.max(0, newRemaining);
            if(newRemaining <= 0) updates.is_paid = true;
          } else if(typeof target.balance_cents !== 'undefined'){
            // if using balance_cents as remaining, update it
            updates.balance_cents = Math.max(0, newRemaining);
          } else {
            // fallback: set remaining_cents
            updates.remaining_cents = Math.max(0, newRemaining);
            if(newRemaining <= 0) updates.is_paid = true;
          }
          await updateDoc(expRef, updates).catch(()=>{/* non-fatal */});
        }catch(e){ console.warn('Failed to update expense after payment', e); }
      } else {
        // original behavior: update balances for students/teachers/staff
        if(type === 'monthly' && targetType === 'student'){
          await updateTargetBalanceGeneric('student', tx.target_id, -amountCents);
        }
        if(type === 'salary' && (targetType === 'teacher' || targetType === 'staff')){
          await updateTargetBalanceGeneric(targetType, tx.target_id, -amountCents);
        }
      }

      toast('Payment recorded','success');
      closeModal();
      // refresh caches & UI
      await Promise.all([ loadTransactions && loadTransactions(), loadExpenses && loadExpenses() ]);
      const active2 = document.querySelector('#pagePayments .tab.active');
      const viewName = active2 ? active2.textContent.toLowerCase() : 'students';
      await renderPaymentsList(viewName);
      renderDashboard && renderDashboard();
    }catch(err){
      console.error(err); toast('Failed to save payment');
    } finally {
      restoreButton(btnSave, oldHtml);
    }
  };
}
// ------------------- END openPayModal replacement -------------------



async function openAdjustmentModal(btnOrEvent){
  const btn = (btnOrEvent && btnOrEvent.dataset) ? btnOrEvent : (btnOrEvent && btnOrEvent.currentTarget) ? btnOrEvent.currentTarget : (btnOrEvent && btnOrEvent.target && btnOrEvent.target.closest && btnOrEvent.target.closest('button')) ? btnOrEvent.target.closest('button') : null;
  if(!btn) return;
  const id = btn.dataset.id;
  const activeTab = document.querySelector('#pagePayments .tab.active');
  const view = activeTab ? activeTab.textContent.toLowerCase() : 'students';
  const targetType = view === 'students' ? 'student' : (view === 'teachers' ? 'teacher' : 'staff');

  const target = await resolveTargetByAnyId(view, id);
  if(!target) return toast('Target not found');

  const html = `
    <div style="display:grid;grid-template-columns:1fr;gap:8px">
      <div>
        <label style="display:block;font-weight:700;margin-bottom:6px">Amount (use negative to decrease balance)</label>
        <input id="adjAmount" type="number" step="0.01" value="0" style="width:6.5ch;padding:8px;border-radius:6px;border:1px solid #e5e7eb" />
      </div>
      <div>
        <label style="display:block;font-weight:700;margin-bottom:6px">Reason / Note</label>
        <input id="adjNote" placeholder="e.g., refund, penalty, manual add" style="width:100%;padding:8px;border-radius:6px;border:1px solid #e5e7eb" />
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button id="adjClose" class="btn btn-ghost">Close</button>
      <button id="adjSave" class="btn btn-primary">Save</button>
    </div>
  `;
  showModal(`Reesto Hore • ${escape(target.fullName || target.id || '')}`, html);

  // prevent background scroll while modal open
  if(!window.__modal_close_wrapped){
    const origClose = window.closeModal || (()=>{});
    window.closeModal = function(){ try{ origClose(); }finally{ document.body.style.overflow = ''; } };
    window.__modal_close_wrapped = true;
  }
  document.body.style.overflow = 'hidden';

  modalBody.querySelector('#adjClose').onclick = () => { closeModal(); };
  modalBody.querySelector('#adjSave').onclick = async () => {
    try{
      const raw = modalBody.querySelector('#adjAmount').value;
      if(raw === '' || raw === null) return toast('Amount required');
      const signedCents = Math.round(Number(raw)*100);
      if(signedCents === 0) return toast('Amount should not be zero');
      const note = modalBody.querySelector('#adjNote').value.trim() || 'Adjustment';
      const tx = {
        actor: currentUser ? currentUser.uid : null,
        target_type: targetType,
        target_id: target.id || target.studentId || target.teacherId || target.id,
        type: 'adjustment',
        amount_cents: signedCents,
        payment_method: 'manual',
        note,
        related_months: [],
        createdAt: Timestamp.now()
      };
      await addDoc(collection(db,'transactions'), tx);
      await updateTargetBalanceGeneric(targetType, tx.target_id, signedCents); // signedCents may be negative or positive
      toast('Adjustment saved','success');
      closeModal();
      await loadTransactions();
      renderPaymentsList('students');
      renderPaymentsList('teachers');
      renderPaymentsList('staff');
      renderDashboard && renderDashboard();
    }catch(err){ console.error(err); toast('Failed to save adjustment', 'error', 3000); }
  };
}


// ------------------- REPLACE openViewTransactionsModal -------------------
async function openViewTransactionsModal(btnOrEvent){
  const btn = (btnOrEvent && btnOrEvent.dataset) ? btnOrEvent : (btnOrEvent && btnOrEvent.currentTarget) ? btnOrEvent.currentTarget : (btnOrEvent && btnOrEvent.target && btnOrEvent.target.closest && btnOrEvent.target.closest('button')) ? btnOrEvent.target.closest('button') : null;
  if(!btn) return;
  const id = btn.dataset.id;
  const activeTab = document.querySelector('#pagePayments .tab.active');
  const view = activeTab ? activeTab.textContent.toLowerCase() : 'students';

  // Determine targetType and resolve target (support expenses)
  let targetType = null;
  let target = null;

  if(view === 'expenses'){
    targetType = 'expense';
    target = (window.expensesCache || []).find(e => String(e.id) === String(id)) ||
             (transactionsCache || []).find(t => String(t.id) === String(id)) || null;
    if(!target){
      try{
        const snap = await getDoc(doc(db,'expenses', String(id)));
        if(snap && snap.exists()) target = { id: snap.id, ...snap.data() };
      }catch(e){ /* ignore */ }
    }
    if(!target) return toast('Expense not found','info');
  } else {
    targetType = view === 'students' ? 'student' : (view === 'teachers' ? 'teacher' : 'staff');
    target = await resolveTargetByAnyId(view, id);
    if(!target) return toast('Target not found','info');
  }

  // fetch transactions for that target (only transactions matching the target_type & target_id)
  const snap = await getDocs(collection(db,'transactions'));
  let txs = snap.docs.map(d=>({ id:d.id, ...d.data() }));

  txs = txs.filter(t => {
    if(t.is_deleted) return false;
    if(String(t.target_type || '').toLowerCase() !== String(targetType).toLowerCase()) return false;
    const tid = String(t.target_id || t.target || '');
    const cand = String(target.id || target.expense_id || target.studentId || target.teacherId || target.staffId || target.id || '');
    return tid === cand;
  });

  txs.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));

  const totalMonthly = txs.filter(t=> (t.type && String(t.type).toLowerCase() !== 'adjustment') && String(t.type).toLowerCase() === 'monthly').reduce((s,t)=>s+(t.amount_cents||0),0);
  const totalAll = txs.filter(t => String(t.type).toLowerCase() !== 'adjustment').reduce((s,t)=>s+(t.amount_cents||0),0);
  const totalAdj = txs.filter(t=>String(t.type).toLowerCase() === 'adjustment').reduce((s,t)=>s+(t.amount_cents||0),0);

  // build UI (reuse your existing UI creation code)...
  const editSvg = (typeof svgEdit === 'function') ? svgEdit() : '✏️';
  const delSvg = (typeof svgDelete === 'function') ? svgDelete() : '🗑️';
  const smallFont = isMobileViewport() ? 'font-size:0.82rem' : 'font-size:0.9rem';
  let html = '';

  html += `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
    <div>
      <div style="font-weight:900">${escape(target.note || target.fullName || target.teacherName || target.id)}</div>
      <div class="muted" style="font-size:0.85rem">ID: ${escape(target.id || target.expense_id || '')}</div>
    </div>
    <div style="text-align:right">
      <div class="muted" style="font-size:0.85rem">Balance</div>
      <div style="font-weight:900;color:#b91c1c">$${c2p(target.remaining_cents ?? target.balance_cents ?? 0)}</div>
    </div>
  </div>`;

  html += `<div style="display:flex;gap:12px;justify-content:flex-start;align-items:center;margin-top:10px;flex-wrap:wrap">
    <div style="font-size:0.85rem">Monthly paid: <span style="color:#059669;font-weight:900">$${c2p(totalMonthly)}</span></div>
    <div style="font-size:0.85rem">Payments total: <span style="color:#0b74de;font-weight:900">$${c2p(totalAll)}</span></div>
    <div style="font-size:0.85rem">Reesto Hore total: <span style="color:#f97316;font-weight:900">$${c2p(totalAdj)}</span></div>
  </div>`;

  // body list (mobile / desktop) - reuse your original code for layout & actions
  if(isMobileViewport()){
    html += `<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;max-height:55vh;overflow:auto;padding-right:8px">`;
    txs.forEach(tx => {
      const dateStr = tx.createdAt ? new Date((tx.createdAt.seconds||tx.createdAt._seconds)*1000).toLocaleString() : '';
      const amt = c2p(tx.amount_cents||0);
      const ttype = String(tx.type||'').toLowerCase();
      let color = '#111';
      if(ttype.includes('adjust')) color = '#f97316';
      else if(ttype.includes('payment') || ttype.includes('monthly')) color = '#059669';
      else if(ttype.includes('assigned') || ttype.includes('fee') || ttype.includes('total')) color = '#0b74de';
      else if(ttype.includes('balance')) color = '#b91c1c';
      const monthsLabel = (tx.related_months && tx.related_months.length) ? tx.related_months.map(m => formatMonthLabel(m)).join(', ') : (tx.related_month ? formatMonthLabel(tx.related_month) : '');

      html += `<div class="tx-card" style="padding:10px;border-radius:8px;border:1px solid #f1f5f9;display:flex;justify-content:space-between;gap:8px;align-items:flex-start;${smallFont}">
        <div style="flex:1 1 60%;min-width:0">
          <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escape(tx.note || tx.title || displayTypeLabel(tx.type) || 'Transaction')}</div>
          <div class="muted" style="font-size:0.78rem;margin-top:6px">${escape(monthsLabel)} • ${escape(dateStr)}</div>
          <div style="font-size:0.78rem;margin-top:6px;color:#374151">${escape(tx.payment_method||'')}${tx.mobile_provider ? ' / ' + escape(tx.mobile_provider) : ''}</div>
        </div>
        <div style="flex:0 0 auto;text-align:right;min-width:6.5ch;font-weight:900;color:${color}">
          $${escape(amt)}
          <div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end">
            <button class="btn-icon edit-tx" data-id="${tx.id}" style="border:0;background:transparent;padding:4px">${editSvg}</button>
            <button class="btn-icon del-tx" data-id="${tx.id}" style="border:0;background:transparent;padding:4px">${delSvg}</button>
          </div>
        </div>
      </div>`;
    });
    html += `</div>`;
  } else {
    html += `<div style="overflow:auto;margin-top:12px"><table style="width:100%;border-collapse:collapse"><thead><tr>
      <th>Date</th><th>Type</th><th>Months</th><th style="text-align:right">Amount</th><th>Method</th><th>Note</th><th>Actions</th>
    </tr></thead><tbody>`;
    txs.forEach((tx) => {
      const defaultNote = tx.note || (tx.type==='monthly' ? (formatMonthLabel((tx.related_months||[])[0]||'')) : '');
      const monthsLabel = (tx.related_months && tx.related_months.length) ? tx.related_months.map(m => formatMonthLabel(m)).join(', ') : (tx.related_month ? formatMonthLabel(tx.related_month) : '');
      html += `<tr style="border-bottom:1px solid #f1f5f9">
        <td style="padding:8px">${tx.createdAt ? new Date((tx.createdAt.seconds||tx.createdAt._seconds)*1000).toLocaleString() : ''}</td>
        <td style="padding:8px">${escape(displayTypeLabel(tx.type))}</td>
        <td style="padding:8px">${escape(monthsLabel)}</td>
        <td style="padding:8px;text-align:right">${c2p(tx.amount_cents||0)}</td>
        <td style="padding:8px">${escape(tx.payment_method||'')}${tx.mobile_provider ? ' / ' + escape(tx.mobile_provider) : ''}</td>
        <td style="padding:8px">${escape(defaultNote)}</td>
        <td style="padding:8px">
          <button title="Edit" class="icon edit-tx" data-id="${tx.id}" style="border:0;background:transparent">${editSvg}</button>
          <button title="Delete" class="icon del-tx" data-id="${tx.id}" style="border:0;background:transparent">${delSvg}</button>
        </td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }

  html += `<div style="display:flex;justify-content:flex-end;margin-top:12px"><button id="closeTxView" class="btn btn-ghost">Close</button></div>`;

  showModal('Transactions', html);

  // prevent background scroll while modal open
  if(!window.__modal_close_wrapped){
    const origClose = window.closeModal || (()=>{});
    window.closeModal = function(){ try{ origClose(); } finally { document.body.style.overflow = ''; } };
    window.__modal_close_wrapped = true;
  }
  document.body.style.overflow = 'hidden';

  modalBody.querySelector('#closeTxView').onclick = () => { closeModal(); };

  // wire actions (edit/delete)
  modalBody.querySelectorAll('.edit-tx').forEach(b => b.addEventListener('click', ev => openEditTransactionModal(ev.currentTarget)));
  modalBody.querySelectorAll('.del-tx').forEach(b => b.addEventListener('click', ev => deleteTransaction(ev.currentTarget)));
}
// ------------------- END openViewTransactionsModal replacement -------------------





/* ---------- Inline SVG helpers: edit/delete icons ---------- */
function svgEdit(){
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M4 21h4l12-12-4-4L4 17v4z" stroke="currentColor" stroke-width="2"/>
  </svg>`;
}

function svgDelete(){
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M3 6h18M8 6v14m8-14v14M5 6l1-3h12l1 3" stroke="currentColor" stroke-width="2"/>
  </svg>`;
}

function svgView(){
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" stroke="currentColor" stroke-width="2"/>
  </svg>`;
}


/* ---------- Improved ID-search helper (supports last-6 matching) ---------- */
function searchableFieldsFor(item){
  // returns combined string to search across, plus explicit ID fields
  const idCandidates = [
    String(item.studentId || item.id || ''),
    String(item.teacherId || item.id || ''),
    String(item.staffId || item.id || '')
  ].filter(Boolean);
  const rest = [
    String(item.fullName || item.full_name || ''),
    String(item.parentPhone || item.phone || item.contact || ''),
    String(item.className || item.class || '')
  ].filter(Boolean).join(' ').toLowerCase();
  return { idCandidates, rest };
}
function matchesSearchTerm(item, q){
  if(!q) return true;
  const qRaw = String(q).trim();
  const qLower = qRaw.toLowerCase();

  // if the query is numeric and length <= 6, check last N digits on IDs
  const digitsOnly = /^\d+$/.test(qRaw);
  const { idCandidates, rest } = searchableFieldsFor(item);

  if(digitsOnly && qRaw.length <= 6){
    // match if any candidate's last-6 includes the query
    for(const id of idCandidates){
      if(!id) continue;
      const last6 = id.slice(-6);
      if(last6.includes(qRaw)) return true;
      // also allow matching anywhere in id
      if(id.includes(qRaw)) return true;
    }
  }

  // generic substring match across ids + other fields
  for(const id of idCandidates){
    if(id && id.toLowerCase().includes(qLower)) return true;
  }
  if(rest && rest.includes(qLower)) return true;

  // fallback numeric matching inside id text
  return false;
}

/* ---------------------- SMALL HELPERS ---------------------- */


/* Salary display unchanged (keeps supporting salary_cents and salary) */
function salaryDisplay(item){
  if(!item) return '—';
  if(typeof item.salary_cents !== 'undefined' && item.salary_cents !== null){
    return c2p(item.salary_cents);
  }
  if(typeof item.salary !== 'undefined' && item.salary !== null && item.salary !== ''){
    if(!isNaN(Number(item.salary))) return Number(item.salary).toFixed(2);
    return String(item.salary);
  }
  if(typeof item.salaryCents !== 'undefined' && item.salaryCents !== null) return c2p(item.salaryCents);
  return '—';
}

/* resolveClassName extended to handle teacher.classes array and other variants */
function resolveClassName(item){
  if(!item) return '';
  const tryVal = v => (v && String(v).trim()) ? String(v).trim() : null;

  // direct, simple fields
  const direct = tryVal(item.className) || tryVal(item.class) || tryVal(item.class_name) || tryVal(item.classTitle) || tryVal(item.class_title);
  if(direct) return direct;

  // if item has classes array (teachers sometimes store classes array)
  if(Array.isArray(item.classes) && item.classes.length){
    const names = item.classes.map(cid => {
      const cls = (classesCache||[]).find(c => String(c.id) === String(cid) || String(c.classId||'') === String(cid) || String(c.name||'') === String(cid));
      return cls ? (cls.name || cls.displayName || cls.id) : String(cid);
    }).filter(Boolean);
    if(names.length) return names.join(', ');
  }

  // classId -> lookup
  const cid = item.classId || item.class_id || item.classIdRef || (item.class && typeof item.class === 'object' && item.class.id) || (item.record && item.record.classId);
  if(cid){
    const cls = (classesCache||[]).find(c => String(c.id) === String(cid) || String(c.classId||'') === String(cid) || String(c.name||'') === String(cid));
    if(cls) return cls.name || cls.displayName || String(cls.id);
  }

  // nested object examples
  if(item.record && (item.record.className || item.record.class)) return tryVal(item.record.className) || tryVal(item.record.class);
  if(item.meta && (item.meta.className || item.meta.class)) return tryVal(item.meta.className) || tryVal(item.meta.class);

  // fuzzy match fallback
  if(item.class){
    const rawClass = String(item.class).trim().toLowerCase();
    if(rawClass){
      const maybe = (classesCache||[]).find(c => (String(c.id||'') === rawClass) || (String(c.name||'').toLowerCase() === rawClass) || (String(c.displayName||'').toLowerCase() === rawClass));
      if(maybe) return maybe.name || maybe.displayName || maybe.id;
      return item.class;
    }
  }

  return '';
}

/* simplified: return last-6 match helper used in search (keeps earlier behavior) */
function last6Id(id){
  if(!id) return '';
  id = String(id);
  return id.slice(-6);
}


/*
  Updated functions (mobile-friendly layout) for payments UI.
  Replace the existing `mobileIdDisplay`, `renderPayments` and `renderPaymentsList`
  implementations in your database.js with the three functions below.

  Key changes:
  - Students & Teachers: compact 2-line mobile card (Line1: No | Name | Balance, Line2: ID | Class | More)
  - Staff & Expenses: single-line mobile row (Name | Role/Category | Amount | More)
  - Name uses single-line ellipsis and reserves ~40 characters space (max-width:40ch)
  - All sizing for mobile uses rem-friendly units and simple inline styles for quick drop-in
  - Desktop/table views are left unchanged (function preserves existing desktop markup)
  - Adds a small `svgMore()` helper for a proper "more" icon button
*/

function mobileIdDisplay(id, opts = { hideOnMobile: false, forceFullOnMobile: false }){
  if(!id) return '';
  id = String(id);
  if(isMobileViewport()){
    if(opts.hideOnMobile) return '';          // user requested no staff/expense id on mobile
    if(opts.forceFullOnMobile) return id;     // show full id when caller requests it (students/teachers)
    if(id.length <= 6) return id;
    return '...' + id.slice(-6);              // show last 6 as default
  }
  return id; // full on desktop
}

function svgMore(){
  return `<svg class="icon-sm" viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle">
    <circle cx="5" cy="12" r="1.6" fill="currentColor" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    <circle cx="19" cy="12" r="1.6" fill="currentColor" />
  </svg>`;
}

async function renderPayments(){
  // ensure expenses are loaded here too
  await Promise.all([ loadClasses && loadClasses(), loadExpenses && loadExpenses(), loadSubjects && loadSubjects(), loadStudents && loadStudents(), loadTeachers && loadTeachers(), loadStaff && loadStaff(), loadTransactions && loadTransactions() ]);

  let page = document.getElementById('pagePayments');
  if(!page){
    page = document.createElement('section');
    page.id = 'pagePayments';
    page.className = 'page';
    const main = document.querySelector('main') || document.body;
    main.appendChild(page);
  }

  page.innerHTML = `
  <div class="page-header" style="display:flex;flex-direction:column;gap:0.5rem">
    <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
      <div style="display:flex;gap:0.5rem;align-items:center">
        <button id="paymentsTabStudents" class="tab active">Students</button>
        <button id="paymentsTabTeachers" class="tab">Teachers</button>
        <button id="paymentsTabStaff" class="tab">Staff</button>
        <button id="paymentsTabExpenses" class="tab">Expenses</button>
      </div>
      <div style="margin-left:0.75rem;display:flex;gap:0.5rem;align-items:center">
        <button id="openAddStaffBtn" class="btn btn-ghost">+ Add Staff</button>
        <button id="openAddExpenseBtn" class="btn btn-ghost">+ New Expense</button>
        <button id="openAddMonthBtn" class="btn btn-danger">Add month</button>
      </div>
    </div>

    <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
      <input id="paymentsSearch" placeholder="Search name / ID / phone (or last 6 digits)" style="flex:1;min-width:10rem;padding:0.5rem" />
    </div>

    <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
      <select id="paymentsClassFilter" style="min-width:8.5rem"></select>
      <select id="paymentsStatusFilter" style="min-width:7.5rem"><option value="all">All</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="free">Free</option></select>
      <select id="paymentsTeacherSubjectFilter" style="min-width:10rem"></select>
      <button id="paymentsRefresh" class="btn btn-ghost" title="Refresh list" style="margin-left:auto">↻</button>
      <button id="paymentsExport" class="btn btn-ghost">Export</button>
    </div>
  </div>

  <div id="paymentsList" style="margin-top:0.6rem"></div>
  `;

  // wiring
  document.getElementById('openAddStaffBtn').onclick = openAddStaffModal;
  document.getElementById('openAddExpenseBtn').onclick = async () => {
    await openAddExpenseModal();
  };
  document.getElementById('openAddMonthBtn')?.addEventListener('click', handleAddMonthClick);

  // populate class filter
  const sel = document.getElementById('paymentsClassFilter');
  if(sel){
    sel.innerHTML = '<option value="">All classes</option>' + (classesCache || []).map(c => `<option value="${escape(c.id||c.classId||c.name)}">${escape(c.name||c.displayName||c.id)}</option>`).join('');
  }

  // populate subjects
  const subjSel = document.getElementById('paymentsTeacherSubjectFilter');
  subjSel.innerHTML = '<option value="">All subjects</option>' + (window.subjectsCache||[]).map(s => `<option value="${escape(s.id)}">${escape(s.name||s.id)}</option>`).join('');

  ['students','teachers','staff','expenses'].forEach(v => {
    const btn = document.getElementById('paymentsTab' + v[0].toUpperCase() + v.slice(1));
    if(btn){
      btn.onclick = () => {
        document.querySelectorAll('#pagePayments .tab').forEach(t=>t.classList.remove('active'));
        btn.classList.add('active');
        renderPaymentsList(v);
      };
    }
  });

  const search = document.getElementById('paymentsSearch');
  const classFilterEl = document.getElementById('paymentsClassFilter');
  const statusFilterEl = document.getElementById('paymentsStatusFilter');
  const teacherSubjectFilterEl = document.getElementById('paymentsTeacherSubjectFilter');
  [search, classFilterEl, statusFilterEl, teacherSubjectFilterEl].forEach(el => {
    if(!el) return;
    el.oninput = el.onchange = () => {
      const active = document.querySelector('#pagePayments .tab.active');
      renderPaymentsList(active ? active.textContent.toLowerCase() : 'students');
    };
  });

  document.getElementById('paymentsExport').onclick = exportCurrentPaymentsView;

  const refreshBtn = document.getElementById('paymentsRefresh');
  if(refreshBtn) refreshBtn.onclick = async () => {
    try{
      refreshBtn.disabled = true;
      await Promise.all([ loadClasses && loadClasses(), loadSubjects && loadSubjects(), loadStudents && loadStudents(), loadTeachers && loadTeachers(), loadStaff && loadStaff(), loadTransactions && loadTransactions(), loadExpenses && loadExpenses() ]);
      // re-populate filters
      const sel2 = document.getElementById('paymentsClassFilter');
      if(sel2) sel2.innerHTML = '<option value="">All classes</option>' + (classesCache || []).map(c => `<option value="${escape(c.id||c.classId||c.name)}">${escape(c.name||c.displayName||c.id)}</option>`).join('');
      const subjSel2 = document.getElementById('paymentsTeacherSubjectFilter');
      if(subjSel2) subjSel2.innerHTML = '<option value="">All subjects</option>' + (window.subjectsCache||[]).map(s => `<option value="${escape(s.id)}">${escape(s.name||s.id)}</option>`).join('');
      const active = document.querySelector('#pagePayments .tab.active');
      await renderPaymentsList(active ? active.textContent.toLowerCase() : 'students');
      toast('Refreshed');
    }catch(e){ console.error('refresh failed', e); toast('Refresh failed'); }
    finally { refreshBtn.disabled = false; }
  };

  // initial view
  await renderPaymentsList('students');
}
// Robust id extractor for button handlers (handles clicking SVGs/inner elements)
function getButtonIdFromEvent(ev){
  if(!ev) return null;
  // prefer dataset on currentTarget (the element the handler attached to)
  if(ev.currentTarget && ev.currentTarget.dataset && ev.currentTarget.dataset.id) return ev.currentTarget.dataset.id;
  // fallback to target.dataset (if handler attached to parent click)
  if(ev.target && ev.target.dataset && ev.target.dataset.id) return ev.target.dataset.id;
  // fallback to nearest button with data-id
  const btn = ev.target && ev.target.closest ? ev.target.closest('[data-id]') : null;
  return btn && btn.dataset ? btn.dataset.id : null;
}

// Soft-delete staff (use instead of deleteDoc)
async function deleteStaff(e){
  // accept event, element, or id string
  const id = (e && e.target && e.target.dataset && e.target.dataset.id)
           || (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id)
           || (e && e.dataset && e.dataset.id)
           || (typeof e === 'string' ? e : null);
  if(!id) return;
  if(!confirm('Move staff to Recycle Bin?')) return;

  try {
    const who = (currentUser && currentUser.uid) || (auth && auth.currentUser && auth.currentUser.uid) || null;
    await updateDoc(doc(db,'staff', id), {
      deleted: true,
      deletedAt: Timestamp.now(),
      deletedBy: who,
      deleted_at: Timestamp.now(),
      deleted_by: who,
      updatedAt: Timestamp.now()
    });

    // ensure local cache is refreshed if loader exists
    if(typeof loadStaff === 'function') await loadStaff();
    if(typeof loadTransactions === 'function') await loadTransactions();

    toast('Staff moved to Recycle Bin' , 'info');

    // refresh lists & recycle UI
    renderPaymentsList && renderPaymentsList('staff');
    // if recycle page is open, refresh it so the item appears immediately
    if(typeof renderRecycleBin === 'function') await renderRecycleBin();
  } catch(err){
    console.error('deleteStaff failed', err);
    toast('Failed to delete staff');
  }
}

function getMonthKeyForDate(d = new Date()){
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2,'0')}`; // e.g. "2026-01"
}
function getMonthLabelForDate(d = new Date()){
  return d.toLocaleString(undefined, { month:'short', year:'numeric', day:'numeric' }); // "Jan 2026" or include day if you like
}


// ---------- GLOBAL LOCKS ----------
window._rollupInProgress = false;

const _ROLLUP_STYLE_ID = 'rollupOverlayStyle';
if (!document.getElementById(_ROLLUP_STYLE_ID)) {
  const s = document.createElement('style');
  s.id = _ROLLUP_STYLE_ID;
  s.textContent = `
    /* fixed overlay so it never gets clipped by modal content */
    .rollup-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(7,10,20,0.45);
      z-index: 99999;
      padding: 16px;
    }
    .rollup-card {
      width: 760px;
      max-width: calc(100% - 32px);
      max-height: calc(100vh - 64px);
      overflow: auto;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(7,20,40,0.12);
      padding: 16px;
    }
    .rollup-row { display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9; }
    .rollup-hint { font-size:0.92rem;color:#6b7280; }
    /* make history side nicer inside main history modal (keeps single modal) */
    .rollup-history-item { padding:10px;border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; }
    .rollup-history-item .meta { font-size:0.92rem;color:#6b7280; }
  `;
  document.head.appendChild(s);
}

/* ---------- small helper for timestamps ---------- */
function formatTimestamp(ts){
  if(!ts) return '';
  try{
    if(typeof ts === 'number') return new Date(ts).toLocaleString();
    if(ts instanceof Date) return ts.toLocaleString();
    // Firestore Timestamp shape
    if(ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
    if(ts._seconds) return new Date(ts._seconds * 1000).toLocaleString();
    return new Date(ts).toLocaleString();
  }catch(e){
    return '';
  }
}

/* ---------- loadExpenses (cache) ---------- */
async function loadExpenses(){
  try{
    const snap = await getDocs(query(collection(db,'expenses'), orderBy('createdAt','desc')));
    window.expensesCache = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => !e.is_deleted);
  }catch(e){
    console.error('loadExpenses failed', e);
    window.expensesCache = window.expensesCache || [];
  }
}

// call loadExpenses after initial loaders in renderPayments:
 // await Promise.all([ loadClasses && loadClasses(), loadSubjects && loadSubjects(), loadStudents && loadStudents(), loadTeachers && loadTeachers(), loadStaff && loadStaff(), loadTransactions && loadTransactions(), loadExpenses && loadExpenses() ]);

// ---------- UX: nicer overlay CSS for the modal-over-history ----------
/* add to top of the file or global styles (inline when showing the modal also works) */
const _ROLLUP_OVERLAY_CSS = `
  .rollup-overlay {
    position: absolute;
    inset: 0;
    display:flex;
    align-items:center;
    justify-content:center;
    background: rgba(7,10,20,0.45);
    z-index: 9999;
  }
  .rollup-card {
    width: 560px;
    max-width: calc(100% - 32px);
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(7,20,40,0.12);
    padding: 16px;
  }
  .rollup-row { display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9 }
  .rollup-hint { font-size:0.92rem;color:#6b7280 }
`;



// ---------- compute preview now includes expenses from expensesCache ----------
function computeMonthlyPreviewFromCaches(today = new Date()){
  const students = (studentsCache || []).slice();
  const teachers = (teachersCache || []).slice();
  const staff = (window.staffCache || []).slice();
  const expenses = (window.expensesCache || []).slice(); // use cached expenses (editable list)

  // build arrays
  const studentsToAdd = [];
  for(const s of students){
    const fee = (s.fee != null && !isNaN(Number(s.fee))) ? Number(s.fee) : 0;
    if(fee > 0) studentsToAdd.push({ id: s.id || s.studentId, name: s.fullName || s.name, feeCents: Math.round(fee*100) });
  }

  const teachersToAdd = [];
  for(const t of teachers){
    const salary = (t.salary != null && !isNaN(Number(t.salary))) ? Number(t.salary) : (t.salary_cents ? Number(t.salary_cents)/100 : 0);
    if(salary > 0) teachersToAdd.push({ id: t.id || t.teacherId, name: t.fullName || t.name, salaryCents: Math.round(salary*100) });
  }

  const staffToAdd = [];
  for(const st of staff){
    const salary = (st.salary != null && !isNaN(Number(st.salary))) ? Number(st.salary) : (st.salary_cents ? Number(st.salary_cents)/100 : 0);
    if(salary > 0) staffToAdd.push({ id: st.id || st.staffId, name: st.fullName || st.name, salaryCents: Math.round(salary*100) });
  }

  // Expenses: include editable expenses that are not deleted. If you only want recurring expenses, filter here.
  // Example: only include expenses that are not paid and not deleted (so they will be posted when confirming)
  const monthlyExpenses = (expenses || []).filter(e => !e.is_deleted && !e.is_paid).map(e => ({
    id: e.id,
    note: e.note || e.expense_name || '',
    amount: Number(e.amount_cents || 0)
  }));

  const totalStudentsAmount = studentsToAdd.reduce((s,x)=> s + (x.feeCents||0), 0);
  const totalTeachersAmount = teachersToAdd.reduce((s,x)=> s + (x.salaryCents||0), 0);
  const totalStaffAmount = staffToAdd.reduce((s,x)=> s + (x.salaryCents||0), 0);
  const totalExpensesAmount = monthlyExpenses.reduce((s,x)=> s + (x.amount||0), 0);
  const grandTotal = totalStudentsAmount + totalTeachersAmount + totalStaffAmount + totalExpensesAmount;

  return {
    studentsToAdd,
    teachersToAdd,
    staffToAdd,
    monthlyExpenses,
    totals: {
      totalStudentsAmount,
      totalTeachersAmount,
      totalStaffAmount,
      totalExpensesAmount,
      grandTotal
    }
  };
}

// ---------- global locks ----------
window._rollupInProgress = false;
window._rollupPreparing = false;

// ---------- unified handler for header button ----------
async function handleAddMonthClick(){
  const btn = document.getElementById('openAddMonthBtn');
  if(!btn) return;
  setButtonLoading(btn, true, 'Preparing…');
  try{
    // ensure caches up-to-date before opening history
    await Promise.all([
      loadStudents && loadStudents(),
      loadTeachers && loadTeachers(),
      loadStaff && loadStaff(),
      loadExpenses && loadExpenses()
    ]);
    await openMonthlyRollupsHistoryModal();
  }catch(err){
    console.error('handleAddMonthClick', err);
    toast('Failed to prepare Add month', 'error');
  }finally{
    setButtonLoading(btn, false);
  }
}
// Safe batch helper: uses writeBatch(db) if available, otherwise falls back to sequential set/update
function createSafeBatch() {
  if (typeof writeBatch === 'function') {
    try { return writeBatch(db); } catch (e) {
      console.warn('writeBatch exists but calling it failed, falling back to sequential batch', e);
    }
  }

  console.warn('writeBatch not found — using sequential fallback (non-atomic).');

  const ops = [];
  return {
    set(ref, data) { ops.push({ type: 'set', ref, data }); },
    update(ref, data) { ops.push({ type: 'update', ref, data }); },
    async commit() {
      // sequentially apply operations; throw on first failure so caller receives an exception
      for (const o of ops) {
        try {
          if (o.type === 'set') {
            // prefer setDoc for exact behavior
            await setDoc(o.ref, o.data);
          } else if (o.type === 'update') {
            await updateDoc(o.ref, o.data);
          }
        } catch (err) {
          console.error('Sequential batch op failed', o, err);
          throw err;
        }
      }
    }
  };
}
// format monthKey "YYYY-MM" -> "2026-January" (lowercase month if you prefer)
function monthKeyToDisplay(key){
  if(!key || typeof key !== 'string') return key || '';
  const m = key.split('-');
  if(m.length < 2) return key;
  const y = Number(m[0]);
  const mm = Number(m[1]) - 1;
  const monthName = new Date(y, mm).toLocaleString(undefined, { month: 'long' }); // "January"
  return `${y}-${monthName.toLowerCase()}`; // "2026-january" per your example
}




// small currency helper with $ prefix (keeps c2p formatting)
function moneyFromCents(cents){
  try{ return '$' + (Number(cents||0)/100).toFixed(2); }catch(e){ return '$0.00'; }
}

/* Safe loading UI helper (falls back if setButtonLoading isn't available) */
function safeSetButtonLoading(btn, loading, label){
  try{
    if(typeof setButtonLoading === 'function'){
      setButtonLoading(btn, loading, label);
      return;
    }
  }catch(e){
    // ignore and fallback
  }
  if(!btn) return;
  if(loading){
    btn.dataset._origDisabled = btn.disabled ? '1' : '0';
    btn._origText = btn._origText || btn.textContent;
    btn.disabled = true;
    if(label) btn.textContent = label;
    btn.classList.add('loading');
  } else {
    btn.disabled = false;
    if(typeof btn._origText !== 'undefined') btn.textContent = btn._origText;
    btn.classList.remove('loading');
    delete btn._origText;
  }
}
/* ---------- USER NAME / SUPERADMIN HELPERS (replace originals) ---------- */

function getCachedUserDisplayName(uid){
  if(!uid) return '';
  window.usersCache = window.usersCache || [];
  const u = window.usersCache.find(x =>
    String(x.id) === String(uid) ||
    String(x.uid) === String(uid) ||
    (x.email && String(x.email) === String(uid)) ||
    (x.username && String(x.username) === String(uid))
  );
  // prefer common fields
  if(u) return (u.displayName || u.name || u.fullName || u.username || u.email || uid);
  // fallback to uid so UI doesn't look empty (we will try async fetch later)
  return uid;
}

async function fetchAndCacheUserDisplayName(uid){
  if(!uid) return uid;
  window.usersCache = window.usersCache || [];
  try{
    // 1) check cache by id/uid
    const cachedIdx = window.usersCache.findIndex(x => String(x.id) === String(uid) || String(x.uid) === String(uid));
    if(cachedIdx >= 0){
      const u = window.usersCache[cachedIdx];
      return (u.displayName || u.name || u.fullName || u.username || u.email || uid);
    }

    // 2) try reading superadmin doc (common in your setup)
    try {
      const sSnap = await getDoc(doc(db,'admin', String(uid)));
      if(sSnap && sSnap.exists()){
        const data = { id: sSnap.id, ...sSnap.data() };
        window.usersCache.push(data);
        return (data.name || data.displayName || data.email || uid);
      }
    }catch(e){ /* ignore */ }

    // 3) try users collection doc by id
    try {
      const uSnap = await getDoc(doc(db,'admin', String(uid)));
      if(uSnap && uSnap.exists()){
        const data = { id: uSnap.id, ...uSnap.data() };
        window.usersCache.push(data);
        return (data.displayName || data.fullName || data.name || data.username || data.email || uid);
      }
    }catch(e){ /* ignore */ }

    // 4) try querying superadmin by email (if uid looks like email)
    if(/\@/.test(String(uid))){
      try{
        const q = query(collection(db,'admin'), where('email','==', String(uid)));
        const snaps = await getDocs(q);
        if(snaps && snaps.docs && snaps.docs.length){
          const d = snaps.docs[0];
          const data = { id: d.id, ...d.data() };
          window.usersCache.push(data);
          return (data.name || data.displayName || data.email || uid);
        }
      }catch(e){ /* ignore */ }
    }

    // 5) fallback: query users by common fields
    const tryFields = [
      ['uid','==', uid],
      ['id','==', uid],
      ['email','==', uid],
      ['username','==', uid]
    ];
    for(const [field,op,val] of tryFields){
      try{
        if(typeof where !== 'function') break;
        const q = query(collection(db,'admin'), where(field, op, val));
        const snaps = await getDocs(q);
        if(snaps && snaps.docs && snaps.docs.length){
          const d = snaps.docs[0];
          const data = { id: d.id, ...d.data() };
          window.usersCache.push(data);
          return (data.displayName || data.fullName || data.name || data.username || data.email || uid);
        }
      }catch(e){ /* continue */ }
    }

  }catch(e){
    console.warn('fetchAndCacheUserDisplayName failed', e);
  }
  return uid;
}

/* Non-blocking cached check (keeps existing call sites working).
   Returns true if cached evidence indicates superadmin. */
function isSuperAdminUser(){
  try{
    if(currentUser && (currentUser.isSuperAdmin || currentUser.is_superadmin || currentUser.role === 'superadmin' || (Array.isArray(currentUser.roles) && currentUser.roles.includes('superadmin')))) return true;
    const uid = currentUser?.uid || currentUser?.id || null;
    if(!uid) return false;
    const uc = (window.usersCache || []).find(u =>
      String(u.id) === String(uid) ||
      String(u.uid) === String(uid) ||
      (u.email && String(u.email) === String(currentUser?.email || ''))
    );
    if(uc && (uc.role === 'superadmin' || uc.isSuperAdmin || uc.role === 'admin' && uc.isAdmin || uc.isAdmin === true)) return true;
    if(Array.isArray(window.SUPERADMIN_UIDS) && window.SUPERADMIN_UIDS.map(x=>String(x)).includes(String(uid))) return true;
    return false;
  }catch(e){ return false; }
}

/* Blocking, accurate superadmin check that will fetch/ensure cache */
async function isSuperAdminUserAsync(){
  try{
    const uid = currentUser?.uid || currentUser?.id || null;
    if(!uid) return false;
    // check currentUser raw fields first
    if(currentUser && (currentUser.isSuperAdmin || currentUser.is_superadmin || currentUser.role === 'superadmin' || (Array.isArray(currentUser.roles) && currentUser.roles.includes('superadmin')))) return true;

    // Check cached entry
    const uc = (window.usersCache || []).find(u => String(u.id) === String(uid) || String(u.uid) === String(uid) || (u.email && String(u.email) === String(currentUser?.email||'')));
    if(uc && (uc.role === 'superadmin' || uc.isSuperAdmin || uc.isAdmin || (uc.role==='admin' && uc.isAdmin))) return true;

    // Try to fetch superadmin doc by uid
    try{
      const sSnap = await getDoc(doc(db,'admin', String(uid)));
      if(sSnap && sSnap.exists()){
        const data = { id: sSnap.id, ...sSnap.data() };
        // cache it
        window.usersCache = window.usersCache || [];
        const idx = window.usersCache.findIndex(x=>String(x.id)===String(uid) || String(x.uid)===String(uid));
        if(idx>=0) window.usersCache[idx] = Object.assign({}, window.usersCache[idx], data); else window.usersCache.push(data);
        return true;
      }
    }catch(e){ /* ignore */ }

    // try query superadmin by email
    if(currentUser?.email){
      try{
        const q = query(collection(db,'admin'), where('email','==', currentUser.email));
        const snaps = await getDocs(q);
        if(snaps && snaps.docs && snaps.docs.length){
          const d = snaps.docs[0];
          const data = { id: d.id, ...d.data() };
          window.usersCache = window.usersCache || [];
          window.usersCache.push(data);
          return true;
        }
      }catch(e){ /* ignore */ }
    }

    // fallback: load user doc (if present) and check role
    try{
      const uSnap = await getDoc(doc(db,'admin', String(uid)));
      if(uSnap && uSnap.exists()){
        const data = { id: uSnap.id, ...uSnap.data() };
        window.usersCache = window.usersCache || [];
        const idx2 = window.usersCache.findIndex(x=>String(x.id)===String(uid) || String(x.uid)===String(uid));
        if(idx2>=0) window.usersCache[idx2] = Object.assign({}, window.usersCache[idx2], data); else window.usersCache.push(data);
        if(data.role === 'superadmin' || data.isSuperAdmin || data.isAdmin) return true;
      }
    }catch(e){ /* ignore */ }

    // final: check updated cache
    const final = (window.usersCache || []).find(u => String(u.id) === String(uid) || String(u.uid) === String(uid));
    if(final && (final.role === 'superadmin' || final.isSuperAdmin || final.isAdmin)) return true;

    // optional override
    if(Array.isArray(window.SUPERADMIN_UIDS) && window.SUPERADMIN_UIDS.map(x=>String(x)).includes(String(uid))) return true;

    return false;
  }catch(e){
    return false;
  }
}

/* ---------- UPDATED: openMonthlyRollupsHistoryModal (replace existing function) ---------- */

// ---- Constants for pagination / config ----
const ROLLUP_PAGE_SIZE = 25; // adjust as needed for Spark safety (25 is reasonable)

// helper to fetch a page of rollups (non-deleted)
async function fetchRollupsPage(opts = {}) {
  // opts: { pageSize, startAfterDoc, monthKeyExact, creatorExact }
  const pageSize = opts.pageSize || ROLLUP_PAGE_SIZE;
  let q;
  if (opts.monthKeyExact) {
    // targeted short read for a specific monthKey
    q = query(collection(db,'monthly_rollups'), where('monthKey','==', opts.monthKeyExact), orderBy('createdAt','desc'), limit(pageSize));
  } else {
    q = query(collection(db,'monthly_rollups'), orderBy('createdAt','desc'), limit(pageSize));
  }

  if (opts.startAfterDoc) {
    q = query(collection(db,'monthly_rollups'), orderBy('createdAt','desc'), startAfter(opts.startAfterDoc), limit(pageSize));
  }

  const snaps = await getDocs(q);
  const docs = snaps.docs.map(d => ({ id: d.id, _ref: d.ref, _snap: d, ...d.data() }));
  return { docs, lastDoc: snaps.docs[snaps.docs.length-1] || null };
}

// ---- Updated modal with pagination + client search ----
async function openMonthlyRollupsHistoryModal(){
  try{
    const uid = currentUser?.uid || currentUser?.id || null;
    let currentUserName = (currentUser && (currentUser.displayName || currentUser.name || currentUser.fullName)) || '';
    if(uid && !currentUserName){
      try { currentUserName = await fetchAndCacheUserDisplayName(uid) || (currentUser?.email || uid); } catch(e){ currentUserName = currentUserName || (currentUser?.email || uid); }
    }

    const isSuper = await isSuperAdminUserAsync();
    let userRole = '';
    if(currentUser && currentUser.role) userRole = currentUser.role;
    else if(isSuper) userRole = 'superadmin';
    else {
      const uc = (window.usersCache || []).find(u => String(u.id) === String(uid) || String(u.uid) === String(uid));
      if(uc && uc.role) userRole = uc.role;
    }

    const loginInfoHtml = `<div style="font-size:0.9rem;color:#374151">Logged in: <strong>${escapeHtml(currentUserName || (uid||''))}</strong>${userRole ? ` • <span style="color:#0b74de">${escapeHtml(userRole)}</span>` : ''}</div>`;
    const today = new Date();
    const betweenAllowedDays = today.getDate() >= 1 && today.getDate() <= 15;
    const addBtnLabel = (isSuper ? 'Add month (admin)' : 'Add month');

    // render initial modal skeleton (list area empty for now)
    const modalHtml = `
      <div style="max-width:920px;position:relative">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;gap:12px">
          <div style="min-width:0">
            <div style="font-weight:900">Monthly rollup history</div>
            ${loginInfoHtml}
            <div style="margin-top:8px">
              <input id="rollupHistorySearch" placeholder="Search month (e.g. january/2026) or creator name" style="width:100%;padding:8px;margin-top:6px" />
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            <div><button id="historyAddMonthBtn" class="btn ${isSuper ? 'btn-primary' : 'btn-ghost'}" ${(!betweenAllowedDays && !isSuper) ? 'disabled' : ''}>${escapeHtml(addBtnLabel)}</button></div>
            <div style="font-size:0.85rem;color:#6b7280;text-align:right">${betweenAllowedDays ? 'Allowed 1–15' : (isSuper ? 'Superadmin override allowed' : 'Allowed only 1–15')}</div>
          </div>
        </div>
        <div id="rollupHistoryList" style="max-height:66vh;overflow:auto;padding-right:6px"></div>
        <div style="text-align:center;margin-top:8px"><button id="rollupLoadMore" class="btn btn-ghost">Load more</button></div>
      </div>
    `;
    showModal('Monthly rollup history', modalHtml);

    // internal state for pagination
    let lastDoc = null;
    let allLoadedDocs = []; // in-memory (page-by-page)
    let finished = false;

    // function to render rows into #rollupHistoryList from allLoadedDocs
    function renderLoadedRows() {
      const list = modalBody.querySelector('#rollupHistoryList');
      if(!list) return;
      const rowsHtml = allLoadedDocs.map(r => {
        const dt = r.createdAt ? (r.createdAt.seconds ? new Date(r.createdAt.seconds*1000) : new Date(r.createdAt)) : new Date();
        const monthKey = r.monthKey || r.id || getMonthKeyForDate(dt);
        const monthLabel = monthKeyToDisplay(monthKey);
        const creatorPlaceholder = r.createdByName || getCachedUserDisplayName(r.createdBy) || (r.createdBy || '');
        const displayTotal = moneyFromCents((r.totals && (r.totals.grand || r.totals.grandTotal)) || 0);
        const inlineBtns = `
          <div style="display:flex;gap:6px;justify-content:flex-end;align-items:center">
            <button class="btn btn-ghost view-rollup" data-id="${escapeHtml(r.id)}" title="View">View</button>
            ${isSuper ? `<button class="btn btn-ghost edit-rollup" data-id="${escapeHtml(r.id)}" title="Edit">${typeof svgEdit === 'function' ? svgEdit() : '✏️'}</button>` : ''}
            ${isSuper ? `<button class="btn btn-danger del-rollup" data-id="${escapeHtml(r.id)}" title="Delete">${typeof svgDelete === 'function' ? svgDelete() : '🗑'}</button>` : ''}
          </div>`;
        return `<div class="rollup-history-item" data-id="${escapeHtml(r.id)}" data-created-by="${escapeHtml(r.createdBy||'')}" data-month="${escapeHtml(monthLabel.toLowerCase())}" data-creator="${escapeHtml((r.createdByName||creatorPlaceholder).toLowerCase())}" style="padding:10px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">
          <div style="min-width:0;max-width:72%">
            <div style="font-weight:800">${escapeHtml(monthLabel)}</div>
            <div style="font-size:0.92rem;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              By: <span class="rollup-creator">${escapeHtml(r.createdByName || creatorPlaceholder)}</span>
              • ${escapeHtml(dt.toLocaleString())}
            </div>
          </div>
          <div style="text-align:right;min-width:200px">
            <div style="font-weight:900">${escapeHtml(displayTotal)}</div>
            <div style="margin-top:8px">${inlineBtns}</div>
          </div>
        </div>`;
      }).join('') || `<div class="muted">No monthly rollups found.</div>`;
      list.innerHTML = rowsHtml;
    }

    // load first page
    async function loadNextPage() {
      if (finished) return;
      try {
        const res = await fetchRollupsPage({ pageSize: ROLLUP_PAGE_SIZE, startAfterDoc: lastDoc });
        // filter out any is_deleted on client side (should be few)
        const docs = (res.docs || []).filter(d => !d.is_deleted);
        if (docs.length === 0 && !res.lastDoc) finished = true;
        allLoadedDocs = allLoadedDocs.concat(docs);
        lastDoc = res.lastDoc;
        if (!res.lastDoc || docs.length < ROLLUP_PAGE_SIZE) finished = true;
        renderLoadedRows();
        // wire controls after rendering
        wireRowButtons();
      } catch (err) {
        console.error('loadNextPage failed', err);
        toast('Failed to load history page', 'error');
      }
    }

    // wire Load more button
    const loadMoreBtn = modalBody.querySelector('#rollupLoadMore');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', async () => {
      safeSetButtonLoading(loadMoreBtn, true, 'Loading…');
      await loadNextPage();
      safeSetButtonLoading(loadMoreBtn, false);
      if (finished) loadMoreBtn.style.display = 'none';
    });

    // initial page load
    await loadNextPage();

    // client-side search (filters currently loaded pages)
    const searchEl = modalBody.querySelector('#rollupHistorySearch');
    if(searchEl){
      searchEl.addEventListener('input', () => {
        const q = String(searchEl.value || '').trim().toLowerCase();
        modalBody.querySelectorAll('.rollup-history-item').forEach(item => {
          const month = item.dataset.month || '';
          const creator = item.dataset.creator || '';
          const combined = (month + ' ' + creator);
          item.style.display = (!q || combined.indexOf(q) !== -1) ? '' : 'none';
        });
      });
    }

    // helper to wire view/edit/delete on rows after each render
    function wireRowButtons() {
      modalBody.querySelectorAll('.view-rollup').forEach(b => b.onclick = async (ev) => {
        try{
          const id = ev.currentTarget.dataset.id;
          const snap2 = await getDoc(doc(db,'monthly_rollups', id));
          if(!snap2.exists()){ toast('Rollup not found'); return; }
          const r = { id: snap2.id, ...snap2.data() };
          const createdAt = r.createdAt ? (r.createdAt.seconds ? new Date(r.createdAt.seconds * 1000) : new Date(r.createdAt)) : new Date();
          const monthLabel = monthKeyToDisplay(r.monthKey || r.id || getMonthKeyForDate(createdAt));
          const createCreatorName = r.createdByName || getCachedUserDisplayName(r.createdBy) || (r.createdBy || '');
    
          const studentsHtml = (r.items && r.items.students && r.items.students.length) ? r.items.students.map(s => {
            return `<div>${escapeHtml(s.name||s.id)} <span class="muted">(${escapeHtml(String(s.id||''))})</span> — ${moneyFromCents(s.amount_cents||s.amount||0)}${s.txId?` <small class="muted">tx:${escapeHtml(String(s.txId))}</small>`:''}</div>`;
          }).join('') : '<div class="muted">None</div>';
    
          const teachersHtml = (r.items && r.items.teachers && r.items.teachers.length) ? r.items.teachers.map(x => {
            return `<div>${escapeHtml(x.name||x.id)} <span class="muted">(${escapeHtml(String(x.id||''))})</span> — ${moneyFromCents(x.amount_cents||x.amount||0)}${x.txId?` <small class="muted">tx:${escapeHtml(String(x.txId))}</small>`:''}</div>`;
          }).join('') : '<div class="muted">None</div>';
    
          const staffHtml = (r.items && r.items.staff && r.items.staff.length) ? r.items.staff.map(x => {
            return `<div>${escapeHtml(x.name||x.id)} <span class="muted">(${escapeHtml(String(x.id||''))})</span> — ${moneyFromCents(x.amount_cents||x.amount||0)}${x.txId?` <small class="muted">tx:${escapeHtml(String(x.txId))}</small>`:''}</div>`;
          }).join('') : '<div class="muted">None</div>';
    
          const expensesHtml = (r.items && r.items.expenses && r.items.expenses.length) ? r.items.expenses.map(x => {
            return `<div>${escapeHtml(x.note||x.title||'Expense')} — ${moneyFromCents(x.amount_cents||x.amount||0)}${x.txId?` <small class="muted">tx:${escapeHtml(String(x.txId))}</small>`:''}</div>`;
          }).join('') : '<div class="muted">None</div>';
    
          // detail overlay
          if(!document.getElementById('rollupDetailStyle')){
            const st = document.createElement('style');
            st.id = 'rollupDetailStyle';
            st.textContent = `
              .rollup-detail-overlay { position: fixed; inset: 0; display:flex; align-items:center; justify-content:center; z-index: 100500; pointer-events: auto; background: rgba(0,0,0,0.25); }
              .rollup-detail-card { width: 760px; max-width: calc(100% - 32px); max-height: calc(100vh - 64px); overflow:auto; background:#fff; border-radius:10px; padding:16px; box-shadow: 0 18px 60px rgba(0,0,0,0.25); }
            `;
            document.head.appendChild(st);
          }
    
          const overlay = document.createElement('div');
          overlay.className = 'rollup-detail-overlay';
          overlay.innerHTML = `
            <div class="rollup-detail-card" role="dialog" aria-modal="true">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                  <div style="font-weight:900">${escapeHtml(monthLabel)}</div>
                  <div style="font-size:0.92rem;color:#6b7280">By: ${escapeHtml(createCreatorName||r.createdBy||'')} • ${escapeHtml(createdAt.toLocaleString())}</div>
                </div>
                <div>
                  <button class="btn btn-ghost close-detail">Close</button>
                </div>
              </div>
              <div style="margin-top:12px;max-height:60vh;overflow:auto">
                <div style="margin-top:12px"><strong>Students</strong>${studentsHtml}</div>
                <div style="margin-top:8px"><strong>Teachers</strong>${teachersHtml}</div>
                <div style="margin-top:8px"><strong>Staff</strong>${staffHtml}</div>
                <div style="margin-top:8px"><strong>Expenses</strong>${expensesHtml}</div>
                <div style="margin-top:12px"><strong>Totals</strong><div style="font-weight:900;margin-top:6px">${moneyFromCents((r.totals && (r.totals.grand || r.totals.grandTotal))||0)}</div></div>
              </div>
            </div>
          `;
          document.body.appendChild(overlay);
          overlay.querySelector('.close-detail').addEventListener('click', ()=>{ try{ overlay.remove(); }catch{} });
          overlay.addEventListener('click', (evt) => { if(evt.target === overlay) try{ overlay.remove(); }catch{} });
           // attempt async replace of creator name if needed
      (async () => {
        if(r.createdBy && (!createCreatorName || createCreatorName === r.createdBy || (createCreatorName.indexOf(' ')===-1 && createCreatorName.length>=6))){
          const fetched = await fetchAndCacheUserDisplayName(r.createdBy);
          const el = overlay.querySelector('div[style*="font-size:0.92rem"]');
          if(el) el.innerHTML = `By: ${escapeHtml(fetched||r.createdBy||'')} • ${escapeHtml(createdAt.toLocaleString())}`;
        }
      })();
          showRollupDetailBySnapshot(r); // <-- implement or copy your overlay code here
        }catch(err){
          console.error('view-rollup handler failed', err);
          toast('Failed to open rollup details', 'error');
        }
      });

      modalBody.querySelectorAll('.edit-rollup').forEach(b => b.onclick = async (ev) => {
        const id = ev.currentTarget.dataset.id;
        if(!id) return;
        if(!await isSuperAdminUserAsync()) return toast('Edit allowed for superadmin only','error');
        const snap2 = await getDoc(doc(db,'monthly_rollups', id));
        if(!snap2.exists()) return toast('Rollup not found');
        const r = { id: snap2.id, ...snap2.data() };
        const newCreatorName = prompt('Edit creator name (display only):', r.createdByName || '');
        if(newCreatorName === null) return;
        try{
          await updateDoc(doc(db,'monthly_rollups', id), { createdByName: newCreatorName, updatedAt: Timestamp.now(), updatedBy: currentUser?.uid || 'system' });
          toast('Rollup updated','success');
          const row = modalBody.querySelector(`.rollup-history-item[data-id="${id}"]`);
          if(row) row.querySelector('.rollup-creator').textContent = newCreatorName;
        }catch(err){ console.error(err); toast('Failed to update rollup','error'); }
      });

      modalBody.querySelectorAll('.del-rollup').forEach(b => b.onclick = async (ev) => {
        const id = ev.currentTarget.dataset.id;
        if(!id) return;
        if(!await isSuperAdminUserAsync()) return toast('Delete allowed for superadmin only','error');
        if(!confirm('Delete this monthly rollup and REVERT posted transactions (best-effort). Continue?')) return;

        try{
          const rSnap = await getDoc(doc(db,'monthly_rollups', id));
          if(!rSnap.exists()) return toast('Rollup not found','error');
          const r = { id: rSnap.id, ...rSnap.data() };
          const batch = createSafeBatch();

          // Prefer exact txId references stored in the rollup items
          const allItemTxs = [
            ...(r.items?.students || []).map(x => ({ txId: x.txId, target_type: 'student', target_id: x.id, amount: Number(x.amount_cents||x.amount||0) })),
            ...(r.items?.teachers || []).map(x => ({ txId: x.txId, target_type: 'teacher', target_id: x.id, amount: Number(x.amount_cents||x.amount||0) })),
            ...(r.items?.staff || []).map(x => ({ txId: x.txId, target_type: 'staff', target_id: x.id, amount: Number(x.amount_cents||x.amount||0) })),
            ...(r.items?.expenses || []).map(x => ({ txId: x.txId, target_type: 'expense', target_id: x.txId || x.id, amount: Number(x.amount_cents||x.amount||0) }))
          ].filter(x => x.txId);

          for(const t of allItemTxs){
            const amt = Number(t.amount || 0);
            try{
              if(t.target_type && t.target_id){
                if(t.target_type === 'student' || String(t.target_type).toLowerCase().includes('student')){
                  const ref = doc(db,'students', String(t.target_id));
                  const prev = Number(window.studentsCache?.find(x=>String(x.id)===String(t.target_id))?.balance_cents || 0);
                  batch.update(ref, { balance_cents: Math.max(0, prev - amt) });
                } else if(t.target_type === 'teacher' || String(t.target_type).toLowerCase().includes('teacher')){
                  const ref = doc(db,'teachers', String(t.target_id));
                  const prev = Number(window.teachersCache?.find(x=>String(x.id)===String(t.target_id))?.balance_cents || 0);
                  batch.update(ref, { balance_cents: Math.max(0, prev - amt) });
                } else if(t.target_type === 'staff' || String(t.target_type).toLowerCase().includes('staff')){
                  const ref = doc(db,'staff', String(t.target_id));
                  const prev = Number(window.staffCache?.find(x=>String(x.id)===String(t.target_id))?.balance_cents || 0);
                  batch.update(ref, { balance_cents: Math.max(0, prev - amt) });
                } else if(t.target_type === 'expense' || String(t.target_type).toLowerCase().includes('expense')){
                  const ref = doc(db,'expenses', String(t.target_id));
                  const prevRem = Number(window.expensesCache?.find(x=>String(x.id)===String(t.target_id))?.remaining_cents || 0);
                  batch.update(ref, { remaining_cents: Math.max(0, prevRem + amt) });
                }
              }
            }catch(e){ /* non-fatal */ }

            const txRef = doc(db,'transactions', String(t.txId));
            if(typeof batch.update === 'function'){
              batch.update(txRef, { is_deleted: true, deletedAt: Timestamp.now(), deletedBy: currentUser?.uid || 'system' });
            } else {
              batch.set(txRef, Object.assign({}, t, { is_deleted:true }));
            }
          }

          // mark rollup doc as deleted (don't physically delete to preserve history)
          const rollupRef = doc(db,'monthly_rollups', String(id));
          if(typeof batch.update === 'function'){
            batch.update(rollupRef, { is_deleted: true, deletedAt: Timestamp.now(), deletedBy: currentUser?.uid || 'system' });
          } else {
            batch.set(rollupRef, Object.assign({}, r, { is_deleted: true }));
          }

          await batch.commit();
          toast('Rollup deleted and transactions reverted (best-effort)', 'success');

          // remove from DOM
          const row = modalBody.querySelector(`.rollup-history-item[data-id="${id}"]`);
          if(row) row.remove();
          // refresh caches as background
          await Promise.all([ loadStudents && loadStudents(), loadTeachers && loadTeachers(), loadStaff && loadStaff(), loadExpenses && loadExpenses(), loadTransactions && loadTransactions() ]);
        }catch(err){
          console.error('Failed to delete rollup', err);
          toast('Failed to delete rollup', 'error');
        }
      });
    } // end wireRowButtons

    // Re-usable function to show confirmation overlay & create rollup (uses addDoc auto-id)
    async function openAndConfirmAddMonth() {
      const addBtn = modalBody.querySelector('#historyAddMonthBtn');
      if (!addBtn) return;
      if (window._rollupPreparing) return;
      window._rollupPreparing = true;
      safeSetButtonLoading(addBtn, true, 'Preparing preview…');

      let overlay = null;
      try {
        await Promise.all([ loadStudents && loadStudents(), loadTeachers && loadTeachers(), loadStaff && loadStaff(), loadExpenses && loadExpenses() ]);
        const preview = computeMonthlyPreviewFromCaches();
        const t = preview.totals;
        const monthKey = getMonthKeyForDate(new Date());
        const betweenAllowedDaysNow = (new Date()).getDate() >= 1 && (new Date()).getDate() <= 15;
        const canRun = betweenAllowedDaysNow || await isSuperAdminUserAsync();

        overlay = document.createElement('div');
        overlay.className = 'rollup-overlay';
        overlay.innerHTML = `
          <div class="rollup-card" role="dialog" aria-modal="true">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div style="font-weight:900">Add monthly rollup — ${escapeHtml(monthKey)}</div>
              <div style="font-size:0.92rem;color:#6b7280">Run date: ${escapeHtml(new Date().toLocaleString())}</div>
            </div>
            <div style="margin-top:12px">
              <div class="rollup-row"><div>Students</div><div>${preview.studentsToAdd.length} • ${c2p(t.totalStudentsAmount)}</div></div>
              <div class="rollup-row"><div>Teachers</div><div>${preview.teachersToAdd.length} • ${c2p(t.totalTeachersAmount)}</div></div>
              <div class="rollup-row"><div>Staff</div><div>${preview.staffToAdd.length} • ${c2p(t.totalStaffAmount)}</div></div>
              <div class="rollup-row"><div>Expenses</div><div>${(preview.monthlyExpenses||[]).length} • ${c2p(t.totalExpensesAmount)}</div></div>
              <div class="rollup-row" style="font-weight:900;color:#0b74de"><div>Grand total</div><div>${c2p(t.grandTotal)}</div></div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
              <div style="font-size:0.92rem;color:#6b7280">Confirm will create history and post transactions. Allowed once/month (days 1–15). Superadmin can re-run.</div>
              <div style="display:flex;gap:8px">
                <button id="rollupCancel" class="btn btn-ghost">Close</button>
                <button id="rollupConfirm" class="btn btn-primary">Confirm & Add</button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(overlay);
        const cancelBtn = overlay.querySelector('#rollupCancel');
        const confirmBtn = overlay.querySelector('#rollupConfirm');
        if (cancelBtn) cancelBtn.addEventListener('click', () => { try{ overlay.remove(); }catch{} });

        confirmBtn.addEventListener('click', async function onConfirmClick(e) {
          const canRunNow = betweenAllowedDaysNow || await isSuperAdminUserAsync();
          if (!canRunNow) {
            const proceed = confirm('Today is outside allowed days (1–15). Do you want to FORCE run the rollup anyway? This will post transactions now.');
            if(!proceed){ toast('Cancelled — rollup not posted (outside allowed window).','info'); return; }
          }
          if (window._rollupInProgress) { toast('Rollup already in progress','info'); return; }
          window._rollupInProgress = true;
          safeSetButtonLoading(confirmBtn, true, 'Posting…');

          try {
            // Check for existing monthKey (single read), prevent duplicate for non-superadmin
            const existingQ = query(collection(db,'monthly_rollups'), where('monthKey','==', monthKey), limit(1));
            const existingSnap = await getDocs(existingQ);
            if (!isSuper && existingSnap && existingSnap.docs && existingSnap.docs.length) {
              toast('Already added for this month — only superadmin can re-run.', 'error');
              safeSetButtonLoading(confirmBtn, false);
              window._rollupInProgress = false;
              return;
            }

            // Build batch but use an auto-id rollup doc ref (so we don't overwrite)
            const batch = createSafeBatch();
            const createdAt = Timestamp.now();
            const items = { students: [], teachers: [], staff: [], expenses: [] };

            // students
            for (const s of preview.studentsToAdd) {
              const studRef = doc(db, 'students', String(s.id));
              const local = (studentsCache || []).find(x => String(x.id) === String(s.id));
              const prevBal = Number(local?.balance_cents || 0);
              const newBal = prevBal + (s.feeCents || 0);
              batch.update(studRef, { balance_cents: newBal });

              const txRef = doc(collection(db, 'transactions')); // auto-id tx
              batch.set(txRef, {
                id: txRef.id,
                target_type: 'student_fee',
                target_id: s.id,
                amount_cents: s.feeCents || 0,
                createdAt,
                createdBy: currentUser?.uid || 'system',
                note: `Monthly fee (${monthKey})`,
                related_months: [monthKey]
              });
              items.students.push({ id: s.id, name: s.name, amount_cents: s.feeCents || 0, txId: txRef.id });
            }

            // teachers
            for (const tItem of preview.teachersToAdd) {
              const tref = doc(db, 'teachers', String(tItem.id));
              const local = (teachersCache || []).find(x => String(x.id) === String(tItem.id));
              const prevBal = Number(local?.balance_cents || 0);
              const newBal = prevBal + (tItem.salaryCents || 0);
              batch.update(tref, { balance_cents: newBal });

              const txRef = doc(collection(db, 'transactions'));
              batch.set(txRef, {
                id: txRef.id,
                target_type: 'salary_credit',
                target_id: tItem.id,
                amount_cents: tItem.salaryCents || 0,
                createdAt,
                createdBy: currentUser?.uid || 'system',
                note: `Monthly salary credit (${monthKey})`,
                related_months: [monthKey]
              });
              items.teachers.push({ id: tItem.id, name: tItem.name, amount_cents: tItem.salaryCents || 0, txId: txRef.id });
            }

            // staff
            for (const st of preview.staffToAdd) {
              const stRef = doc(db, 'staff', String(st.id));
              const local = (staffCache || []).find(x => String(x.id) === String(st.id));
              const prevBal = Number(local?.balance_cents || 0);
              const newBal = prevBal + (st.salaryCents || 0);
              batch.update(stRef, { balance_cents: newBal });

              const txRef = doc(collection(db, 'transactions'));
              batch.set(txRef, {
                id: txRef.id,
                target_type: 'salary_credit',
                target_id: st.id,
                amount_cents: st.salaryCents || 0,
                createdAt,
                createdBy: currentUser?.uid || 'system',
                note: `Monthly staff salary credit (${monthKey})`,
                related_months: [monthKey]
              });
              items.staff.push({ id: st.id, name: st.name, amount_cents: st.salaryCents || 0, txId: txRef.id });
            }

            // expenses
            for (const ex of preview.monthlyExpenses || []) {
              const txRef = doc(collection(db, 'transactions'));
              batch.set(txRef, {
                id: txRef.id,
                target_type: 'expense',
                amount_cents: ex.amount || 0,
                createdAt,
                createdBy: currentUser?.uid || 'system',
                note: ex.note || `Monthly expense (${monthKey})`,
                related_months: [monthKey]
              });
              items.expenses.push({ note: ex.note || '', amount_cents: ex.amount || 0, txId: txRef.id });
            }

            // rollup history doc - use auto-id (don't use monthKey as doc id)
            const rollupRef2 = doc(collection(db, 'monthly_rollups')); // auto generated id
            batch.set(rollupRef2, {
              id: rollupRef2.id,
              monthKey,
              monthLabel: monthKey,
              createdAt,
              createdBy: currentUser?.uid || 'system',
              createdByName: (currentUser && (currentUser.displayName || currentUser.name)) || (await fetchAndCacheUserDisplayName(currentUser?.uid || '')) || currentUser?.email || (currentUser?.uid || 'system'),
              counts: {
                students: preview.studentsToAdd.length,
                teachers: preview.teachersToAdd.length,
                staff: preview.staffToAdd.length,
                expenses: (preview.monthlyExpenses || []).length
              },
              totals: {
                students: preview.totals.totalStudentsAmount,
                teachers: preview.totals.totalTeachersAmount,
                staff: preview.totals.totalStaffAmount,
                expenses: preview.totals.totalExpensesAmount,
                grand: preview.totals.grandTotal
              },
              items
            });

            await batch.commit();
            toast('Monthly rollup applied — history recorded', 'success');

            // refresh caches & UI
            await Promise.all([ loadStudents && loadStudents(), loadTeachers && loadTeachers(), loadStaff && loadStaff(), loadExpenses && loadExpenses(), loadTransactions && loadTransactions() ]);

            try{ overlay.remove(); }catch(e){}
            // After success, reload the modal's first page so new item appears
            allLoadedDocs = []; lastDoc = null; finished = false;
            await loadNextPage(); // will render the newest first page including the newly added doc
          } catch (err) {
            console.error('rollup commit failed', err);
            toast('Failed to apply monthly rollup', 'error');
          } finally {
            safeSetButtonLoading(confirmBtn, false);
            window._rollupInProgress = false;
          }
        });
      } catch(err){
        console.error('prepare preview failed', err);
        toast('Failed to prepare preview', 'error');
        if(overlay) try{ overlay.remove(); }catch(e){}
      } finally {
        safeSetButtonLoading(addBtn, false);
        window._rollupPreparing = false;
      }
    } // end openAndConfirmAddMonth

    // wire add button
    const addBtn = modalBody.querySelector('#historyAddMonthBtn');
    if (addBtn) addBtn.addEventListener('click', openAndConfirmAddMonth);

  }catch(e){
    console.error('openMonthlyRollupsHistoryModal', e);
    toast('Failed to load rollup history', 'error');
  }
}



/* ---------- renderPaymentsList (mobile-first) ---------- */
async function renderPaymentsList(view = 'students'){
  // ensure caches used by this view are loaded (including expenses)
  await Promise.all([
    loadClasses && loadClasses(),
    loadSubjects && loadSubjects(),
    loadStudents && loadStudents(),
    loadTeachers && loadTeachers(),
    loadStaff && loadStaff(),
    loadTransactions && loadTransactions(),
    loadExpenses && loadExpenses()
  ]);

  const listRoot = document.getElementById('paymentsList');
  if(!listRoot) return;

  const rawQ = (document.getElementById('paymentsSearch') && document.getElementById('paymentsSearch').value || '').trim();
  const q = rawQ.toLowerCase();
  const classFilter = (document.getElementById('paymentsClassFilter') && document.getElementById('paymentsClassFilter').value) || '';
  const statusFilter = (document.getElementById('paymentsStatusFilter') && document.getElementById('paymentsStatusFilter').value) || 'all';
  const subjectFilter = (document.getElementById('paymentsTeacherSubjectFilter') && document.getElementById('paymentsTeacherSubjectFilter').value) || '';

  function matchesClassFilter(item, val){
    if(!val) return true;
    const cf = String(val);
    const itemClassIds = [ item.classId, item.class, item.className, item.class_id, (item.record && item.record.classId) ].filter(Boolean).map(x => String(x));
    if(itemClassIds.includes(cf)) return true;
    const found = (classesCache||[]).find(c => String(c.id) === cf || String(c.name) === cf || String(c.displayName||'') === cf);
    if(found) return itemClassIds.includes(String(found.id)) || itemClassIds.includes(String(found.name));
    return itemClassIds.some(x => x.toLowerCase() === cf.toLowerCase());
  }
  /* ---------- STUDENTS ---------- */
  if(view === 'students'){
    let list = (studentsCache || []).slice();
    if(classFilter) list = list.filter(s => matchesClassFilter(s, classFilter));
    if(rawQ) list = list.filter(s => matchesSearchTerm(s, rawQ));
    list = list.filter(s => {
      const balance = Number(s.balance_cents || 0);
      const fee = (s.fee != null && !isNaN(Number(s.fee))) ? Number(s.fee) : 0;
      if(statusFilter === 'free') return fee === 0;
      if(statusFilter === 'paid') return fee > 0 && balance === 0;
      if(statusFilter === 'unpaid') return balance > 0;
      return true;
    });

    list.sort((a,b) => (b.balance_cents||0) - (a.balance_cents||0));

    // totals (unchanged)
    let totalAssignedCents = 0, totalBalanceCents = 0, totalPaidThisMonthCents = 0;
    list.forEach(s => {
      const assigned = (s.fee != null && !isNaN(Number(s.fee))) ? Math.round(Number(s.fee)*100) : 0;
      totalAssignedCents += assigned;
      totalBalanceCents += Number(s.balance_cents || 0);
      totalPaidThisMonthCents += getPaidThisMonthForTarget('student', s);
    });

    if(isMobileViewport()){
      // Mobile two-line cards per user's spec
      let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
        <strong>Students — ${list.length}</strong>
        <div class="muted" style="font-size:0.8rem">Tap "more" for actions</div>
      </div><div style="display:flex;flex-direction:column;gap:0.5rem">`;

      list.forEach((s, idx) => {
        const idFull = String(s.studentId||s.id||'');
        const idMobile = mobileIdDisplay(idFull, { forceFullOnMobile: true });
        const balanceDisplay = c2p(s.balance_cents || 0);
        const className = resolveClassName(s) || '—';

        html += `
        <div class="card" style="padding:0.5rem;display:flex;flex-direction:column;gap:0.35rem">
          <!-- Line 1: No | Name (single-line) | Balance (right) -->
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem">
            <div style="display:flex;align-items:center;gap:0.5rem;min-width:0">
              <div style="font-weight:800;flex:0 0 1.6rem">${idx+1}</div>
              <div style="flex:1 1 auto;min-width:0;max-width:40ch;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:900;font-size:1rem">${escape(s.fullName||'')}</div>
            </div>
            <div style="flex:0 0 auto;text-align:right;font-weight:900;font-size:0.95rem;color:#b91c1c">${escape(balanceDisplay)}</div>
          </div>

          <!-- Line 2: ID | Class | More (more is placed to the far right under balance) -->
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;font-size:0.85rem;color:#444">
            <div style="min-width:0;flex:0 0 auto;opacity:0.9">${escape(idMobile)}</div>
            <div style="flex:1 1 auto;min-width:0;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;color:#0b74de">${escape(className)}</div>
            <div style="flex:0 0 auto;margin-left:0.5rem">
              <button class="btn btn-ghost more-student" data-id="${escape(idFull)}" title="More" style="padding:0.35rem;border-radius:6px">${svgMore()}</button>
            </div>
          </div>
        </div>`;
      });

      html += `</div>
      <div class="card" style="margin-top:0.5rem;display:flex;gap:0.75rem;justify-content:space-around;align-items:center">
        <div style="text-align:center"><div style="font-weight:900;color:#059669">${c2p(totalPaidThisMonthCents)}</div><div class="muted" style="font-size:0.8rem">Paid (this month)</div></div>
        <div style="text-align:center"><div style="font-weight:900;color:#0b74de">${c2p(totalAssignedCents)}</div><div class="muted" style="font-size:0.8rem">Assigned Fee</div></div>
        <div style="text-align:center"><div style="font-weight:900;color:#b91c1c">${c2p(totalBalanceCents)}</div><div class="muted" style="font-size:0.8rem">Current Balance</div></div>
      </div>`;

      listRoot.innerHTML = html;

      // wiring for more buttons
      listRoot.querySelectorAll('.more-student').forEach(b => b.addEventListener('click', ev => {
        const id = ev.currentTarget.dataset.id;
        const st = (studentsCache||[]).find(x => (String(x.studentId)===String(id) || String(x.id)===String(id)));
        if(!st) return;
        const className2 = resolveClassName(st) || '—';
        const body = `<div style="font-weight:900">${escape(st.fullName||'')}</div>
          <div class="muted">ID: ${escape(st.studentId||st.id||'')}</div>
          <div style="margin-top:8px">Phone: ${escape(st.parentPhone||st.phone||'—')}</div>
          <div>Class: <span class="class-blue">${escape(className2)}</span></div>
          <div>Balance: <span style="font-weight:900;color:#b91c1c">${c2p(st.balance_cents||0)}</span></div>
          <div>Paid this month: <span style="font-weight:700;color:#059669">${c2p(getPaidThisMonthForTarget('student', st))}</span></div>
          <div>Fee: <span style="font-weight:700;color:#0b74de">${(st.fee!=null && !isNaN(Number(st.fee)))?Number(st.fee).toFixed(2):'0.00'}</span></div>
          <div class="modal-more-actions" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
            <button class="btn btn-primary pay-btn" data-id="${escape(st.studentId||st.id||'')}">${svgPay()} Pay</button>
            <button class="btn btn-secondary adj-btn" data-id="${escape(st.studentId||st.id||'')}">${svgReesto()} Reesto Hore</button>
            <button class="btn btn-ghost view-trans-btn" data-id="${escape(st.studentId||st.id||'')}">${svgView()} View</button>
          </div>`;
        showModal('Student details', body);
        modalBody.querySelectorAll('.pay-btn').forEach(bb => bb.addEventListener('click', ev => openPayModal(ev.currentTarget)));
        modalBody.querySelectorAll('.adj-btn').forEach(bb => bb.addEventListener('click', ev => openAdjustmentModal(ev.currentTarget)));
        modalBody.querySelectorAll('.view-trans-btn').forEach(bb => bb.addEventListener('click', ev => openViewTransactionsModal(ev.currentTarget)));
      }));

      return;
    }

    // Desktop fall back (unchanged behaviour) - reuse previous table HTML
    // (the existing desktop markup in your file remains compatible; keep it)
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>Students — ${list.length}</strong><div class="muted">Columns: No, ID, Name, Phone, Class, Assigned Fee, Current Balance, Paid (this month), Actions</div></div>`;
    html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr>
      <th style="padding:8px">No</th>
      <th style="padding:8px">ID</th>
      <th style="padding:8px">Name</th>
      <th style="padding:8px">Phone</th>
      <th style="padding:8px">Class</th>
      <th style="padding:8px;text-align:right">Assigned Fee</th>
      <th style="padding:8px;text-align:right">Current Balance</th>
      <th style="padding:8px;text-align:right">Paid (this month)</th>
      <th style="padding:8px">Actions</th>
    </tr></thead><tbody>`;

    list.forEach((s, idx) => {
      const assignedFeeCents = (s.fee != null && !isNaN(Number(s.fee))) ? Math.round(Number(s.fee)*100) : 0;
      const balanceCents = Number(s.balance_cents || 0);
      const paidThisMonthCents = getPaidThisMonthForTarget('student', s);
      const className = resolveClassName(s) || '—';

      html += `<tr style="border-bottom:1px solid #f1f5f9">
        <td style="padding:8px">${idx+1}</td>
        <td style="padding:8px">${escape(s.studentId||s.id||'')}</td>
        <td style="padding:8px">${escape(s.fullName||'')}</td>
        <td style="padding:8px">${escape(s.parentPhone||s.phone||'—')}</td>
        <td style="padding:8px">${escape(className||'')}</td>
        <td style="padding:8px;text-align:right"><span style="color:#0b74de;font-weight:700">${c2p(assignedFeeCents)}</span></td>
        <td style="padding:8px;text-align:right"><span style="color:#b91c1c;font-weight:900">${c2p(balanceCents)}</span></td>
        <td style="padding:8px;text-align:right"><span style="color:#059669;font-weight:700">${c2p(paidThisMonthCents)}</span></td>
        <td style="padding:8px">
          <button class="btn btn-primary btn-sm pay-btn" data-id="${escape(s.studentId||s.id||'')}">${svgPay()}</button>
          <button class="btn btn-secondary btn-sm adj-btn" data-id="${escape(s.studentId||s.id||'')}">${svgReesto()}</button>
          <button class="btn btn-ghost btn-sm view-trans-btn" data-id="${escape(s.studentId||s.id||'')}">${svgView()}</button>
        </td>
      </tr>`;
    });

    html += `</tbody></table></div>`;

    const totalsHtml = `
      <div class="totals-card card" style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
        <div style="font-weight:900">Totals</div>
        <div style="display:flex;gap:18px;align-items:center">
          <div style="min-width:140px">Assigned fee total: <span style="color:#0b74de;font-weight:900">${c2p(totalAssignedCents)}</span></div>
          <div style="min-width:140px">Current balance total: <span style="color:#b91c1c;font-weight:900">${c2p(totalBalanceCents)}</span></div>
          <div style="min-width:140px">Total Paid (this month): <span style="color:#059669;font-weight:900">${c2p(totalPaidThisMonthCents)}</span></div>
        </div>
      </div>
    `;
    listRoot.innerHTML = html + totalsHtml;

    listRoot.querySelectorAll('.pay-btn').forEach(b => b.addEventListener('click', ev => openPayModal(ev.currentTarget)));
    listRoot.querySelectorAll('.adj-btn').forEach(b => b.addEventListener('click', ev => openAdjustmentModal(ev.currentTarget)));
    listRoot.querySelectorAll('.view-trans-btn').forEach(b => b.addEventListener('click', ev => openViewTransactionsModal(ev.currentTarget)));

    return;
  }

  /* ---------- TEACHERS ---------- */
  if(view === 'teachers'){
    const pool = teachersCache || [];
    let list = pool.slice();
    if(subjectFilter){
      list = list.filter(t => {
        if(!t.subjects && !t.subjectId && !t.subjectName) return false;
        if(Array.isArray(t.subjects)) return t.subjects.includes(subjectFilter) || t.subjects.some(x => String(x).toLowerCase() === String(subjectFilter).toLowerCase());
        if(t.subjectId && String(t.subjectId) === String(subjectFilter)) return true;
        if(t.subjectName && String(t.subjectName).toLowerCase() === String(subjectFilter).toLowerCase()) return true;
        return false;
      });
    }
    if(rawQ) list = list.filter(t => matchesSearchTerm(t, rawQ));
    list.sort((a,b) => (b.balance_cents||0) - (a.balance_cents||0));

    // totals
    let totBalance = 0, totPaid = 0, totSalaryAssigned = 0;
    list.forEach(t => {
      totBalance += Number(t.balance_cents || 0);
      totPaid += getPaidThisMonthForTarget('teacher', t);
      if(t.salary != null && !isNaN(Number(t.salary))) totSalaryAssigned += Math.round(Number(t.salary)*100);
      if(typeof t.salary_cents !== 'undefined') totSalaryAssigned += Number(t.salary_cents||0);
    });

    if(isMobileViewport()){
      // Similar two-line layout for teachers
      let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem"><strong>Teachers — ${list.length}</strong><div class="muted" style="font-size:0.8rem">Tap "more" for actions</div></div><div style="display:flex;flex-direction:column;gap:0.5rem">`;
      list.forEach((t, idx) => {
        const idFull = String(t.teacherId||t.id||'');
        const idMobile = mobileIdDisplay(idFull, { forceFullOnMobile: true });
        const balance = c2p(t.balance_cents||0);
        const classLine = resolveClassName(t) || '—';

        html += `
        <div class="card" style="padding:0.5rem;display:flex;flex-direction:column;gap:0.35rem">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem">
            <div style="display:flex;align-items:center;gap:0.5rem;min-width:0">
              <div style="font-weight:800;flex:0 0 1.6rem">${idx+1}</div>
              <div style="flex:1 1 auto;min-width:0;max-width:40ch;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:900;font-size:1rem">${escape(t.fullName||'')}</div>
            </div>
            <div style="flex:0 0 auto;text-align:right;font-weight:900;font-size:0.95rem;color:#b91c1c">${escape(balance)}</div>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;font-size:0.85rem;color:#444">
            <div style="min-width:0;flex:0 0 auto;opacity:0.9">${escape(idMobile)}</div>
            <div style="flex:1 1 auto;min-width:0;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;color:#0b74de">${escape(classLine)}</div>
            <div style="flex:0 0 auto;margin-left:0.5rem">
              <button class="btn btn-ghost more-teacher" data-id="${escape(idFull)}" title="More" style="padding:0.35rem;border-radius:6px">${svgMore()}</button>
            </div>
          </div>
        </div>`;
      });
      html += `</div>`;
      listRoot.innerHTML = html;

      listRoot.querySelectorAll('.more-teacher').forEach(b => b.addEventListener('click', ev => {
        const id = ev.currentTarget.dataset.id;
        const item = (teachersCache||[]).find(x => (String(x.teacherId) === String(id) || String(x.id) === String(id))) || null;
        if(!item) return;
        const classLine2 = resolveClassName(item) || '—';
        const body = `<div style="font-weight:900">${escape(item.fullName||'')}</div>
          <div class="muted">ID: ${escape(item.teacherId||item.id||'')}</div>
          <div style="margin-top:8px">Classes: <span class="muted">${escape(classLine2)}</span></div>
          <div>Phone: ${escape(item.phone||'—')}</div>
          <div style="margin-top:8px">Balance: <span style="font-weight:900;color:#b91c1c">${c2p(item.balance_cents||0)}</span></div>
          <div>Paid this month: <span style="font-weight:700;color:#059669">${c2p(getPaidThisMonthForTarget('teacher', item))}</span></div>
          <div>Salary: <span style="font-weight:700;color:#0b74de">${salaryDisplay(item)}</span></div>
          <div class="modal-more-actions" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
            <button class="btn btn-primary pay-btn" data-id="${escape(item.teacherId||item.id||'')}">${svgPay()} Pay</button>
            <button class="btn btn-secondary adj-btn" data-id="${escape(item.teacherId||item.id||'')}">${svgReesto()} Reesto Hore</button>
            <button class="btn btn-ghost view-trans-btn" data-id="${escape(item.teacherId||item.id||'')}">${svgView()} View</button>
          </div>`;
        showModal('Teacher details', body);
        modalBody.querySelectorAll('.pay-btn').forEach(bb => bb.addEventListener('click', ev => openPayModal(ev.currentTarget)));
        modalBody.querySelectorAll('.adj-btn').forEach(bb => bb.addEventListener('click', ev => openAdjustmentModal(ev.currentTarget)));
        modalBody.querySelectorAll('.view-trans-btn').forEach(bb => bb.addEventListener('click', ev => openViewTransactionsModal(ev.currentTarget)));
      }));

      return;
    }

    // desktop unchanged (reuse prior desktop code path)
    // DESKTOP teacher table (unchanged; full IDs & salary column)
    if(view=='teachers'){
      let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>Teachers — ${list.length}</strong><div class="muted">Columns: No, ID, Name, Subject, Class, Salary, Balance, Paid(this month), Actions</div></div>`;
      html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr>
        <th>No</th><th>ID</th><th>Name</th><th>Subject</th><th>Class</th><th style="text-align:right">Salary</th><th style="text-align:right">Balance</th><th style="text-align:right">Paid (this month)</th><th>Actions</th>
      </tr></thead><tbody>`;
      list.forEach((t, idx) => {
        const salaryVal = t.salary != null && !isNaN(Number(t.salary)) ? Math.round(Number(t.salary)*100) : (t.salary_cents||0);
        const balance = Number(t.balance_cents||0);
        const paidThisMonth = getPaidThisMonthForTarget('teacher', t);
        const className = resolveClassName(t) || '—';
        html += `<tr style="border-bottom:1px solid #f1f5f9">
          <td style="padding:8px">${idx+1}</td>
          <td style="padding:8px">${escape(t.teacherId||t.id||'')}</td>
          <td style="padding:8px">${escape(t.fullName||'')}</td>
          <td style="padding:8px">${escape(t.subjectName||t.subject||'')}</td>
          <td style="padding:8px">${escape(className||'')}</td>
          <td style="padding:8px;text-align:right">${salaryVal? c2p(salaryVal): '—'}</td>
          <td style="padding:8px;text-align:right;color:#b91c1c;font-weight:700">${c2p(balance)}</td>
          <td style="padding:8px;text-align:right;color:#059669;font-weight:700">${c2p(paidThisMonth)}</td>
          <td style="padding:8px">
            <button class="btn btn-primary btn-sm pay-btn" data-id="${escape(t.teacherId||t.id||'')}" title="Pay">${svgPay()}</button>
            <button class="btn btn-secondary btn-sm adj-btn" data-id="${escape(t.teacherId||t.id||'')}" title="Reesto Hore">${svgReesto()}</button>
            <button class="btn btn-ghost btn-sm view-trans-btn" data-id="${escape(t.teacherId||t.id||'')}" title="View">${svgView()}</button>
          </td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
      html += `<div class="totals-card card" style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
        <div style="font-weight:900">Totals</div>
        <div style="display:flex;gap:18px;align-items:center">
          <div style="min-width:140px">Assigned salary (sum): <span style="color:#0b74de;font-weight:900">${c2p(totSalaryAssigned)}</span></div>
          <div style="min-width:140px">Current balance total: <span style="color:#b91c1c;font-weight:900">${c2p(totBalance)}</span></div>
          <div style="min-width:140px">Total Paid (this month): <span style="color:#059669;font-weight:900">${c2p(totPaid)}</span></div>
        </div>
      </div>`;
      listRoot.innerHTML = html;
      listRoot.querySelectorAll('.pay-btn').forEach(b => b.addEventListener('click', ev => openPayModal(ev.currentTarget)));
      listRoot.querySelectorAll('.adj-btn').forEach(b => b.addEventListener('click', ev => openAdjustmentModal(ev.currentTarget)));
      listRoot.querySelectorAll('.view-trans-btn').forEach(b => b.addEventListener('click', ev => openViewTransactionsModal(ev.currentTarget)));
      return;
    } else  {
      // STAFF: desktop table with salary column & edit/delete buttons
      let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>Staff — ${list.length}</strong></div>`;
      html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr>
        <th>No</th><th>ID</th><th>Name</th><th>Phone</th><th>Role</th><th style="text-align:right">Salary</th><th style="text-align:right">Balance</th><th>Actions</th>
      </tr></thead><tbody>`;
      list.forEach((s, idx) => {
        const salaryVal = s.salary != null && !isNaN(Number(s.salary)) ? Math.round(Number(s.salary)*100) : (s.salary_cents||0);
        html += `<tr style="border-bottom:1px solid #f1f5f9">
          <td style="padding:8px">${idx+1}</td>
          <td style="padding:8px">${escape(s.staffId||s.id||'')}</td>
          <td style="padding:8px">${escape(s.fullName||'')}</td>
          <td style="padding:8px">${escape(s.phone||'—')}</td>
          <td style="padding:8px">${escape(s.role||'')}</td>
          <td style="padding:8px;text-align:right">${salaryVal? c2p(salaryVal) : '—'}</td>
          <td style="padding:8px;text-align:right;color:#b91c1c;font-weight:700">${c2p(s.balance_cents||0)}</td>
          <td style="padding:8px">
            <button class="btn btn-primary btn-sm pay-btn" data-id="${escape(s.staffId||s.id||'')}" title="Pay">${svgPay()}</button>
            <button class="btn btn-secondary btn-sm adj-btn" data-id="${escape(s.staffId||s.id||'')}" title="Reesto Hore">${svgReesto()}</button>
            <button class="btn btn-ghost btn-sm view-trans-btn" data-id="${escape(s.staffId||s.id||'')}" title="View">${svgView()}</button>
            <button class="btn btn-ghost btn-sm edit-staff" data-id="${escape(s.id||'')}" title="Edit">${svgEdit()}</button>
            <button class="btn btn-danger btn-sm del-staff" data-id="${escape(s.id||'')}" title="Delete">${svgDelete()}</button>
          </td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
      listRoot.innerHTML = html;

      listRoot.querySelectorAll('.pay-btn').forEach(b => b.addEventListener('click', ev => openPayModal(ev.currentTarget)));
      listRoot.querySelectorAll('.adj-btn').forEach(b => b.addEventListener('click', ev => openAdjustmentModal(ev.currentTarget)));
      listRoot.querySelectorAll('.view-trans-btn').forEach(b => b.addEventListener('click', ev => openViewTransactionsModal(ev.currentTarget)));
// wherever you previously had edit-staff toast:
listRoot.querySelectorAll('.edit-staff').forEach(b => b.addEventListener('click', ev => openEditStaffModal(ev.currentTarget)));


      
      listRoot.querySelectorAll('.del-staff').forEach(b => b.addEventListener('click', async (e)=> {
        await deleteStaff(e);toast('Staff moved in recycle bin');
      }));
      
      return;
    }
    }

  /* ---------- STAFF ---------- */
  if(view === 'staff'){
    const pool = window.staffCache || [];
    let list = pool.slice();
    if(rawQ) list = list.filter(t => matchesSearchTerm(t, rawQ));
    list.sort((a,b) => (b.balance_cents||0) - (a.balance_cents||0));

    if(isMobileViewport()){
      // Single-line rows for staff (Name | Role | Balance | More)
      let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem"><strong>Staff — ${list.length}</strong></div><div style="display:flex;flex-direction:column;gap:0.4rem">`;
      list.forEach((s, idx) => {
        const balance = c2p(s.balance_cents||0);
        html += `<div class="card" style="padding:0.5rem;display:flex;align-items:center;justify-content:space-between;gap:0.5rem">
          <div style="display:flex;align-items:center;gap:0.5rem;min-width:0">
            <div style="font-weight:800;flex:0 0 1.6rem">${idx+1}</div>
            <div style="flex:1 1 auto;min-width:0;max-width:40ch;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:900">${escape(s.fullName||'')}</div>
          </div>
          <div style="flex:0 0 auto;min-width:6rem;text-align:right;font-size:0.85rem;color:#666">${escape(s.role||'')}</div>
          <div style="flex:0 0 auto;text-align:right;font-weight:900;color:#b91c1c">${escape(balance)}</div>
          <div style="flex:0 0 auto;margin-left:0.5rem"><button class="btn btn-ghost more-staff" data-id="${escape(s.id||s.staffId||'')}" title="More" style="padding:0.35rem;border-radius:6px">${svgMore()}</button></div>
        </div>`;
      });
      html += `</div>`;
      listRoot.innerHTML = html;

      listRoot.querySelectorAll('.more-staff').forEach(b => b.addEventListener('click', ev => {
        const id = ev.currentTarget.dataset.id;
        const item = (window.staffCache||[]).find(x => (String(x.id) === String(id) || String(x.staffId) === String(id)));
        if(!item) return;
        const body = `
        <div style="font-weight:900">${escape(item.fullName||'')}</div>
        <div class="muted">Role: ${escape(item.role||'')}</div>
        <div style="margin-top:6px">Phone: ${escape(item.phone||'—')}</div>
      
        <div style="margin-top:6px">
          Balance:
          <strong style="color:#b91c1c">${c2p(item.balance_cents||0)}</strong>
        </div>
      
        <div class="modal-more-actions"
             style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
      
          <button class="btn btn-primary pay-btn"
                  data-id="${escape(item.staffId||item.id||'')}">
            ${svgPay()} Pay
          </button>
      
          <button class="btn btn-secondary adj-btn"
                  data-id="${escape(item.staffId||item.id||'')}">
            ${svgReesto()} Reesto Hore
          </button>
      
          <button class="btn btn-ghost view-trans-btn"
                  data-id="${escape(item.staffId||item.id||'')}">
            ${svgView()} View
          </button>
      
          <button class="btn btn-ghost edit-staff"
                  data-id="${escape(item.id||'')}">
            ${svgEdit()} Edit
          </button>
      
          <button class="btn btn-danger del-staff"
                  data-id="${escape(item.id||'')}">
            ${svgDelete()} Delete
          </button>
        </div>
      `;
      
        showModal('Staff', body);

        modalBody.querySelectorAll('.pay-btn')
  .forEach(b => b.addEventListener('click', e => openPayModal(e.currentTarget)));

modalBody.querySelectorAll('.adj-btn')
  .forEach(b => b.addEventListener('click', e => openAdjustmentModal(e.currentTarget)));

modalBody.querySelectorAll('.view-trans-btn')
  .forEach(b => b.addEventListener('click', e => openViewTransactionsModal(e.currentTarget)));


  // and inside modals where you previously wired edit-staff:
modalBody.querySelectorAll('.edit-staff').forEach(bb => bb.addEventListener('click', ev => openEditStaffModal(ev.currentTarget)));

// inside modal wiring for staff "del-staff"
modalBody.querySelectorAll('.del-staff').forEach(bb => bb.addEventListener('click', async ev => {
  const sid = ev.currentTarget.dataset.id || getButtonIdFromEvent(ev);
  if(!sid) return;
  if(!confirm('Move staff to Recycle Bin?')) return;
  await deleteStaff(sid);
  closeModal();
}));

      }));

      return;
    }

   // DESKTOP teacher table (unchanged; full IDs & salary column)
   
  // STAFF: desktop table with salary column & edit/delete buttons
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>Staff — ${list.length}</strong></div>`;
  html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr>
    <th>No</th><th>ID</th><th>Name</th><th>Phone</th><th>Role</th><th style="text-align:right">Salary</th><th style="text-align:right">Balance</th><th>Actions</th>
  </tr></thead><tbody>`;
  list.forEach((s, idx) => {
    const salaryVal = s.salary != null && !isNaN(Number(s.salary)) ? Math.round(Number(s.salary)*100) : (s.salary_cents||0);
    html += `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px">${idx+1}</td>
      <td style="padding:8px">${escape(s.staffId||s.id||'')}</td>
      <td style="padding:8px">${escape(s.fullName||'')}</td>
      <td style="padding:8px">${escape(s.phone||'—')}</td>
      <td style="padding:8px">${escape(s.role||'')}</td>
      <td style="padding:8px;text-align:right">${salaryVal? c2p(salaryVal) : '—'}</td>
      <td style="padding:8px;text-align:right;color:#b91c1c;font-weight:700">${c2p(s.balance_cents||0)}</td>
      <td style="padding:8px">
        <button class="btn btn-primary btn-sm pay-btn" data-id="${escape(s.staffId||s.id||'')}" title="Pay">${svgPay()}</button>
        <button class="btn btn-secondary btn-sm adj-btn" data-id="${escape(s.staffId||s.id||'')}" title="Reesto Hore">${svgReesto()}</button>
        <button class="btn btn-ghost btn-sm view-trans-btn" data-id="${escape(s.staffId||s.id||'')}" title="View">${svgView()}</button>
        <button class="btn btn-ghost btn-sm edit-staff" data-id="${escape(s.id||'')}" title="Edit">${svgEdit()}</button>
        <button class="btn btn-danger btn-sm del-staff" data-id="${escape(s.id||'')}" title="Delete">${svgDelete()}</button>
      </td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  listRoot.innerHTML = html;

  // after listRoot.innerHTML = html; (desktop staff table)
listRoot.querySelectorAll('.pay-btn').forEach(b => b.addEventListener('click', ev => openPayModal(ev.currentTarget)));
listRoot.querySelectorAll('.adj-btn').forEach(b => b.addEventListener('click', ev => openAdjustmentModal(ev.currentTarget)));
listRoot.querySelectorAll('.view-trans-btn').forEach(b => b.addEventListener('click', ev => openViewTransactionsModal(ev.currentTarget)));

// EDIT staff (desktop) -> open edit modal (pass element/currentTarget)
listRoot.querySelectorAll('.edit-staff').forEach(b => b.addEventListener('click', ev => {
  // openEditStaffModal accepts event/element/id, so pass the button element
  openEditStaffModal(ev.currentTarget);
}));

// DEL staff (desktop) -> soft-delete via deleteStaff (pass element/currentTarget)
listRoot.querySelectorAll('.del-staff').forEach(b => b.addEventListener('click', ev => {
  // call deleteStaff with element so id extraction works consistently
  deleteStaff(ev.currentTarget).catch(err => { console.error(err); toast('Failed to move staff'); });
}));




  return;

  }

  /* ---------- EXPENSES ---------- */
  if(view === 'expenses'){
    // prefer explicit 'expenses' collection (editable) if available; otherwise fallback to transactions
    const rows = (window.expensesCache && window.expensesCache.slice()) 
                 || ((transactionsCache||[]).filter(t => t.target_type === 'expense' && !t.is_deleted).slice());

    // ensure sort by createdAt desc regardless of shape
    rows.sort((a,b) => {
      const aSec = (a.createdAt && (a.createdAt.seconds || a.createdAt._seconds)) || (a.createdAt ? new Date(a.createdAt).getTime()/1000 : 0);
      const bSec = (b.createdAt && (b.createdAt.seconds || b.createdAt._seconds)) || (b.createdAt ? new Date(b.createdAt).getTime()/1000 : 0);
      return (bSec - aSec);
    });

    // ---------- MOBILE ----------
    if(isMobileViewport()){
      let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
        <strong>Expenses — ${rows.length}</strong>
        <div class="muted" style="font-size:0.85rem">Tap item for actions</div>
      </div><div style="display:flex;flex-direction:column;gap:0.45rem">`;

      rows.forEach((tx, idx) => {
        const amount = c2p(tx.amount_cents || 0);
        const category = tx.subtype || '';
        html += `<div class="card" style="padding:0.5rem;display:flex;align-items:center;justify-content:space-between;gap:0.5rem">
          <div style="display:flex;align-items:center;gap:0.5rem;min-width:0">
            <div style="font-weight:800;flex:0 0 1.6rem">${idx+1}</div>
            <div style="flex:1 1 auto;min-width:0;max-width:40ch;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700">
              ${escape(tx.note || tx.expense_name || 'Expense')}
            </div>
          </div>
          <div style="flex:0 0 auto;min-width:6rem;text-align:right;font-size:0.85rem;color:#666">${escape(category)}</div>
          <div style="flex:0 0 auto;text-align:right;font-weight:900;color:#b91c1c">${escape(amount)}</div>
          <div style="flex:0 0 auto;margin-left:0.5rem">
            <button class="btn btn-ghost more-expense" data-id="${escape(tx.id||'')}" title="More" style="padding:0.35rem;border-radius:6px">${svgMore()}</button>
          </div>
        </div>`;
      });

      html += `</div>`;
      listRoot.innerHTML = html;

      // mobile "more" wiring (open an actions modal)
      listRoot.querySelectorAll('.more-expense').forEach(b => b.addEventListener('click', ev => {
        const id = ev.currentTarget.dataset.id;
        const tx = (rows||[]).find(r => String(r.id) === String(id));
        if(!tx) return;
        const dateStr = formatTimestamp(tx.createdAt);
        const body = `<div style="font-weight:900">${escape(tx.note || tx.expense_name || 'Expense')}</div>
          <div class="muted">Category: ${escape(tx.subtype||'')}</div>
          <div style="margin-top:8px">Amount: <strong>${c2p(tx.amount_cents||0)}</strong></div>
          <div>Date: ${escape(dateStr)}</div>
         <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
  <button class="btn btn-ghost view-expense" data-id="${escape(id)}">${svgView()} View</button>
  <button class="btn btn-primary pay-expense" data-id="${escape(id)}">${svgPay()} Pay</button>
  <button class="btn btn-ghost edit-expense" data-id="${escape(id)}">${svgEdit()} Edit</button>
  <button class="btn btn-danger del-expense" data-id="${escape(id)}">${svgDelete()} Delete</button>
</div>
`;
        showModal('Expense', body);

        modalBody.querySelectorAll('.view-expense').forEach(bb => bb.addEventListener('click', ev => openViewTransactionsModal(ev.currentTarget)));
        modalBody.querySelectorAll('.edit-expense').forEach(bb => bb.addEventListener('click', ev => openEditExpenseModal(ev.currentTarget)));
        modalBody.querySelectorAll('.del-expense').forEach(bb => bb.addEventListener('click', ev => {
          const tid = ev.currentTarget.dataset.id || getButtonIdFromEvent(ev);
          if(!tid) return;
          deleteExpense(tid).then(() => { closeModal(); }).catch(()=>{/* handled in deleteExpense */});
        }));
      }));

      return;
    }

    // ---------- DESKTOP ----------
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>Expenses — ${rows.length}</strong>
      <div class="muted">Columns: No, Name, Category, Amount, Date, Actions</div>
    </div>`;

    html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr>
      <th style="padding:8px">No</th>
      <th style="padding:8px">Name</th>
      <th style="padding:8px">Category</th>
  <th style="padding:8px;text-align:right">Amount</th>
<th style="padding:8px;text-align:right">Balance</th>
<th style="padding:8px">Date</th>

      <th style="padding:8px">Actions</th>
    </tr></thead><tbody>`;

    rows.forEach((tx, idx) => {
      const amount = c2p(tx.amount_cents || 0);
      const category = escape(tx.subtype || '');
      const dateStr = escape(formatTimestamp(tx.createdAt));
      html += `<tr style="border-bottom:1px solid #f1f5f9">
        <td style="padding:8px">${idx+1}</td>
        <td style="padding:8px">${escape(tx.note || tx.expense_name || 'Expense')}</td>
        <td style="padding:8px">${category}</td>
        <td style="padding:8px;text-align:right;color:#b91c1c;font-weight:700">${amount}</td>
<td style="padding:8px;text-align:right">${moneyFromCents(tx.balance_cents || tx.remaining_cents || 0)}</td>
<td style="padding:8px">${dateStr}</td>
<td style="padding:8px">
  <button class="btn btn-primary btn-sm pay-expense" data-id="${escape(tx.id)}" title="Pay">${svgPay()}</button>
  <button class="btn btn-ghost btn-sm view-expense" data-id="${escape(tx.id)}" title="View">${svgView()}</button>
  <button class="btn btn-ghost btn-sm edit-expense" data-id="${escape(tx.id)}" title="Edit">${svgEdit()}</button>
  <button class="btn btn-danger btn-sm del-expense" data-id="${escape(tx.id)}" title="Delete">${svgDelete()}</button>
</td>

      </tr>`;
    });

    html += `</tbody></table></div>`;
    listRoot.innerHTML = html;

    // wiring desktop buttons
    // wire pay buttons for expenses (desktop + modal)
listRoot.querySelectorAll('.pay-expense').forEach(b => b.addEventListener('click', ev => {
  // openPayModal expects element with data-id and possibly type; pass a synthetic element
  const el = ev.currentTarget;
  // if openPayModal expects target_type or similar, adapt accordingly; we pass element with data-id
  openPayModal(el);
}));

    listRoot.querySelectorAll('.view-expense').forEach(b => b.addEventListener('click', ev => openViewTransactionsModal(ev.currentTarget)));
    listRoot.querySelectorAll('.edit-expense').forEach(b => b.addEventListener('click', ev => openEditExpenseModal(ev.currentTarget)));
    listRoot.querySelectorAll('.del-expense').forEach(b => b.addEventListener('click', ev => {
      const id = ev.currentTarget.dataset.id || getButtonIdFromEvent(ev);
      if(!id) return;
      deleteExpense(id).catch(()=>{/* handled in deleteExpense */});
    }));

    return;
  } // end expenses
}



/* ---- Export modal + worker (doExport updated) ---- */
async function exportCurrentPaymentsView(){
  showModal('Export', `<div style="padding:8px">Choose format</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
      <button id="exportCsv" class="btn btn-ghost">CSV</button>
      <button id="exportPdf" class="btn btn-primary">PDF</button>
    </div>`);
  modalBody.querySelector('#exportCsv').onclick = () => { closeModal(); doExport('csv'); };
  modalBody.querySelector('#exportPdf').onclick = () => { closeModal(); doExport('pdf'); };
}

async function doExport(format){
  const active = document.querySelector('#pagePayments .tab.active');
  const view = active ? active.textContent.toLowerCase() : 'students';
  const classFilter = (document.getElementById('paymentsClassFilter') && document.getElementById('paymentsClassFilter').value) || '';
  const statusFilter = (document.getElementById('paymentsStatusFilter') && document.getElementById('paymentsStatusFilter').value) || 'all';
  const school = await getSchoolMeta();
  const titleParts = [school.name];
  if(classFilter){
    const cls = (classesCache||[]).find(c => c.id === classFilter || c.name === classFilter);
    titleParts.push(cls ? `Class: ${cls.name}` : `Class: ${classFilter}`);
  }
  if(statusFilter && statusFilter !== 'all') titleParts.push(capitalize(statusFilter));
  const title = titleParts.join(' • ');

  const rows = [];
  if(view === 'students'){
    rows.push(['No','ID','Name','Phone','Class','AssignedFee','CurrentBalance','Paid (this month)']);
    let idx = 0;
    let totalAssignedCents = 0, totalBalanceCents = 0, totalPaidCents = 0;
    (studentsCache||[]).forEach(s => {
      idx++;
      const className = resolveClassName(s);
      const assignedCents = (s.fee != null && !isNaN(Number(s.fee))) ? Math.round(Number(s.fee)*100) : 0;
      const balanceCents = Number(s.balance_cents || 0);
      const paidCents = getPaidThisMonthForTarget('student', s);
      totalAssignedCents += assignedCents;
      totalBalanceCents += balanceCents;
      totalPaidCents += paidCents;
      rows.push([idx, s.studentId||s.id, s.fullName||'', s.parentPhone||'', className, c2p(assignedCents), c2p(balanceCents), c2p(paidCents)]);
    });
    rows.push([]);
    rows.push(['Totals','','','','', c2p(totalAssignedCents), c2p(totalBalanceCents), c2p(totalPaidCents)]);
  } else if(view === 'teachers'){
    rows.push(['No','ID','Name','Subject','Phone','Salary','CurrentBalance','Paid (this month)']);
    let i = 0;
    (teachersCache||[]).forEach(t => {
      i++;
      const paidCents = getPaidThisMonthForTarget('teacher', t);
      rows.push([i, t.teacherId||t.id, t.fullName||'', t.subjectName||t.subjectId||'', t.phone||'', (t.salary!=null?String(t.salary):''), c2p(t.balance_cents||0), c2p(paidCents)]);
    });
  } else if(view === 'staff'){
    rows.push(['No','ID','Name','Phone','Role','CurrentBalance']);
    let i = 0;
    (window.staffCache||[]).forEach(s => { i++; rows.push([i, s.staffId||s.id, s.fullName||'', s.phone||'', s.role||'', c2p(s.balance_cents||0)]); });
  } else {
    rows.push(['TransactionID','Note','Category','Amount','Date']);
    (transactionsCache||[]).filter(t=> t.target_type === 'expense' && !t.is_deleted).forEach(t => {
      rows.push([t.id, t.note||'', t.subtype||'', c2p(t.amount_cents||0), t.createdAt ? new Date((t.createdAt.seconds||t.createdAt._seconds)*1000).toISOString() : '']);
    });
  }

  if(format === 'csv'){
    const csvrows = [[title], [ `Generated by ${school.name} on ${new Date().toLocaleString()}` ], [], ...rows];
    const csv = csvrows.map(r => r.map(c => '"' + String(c||'').replace(/"/g,'""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `export-${view}.csv`; a.click(); URL.revokeObjectURL(url);
    return;
  }

  if(format === 'pdf'){
    const JsPDF = getJsPDFConstructor();
    if (JsPDF) {
      try {
        const doc = new JsPDF({ orientation: 'landscape' });
        const marginTop = 20;
        try{
          if (school.logo) {
            const resp = await fetch(school.logo);
            const blob = await resp.blob();
            const reader = new FileReader();
            const imgData = await new Promise((res, rej) => { reader.onload = () => res(reader.result); reader.onerror = rej; reader.readAsDataURL(blob); });
            doc.addImage(imgData, 'PNG', 20, marginTop, 36, 36); // smaller logo
            doc.setFontSize(12);
            doc.text(String(title), 70, marginTop + 22);
          } else {
            doc.text(String(title), 20, marginTop + 12);
          }
        }catch(e){ doc.text(String(title), 20, marginTop + 12); console.warn('logo embed fail', e); }

        if (doc.autoTable) {
          const head = [ rows[0] ];
          const body = rows.slice(1);
          doc.autoTable({
            startY: marginTop + 56,
            head,
            body,
            styles: { fontSize: 8, cellPadding: 4 },
            headStyles: { fillColor: [240,240,240], textColor: [20,20,20], fontStyle: 'bold' },
            margin: { left: 14, right: 14 }
          });
          // footer
          doc.setFontSize(9);
          doc.text(`Generated by ${school.name} on ${new Date().toLocaleString()}`, 14, doc.internal.pageSize.getHeight() - 12);
          doc.save(`export-${view}.pdf`);
          return;
        }
      } catch (e) {
        console.warn('jsPDF/autoTable failed, fallback', e);
      }
    }

    // fallback to html2canvas rendering
    try {
      const container = document.createElement('div');
      container.style.padding = '18px';
      container.style.background = '#fff';
      container.style.position = 'relative';
      // watermark
      const watermark = document.createElement('div');
      watermark.style.position = 'absolute';
      watermark.style.left = '50%';
      watermark.style.top = '45%';
      watermark.style.transform = 'translate(-50%,-50%) rotate(-18deg)';
      watermark.style.opacity = '0.06';
      watermark.style.fontSize = '72px';
      watermark.style.fontWeight = '900';
      watermark.style.pointerEvents = 'none';
      watermark.textContent = school.name || '';
      container.appendChild(watermark);

      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.gap = '12px';
      const logo = document.createElement('img');
      logo.src = school.logo || 'assets/logo.png';
      logo.style.maxHeight = '36px';
      logo.style.display = 'block';
      logo.style.opacity = '0.95';
      header.appendChild(logo);
      const h = document.createElement('div');
      h.innerHTML = `<div style="font-weight:900">${escape(String(title))}</div><div style="font-size:11px;color:#666">Generated by ${escape(school.name)} on ${new Date().toLocaleString()}</div>`;
      header.appendChild(h);
      container.appendChild(header);

      const table = document.createElement('table');
      table.style.borderCollapse = 'collapse';
      table.style.width = '100%';
      table.style.marginTop = '12px';
      const thead = document.createElement('thead');
      const trh = document.createElement('tr');
      rows[0].forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        th.style.border = '1px solid #ddd';
        th.style.padding = '6px';
        th.style.fontWeight = '800';
        trh.appendChild(th);
      });
      thead.appendChild(trh);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      rows.slice(1).forEach(r => {
        const tr = document.createElement('tr');
        r.forEach(cell => {
          const td = document.createElement('td');
          td.textContent = String(cell||'');
          td.style.border = '1px solid #eee';
          td.style.padding = '6px';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.appendChild(table);
      document.body.appendChild(container);
      const ok = await exportElementToPdfFallback(`export-${view}.pdf`, container);
      container.remove();
      if(!ok) alert('PDF export not available');
      return;
    } catch(e){
      console.error('PDF fallback failed', e);
      alert('PDF export failed');
    }
  }
}


/* --- Edit staff modal --- */
async function openEditStaffModal(src){
  const id =
    (src && src.target && src.target.dataset && src.target.dataset.id) ||
    (src && src.currentTarget && src.currentTarget.dataset && src.currentTarget.dataset.id) ||
    (src && src.dataset && src.dataset.id) ||
    (typeof src === 'string' ? src : null);

  if(!id){ toast('Staff id missing'); return; }

  const snap = await getDoc(doc(db,'staff', id));
  if(!snap.exists()) return toast('Staff not found');
  const staff = { id: snap.id, ...snap.data() };

  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><label>Full name</label><input id="staffName" value="${escape(staff.fullName||'')}" /></div>
      <div><label>Role</label><input id="staffRole" value="${escape(staff.role||'')}" /></div>
      <div><label>Phone</label><input id="staffPhone" value="${escape(staff.phone||'')}" /></div>
      <div><label>Salary (decimal)</label><input id="staffSalary" type="number" step="0.01" value="${((staff.salary_cents||staff.salary||0)/100).toFixed(2)}" /></div>
      <div style="grid-column:1 / -1"><label>Note</label><input id="staffNote" value="${escape(staff.note||'')}" /></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="staffEditClose" class="btn btn-ghost">Close</button>
      <button id="staffEditSave" class="btn btn-primary">Save</button>
    </div>
  `;
  showModal('Edit Staff', html);

  modalBody.querySelector('#staffEditClose').onclick = closeModal;
  modalBody.querySelector('#staffEditSave').onclick = async () => {
    try{
      const newName = modalBody.querySelector('#staffName').value.trim();
      const newRole = modalBody.querySelector('#staffRole').value.trim();
      const newPhone = modalBody.querySelector('#staffPhone').value.trim();
      const salaryDecimal = Number(modalBody.querySelector('#staffSalary').value || 0);
      const newSalaryCents = Math.round(salaryDecimal * 100);
      const newNote = modalBody.querySelector('#staffNote').value.trim();

      await updateDoc(doc(db,'staff', id), {
        fullName: newName || null,
        role: newRole || null,
        phone: newPhone || null,
        salary_cents: newSalaryCents,
        salary: (newSalaryCents? (newSalaryCents/100) : null),
        note: newNote || null,
        edited_at: Timestamp.now(),
        edited_by: currentUser ? currentUser.uid : null
      });

      toast('Staff updated');
      closeModal();
      if(typeof loadStaff === 'function') await loadStaff();
      renderPaymentsList && renderPaymentsList('staff');
    }catch(err){
      console.error('edit staff failed', err);
      toast('Failed to save staff');
    }
  };
}


/* --- Edit transaction modal --- */
async function openEditTransactionModal(src){
  // support: event, element, currentTarget, dataset, or id string
  const txId =
    (src && src.target && src.target.dataset && src.target.dataset.id) ||
    (src && src.currentTarget && src.currentTarget.dataset && src.currentTarget.dataset.id) ||
    (src && src.dataset && src.dataset.id) ||
    (typeof src === 'string' ? src : null);

  if(!txId) { toast('Transaction id missing'); return; }

  const txSnap = await getDoc(doc(db,'transactions', txId));
  if(!txSnap.exists()) return toast('Transaction not found');
  const tx = { id: txSnap.id, ...txSnap.data() };

  // modal fields (amount shown as decimal, not formatted currency)
  const monthsOptions = Array.from({length:12}, (_,i)=>`<option value="${i+1}">${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i]}</option>`).join('');
  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><label>Amount (e.g. 12.34)</label><input id="editAmount" type="number" step="0.01" value="${((tx.amount_cents||0)/100).toFixed(2)}" /></div>
      <div><label>Type</label><input id="editType" value="${escape(tx.type||'')}" /></div>
      <div><label>Months (multi)</label><select id="editMonths" multiple size="6">${monthsOptions}</select></div>
      <div><label>Payment Method</label><input id="editMethod" value="${escape(tx.payment_method||'')}" /></div>
      <div><label>Mobile Provider</label><input id="editProvider" value="${escape(tx.mobile_provider||'')}" /></div>
      <div><label>Payer Phone</label><input id="editPayer" value="${escape(tx.payer_phone||'')}" /></div>
      <div style="grid-column:1 / -1"><label>Note</label><input id="editNote" value="${escape(tx.note||'')}" /></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="editClose" class="btn btn-ghost">Close</button>
      <button id="editSave" class="btn btn-primary">Save</button>
    </div>
  `;
  showModal('Edit Transaction', html);

  // pre-select related months if present (format 'YYYY-MM')
  const selectMonths = modalBody.querySelector('#editMonths');
  (tx.related_months || []).forEach(m => {
    const parts = String(m).split('-'); // YYYY-MM
    if(parts.length === 2){
      const monthNum = Number(parts[1]);
      const opt = Array.from(selectMonths.options).find(o => Number(o.value) === monthNum);
      if(opt) opt.selected = true;
    }
  });

  modalBody.querySelector('#editClose').onclick = closeModal;
  modalBody.querySelector('#editSave').onclick = async () => {
    try{
      // accept numeric input (in decimal), convert to cents
      const rawAmt = modalBody.querySelector('#editAmount').value;
      const newAmountCents = Math.round((Number(rawAmt) || 0) * 100);
      const newType = modalBody.querySelector('#editType').value.trim();
      const newMonths = Array.from(selectMonths.selectedOptions).map(o => o.value);
      const newMethod = modalBody.querySelector('#editMethod').value.trim();
      const newProvider = modalBody.querySelector('#editProvider').value.trim();
      const newPayer = modalBody.querySelector('#editPayer').value.trim();
      const newNote = modalBody.querySelector('#editNote').value.trim();

      // compute balance effects
      const oldType = tx.type;
      if((oldType === 'monthly' || oldType === 'salary') && (newType === oldType)){
        const delta = (tx.amount_cents || 0) - newAmountCents; // add delta to balance
        if(delta !== 0) await updateTargetBalanceGeneric(tx.target_type, tx.target_id, delta);
      } else {
        // reverse original effect if it affected balance
        if(oldType === 'monthly' || oldType === 'salary'){
          await updateTargetBalanceGeneric(tx.target_type, tx.target_id, (tx.amount_cents || 0));
        }
        // apply new effect if new type affects balance
        if(newType === 'monthly' || newType === 'salary'){
          await updateTargetBalanceGeneric(tx.target_type, tx.target_id, -newAmountCents);
        }
      }

      await updateDoc(doc(db,'transactions', tx.id), {
        amount_cents: newAmountCents,
        type: newType || null,
        payment_method: newMethod || null,
        mobile_provider: newProvider || null,
        payer_phone: newPayer || null,
        note: newNote || null,
        related_months: (newType === 'monthly') ? newMonths.map(m => `${new Date().getFullYear()}-${String(Number(m)).padStart(2,'0')}`) : [],
        edited_by: currentUser ? currentUser.uid : null,
        edited_at: Timestamp.now()
      });

      toast('Transaction updated');
      closeModal();
      if(typeof loadTransactions === 'function') await loadTransactions();
      renderPaymentsList && renderPaymentsList('expenses');
      renderPaymentsList && renderPaymentsList('students');
      renderPaymentsList && renderPaymentsList('teachers');
      renderDashboard && renderDashboard();
    }catch(err){
      console.error('edit transaction failed', err);
      toast('Failed to update transaction');
    }
  };
}

/* --- Delete/soft-delete transaction --- */

async function deleteTransaction(e){
  // accept event, element or id string
  const id = (e && e.target && e.target.dataset && e.target.dataset.id)
           || (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id)
           || (e && e.dataset && e.dataset.id)
           || (typeof e === 'string' ? e : null);
  if(!id) return;
  if(!confirm('Delete Transaction? This will reverse balance effects if applicable. Proceed?')) return;
  try{
    const snap = await getDoc(doc(db,'transactions', id));
    if(!snap.exists()) return toast('Transaction not found');
    const tx = { id: snap.id, ...snap.data() };

    // reverse effect if affected balance (monthly or salary)
    if(tx.type === 'monthly' || tx.type === 'salary'){
      // original subtract was applied when created -> add it back
      await updateTargetBalanceGeneric(tx.target_type, tx.target_id, (tx.amount_cents || 0));
    }

    // soft-delete the transaction (expenses are here too)
    await updateDoc(doc(db,'transactions', id), {
      is_deleted: true,
      deleted_by: (currentUser && currentUser.uid) || (auth && auth.currentUser && auth.currentUser.uid) || null,
      deleted_at: Timestamp.now(),
      updatedAt: Timestamp.now()
    });

    toast('Transaction moved to Recycle Bin' , 'info');

    // refresh caches & UI
    if(typeof loadTransactions === 'function') await loadTransactions();
    renderPaymentsList && renderPaymentsList('expenses');
    renderPaymentsList && renderPaymentsList('students');
    renderPaymentsList && renderPaymentsList('teachers');
    renderDashboard && renderDashboard();

    // refresh recycle bin UI if visible
    if(typeof renderRecycleBin === 'function') await renderRecycleBin();
  }catch(err){
    console.error('delete transaction failed', err);
    toast('Failed to delete transaction');
  }
}


/* ---------- renderDashboard (rich admin dashboard) ---------- */


async function renderDashboard(opts = {}) {
  // opts may contain: defaultFilter, forceRefresh
  // Ensure caches loaded (best-effort)
  await Promise.all([
    typeof loadStudents === 'function' ? loadStudents() : Promise.resolve(),
    typeof loadTeachers === 'function' ? loadTeachers() : Promise.resolve(),
    typeof loadStaff === 'function' ? loadStaff() : Promise.resolve(),
    typeof loadTransactions === 'function' ? loadTransactions() : Promise.resolve(),
    typeof loadExams === 'function' ? loadExams() : Promise.resolve(),
    typeof loadExamResults === 'function' ? loadExamResults() : Promise.resolve()
  ]);
 
  // ---------- helpers ----------
  function tsToMs(t) {
    if (!t) return 0;
    if (typeof t === 'number') return t * 1000;
    if (t.seconds) return (t.seconds * 1000) + (t.nanoseconds ? Math.floor(t.nanoseconds / 1000000) : 0);
    if (t._seconds) return (t._seconds * 1000);
    const d = new Date(t);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  function startOfDayMs(d) { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime(); }
  function endOfDayMs(d) { const x = new Date(d); x.setHours(23,59,59,999); return x.getTime(); }
 
  // robust money formatter (uses global c2p if present)
  function formatMoney(cents) {
    try {
      if (typeof c2p === 'function') return c2p(Number(cents || 0));
    } catch(e){}
    // fallback: cents -> units with two decimals
    const n = Number(cents || 0) / 100;
    return n.toFixed(2);
  }
 
  // robust balance normalization -> cents
  function getBalanceCents(record) {
    if (!record) return 0;
    if (typeof record.balance_cents !== 'undefined' && record.balance_cents !== null) return Number(record.balance_cents) || 0;
    if (typeof record.balance !== 'undefined' && record.balance !== null) {
      const v = Number(record.balance);
      if (!isNaN(v)) {
        // if it looks like integer > 1000 treat as cents already
        if (Number.isInteger(v) && Math.abs(v) > 1000) return v;
        return Math.round(v * 100);
      }
    }
    if (typeof record.outstanding !== 'undefined') {
      const v = Number(record.outstanding) || 0; return Math.round(v * 100);
    }
    if (typeof record.amount_due !== 'undefined') { const v = Number(record.amount_due)||0; return Math.round(v*100); }
    if (typeof record.due_amount !== 'undefined') { const v = Number(record.due_amount)||0; return Math.round(v*100); }
    return 0;
  }
 
  // robust student finder
  function findStudentByRef(refId) {
    if (!refId) return null;
    const list = (studentsCache || []);
    const sRef = String(refId);
    for (const s of list) {
      const ids = [s.id, s.studentId, s.student_id, s.uid, s._id];
      for (const id of ids) if (typeof id !== 'undefined' && id !== null && String(id) === sRef) return s;
      if (s.phone && String(s.phone) === sRef) return s;
      if (s.regNo && String(s.regNo) === sRef) return s;
    }
    return null;
  }
 
  // months & school-year config
  const monthsShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const schoolYearConfig = (() => {
    try { const raw = localStorage.getItem('schoolYearConfig'); if (raw) return JSON.parse(raw); } catch(e) {}
    return { startMonth: 8, endMonth: 6 };
  })();
 
  // compute range per filter
  function computeRangeForFilter(filterName) {
    const now = new Date();
    if (filterName === 'Today') return { start: startOfDayMs(now), end: endOfDayMs(now), label: `Showing: ${new Date(startOfDayMs(now)).toLocaleDateString()} — ${new Date(endOfDayMs(now)).toLocaleDateString()}` };
    if (filterName === 'This Week') {
      const d = new Date(now); const sat = new Date(d);
      while (sat.getDay() !== 6) sat.setDate(sat.getDate() - 1); // back to Saturday
      const wed = new Date(sat); wed.setDate(sat.getDate() + 4); // Saturday -> Wednesday
      return { start: startOfDayMs(sat), end: endOfDayMs(wed), label: `Showing: ${new Date(startOfDayMs(sat)).toLocaleDateString()} — ${new Date(endOfDayMs(wed)).toLocaleDateString()}` };
    }
    if (filterName === 'This Month') {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23,59,59,999);
      return { start: startOfDayMs(s), end: endOfDayMs(e), label: `Showing: ${s.toLocaleDateString()} — ${e.toLocaleDateString()}` };
    }
    if (filterName === 'This Year') {
      const s = new Date(now.getFullYear(),0,1); const e = new Date(now.getFullYear(),11,31,23,59,59,999);
      return { start: startOfDayMs(s), end: endOfDayMs(e), label: `Showing: ${s.toLocaleDateString()} — ${e.toLocaleDateString()}` };
    }
    if (filterName === 'Sanad dugsiyeed') {
      const sm = Number(schoolYearConfig.startMonth) || 8;
      const em = Number(schoolYearConfig.endMonth) || 6;
      const y = now.getFullYear(); let yearStart, yearEnd;
      if (sm <= em) {
        yearStart = new Date(y, sm-1, 1);
        yearEnd = new Date(y, em, 0, 23,59,59,999);
        if (now < yearStart) { yearStart = new Date(y-1, sm-1,1); yearEnd = new Date(y-1, em, 0, 23,59,59,999); }
      } else {
        const candStart = new Date(y, sm-1, 1);
        const candEnd = new Date(y+1, em, 0, 23,59,59,999);
        if (now >= candStart) { yearStart = candStart; yearEnd = candEnd; } else { yearStart = new Date(y-1, sm-1,1); yearEnd = new Date(y, em, 0, 23,59,59,999); }
      }
      return { start: startOfDayMs(yearStart), end: endOfDayMs(yearEnd), label: `Showing: ${yearStart.toLocaleDateString()} — ${yearEnd.toLocaleDateString()}` };
    }
    // All
    return { start: 0, end: Date.now(), label: 'Showing: All time' };
  }
 
  // ---------- DOM skeleton & refs ----------
  const containerId = 'pageDashboard';
  let page = document.getElementById(containerId);
  if (!page) {
    page = document.createElement('section');
    page.id = containerId;
    page.className = 'page';
    const main = document.querySelector('main');
    main && main.insertBefore(page, main.firstChild);
  }
 
  // initial state
  let activeFilter = opts.defaultFilter || 'This Month';
  let totalBalanceMode = localStorage.getItem('dashboard_total_balance_mode') || 'students';
  let currentRange = computeRangeForFilter(activeFilter);
 
  // skeleton HTML (keeps your layout)
  page.innerHTML = `
    <div class="page-header" style="align-items:center;justify-content:space-between">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div style="display:flex;gap:6px" role="tablist" aria-label="Date filters">
          <button class="tab filter-btn" data-filter="Today">Today</button>
          <button class="tab filter-btn active" data-filter="This Month">This Month</button>
          <button class="tab filter-btn" data-filter="This Week">This Week</button>
          <button class="tab filter-btn" data-filter="This Year">This Year</button>
          <button class="tab filter-btn" data-filter="Sanad dugsiyeed">Sanad dugsiyeed</button>
          <button class="tab filter-btn" data-filter="All">All</button>
        </div>
        <div id="filterInfo" class="muted" style="margin-left:12px"></div>
      </div>
 
      <div style="display:flex;gap:8px;align-items:center">
        <div style="display:flex;gap:8px;align-items:center">
          <button id="dashboardRefresh" class="btn btn-ghost" title="Refresh">↻</button>
          <div id="dashboardLastRef" class="muted" style="font-size:0.85rem"></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button id="dashboardExportPdf" class="btn btn-ghost">Export PDF</button>
          <button id="dashboardExportCsv" class="btn btn-ghost">Export CSV</button>
          <button id="dashboardSettings" class="btn btn-ghost">⚙</button>
          <button id="dashboardNotifications" class="btn btn-ghost" title="Notifications">🔔 <span id="notifBadge" style="display:none;">0</span></button>
        </div>
      </div>
    </div>
 
    <div id="kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:12px"></div>
 
    <div id="chartsRow" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
      <div class="card" style="padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><strong>Student Payments</strong><div class="muted" style="font-size:0.85rem" id="chartPaymentsInfo"></div></div>
          <div style="display:flex;gap:8px;align-items:center">
            <select id="chartPaymentsGranularity" style="padding:6px;border-radius:8px"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly" selected>Monthly</option></select>
            <button id="exportChartPayments" class="btn btn-ghost">Export CSV</button>
          </div>
        </div>
        <canvas id="chartPayments" height="220"></canvas>
      </div>
 
      <div class="card" style="padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><strong>Teacher Payments (paid)</strong><div class="muted" id="chartTeachersInfo" style="font-size:0.85rem"></div></div>
          <div style="display:flex;gap:8px;align-items:center">
            <select id="chartTeachersGranularity" style="padding:6px;border-radius:8px"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly" selected>Monthly</option></select>
            <button id="exportChartTeachers" class="btn btn-ghost">Export CSV</button>
          </div>
        </div>
        <canvas id="chartTeachers" height="220"></canvas>
      </div>
    </div>
 
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-top:12px">
      <div class="card" id="outstandingCard" style="padding:12px">
        // <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        //   <div><strong>Top 10 Outstanding Student Payments</strong><div class="muted" id="outstandingRange"></div></div>
        //   <div style="display:flex;gap:8px;align-items:center">
        //     <input id="outstandingSearch" placeholder="Search name / ID" style="padding:6px;border-radius:8px;border:1px solid #eef2f9" />
        //     <button id="outstandingExport" class="btn btn-ghost">Export CSV</button>
        //     <button id="outstandingBulkReminder" class="btn btn-primary">Send Reminder</button>
        //   </div>
        // </div>
        <div id="outstandingTable"></div>
      </div>
 
      <div class="card" id="leaderboardCard" style="padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div><strong>Top-10 Students (Exam leaderboard)</strong><div class="muted" id="leaderboardExamInfo"></div></div>
          <div style="display:flex;gap:8px;align-items:center">
            <select id="leaderboardKind"><option value="school">Top 10 — School</option><option value="class">Top 10 — Class</option></select>
            <select id="leaderboardExam"></select>
            <select id="leaderboardClass" style="display:none"></select>
            <button id="leaderboardExport" class="btn btn-ghost">Export</button>
          </div>
        </div>
        <div id="leaderboardList"></div>
      </div>
    </div>
 
    <div id="dashFooter" style="margin-top:12px;display:flex;justify-content:space-between;align-items:center">
      <div class="muted" id="dashSources">Data source: local cache (transactions / students / teachers)</div>
      <div class="muted" id="dashStatus"></div>
    </div>
  `;
 

  function hideDesktopHeadersOnMobile() {
  if (!isMobileViewport || !isMobileViewport()) return;

  const outstandingCard = page.querySelector('#outstandingCard');
  const leaderboardCard = page.querySelector('#leaderboardCard');

  if (outstandingCard && outstandingCard.firstElementChild) {
    outstandingCard.firstElementChild.style.display = 'none';
  }

  if (leaderboardCard && leaderboardCard.firstElementChild) {
    leaderboardCard.firstElementChild.style.display = 'none';
  }
}

// call once after render
hideDesktopHeadersOnMobile();

  // shared header refs (used by mobile + desktop)
let filterInfo = null;
let lastRefEl = null;

  // --- Header replacement for mobile-friendly controls + export dropdown ---
 (function replaceHeaderControls() {
   const hdr = page.querySelector('.page-header');
   if (!hdr) return;
   hdr.innerHTML = `
     <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:100%;justify-content:space-between">
       <div style="display:flex;gap:8px;align-items:center;min-width:0">
         <select id="dashboardFilterSelect" style="padding:8px;border-radius:8px;border:1px solid #e6eef9;background:#fff;min-width:160px">
           <option value="Today">Today</option>
           <option value="This Month" selected>This Month</option>
           <option value="This Week">This Week</option>
           <option value="This Year">This Year</option>
           <option value="Sanad dugsiyeed">Sanad dugsiyeed</option>
           <option value="All">All</option>
         </select>
         <div id="filterInfoMobile" class="muted" style="font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
       </div>
 
       <div style="display:flex;gap:8px;align-items:center">
         <div style="position:relative">
           <button id="dashboardExportBtn" class="btn btn-ghost" style="display:flex;gap:8px;align-items:center;padding:8px 10px;border-radius:8px">Export ▾</button>
           <div id="dashboardExportMenu" style="display:none;position:absolute;right:0;top:calc(100% + 6px);background:#fff;border:1px solid #eef2f9;border-radius:8px;box-shadow:0 6px 20px rgba(10,20,40,0.06);z-index:999;padding:6px">
             <button id="exportPdfOpt" class="btn btn-ghost" style="display:block;width:180px;text-align:left;padding:8px">Export PDF</button>
             <button id="exportCsvOpt" class="btn btn-ghost" style="display:block;width:180px;text-align:left;padding:8px">Export CSV</button>
           </div>
         </div>
 
         <button id="dashboardRefresh" class="btn btn-ghost" title="Refresh" style="padding:8px;border-radius:8px">↻</button>
         <button id="dashboardSettings" class="btn btn-ghost" style="padding:8px;border-radius:8px" title="Settings">⚙</button>
         <button id="dashboardNotifications" class="btn btn-ghost" style="padding:8px;border-radius:8px" title="Notifications">🔔 <span id="notifBadge" style="display:none;margin-left:6px;background:#ef4444;color:#fff;font-size:0.7rem;padding:2px 6px;border-radius:999px"></span></button>
       </div>
     </div>
     <div style="margin-top:6px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap">
       <div id="filterMeta" style="display:flex;flex-direction:column;gap:4px">
         <div id="filterShowing" class="muted" style="font-size:0.92rem"></div>
         <div id="lastRefWrapper" class="muted" style="font-size:0.82rem"></div>
       </div>
       <div id="headerRightMeta" class="muted" style="font-size:0.9rem"></div>
     </div>
   `;
 
   // refs
   const sel = page.querySelector('#dashboardFilterSelect');
   const filterInfoMobile = page.querySelector('#filterInfoMobile');
   const filterShowing = page.querySelector('#filterShowing');
   const lastRefWrapper = page.querySelector('#lastRefWrapper');
   const exportBtn = page.querySelector('#dashboardExportBtn');
   const exportMenu = page.querySelector('#dashboardExportMenu');
   const exportPdfOpt = page.querySelector('#exportPdfOpt');
   const exportCsvOpt = page.querySelector('#exportCsvOpt');
 
   // initialize values
   sel.value = activeFilter || 'This Month';
   filterInfoMobile.textContent = (currentRange && currentRange.label) ? '' : '';
   filterShowing.textContent = currentRange && currentRange.label ? currentRange.label : '';
 
   // wire select -> same behavior as old filter buttons
   sel.addEventListener('change', () => {
     activeFilter = sel.value;
     setActiveFilterButton(activeFilter); // uses existing function (see patch below)
     currentRange = computeRangeForFilter(activeFilter);
     refreshDashboard();
   });
 
   // export dropdown toggle
   exportBtn.addEventListener('click', (ev) => {
     ev.stopPropagation();
     exportMenu.style.display = exportMenu.style.display === 'none' ? 'block' : 'none';
   });
   // close menu on outside click
   document.addEventListener('click', (ev) => {
     if (!exportMenu) return;
     if (!exportMenu.contains(ev.target) && !exportBtn.contains(ev.target)) exportMenu.style.display = 'none';
   });
 
   // hook export options
   if (exportPdfOpt) exportPdfOpt.addEventListener('click', () => { exportMenu.style.display='none'; exportPdfFromDashboard(); });
   if (exportCsvOpt) exportCsvOpt.addEventListener('click', () => { exportMenu.style.display='none'; exportCsvFromDashboard(); });
 
   // wire refresh / settings / notifications to existing handlers if present
   const refBtn = page.querySelector('#dashboardRefresh');
   if (refBtn) {
     refBtn.addEventListener('click', () => {
       refreshDashboard();
     });
   }
   
   // show last refreshed
   lastRefWrapper.textContent = `↻ Last refreshed: ${new Date().toLocaleString()}`;
 

 })();
 
  // refs
  // const filterButtons = page.querySelectorAll('.filter-btn');
  // // support either the original '#filterInfo' or the new mobile '#filterInfoMobile' or '#filterShowing'
  // const filterInfo = page.querySelector('#filterInfo') || page.querySelector('#filterInfoMobile') || page.querySelector('#filterShowing');
  // // support either the original '#dashboardLastRef' or the new '#lastRefWrapper'
  // const lastRefEl = page.querySelector('#lastRefWrapper') || page.querySelector('#dashboardLastRef');

  const filterButtons = page.querySelectorAll('.filter-btn');

// reuse shared refs, fallback for desktop
filterInfo =
  filterInfo ||
  page.querySelector('#filterInfo') ||
  page.querySelector('#filterInfoMobile') ||
  page.querySelector('#filterShowing');

lastRefEl =
  lastRefEl ||
  page.querySelector('#lastRefWrapper') ||
  page.querySelector('#dashboardLastRef');


  
  const kpisRoot = page.querySelector('#kpis');
  const dashSources = page.querySelector('#dashSources');
  const dashStatus = page.querySelector('#dashStatus');
  const chartPaymentsCanvas = page.querySelector('#chartPayments');
  const chartTeachersCanvas = page.querySelector('#chartTeachers');
  const outstandingTableRoot = page.querySelector('#outstandingTable');
  const outstandingRange = page.querySelector('#outstandingRange');
  const outstandingSearch = page.querySelector('#outstandingSearch');
  const leaderboardExamSel = page.querySelector('#leaderboardExam');
  const leaderboardListRoot = page.querySelector('#leaderboardList');
  const leaderboardKind = page.querySelector('#leaderboardKind');
  const leaderboardClassSel = page.querySelector('#leaderboardClass');
  const leaderboardExamInfo = page.querySelector('#leaderboardExamInfo');
 
 // Replace existing setActiveFilterButton(name) with this version:
 function setActiveFilterButton(name) {
   // update filter buttons if present (desktop)
   filterButtons.forEach(b => b.classList.toggle('active', b.dataset.filter === name));
   // update mobile select if present
   const mobileSel = page.querySelector('#dashboardFilterSelect');
   if (mobileSel) {
     try { mobileSel.value = name; } catch(e){ /* ignore */ }
   }
   // update the "Showing:" text
   const range = computeRangeForFilter(name);
   const metaEl = page.querySelector('#filterShowing') || filterInfo;
   if (metaEl) metaEl.textContent = range.label;
   // keep previous behavior (if any other UI must refresh)
   filterInfo && (filterInfo.textContent = range.label);
 }
 
  setActiveFilterButton(activeFilter);
 
  // ---------- KPI computation ----------
  function txInRange(tx, start, end) {
    const ms = tsToMs(tx.createdAt);
    return ms >= start && ms <= end;
  }
 
  function computeKPIs(range) {
    const txs = (transactionsCache || []).filter(t => !t.is_deleted && txInRange(t, range.start, range.end));
    const students = studentsCache || [];
    const teachers = teachersCache || [];
    const staff = window.staffCache || [];
 
    const totalStudents = students.length;
    const totalTeachers = teachers.length;
    const totalStaff = staff.length || 0;
    const totalClasses = (classesCache || []).length;
    const totalSubjects = (window.subjectsCache || []).length;
 
    const totalExpenseCents = txs.filter(t => String(t.target_type).toLowerCase() === 'expense').reduce((s,t)=> s + (Number(t.amount_cents||0)), 0);
    const staffPaymentsCents = txs.filter(t => String(t.target_type).toLowerCase() === 'staff' && Number(t.amount_cents||0) > 0).reduce((s,t)=> s + (Number(t.amount_cents||0)), 0);
    const teacherPaymentsCents = txs.filter(t => String(t.target_type).toLowerCase() === 'teacher' && Number(t.amount_cents||0) > 0).reduce((s,t)=> s + (Number(t.amount_cents||0)), 0);
    const totalExpensesPlusCents = totalExpenseCents + staffPaymentsCents + teacherPaymentsCents;
    const totalRevenueCents = txs.filter(t => String(t.target_type).toLowerCase() === 'student' || t.type === 'monthly' || String(t.type).toLowerCase() === 'payment').reduce((s,t)=> s + (Number(t.amount_cents||0)), 0);
 
    const totalStudentsBalanceCents = (students || []).reduce((s,st) => s + getBalanceCents(st), 0);
    const totalTeachersBalanceCents = (teachers || []).reduce((s,tch) => s + getBalanceCents(tch), 0);
 
    const profitCents = totalRevenueCents - totalExpensesPlusCents;
 
    const periodLen = Math.max(1, range.end - range.start);
    const prevStart = range.start - periodLen;
    const prevEnd = range.start - 1;
    const txsPrev = (transactionsCache || []).filter(t => !t.is_deleted && tsToMs(t.createdAt) >= prevStart && tsToMs(t.createdAt) <= prevEnd);
    const prevRevenueCents = txsPrev.filter(t => String(t.target_type).toLowerCase() === 'student').reduce((s,t)=> s + (Number(t.amount_cents||0)), 0);
 
    return {
      totalStudents, totalTeachers, totalStaff, totalClasses, totalSubjects,
      totalExpenseCents, staffPaymentsCents, teacherPaymentsCents, totalExpensesPlusCents,
      totalRevenueCents, totalStudentsBalanceCents, totalTeachersBalanceCents, profitCents, prevRevenueCents
    };
  }
 
  // ---------- KPI rendering ----------
  function iconToSvg(name, size = 18) {
    const common = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"`;
    const svgs = {
      'mdi-school': `<svg ${common}><path d="M12 3L2 9l10 6 10-6-10-6z" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v6a6 6 0 006 6 6 6 0 006-6v-6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      'mdi-teacher': `<svg ${common}><circle cx="12" cy="8" r="2.25" stroke="currentColor" stroke-width="1.2"/><path d="M5 20c1-3 4-5 7-5s6 2 7 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      'mdi-account-group': `<svg ${common}><path d="M16 11c1.657 0 3-1.343 3-3S17.657 5 16 5s-3 1.343-3 3 1.343 3 3 3zM8 11c1.657 0 3-1.343 3-3S9.657 5 8 5 5 6.343 5 8s1.343 3 3 3zM2 19c0-2.761 3.582-5 8-5s8 2.239 8 5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      'mdi-domain': `<svg ${common}><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M7 10h3M7 14h3M14 10h3M14 14h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
      'mdi-book-open-page-variant': `<svg ${common}><path d="M3 6.5C3 5.119 4.12 4 5.5 4h0C7.46 4 9.02 5.06 12 6.5c2.98-1.44 4.54-2.5 6.5-2.5h0c1.38 0 2.5 1.12 2.5 2.5V19c0 .55-.45 1-1 1H5c-.55 0-1-.45-1-1V6.5z" stroke="currentColor" stroke-width="1.1" fill="none"/></svg>`,
      'mdi-file-cabinet': `<svg ${common}><rect x="3.5" y="3.5" width="17" height="17" rx="1.2" stroke="currentColor" stroke-width="1.1"/><path d="M7 8h10M7 13h10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`,
      'mdi-cash-multiple': `<svg ${common}><rect x="2.5" y="6" width="19" height="12" rx="1.2" stroke="currentColor" stroke-width="1.1"/><circle cx="12" cy="12" r="2.1" stroke="currentColor" stroke-width="1.1"/><path d="M7 9v6M17 9v6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`,
      'mdi-currency-usd': `<svg ${common}><path d="M12 8v8M10 6h4M9 18h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      'mdi-chart-line': `<svg ${common}><path d="M3 17h18M6 12l4 3 6-8 5 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      'mdi-scale': `<svg ${common}><path d="M12 3v3M5 21h14M7 21a5 5 0 0 1 10 0M4 10h16" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      'mdi-bell': `<svg ${common}><path d="M15 17H9a3 3 0 0 1-3-3V11c0-3 2-5 5-6V4a1 1 0 0 1 2 0v1c3 1 5 3 5 6v3a3 3 0 0 1-3 3zM8 19a4 4 0 0 0 8 0" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    };
    return svgs[name] || svgs['mdi-school'];
  }
 
 
 
    // --------- KPI tile rendering with colors ---------
  // color palette (tweak hexes as you like)
  const KPI_PALETTE = {
    green: { accent: '#059669', lightBg: 'rgba(5,150,105,0.08)', text: '#065f46' }, // revenue/profit
    red:   { accent: '#ef4444', lightBg: 'rgba(239,68,68,0.06)', text: '#7f1d1d' },   // students/teachers/classes (strong)
    orange:{ accent: '#f59e0b', lightBg: 'rgba(245,158,11,0.06)', text: '#92400e' },  // expenses/warnings
    blue:  { accent: '#2563eb', lightBg: 'rgba(11,116,255,0.06)', text: '#0b4fcf' }   // neutral / others
  };
 
  // default mapping KPI key -> palette
  const KPI_COLOR_MAP = {
    students: 'red',
    teachers: 'red',
    staff: 'red',
    classes: 'red',
    subjects: 'red',
    expense: 'orange',
    expenses_plus: 'orange',
    revenue: 'green',
    profit: 'green',
    total_balance: 'orange' // toggles between students/teachers, keep orange to highlight
  };
 
  // small helper to ensure a palette object
  function paletteForKey(key){
    const k = KPI_COLOR_MAP[key] || 'blue';
    return KPI_PALETTE[k] || KPI_PALETTE.blue;
  }
 
  // tileHtml now accepts an optional color palette
  function tileHtml(icon,label,value,key,tooltip,showChange, palette){
    const pal = palette || paletteForKey(key);
    const iconBg = pal.lightBg;
    const accent = pal.accent;
    const valueColor = pal.text;
    return `
      <div class="card kpi-tile" data-key="${key}" title="${tooltip||''}" style="padding:12px;cursor:pointer;transition:transform .12s ease,box-shadow .12s ease;border-left:4px solid ${accent};box-shadow: 0 6px 18px rgba(15,23,42,0.04);">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;gap:12px;align-items:center;min-width:0">
            <div style="width:46px;height:46px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:900;color:${accent};background:${iconBg};flex:0 0 46px">
              ${iconToSvg(icon,18)}
            </div>
            <div style="min-width:0">
              <div style="font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</div>
              <div style="font-weight:900;font-size:1.05rem;margin-top:6px;color:${valueColor}">${value}</div>
            </div>
          </div>
          <div style="text-align:right">${showChange?`<div class="muted" style="font-size:0.85rem">vs prev</div><div class="muted" style="font-size:0.85rem">—</div>`:''}</div>
        </div>
      </div>
    `;
  }
 
  // balance tile uses palette depending on mode
  function tileHtmlToggleBalance(kpis, mode) {
    const studentsVal = formatMoney(kpis.totalStudentsBalanceCents);
    const teachersVal = formatMoney(kpis.totalTeachersBalanceCents);
    const shown = mode === 'students' ? studentsVal : teachersVal;
    const label = `Total Balance: ${mode === 'students' ? 'Students' : 'Teachers'}`;
    // choose palette: students -> red (owing), teachers -> blue (neutral)
    const pal = mode === 'students' ? KPI_PALETTE.red : KPI_PALETTE.blue;
    const iconBg = pal.lightBg;
    const accent = pal.accent;
    const valueColor = pal.text;
    return `
      <div class="card kpi-tile" data-key="total_balance" style="padding:12px;cursor:pointer;border-left:4px solid ${accent};box-shadow: 0 6px 18px rgba(15,23,42,0.04);">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;gap:12px;align-items:center">
            <div style="width:46px;height:46px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:900;color:${accent};background:${iconBg}">
              ${iconToSvg('mdi-scale',18)}
            </div>
            <div>
              <div style="font-weight:800">${label}</div>
              <div style="font-weight:900;font-size:1.05rem;margin-top:6px;color:${valueColor}">${shown}</div>
              <div style="margin-top:6px"><button id="kpi-balance-toggle" class="btn btn-ghost" style="padding:6px 8px">${mode === 'students' ? 'Switch to Teachers' : 'Switch to Students'}</button></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
 
  // renderKPIs now injects palette into each tile and adds hover behaviour wiring
  function renderKPIs(kpis) {
    kpisRoot.innerHTML = `
      ${tileHtml('mdi-school','Total Students', kpis.totalStudents, 'students', `Count of registered students`, false)}
      ${tileHtml('mdi-teacher','Total Teachers', kpis.totalTeachers, 'teachers', `Count of registered teachers`, false)}
      ${tileHtml('mdi-account-group','Total Staff', kpis.totalStaff, 'staff', `Count of registered staff`, false)}
      ${tileHtml('mdi-domain','Total Classes', kpis.totalClasses, 'classes', `Count of classes`, false)}
      ${tileHtml('mdi-book-open-page-variant','Total Subjects', kpis.totalSubjects, 'subjects', `Count of subjects`, false)}
 
      ${tileHtml('mdi-file-cabinet','Total Expense', formatMoney(kpis.totalExpenseCents), 'expense', `Total recorded non-payroll expenses between selected dates. Source: transactions (target_type='expense')`, true)}
      ${tileHtml('mdi-cash-multiple','Total Expenses+', formatMoney(kpis.totalExpensesPlusCents), 'expenses_plus', `Total Expenses+ = recorded expenses + staff payments + teacher payouts.`, true)}
      ${tileHtml('mdi-currency-usd','Total Revenue', formatMoney(kpis.totalRevenueCents), 'revenue', `Total Revenue = sum of student payments recorded in selected date range. Source: Payments/transactions`, true)}
      ${tileHtmlToggleBalance(kpis, totalBalanceMode)}
      ${tileHtml('mdi-chart-line','Total Profit', formatMoney(kpis.profitCents), 'profit', `Total Profit = Total Revenue − Total Expenses+`, true)}
    `;
 
    // small UX: subtle scale on hover for all tiles
    kpisRoot.querySelectorAll('.kpi-tile').forEach(tile => {
      tile.style.transition = 'transform .12s ease, box-shadow .12s ease';
      tile.addEventListener('mouseenter', () => { tile.style.transform = 'translateY(-4px)'; tile.style.boxShadow = '0 10px 30px rgba(15,23,42,0.08)'; });
      tile.addEventListener('mouseleave', () => { tile.style.transform = 'translateY(0)'; tile.style.boxShadow = '0 6px 18px rgba(15,23,42,0.04)'; });
    });
 
    // wire tile clicks
    kpisRoot.querySelectorAll('.kpi-tile').forEach(tile => tile.addEventListener('click', e => {
      const key = tile.dataset.key;
      openKpiDrillDown(key);
    }));
 
    // wire balance toggle preserved
    const toggleBtn = kpisRoot.querySelector('#kpi-balance-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        totalBalanceMode = totalBalanceMode === 'students' ? 'teachers' : 'students';
        localStorage.setItem('dashboard_total_balance_mode', totalBalanceMode);
        renderKPIs(computeKPIs(currentRange));
      });
    }
  }
 
 
 
 
 
 
 
  // ---------- drilldowns ----------
  function openKpiDrillDown(key) {
    if (key === 'students') { showPage && showPage('students'); }
    else if (key === 'teachers') { showPage && showPage('teachers'); }
    else if (key === 'staff') { renderPayments && renderPayments(); showPage && showPage('payments'); setTimeout(() => { const btn = document.getElementById('paymentsTabStaff'); if (btn) btn.click(); renderPaymentsList && renderPaymentsList('staff'); }, 200); }
    else if (key === 'classes') { showPage && showPage('classes'); }
    else if (key === 'subjects') { showPage && showPage('subjects'); }
    else if (key === 'expense' || key === 'expenses_plus') { renderPayments && renderPayments(); showPage && showPage('payments'); setTimeout(()=>{ const btn = document.getElementById('paymentsTabExpenses'); if (btn) btn.click(); renderPaymentsList && renderPaymentsList('expenses'); },200); }
    else if (key === 'revenue') { renderPayments && renderPayments(); showPage && showPage('payments'); setTimeout(()=>{ const btn = document.getElementById('paymentsTabStudents'); if (btn) btn.click(); renderPaymentsList && renderPaymentsList('students'); },200); }
    else if (key === 'total_balance') { if (totalBalanceMode === 'students') openOutstandingDrillDown('students'); else openOutstandingDrillDown('teachers'); }
    else if (key === 'profit') {
      const range = currentRange; const k = computeKPIs(range);
      const html = `
        <div><strong>Profit breakdown</strong></div>
        <div style="margin-top:8px">Total Revenue: <strong>${formatMoney(k.totalRevenueCents)}</strong></div>
        <div>Total Expense: <strong>${formatMoney(k.totalExpenseCents)}</strong></div>
        <div>Staff payments: <strong>${formatMoney(k.staffPaymentsCents)}</strong></div>
        <div>Teacher payouts: <strong>${formatMoney(k.teacherPaymentsCents)}</strong></div>
        <div style="margin-top:10px">Profit: <strong>${formatMoney(k.profitCents)}</strong></div>
        <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
          <button id="profitGoPayments" class="btn btn-ghost">Go to Payments (Students)</button>
          <button id="profitClose" class="btn btn-primary">Close</button>
        </div>
      `;
      showModal('Profit breakdown', html);
      modalBody.querySelector('#profitGoPayments').addEventListener('click', () => {
        closeModal();
        renderPayments && renderPayments();
        showPage && showPage('payments');
        setTimeout(()=>{ const btn = document.getElementById('paymentsTabStudents'); if (btn) btn.click(); renderPaymentsList && renderPaymentsList('students'); },200);
      });
      modalBody.querySelector('#profitClose').addEventListener('click', closeModal);
    }
  }
 
  function openOutstandingDrillDown(kind) {
    const rows = (kind === 'students' ? (studentsCache || []) : (teachersCache || [])).map((r) => ({
      id: r.studentId || r.id || r.uid || r._id,
      name: r.fullName || r.name || r.displayName || '—',
      balance_cents: getBalanceCents(r),
      className: typeof resolveClassName === 'function' ? resolveClassName(r) : (r.class || r.className || '—')
    })).filter(x => Number(x.balance_cents || 0) > 0).sort((a,b) => b.balance_cents - a.balance_cents);
 
    const body = document.createElement('div');
    body.innerHTML = `<div style="font-weight:900">${kind === 'students' ? 'Students' : 'Teachers'} outstanding</div>`;
    const table = document.createElement('div');
    table.style.marginTop = '8px';
    table.innerHTML = `<div style="max-height:60vh;overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th>No</th><th>Name / ID</th><th>Balance</th><th>Action</th></tr></thead><tbody>${
      rows.map((r, idx) => `<tr style="border-bottom:1px solid #f1f5f9"><td>${idx+1}</td><td>${escape(r.name)}<div class="muted">${escape(r.id||'')}</div></td><td>${formatMoney(r.balance_cents)}</td><td><button class="btn btn-primary record-pay" data-id="${escape(r.id)}">Record Payment</button> <button class="btn btn-ghost view-tx" data-id="${escape(r.id)}">View</button></td></tr>`).join('')
    }</tbody></table></div>`;
    body.appendChild(table);
    showModal(`${kind === 'students' ? 'Students' : 'Teachers'} Outstanding`, body.innerHTML);
    modalBody.querySelectorAll('.record-pay').forEach(b => b.addEventListener('click', ev => openPayModal(ev.currentTarget)));
    modalBody.querySelectorAll('.view-tx').forEach(b => b.addEventListener('click', ev => { const id = ev.currentTarget.dataset.id; if (typeof openViewTransactionsModal === 'function') openViewTransactionsModal(id); else if (typeof openViewTransactions === 'function') openViewTransactions(id); }));
  }
 
  // ---------- Charts ----------
  let paymentsChart = page._paymentsChart || null;
  let teachersChart = page._teachersChart || null;
 
  function aggregateTransactionsForChart(txs, range, granularity) {
    const buckets = {};
    const toKey = (ms) => {
      const d = new Date(ms);
      if (granularity === 'daily') return d.toISOString().slice(0,10);
      if (granularity === 'weekly') { const sat = new Date(d); while (sat.getDay() !== 6) sat.setDate(sat.getDate() - 1); return sat.toISOString().slice(0,10); }
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    };
 
    const labelsSet = new Set();
    const cursor = new Date(range.start);
    while (cursor.getTime() <= range.end) {
      labelsSet.add(toKey(cursor.getTime()));
      if (granularity === 'daily') cursor.setDate(cursor.getDate() + 1);
      else if (granularity === 'weekly') cursor.setDate(cursor.getDate() + 7);
      else cursor.setMonth(cursor.getMonth() + 1);
    }
 
    (txs || []).forEach(t => {
      const ms = tsToMs(t.createdAt);
      if (ms < range.start || ms > range.end) return;
      const k = toKey(ms);
      buckets[k] = (buckets[k] || 0) + Number(t.amount_cents || 0);
    });
 
    const labels = Array.from(labelsSet).sort();
    const series = labels.map(l => buckets[l] || 0);
    return { labels, series };
  }
 
  function renderCharts(range) {
    const allTxs = (transactionsCache || []).filter(t => !t.is_deleted);
    const payments = allTxs.filter(t => String(t.target_type).toLowerCase() === 'student' || t.type === 'monthly');
    const granPayments = page.querySelector('#chartPaymentsGranularity').value || 'monthly';
    const aggPayments = aggregateTransactionsForChart(payments, range, granPayments);
 
    const teachers = allTxs.filter(t => String(t.target_type).toLowerCase() === 'teacher' || String(t.type).toLowerCase() === 'salary' || String(t.target_type).toLowerCase() === 'staff');
    const granTeach = page.querySelector('#chartTeachersGranularity').value || 'monthly';
    const aggTeachers = aggregateTransactionsForChart(teachers, range, granTeach);
 
    if (typeof Chart === 'undefined') {
      if (chartPaymentsCanvas && chartPaymentsCanvas.getContext) chartPaymentsCanvas.getContext('2d').fillText('Chart.js not loaded', 10, 20);
      return;
    }
 
    chartPaymentsCanvas.style.height = '220px';
    if (paymentsChart) try { paymentsChart.destroy(); } catch(e) {}
    paymentsChart = new Chart(chartPaymentsCanvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: aggPayments.labels,
        datasets: [{
          label: 'Student payments',
          data: aggPayments.series.map(v => v/100),
          borderWidth: 0,
          backgroundColor: 'rgba(11,116,255,0.9)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${formatMoney(Math.round(ctx.raw*100))}`
            }
          }
        },
        scales: { y: { beginAtZero: true } }
      }
    });
    page._paymentsChart = paymentsChart;
 
    chartTeachersCanvas.style.height = '220px';
    if (teachersChart) try { teachersChart.destroy(); } catch(e) {}
    teachersChart = new Chart(chartTeachersCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: aggTeachers.labels,
        datasets: [{
          label: 'Teacher payouts',
          data: aggTeachers.series.map(v => v/100),
          borderWidth: 2,
          tension: 0.2,
          fill: false,
          borderColor: 'rgba(255,99,71,0.9)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${formatMoney(Math.round(ctx.raw*100))}`
            }
          }
        },
        scales: { y: { beginAtZero: true } }
      }
    });
    page._teachersChart = teachersChart;
 
    if (lastRefEl) {
      lastRefEl.textContent = `Last refreshed: ${new Date().toLocaleString()}`;
    }
        adjustChartsLayoutForViewport();
  }
 
  // Call this inside renderCharts (at the end) or after renderCharts(currentRange)
 function adjustChartsLayoutForViewport() {
   const chartsRow = page.querySelector('#chartsRow');
   if (!chartsRow) return;
   if (isMobileViewport && isMobileViewport()) {
     // stack vertically on mobile
     chartsRow.style.gridTemplateColumns = '1fr';
     // ensure Student Payments card comes before Teacher Payments
     const paymentsCard = chartsRow.querySelector('#chartPayments') ? chartsRow.querySelector('#chartPayments').closest('.card') : null;
     const teachersCard = chartsRow.querySelector('#chartTeachers') ? chartsRow.querySelector('#chartTeachers').closest('.card') : null;
     if (paymentsCard && teachersCard) {
       chartsRow.appendChild(paymentsCard); // append in order: payments first
       chartsRow.appendChild(teachersCard);
     }
   } else {
     // restore two-column desktop layout
     chartsRow.style.gridTemplateColumns = '1fr 1fr';
   }
 }
 // usage: call adjustChartsLayoutForViewport() at end of renderCharts(currentRange)
 
 
 function renderOutstandingTable(range){
  // helpers (keep same logic as your original)
  function monthsCountBetween(startMs, endMs){
    if(!startMs || !endMs) return 0;
    const s = new Date(startMs); s.setDate(1); s.setHours(0,0,0,0);
    const e = new Date(endMs);   e.setDate(1); e.setHours(0,0,0,0);
    let count = 0;
    while(s.getTime() <= e.getTime()){
      count++;
      s.setMonth(s.getMonth() + 1);
    }
    return count;
  }
  function txMatchesStudent(tx, student){
    if(!tx || !student) return false;
    const candidates = [ String(student.studentId||''), String(student.id||''), String(student.uid||''), String(student._id||'') ].filter(Boolean);
    const targetId = String(tx.target_id||tx.target||'');
    return candidates.includes(targetId);
  }

  const monthsInRange = monthsCountBetween(range.start, range.end) || 1;
  const students = (studentsCache || []);

  // build normalized rows (and filter conservatively to student-like records only)
  const rows = students.map(s => {
    let feeVal = 0;
    if (s.fee != null && s.fee !== '') feeVal = Number(s.fee) || 0;
    else if (s.monthlyFee != null) feeVal = Number(s.monthlyFee) || 0;
    const feeCents = Math.round(feeVal * 100);
    const assignedForRange = feeCents * monthsInRange;

    const payments = (transactionsCache || []).filter(tx => {
      if(tx.is_deleted) return false;
      const ms = (tx.createdAt && (tx.createdAt.seconds || tx.createdAt._seconds)) ? ((tx.createdAt.seconds || tx.createdAt._seconds) * 1000) : (tsToMs(tx.createdAt) || 0);
      if(ms < range.start || ms > range.end) return false;
      const ttype = String(tx.type || '').toLowerCase();
      const isPaymentType = ttype === 'monthly' || ttype === 'payment' || String(tx.target_type||'').toLowerCase()==='student';
      if(!isPaymentType) return false;
      return txMatchesStudent(tx, s);
    });
    const paymentsReceivedCents = payments.reduce((sum,tx)=> sum + (Number(tx.amount_cents || 0)), 0);

    let outstandingCents = Math.max(0, Math.round(assignedForRange || 0) - Math.round(paymentsReceivedCents || 0));
    if (outstandingCents === 0) {
      const bal = getBalanceCents(s);
      if (Number(bal) !== 0) outstandingCents = Math.abs(Number(bal) || 0);
    }

    return {
      id: s.studentId || s.id || s.uid || s._id || '',
      name: s.fullName || s.name || s.displayName || '—',
      className: (typeof resolveClassName === 'function') ? resolveClassName(s) : (s.class || s.className || '—'),
      owing_cents: outstandingCents,
      rawAssignedCents: assignedForRange,
      rawPaymentsReceivedCents: paymentsReceivedCents,
      phone: s.parentPhone || s.phone || '—',
      sourceRecord: s
    };
  }).filter(r => {
    // Conservative student filter: require at least one student-identifying field.
    const sr = r.sourceRecord || {};
    const isStudentLike = Boolean(r.id) || Boolean(sr.class) || Boolean(sr.monthlyFee) || Boolean(sr.fee) || Boolean(sr.parentPhone);
    return isStudentLike;
  });

  // Top 10 owe rows
  const oweRows = rows.filter(r => Number(r.owing_cents || 0) > 0).sort((a,b)=> b.owing_cents - a.owing_cents);
  const top10 = oweRows.slice(0,10);

  // update range display if present
  if (typeof outstandingRange !== 'undefined' && outstandingRange) outstandingRange.textContent = `${new Date(range.start).toLocaleDateString()} — ${new Date(range.end).toLocaleDateString()}`;

  if(!top10.length){
    outstandingTableRoot.innerHTML = `<div class="muted" style="padding:12px">No outstanding student payments found for the selected period.</div>`;
    return;
  }

  // Build mobile header (mobile-only)
  const headerHtml = `
<div class="mobile-top10-header mobile-only">
  <div class="h-title">Top 10 Outstanding Student Payments</div>
  <div class="h-sub">${new Date(range.start).toLocaleDateString()} — ${new Date(range.end).toLocaleDateString()}</div>

  <div class="h-row">
    <input id="outstandingSearch" type="search" placeholder="Search name / ID" />
  </div>

  <div class="h-actions">
    <button id="exportOutstandingCsv" class="btn btn-ghost">Export CSV</button>
    <button id="sendOutstandingReminder" class="btn btn-primary">Send Reminder</button>
  </div>
</div>
`;

  // Build mobile rows (using classes so CSS rules apply)
  let mobileListHtml = `<div class="mobile-only" style="display:flex;flex-direction:column;gap:8px">`;
  top10.forEach((r, idx) => {
    mobileListHtml += `
      <div class="list-row" data-name="${escape(String(r.name||'').toLowerCase())}" data-id="${escape(String(r.id||'').toLowerCase())}">
        <div class="row-left">
          <div class="no-badge">${idx+1}</div>
          <div style="min-width:0">
            <div class="title">${escape(r.name)}</div>
            <div class="sub id">ID: ${escape(String(r.id))} • ${escape(r.className)}</div>
          </div>
        </div>

        <div class="amount">${formatMoney(r.owing_cents)}</div>

        <div class="row-actions" aria-hidden="false">
          <button class="btn record-pay btn-primary" data-id="${escape(r.id)}" title="Record payment">${svgPay()}</button>
          <button class="btn view-trans" data-id="${escape(r.id)}" title="View transactions">${svgView()}</button>
        </div>
      </div>
    `;
  });
  mobileListHtml += `</div>`;

  // Build desktop table (kept separate)
  let desktopHtml = `<div class="desktop-only"><div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr>
      <th>No</th><th>Name (ID)</th><th>Class</th><th style="text-align:right">Outstanding</th><th>Assigned</th><th>Paid (period)</th><th>Actions</th>
    </tr></thead><tbody>`;
  top10.forEach((r, idx) => {
    desktopHtml += `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px">${idx+1}</td>
      <td style="padding:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div style="min-width:0">
            <div style="font-weight:900">${escape(r.name)}</div>
            <div class="muted">${escape(r.id)}</div>
          </div>
          <div style="text-align:right;font-weight:900;color:#b91c1c">${formatMoney(r.owing_cents)}</div>
        </div>
      </td>
      <td style="padding:8px;text-align:right">${formatMoney(r.rawAssignedCents)}</td>
      <td style="padding:8px;text-align:right;color:#059669">${formatMoney(r.rawPaymentsReceivedCents)}</td>
      <td style="padding:8px">
        <button class="btn btn-primary btn-sm record-pay" data-id="${escape(r.id)}" title="Record payment">${svgPay()}</button>
        <button class="btn btn-ghost btn-sm view-trans" data-id="${escape(r.id)}" title="View transactions">${svgView()}</button>
      </td>
    </tr>`;
  });
  desktopHtml += `</tbody></table></div></div>`;

  // Inject into DOM
  outstandingTableRoot.innerHTML = headerHtml + mobileListHtml + desktopHtml;

  // Wire actions for record-pay & view-trans (both mobile & desktop)
  outstandingTableRoot.querySelectorAll('.record-pay').forEach(b => {
    b.addEventListener('click', ev => {
      const id = ev.currentTarget.dataset.id;
      openPayModal({ dataset: { id } });
    });
  });
  outstandingTableRoot.querySelectorAll('.view-trans').forEach(b => {
    b.addEventListener('click', ev => {
      const id = ev.currentTarget.dataset.id;
      if (typeof openViewTransactionsModal === 'function') openViewTransactionsModal({ dataset: { id } });
      else if (typeof openViewTransactions === 'function') openViewTransactions(id);
    });
  });

  // Live search filter for mobile rows (no re-render)
  const searchInput = outstandingTableRoot.querySelector('#outstandingSearch');
  if (searchInput) {
    searchInput.value = ''; // reset
    searchInput.addEventListener('input', (ev) => {
      const q = String(ev.target.value || '').trim().toLowerCase();
      outstandingTableRoot.querySelectorAll('.mobile-only .list-row').forEach(row => {
        const name = row.dataset.name || '';
        const idv = row.dataset.id || '';
        if (!q || name.includes(q) || idv.includes(q)) row.style.display = '';
        else row.style.display = 'none';
      });
    });
  }

  // Export / reminder hooks (if you have handlers)
  const expBtn = outstandingTableRoot.querySelector('#exportOutstandingCsv');
  if (expBtn) expBtn.onclick = () => { if (typeof exportOutstandingCsv === 'function') exportOutstandingCsv(); else if (typeof exportCsvFromDashboard === 'function') exportCsvFromDashboard(); else toast && toast('Export not implemented'); };
  const remBtn = outstandingTableRoot.querySelector('#sendOutstandingReminder');
  if (remBtn) remBtn.onclick = () => { if (typeof sendOutstandingReminder === 'function') sendOutstandingReminder(); else toast && toast('Reminder not implemented'); };
}

 
 
 // New helper: show full marks for a student + exam with exam picker + ranks/summary
 async function getStudentExamResults(studentId, examId){
   // 1️⃣ Prefer examTotals cache (finalized results)
   if(typeof examTotalsCache !== 'undefined'
      && examTotalsCache
      && examTotalsCache[examId]
      && examTotalsCache[examId][studentId]){
 
     const r = examTotalsCache[examId][studentId];
 
     return {
       subjects: (r.subjects || []).map(s => ({
         subject: s.subject || s.name,
         components: s.components || {},
         exam: Number(s.exam || 0),
         total: Number(s.total || s.score || 0),
         max: Number(s.max || 0)
       })),
       average: Number(r.average || r.total || 0)
     };
   }
 
   // 2️⃣ Fallback: examResultsCache (draft/manual entries)
   const list = (typeof examResultsCache !== 'undefined'
     ? examResultsCache
     : window.examResultsCache) || [];
 
   const found = list.find(r =>
     String(r.examId) === String(examId) &&
     String(r.studentId) === String(studentId)
   );
 
   if(found){
     return {
       subjects: (found.subjects || []).map(s => ({
         subject: s.subject,
         components: s.components || {},
         exam: Number(s.exam || 0),
         total: Number(s.total || 0),
         max: Number(s.max || 0)
       })),
       average: Number(found.average || found.total || 0)
     };
   }
 
   // 3️⃣ Nothing found
   return null;
 }
 
 async function openStudentMarksModal(studentId, examIdInput){
   const student = findStudentByRef(studentId) || {};
   const allExams = (examsCache || []).slice();
   const publishedExams = allExams.filter(e => e.status === 'published');
   let selectedExamId = examIdInput || (publishedExams[0] && publishedExams[0].id) || (allExams[0] && allExams[0].id) || '';
 
   const mobile = (typeof isMobileViewport === 'function') ? isMobileViewport() : (window.matchMedia && window.matchMedia('(max-width:768px)').matches);
 
   const compPretty = { assignment:'Assignment', quiz:'Quiz', monthly:'Monthly', cw1:'CW1', cw2:'CW2', exam:'Exam', linked:'Linked' };
 
   function gradeColor(pct){
     if (pct >= 90) return { color:'#064e3b', bg:'rgba(5,150,105,0.08)', letter:'A' };
     if (pct >= 75) return { color:'#1e3a8a', bg:'rgba(37,99,235,0.06)', letter:'B' };
     if (pct >= 60) return { color:'#92400e', bg:'rgba(245,158,11,0.06)', letter:'C' };
     return { color:'#7f1d1d', bg:'rgba(239,68,68,0.06)', letter:'D' };
   }
 
   // normalize single subject item -> { subject, components, exam, compSum, linked, total, max }
   function normalizeSubjectEntry(s){
     const subjName = s.subject || s.name || s.title || '—';
     let components = {};
     if (s.components && typeof s.components === 'object') {
       Object.keys(s.components).forEach(k => {
         const v = s.components[k];
         if (v == null) components[k] = 0;
         else if (typeof v === 'object') components[k] = Number(v.total ?? v.mark ?? v.value ?? v.amount ?? 0);
         else components[k] = Number(v || 0);
       });
     }
     if (s.marks && typeof s.marks === 'object') {
       Object.keys(s.marks).forEach(k => { if (!(k in components)) components[k] = Number(s.marks[k] || 0); });
     }
 
     const topExam = (typeof s.exam !== 'undefined' && s.exam !== null && s.exam !== '') ? Number(s.exam) : 0;
     const examPart = Math.round(Number(components.exam ?? topExam ?? 0)) || 0;
 
     let linkedPart = 0;
     if (typeof components.linked !== 'undefined') {
       const l = components.linked;
       linkedPart = (typeof l === 'object') ? Number(l.total ?? l.mark ?? l.value ?? 0) : Number(l || 0);
     } else if (s.linked && typeof s.linked === 'object') {
       linkedPart = Number(s.linked.total ?? s.linked.mark ?? 0);
     }
 
     const compKeys = ['assignment','quiz','monthly','cw1','cw2'];
     let compSum = 0;
     compKeys.forEach(k => { compSum += Number(components[k] || 0); });
 
     // enforce total = exam + components (non-exam) + linked
     const computedTotal = Math.round(examPart + compSum + (linkedPart || 0));
     const maxVal = Math.round(Number(s.max ?? s.maximum ?? s.max_mark ?? 0) || 0);
 
     return {
       subject: subjName,
       components,
       exam: examPart,
       compSum,
       linked: Math.round(linkedPart || 0),
       total: computedTotal,
       max: maxVal
     };
   }
 
   
   // compute ranks (preferred: examTotalsCache -> examResultsCache). returns object.
   async function computeRanksForStudent(examId, studentId){
     try {
       const buildFromMap = mapObj => {
         const arr = Object.keys(mapObj).map(sid => {
           const r = mapObj[sid] || {};
           const total = Number(r.total ?? r.average ?? r.score ?? r.totalScore ?? 0);
           const sc = findStudentByRef(sid) || (studentsCache||[]).find(st => String(st.studentId||st.id||st.uid||st._id) === String(sid));
           const className = sc ? (sc.classId || sc.class || sc.className || '') : (r.classId || r.className || r.class || '');
           return { studentId: sid, total: Number(total || 0), className: String(className || '—') };
         }).filter(x => !isNaN(x.total));
         return arr;
       };
 
       if (typeof examTotalsCache !== 'undefined' && examTotalsCache && examTotalsCache[examId]){
         const mapObj = examTotalsCache[examId];
         const arr = buildFromMap(mapObj);
         if (arr.length){
           arr.sort((a,b)=> b.total - a.total);
           const schoolCount = arr.length;
           const schoolRankMap = {}; arr.forEach((it,i)=> schoolRankMap[it.studentId] = i+1);
           const classGroups = {};
           arr.forEach(it => { (classGroups[it.className] = classGroups[it.className] || []).push(it); });
           const classRankMap = {}; const classCountMap = {};
           Object.keys(classGroups).forEach(cn => {
             classGroups[cn].sort((a,b)=> b.total - a.total);
             classCountMap[cn] = classGroups[cn].length;
             classGroups[cn].forEach((it,i) => classRankMap[it.studentId] = i+1);
           });
           const sRank = schoolRankMap[studentId] || null;
           const cRank = classRankMap[studentId] || null;
           const studRec = findStudentByRef(studentId) || (studentsCache||[]).find(st => String(st.studentId||st.id||st.uid||st._id) === String(studentId)) || {};
           const studClass = String(studRec.classId || studRec.class || studRec.className || '');
           const classCount = classCountMap[studClass] || classCountMap['—'] || 0;
           return { classRank: cRank, schoolRank: sRank, classCount: classCount || 0, schoolCount };
         }
       }
 
       const examResultsList = (typeof examResultsCache !== 'undefined' && examResultsCache) ? examResultsCache : (window.examResultsCache || []);
       const filtered = examResultsList.filter(rr => String(rr.examId) === String(examId));
       if (filtered.length){
         const arr = filtered.map(r => {
           const sid = String(r.studentId || r.student || r.sid || '');
           const total = Number(r.total ?? r.average ?? r.score ?? 0) || 0;
           const sc = findStudentByRef(sid) || (studentsCache||[]).find(st => String(st.studentId||st.id||st.uid||st._id) === String(sid));
           const className = sc ? (sc.classId || sc.class || sc.className || '') : (r.classId || r.className || r.class || '');
           return { studentId: sid, total, className: String(className || '—') };
         }).filter(x => x.studentId);
         if (arr.length){
           arr.sort((a,b)=> b.total - a.total);
           const schoolCount = arr.length;
           const schoolRankMap = {}; arr.forEach((it,i)=> schoolRankMap[it.studentId] = i+1);
           const classGroups = {};
           arr.forEach(it => { (classGroups[it.className] = classGroups[it.className] || []).push(it); });
           const classRankMap = {}; const classCountMap = {};
           Object.keys(classGroups).forEach(cn => {
             classGroups[cn].sort((a,b)=> b.total - a.total);
             classCountMap[cn] = classGroups[cn].length;
             classGroups[cn].forEach((it,i) => classRankMap[it.studentId] = i+1);
           });
           const sRank = schoolRankMap[studentId] || null;
           const cRank = classRankMap[studentId] || null;
           const studRec = findStudentByRef(studentId) || (studentsCache||[]).find(st => String(st.studentId||st.id||st.uid||st._id) === String(studentId)) || {};
           const studClass = String(studRec.classId || studRec.class || studRec.className || '');
           const classCount = classCountMap[studClass] || 0;
           return { classRank: cRank, schoolRank: sRank, classCount: classCount || 0, schoolCount };
         }
       }
 
       return { classRank: null, schoolRank: null, classCount: 0, schoolCount: 0 };
     } catch(e){
       console.warn('computeRanksForStudent error', e);
       return { classRank: null, schoolRank: null, classCount: 0, schoolCount: 0 };
     }
   }
 
   // render for a chosen exam; tries to reload caches if no results initially
   async function renderForExam(examId){
     // ensure examTotals/examResults loaded if available
     try {
       if (typeof loadExamTotalsForExam === 'function') await loadExamTotalsForExam(examId);
       if (typeof loadExamResults === 'function') await loadExamResults(examId);
     } catch(e){ /* ignore */ }
 
     // inside renderForExam(examId), add this near the top before using `exam`
 const exam = (examsCache || []).find(e => String(e.id) === String(examId)) || (allExams.find(e => String(e.id) === String(examId)) || {});
 
     // fetch results (helper)
     let results = await getStudentExamResults(studentId, examId);
     // if nothing, try an additional cache refresh and retry once
     if ((!results || !Array.isArray(results.subjects) || results.subjects.length === 0) && typeof loadExamTotalsForExam === 'function'){
       try {
         await loadExamTotalsForExam(examId);
         results = await getStudentExamResults(studentId, examId);
       } catch(e){ /* ignore */ }
     }
 
     if(!results || !Array.isArray(results.subjects) || results.subjects.length === 0){
       modalBody.innerHTML = `<div class="muted" style="padding:12px">No results found for this student / exam.</div>`;
       return;
     }
 
     const normalized = results.subjects.map(normalizeSubjectEntry);
 
     // find top subject
     let topTotal = -Infinity, topIndex = -1;
     normalized.forEach((s,i) => { if ((s.total || 0) > topTotal){ topTotal = s.total || 0; topIndex = i; } });
 
     // ranks — prefer values in results, else compute
     let classRankVal = results.classRank ?? results.class_rank ?? null;
     let schoolRankVal = results.schoolRank ?? results.school_rank ?? null;
     let classCount = 0, schoolCount = 0;
     if (classRankVal == null || schoolRankVal == null){
       const ranks = await computeRanksForStudent(examId, String(studentId));
       classRankVal = classRankVal ?? ranks.classRank;
       schoolRankVal = schoolRankVal ?? ranks.schoolRank;
       classCount = classCount || ranks.classCount;
       schoolCount = schoolCount || ranks.schoolCount;
     }
 
     // fallback counts from studentsCache
     if (!classCount || !schoolCount){
       try {
         const students = (studentsCache || []).filter(st => !(st.status === 'deleted'));
         schoolCount = schoolCount || students.length;
         const targetClassId = String(student.classId || student.class || student.className || '');
         classCount = classCount || students.filter(st => String(st.classId || st.class || st.className || '') === targetClassId).length || 0;
       } catch(e){}
     }
 
     // build rows + compute totals
     let grandTotal = 0, grandMax = 0;
     const rows = normalized.map((s, idx) => {
       const assignedParts = [];
       ['assignment','quiz','monthly','cw1','cw2'].forEach(k => {
         const v = Number(s.components?.[k] || 0);
         if (v > 0) assignedParts.push(`${compPretty[k] || k}: ${v}`);
       });
       const lval = Number(s.linked || 0);
       if (lval > 0) assignedParts.push(`${compPretty.linked}: ${lval}`);
       const assignedDisplay = assignedParts.length ? assignedParts.join(' • ') : '—';
 
       grandTotal += Number(s.total || 0);
       grandMax += Number(s.max || 0);
 
       const subjPct = (s.max && s.max > 0) ? ((s.total || 0) / s.max) * 100 : 0;
       const gc = gradeColor(subjPct);
       const highlight = (idx === topIndex);
 
       return { idx, s, assignedDisplay, subjPct, gc, highlight };
     });
 
     const totalObtained = grandTotal;
     const totalMax = grandMax || 0;
     const avgPercent = totalMax ? (totalObtained / totalMax) * 100 : 0;
     const avgGrade = gradeColor(avgPercent).letter;
 
     // exam options
     const examOptionsHtml = (allExams.length ? allExams.map(e => `<option value="${escape(e.id)}" ${String(e.id)===String(examId)?'selected':''}>${escape(e.name||e.id)}${e.status? ' • ' + escape(e.status):''}</option>`).join('') : `<option value="">No exams</option>`);
 
     // prepare modal HTML (same as before) but we include grade letter in header
     let html = `
       <div style="display:flex;flex-direction:${mobile ? 'column' : 'row'};gap:8px;align-items:${mobile ? 'stretch' : 'center'};justify-content:space-between;margin-bottom:10px">
         <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
           <div style="font-weight:800">${escape(student.fullName || student.name || '—')}</div>
           <div class="muted">ID: ${escape(studentId)} • Class: ${escape(student.classId || student.class || '—')}</div>
         </div>
         <div style="display:flex;gap:8px;align-items:center">
           <select id="marksExamSelect" style="padding:6px;border-radius:8px">${examOptionsHtml}</select>
           <button id="exportMarksPdf" class="btn btn-ghost">Export PDF</button>
           <button id="printMarks" class="btn btn-ghost">Print</button>
           <button id="closeMarks" class="btn btn-ghost">Close</button>
         </div>
       </div>
 
       <div style="display:flex;gap:12px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
         <div style="font-weight:800">${escape(exam.name || examId || 'Exam')}</div>
         <div class="muted">Class Rank: <strong>${escape(classRankVal ? String(classRankVal) : '—')}/${escape(classCount || '—')}</strong> • School Rank: <strong>${escape(schoolRankVal ? String(schoolRankVal) : '—')}/${escape(schoolCount || '—')}</strong></div>
         <div style="margin-left:auto" class="muted">Total: <strong id="marksTotalBadge">${escape(String(totalObtained))} / ${escape(String(totalMax))}</strong> • Avg: <strong id="marksAvgBadge">${Number(avgPercent).toFixed(1)}%</strong> • Grade: <strong>${escape(String(avgGrade))}</strong></div>
       </div>
 
       <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
         <div style="font-size:0.9rem;color:#064e3b;background:rgba(5,150,105,0.06);padding:6px;border-radius:6px">A ≥ 90%</div>
         <div style="font-size:0.9rem;color:#1e3a8a;background:rgba(37,99,235,0.06);padding:6px;border-radius:6px">B ≥ 75%</div>
         <div style="font-size:0.9rem;color:#92400e;background:rgba(245,158,11,0.06);padding:6px;border-radius:6px">C ≥ 60%</div>
         <div style="font-size:0.9rem;color:#7f1d1d;background:rgba(239,68,68,0.06);padding:6px;border-radius:6px">D &lt; 60%</div>
       </div>
     `;
 
     // desktop or mobile representation
     if (!mobile){
       html += `
         <div style="overflow:auto">
           <table id="marksTable" style="width:100%;border-collapse:collapse;font-size:14px">
             <thead>
               <tr style="background:#f1f5f9">
                 <th style="padding:8px;text-align:left">Subject</th>
                 <th style="padding:8px;text-align:left">Components Assigned</th>
                 <th style="padding:8px;text-align:center">Exam</th>
                 <th style="padding:8px;text-align:center">Total</th>
                 <th style="padding:8px;text-align:center">Max</th>
                 <th style="padding:8px;text-align:center">Grade</th>
               </tr>
             </thead>
             <tbody>
               ${rows.map(r => {
                 const s = r.s;
                 const colorStyle = `color:${r.gc.color};background:${r.gc.bg};border-radius:6px;padding:6px 8px;display:inline-block;font-weight:700`;
                 const rowBg = r.highlight ? 'background:linear-gradient(90deg, rgba(255,250,230,0.6), transparent);' : '';
                 return `<tr style="${rowBg}"><td style="padding:8px;vertical-align:top">${escape(s.subject)}</td><td style="padding:8px;vertical-align:top" class="muted">${escape(r.assignedDisplay)}</td><td style="padding:8px;text-align:center;vertical-align:top">${escape(String(Math.round(s.exam || 0)))}</td><td style="padding:8px;text-align:center;vertical-align:top;font-weight:800">${escape(String(Math.round(s.total || 0)))}</td><td style="padding:8px;text-align:center;vertical-align:top">${escape(String(Math.round(s.max || 0)))}</td><td style="padding:8px;text-align:center;vertical-align:top"><span style="${colorStyle}">${escape(r.gc.letter)}</span></td></tr>`; 
               }).join('')}
             </tbody>
           </table>
         </div>
       `;
     } else {
       html += `<div id="marksMobileList" style="display:flex;flex-direction:column;gap:10px">`;
       rows.forEach(r=>{
         const s = r.s;
         const colorStyle = `color:${r.gc.color};background:${r.gc.bg};border-radius:6px;padding:6px 8px;font-weight:700`;
         const highlightStyle = r.highlight ? 'box-shadow:0 6px 18px rgba(0,0,0,0.06);' : '';
         html += `
           <div style="border:1px solid #f1f5f9;padding:10px;border-radius:8px;${highlightStyle}">
             <div style="display:flex;justify-content:space-between;align-items:center">
               <div style="font-weight:800">${escape(s.subject)}</div>
               <div style="${colorStyle}">${escape(r.gc.letter)}</div>
             </div>
             <div style="margin-top:6px" class="muted">${escape(r.assignedDisplay)}</div>
             <div style="display:flex;gap:12px;margin-top:8px;align-items:center">
               <div style="flex:1">Exam: <strong>${escape(String(Math.round(s.exam||0)))}</strong></div>
               <div style="flex:1;text-align:center">Total: <strong>${escape(String(Math.round(s.total||0)))}</strong></div>
               <div style="flex:1;text-align:right">Max: <strong>${escape(String(Math.round(s.max||0)))}</strong></div>
             </div>
           </div>
         `;
       });
       html += `</div>`;
     }
 
     // set modal content
     modalBody.innerHTML = html;
 
     // --- wiring ---
 
     // exam select change: try to re-render selected exam (retry loads inside renderForExam)
     const sel = modalBody.querySelector('#marksExamSelect');
     if (sel){
       sel.onchange = async (ev) => {
         selectedExamId = ev.target.value;
         // ensure selectedExamId is used for PDF/print
         await renderForExam(selectedExamId);
       };
     }
 
     // Build a clean report HTML for export/print (no buttons)
     function buildPrintableReportHtml(){
       const header = `
         <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif;padding:12px">
           <h2 style="margin:0">${escape(student.fullName || student.name || '')}</h2>
           <div style="margin-top:6px">ID: ${escape(studentId)} • Class: ${escape(student.classId || student.class || '—')}</div>
           <div style="margin-top:6px">Exam: ${escape(exam.name || selectedExamId || '')}</div>
           <div style="margin-top:6px">Class Rank: ${escape(classRankVal ? String(classRankVal) : '—')}/${escape(classCount || '—')} • School Rank: ${escape(schoolRankVal ? String(schoolRankVal) : '—')}/${escape(schoolCount || '—')}</div>
           <div style="margin-top:6px">Total: ${escape(String(totalObtained))} / ${escape(String(totalMax))} • Avg: ${Number(avgPercent).toFixed(1)}% • Grade: ${escape(String(avgGrade))}</div>
         </div>
       `;
       // table rows
       const rowsHtml = normalized.map(s => {
         const assignedParts = [];
         ['assignment','quiz','monthly','cw1','cw2'].forEach(k => {
           const v = Number(s.components?.[k] || 0);
           if (v > 0) assignedParts.push(`${compPretty[k] || k}: ${v}`);
         });
         const l = Number(s.linked || 0);
         if (l>0) assignedParts.push(`${compPretty.linked}: ${l}`);
         const assignedDisplay = assignedParts.length ? assignedParts.join(' • ') : '—';
         const pct = (s.max && s.max>0) ? ((s.total||0)/s.max)*100 : 0;
         const grade = gradeColor(pct).letter;
         return `<tr>
           <td style="padding:6px;border:1px solid #ddd">${escape(s.subject)}</td>
           <td style="padding:6px;border:1px solid #ddd">${escape(assignedDisplay)}</td>
           <td style="padding:6px;border:1px solid #ddd;text-align:center">${escape(String(s.exam||0))}</td>
           <td style="padding:6px;border:1px solid #ddd;text-align:center">${escape(String(s.total||0))}</td>
           <td style="padding:6px;border:1px solid #ddd;text-align:center">${escape(String(s.max||0))}</td>
           <td style="padding:6px;border:1px solid #ddd;text-align:center">${escape(grade)}</td>
         </tr>`; 
       }).join('');
       const table = `<table style="width:100%;border-collapse:collapse;font-family:Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif"><thead><tr><th style="padding:8px;border:1px solid #ddd;background:#f8fafc">Subject</th><th style="padding:8px;border:1px solid #ddd;background:#f8fafc">Components Assigned</th><th style="padding:8px;border:1px solid #ddd;background:#f8fafc">Exam</th><th style="padding:8px;border:1px solid #ddd;background:#f8fafc">Total</th><th style="padding:8px;border:1px solid #ddd;background:#f8fafc">Max</th><th style="padding:8px;border:1px solid #ddd;background:#f8fafc">Grade</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
       return `<div>${header}${table}</div>`;
     }
 
     // Export PDF: create clean report and render via html2canvas/jsPDF
     const exportBtn = modalBody.querySelector('#exportMarksPdf');
     if (exportBtn){
       exportBtn.onclick = async () => {
         try {
           const reportHtml = buildPrintableReportHtml();
           // create a hidden container in DOM
           let tmp = document.getElementById('_marks_print_area_tmp');
           if (tmp) tmp.remove();
           tmp = document.createElement('div');
           tmp.id = '_marks_print_area_tmp';
           tmp.style.position = 'fixed';
           tmp.style.left = '-9999px';
           tmp.style.top = '0';
           tmp.innerHTML = reportHtml;
           document.body.appendChild(tmp);
 
           if (typeof html2canvas !== 'undefined' && window.jspdf){
             const canvas = await html2canvas(tmp, { scale: 2, useCORS: true });
             const img = canvas.toDataURL('image/png');
             const { jsPDF } = window.jspdf;
             const pdf = new jsPDF('landscape', 'pt', 'a4');
             const pageWidth = pdf.internal.pageSize.getWidth();
             const pageHeight = pdf.internal.pageSize.getHeight();
             const imgW = canvas.width;
             const imgH = canvas.height;
             const ratio = Math.min(pageWidth / imgW, pageHeight / imgH);
             const w = imgW * ratio;
             const h = imgH * ratio;
             pdf.addImage(img, 'PNG', (pageWidth - w)/2, 10, w, h - 20);
             pdf.save(`marks_${String(studentId)}_${String(selectedExamId)}.pdf`);
           } else {
             // fallback: open print window with clean html
             const popup = window.open('', '_blank', 'width=900,height=700');
             popup.document.write(reportHtml);
             popup.document.close();
             popup.focus();
             setTimeout(()=> popup.print(), 400);
           }
           tmp.remove();
         } catch(err){
           console.error('export pdf err', err);
           toast('PDF export failed, using print fallback');
           // fallback to print
           const popup = window.open('', '_blank', 'width=900,height=700');
           popup.document.write(buildPrintableReportHtml());
           popup.document.close();
           popup.focus();
           setTimeout(()=> popup.print(), 400);
         }
       };
     }
 
     // Print — use printable report html so everything (ranks, grade, totals) is present
     const printBtn = modalBody.querySelector('#printMarks');
     if (printBtn){
       printBtn.onclick = () => {
         const html = buildPrintableReportHtml();
         const popup = window.open('', '_blank', 'width=900,height=700');
         if (!popup) { toast('Popup blocked — allow popups to print'); return; }
         popup.document.write(`<!doctype html><html><head><title>Marks — ${escape(student.fullName||student.name||'')}</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`);
         popup.document.close();
         popup.focus();
         setTimeout(()=> popup.print(), 400);
       };
     }
 
     // close button
     const closeBtn = modalBody.querySelector('#closeMarks');
     if (closeBtn) closeBtn.onclick = closeModal;
 
     // update badges
     const tBadge = modalBody.querySelector('#marksTotalBadge');
     const aBadge = modalBody.querySelector('#marksAvgBadge');
     if (tBadge) tBadge.textContent = `${String(totalObtained)} / ${String(totalMax)}`;
     if (aBadge) aBadge.textContent = `${Number(avgPercent).toFixed(1)}%`;
   }
 
   // show modal and render initial exam
   const title = `📊 ${escape(student.fullName || student.name || '')}`;
   showModal(title, `<div style="padding:12px"><div class="muted">Loading marks…</div></div>`);
   try {
     await renderForExam(selectedExamId);
   } catch(err){
     console.error('renderForExam failed', err);
     modalBody.innerHTML = `<div class="muted" style="padding:12px">Failed to render marks</div>`;
   }
 }
 
 
 
 
 
 // Drop-in replacement for renderLeaderboard()
 async function renderLeaderboard() {
  const kind = leaderboardKind.value;
  const examId = leaderboardExamSel.value;
  leaderboardExamInfo.textContent = examId ? `Exam: ${examId}` : 'No exam selected';
 

  const exam = (examsCache || []).find(e => String(e.id) === String(examId)) || {};
const examDate = exam.publishedAt ? new Date(tsToMs(exam.publishedAt)).toLocaleDateString() : '—';

const leaderboardHeaderMobile = `
<div class="mobile-top10-header">
  <div class="h-title">Top-10 Students (Exam leaderboard)</div>
  <div class="h-sub">Exam: ${escape(examId)}</div>
  <div class="h-sub">Top 10 — ${leaderboardKind.value === 'class' ? escape(leaderboardClassSel.value) : 'School'}</div>

  <div class="h-actions" style="justify-content:space-between">
    <div class="muted">${escape(exam.name || 'Exam')} • ${examDate}</div>
    <button id="exportLeaderboardCsv" class="btn btn-ghost">Export</button>
  </div>
</div>
`;

  if (!examId) {
    leaderboardListRoot.innerHTML = `<div class="muted" style="padding:12px">No exam selected</div>`;
    return;
  }
 
  // prefer cached examTotals snapshot
  let resultsMap = (typeof examTotalsCache !== 'undefined' && examTotalsCache && examTotalsCache[examId]) ? examTotalsCache[examId] : null;
  if(!resultsMap){
    try { await loadExamTotalsForExam(examId); resultsMap = examTotalsCache && examTotalsCache[examId] ? examTotalsCache[examId] : null; } catch(e){ console.warn('loadExamTotalsForExam failed', e); }
  }
 
  let rows = [];
  if(resultsMap && Object.keys(resultsMap).length){
    rows = Object.values(resultsMap).map(r => {
      const s = findStudentByRef(r.studentId) || {};
      const total = Number(r.total || r.average || 0);
      const maxSum = (r.subjects || []).reduce((a,b)=> a + (Number(b.max||0)), 0) || 0;
      const pct = maxSum ? (total / maxSum) * 100 : (Number(r.average || 0));
      return {
        studentId: r.studentId,
        name: s.fullName || s.name || r.studentName || r.studentId,
        className: s.classId || r.classId || r.className || '—',
        score: Number(total || 0),
        pct: Number(pct || 0),
        raw: r
      };
    });
  } else {
    // fallback to examResults cache (drafts)
    const examResults = (typeof examResultsCache !== 'undefined' && examResultsCache) ? examResultsCache : (window.examResultsCache || []);
    const filtered = examResults.filter(rr => rr.examId === examId);
    if(filtered.length){
      rows = filtered.map(r => {
        const s = findStudentByRef(r.studentId) || {};
        const pct = r.max && r.max>0 ? (Number(r.total||0) / Number(r.max))*100 : (r.pct || 0);
        return {
          studentId: r.studentId,
          name: s.fullName || s.name || r.studentName || r.studentId,
          className: s.classId || r.className || '—',
          score: Number(r.total || 0),
          pct: Number(pct || 0),
          raw: r
        };
      });
    }
  }
 
  if(kind === 'class' && leaderboardClassSel.value){
    rows = rows.filter(r => String(r.className) === String(leaderboardClassSel.value));
  }
 
  rows = rows.sort((a,b)=> b.score - a.score).slice(0,10);
 
  if(!rows.length){
    leaderboardListRoot.innerHTML = `<div class="muted" style="padding:12px">No students found for the selected exam/class.</div>`;
    return;
  }
  const html = `<div style="display:flex;flex-direction:column;gap:8px">
  ${rows.map((r, idx) => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:36px;height:36px;border-radius:999px;background:#f1f5f9;display:flex;align-items:center;justify-content:center">
          ${idx < 3 ? (idx===0?'🏆':idx===1?'🥈':'🥉') : idx+1}
        </div>
        <div style="min-width:0">
          <div style="font-weight:900">${escape(r.name)}</div>
          <div class="muted">${escape(r.className)} • ID: ${escape(r.studentId)}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <progress value="${Math.round(r.pct)}" max="100"></progress>
        <div style="font-weight:900">${r.pct.toFixed(1)}%</div>
        <button class="btn btn-ghost view-marks"
          data-id="${escape(r.studentId)}"
          data-exam="${escape(examId)}">View</button>
      </div>
    </div>
  `).join('')}
</div>`;

leaderboardListRoot.innerHTML = isMobileViewport()
  ? leaderboardHeaderMobile + html
  : html;

 
  leaderboardListRoot.querySelectorAll('.view-marks').forEach(b => b.addEventListener('click', async ev => {
    const sid = ev.currentTarget.dataset.id;
    const ex = ev.currentTarget.dataset.exam;
    if(typeof openStudentMarksModal === 'function') {
      openStudentMarksModal(sid, ex);
    } else {
      // fallback: open result modal but prevent edit path
      const stud = findStudentByRef(sid) || (studentsCache||[]).find(s=>String(s.studentId||s.id||s.uid||s._id)===String(sid));
      if(stud && typeof openStudentResultModalFor === 'function') {
        // ensure original modal doesn't present the edit UI: pass only view intent
        openStudentResultModalFor(stud);
      } else {
        showModal('Marks', `<div>Open marks for ${escape(sid)} (exam ${escape(ex)})</div>`);
      }
    }
  }));
 }
 
 
  // ---------- Leaderboard ----------
  function loadExamsIntoLeaderboard() {
    const exams = (typeof examsCache !== 'undefined' && examsCache) ? examsCache : (window.examsCache || []);
    if (exams.length) leaderboardExamSel.innerHTML = exams.map(e => `<option value="${escape(e.id)}">${escape(e.name || e.id)}${e.publishedAt ? ' • ' + new Date(tsToMs(e.publishedAt)).toLocaleDateString() : ''}</option>`).join('');
    else leaderboardExamSel.innerHTML = `<option value="">No exams available</option>`;
 
    const classes = (classesCache || []).map(c => ({ id: c.id || c.classId || c.name, name: c.name || c.displayName || c.id }));
    if (classes.length) leaderboardClassSel.innerHTML = `<option value="">All classes</option>` + classes.map(c => `<option value="${escape(c.name)}">${escape(c.name)}</option>`).join('');
    else leaderboardClassSel.innerHTML = `<option value="">No classes</option>`;
 
    // wire events (idempotent)
    leaderboardKind._handler = () => { leaderboardClassSel.style.display = leaderboardKind.value === 'class' ? 'inline-block' : 'none'; renderLeaderboard(); };
    leaderboardKind.removeEventListener('change', leaderboardKind._handler || (()=>{}));
    leaderboardKind.addEventListener('change', leaderboardKind._handler);
 
    leaderboardExamSel._handler = () => renderLeaderboard();
    leaderboardExamSel.removeEventListener('change', leaderboardExamSel._handler || (()=>{}));
    leaderboardExamSel.addEventListener('change', leaderboardExamSel._handler);
 
    leaderboardClassSel._handler = () => renderLeaderboard();
    leaderboardClassSel.removeEventListener('change', leaderboardClassSel._handler || (()=>{}));
    leaderboardClassSel.addEventListener('change', leaderboardClassSel._handler);
  }
  // place below loadExamsIntoLeaderboard so elements exist
 (function tidyLeaderboardMobile() {
   const lbCard = page.querySelector('#leaderboardCard');
   if (!lbCard) return;
   // if mobile, move controls under title
   if (isMobileViewport && isMobileViewport()) {
     const controls = lbCard.querySelector('div[style*="display:flex;gap:8px;align-items:center"]');
     const titleArea = lbCard.querySelector('div > strong');
     if (controls && titleArea) {
       controls.style.marginTop = '8px';
       controls.style.width = '100%';
       controls.style.justifyContent = 'flex-start';
       titleArea.parentElement.appendChild(controls);
     }
   }
 })();
 
 
 
  function medalEmoji(i) { return i === 0 ? '🏆' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : (i+1))); }
 
  // ---------- Notifications ----------
  function computeNotifications(range) {
    const cfgRaw = localStorage.getItem('dashboard_alerts_cfg');
    const cfg = cfgRaw ? JSON.parse(cfgRaw) : { thresholdAmount: 50000, thresholdCount: 5, revenueDropPct: 10 };
    const notes = [];
 
    const outstandingSum = (studentsCache || []).reduce((s, st) => s + getBalanceCents(st), 0);
    if (outstandingSum > (cfg.thresholdAmount || 0)) notes.push({ severity: 'warn', text: `⚠️ Outstanding total is ${formatMoney(outstandingSum)} (> ${formatMoney(cfg.thresholdAmount)})`, action: () => openOutstandingDrillDown('students') });
 
    const overdueCount = (studentsCache || []).filter(s => getBalanceCents(s) > 0).length;
    if (overdueCount > (cfg.thresholdCount || 0)) notes.push({ severity: 'warn', text: `⚠️ ${overdueCount} students overdue — View outstanding`, action: () => openOutstandingDrillDown('students') });
 
    const k = computeKPIs(range);
    const prev = k.prevRevenueCents || 0;
    if (prev > 0) {
      const drop = ((prev - k.totalRevenueCents) / prev) * 100;
      if (drop > (cfg.revenueDropPct || 10)) notes.push({ severity: 'alert', text: `📢 Revenue down ${drop.toFixed(1)}% vs previous period`, action: () => showModal('Revenue drop', `<div>Revenue dropped by ${drop.toFixed(1)}%.</div>`) });
    }
 
    return notes;
  }
 
  function renderNotifications(range) {
    const notes = computeNotifications(range);
    const badge = page.querySelector('#notifBadge');
    if (notes.length) { badge.style.display = 'inline-block'; badge.textContent = String(notes.length); } else { badge.style.display = 'none'; }
    page.querySelector('#dashboardNotifications').onclick = () => {
      const html = `<div><strong>Notifications</strong></div><div style="margin-top:8px">${notes.map((n,i)=>`<div style="margin-bottom:8px"><div>${n.text}</div><div style="margin-top:6px"><button class="btn btn-primary notif-act" data-i="${i}">Open</button></div></div>`).join('')}</div>`;
      showModal('Notifications', html);
      modalBody.querySelectorAll('.notif-act').forEach(b => b.addEventListener('click', ev => {
        const n = notes[Number(ev.currentTarget.dataset.i)];
        if (n && typeof n.action === 'function') n.action();
        closeModal();
      }));
    };
  }
 
  // ---------- wiring & utilities ----------
  filterButtons.forEach(b => b.addEventListener('click', () => {
    activeFilter = b.dataset.filter;
    setActiveFilterButton(activeFilter);
    currentRange = computeRangeForFilter(activeFilter);
    refreshDashboard();
  }));
 
  page.querySelector('#dashboardSettings').onclick = () => {
    const html = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <label>School year start month</label>
          <select id="cfgStart">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${(Number(schoolYearConfig.startMonth)===i+1)?'selected':''}>${monthsShort[i]}</option>`).join('')}</select>
        </div>
        <div>
          <label>School year end month</label>
          <select id="cfgEnd">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${(Number(schoolYearConfig.endMonth)===i+1)?'selected':''}>${monthsShort[i]}</option>`).join('')}</select>
        </div>
      </div>
      <div style="margin-top:10px"><strong>Alerts</strong></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px">
        <div><label>Threshold amount (cents)</label><input id="cfgThreshAmt" value="${(JSON.parse(localStorage.getItem('dashboard_alerts_cfg')||'{}').thresholdAmount)||50000}" /></div>
        <div><label>Threshold count</label><input id="cfgThreshCount" value="${(JSON.parse(localStorage.getItem('dashboard_alerts_cfg')||'{}').thresholdCount)||5}" /></div>
        <div><label>Revenue drop pct</label><input id="cfgDropPct" value="${(JSON.parse(localStorage.getItem('dashboard_alerts_cfg')||'{}').revenueDropPct)||10}" /></div>
      </div>
      <div class="modal-actions"><button id="cfgClose" class="btn btn-ghost">Close</button><button id="cfgSave" class="btn btn-primary">Save</button></div>
    `;
    showModal('Dashboard settings', html);
    modalBody.querySelector('#cfgClose').onclick = closeModal;
    modalBody.querySelector('#cfgSave').onclick = () => {
      const s = Number(modalBody.querySelector('#cfgStart').value);
      const e = Number(modalBody.querySelector('#cfgEnd').value);
      const amt = Number(modalBody.querySelector('#cfgThreshAmt').value) || 50000;
      const cnt = Number(modalBody.querySelector('#cfgThreshCount').value) || 5;
      const pct = Number(modalBody.querySelector('#cfgDropPct').value) || 10;
      localStorage.setItem('schoolYearConfig', JSON.stringify({ startMonth: s, endMonth: e }));
      localStorage.setItem('dashboard_alerts_cfg', JSON.stringify({ thresholdAmount: amt, thresholdCount: cnt, revenueDropPct: pct }));
      toast('Settings saved');
      closeModal();
      // re-run to pick up settings
      renderDashboard();
    };
  };
 
  page.querySelector('#dashboardRefresh').onclick = async () => {
    dashStatus.textContent = 'Refreshing...';
    try {
      await Promise.all([
        typeof loadStudents === 'function' ? loadStudents() : Promise.resolve(),
        typeof loadTeachers === 'function' ? loadTeachers() : Promise.resolve(),
        typeof loadStaff === 'function' ? loadStaff() : Promise.resolve(),
        typeof loadTransactions === 'function' ? loadTransactions() : Promise.resolve()
      ]);
      toast('Refreshed');
    } catch(e) {
      console.error(e);
      toast('Refresh failed');
    } finally {
      dashStatus.textContent = '';
      refreshDashboard();
    }
  };
 

    // export helpers
    function exportCsvFromDashboard() {
      const rangeLabel = currentRange.label || '';
      const k = computeKPIs(currentRange);
      const lines = [['Metric','Value'], ['Date range', rangeLabel]];
      lines.push(['Total Students', k.totalStudents]);
      lines.push(['Total Teachers', k.totalTeachers]);
      lines.push(['Total Staff', k.totalStaff]);
      lines.push(['Total Revenue', formatMoney(k.totalRevenueCents)]);
      lines.push(['Total Expenses+', formatMoney(k.totalExpensesPlusCents)]);
      const csv = lines.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `dashboard_export_${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url);
    }
    function exportPdfFromDashboard() {
      const el = kpisRoot;
      if (!el) return toast && toast('Nothing to export');
      if (typeof html2canvas === 'undefined' || !window.jspdf) {
        // fallback to printing the KPIs container
        try {
          const popup = window.open('', '_blank', 'width=900,height=700');
          if (!popup) { toast && toast('Popup blocked — allow popups to export'); return; }
          popup.document.write(el.outerHTML);
          popup.document.close();
          setTimeout(()=> popup.print(), 300);
          return;
        } catch(e) { console.error(e); return; }
      }
      html2canvas(el).then(canvas => {
        const img = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('landscape');
        const w = pdf.internal.pageSize.getWidth();
        const h = (canvas.height / canvas.width) * w;
        pdf.addImage(img,'PNG',10,10,w-20,h-20);
        pdf.save(`dashboard_${Date.now()}.pdf`);
      }).catch(err => { console.error(err); toast('PDF export failed'); });
    }
  
    // Defensive binding — header may contain either the old buttons or the new export menu
    const dashboardExportCsvBtn = page.querySelector('#dashboardExportCsv');
    if (dashboardExportCsvBtn) dashboardExportCsvBtn.onclick = exportCsvFromDashboard;
    const dashboardExportPdfBtn = page.querySelector('#dashboardExportPdf');
    if (dashboardExportPdfBtn) dashboardExportPdfBtn.onclick = exportPdfFromDashboard;
  
    // chart controls — guard nodes before attaching listeners
    const chartPaymentsGran = page.querySelector('#chartPaymentsGranularity');
    if (chartPaymentsGran) chartPaymentsGran.addEventListener('change', () => renderCharts(currentRange));
    const chartTeachersGran = page.querySelector('#chartTeachersGranularity');
    if (chartTeachersGran) chartTeachersGran.addEventListener('change', () => renderCharts(currentRange));
  
    const exportChartPaymentsBtn = page.querySelector('#exportChartPayments');
    if (exportChartPaymentsBtn) exportChartPaymentsBtn.addEventListener('click', () => {
      const agg = aggregateTransactionsForChart((transactionsCache || []).filter(t => String(t.target_type).toLowerCase() === 'student'), currentRange, (page.querySelector('#chartPaymentsGranularity') || { value:'monthly' }).value);
      const csv = ['label,amount'].concat(agg.labels.map((l,i)=>`${l},${(agg.series[i]||0)/100}`)).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'payments_chart.csv'; a.click(); URL.revokeObjectURL(url);
    });
    const exportChartTeachersBtn = page.querySelector('#exportChartTeachers');
    if (exportChartTeachersBtn) exportChartTeachersBtn.addEventListener('click', () => {
      const agg = aggregateTransactionsForChart((transactionsCache || []).filter(t => String(t.target_type).toLowerCase() === 'teacher'), currentRange, (page.querySelector('#chartTeachersGranularity') || { value:'monthly' }).value);
      const csv = ['label,amount'].concat(agg.labels.map((l,i)=>`${l},${(agg.series[i]||0)/100}`)).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'teacher_payouts_chart.csv'; a.click(); URL.revokeObjectURL(url);
    });
  
    // outstanding search (fixed) — guard existence of outstandingSearch and outstandingTableRoot
    if (outstandingSearch && typeof outstandingSearch.addEventListener === 'function') {
      outstandingSearch.addEventListener('input', () => {
        const q = outstandingSearch.value.trim().toLowerCase();
        if (!q) { renderOutstandingTable(currentRange); return; }
        const found = (studentsCache || []).filter(s => ((s.fullName||'').toLowerCase().includes(q) || (String(s.studentId||s.id||'')).toLowerCase().includes(q))).sort((a,b) => getBalanceCents(b) - getBalanceCents(a)).slice(0,10);
        if (!outstandingTableRoot) return;
        outstandingTableRoot.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">
          ${found.map((r, idx) => `<div class="list-row"><div class="row-left"><div class="no-badge">${idx+1}</div><div><div class="title">${escape(r.fullName||r.name||'')}</div><div class="sub">ID:${escape(r.studentId||r.id)} • ${escape(typeof resolveClassName === 'function' ? resolveClassName(r) : (r.class || '—'))}</div></div></div><div style="display:flex;align-items:center;gap:10px"><div style="font-weight:900;color:#b91c1c">${formatMoney(getBalanceCents(r))}</div><div><button class="btn btn-primary record-pay" data-id="${escape(r.studentId||r.id)}">Record Payment</button></div></div></div>`).join('')}
        </div>`;
        outstandingTableRoot.querySelectorAll('.record-pay').forEach(b => b.addEventListener('click', ev => openPayModal(ev.currentTarget)));
      });
    }
  
    // bulk reminder — guard
    const outstandingBulkBtn = page.querySelector('#outstandingBulkReminder');
    if (outstandingBulkBtn) outstandingBulkBtn.onclick = async () => {
      const toRemind = (studentsCache || []).filter(s => getBalanceCents(s) > 0).slice(0,50);
      if (!toRemind.length) return toast('No outstanding students to remind');
      const html = `<div><strong>Send reminders to ${toRemind.length} students?</strong></div><div style="margin-top:8px;display:flex;justify-content:flex-end"><button id="cancelRem" class="btn btn-ghost">Cancel</button><button id="sendRem" class="btn btn-primary">Send</button></div>`;
      showModal('Send reminders', html);
      modalBody.querySelector('#cancelRem').onclick = closeModal;
      modalBody.querySelector('#sendRem').onclick = () => { toast(`Reminders queued for ${toRemind.length} students (messaging not configured)`); closeModal(); };
    };
  
    // leaderboard export — guard
    const leaderboardExportBtn = page.querySelector('#leaderboardExport');
    if (leaderboardExportBtn) leaderboardExportBtn.addEventListener('click', () => {
      const rows = Array.from((leaderboardListRoot || document.createElement('div')).querySelectorAll('.list-row')).map((r, i) => {
        return [`${i+1}`, r.querySelector('.title') ? r.querySelector('.title').textContent.trim() : '', '—', '—'].join(',');
      });
      const csv = ['Rank,Name,Class,Score'].concat(rows).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'leaderboard.csv'; a.click(); URL.revokeObjectURL(url);
    });
  
    const pdfBtn = page.querySelector('#exportPdfOpt');
    pdfBtn?.addEventListener('click', exportPdfFromDashboard);
    
    const csvBtn = page.querySelector('#exportCsvOpt');
    csvBtn?.addEventListener('click', exportCsvFromDashboard);
    
 
  // chart controls
  page.querySelector('#chartPaymentsGranularity').addEventListener('change', () => renderCharts(currentRange));
  page.querySelector('#chartTeachersGranularity').addEventListener('change', () => renderCharts(currentRange));
  page.querySelector('#exportChartPayments').addEventListener('click', () => {
    const agg = aggregateTransactionsForChart((transactionsCache || []).filter(t => String(t.target_type).toLowerCase() === 'student'), currentRange, page.querySelector('#chartPaymentsGranularity').value);
    const csv = ['label,amount'].concat(agg.labels.map((l,i)=>`${l},${(agg.series[i]||0)/100}`)).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'payments_chart.csv'; a.click(); URL.revokeObjectURL(url);
  });
  page.querySelector('#exportChartTeachers').addEventListener('click', () => {
    const agg = aggregateTransactionsForChart((transactionsCache || []).filter(t => String(t.target_type).toLowerCase() === 'teacher'), currentRange, page.querySelector('#chartTeachersGranularity').value);
    const csv = ['label,amount'].concat(agg.labels.map((l,i)=>`${l},${(agg.series[i]||0)/100}`)).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'teacher_payouts_chart.csv'; a.click(); URL.revokeObjectURL(url);
  });
 
  // outstanding search (fixed)
  outstandingSearch.addEventListener('input', () => {
    const q = outstandingSearch.value.trim().toLowerCase();
    if (!q) { renderOutstandingTable(currentRange); return; }
    const found = (studentsCache || []).filter(s => ((s.fullName||'').toLowerCase().includes(q) || (String(s.studentId||s.id||'')).toLowerCase().includes(q))).sort((a,b) => getBalanceCents(b) - getBalanceCents(a)).slice(0,10);
    outstandingTableRoot.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">
      ${found.map((r, idx) => `<div class="list-row"><div class="row-left"><div class="no-badge">${idx+1}</div><div><div class="title">${escape(r.fullName||r.name||'')}</div><div class="sub">ID:${escape(r.studentId||r.id)} • ${escape(typeof resolveClassName === 'function' ? resolveClassName(r) : (r.class || '—'))}</div></div></div><div style="display:flex;align-items:center;gap:10px"><div style="font-weight:900;color:#b91c1c">${formatMoney(getBalanceCents(r))}</div><div><button class="btn btn-primary record-pay" data-id="${escape(r.studentId||r.id)}">Record Payment</button></div></div></div>`).join('')}
    </div>`;
    outstandingTableRoot.querySelectorAll('.record-pay').forEach(b => b.addEventListener('click', ev => openPayModal(ev.currentTarget)));
  });
 
  // bulk reminder
  page.querySelector('#outstandingBulkReminder').onclick = async () => {
    const toRemind = (studentsCache || []).filter(s => getBalanceCents(s) > 0).slice(0,50);
    if (!toRemind.length) return toast('No outstanding students to remind');
    const html = `<div><strong>Send reminders to ${toRemind.length} students?</strong></div><div style="margin-top:8px;display:flex;justify-content:flex-end"><button id="cancelRem" class="btn btn-ghost">Cancel</button><button id="sendRem" class="btn btn-primary">Send</button></div>`;
    showModal('Send reminders', html);
    modalBody.querySelector('#cancelRem').onclick = closeModal;
    modalBody.querySelector('#sendRem').onclick = () => { toast(`Reminders queued for ${toRemind.length} students (messaging not configured)`); closeModal(); };
  };
 
  // leaderboard export
  page.querySelector('#leaderboardExport').addEventListener('click', () => {
    const rows = Array.from(leaderboardListRoot.querySelectorAll('.list-row')).map((r, i) => {
      return [`${i+1}`, r.querySelector('.title') ? r.querySelector('.title').textContent.trim() : '', '—', '—'].join(',');
    });
    const csv = ['Rank,Name,Class,Score'].concat(rows).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'leaderboard.csv'; a.click(); URL.revokeObjectURL(url);
  });
 
  // ---------- orchestrator ----------
  function refreshDashboard() {
    currentRange = computeRangeForFilter(activeFilter);
    if (filterInfo) filterInfo.textContent = currentRange.label;
    const k = computeKPIs(currentRange);
    renderKPIs(k);
    renderCharts(currentRange);
    renderOutstandingTable(currentRange);
    loadExamsIntoLeaderboard();
    renderLeaderboard();
    // ensure mobile sections/charts layout (outstanding above leaderboard, charts stacked)
    try { adjustSectionsForViewport(); } catch(e){/*ignore*/}
    renderNotifications(currentRange);
    dashSources.textContent = `Data source: local cache (transactions ${transactionsCache ? transactionsCache.length : 0}, students ${studentsCache ? studentsCache.length : 0})`;
  }
  

  function adjustSectionsForViewport() {
    const container = page.querySelector('#outstandingCard')?.parentElement;
    if (!container) return;
    // mobile: stack single column (outstanding first, leaderboard after)
    if (typeof isMobileViewport === 'function' && isMobileViewport()) {
      container.style.gridTemplateColumns = '1fr';
      const outstanding = page.querySelector('#outstandingCard');
      const leaderboard = page.querySelector('#leaderboardCard');
      if (outstanding && leaderboard) {
        // append in desired order (appendChild moves existing nodes)
        container.appendChild(outstanding);
        container.appendChild(leaderboard);
      }
    } else {
      // desktop: restore two-column layout
      container.style.gridTemplateColumns = '2fr 1fr';
    }
  }
  
 
  // initial render
  function init() { currentRange = computeRangeForFilter(activeFilter); setActiveFilterButton(activeFilter); refreshDashboard(); }
  init();
 
  // expose refresh
  page.refreshDashboard = refreshDashboard;
  showPage && showPage('dashboard');
 }

// database.js — admin attendance render + export
// Use your existing imports at top; this snippet implements admin-side attendance features.
// Ensure you have these imports available: collection, doc, getDocs, setDoc, query, where, Timestamp, getDoc, deleteDoc

/* ===========================
  Admin attendance — updated (replace previous admin attendance functions)
  Dependencies assumed present in your file:
    db, getDocs, getDoc, collection, query, where, doc, setDoc, deleteDoc, Timestamp
    classesCache, subjectsCache, studentsCache, currentUser, toast, showModal, closeModal
  The code contains safe fallbacks when some globals/constants are missing.
  ===========================*/

/* safe constants (fallback if not defined earlier) */
const ATT_RECORDS_COLL = 'attendance_records';
const LEGACY_ATT_COLL = 'attendance';


/* small helpers */
function escapeHtmlLocal(s){ if(!s && s!==0) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function computePercentFromFlags(flags){ if(!Array.isArray(flags)||flags.length===0) return 0; const present = flags.reduce((s,f)=>s + (f?1:0),0); return Math.round((present/flags.length)*100); }
function nowLocalISODate(){ return (new Date()).toISOString().slice(0,10); }



/* undo state */
let lastAdminSave = null;

/* RENDER ATTENDANCE PAGE */
async function renderAttendance(){
  let page = document.getElementById('pageAttendance');
  if(!page){
    page = document.createElement('section');
    page.id = 'pageAttendance';
    page.className = 'page';
    const main = document.querySelector('main') || document.body;
    main.appendChild(page);
  }

  page.innerHTML = `
    <style>
      /* tiny local styles for export menus and responsive cards */
      .export-dropdown { position: relative; display:inline-block; }
      .export-dropdown .export-menu { position:absolute; right:0; top:34px; z-index:150; background:#fff; border:1px solid #eef2f7; padding:6px; border-radius:8px; box-shadow:0 8px 22px rgba(2,6,23,0.06); }
      .export-dropdown .export-menu.hidden { display:none; }
      .attendance-cards { display:flex; flex-wrap:wrap; gap:12px; }
      .attendance-card { flex:1 1 320px; background:#fff; border-radius:10px; padding:14px; box-shadow:0 6px 18px rgba(2,6,23,0.03); border:1px solid rgba(2,6,23,0.03); display:flex; justify-content:space-between; align-items:center; }
      @media(max-width:720px){
        .attendance-card { flex:1 1 100%; }
        .page .attendance-page-header { display:flex; flex-direction:column; gap:8px; }
      }
      .muted{ color:#6b7280; }
    </style>

    <div class="attendance-page-header" style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
      <input id="attClassSearch" type="search" placeholder="Search class name or id..." style="padding:8px 10px;border-radius:8px;border:1px solid #eef2f7;min-width:220px" />
      <select id="attClassSelect" style="padding:8px 10px;border-radius:8px;border:1px solid #eef2f7">
        <option value="">All classes</option>
      </select>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button id="attRefreshBtn" class="btn btn-ghost">Refresh</button>
      </div>
    </div>

    <div id="attendanceList" class="attendance-cards"></div>

    <div id="attendanceClassView" class="hidden" style="margin-top:12px">
      <div id="attendanceClassHeader"></div>
      <div id="attendanceClassEditor" style="margin-top:12px"></div>
    </div>

    <!-- Undo snackbar -->
    <div id="adminUndoSnk" style="position:fixed;right:18px;bottom:18px;display:none;z-index:1200">
      <div style="background:#111;color:#fff;padding:10px 12px;border-radius:8px;display:flex;gap:8px;align-items:center">
        <div id="adminUndoMsg" style="font-weight:800">Saved — <span id="adminUndoInfo"></span></div>
        <button id="adminUndoBtn" class="btn" style="background:#fff;color:#111;padding:6px 8px;border-radius:8px">Undo</button>
      </div>
    </div>
  `;

  // populate class select
  const sel = document.getElementById('attClassSelect');
  sel.innerHTML = '<option value="">All classes</option>' + (classesCache||[]).map(c => `<option value="${escapeHtmlLocal(c.name||c.id)}">${escapeHtmlLocal(c.name||c.id)}</option>`).join('');

  // wire search and select
  const searchInput = document.getElementById('attClassSearch');
  searchInput.oninput = renderAttendanceClassCards;
  sel.onchange = renderAttendanceClassCards;
  document.getElementById('attRefreshBtn').onclick = async () => {
    // if you have a function that refreshes caches, call it here. Otherwise re-render.
    renderAttendanceClassCards();
    toast('Refreshed');
  };

  // initial render
  renderAttendanceClassCards();
}
window.updateAllAdminPercentsInEditor = function(){
  document.querySelectorAll('.att-row-admin').forEach(row => {
    const sid = row.dataset.student;
    const chks = row.querySelectorAll('.admin-att-chk');
    const flags = Array.from(chks).map(c => c.checked);
    const pct = computePercentFromFlags(flags);
    const el = row.querySelector('.row-pct');
    if(el) el.textContent = pct + '%';
  });
};

window.updateEditorCheckAllLabel = function(){
  const btn = document.getElementById('editorCheckAll');
  if(!btn) return;
  const chks = document.querySelectorAll('.admin-att-chk');
  btn.textContent = Array.from(chks).every(c => c.checked) ? 'Uncheck all' : 'Check all';
};


/* render class cards (filters by search + select) */
function renderAttendanceClassCards(){
  const list = document.getElementById('attendanceList');
  if(!list) return;
  const q = (document.getElementById('attClassSearch').value || '').trim().toLowerCase();
  const sel = (document.getElementById('attClassSelect').value || '').trim();
  const classes = classesCache || [];

  // filter
  let filtered = classes.slice();
  if(sel) filtered = filtered.filter(c => String(c.name||c.id) === sel);
  if(q) filtered = filtered.filter(c => (String(c.name||'') + ' ' + String(c.id||'')).toLowerCase().includes(q));

  if(filtered.length === 0){
    list.innerHTML = `<div class="muted">No classes found.</div>`;
    return;
  }

  list.innerHTML = filtered.map(c => {
    const stdCount = (studentsCache||[]).filter(s => String(s.classId||s.class||s.className||'') === String(c.name||c.id)).length;
    // const subjText = (Array.isArray(c.subjects) && c.subjects.length) ? c.subjects.slice(0,4).join(', ') : 'No subjects';
    return `
      <div class="attendance-card" data-class="${escapeHtmlLocal(c.name||c.id)}">
        <div style="flex:1">
          <div style="font-weight:800">${escapeHtmlLocal(c.name||c.id)}</div>
          <div class="muted">ID: ${escapeHtmlLocal(c.id || c.name || '')} • Students: ${stdCount}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          
        <button class="btn btn-ghost open-class" data-class="${escapeHtmlLocal(c.name||c.id)}">Open</button>

          <button class="btn btn-ghost more-btn" data-class="${escapeHtmlLocal(c.name||c.id)}">⋮</button>

        </div>
      </div>`;
  }).join('');

  // wire buttons (use event delegation safe handlers)
  list.querySelectorAll('.open-class').forEach(b => b.onclick = (ev) => {
    ev.stopPropagation();
    const cname = ev.currentTarget.dataset.class;
    openAdminPreviewClass(cname);
  });
  list.querySelectorAll('.subj-btn').forEach(b => b.onclick = (ev) => {
    ev.stopPropagation();
    const cname = ev.currentTarget.dataset.class;
    showClassSubjectsModal(cname);
  });
  list.querySelectorAll('.card-export-btn').forEach(btn => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      // toggle menu sibling
      const menu = btn.parentElement.querySelector('.export-menu');
      if(menu) menu.classList.toggle('hidden');
    };
  });
  list.querySelectorAll('.card-export-pdf').forEach(b => {
    b.onclick = async (ev) => {
      ev.stopPropagation();
      const cname = ev.currentTarget.dataset.class;
      await exportAllSubjectsForClass(cname, 'pdf');
    };
  });
  list.querySelectorAll('.card-export-csv').forEach(b => {
    b.onclick = async (ev) => {
      ev.stopPropagation();
      const cname = ev.currentTarget.dataset.class;
      await exportAllSubjectsForClass(cname, 'csv');
    };
  });
  list.querySelectorAll('.history-btn').forEach(b => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const cname = ev.currentTarget.dataset.class;
      openAttendanceHistory(cname);
    };
  });

  list.querySelectorAll('.more-btn').forEach(b => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      openClassMoreModal(ev.currentTarget.dataset.class);
    };
  });
  
  // close export menus when clicking outside
 
}

if (!window.__attExportOutsideClick) {
  window.__attExportOutsideClick = true;
  document.addEventListener('click', (e) => {
    document.querySelectorAll('.export-menu').forEach(m => {
      if (!m.contains(e.target) && !m.previousElementSibling?.contains(e.target)) {
        m.classList.add('hidden');
      }
    });
  });
}

const ICONS = {
  open: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="#fff" fill="none" stroke-width="2"><path d="M3 7h5l2 2h11v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>`,
  subjects: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="#fff" fill="none" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M8 4v16M16 4v16"/></svg>`,
  attend: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="#111" fill="none" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M2 12a10 10 0 1 0 20 0"/></svg>`,
  history: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="#fff" fill="none" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg>`,
  export: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="#fff" fill="none" stroke-width="2"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>`,
  pdf: `<svg width="16" height="16" viewBox="0 0 24 24" stroke="#dc2626" fill="none" stroke-width="2"><path d="M6 2h9l5 5v15H6z"/></svg>`,
  csv: `<svg width="16" height="16" viewBox="0 0 24 24" stroke="#16a34a" fill="none" stroke-width="2"><path d="M4 4h16v16H4z"/></svg>`
};


function openClassMoreModal(className){
  const html = `
    <div class="more-grid">

      <button id="moreOpen" class="btn btn-open">
        ${ICONS.open} Open Class
      </button>

      <button id="moreSubjects" class="btn btn-subj">
        ${ICONS.subjects} Subjects
      </button>

      <button id="moreHistory" class="btn btn-hist">
        ${ICONS.history} History
      </button>

      <button id="moreAttend" class="btn btn-att">
        ${ICONS.attend} Attendance
      </button>

      <div class="full">
        <div class="export-dropdown">
          <button id="moreExportBtn" class="btn btn-export">
            ${ICONS.export} Export
          </button>
          <div id="moreExportMenu" class="export-menu hidden">
            <button id="moreExportPdf">
              ${ICONS.pdf} Export PDF
            </button>
            <button id="moreExportCsv">
              ${ICONS.csv} Export CSV
            </button>
          </div>
        </div>
      </div>

      <div class="full">
        <button id="moreClose" class="btn btn-ghost">Close</button>
      </div>

    </div>
  `;

  showModal(`Class • ${escapeHtmlLocal(className)}`, html);

  const exportBtn  = modalBody.querySelector('#moreExportBtn');
  const exportMenu = modalBody.querySelector('#moreExportMenu');

  // 🔐 SAFE TOGGLE
  exportBtn.onclick = (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('hidden');
    console.log('[EXPORT] menu toggled');
  };

  // ❗ DO NOT auto-close on modalBody click
  document.addEventListener('click', function closeOnce(ev){
    if(!exportMenu.contains(ev.target) && !exportBtn.contains(ev.target)){
      exportMenu.classList.add('hidden');
      document.removeEventListener('click', closeOnce);
    }
  });

  modalBody.querySelector('#moreExportPdf').onclick = async () => {
    console.log('[EXPORT] PDF clicked', className);
    try{
      await exportAllSubjectsForClass(className, 'pdf');
    }catch(err){
      console.error('PDF export failed', err);
      toast('PDF export failed – see console');
    }
    closeModal();
  };

  modalBody.querySelector('#moreExportCsv').onclick = async () => {
    console.log('[EXPORT] CSV clicked', className);
    try{
      await exportAllSubjectsForClass(className, 'csv');
    }catch(err){
      console.error('CSV export failed', err);
      toast('CSV export failed – see console');
    }
    closeModal();
  };

  modalBody.querySelector('#moreOpen').onclick = () => {
    closeModal();
    openAdminPreviewClass(className);
  };

  modalBody.querySelector('#moreSubjects').onclick = () => {
    closeModal();
    showClassSubjectsModal(className);
  };

  modalBody.querySelector('#moreAttend').onclick = () => {
    closeModal();
    openAdminPreviewClass(className);
    setTimeout(() => document.getElementById('previewTakeBtn')?.click(), 200);
  };

  modalBody.querySelector('#moreHistory').onclick = () => {
    closeModal();
    openAttendanceHistory(className);
  };

  modalBody.querySelector('#moreClose').onclick = closeModal;
}

/* Subjects modal (detailed) */
function showClassSubjectsModal(className){
  const classDoc = (classesCache||[]).find(c => c.name === className || c.id === className) || { name: className, subjects: [] };
  const classSubjects = Array.isArray(classDoc.subjects) ? classDoc.subjects : [];
  const html = `
    <div>
      <div style="font-weight:900">Subjects — ${escapeHtmlLocal(classDoc.name)}</div>
      <div style="margin-top:8px"><strong>Class:</strong> ${escapeHtmlLocal(classDoc.name)}</div>
      <div style="margin-top:8px"><strong>Subjects assigned to the class:</strong></div>
      <div class="muted" style="margin-top:6px">${classSubjects.length ? escapeHtmlLocal(classSubjects.join(', ')) : '<em>No subjects assigned</em>'}</div>
      <div style="margin-top:12px;text-align:right"><button id="closeSub" class="btn btn-ghost">Close</button></div>
    </div>
  `;
  showModal(`Subjects — ${escapeHtmlLocal(classDoc.name)}`, html);
  modalBody.querySelector('#closeSub').onclick = closeModal;
}

/* OPEN PREVIEW — minimal header (no subject/date/periods) */
async function openAdminPreviewClass(className){
  try {
    const classDoc = (classesCache||[]).find(c => c.name === className || c.id === className) || { name: className, subjects: [] };
    let students = (studentsCache||[]).filter(s => String(s.classId||s.class||s.className||'') === String(classDoc.name));
    if(!students.length){
      const snaps = await studentsPager.refresh();
      students = snaps.docs.map(d=>({ id:d.id, ...d.data() })).filter(s => String(s.classId||s.class||s.className||'') === String(classDoc.name));
    }

    // compute simple preview percent map (latest found)
    const previewMap = {};
    try {
      const recsSnap = await getDocs(query(collection(db, ATT_RECORDS_COLL), where('class_id','==', classDoc.name)));
      recsSnap.forEach(snap => {
        const r = snap.data();
        if(!Array.isArray(r.entries)) return;
        r.entries.forEach(e => {
          if(!previewMap[e.studentId]) previewMap[e.studentId] = e.percent || computePercentFromFlags(e.flags || []);
        });
      });
    } catch(e){}

    // render minimal header
    document.getElementById('attendanceList').classList.add('hidden');
    document.getElementById('attendanceClassView').classList.remove('hidden');

    const headerHtml = `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button id="previewBackBtn" class="btn btn-ghost">← Back</button>
        <div><strong>${escapeHtmlLocal(classDoc.name)}</strong><div class="muted small">ID: ${escapeHtmlLocal(classDoc.id||'')} • Students: ${students.length}</div></div>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button id="previewTakeBtn" class="btn btn-primary">Take Attendance</button>
          <div class="export-dropdown">
            <button id="previewExportBtn" class="btn btn-ghost">Export ▾</button>
            <div id="previewExportMenu" class="export-menu hidden">
              <button id="previewExportPdf">Export PDF (view)</button>
              <button id="previewExportCsv">Export CSV (view)</button>
            </div>
          </div>
          <button id="previewHistoryBtn" class="btn btn-ghost">History</button>


        </div>
      </div>
    `;
    document.getElementById('attendanceClassHeader').innerHTML = headerHtml;

    // rows preview
    const rowsHtml = students.map((s, idx) => {
      const sid = s.id || s.studentId || '';
      const name = s.fullName || s.name || '';
      const pct = previewMap[sid] !== undefined ? previewMap[sid] : 0;
      return `<div class="att-row" data-student="${escapeHtmlLocal(sid)}" style="display:flex;gap:12px;padding:10px;border-bottom:1px solid #f4f6f9;align-items:center">
        <div style="width:36px">${idx+1}</div>
        <div style="min-width:120px">${escapeHtmlLocal(sid)}</div>
        <div style="flex:1;font-weight:800">${escapeHtmlLocal(name)}</div>
        <div style="width:64px;text-align:right"><small class="row-pct">${pct}%</small></div>
      </div>`;
    }).join('');
    document.getElementById('attendanceClassEditor').innerHTML = rowsHtml;

    // wires
    document.getElementById('previewBackBtn').onclick = () => {
      document.getElementById('attendanceClassView').classList.add('hidden');
      document.getElementById('attendanceList').classList.remove('hidden');
      document.getElementById('attendanceClassHeader').innerHTML = '';
      document.getElementById('attendanceClassEditor').innerHTML = '';
    };

    document.getElementById('previewExportBtn').onclick = (e) => {
      e.stopPropagation();
      document.getElementById('previewExportMenu').classList.toggle('hidden');
    };
    document.getElementById('previewExportPdf').onclick = async () => {
      document.getElementById('previewExportMenu').classList.add('hidden');
      await exportAllSubjectsForClass(classDoc.name, 'pdf');
    };
    document.getElementById('previewExportCsv').onclick = async () => {
      document.getElementById('previewExportMenu').classList.add('hidden');
      await exportAllSubjectsForClass(classDoc.name, 'csv');
    };

    document.getElementById('previewTakeBtn').onclick = () => {
      // when user clicks Take Attendance we show the editor UI with subject/date/period selection.
      renderAdminEditorStarter(classDoc, students);
    };

    document.getElementById('previewHistoryBtn').onclick = () => openAttendanceHistory(classDoc.name);

  } catch(err){
    console.error('openAdminPreviewClass failed', err);
    toast('Failed to open class preview.');
  }
}

/* Start editor: minimal overlay to choose subject/date/periods then open full editor */
function renderAdminEditorStarter(classDoc, students){
  // show small inline form then call renderAdminEditor with chosen options
  const header = document.getElementById('attendanceClassHeader');
  header.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button id="editorStarterBack" class="btn btn-ghost">← Back</button>
      <div><strong>${escapeHtmlLocal(classDoc.name)}</strong><div class="muted small">Students: ${students.length}</div></div>
      <label>Subject
        <select id="editorStarterSubject">${(classDoc.subjects && classDoc.subjects.length ? `<option value="">Select subject</option>` : `<option value="">No subjects</option>`) + (classDoc.subjects||[]).map(s=>`<option value="${escapeHtmlLocal(s)}">${escapeHtmlLocal(s)}</option>`).join('')}</select>
      </label>
      <label>Date <input id="editorStarterDate" type="date" value="${nowLocalISODate()}" /></label>
      <label>Periods
        <select id="editorStarterPeriods"><option value="1">1</option><option value="2" selected>2</option><option value="3">3</option><option value="4">4</option></select>
      </label>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button id="editorStarterOpen" class="btn btn-primary">Open Editor</button>
      </div>
    </div>
  `;
  // wire
  document.getElementById('editorStarterBack').onclick = () => {
    openAdminPreviewClass(classDoc.name);
  };
  document.getElementById('editorStarterOpen').onclick = () => {
    const subj = document.getElementById('editorStarterSubject').value;
    const dateVal = document.getElementById('editorStarterDate').value || nowLocalISODate();
    const periods = Number(document.getElementById('editorStarterPeriods').value || 2);
    // open editor with values
    renderAdminEditor(classDoc, students, subj || '', dateVal, periods);
  };
}

/* Render admin editor (full) */
async function renderAdminEditor(classDoc, students, subjectName, dateVal, periodsVal){
  const classSubjects = Array.isArray(classDoc.subjects) ? classDoc.subjects : [];
  // header for editor with controls
  const headerHtml = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button id="editorBackBtn" class="btn btn-ghost">← Back</button>
      <div><strong>${escapeHtmlLocal(classDoc.name)}</strong><div class="muted small">Total students: ${students.length}</div></div>
      <label>Subject
        <select id="editorSubject">${(classSubjects.length ? `<option value="">Select subject</option>` : `<option value="">No subjects</option>`) + classSubjects.map(s=>`<option value="${escapeHtmlLocal(s)}">${escapeHtmlLocal(s)}</option>`).join('')}</select>
      </label>
      <label>Date <input id="editorDate" type="date" value="${escapeHtmlLocal(dateVal || nowLocalISODate())}" /></label>
      <label>Periods
        <select id="editorPeriods"><option value="1">1</option><option value="2" ${periodsVal===2?'selected':''}>2</option><option value="3" ${periodsVal===3?'selected':''}>3</option><option value="4" ${periodsVal===4?'selected':''}>4</option></select>
      </label>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button id="editorCheckAll" class="btn btn-ghost">Check all</button>
        <button id="editorSave" class="btn btn-primary">Save Attendance</button>
        <div class="export-dropdown">
          <button id="editorExportBtn" class="btn btn-ghost">Export ▾</button>
          <div id="editorExportMenu" class="export-menu hidden">
            <button id="editorExportPdf">Export PDF</button>
            <button id="editorExportCsv">Export CSV</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('attendanceClassHeader').innerHTML = headerHtml;
  const editor = document.getElementById('attendanceClassEditor');
  editor.innerHTML = `<div class="muted">Loading attendance editor…</div>`;

  // helper: load existing record if exists for admin (subject required)
  const subj = subjectName || '';
  const adminRecId = `${String(classDoc.name).replace(/\s+/g,'_')}__${String(subj||'ALL').replace(/\s+/g,'_')}__${dateVal}__admin`;

  async function loadAndRender(periods){
    let existingMap = {};
    if(subj){
      try {
        const snap = await getDoc(doc(db, ATT_RECORDS_COLL, adminRecId));
        if(snap && snap.exists()){
          const rec = snap.data();
          (rec.entries || []).forEach(e => existingMap[e.studentId] = e.flags || Array.from({length:rec.periods_count||periods}).map(()=>false));
        }
      } catch(e){ console.warn('load admin rec failed', e); }
    }
    // render rows
    const rows = students.map((s, idx) => {
      const sid = s.id || s.studentId || '';
      const name = s.fullName || s.name || '';
      const flags = (existingMap && existingMap[sid]) ? existingMap[sid].slice(0,periods).concat(Array.from({length:Math.max(0, periods - (existingMap[sid].length||0))}).map(()=>false)) : Array.from({length:periods}).map(()=>false);
      const checkboxes = flags.map((f,i) => `<label style="margin-right:8px"><input class="admin-att-chk" data-student="${escapeHtmlLocal(sid)}" data-period="${i}" type="checkbox" ${f ? 'checked' : ''} />P${i+1}</label>`).join('');
      const percent = computePercentFromFlags(flags);
      return `<div class="att-row-admin att-row" data-student="${escapeHtmlLocal(sid)}" style="display:flex;gap:12px;padding:10px;border-bottom:1px solid #f4f6f9;align-items:center">
        <div style="width:36px">${idx+1}</div>
        <div style="min-width:120px">${escapeHtmlLocal(sid)}</div>
        <div style="flex:1">${escapeHtmlLocal(name)}</div>
        <div style="min-width:260px;display:flex;gap:8px">${checkboxes}</div>
        <div style="width:64px;text-align:right"><small class="row-pct">${percent}%</small></div>
      </div>`;
    }).join('');
    const headerControls = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div class="muted">Mark presence per selected period</div>
      <div><small class="muted">Admin can edit anytime — undo available after save</small></div>
    </div>`;
    editor.innerHTML = headerControls + rows;

    // attach checkbox listeners
    Array.from(editor.querySelectorAll('.admin-att-chk')).forEach(c => {
      c.onchange = (ev) => {
        const sid = ev.currentTarget.dataset.student;
        updateAdminRowPercentInEditor(sid);
        updateEditorCheckAllLabel();
      };
    });
    updateAllAdminPercentsInEditor(periods);
    updateEditorCheckAllLabel();
  }

  function updateAdminRowPercentInEditor(sid){
    const chks = Array.from(document.querySelectorAll(`.admin-att-chk[data-student="${sid}"]`)).sort((a,b)=>Number(a.dataset.period)-Number(b.dataset.period));
    const flags = chks.map(c => c.checked);
    const pct = computePercentFromFlags(flags);
    const row = editor.querySelector(`.att-row-admin[data-student="${sid}"]`);
    if(row){ const el = row.querySelector('.row-pct'); if(el) el.textContent = `${pct}%`; }
  }
  function updateAllAdminPercentsInEditor(periodsCount){
    const uniq = [...new Set(Array.from(editor.querySelectorAll('.admin-att-chk')).map(c=>c.dataset.student))];
    uniq.forEach(updateAdminRowPercentInEditor);
  }
  function toggleEditorCheckAll(periodsCount){
    const allChks = Array.from(editor.querySelectorAll('.admin-att-chk'));
    if(allChks.length === 0) return;
    const anyUnchecked = allChks.some(c => !c.checked);
    allChks.forEach(c => c.checked = anyUnchecked ? true : false);
    updateAllAdminPercentsInEditor(periodsCount);
  }
  function updateEditorCheckAllLabel(){
    const btn = document.getElementById('editorCheckAll');
    if(!btn) return;
    const allChks = Array.from(editor.querySelectorAll('.admin-att-chk'));
    if(allChks.length === 0){ btn.textContent = 'Check all'; return; }
    const allChecked = allChks.every(c => c.checked);
    btn.textContent = allChecked ? 'Uncheck all' : 'Check all';
  }

  // wire header controls
  document.getElementById('editorBackBtn').onclick = () => openAdminPreviewClass(classDoc.name);

  document.getElementById('editorPeriods').onchange = () => {
    const p = Number(document.getElementById('editorPeriods').value || 2);
    // reload editor with new period count (preserving subject/date)
    const subj = document.getElementById('editorSubject').value || '';
    const date = document.getElementById('editorDate').value || nowLocalISODate();
    renderAdminEditor(classDoc, students, subj, date, p);
  };

  document.getElementById('editorCheckAll').onclick = () => {
    const p = Number(document.getElementById('editorPeriods').value || 2);
    toggleEditorCheckAll(p);
    updateEditorCheckAllLabel();
  };

  document.getElementById('editorExportBtn').onclick = (e) => {
    e.stopPropagation();
    document.getElementById('editorExportMenu').classList.toggle('hidden');
  };
  document.getElementById('editorExportPdf').onclick = async () => {
    document.getElementById('editorExportMenu').classList.add('hidden');
    const subj = document.getElementById('editorSubject').value || '';
    const date = document.getElementById('editorDate').value || nowLocalISODate();
    await exportAttendanceCSVorPDF(classDoc.name, date, subj, 'pdf');
  };
  document.getElementById('editorExportCsv').onclick = async () => {
    document.getElementById('editorExportMenu').classList.add('hidden');
    const subj = document.getElementById('editorSubject').value || '';
    const date = document.getElementById('editorDate').value || nowLocalISODate();
    await exportAttendanceCSVorPDF(classDoc.name, date, subj, 'csv');
  };

  document.getElementById('editorSave').onclick = async () => {
    const subj = document.getElementById('editorSubject').value || '';
    const date = document.getElementById('editorDate').value || nowLocalISODate();
    const periods = Number(document.getElementById('editorPeriods').value || 2);
    if(!subj) return toast('Select a subject before saving.');
    if(!classSubjects.includes(subj)) return toast('Cannot save: subject is not assigned to this class.');

    // gather entries
    const rows = Array.from(document.querySelectorAll('.att-row-admin'));
    if(rows.length === 0) return toast('No students loaded.');
    const entries = rows.map(r => {
      const sid = r.dataset.student;
      const chks = Array.from(r.querySelectorAll('.admin-att-chk')).filter(c => c.dataset.student === sid).sort((a,b)=>Number(a.dataset.period)-Number(b.dataset.period));
      const flags = chks.map(c => !!c.checked);
      return { studentId: sid, flags, present_count: flags.reduce((s,f)=> s + (f?1:0), 0), percent: computePercentFromFlags(flags) };
    });

    const adminRecId = `${String(classDoc.name).replace(/\s+/g,'_')}__${String(subj).replace(/\s+/g,'_')}__${date}__admin`;
    try {
      const data = {
        class_id: classDoc.name,
        subject_id: subj,
        date,
        periods_count: periods,
        entries,
        saved_at: Timestamp.now(),
        last_edited_by: (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) ? currentUser.uid : (currentUser && currentUser.id) || 'admin',
        last_edited_at: Timestamp.now(),
        editor_role: 'admin'
      };
      await setDoc(doc(db, ATT_RECORDS_COLL, adminRecId), data, { merge: true });
      toast('Attendance saved (admin).');

      // undo logic
      if(lastAdminSave && lastAdminSave.timeoutId) { clearTimeout(lastAdminSave.timeoutId); lastAdminSave = null; }
      lastAdminSave = {
        id: adminRecId,
        timeoutId: setTimeout(() => { lastAdminSave = null; hideUndo(); }, 8000)
      };
      showUndo(`Saved ${classDoc.name} • ${subj} • ${date}`, async () => {
        // delete doc if deleteDoc is available
        try {
          if(typeof deleteDoc === 'function'){
            await deleteDoc(doc(db, ATT_RECORDS_COLL, adminRecId));
            toast('Undo successful — attendance removed.', 'warning');
            openAdminPreviewClass(classDoc.name);
          } else {
            toast('Undo not available (deleteDoc missing).' , 'warning');
          }
        } catch(err){
          console.error('undo delete failed', err);
          toast('Undo failed. See console.' , 'error', 3000);
        } finally {
          if(lastAdminSave && lastAdminSave.timeoutId) { clearTimeout(lastAdminSave.timeoutId); lastAdminSave = null; }
          hideUndo();
        }
      });

    } catch(err){
      console.error('admin save attendance failed', err);
      toast('Failed to save (see console).' , 'error', 3000);
    }
  };

  // initial selection
  if(subjectName) document.getElementById('editorSubject').value = subjectName;
  await loadAndRender(Number(periodsVal || 2));
}

/* show undo snackbar */
function showUndo(infoText, undoFn){
  const snk = document.getElementById('adminUndoSnk');
  const infoEl = document.getElementById('adminUndoInfo');
  const btn = document.getElementById('adminUndoBtn');
  if(!snk || !infoEl || !btn) return;
  infoEl.textContent = infoText;
  snk.style.display = 'block';
  btn.onclick = () => { undoFn && undoFn(); snk.style.display = 'none'; };
}
function hideUndo(){ const snk = document.getElementById('adminUndoSnk'); if(snk) snk.style.display = 'none'; }

/* Attendance history view — lists saved structured records for class with filters and edit */
async function openAttendanceHistory(className){
  const classDoc =
  (classesCache || []).find(c => c.name === className || c.id === className)
  || { name: className, subjects: [] };

const students =
  (studentsCache || []).filter(
    s => String(s.classId || s.class || s.className || '') === String(classDoc.name)
  );

  try {
    // header
    document.getElementById('attendanceList').classList.add('hidden');
    document.getElementById('attendanceClassView').classList.remove('hidden');

    document.getElementById('attendanceClassHeader').innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button id="histBackBtn" class="btn btn-ghost">← Back</button>
        <div><strong>History • ${escapeHtmlLocal(className)}</strong></div>
        <input id="histSearch" placeholder="Search teacher id/name or date (YYYY-MM-DD)..." style="margin-left:8px;padding:6px 8px;border-radius:8px;border:1px solid #eef2f7;min-width:240px" />
        <div style="margin-left:auto;display:flex;gap:8px">
          <button id="histRefresh" class="btn btn-ghost">Refresh</button>
        </div>
      </div>
    `;
    const editor = document.getElementById('attendanceClassEditor');
    editor.innerHTML = `<div class="muted">Loading history…</div>`;

    document.getElementById('histBackBtn').onclick = () => {
      document.getElementById('attendanceClassView').classList.add('hidden');
      document.getElementById('attendanceList').classList.remove('hidden');
      document.getElementById('attendanceClassHeader').innerHTML = '';
      document.getElementById('attendanceClassEditor').innerHTML = '';
    };

    async function loadHistory(){
      const recsSnap = await getDocs(query(collection(db, ATT_RECORDS_COLL), where('class_id','==', className)));
      const recs = recsSnap.docs.map(d => ({ id:d.id, ...d.data() }));
      // sort desc by date or saved_at
      recs.sort((a,b) => ((b.date||b.saved_at||'') + '').localeCompare((a.date||a.saved_at||'')));

      // build rows
      const rows = recs.map(r => {
        const editorLabel = r.editor_role || '';
        const by = r.last_edited_by || r.created_by || '';
        const when = r.saved_at ? (r.saved_at.seconds ? new Date(r.saved_at.seconds*1000).toISOString().slice(0,19).replace('T',' ') : String(r.saved_at)) : (r.date||'');
        const totalStudents = (r.entries || []).length;
        const teacherId = r.teacher_id || r.created_by || '';
        return `<div class="history-row" data-id="${escapeHtmlLocal(r.id)}" style="display:flex;gap:8px;align-items:center;padding:10px;border-bottom:1px solid #eef2f9">
          <div style="min-width:40px">${escapeHtmlLocal(r.date||'')}</div>
          <div style="flex:1">
            <div style="font-weight:800">${escapeHtmlLocal(r.subject_id||r.subject||'')}</div>
            <div class="muted">By: ${escapeHtmlLocal(by || teacherId)} ${editorLabel ? '('+escapeHtmlLocal(editorLabel)+')' : ''} • Saved: ${escapeHtmlLocal(when)}</div>
          </div>
          <div style="min-width:120px;text-align:right" class="muted">Students: ${totalStudents}</div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost viewRec" data-id="${escapeHtmlLocal(r.id)}">View</button>
            <button class="btn btn-ghost editRec" data-id="${escapeHtmlLocal(r.id)}">Edit</button>
          </div>
        </div>`;
      }).join('');
      editor.innerHTML = rows || '<div class="muted">No history found.</div>';

      // wire view/edit
      editor.querySelectorAll('.viewRec').forEach(b => b.onclick = async (ev) => {
        const id = ev.currentTarget.dataset.id;
        const snap = await getDoc(doc(db, ATT_RECORDS_COLL, id));
        if(!snap.exists()) return toast('Record not found.' , 'error', 3000);
        const rec = snap.data();
        // show modal with details
        const details = (rec.entries||[]).map(e => {
          return `<div style="padding:6px;border-bottom:1px solid #f3f4f6"><strong>${escapeHtmlLocal(e.studentId)}</strong> — ${escapeHtmlLocal(String(e.percent || computePercentFromFlags(e.flags||[])))}% • Present: ${e.present_count || 0} / ${rec.periods_count || 0}</div>`;
        }).join('');
        showModal(`Record • ${escapeHtmlLocal(rec.subject_id||rec.subject||'')}`, `<div>Date: ${escapeHtmlLocal(rec.date||'')}</div><div style="margin-top:8px">${details}</div><div style="text-align:right;margin-top:8px"><button id="closeRec" class="btn btn-ghost">Close</button></div>`);
        modalBody.querySelector('#closeRec').onclick = closeModal;
      });

      editor.querySelectorAll('.editRec').forEach(b => b.onclick = async (ev) => {
        const id = ev.currentTarget.dataset.id;
        const snap = await getDoc(doc(db, ATT_RECORDS_COLL, id));
        if(!snap.exists()) return toast('Record not found.' , 'error', 3000);
        const rec = { id: snap.id, ...snap.data() };
        // To edit, we open the editor with the record content:
        // Build students list from class (we already have students param), and prefill flags map
        const flagsMap = {};
        (rec.entries || []).forEach(e => { flagsMap[e.studentId] = e.flags || []; });
        // render editor with prefilled map (we'll provide a helper that accepts existing map)
        renderAdminEditorWithMap(classDoc, students, rec.subject_id || rec.subject || '', rec.date || nowLocalISODate(), rec.periods_count || 2, rec.id, flagsMap);
      });
    }

    document.getElementById('histRefresh').onclick = loadHistory;
    document.getElementById('histSearch').oninput = () => {
      // a tiny client-side filter by teacher id/name or date (we simply reload and filter)
      loadHistory().then(() => {
        const q = (document.getElementById('histSearch').value||'').trim().toLowerCase();
        if(!q) return;
        const editor = document.getElementById('attendanceClassEditor');
        Array.from(editor.querySelectorAll('.history-row')).forEach(row => {
          const text = (row.textContent || '').toLowerCase();
          row.style.display = text.includes(q) ? '' : 'none';
        });
      });
    };

    // initial load
    await (async ()=> {
      await new Promise(r => setTimeout(r,50)); // tiny wait for UI
      await (async () => {
        const recsSnap = await getDocs(query(collection(db, ATT_RECORDS_COLL), where('class_id','==', className)));
        // then call loadHistory via same function
        await document.getElementById('histRefresh').onclick();
      })();
    })();

  } catch(err){
    console.error('openAttendanceHistory failed', err);
    toast('Failed to load history.' 
      , 'error', 3000
    );
  }
}

/* Helper: edit a specific record (prefill map) */
async function renderAdminEditorWithMap(classDoc, students, subjectName, dateVal, periodsVal, recordId, flagsMap){
  // very similar to renderAdminEditor, but we prefill flagsMap and use recordId when saving to update instead of new admin id
  // For brevity reuse renderAdminEditor but after it loads override checkboxes based on flagsMap
  await renderAdminEditor(classDoc, students, subjectName, dateVal, periodsVal);
  // now apply flagsMap to checkboxes
  try {
    const editor = document.getElementById('attendanceClassEditor');
    Array.from(editor.querySelectorAll('.admin-att-chk')).forEach(chk => {
      const sid = chk.dataset.student;
      const p = Number(chk.dataset.period || 0);
      if(flagsMap && flagsMap[sid] && typeof flagsMap[sid][p] !== 'undefined'){
        chk.checked = !!flagsMap[sid][p];
      }
    });
    updateAllAdminPercentsInEditor(periodsVal);
    updateEditorCheckAllLabel();
    // override save handler to update this record id (instead of adminRecId)
    const saveBtn = document.getElementById('editorSave');
    if(saveBtn){
      saveBtn.onclick = async () => {
        const subj = document.getElementById('editorSubject').value || '';
        const date = document.getElementById('editorDate').value || nowLocalISODate();
        const periods = Number(document.getElementById('editorPeriods').value || 2);
        if(!subj) return toast('Select a subject before saving.' , 'warning');
        // gather entries
        const rows = Array.from(document.querySelectorAll('.att-row-admin'));
        if(rows.length === 0) return toast('No students loaded.', 'info');
        const entries = rows.map(r => {
          const sid = r.dataset.student;
          const chks = Array.from(r.querySelectorAll('.admin-att-chk')).filter(c => c.dataset.student === sid).sort((a,b)=>Number(a.dataset.period)-Number(b.dataset.period));
          const flags = chks.map(c => !!c.checked);
          return { studentId: sid, flags, present_count: flags.reduce((s,f)=> s + (f?1:0), 0), percent: computePercentFromFlags(flags) };
        });
        try {
          const data = {
            class_id: classDoc.name,
            subject_id: subj,
            date,
            periods_count: periods,
            entries,
            saved_at: Timestamp.now(),
            last_edited_by: (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) ? currentUser.uid : (currentUser && currentUser.id) || 'admin',
            last_edited_at: Timestamp.now(),
            editor_role: 'admin'
          };
          await setDoc(doc(db, ATT_RECORDS_COLL, recordId), data, { merge: true });
          toast('Attendance updated (admin).', 'success');
          openAdminPreviewClass(classDoc.name);
        } catch(err){
          console.error('update record failed', err);
          toast('Update failed. See console.' , 'error', 3000);
        }
      };
    }
  } catch(e){ console.warn('renderAdminEditorWithMap: fallback', e); }
}

/* EXPORT attendance helper (class + date + subject) */
async function exportAttendanceCSVorPDF(className, dateISO, subjectName = '', format = 'csv'){
  try {
    const recsSnap = await getDocs(query(collection(db, ATT_RECORDS_COLL), where('class_id','==', className), where('date','==', dateISO)));
    let recs = recsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if(subjectName) recs = recs.filter(r => String(r.subject_id || r.subject || '') === String(subjectName));

    if(recs.length === 0){
      // fallback to legacy
      const oldSnap = await getDocs(query(collection(db, LEGACY_ATT_COLL), where('class_id','==', className), where('date','==', dateISO)));
      const rowsOld = oldSnap.docs.map(d => ({ id:d.id, ...d.data() }));
      if(format === 'pdf'){
        try {
          const { jsPDF } = window.jspdf;
          const doc = new jsPDF({ unit:'pt', format:'a4' });
          await addPdfHeader(doc, `Attendance — ${className} — ${dateISO}`);
          const body = rowsOld.map(r => [ r.date||dateISO, r.class_id||r.class||'', r.subject||r.subject_id||'', r.studentId||r.student_id||'', r.status||'', r.note||'' ]);
          doc.autoTable({ startY: 110, head: [['Date','Class','Subject','StudentId','Status','Note']], body, margin:{left:40, right:40}, styles:{fontSize:9} });
          doc.save(`attendance_${className}_${dateISO}.pdf`);
        } catch(e){
          const csv = ['date,class,subject,studentId,status,note'].join(',') + '\n' + rowsOld.map(r => `${dateISO},${className},${r.subject||''},${r.studentId||''},${r.status||''},"${(r.note||'').replace(/"/g,'""')}"`).join('\n');
          const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`attendance_${className}_${dateISO}.csv`; a.click(); URL.revokeObjectURL(url);
        }
      } else {
        const csv = ['date,class,subject,studentId,status,note'].join(',') + '\n' + rowsOld.map(r => `${dateISO},${className},${r.subject||''},${r.studentId||''},${r.status||''},"${(r.note||'').replace(/"/g,'""')}"`).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`attendance_${className}_${dateISO}.csv`; a.click(); URL.revokeObjectURL(url);
      }
      toast('Export complete (legacy data).' , 'success');
      return;
    }

    // combine rows
    const rows = [];
    recs.forEach(r => {
      (r.entries || []).forEach(e => {
        rows.push({ date: r.date || dateISO, class: r.class_id, subject: r.subject_id || r.subject || '', studentId: e.studentId, present_count: e.present_count || 0, periods: r.periods_count || '', percent: e.percent || 0 });
      });
    });

    if(format === 'csv'){
      const lines = ['date,class,subject,studentId,present_count,periods,percent'];
      rows.forEach(rr => lines.push(`${rr.date},${rr.class},${rr.subject},${rr.studentId},${rr.present_count},${rr.periods},${rr.percent}`));
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`attendance_${className}_${dateISO}.csv`; a.click(); URL.revokeObjectURL(url);
      toast('CSV exported.' , 'success');
    } else {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit:'pt', format:'a4' });
      await addPdfHeader(doc, `Attendance — ${className} — ${dateISO}`);
      const body = rows.map(r => [ r.date || '', r.class || '', r.subject || '', r.studentId || '', String(r.present_count||0), String(r.periods || ''), String(r.percent||0) ]);
      doc.autoTable({ startY: 110, head: [['Date','Class','Subject','StudentId','Present','Periods','%']], body, margin:{left:40, right:40}, styles:{fontSize:9} });
      doc.save(`attendance_${className}_${dateISO}.pdf`);
      toast('PDF exported.' , 'success');
    }

  } catch(err){
    console.error('exportAttendanceCSVorPDF failed', err);
    toast('Export failed. See console.' , 'error', 3000);
  }
}

/* Export aggregated per-class all-subjects report (student x subject percent) */
async function exportAllSubjectsForClass(className, format='pdf'){
  try {
    const recsSnap = await getDocs(query(collection(db, ATT_RECORDS_COLL), where('class_id','==', className)));
    const recs = recsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const perStudent = {};
    const students = (studentsCache||[]).filter(s => String(s.classId||s.class||s.className||'') === String(className));
    const studentMap = {}; students.forEach(s => studentMap[s.id || s.studentId] = s);

    recs.forEach(r => {
      const subj = r.subject_id || r.subject || '';
      (r.entries || []).forEach(e => {
        if(!perStudent[e.studentId]) perStudent[e.studentId] = { studentName: (studentMap[e.studentId] ? (studentMap[e.studentId].fullName || studentMap[e.studentId].name) : ''), subjects: {} };
        const existing = perStudent[e.studentId].subjects[subj];
        if(!existing || (e.percent || 0) > (existing.percent || 0)) {
          perStudent[e.studentId].subjects[subj] = { percent: e.percent || computePercentFromFlags(e.flags||[]), savedAt: r.saved_at || r.date || '' };
        }
      });
    });

    const rows = [];
    for(const sid in perStudent){
      const p = perStudent[sid];
      for(const subj in p.subjects){
        rows.push({ studentId: sid, studentName: p.studentName || '', subject: subj, percent: p.subjects[subj].percent || 0 });
      }
    }
    if(rows.length === 0) return toast('No structured attendance records found for this class.' , 'info');

    if(format === 'csv'){
      const lines = ['studentId,studentName,subject,percent'];
      rows.forEach(r => lines.push(`${r.studentId},"${(r.studentName||'').replace(/"/g,'""')}",${r.subject},${r.percent}`));
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `attendance_${className}_subjects.csv`; a.click(); URL.revokeObjectURL(url);
      toast('CSV exported.' , 'success');
      return;
    } else {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit:'pt', format:'a4' });
      await addPdfHeader(doc, `Class Attendance — ${className}`);
      const body = rows.map(r => [ r.studentId || '', r.studentName || '', r.subject || '', String(r.percent || 0) + '%' ]);
      doc.autoTable({ startY: 110, head: [['StudentId','StudentName','Subject','% Present']], body, margin:{left:40, right:40}, styles:{fontSize:9} });
      doc.save(`attendance_${className}_subjects.pdf`);
      toast('PDF exported.', 'success');
    }

  } catch(err){
    console.error('exportAllSubjectsForClass failed', err);
    toast('Export failed. See console.' , 'error', 3000);
  }
}

/* PDF header helper (logo optional) */
async function addPdfHeader(doc, titleText){
  try {
    const logoUrl = 'assets/logo.png';
    const img = new Image();
    const p = new Promise((resolve) => {
      img.onload = () => {
        const w = img.width, h = img.height;
        const maxW = 80, maxH = 80;
        let dw = w, dh = h;
        if(dw > maxW){ dh = dh * (maxW/dw); dw = maxW; }
        if(dh > maxH){ dw = dw * (maxH/dh); dh = maxH; }
        const canvas = document.createElement('canvas');
        canvas.width = dw; canvas.height = dh;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, dw, dh);
        const dURL = canvas.toDataURL('image/png');
        try { doc.addImage(dURL, 'PNG', 40, 28, dw, dh); } catch(e){}
        resolve();
      };
      img.onerror = () => resolve();
    });
    img.src = logoUrl;
    await p;
  } catch(e){ /* ignore */ }

  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text(titleText, 140, 56);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text('AL-FATXI School — Attendance Report', 140, 74);
}

/* END admin attendance code */

// returns { ref: DocumentReference, snap: DocumentSnapshot, collectionName: 'users'|'admin' }
// snap may be null if not found
async function getDocRefForId(id){
  if(!id) return { ref: null, snap: null, collectionName: null };
  // try users
  try {
    const uRef = doc(db, 'users', id);
    const uSnap = await getDoc(uRef);
    if(uSnap.exists()) return { ref: uRef, snap: uSnap, collectionName: 'users' };
  } catch(e) { console.warn('users lookup failed', e); }
  // try admin
  try {
    const aRef = doc(db, 'admin', id);
    const aSnap = await getDoc(aRef);
    if(aSnap.exists()) return { ref: aRef, snap: aSnap, collectionName: 'admin' };
  } catch(e) { console.warn('admin lookup failed', e); }
  // not found
  return { ref: null, snap: null, collectionName: null };
}

async function renderUsers(){
  let page = document.getElementById('pageUsers');
  if(!page){
    page = document.createElement('section');
    page.id = 'pageUsers';
    page.className = 'page';
    const main = document.querySelector('main');
    main && main.appendChild(page);
  }

  // Determine current user & role
  const authUser = (typeof currentUser !== 'undefined' && currentUser) || (auth && auth.currentUser) || null;
  const currentUid = authUser ? (authUser.uid || '') : '';
  // role from localStorage or from user's doc
  let currentRole = localStorage.getItem('verifiedRole') || null;

  // try to load role from users collection if missing
  if(!currentRole && currentUid){
    try{
      const snap = await getDocs(query(collection(db,'users'), where('uid','==', currentUid)));
      if(snap && snap.size>0){
        currentRole = snap.docs[0].data().role || null;
        if(currentRole) localStorage.setItem('verifiedRole', currentRole);
      }
    }catch(e){ console.warn('get current role failed', e); }
  }

  // load users from both 'users' and 'admin' collections and merge them
  let allRecords = [];
  try{
    const [usersSnap, adminSnap] = await Promise.all([
      getDocs(collection(db,'users')).catch(e => { console.warn('users read failed', e); return { docs: [] }; }),
      getDocs(collection(db,'admin')).catch(e => { console.warn('admin read failed', e); return { docs: [] }; })
    ]);

    const usersArr = usersSnap.docs.map(d => ({ id: d.id, ...d.data(), _source: 'users' }));
    const adminsArr = adminSnap.docs.map(d => ({ id: d.id, ...d.data(), _source: 'admin' }));

    // merge by uid if present, otherwise by email
    const map = new Map();
    const addToMap = (u) => {
      const key = (u.uid && u.uid.toString()) || (u.email && u.email.toLowerCase()) || u.id;
      if(!key) return;
      const existing = map.get(key) || {};
      // merge fields: prefer users collection fields, but let admin collection provide role/name if missing
      const merged = { ...existing, ...u };
      map.set(key, merged);
    };

    usersArr.forEach(addToMap);
    adminsArr.forEach(addToMap);

    allRecords = Array.from(map.values())
      .map(u => {
        // normalize role and email lowercase for consistent checks
        if(u.email) u.email = (u.email || '').trim();
        if(!u.role) u.role = u.isAdmin ? 'admin' : (u.role || '');
        return u;
      })
      .filter(u => !u.deleted); // exclude soft-deleted
  }catch(err){
    console.error('load users failed', err);
    toast('Failed to load users' , 'error', 3000);
  }

  // sort users by role then email (superadmins first)
  allRecords.sort((a,b) => {
    const roleOrder = (r) => r === 'superadmin' ? 0 : (r === 'admin' ? 1 : 2);
    const ra = roleOrder(a.role), rb = roleOrder(b.role);
    if(ra !== rb) return ra - rb;
    return (a.email || '').localeCompare(b.email || '');
  });

  const users = allRecords;

  page.innerHTML = `
    <div class="page-header users-top">
      <button id="addUserBtn" class="btn btn-primary">+ Add Admin</button>
      <div class="total" id="usersTotal">${users.length} users</div>
      <input id="usersSearch" class="users-search" placeholder="Search users (email, name, uid)" />
    </div>

    <!-- table for desktop -->
    <div id="usersTableContainer">
      <table class="users-table" id="usersTable">
        <thead>
          <tr><th style="width:48px">No</th><th>Email</th><th style="width:160px">Role</th><th style="width:150px">Actions</th></tr>
        </thead>
        <tbody id="usersTbody"></tbody>
      </table>
    </div>

    <!-- cards for mobile -->
    <div class="card-list" id="usersCardList"></div>

    <div id="usersList"></div>
  `;

  document.getElementById('addUserBtn').onclick = openAddUserModal;
  document.getElementById('usersSearch').oninput = () => renderUsersList(users, currentUid, currentRole);

  renderUsersList(users, currentUid, currentRole);
}



function canPerformAction(currentRole, currentUid, targetUser){
  // default deny
  const targetRole = targetUser.role || 'admin';
  const targetUid = targetUser.uid || targetUser.id || '';

  // nobody can delete a superadmin
  if(targetRole === 'superadmin') {
    return { canEdit: currentRole === 'superadmin', canDelete: false };
  }

  // nobody can delete themselves
  if(currentUid && targetUid && currentUid === targetUid){
    return { canEdit: true, canDelete: false };
  }

  // if current is superadmin -> can edit/delete admins, but cannot delete other superadmins (already handled)
  if(currentRole === 'superadmin'){
    return { canEdit: true, canDelete: true };
  }

  // if current is admin -> can edit/delete other admins, but cannot edit/delete superadmin (handled above)
  if(currentRole === 'admin'){
    // can't delete or edit superadmin (handled),
    return { canEdit: targetRole === 'admin', canDelete: targetRole === 'admin' };
  }

  // fallback: no permissions
  return { canEdit: false, canDelete: false };
}

function renderUsersList(users, currentUid, currentRole){
  const q = (document.getElementById('usersSearch') && document.getElementById('usersSearch').value || '').trim().toLowerCase();

  // allow matching uid too
  const list = (users || []).filter(u => {
    if(!q) return true;
    const email = (u.email||'').toLowerCase();
    const name = (u.displayName||'').toLowerCase();
    const uid = (u.uid||u.id||'').toLowerCase();
    return email.includes(q) || name.includes(q) || uid.includes(q);
  });

  // update total
  const totalEl = document.getElementById('usersTotal');
  if(totalEl) totalEl.textContent = `${list.length} users`;

  // Desktop table (show Email, Name, Role, Actions=Edit+Delete)
  const tbody = document.getElementById('usersTbody');
  if(tbody){
    tbody.innerHTML = '';
    list.forEach((u, idx) => {
      const perms = canPerformAction(currentRole, currentUid, u);
      const editDisabled = !perms.canEdit;
      const delDisabled = !perms.canDelete;

      // ensure displayName/email normalized for table
      const emailHtml = escape(u.email || '');
      const nameHtml = escape(u.displayName || '');
      const roleHtml = escape(u.role || 'admin');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:8px">${idx+1}</td>
        <td style="padding:8px">${emailHtml}</td>
        <td style="padding:8px">${nameHtml}</td>
        <td style="padding:8px"><span class="role-pill">${roleHtml}</span></td>
        <td style="padding:8px">
          <!-- desktop shows Edit + Delete only (no View) -->
          <button class="action-btn btn-edit" data-id="${u.id}" title="Edit" ${editDisabled ? 'disabled' : ''}>${svgEdit()}</button>
          <button class="action-btn btn-del" data-id="${u.id}" title="Delete" ${delDisabled ? 'disabled' : ''}>${svgDelete()}</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // wire buttons
    tbody.querySelectorAll('.btn-edit').forEach(b => b.onclick = openEditUserModal);
    tbody.querySelectorAll('.btn-del').forEach(b => b.onclick = deleteUser);
  }

  // Mobile cards (compact): ONLY show View icon on actions, no role shown and compact layout
  const cardList = document.getElementById('usersCardList');
  if(cardList){
    cardList.innerHTML = '';
    list.forEach((u, idx) => {
      const emailText = (u.email || '');
      const nameText = (u.displayName || '');
      // safe initial: prefer displayName[0] else email[0] else 'U'
      const initial = (((u.displayName || '').charAt(0)) || ((u.email || '').charAt(0)) || 'U').toUpperCase();

      const card = document.createElement('div');
      card.className = 'user-card';
      card.innerHTML = `
        <div class="left">
          <div style="width:40px;height:40px;border-radius:8px;background:linear-gradient(135deg,#e6eef8,#dbeafe);display:grid;place-items:center;font-weight:600">${escape(initial)}</div>
          <div>
            <div style="font-weight:600">${escape(emailText)}</div>
            <div class="meta" style="display:none">${escape(nameText)}</div> <!-- hidden per request -->
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <!-- mobile: only View button visible -->
          <button class="btn-icon btn-view" data-id="${u.id}" title="View">${svgView()}</button>
        </div>
      `;
      cardList.appendChild(card);
    });

    cardList.querySelectorAll('.btn-view').forEach(b => b.onclick = openViewUserModal);
  }
}


function openAddUserModal(){
  // Only allow creating Admins; role select limited to 'admin' - you said you'll add other types later
  const html = `
    <div style="display:grid;grid-template-columns:1fr;gap:8px">
      <div><label>Email</label><input id="newUserEmail" type="email" /></div>
      <div><label>Name</label><input id="newUserName" /></div>
      <div><label>Role</label><select id="newUserRole"><option value="admin">Admin</option></select></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="newUserClose" class="btn btn-ghost">Close</button>
      <button id="newUserSave" class="btn btn-primary">Save</button>
    </div>
  `;
  showModal('Add Admin', html);
  modalBody.querySelector('#newUserClose').onclick = closeModal;
  modalBody.querySelector('#newUserSave').onclick = async () => {
    const email = modalBody.querySelector('#newUserEmail').value.trim();
    const name = modalBody.querySelector('#newUserName').value.trim();
    const role = modalBody.querySelector('#newUserRole').value;
    if(!email) return toast('Email required', 'info');
    try{
      const payload = {
        email,
        displayName: name || '',
        role,
        createdAt: Timestamp.now(),
        createdBy: (currentUser && currentUser.uid) || (auth && auth.currentUser && auth.currentUser.uid) || null
      };
      const ref = await addDoc(collection(db,'users'), payload);
      toast('Admin added' , 'success');
      closeModal();
      renderUsers();
    }catch(err){
      console.error('add admin failed', err);
      toast('Failed to add' , 'error', 3000);
    }
  };
}

async function openViewUserModal(e){
  const id = (e && e.target && e.target.dataset && e.target.dataset.id) || (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id);
  if(!id) return;
  // find correct doc ref/snap
  const { ref, snap } = await getDocRefForId(id);
  if(!snap || !snap.exists()) return toast('User not found', 'info');
  const u = { id: snap.id, ...snap.data() };

  // determine actions allowed for current user
  const authUser = (typeof currentUser !== 'undefined' && currentUser) || (auth && auth.currentUser) || null;
  const currentUid = authUser ? authUser.uid : '';
  const currentRole = localStorage.getItem('verifiedRole') || null;
  const perms = canPerformAction(currentRole, currentUid, u);

  const html = `
    <div style="display:grid;grid-template-columns:1fr;gap:8px">
      <div><label>Name</label><div style="padding:8px;border-radius:8px;background:#fff">${escape(u.displayName||'')}</div></div>
      <div><label>Email</label><div style="padding:8px;border-radius:8px;background:#fff">${escape(u.email||'')}</div></div>
      <div><label>Role</label><div style="padding:8px;border-radius:8px;background:#fff">${escape(u.role||'admin')}</div></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button id="viewClose" class="btn btn-ghost">Close</button>
        <button id="viewEdit" class="btn btn-primary" ${perms.canEdit ? '' : 'disabled'}>${svgEdit()} Edit</button>
        <button id="viewDelete" class="btn btn-danger" ${perms.canDelete ? '' : 'disabled'}>${svgDelete()} Delete</button>
      </div>
    </div>
  `;
  showModal('View User', html);
  modalBody.querySelector('#viewClose').onclick = closeModal;
  modalBody.querySelector('#viewEdit').onclick = (perms.canEdit) ? (ev => {
    closeModal();
    const fake = { target: { dataset: { id } } };
    openEditUserModal(fake);
  }) : null;
  modalBody.querySelector('#viewDelete').onclick = (perms.canDelete) ? (() => {
    closeModal();
    const fake = { target: { dataset: { id } } };
    deleteUser(fake);
  }) : null;
}


async function openEditUserModal(e){
  const id = (e && e.target && e.target.dataset && e.target.dataset.id) || (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id);
  if(!id) return;
  const { ref, snap, collectionName } = await getDocRefForId(id);
  if(!snap || !snap.exists()) return toast('User not found', 'info');
  const u = { id: snap.id, ...snap.data() };

  // check permissions
  const authUser = (typeof currentUser !== 'undefined' && currentUser) || (auth && auth.currentUser) || null;
  const currentUid = authUser ? authUser.uid : '';
  const currentRole = localStorage.getItem('verifiedRole') || null;
  const perms = canPerformAction(currentRole, currentUid, u);
  if(!perms.canEdit) return toast('You are not allowed to edit this user', 'warning');

  const html = `
    <div style="display:grid;grid-template-columns:1fr;gap:8px">
      <div><label>Name</label><input id="editUserName" value="${escape(u.displayName||'')}" /></div>
      <div><label>Role</label>
        <select id="editUserRole">
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
          <option value="superadmin" ${u.role === 'superadmin' ? 'selected' : ''}>Super Admin</option>
        </select>
      </div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="editUserClose" class="btn btn-ghost">Close</button>
      <button id="editUserSave" class="btn btn-primary">Save</button>
    </div>
  `;
  showModal('Edit User', html);
  modalBody.querySelector('#editUserClose').onclick = closeModal;
  modalBody.querySelector('#editUserSave').onclick = async () => {
    const name = modalBody.querySelector('#editUserName').value.trim();
    const role = modalBody.querySelector('#editUserRole').value.trim();

    // UI-level re-check:
    const perms2 = canPerformAction(localStorage.getItem('verifiedRole'), currentUid, { ...u, role });
    if(!perms2.canEdit) {
      toast('You are not allowed to perform this change', 'warning');
      return;
    }

    try{
      // write to correct collection reference
      await updateDoc(ref, {
        displayName: name,
        role,
        updatedAt: Timestamp.now(),
        updatedBy: currentUid || null
      });
      toast('Updated', 'success');
      closeModal();
      renderUsers();
    }catch(err){
      console.error('update admin failed', err);
      toast('Failed to update', 'error', 3000);
    }
  };
}

async function deleteUser(e){
  const id = (e && e.target && e.target.dataset && e.target.dataset.id) || (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id);
  if(!id) return;
  const { ref, snap } = await getDocRefForId(id);
  if(!snap || !snap.exists()) return toast('User not found' , 'info');
  const u = { id: snap.id, ...snap.data() };

  const authUser = (typeof currentUser !== 'undefined' && currentUser) || (auth && auth.currentUser) || null;
  const currentUid = authUser ? authUser.uid : '';
  const currentRole = localStorage.getItem('verifiedRole') || null;
  const perms = canPerformAction(currentRole, currentUid, u);
  if(!perms.canDelete) return toast('You are not allowed to delete this user' , 'warning');

  // Confirm
  if(!confirm('Move user to Recycle Bin? This is soft-delete and can be restored later.')) return;

  try{
    // soft-delete: mark as deleted and store who deleted
    await updateDoc(ref, {
      deleted: true,
      deletedAt: Timestamp.now(),
      deletedBy: currentUid || null
    });
    toast('Moved to Recycle Bin', 'info');
    renderUsers();
  }catch(err){
    console.error('delete admin failed', err);
    toast('Failed to delete', 'error', 3000);
  }
}






/* End of payments/attendance/users additions */
