// teacher.js — updated per your requests
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import {
  collection, query, where, getDocs, getDoc, doc, setDoc, Timestamp
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

/* UI refs (must match teacher.html) */
const tabProfile = document.getElementById('tabProfile');
const tabAttendance = document.getElementById('tabAttendance');
const pageProfile = document.getElementById('pageTeacherProfile');
const pageAttendance = document.getElementById('pageTeacherAttendance');
const btnLogout = document.getElementById('btnTeacherLogout');

const classesGrid = document.getElementById('classesGrid');
const classFilter = document.getElementById('classFilter');
const classSearch = document.getElementById('classSearch');
const attendanceHeaderInner = document.getElementById('attendanceHeaderInner');
const attendanceEditor = document.getElementById('attendanceEditor');


const tabTeacherAnnouncements = document.getElementById('tabTeacherAnnouncements');
const pageTeacherAnnouncements = document.getElementById('pageTeacherAnnouncements');
const teacherAnnouncementsList = document.getElementById('teacherAnnouncementsList');


tabTeacherAnnouncements.onclick = () => showTab('announcements');


const modalBackdrop = document.getElementById('modalBackdrop');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalClose = document.getElementById('modalClose');
const toastEl = document.getElementById('toast');

function showModal(title, html) { modalTitle.textContent = title; modalBody.innerHTML = html; modalBackdrop.style.display = 'flex'; }
function closeModal() { modalBackdrop.style.display = 'none'; modalBody.innerHTML = ''; }
modalClose.onclick = closeModal;
modalBackdrop.onclick = (e) => { if(e.target === modalBackdrop) closeModal(); };
function toast(msg, t=2200){ if(!toastEl) return; toastEl.textContent = msg; toastEl.style.display = 'block'; setTimeout(()=>toastEl.style.display='none',t); }

function showTab(tab){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p=>p.style.display='none');

  if(tab === 'profile'){
    tabProfile.classList.add('active');
    pageProfile.style.display = 'block';
  }
  else if(tab === 'attendance'){
    tabAttendance.classList.add('active');
    pageAttendance.style.display = 'block';
  }
  else if(tab === 'announcements'){
    tabTeacherAnnouncements.classList.add('active');
    pageTeacherAnnouncements.style.display = 'block';
    renderTeacherAnnouncementsPage(); // 👈 load list
  }
}

tabProfile.onclick = () => showTab('profile');
tabAttendance.onclick = () => showTab('attendance');
btnLogout.onclick = async ()=> { await signOut(auth); window.location.href='login.html'; };

/* state + caches */
let currentTeacher = null;
let classesCache = [];
let subjectsCache = [];
let studentsCache = [];

const ATT_RECORDS_COLL = 'attendance_records'; // structured records
const LEGACY_ATT_COLL = 'attendance';

// view state for open class
let currentOpenClass = null; // { name, doc, students, allowedSubjects }
let currentMode = 'cards'; // 'cards' | 'preview' | 'taking'
let currentExistingRecord = null; // loaded attendance record (if any)

/* small helpers */
function escapeHtml(s){ if(!s && s!==0) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function isMobileViewport(){ return window.matchMedia && window.matchMedia('(max-width:768px)').matches; }
function nowLocalISODate(){ return (new Date()).toISOString().slice(0,10); }
function withinAllowedWindow(){ const d=new Date(); const h=d.getHours(); return (h>=6 && h<18); }
function computePercentFromFlags(flags){ if(!Array.isArray(flags)||flags.length===0) return 0; const present = flags.reduce((s,f)=>s + (f?1:0),0); return Math.round((present/flags.length)*100); }
function uidForRecord(classId, subjectId, dateISO, teacherId){ const safeClass=String(classId||'').replace(/\s+/g,'_'); const safeSub=String(subjectId||'').replace(/\s+/g,'_'); return `${safeClass}__${safeSub}__${dateISO}__${teacherId}`; }

/* ----------------------------------------------------------
   Load teacher + supporting data (classes, subjects, students)
   ---------------------------------------------------------- */
onAuthStateChanged(auth, async user => {
  if(!user) { window.location.href = 'login.html'; return; }
  const uid = user.uid;
  const email = (user.email||'').toLowerCase();
  try {
    // find teacher doc
    let found = null;
    const q1 = await getDocs(query(collection(db,'teachers'), where('authUid','==', uid)));
    if(q1.size>0) found = q1.docs[0];
    else {
      const q2 = await getDocs(query(collection(db,'teachers'), where('email','==', email)));
      if(q2.size>0) found = q2.docs[0];
    }
    if(!found){ alert('No teacher record found for this account'); await signOut(auth); window.location.href = 'login.html'; return; }
    currentTeacher = { id: found.id, ...found.data() };

    // after `currentTeacher = { id: found.id, ...found.data() };`
const nameEl = document.getElementById('currentTeacherName');
if(nameEl) nameEl.textContent = currentTeacher.fullName || currentTeacher.teacherId || '';

    // load caches
    const [classesSnap, subjectsSnap, studentsSnap] = await Promise.all([
      getDocs(collection(db,'classes')),
      getDocs(collection(db,'subjects')),
      getDocs(collection(db,'students'))
    ]);
    classesCache = classesSnap.docs.map(d=>({ id:d.id, ...d.data() }));
    subjectsCache = subjectsSnap.docs.map(d=>({ id:d.id, ...d.data() }));
    studentsCache = studentsSnap.docs.map(d=>({ id:d.id, ...d.data() }));

    // render profile and initial cards
    renderTeacherProfile();
    renderAttendanceLanding();
  } catch(err){
    console.error('Teacher load failed', err);
    alert('Failed to load teacher record or supporting data');
  }
});


/* -----------------------------
  TEACHER: announcements rendering
  Paste after teacher caches are loaded (after renderAttendanceLanding())
------------------------------*/
async function fetchAnnouncementsAll(){
  try {
    const snap = await getDocs(query(collection(db, 'announcements')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(err){
    console.error('fetchAnnouncementsAll', err); return [];
  }
}

/** Render announcements applicable to teacher and show unread counter (localStorage-based) */
async function renderAnnouncementsForTeacher(){
  if(!currentTeacher) return;
  try {
    const all = await fetchAnnouncementsAll();
    const myClasses = Array.isArray(currentTeacher.classes) ? currentTeacher.classes : [];
    const applicable = (all||[]).filter(a => {
      const aud = a.audience || [];
      if(aud.includes('all') || aud.includes('teachers')) return true;
      for(const i of aud){
        if(i.startsWith('class:')){
          const cls = i.split(':')[1];
          if(myClasses.includes(cls)) return true;
        }
      }
      return false;
    }).sort((a,b) => (b.createdAt && b.createdAt.seconds ? b.createdAt.seconds : 0) - (a.createdAt && a.createdAt.seconds ? a.createdAt.seconds : 0));

    // unread count using localStorage
    const lastSeenKey = `ann_lastSeen_teacher_${currentTeacher.id || currentTeacher.email || 'unknown'}`;
    const lastSeen = Number(localStorage.getItem(lastSeenKey) || '0');
    const unread = (applicable||[]).reduce((s,a) => {
      const ts = a.createdAt && a.createdAt.seconds ? a.createdAt.seconds * 1000 : Date.parse(a.createdAt||'') || 0;
      return s + (ts > lastSeen ? 1 : 0);
    }, 0);

    const counterEl = document.getElementById('teacherAnnouncementsCounter');
    const btn = document.getElementById('teacherAnnouncementsBtn');
    if(counterEl) { counterEl.textContent = unread > 0 ? String(unread) : ''; counterEl.style.display = unread > 0 ? 'inline-block' : 'none'; }

    if(btn){
      btn.onclick = () => {
        const html = (applicable||[]).map(a => {
          const ts = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().toLocaleString() : '';
          return `<div style="padding:8px;border-bottom:1px solid #eee"><div style="font-weight:700">${escapeHtml(a.title)}</div><div class="muted small">${escapeHtml(ts)}</div><div style="white-space:pre-wrap;margin-top:6px">${escapeHtml(a.body)}</div></div>`;
        }).join('');
        showModal('Announcements', `<div style="max-height:60vh;overflow:auto;padding:8px">${html || '<div class="muted">No announcements</div>'}</div><div style="text-align:right;margin-top:8px"><button id="markReadTeach" class="btn">Mark all read</button></div>`);
        setTimeout(()=> {
          const markBtn = document.getElementById('markReadTeach');
          if(markBtn) markBtn.onclick = () => {
            localStorage.setItem(lastSeenKey, String(Date.now()));
            if(counterEl) counterEl.style.display = 'none';
            closeModal();
            toast('Marked as read');
          };
        }, 80);
      };
    }
  } catch(err){ console.error('renderAnnouncementsForTeacher err', err); }
}

// call it after your existing render call (you can paste this call where you already render profile/attendance)
setTimeout(() => { try { renderAnnouncementsForTeacher().catch(()=>{}); } catch(e){ } }, 200);
window.renderAnnouncementsForTeacher = renderAnnouncementsForTeacher;

/* ---------------- Profile (unchanged) ---------------- */
function renderTeacherProfile(){
  if(!currentTeacher) return;
  pageProfile.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:900px">
      <div>
        <div style="font-weight:900;font-size:1.1rem">${escapeHtml(currentTeacher.fullName||'')}</div>
        <div class="muted">ID: ${escapeHtml(currentTeacher.teacherId || currentTeacher.id || '')}</div>
        <div style="margin-top:8px">Phone: ${escapeHtml(currentTeacher.phone||'—')}</div>
        <div>Email: ${escapeHtml(currentTeacher.email||'—')}</div>
      </div>
      <div>
        <div>Salary: <strong>${currentTeacher.salary ? (currentTeacher.salary) : '—'}</strong></div>
        <div style="margin-top:6px">Balance: <strong>${(Number(currentTeacher.balance_cents||0)/100).toFixed(2)}</strong></div>
        <div style="margin-top:8px">Subjects: <div class="muted">${escapeHtml((currentTeacher.subjects||[]).join(', ') || '—')}</div></div>
        <div style="margin-top:8px">Classes: <div class="muted">${escapeHtml((currentTeacher.classes||[]).join(', ') || '—')}</div></div>
      </div>
    </div>
  `;
}

/* ---------------- Attendance landing (cards only) ---------------- */
function renderAttendanceLanding(){
  // populate class filter
  classFilter.innerHTML = '<option value="__all">All assigned classes</option>';
  (currentTeacher.classes||[]).forEach(c => {
    const opt = document.createElement('option'); opt.value = c; opt.textContent = c; classFilter.appendChild(opt);
  });

  renderClassCards();
  classFilter.onchange = () => renderClassCards();
  classSearch.oninput = () => renderClassCards();

  // initial state = cards
  showCardsView();
}

function showCardsView(){
  currentMode = 'cards';
  // show classes area, hide the class view area
  const classesArea = document.getElementById('classesArea');
  const classView = document.getElementById('classView');
  if(classesArea) classesArea.classList.remove('hidden');
  if(classView) classView.classList.add('hidden');

  attendanceHeaderInner.innerHTML = '';
  attendanceEditor.innerHTML = `<div class="muted">Choose a class from the list.</div>`;
  try{ window.scrollTo({ top: 0, behavior: 'smooth' }); }catch(e){}
}

function hideCardsView(){
  // hide classes area, show class view area
  const classesArea = document.getElementById('classesArea');
  const classView = document.getElementById('classView');
  if(classesArea) classesArea.classList.add('hidden');
  if(classView) classView.classList.remove('hidden');
}


function updateTeacherUnreadCounter(){
  // compute unread again and update nav badge with pulse if >0
  if(!currentTeacher) return;
  fetchAnnouncementsAll().then(all => {
    const myClasses = Array.isArray(currentTeacher.classes) ? currentTeacher.classes : [];
    const applicable = (all||[]).filter(a => {
      const aud = a.audience || [];
      if(aud.includes('all') || aud.includes('teachers')) return true;
      return aud.some(x => x.startsWith('class:') && myClasses.includes(x.split(':')[1]));
    });
    const lastSeenKey = `ann_lastSeen_teacher_${currentTeacher.id || currentTeacher.email || 'unknown'}`;
    const lastSeen = Number(localStorage.getItem(lastSeenKey) || '0');
    const unread = (applicable||[]).reduce((s,a) => {
      const ts = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0;
      return s + (ts > lastSeen ? 1 : 0);
    }, 0);

    const badge = document.getElementById('teacherAnnouncementsCounter');
    if(badge){
      badge.textContent = unread > 0 ? String(unread) : '';
      if(unread > 0){
        badge.style.display = 'inline-block';
        badge.classList.add('pulse');
      } else {
        badge.style.display = 'none';
        badge.classList.remove('pulse');
      }
    }
  }).catch(e => console.warn('unread counter update failed', e));
}

/* create class cards */
function renderClassCards(){
  const filter = classFilter.value || '__all';
  const q = (classSearch.value||'').trim().toLowerCase();
  const classes = (currentTeacher.classes||[]).slice();
  const rows = [];

  for(const cname of classes){
    const cdoc = classesCache.find(x => x.name === cname || x.id === cname) || { name: cname, id: cname, subjects: [] };
    const stdCount = studentsCache.filter(s => String(s.classId || s.class || s.className || '') === String(cdoc.name)).length;
    const classSubjects = Array.isArray(cdoc.subjects) ? cdoc.subjects.map(String) : [];
    const teacherSubs = (currentTeacher.subjects || []).map(String);
    const intersect = teacherSubs.filter(s => classSubjects.includes(s) || classSubjects.includes(String(s)));
    rows.push({ doc: cdoc, students: stdCount, subjects: intersect });
  }

  let filtered = rows;
  if(filter !== '__all') filtered = rows.filter(r => String(r.doc.name) === String(filter));
  if(q) filtered = filtered.filter(r => String(r.doc.name).toLowerCase().includes(q));

  if(filtered.length === 0){
    classesGrid.innerHTML = `<div class="muted">No classes found (check your assignments).</div>`;
    return;
  }

  classesGrid.innerHTML = filtered.map(r => {
    const subjText = (r.subjects && r.subjects.length) ? r.subjects.slice(0,3).join(', ') : '<span class="muted">No assigned subjects</span>';
    return `<div class="card" data-class="${escapeHtml(r.doc.name)}">
      <div>
        <div style="font-weight:700">${escapeHtml(r.doc.name)}</div>
        <div class="meta">Students: ${r.students}</div>
        <div class="subjects">Subjects: ${subjText}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
        <button class="btn btn-ghost open-class" data-class="${escapeHtml(r.doc.name)}">Open</button>
        <button class="btn btn-ghost view-subjects" data-class="${escapeHtml(r.doc.name)}">Subjects</button>
      </div>
    </div>`;
  }).join('');

  // events
  classesGrid.querySelectorAll('.open-class').forEach(b => b.onclick = (ev) => {
    const cname = ev.currentTarget.dataset.class;
    openClassAttendance(cname, { autoShowTakingControls:false });
  });
  classesGrid.querySelectorAll('.view-subjects').forEach(b => b.onclick = (ev) => {
    const cname = ev.currentTarget.dataset.class;
    showClassSubjectsModal(cname);
  });
  // card click opens
  classesGrid.querySelectorAll('.card').forEach(card => {
    card.onclick = (ev) => {
      if(ev.target && (ev.target.classList.contains('btn') || ev.target.closest('button'))) return;
      const cname = card.dataset.class;
      openClassAttendance(cname, { autoShowTakingControls:false });
    };
  });
}

/* ---------------- Subjects modal (unchanged) ---------------- */
function showClassSubjectsModal(className){
  const classDoc = classesCache.find(c => c.name === className || c.id === className) || { name: className, subjects: [] };
  const classSubjects = Array.isArray(classDoc.subjects) ? classDoc.subjects : [];
  const allowed = (currentTeacher.subjects || []).filter(s => classSubjects.includes(s) || classSubjects.includes(String(s)));
  const html = `
    <div>
      <div><strong>Class:</strong> ${escapeHtml(className)}</div>
      <div style="margin-top:8px"><strong>Subjects assigned to the class:</strong></div>
      <div class="muted">${classSubjects.length ? escapeHtml(classSubjects.join(', ')) : 'No subjects on class record'}</div>
      <div style="margin-top:8px"><strong>Your assigned subjects for this class:</strong></div>
      <div>${allowed.length ? escapeHtml(allowed.join(', ')) : '<span class="muted">None — you cannot take attendance for this class</span>'}</div>
      <div style="margin-top:12px;text-align:right"><button id="closeSub" class="btn btn-ghost">Close</button></div>
    </div>
  `;
  showModal(`Subjects — ${escapeHtml(className)}`, html);
  modalBody.querySelector('#closeSub').onclick = closeModal;
}

async function renderTeacherAnnouncementsPage(){
  if(!currentTeacher || !teacherAnnouncementsList) return;

  // fetch & filter
  const all = await fetchAnnouncementsAll();
  const myClasses = Array.isArray(currentTeacher.classes) ? currentTeacher.classes : [];
  const applicable = (all||[]).filter(a => {
    const aud = a.audience || [];
    if(aud.includes('all') || aud.includes('teachers')) return true;
    return aud.some(x => x.startsWith('class:') && myClasses.includes(x.split(':')[1]));
  }).sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));

  // lastSeen for teacher
  const lastSeenKey = `ann_lastSeen_teacher_${currentTeacher.id || currentTeacher.email || 'unknown'}`;
  const lastSeen = Number(localStorage.getItem(lastSeenKey) || '0');

  // build list HTML (title + date + preview 10 chars)
  if(!applicable.length){
    teacherAnnouncementsList.innerHTML = `<div class="muted">No announcements.</div>`;
    // ensure top badge hidden
    const topBadge = document.getElementById('teacherAnnouncementsCounter');
    if(topBadge) topBadge.style.display = 'none';
    return;
  }

  teacherAnnouncementsList.innerHTML = `<div class="ann-list">` + applicable.map(a => {
    const createdMs = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0;
    const ts = createdMs ? (new Date(createdMs)).toLocaleString() : '';
    const unread = createdMs > lastSeen;
    const previewRaw = String(a.body || '');
    const preview = previewRaw.length > 10 ? previewRaw.slice(0,10) + '…' : previewRaw;
    return `
      <div class="ann-card ${unread ? 'unread' : ''}" data-id="${escapeHtml(a.id)}" data-ts="${createdMs}">
        <div class="ann-head">
          <div class="ann-title">${escapeHtml(a.title || '(No title)')}</div>
          <div class="ann-meta">
            <div class="muted small">${escapeHtml(ts)}</div>
            ${unread ? '<div class="ann-new">NEW</div>' : ''}
          </div>
        </div>
        <div class="ann-preview">${escapeHtml(preview)}</div>
        <div class="ann-body">${escapeHtml(String(a.body || ''))}</div>
      </div>
    `;
  }).join('') + `</div>`;

  // wire expand/collapse + mark-as-read
  const annCards = Array.from(teacherAnnouncementsList.querySelectorAll('.ann-card'));
  annCards.forEach(card => {
    const body = card.querySelector('.ann-body');
    // ensure starting collapsed
    body.style.maxHeight = '0px';
    body.style.opacity = '0';

    card.onclick = (ev) => {
      // allow clicks on buttons inside to not toggle (safe)
      if(ev.target && (ev.target.tagName === 'BUTTON' || ev.target.closest('button'))) return;

      const isOpen = card.classList.toggle('open');
      if(isOpen){
        // expand with scrollHeight
        const targetH = body.scrollHeight;
        body.style.maxHeight = targetH + 'px';
        body.style.opacity = '1';
        // small title animation
        card.querySelector('.ann-title').style.transform = 'translateY(-2px)';
        // mark as read if unread
        if(card.classList.contains('unread')){
          card.classList.remove('unread');
          localStorage.setItem(lastSeenKey, String(Date.now()));
          updateTeacherUnreadCounter(); // update top badge
        }
      } else {
        body.style.maxHeight = '0px';
        body.style.opacity = '0';
        card.querySelector('.ann-title').style.transform = '';
      }
    };
  });

  // When page opens, update top unread counter & pulse
  updateTeacherUnreadCounter();
}


/* ---------------- Open class attendance (NEW UX) ----------------
   - Hides cards list
   - Auto-loads students and shows PREVIEW (no checkboxes)
   - Shows "Back" + "Take Attendance" button
   - When Take Attendance clicked -> show subject/periods/checks/save
------------------------------------------------------------------------ */
async function openClassAttendance(className, opts = { autoShowTakingControls:false }){
  // set currentOpenClass
  const classDoc = classesCache.find(c => c.name === className || c.id === className) || { name: className, subjects: [] };
  const classStudents = studentsCache.filter(s => String(s.classId || s.class || s.className || '') === String(classDoc.name));
  const classSubjects = Array.isArray(classDoc.subjects) ? classDoc.subjects.map(String) : [];
  const teacherSubs = (currentTeacher.subjects || []).map(String);
  const allowedSubjects = teacherSubs.filter(s => classSubjects.includes(s) || classSubjects.includes(String(s)));

  currentOpenClass = { name: classDoc.name, doc: classDoc, students: classStudents, allowedSubjects };
  currentExistingRecord = null;
  currentMode = 'preview';

  // hide cards and show header/editor for this class
  hideCardsView();

  // header: show Back + class name + Take Attendance button
  attendanceHeaderInner.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button id="btnBackToCards" class="btn btn-ghost">← Back</button>
      <div><strong>${escapeHtml(classDoc.name)}</strong><div class="muted small">Total students: ${classStudents.length}</div></div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button id="btnTakeAttendance" class="btn btn-primary">Take Attendance</button>
      </div>
    </div>
  `;

  document.getElementById('btnBackToCards').onclick = () => {
    // clear current class and show cards
    currentOpenClass = null;
    currentMode = 'cards';
    currentExistingRecord = null;
    showCardsView();
  };

  // initial preview: student rows with no checkboxes (name/id/percent)
  renderPreviewStudentList(classStudents);

  // auto-show taking controls if requested (rare). By default teacher must click Take Attendance
  document.getElementById('btnTakeAttendance').onclick = () => {
    enterTakeAttendanceMode();
  };

  if(opts.autoShowTakingControls) enterTakeAttendanceMode();
}

/* Render preview list (no checkboxes, just percent if historical exists) */
async function renderPreviewStudentList(students){
  // attempt to compute existing percent from any structured record for today+teacher? We'll show 0% if no record
  attendanceEditor.innerHTML = '';
  if(students.length === 0){
    attendanceEditor.innerHTML = `<div class="muted">No students in this class.</div>`;
    return;
  }

  // Try to load today's record for the teacher for any subject? We'll not block preview on it; preview percent will be 0 if no record.
  // For simplicity, preview percent shows last saved percent found in any structured record for this student & class (optional).
  const previewMap = {}; // studentId -> percent (we'll attempt structured_records scan - light)
  try {
    // find any attendance_records for this class saved by this teacher (or admin) - limited scan
    const recsSnap = await getDocs(collection(db, ATT_RECORDS_COLL));
    recsSnap.forEach(snap => {
      const r = snap.data();
      if(String(r.class_id) !== String(currentOpenClass.name)) return;
      if(!Array.isArray(r.entries)) return;
      r.entries.forEach(e => {
        if(!previewMap[e.studentId]) previewMap[e.studentId] = (e.percent || computePercentFromFlags(e.flags || []));
      });
    });
  } catch(e){ /* ignore preview failures */ }

  const rows = students.map((s, idx) => {
    const sid = s.id || s.studentId || '';
    const name = s.fullName || s.name || '';
    const pct = previewMap[sid] !== undefined ? previewMap[sid] : 0;
    return `<div class="att-row" data-student="${escapeHtml(sid)}" style="display:flex;gap:12px;padding:10px;border-bottom:1px solid #f4f6f9;align-items:center">
      <div style="width:36px">${idx+1}</div>
      <div style="min-width:120px">${escapeHtml(sid)}</div>
      <div class="name">${escapeHtml(name)}</div>
      <div style="width:64px;text-align:right"><small class="row-pct">${pct}%</small></div>
    </div>`;
  }).join('');
  attendanceEditor.innerHTML = rows;
}

/* Enter "Take Attendance" mode: show subject/periods/checks/save and render checkboxes */
async function enterTakeAttendanceMode(){
  if(!currentOpenClass) return toast('No class open.');
  currentMode = 'taking';
  const classDoc = currentOpenClass.doc;
  const students = currentOpenClass.students || [];
  const allowedSubjects = currentOpenClass.allowedSubjects || [];
  const todayISO = nowLocalISODate();

  // header expanded to show period/subject controls + smart checkall button
  attendanceHeaderInner.innerHTML = `
    <div class="controls-sticky">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button id="btnBackToCards" class="btn btn-ghost">← Back</button>
        <div><strong>${escapeHtml(classDoc.name)}</strong> <div class="muted small">Total students: ${students.length}</div></div>
        <label>Subject
          <select id="hdrSubject">${(allowedSubjects.length ? `<option value="">Select subject</option>` : `<option value="">No allowed subject</option>`) + allowedSubjects.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}</select>
        </label>
        <label>Date <input id="hdrDate" type="date" value="${todayISO}" /></label>
        <label>Periods
          <select id="hdrPeriods"><option value="1">1</option><option value="2" selected>2</option><option value="3">3</option><option value="4">4</option></select>
        </label>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button id="btnCheckAll" class="btn btn-ghost">Check all</button>
          <button id="btnSaveClass" class="btn btn-primary">Save Attendance</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btnBackToCards').onclick = () => {
    // when leaving, show cards again
    currentOpenClass = null;
    currentMode = 'cards';
    currentExistingRecord = null;
    showCardsView();
  };

  // load any existing record for this teacher/class/subject/date if present (subject might be empty until user selects)
  currentExistingRecord = null; // will be loaded after subject pick or when saving

  // render students with NO checkboxes yet? The user already clicked Take Attendance so they expect checkboxes now.
  // We'll default to periodsCount currently selected (2)
  const initialPeriods = Number(document.getElementById('hdrPeriods').value || 2);

  // Render checkboxes for the selected periods (no existing flags unless teacher chooses subject and saved record present)
  renderStudentRowsForEditor(students, initialPeriods, {}); // blank flags

  // wire subject change: try to load existing record for chosen subject+date
  const hdrSubject = document.getElementById('hdrSubject');
  const hdrDate = document.getElementById('hdrDate');
  const hdrPeriods = document.getElementById('hdrPeriods');
  const btnCheckAll = document.getElementById('btnCheckAll');

  async function tryLoadExistingForSubject(){
    const subj = hdrSubject.value;
    const date = hdrDate.value;
    const periods = Number(hdrPeriods.value || 2);
    if(!subj) {
      // keep fresh blank rows
      renderStudentRowsForEditor(students, periods, {});
      currentExistingRecord = null;
      return;
    }
    // ensure teacher allowed
    if(!(currentTeacher.subjects || []).includes(subj)) return toast('You are not assigned to this subject.');
    // load record
    const recId = uidForRecord(classDoc.name, subj, date, currentTeacher.id);
    try {
      const snap = await getDoc(doc(db, ATT_RECORDS_COLL, recId));
      if(snap && snap.exists()){
        const rec = { id: snap.id, ...snap.data() };
        currentExistingRecord = rec;
        // build map of flags
        const map = {};
        (rec.entries || []).forEach(e => { map[e.studentId] = e.flags || Array.from({length:rec.periods_count||periods}).map(()=>false); });
        renderStudentRowsForEditor(students, Math.max(periods, rec.periods_count||periods), map);
        // after rendering, update checkAll label
        updateCheckAllLabel();
        return;
      }
    } catch(err){ console.warn('load existing record failed', err); }
    // no existing -> blank rows
    currentExistingRecord = null;
    renderStudentRowsForEditor(students, periods, {});
    updateCheckAllLabel();
  }

  hdrSubject.onchange = tryLoadExistingForSubject;
  hdrDate.onchange = tryLoadExistingForSubject;

  // Changing periods should re-render checkboxes for that new count (preserving nothing)
  hdrPeriods.onchange = () => {
    const periods = Number(hdrPeriods.value || 2);
    // if there is existing record and its periods_count differs, prefer existing flags length (but we simplify: re-render blank or existingMap)
    if(currentExistingRecord && currentExistingRecord.periods_count){
      // create map from existing but adjust to new periodsCount (truncate or extend false)
      const map = {};
      (currentExistingRecord.entries || []).forEach(e => {
        const flags = Array.from({length:periods}).map((_,i) => (Array.isArray(e.flags) && e.flags[i]) ? !!e.flags[i] : false);
        map[e.studentId] = flags;
      });
      renderStudentRowsForEditor(currentOpenClass.students, periods, map);
    } else {
      renderStudentRowsForEditor(currentOpenClass.students, periods, {});
    }
    updateCheckAllLabel();
  };

  // Check all toggle logic (single button toggles)
  btnCheckAll.onclick = () => {
    const periods = Number(document.getElementById('hdrPeriods').value || 2);
    toggleCheckAll(periods);
    updateCheckAllLabel();
  };

  // Save button wiring
  document.getElementById('btnSaveClass').onclick = async () => {
    const subj = hdrSubject.value;
    const date = hdrDate.value;
    const periods = Number(hdrPeriods.value || 2);
    if(!subj) return toast('Select subject before saving.');
    if(!withinAllowedWindow()) return toast('Attendance may only be recorded between 06:00 and 18:00.');
    // collect entries
    const rows = Array.from(attendanceEditor.querySelectorAll('.att-row'));
    if(rows.length === 0) return toast('No students loaded.');

    const entries = rows.map(r => {
      const sid = r.dataset.student;
      const chks = Array.from(r.querySelectorAll('.att-chk')).filter(c => c.dataset.student === sid).sort((a,b)=>Number(a.dataset.period)-Number(b.dataset.period));
      const flags = chks.map(c => !!c.checked);
      return { studentId: sid, flags, present_count: flags.reduce((s,f)=> s + (f?1:0), 0), percent: computePercentFromFlags(flags) };
    });

    // create or update record (teacher-specific deterministic id)
    const recId = uidForRecord(currentOpenClass.name, subj, date, currentTeacher.id);
    try {
      const recRef = doc(db, ATT_RECORDS_COLL, recId);
      const snap = await getDoc(recRef);
      if(snap.exists()){
        const rec = snap.data();
        const editableUntil = rec.editableUntil ? (rec.editableUntil.seconds ? rec.editableUntil.seconds*1000 : rec.editableUntil) : null;
        const now = Date.now();
        if(editableUntil && now > editableUntil){
          return toast('Edit window expired. Contact admin to modify attendance.');
        }
        // update
        await setDoc(recRef, {
          class_id: currentOpenClass.name,
          subject_id: subj,
          date,
          periods_count: periods,
          entries,
          saved_at: Timestamp.now(),
          editableUntil: Timestamp.fromMillis(Date.now() + (5*60*1000)),
          last_edited_by: currentTeacher.id
        }, { merge: true });
        toast('Attendance updated. You can edit for 5 minutes.');
      } else {
        // create
        await setDoc(recRef, {
          class_id: currentOpenClass.name,
          subject_id: subj,
          date,
          periods_count: periods,
          entries,
          saved_at: Timestamp.now(),
          editableUntil: Timestamp.fromMillis(Date.now() + (5*60*1000)),
          created_by: currentTeacher.id,
          teacher_id: currentTeacher.id
        });
        toast('Attendance saved. You can edit for 5 minutes.');
      }
      // after save keep mode 'preview' or remain in taking? we keep in taking so teacher can continue reviewing.
      // reload existing record into state
      try { const snap2 = await getDoc(recRef); if(snap2.exists()) currentExistingRecord = { id: snap2.id, ...snap2.data() }; } catch(e){}
    } catch(err){
      console.error('save attendance failed', err);
      toast('Failed to save attendance. See console.');
    }
  };
}

/* Render student rows with checkboxes for given periodCount + optional existing flags map */
function renderStudentRowsForEditor(students, periodCount, existingFlagsMap = {}){
  if(!Array.isArray(students)) students = [];
  if(students.length === 0){
    attendanceEditor.innerHTML = `<div class="muted">No students in this class.</div>`;
    return;
  }

  const isMobile = isMobileViewport();
  const rowsHtml = students.map((s, idx) => {
    const sid = s.id || s.studentId || '';
    const name = s.fullName || s.name || '';
    // ensure flags length == periodCount
    const flags = (existingFlagsMap && existingFlagsMap[sid]) ? (existingFlagsMap[sid].slice(0,periodCount).concat(Array.from({length:Math.max(0, periodCount - (existingFlagsMap[sid].length||0))}).map(()=>false))) : Array.from({length:periodCount}).map(()=>false);
    const percent = computePercentFromFlags(flags);
    const checkboxes = flags.map((f,i) => `<label style="margin-right:8px"><input class="att-chk" data-student="${escapeHtml(sid)}" data-period="${i}" type="checkbox" ${f ? 'checked' : ''} />P${i+1}</label>`).join('');
    if(isMobile){
      return `<div class="att-row" data-student="${escapeHtml(sid)}" style="display:flex;gap:12px;padding:10px;border-bottom:1px solid #f4f6f9;align-items:center">
        <div style="min-width:160px"><div style="font-weight:700">${escapeHtml(name)}</div><div class="muted">ID: ${escapeHtml(sid)}</div></div>
        <div style="display:flex;flex-direction:column;align-items:flex-end">
          <div style="display:flex;gap:6px;flex-wrap:wrap">${checkboxes}</div>
          <div style="margin-top:6px"><small class="row-pct">${percent}%</small></div>
        </div>
      </div>`;
    } else {
      return `<div class="att-row" data-student="${escapeHtml(sid)}">
        <div style="width:36px">${idx+1}</div>
        <div style="min-width:120px">${escapeHtml(sid)}</div>
        <div class="name">${escapeHtml(name)}</div>
        <div style="min-width:260px;display:flex;gap:8px">${checkboxes}</div>
        <div style="width:64px;text-align:right"><small class="row-pct">${percent}%</small></div>
      </div>`;
    }
  }).join('');

  const headerControls = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
    <div class="muted">Mark presence per selected period</div>
    <div><small class="muted">Percent updates live</small></div>
  </div>`;

  attendanceEditor.innerHTML = headerControls + rowsHtml;

  // attach handlers for dynamic percent updates
  const allChks = Array.from(attendanceEditor.querySelectorAll('.att-chk'));
  allChks.forEach(c => c.onchange = (ev) => {
    const sid = ev.currentTarget.dataset.student;
    updateRowPercent(sid);
    updateCheckAllLabel(); // update toggle label
  });
  updateAllPercents(periodCount);
  updateCheckAllLabel();
}

/* Update percent for one row */
function updateRowPercent(sid){
  const chks = Array.from(attendanceEditor.querySelectorAll(`.att-chk[data-student="${sid}"]`)).sort((a,b)=>Number(a.dataset.period)-Number(b.dataset.period));
  const flags = chks.map(c => c.checked);
  const pct = computePercentFromFlags(flags);
  const row = attendanceEditor.querySelector(`.att-row[data-student="${sid}"]`);
  if(row){
    const el = row.querySelector('.row-pct');
    if(el) el.textContent = `${pct}%`;
  }
}

/* Recompute all percents */
function updateAllPercents(periodsCount){
  const uniq = [...new Set(Array.from(attendanceEditor.querySelectorAll('.att-chk')).map(c=>c.dataset.student))];
  uniq.forEach(updateRowPercent);
}

/* Toggle Check All behaviour: if any unchecked -> check all, else uncheck all */
function toggleCheckAll(periodsCount){
  const allChks = Array.from(attendanceEditor.querySelectorAll('.att-chk'));
  if(allChks.length === 0) return;
  const anyUnchecked = allChks.some(c => !c.checked);
  allChks.forEach(c => c.checked = anyUnchecked ? true : false);
  updateAllPercents(periodsCount);
}

/* Update the Check all button label to be contextual */
function updateCheckAllLabel(){
  const btn = document.getElementById('btnCheckAll');
  if(!btn) return;
  const allChks = Array.from(attendanceEditor.querySelectorAll('.att-chk'));
  if(allChks.length === 0){ btn.textContent = 'Check all'; return; }
  const allChecked = allChks.every(c => c.checked);
  btn.textContent = allChecked ? 'Uncheck all' : 'Check all';
}

/* ---------------- end of file ---------------- */
