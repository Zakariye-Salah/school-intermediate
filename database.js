import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, Timestamp
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

/* UI refs (same as before + teachers) */
const tabStudents = document.getElementById('tabStudents');
const tabClasses = document.getElementById('tabClasses');
const tabSubjects = document.getElementById('tabSubjects');
const tabExams = document.getElementById('tabExams');
const tabTeachers = document.getElementById('tabTeachers'); // NEW: should exist in HTML

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

const openAddClass = document.getElementById('openAddClass');
const classesList = document.getElementById('classesList');
const classSearch = document.getElementById('classSearch');

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

const modalBackdrop = document.getElementById('modalBackdrop');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalClose = document.getElementById('modalClose');
const toastEl = document.getElementById('toast');

let currentUser = null;
let studentsCache = [];
let classesCache = [];
let subjectsCache = [];
let examsCache = [];
let teachersCache = []; // NEW
let examTotalsCache = {}; // examId -> { studentId: payload }
/* UI helpers */
// function showPage(id) {
//   // clear tab active classes (defensive - some tabs may be missing)
//   [tabStudents, tabClasses, tabSubjects, tabExams, tabTeachers].forEach(t=>{
//     if(t && t.classList) t.classList.remove('active');
//   });

//   // hide all pages (defensive - only hide if element exists)
//   if(pageStudents) pageStudents.style.display = 'none';
//   if(pageClasses) pageClasses.style.display = 'none';
//   if(pageSubjects) pageSubjects.style.display = 'none';
//   if(pageExams) pageExams.style.display = 'none';
//   if(pageTeachers) pageTeachers.style.display = 'none';

//   // show requested page and mark tab active
//   if(id === 'students'){ if(tabStudents) tabStudents.classList.add('active'); if(pageStudents) pageStudents.style.display = 'block'; }
//   if(id === 'classes'){ if(tabClasses) tabClasses.classList.add('active'); if(pageClasses) pageClasses.style.display = 'block'; }
//   if(id === 'subjects'){ if(tabSubjects) tabSubjects.classList.add('active'); if(pageSubjects) pageSubjects.style.display = 'block'; }
//   if(id === 'exams'){ if(tabExams) tabExams.classList.add('active'); if(pageExams) pageExams.style.display = 'block'; }
//   if(id === 'teachers' && pageTeachers){ if(tabTeachers) tabTeachers.classList.add('active'); pageTeachers.style.display = 'block'; }
// }

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


function showModal(title, html) {
  modalTitle.textContent = title; modalBody.innerHTML = html; modalBackdrop.style.display = 'flex';
}
function closeModal() { modalBackdrop.style.display = 'none'; modalBody.innerHTML = ''; }
modalClose.onclick = closeModal;
modalBackdrop.onclick = (e) => { if(e.target === modalBackdrop) closeModal(); };
function toast(msg, t=2200){ if(!toastEl) return; toastEl.textContent = msg; toastEl.style.display = 'block'; setTimeout(()=>toastEl.style.display='none',t); }

/** helper: pad number */
function pad(n, width){ n = String(n||''); return n.length >= width ? n : '0'.repeat(width - n.length) + n; }
/* id generator */
async function generateDefaultId(collectionName, prefix, digits){
  const t = Date.now() % (10**(digits));
  return `${prefix}${String(t).padStart(digits,'0')}`;
}

/* init/auth */
onAuthStateChanged(auth, async user => {
  if(!user) { window.location.href = 'login.html'; return; }
  currentUser = user;
  await loadAll();
});
btnLogout.onclick = async ()=>{ await signOut(auth); window.location.href='login.html'; };

/* data loading */
async function loadAll(){
  // fetch everything fresh
  await Promise.all([loadClasses(), loadSubjects(), loadStudents(), loadExams(), loadTeachers()]);
  populateClassFilters(); populateStudentsExamDropdown(); populateTeachersSubjectFilter();
  renderStudents(); renderClasses(); renderSubjects(); renderExams(); renderTeachers();
}
async function loadClasses(){
  const snap = await getDocs(collection(db,'classes'));
  classesCache = snap.docs.map(d=>({ id:d.id, ...d.data() }));
}
async function loadSubjects(){
  const snap = await getDocs(collection(db,'subjects'));
  // subject docs now only keep id + name (we removed max field from admin side)
  subjectsCache = snap.docs.map(d=>({ id:d.id, ...d.data() }));
}
async function loadStudents(){
  const snap = await getDocs(collection(db,'students'));
  studentsCache = snap.docs.map(d=>({ id:d.id, ...d.data() }));
}
async function loadExams(){
  const snap = await getDocs(collection(db,'exams'));
  examsCache = snap.docs.map(d=>({ id:d.id, ...d.data() }));
}
async function loadTeachers(){
  try {
    const snap = await getDocs(collection(db,'teachers'));
    teachersCache = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  } catch(err){ teachersCache = []; console.warn('loadTeachers failed', err); }
}

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

function renderTeachers(){
  if(!teachersList) return;
  const total = (teachersCache || []).length;

  if(isMobileViewport()){
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>Total teachers: ${total}</strong>
      <div class="muted">Mobile: tap View</div>
    </div><div id="teachersMobileList">`;
    const q = (teachersSearch && teachersSearch.value||'').trim().toLowerCase();
    const subjFilter = (teachersSubjectFilter && teachersSubjectFilter.value) || '';
    let list = (teachersCache || []).slice();
    list = list.filter(t => {
      if(subjFilter && (!(t.subjects || []).includes(subjFilter))) return false;
      if(!q) return true;
      return (t.fullName||'').toLowerCase().includes(q) || (t.phone||'').toLowerCase().includes(q) || (t.id||'').toLowerCase().includes(q);
    });

    list.forEach((t, idx) => {
      const id = escape(t.id || t.teacherId || '');
      const name = escape(t.fullName || '');
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid #f1f5f9">
        <div style="display:flex;gap:12px;align-items:center">
          <div style="min-width:28px;text-align:center;font-weight:700">${idx+1}</div>
          <div style="min-width:90px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${id}</div>
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</div>
        </div>
        <div><button class="btn btn-ghost btn-sm mobile-teacher-view" data-id="${escape(t.id||t.teacherId||'')}">View</button></div>
      </div>`;
    });
    html += `</div>`;
    teachersList.innerHTML = html;

    teachersList.querySelectorAll('.mobile-teacher-view').forEach(b=>{
      b.onclick = (ev) => openViewTeacherModal({ target:{ dataset:{ id: ev.currentTarget.dataset.id } }});
    });
    return;
  }

  // desktop table (unchanged)
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>Total teachers: ${total}</strong>
      <div class="muted">Showing ID, Name, Salary — click View for more</div>
    </div>`;
  html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="text-align:left;border-bottom:1px solid #e6eef8">
        <th style="padding:8px;width:48px">No</th>
        <th style="padding:8px;width:140px">ID</th>
        <th style="padding:8px">Name</th>
        <th style="padding:8px;width:120px">Salary</th>
        <th style="padding:8px;width:220px">Actions</th>
      </tr>
    </thead><tbody>`;

  const q = (teachersSearch && teachersSearch.value||'').trim().toLowerCase();
  const subjFilter = (teachersSubjectFilter && teachersSubjectFilter.value) || '';
  let list = (teachersCache || []).slice();
  list = list.filter(t => {
    if(subjFilter && (!(t.subjects || []).includes(subjFilter))) return false;
    if(!q) return true;
    return (t.fullName||'').toLowerCase().includes(q) || (t.phone||'').toLowerCase().includes(q) || (t.id||'').toLowerCase().includes(q);
  });

  list.forEach((t, idx) => {
    const id = escape(t.id || t.teacherId || '');
    const name = escape(t.fullName || '');
    const salary = (typeof t.salary !== 'undefined' && t.salary !== null) ? escape(String(t.salary)) : '—';
    html += `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px;vertical-align:middle">${idx+1}</td>
      <td style="padding:8px;vertical-align:middle">${id}</td>
      <td style="padding:8px;vertical-align:middle">${name}</td>
      <td style="padding:8px;vertical-align:middle">${salary}</td>
      <td style="padding:8px;vertical-align:middle">
        <button class="btn btn-ghost btn-sm view-teacher" data-id="${id}">View</button>
        <button class="btn btn-ghost btn-sm edit-teacher" data-id="${id}">Edit</button>
        <button class="btn btn-danger btn-sm del-teacher" data-id="${id}">Delete</button>
      </td>
    </tr>`;
  });

  html += `</tbody></table></div>`;
  teachersList.innerHTML = html;

  teachersList.querySelectorAll('.view-teacher').forEach(b => b.onclick = openViewTeacherModal);
  teachersList.querySelectorAll('.edit-teacher').forEach(b => b.onclick = openEditTeacherModal);
  teachersList.querySelectorAll('.del-teacher').forEach(b => b.onclick = deleteTeacher);
}

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
  if(!t) return toast('Teacher not found');

  const classesText = (t.classes && t.classes.length) ? t.classes.join(', ') : 'No classes';
  const subsText = (t.subjects && t.subjects.length) ? t.subjects.join(', ') : 'No subjects';
  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><strong>ID</strong><div class="muted">${escape(t.id || t.teacherId || '')}</div></div>
      <div><strong>Name</strong><div class="muted">${escape(t.fullName||'')}</div></div>
      <div><strong>Phone</strong><div class="muted">${escape(t.phone||'')}</div></div>
      <div><strong>Parent phone</strong><div class="muted">${escape(t.parentPhone||'')}</div></div>
      <div><strong>Salary</strong><div class="muted">${typeof t.salary !== 'undefined' ? escape(String(t.salary)) : '—'}</div></div>
      <div><strong>Created</strong><div class="muted">${t.createdAt ? (new Date(t.createdAt.seconds ? t.createdAt.seconds*1000 : t.createdAt)).toLocaleString() : '—'}</div></div>
      <div style="grid-column:1 / -1"><strong>Classes</strong><div class="muted">${escape(classesText)}</div></div>
      <div style="grid-column:1 / -1"><strong>Subjects</strong><div class="muted">${escape(subsText)}</div></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost" id="viewTeacherClose">Close</button>
      <button class="btn btn-ghost" id="viewTeacherEdit">Edit</button>
      <button class="btn btn-danger" id="viewTeacherDel">Delete</button>
    </div>
  `;
  showModal(`${escape(t.fullName||'')} — Teacher`, html);

  modalBody.querySelector('#viewTeacherClose').onclick = closeModal;
  modalBody.querySelector('#viewTeacherEdit').onclick = () => {
    closeModal();
    openEditTeacherModal({ target:{ dataset:{ id: t.id || t.teacherId } }});
  };
  modalBody.querySelector('#viewTeacherDel').onclick = async () => {
    if(!confirm('Delete teacher?')) return;
    await deleteTeacher({ target:{ dataset:{ id: t.id || t.teacherId } }});
    closeModal();
  };
}

/* ---------- Ensure teachers subject/class filter is populated ---------- */
function populateTeachersSubjectFilter(){
  // ensure subjectsCache and classesCache are available
  if(teachersSubjectFilter){
    teachersSubjectFilter.innerHTML = '<option value="">All subjects</option>';
    for(const s of (subjectsCache || [])){
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = s.name;
      teachersSubjectFilter.appendChild(opt);
    }
  }
  // no dedicated teachersClassFilter element in your snippet, but ensure classes are available for teacher modals
  // (class options will be read from classesCache when opening create/edit teacher modal)
}

/* ---------- Teachers create/edit (default TEC00001) ---------- */
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
      <div style="grid-column:1 / -1"><label>Assign classes (select multiple)</label><select id="teacherClasses" multiple size="6" style="width:100%">${classOptions}</select></div>
      <div style="grid-column:1 / -1"><label>Assign subjects (select multiple)</label><select id="teacherSubjects" multiple size="6" style="width:100%">${subjectOptions}</select></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="cancelTeacher" class="btn btn-ghost">Cancel</button>
      <button id="saveTeacher" class="btn btn-primary">Save</button>
    </div>
  `);

  modalBody.querySelector('#cancelTeacher').onclick = closeModal;
  modalBody.querySelector('#saveTeacher').onclick = async () => {
    let id = modalBody.querySelector('#teacherId').value.trim();
    const name = (modalBody.querySelector('#teacherName').value || '').trim();
    const phone = (modalBody.querySelector('#teacherPhone').value || '').trim();
    const parentPhone = (modalBody.querySelector('#teacherParentPhone').value || '').trim();
    const salaryVal = modalBody.querySelector('#teacherSalary').value;
    const salary = salaryVal ? Number(salaryVal) : null;
    const classesSelected = Array.from(modalBody.querySelectorAll('#teacherClasses option:checked')).map(o => o.value);
    const subjectsSelected = Array.from(modalBody.querySelectorAll('#teacherSubjects option:checked')).map(o => o.value);

    if(!name) return toast('Teacher name is required');

    if(!id) id = await generateDefaultId('teachers','TEC',5); // TEC00001 style (5 digits)
    const payload = {
      id, teacherId: id, fullName: name, phone: phone || '', parentPhone: parentPhone || '',
      salary: salary, classes: classesSelected, subjects: subjectsSelected,
      createdAt: Timestamp.now(), createdBy: currentUser ? currentUser.uid : null
    };

    try {
      // use setDoc so teacher doc id matches the generated teacher ID
      await setDoc(doc(db,'teachers', id), payload);
      toast('Teacher created');
      closeModal();
      await loadTeachers(); renderTeachers();
    } catch(err){
      console.error('create teacher failed', err);
      toast('Failed to create teacher');
    }
  };
}

/* Edit teacher (id may be teacher doc id) */
async function openEditTeacherModal(e){
  const id = e && e.target ? e.target.dataset.id : e;
  if(!id) return;
  let t = teachersCache.find(x => x.id === id || x.teacherId === id);
  if(!t){
    try {
      const snap = await getDoc(doc(db,'teachers', id));
      if(!snap.exists()) return toast('Teacher not found');
      t = { id: snap.id, ...snap.data() };
    } catch(err){ console.error(err); return toast('Failed to load teacher'); }
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
      <div style="grid-column:1 / -1"><label>Assign classes (select multiple)</label><select id="teacherClasses" multiple size="6" style="width:100%">${classOptions}</select></div>
      <div style="grid-column:1 / -1"><label>Assign subjects (select multiple)</label><select id="teacherSubjects" multiple size="6" style="width:100%">${subjectOptions}</select></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="cancelTeacher" class="btn btn-ghost">Cancel</button>
      <button id="updateTeacher" class="btn btn-primary">Save</button>
    </div>
  `);

  modalBody.querySelector('#cancelTeacher').onclick = closeModal;
  modalBody.querySelector('#updateTeacher').onclick = async () => {
    const name = (modalBody.querySelector('#teacherName').value || '').trim();
    const phone = (modalBody.querySelector('#teacherPhone').value || '').trim();
    const parentPhone = (modalBody.querySelector('#teacherParentPhone').value || '').trim();
    const salaryVal = modalBody.querySelector('#teacherSalary').value;
    const salary = salaryVal ? Number(salaryVal) : null;
    const classesSelected = Array.from(modalBody.querySelectorAll('#teacherClasses option:checked')).map(o => o.value);
    const subjectsSelected = Array.from(modalBody.querySelectorAll('#teacherSubjects option:checked')).map(o => o.value);

    if(!name) return toast('Teacher name is required');
    try {
      // update by doc id (t.id)
      await updateDoc(doc(db,'teachers', t.id), {
        fullName: name, phone: phone || '', parentPhone: parentPhone || '', salary: salary,
        classes: classesSelected, subjects: subjectsSelected, updatedAt: Timestamp.now(), updatedBy: currentUser ? currentUser.uid : null
      });
      toast('Teacher updated');
      closeModal();
      await loadTeachers(); renderTeachers();
    } catch(err){
      console.error('update teacher failed', err);
      toast('Failed to update teacher');
    }
  };
}

/* Delete teacher (keeps same behavior) */
async function deleteTeacher(e){
  const id = e && e.target ? e.target.dataset.id : e;
  if(!id) return;
  if(!confirm('Delete teacher?')) return;
  try {
    await deleteDoc(doc(db,'teachers', id));
    toast('Teacher deleted');
    await loadTeachers(); renderTeachers();
  } catch(err){
    console.error('delete teacher failed', err);
    toast('Failed to delete teacher');
  }
}

/* -------------------------
  Wire buttons (defensive)
--------------------------*/
if(typeof openAddTeacher !== 'undefined' && openAddTeacher){
  openAddTeacher.onclick = openAddTeacherModal;
}

/** ---------- CLASSES (table view + View modal listing students) ---------- */
function renderClasses(){
  if(!classesList) return;
  const q = (classSearch && classSearch.value||'').trim().toLowerCase();
  let list = (classesCache || []).slice();
  list = list.filter(c => {
    if(!q) return true;
    return (c.name||'').toLowerCase().includes(q) || (c.id||'').toLowerCase().includes(q);
  });

  const total = list.length;

  if(isMobileViewport()){
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>Total classes: ${total}</strong>
      <div class="muted">Mobile: tap View</div>
    </div><div id="classesMobileList">`;
    list.forEach((c, idx) => {
      const name = escape(c.name || '');
      html += `<div class="mobile-row" style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid #f1f5f9">
        <div style="display:flex;gap:12px;align-items:center">
          <div style="min-width:28px;text-align:center;font-weight:700">${idx+1}</div>
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</div>
        </div>
        <div><button class="btn btn-ghost btn-sm mobile-class-view" data-id="${escape(c.id||c.name||'')}">View</button></div>
      </div>`;
    });
    html += `</div>`;
    classesList.innerHTML = html;

    classesList.querySelectorAll('.mobile-class-view').forEach(b => {
      b.onclick = (ev) => openViewClassModal({ target: { dataset: { id: ev.currentTarget.dataset.id } } });
    });
    return;
  }

  // desktop original table
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>Total classes: ${total}</strong>
      <div class="muted">Columns: No, ID, Name, Total students</div>
    </div>`;

  html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="text-align:left;border-bottom:1px solid #e6eef8">
        <th style="padding:8px;width:48px">No</th>
        <th style="padding:8px;width:140px">ID</th>
        <th style="padding:8px">Class</th>
        <th style="padding:8px;width:120px">Total students</th>
        <th style="padding:8px;width:220px">Actions</th>
      </tr>
    </thead><tbody>`;

  list.forEach((c, idx) => {
    const id = escape(c.id || '');
    const name = escape(c.name || '');
    const totalStudents = countStudentsInClass(c.name || '');
    html += `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px;vertical-align:middle">${idx+1}</td>
      <td style="padding:8px;vertical-align:middle">${id}</td>
      <td style="padding:8px;vertical-align:middle">${name}</td>
      <td style="padding:8px;vertical-align:middle">${totalStudents}</td>
      <td style="padding:8px;vertical-align:middle">
        <button class="btn btn-ghost btn-sm view-class" data-id="${id}">View</button>
        <button class="btn btn-ghost btn-sm edit-class" data-id="${id}">Edit</button>
        <button class="btn btn-danger btn-sm del-class" data-id="${id}">Delete</button>
      </td>
    </tr>`;
  });

  html += `</tbody></table></div>`;
  classesList.innerHTML = html;

  classesList.querySelectorAll('.view-class').forEach(b=> b.onclick = openViewClassModal);
  classesList.querySelectorAll('.edit-class').forEach(b=> b.onclick = openEditClassModal);
  classesList.querySelectorAll('.del-class').forEach(b=> b.onclick = deleteClass);
}

async function openViewClassModal(e){
  const id = (e && e.target) ? e.target.dataset.id : (e && e.dataset ? e.dataset.id : e);
  if(!id) return;
  const c = classesCache.find(x => x.id === id || x.name === id);
  if(!c) return toast('Class not found');

  const assigned = (studentsCache || []).filter(s => (s.classId || '') === (c.name || c.id || ''));
  let studentsHtml = '<div class="muted">No students</div>';
  if(assigned.length){
    studentsHtml = `<table style="width:100%;border-collapse:collapse">
      <thead><tr style="border-bottom:1px solid #e6eef8"><th style="padding:6px">No</th><th style="padding:6px">ID</th><th style="padding:6px">Name</th></tr></thead><tbody>`;
    assigned.forEach((s, i) => {
      studentsHtml += `<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:6px">${i+1}</td><td style="padding:6px">${escape(s.studentId||s.id||'')}</td><td style="padding:6px">${escape(s.fullName||'')}</td></tr>`;
    });
    studentsHtml += '</tbody></table>';
  }

  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><strong>ID</strong><div class="muted">${escape(c.id||'')}</div></div>
      <div><strong>Class name</strong><div class="muted">${escape(c.name||'')}</div></div>
      <div style="grid-column:1 / -1"><strong>Subjects</strong><div class="muted">${escape((c.subjects||[]).join(', ') || 'No subjects')}</div></div>
      <div style="grid-column:1 / -1"><strong>Assigned students (${assigned.length})</strong>${studentsHtml}</div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost" id="viewClassClose">Close</button>
      <button class="btn btn-ghost" id="viewClassEdit">Edit</button>
      <button class="btn btn-danger" id="viewClassDel">Delete</button>
    </div>
  `;
  showModal(`Class — ${escape(c.name||'')}`, html);

  modalBody.querySelector('#viewClassClose').onclick = closeModal;
  modalBody.querySelector('#viewClassEdit').onclick = () => {
    closeModal();
    openEditClassModal({ target:{ dataset:{ id: c.id } } });
  };
  modalBody.querySelector('#viewClassDel').onclick = async () => {
    if(!confirm('Delete class?')) return;
    await deleteClass({ target: { dataset: { id: c.id } } });
    closeModal();
  };
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
  if(!c) return toast && toast('Class not found');
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
  const id = e.target.dataset.id;
  if(!confirm('Delete class?')) return;
  await deleteDoc(doc(db,'classes',id));
  await loadClasses(); renderClasses(); populateClassFilters(); renderStudents();
}
/** ---------- SUBJECTS (table view + View modal) ---------- */
function renderSubjects(){
  if(!subjectsList) return;
  const q = (subjectSearch && subjectSearch.value||'').trim().toLowerCase();
  let list = (subjectsCache || []).slice();
  list = list.filter(s => {
    if(!q) return true;
    return (s.name||'').toLowerCase().includes(q) || (s.id||'').toLowerCase().includes(q);
  });

  const total = list.length;

  if(isMobileViewport()){
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>Total subjects: ${total}</strong>
      <div class="muted">Mobile: tap View</div>
    </div><div id="subjectsMobileList">`;
    list.forEach((s, idx) => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid #f1f5f9">
        <div style="display:flex;gap:12px;align-items:center">
          <div style="min-width:28px;text-align:center;font-weight:700">${idx+1}</div>
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escape(s.name||'')}</div>
        </div>
        <div><button class="btn btn-ghost btn-sm mobile-sub-view" data-id="${escape(s.id||s.name||'')}">View</button></div>
      </div>`;
    });
    html += `</div>`;
    subjectsList.innerHTML = html;

    subjectsList.querySelectorAll('.mobile-sub-view').forEach(b => {
      b.onclick = (ev) => openViewSubjectModal({ target:{ dataset:{ id: ev.currentTarget.dataset.id } }});
    });
    return;
  }

  // desktop table (unchanged)
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
        <button class="btn btn-ghost btn-sm view-sub" data-id="${id}">View</button>
        <button class="btn btn-ghost btn-sm edit-sub" data-id="${id}">Edit</button>
        <button class="btn btn-danger btn-sm del-sub" data-id="${id}">Delete</button>
      </td>
    </tr>`;
  });

  html += `</tbody></table></div>`;
  subjectsList.innerHTML = html;

  subjectsList.querySelectorAll('.view-sub').forEach(b=> b.onclick = openViewSubjectModal);
  subjectsList.querySelectorAll('.edit-sub').forEach(b=> b.onclick = openEditSubjectModal);
  subjectsList.querySelectorAll('.del-sub').forEach(b=> b.onclick = deleteSubject);
}

function openViewSubjectModal(e){
  const id = (e && e.target) ? e.target.dataset.id : (e && e.dataset ? e.dataset.id : e);
  if(!id) return;
  const s = subjectsCache.find(x => x.id === id || x.name === id);
  if(!s) return toast('Subject not found');

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
  modalBody.querySelector('#viewSubDel').onclick = async () => {
    if(!confirm('Delete subject?')) return;
    await deleteSubject({ target:{ dataset:{ id: s.id } }});
    closeModal();
  };
}

/* ---------- Subjects add/edit (default SUB0001) ---------- */
openAddSubject && (openAddSubject.onclick = () => {
  showModal('Add Subject', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><label>Subject ID (optional)</label><input id="modalSubId" placeholder="SUB0001" /></div>
      <div>&nbsp;</div>
      <div style="grid-column:1 / -1"><label>Subject name</label><input id="modalSubName" placeholder="Mathematics" /></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="cancelSub" class="btn btn-ghost">Cancel</button>
      <button id="saveSub" class="btn btn-primary">Save</button>
    </div>
  `);
  modalBody.querySelector('#cancelSub').onclick = closeModal;
  modalBody.querySelector('#saveSub').onclick = async () => {
    let id = modalBody.querySelector('#modalSubId').value.trim();
    const name = modalBody.querySelector('#modalSubName').value.trim();
    if(!name) return alert('Name required');
    if(!id) id = await generateDefaultId('subjects','SUB',4); // SUB0001 style
    await setDoc(doc(db,'subjects', id), { id, name });
    closeModal(); await loadSubjects(); renderSubjects(); populateClassFilters();
  };
});

function openEditSubjectModal(e){
  const id = e && e.target ? e.target.dataset.id : e;
  const s = subjectsCache.find(x=>x.id===id);
  if(!s) return toast && toast('Subject not found');
  showModal('Edit Subject', `
    <div><label>Subject name</label><input id="modalSubName" value="${escape(s.name)}" /></div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="cancelSub" class="btn btn-ghost">Cancel</button>
      <button id="saveSub" class="btn btn-primary">Save</button>
    </div>
  `);
  modalBody.querySelector('#cancelSub').onclick = closeModal;
  modalBody.querySelector('#saveSub').onclick = async () => {
    const name = modalBody.querySelector('#modalSubName').value.trim();
    if(!name) return alert('Name required');
    await updateDoc(doc(db,'subjects',id), { name });
    closeModal(); await loadSubjects(); renderSubjects(); populateClassFilters();
  };
}


async function deleteSubject(e){
  const id = e.target.dataset.id;
  if(!confirm('Delete subject?')) return;
  await deleteDoc(doc(db,'subjects',id));
  await loadSubjects(); renderSubjects(); populateClassFilters();
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


/** view student modal (keeps existing fields; adds Edit/Delete actions) */

async function renderStudents(){
  if(!studentsList) return;
  const q = (studentsSearch && studentsSearch.value||'').trim().toLowerCase();
  const classFilterVal = (studentsClassFilter && studentsClassFilter.value) || '';
  const examFilter = (studentsExamForTotals && studentsExamForTotals.value) || '';

  if(examFilter && typeof loadExamTotalsForExam === 'function'){
    try { await loadExamTotalsForExam(examFilter); } catch(e){ console.warn('loadExamTotalsForExam failed', e); }
  }

  let filtered = (studentsCache || []).filter(s=>{
    if(classFilterVal && s.classId !== classFilterVal) return false;
    if(!q) return true;
    return (s.fullName||'').toLowerCase().includes(q) || (s.phone||'').toLowerCase().includes(q) || (s.studentId||'').toLowerCase().includes(q);
  });

  const total = filtered.length;

  // mobile: compact list
  if(isMobileViewport()){
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong>Total students: ${total}</strong>
        <div class="muted">Mobile view: tap "More" to open student</div>
      </div><div id="studentsMobileList">`;
    filtered.forEach((s, idx) => {
      const sid = escape(s.studentId || s.id || '');
      const name = escape(s.fullName || '');
      html += `<div class="mobile-row" style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid #f1f5f9">
        <div style="display:flex;gap:10px;align-items:center">
          <div style="min-width:28px;text-align:center;font-weight:700">${idx+1}</div>
          <div style="min-width:90px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sid}</div>
          <div style="min-width:120px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</div>
        </div>
        <div><button class="btn btn-ghost btn-sm mobile-more" data-id="${escape(s.studentId||s.id||'')}">More</button></div>
      </div>`;
    });
    html += `</div>`;
    studentsList.innerHTML = html;

    // wire "More" buttons to open view modal
    studentsList.querySelectorAll('.mobile-more').forEach(b => {
      b.onclick = (ev) => openViewStudentModal({ target: { dataset: { id: ev.currentTarget.dataset.id } } });
    });
    return;
  }

  // desktop: keep original table layout
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>Total students: ${total}</strong>
      <div class="muted">Columns: No, ID, Name, Parent, Class, Total</div>
    </div>`;

  html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="text-align:left;border-bottom:1px solid #e6eef8">
        <th style="padding:8px;width:48px">No</th>
        <th style="padding:8px;width:140px">ID</th>
        <th style="padding:8px">Name</th>
        <th style="padding:8px;width:160px">Parent</th>
        <th style="padding:8px;width:120px">Class</th>
        <th style="padding:8px;width:100px">Total</th>
        <th style="padding:8px;width:220px">Actions</th>
      </tr>
    </thead><tbody>`;

  filtered.forEach((s, idx) => {
    const sid = escape(s.studentId || s.id || '');
    const parent = escape(s.parentPhone || s.motherName || '—');
    const cls = escape(s.classId || '—');
    let totalDisplay = '—';
    if(examFilter && examTotalsCache[examFilter] && examTotalsCache[examFilter][s.studentId]) {
      totalDisplay = escape(String(examTotalsCache[examFilter][s.studentId].total || '—'));
    }
    html += `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px;vertical-align:middle">${idx+1}</td>
      <td style="padding:8px;vertical-align:middle">${sid}</td>
      <td style="padding:8px;vertical-align:middle">${escape(s.fullName||'')}</td>
      <td style="padding:8px;vertical-align:middle">${parent}</td>
      <td style="padding:8px;vertical-align:middle">${cls}</td>
      <td style="padding:8px;vertical-align:middle">${totalDisplay}</td>
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

async function openViewStudentModal(e){
  const id = (e && e.target) ? e.target.dataset.id : (e && e.dataset ? e.dataset.id : e);
  if(!id) return;
  let s = studentsCache.find(x => x.studentId === id || x.id === id);
  if(!s && typeof getDoc === 'function'){
    try {
      const snap = await getDoc(doc(db,'students', id));
      if(snap.exists()) s = { id: snap.id, ...snap.data() };
    } catch(err){ console.error('load student for view failed', err); }
  }
  if(!s) return toast && toast('Student not found');

  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div><strong>ID</strong><div class="muted">${escape(s.studentId||s.id||'')}</div></div>
      <div><strong>Name</strong><div class="muted">${escape(s.fullName||'')}</div></div>
      <div><strong>Mother</strong><div class="muted">${escape(s.motherName||'')}</div></div>
      <div><strong>Phone</strong><div class="muted">${escape(s.phone||'')}</div></div>
      <div><strong>Parent phone</strong><div class="muted">${escape(s.parentPhone||'')}</div></div>
      <div><strong>Age</strong><div class="muted">${escape(String(s.age||'—'))}</div></div>
      <div><strong>Gender</strong><div class="muted">${escape(s.gender||'—')}</div></div>
      <div><strong>Fee</strong><div class="muted">${typeof s.fee !== 'undefined' ? escape(String(s.fee)) : '—'}</div></div>
      <div style="grid-column:1 / -1"><strong>Class</strong><div class="muted">${escape(s.classId||'—')}</div></div>
      <div style="grid-column:1 / -1"><strong>Status</strong><div class="muted">${escape(s.status||'active')}</div></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost" id="viewStuEdit">Edit</button>
      <button class="btn btn-danger" id="viewStuDel">${s.status==='deleted' ? 'Unblock' : 'Delete'}</button>
      <button class="btn btn-primary" id="viewStuClose">Close</button>
    </div>
  `;
  showModal(`${escape(s.fullName||'Student')}`, html);

  document.getElementById('viewStuClose').onclick = closeModal;
  document.getElementById('viewStuEdit').onclick = () => {
    closeModal();
    openEditStudentModal({ target:{ dataset:{ id: s.studentId || s.id } } });
  };
  document.getElementById('viewStuDel').onclick = async () => {
    if(s.status === 'deleted'){
      await updateDoc(doc(db,'students', s.studentId), { status:'active' });
      await setDoc(doc(db,'studentsLatest', s.studentId), { blocked:false }, { merge:true });
      await loadStudents(); renderStudents(); toast(`${s.fullName} unblocked`);
      closeModal();
      return;
    }
    if(!confirm('Delete student? This will mark student as deleted and block public access.')) return;
    await updateDoc(doc(db,'students', s.studentId), { status:'deleted' });
    await setDoc(doc(db,'studentsLatest', s.studentId), { blocked:true, blockMessage:'You are fired' }, { merge:true });
    await loadStudents(); renderStudents(); toast(`${s.fullName} deleted and blocked`);
    closeModal();
  };
}


/* ---------- Students create/edit (styling improved, logic preserved) ---------- */
openAddStudent && (openAddStudent.onclick = () => {
  const options = classesCache.map(c=>`<option value="${escape(c.name)}">${escape(c.name)}</option>`).join('');
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
  modalBody.querySelector('#saveStu').onclick = async () => {
    let id = modalBody.querySelector('#stuId').value.trim();
    const name = modalBody.querySelector('#stuName').value.trim();
    const mother = modalBody.querySelector('#stuMother').value.trim();
    const phone = modalBody.querySelector('#stuPhone').value.trim();
    const parentPhone = modalBody.querySelector('#stuParentPhone').value.trim();
    const age = Number(modalBody.querySelector('#stuAge').value) || null;
    const gender = (modalBody.querySelector('#stuGender').value || null);
    const fee = modalBody.querySelector('#stuFee').value ? Number(modalBody.querySelector('#stuFee').value) : null;
    const classId = modalBody.querySelector('#stuClass').value;
    if(!name) return alert('Name required');
    if(gender && !['Male','Female'].includes(gender)) return alert('Gender must be Male or Female');
    if(!id) id = await generateDefaultId('students','STD',9);
    await setDoc(doc(db,'students',id), { studentId:id, fullName:name, motherName: mother || '', phone, parentPhone: parentPhone || '', age, gender: gender || null, fee: fee, classId, status:'active' });
    closeModal(); await loadStudents(); renderStudents(); toast(`${name} created`);
  };
});

/* openEditStudentModal expects event-like parameter with dataset.id */
function openEditStudentModal(e){
  const id = e && e.target ? e.target.dataset.id : e;
  const s = studentsCache.find(x=>x.studentId===id || x.id===id);
  if(!s) return toast && toast('Student not found');
  const options = classesCache.map(c=>`<option value="${escape(c.name)}" ${c.name===s.classId?'selected':''}>${escape(c.name)}</option>`).join('');
  showModal('Edit Student', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><label>Student ID</label><input id="stuId" value="${escape(s.studentId)}" disabled /></div>
      <div><label>Class</label><select id="stuClass"><option value="">Select class</option>${options}</select></div>
      <div style="grid-column:1 / -1"><label>Full name</label><input id="stuName" value="${escape(s.fullName)}" /></div>
      <div><label>Mother's name</label><input id="stuMother" value="${escape(s.motherName||'')}" /></div>
      <div><label>Phone</label><input id="stuPhone" value="${escape(s.phone||'')}" /></div>
      <div><label>Parent phone</label><input id="stuParentPhone" value="${escape(s.parentPhone||'')}" /></div>
      <div><label>Age</label><input id="stuAge" type="number" value="${escape(String(s.age||''))}" /></div>
      <div><label>Gender</label><select id="stuGender"><option value="">Select</option><option value="Male" ${s.gender==='Male'?'selected':''}>Male</option><option value="Female" ${s.gender==='Female'?'selected':''}>Female</option></select></div>
      <div style="grid-column:1 / -1"><label>Fee</label><input id="stuFee" type="number" value="${escape(String(s.fee||''))}" /></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="cancelStu" class="btn btn-ghost">Cancel</button>
      <button id="addResult" class="btn btn-ghost">Add/Edit Result</button>
      <button id="saveStu" class="btn btn-primary">Save</button>
    </div>
  `);

  modalBody.querySelector('#cancelStu').onclick = closeModal;
  modalBody.querySelector('#addResult').onclick = async () => { closeModal(); await openStudentResultModalFor(s); };

  modalBody.querySelector('#saveStu').onclick = async () => {
    const name = modalBody.querySelector('#stuName').value.trim();
    const mother = modalBody.querySelector('#stuMother').value.trim();
    const phone = modalBody.querySelector('#stuPhone').value.trim();
    const parentPhone = modalBody.querySelector('#stuParentPhone').value.trim();
    const age = Number(modalBody.querySelector('#stuAge').value) || null;
    const gender = (modalBody.querySelector('#stuGender').value || null);
    const fee = modalBody.querySelector('#stuFee').value ? Number(modalBody.querySelector('#stuFee').value) : null;
    const classId = modalBody.querySelector('#stuClass').value;
    if(!name) return alert('Name required');
    if(gender && !['Male','Female'].includes(gender)) return alert('Gender must be Male or Female');
    await updateDoc(doc(db,'students',s.studentId), { fullName:name, motherName: mother || '', phone, parentPhone: parentPhone || '', age, gender: gender || null, fee: fee, classId });
    closeModal(); await loadStudents(); renderStudents(); toast(`${name} updated`);
  };
}


async function deleteOrUnblockStudent(e){
  const id = e.target.dataset.id;
  const s = studentsCache.find(x=>x.studentId===id || x.id===id);
  if(!s) return;
  if(s.status === 'deleted'){
    await updateDoc(doc(db,'students',s.studentId), { status:'active' });
    await setDoc(doc(db,'studentsLatest', s.studentId), { blocked:false }, { merge:true });
    await loadStudents(); renderStudents(); toast(`${s.fullName} unblocked`);
    return;
  }
  if(!confirm('Delete student? This will mark student as deleted and block public access.')) return;
  await updateDoc(doc(db,'students',s.studentId), { status:'deleted' });
  await setDoc(doc(db,'studentsLatest', s.studentId), { blocked:true, blockMessage:'You are fired' }, { merge:true });
  await loadStudents(); renderStudents(); toast(`${s.fullName} deleted and blocked`);
}






/* -------------------------------------
   Exam open / add results / publish
   -------------------------------------*/

   function renderExams(){
    if(!examsList) return;
  
    // ensure sort control exists (same as before)
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
  
    let list = examsCache.slice();
    // filter
    list = list.filter(e => {
      if(classFilterVal && (!e.classes || !e.classes.includes(classFilterVal))) return false;
      if(!q) return true;
      return (e.name||'').toLowerCase().includes(q);
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
  
    // mobile vs desktop switch
    const mobile = (typeof isMobileViewport === 'function') ? isMobileViewport() : (window.matchMedia && window.matchMedia('(max-width:768px)').matches);
  
    if(mobile){
      // compact mobile list but show FULL exam name (wrap, no ellipsis)
      let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong>Total exams: ${list.length}</strong>
        <div class="muted">Tap More for exam details</div>
      </div><div id="examsMobileList">`;
  
      list.forEach((e, idx) => {
        const statusLabel = (e.status === 'published') ? 'Published' : (e.status === 'deactivated' ? 'Deactivated' : 'Unpublished');
        html += `<div style="padding:12px;border-bottom:1px solid #f1f5f9;display:flex;flex-direction:column;gap:6px">
          <div style="font-weight:800;display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
            <div style="display:flex;gap:8px;align-items:flex-start;flex:1;min-width:0">
              <div style="min-width:26px;text-align:center;font-weight:700">${idx+1}</div>
              <!-- FULL name allowed: wrap and break-word -->
              <div style="flex:1;white-space:normal;word-break:break-word;">${escape(e.name||'')}</div>
            </div>
            <div style="text-align:right;flex-shrink:0"><small class="muted">${escape(statusLabel)}</small></div>
          </div>
          <div style="display:flex;justify-content:flex-end">
            <button class="btn btn-ghost btn-sm mobile-exam-more" data-id="${escape(e.id)}">More</button>
          </div>
        </div>`;
      });
  
      html += `</div>`;
      examsList.innerHTML = html;
  
      // wire mobile More buttons to open modal
      examsList.querySelectorAll('.mobile-exam-more').forEach(b => {
        b.onclick = (ev) => openExamModal(ev.currentTarget.dataset.id);
      });
  
      return;
    }
  
    // Desktop: original rows (keeps actions)
    for(const e of list){
      const div = document.createElement('div'); div.className='row';
      const status = e.status || 'draft';
      const classesText = e.classes && e.classes.length ? e.classes.join(', ') : 'All classes';
      const dateText = e.date ? (new Date(e.date.seconds ? e.date.seconds*1000 : e.date)).toLocaleDateString() : '';
      div.innerHTML = `<div class="meta">
          <strong>${escape(e.name)} ${status==='published'?'<span style="color:#059669">(published)</span>':status==='deactivated'?'<span style="color:#dc2626">(deactivated)</span>':'(unpublished)'}</strong>
          <small>${escape(classesText)} • ${escape(dateText)}</small>
        </div>
        <div>
          <button class="btn btn-ghost btn-sm open-exam" data-id="${escape(e.id)}">Open</button>
          <button class="btn btn-ghost btn-sm edit-exam" data-id="${escape(e.id)}">Edit</button>
          <button class="btn btn-danger btn-sm del-exam" data-id="${escape(e.id)}">Delete</button>
          <button class="btn btn-primary btn-sm pub-exam" data-id="${escape(e.id)}">${e.status==='published'?'Unpublish':'Publish'}</button>
        </div>`;
      examsList.appendChild(div);
    }
  
    document.querySelectorAll('.open-exam').forEach(b=>b.onclick = openExam);
    document.querySelectorAll('.edit-exam').forEach(b=>b.onclick = openEditExamModal);
    document.querySelectorAll('.del-exam').forEach(b=>b.onclick = deleteExam);
    document.querySelectorAll('.pub-exam').forEach(b=>b.onclick = togglePublishExam);
  }

/* ---------- openExamModal (show exam details + footer actions) ---------- */
async function openExamModal(examId){
  if(!examId) return;
  // try cached exam, fallback to DB fetch
  let ex = examsCache.find(x => x.id === examId);
  if(!ex){
    try {
      const snap = await getDoc(doc(db,'exams', examId));
      if(!snap.exists()) return toast && toast('Exam not found');
      ex = { id: snap.id, ...snap.data() };
    } catch(err){ console.error('openExamModal load failed', err); return toast && toast('Failed to load exam'); }
  }

  const statusLabel = ex.status === 'published' ? 'Published' : (ex.status === 'deactivated' ? 'Deactivated' : 'Unpublished');
  const classesText = (ex.classes && ex.classes.length) ? ex.classes.join(', ') : 'All classes';
  const dateText = ex.date ? (new Date(ex.date.seconds ? ex.date.seconds*1000 : ex.date)).toLocaleDateString() : '—';

  const html = `
    <div style="display:grid;grid-template-columns:1fr;gap:8px">
      <div><strong>Exam</strong><div class="muted">${escape(ex.name||'')}</div></div>
      <div><strong>Status</strong><div class="muted">${escape(statusLabel)}</div></div>
      <div><strong>Classes assigned</strong><div class="muted">${escape(classesText)}</div></div>
      <div><strong>Date</strong><div class="muted">${escape(dateText)}</div></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost" id="examModalOpen">Open</button>
      <button class="btn btn-ghost" id="examModalEdit">Edit</button>
      <button class="btn btn-danger" id="examModalDelete">Delete</button>
      <button class="btn btn-primary" id="examModalToggle">${ex.status==='published' ? 'Unpublish' : 'Publish'}</button>
      <button class="btn" id="examModalClose">Close</button>
    </div>
  `;

  showModal(`${escape(ex.name||'Exam')}`, html);

  // wire buttons
  const openBtn = document.getElementById('examModalOpen');
  const editBtn = document.getElementById('examModalEdit');
  const delBtn = document.getElementById('examModalDelete');
  const toggleBtn = document.getElementById('examModalToggle');
  const closeBtn = document.getElementById('examModalClose');

  if(openBtn) openBtn.onclick = () => {
    closeModal();
    // reuse original openExam navigator
    openExam({ target: { dataset: { id: ex.id } } });
  };
  if(editBtn) editBtn.onclick = () => {
    closeModal();
    openEditExamModal({ target: { dataset: { id: ex.id } } });
  };
  if(delBtn) delBtn.onclick = async () => {
    if(!confirm('Delete exam?')) return;
    await deleteExam({ target: { dataset: { id: ex.id } } });
    closeModal();
  };
  if(toggleBtn) toggleBtn.onclick = async () => {
    await togglePublishExam({ target: { dataset: { id: ex.id } } });
    // refresh UI in modal and list
    await loadExams();
    renderExams();
    // update modal - replace status text and toggle label
    const newEx = examsCache.find(x=>x.id===ex.id) || ex;
    const newStatus = newEx.status === 'published' ? 'Published' : (newEx.status === 'deactivated' ? 'Deactivated' : 'Unpublished');
    const newLabel = newEx.status === 'published' ? 'Unpublish' : 'Publish';
    // update DOM elements safely
    try {
      // replace the modal by reopening with fresh data
      closeModal();
      openExamModal(ex.id);
    } catch(e){ console.error(e); }
  };
  if(closeBtn) closeBtn.onclick = closeModal;
}

  
   function openExam(e){
  const id = e.target.dataset.id;
  if(!id) return alert('No exam id');
  window.location.href = `exam.html?examId=${encodeURIComponent(id)}`;
}

/* create / edit / delete / publish exam (same UI) */
openAddExam.onclick = () => {
  // build exam list for linking (exclude current - not applicable here)
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

  // Save handler
  document.getElementById('saveExam').onclick = async () => {
    const name = document.getElementById('examName').value.trim();
    const date = document.getElementById('examDate').value || null;
    const linkedFrom = modalBody.querySelector('#linkFromExam').value || null;
    if(!name) return alert('Name required');

    // chosen subjects only from checked (and enabled) inputs
    const chosenSubjects = Array.from(modalBody.querySelectorAll('#examSubjects input.exam-sub:checked')).map(i=>{
      const nm = i.dataset.name;
      const maxInput = modalBody.querySelector(`#examSubjects input.exam-sub-max[data-name="${nm}"]`);
      const maxVal = maxInput ? Number(maxInput.value || i.dataset.defaultMax) : Number(i.dataset.defaultMax);
      return { name: nm, max: Math.max(0, maxVal) };
    });

    // validation: ensure each chosen subject max + linked.max <= 100 (if linked)
    if(linkedFrom){
      const linkedSnap = await getDoc(doc(db,'exams', linkedFrom));
      if(linkedSnap.exists()){
        const linked = linkedSnap.data();
        const linkedMap = new Map((linked.subjects||[]).map(s=>[s.name, s.max||0]));
        for(const cs of chosenSubjects){
          const linkedMax = linkedMap.get(cs.name) || 0;
          if((linkedMax + cs.max) > 100){
            return alert(`Subject ${cs.name} combined max (${linkedMax + cs.max}) exceeds 100. Adjust values.`);
          }
        }
      }
    }

    const chosenClasses = Array.from(modalBody.querySelectorAll('#examClasses input.exam-cls:checked')).map(i=> i.dataset.name );
    const enableAssignment = Boolean(document.getElementById('enableAssignment').checked);
    const enableQuiz = Boolean(document.getElementById('enableQuiz').checked);
    const enableMonthly = Boolean(document.getElementById('enableMonthly').checked);
    const enableExam = Boolean(document.getElementById('enableExam').checked);

          // force exam enabled & include cw1/cw2
const enableCW1 = Boolean(document.getElementById('enableCW1').checked);
const enableCW2 = Boolean(document.getElementById('enableCW2').checked);
// always keep exam true (locked)
const payloadComponents = { assignment: enableAssignment, quiz: enableQuiz, monthly: enableMonthly, cw1: enableCW1, cw2: enableCW2, exam: true };
    const payload = {
      name,
      date: date ? new Date(date) : null,
      status: 'draft',
      classes: chosenClasses,
      subjects: chosenSubjects,
      // components: { assignment: enableAssignment, quiz: enableQuiz, monthly: enableMonthly, exam: enableExam },


components: payloadComponents,

      createdAt: Timestamp.now(),
      createdBy: currentUser.uid
    };
    if(linkedFrom) payload.linkedExamId = linkedFrom;

    await addDoc(collection(db,'exams'), payload);
    closeModal(); await loadExams(); renderExams(); populateStudentsExamDropdown(); toast('Exam created');
  };

  document.getElementById('cancelExam').onclick = closeModal;
};


/* ---------- Replace openEditExamModal ---------- */
function openEditExamModal(e){
  const id = e.target ? e.target.dataset.id : e; // support calling with id directly
  const ex = examsCache.find(x=>x.id===id);
  if(!ex) return;

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

  // Save handler
  document.getElementById('saveExam').onclick = async ()=> {
    const name = document.getElementById('examName').value.trim();
    const date = document.getElementById('examDate').value || null;
    const linkedFrom = modalBody.querySelector('#linkFromExam').value || null;
    if(!name) return alert('Name required');

    const chosenSubjects = Array.from(modalBody.querySelectorAll('#examSubjects input.exam-sub:checked')).map(i=>{
      const nm = i.dataset.name;
      const maxInput = modalBody.querySelector(`#examSubjects input.exam-sub-max[data-name="${nm}"]`);
      const maxVal = maxInput ? Number(maxInput.value || i.dataset.defaultMax) : Number(i.dataset.defaultMax);
      return { name: nm, max: Math.max(0, maxVal) };
    });

    // validation vs linked
    if(linkedFrom){
      const linkedSnap = await getDoc(doc(db,'exams', linkedFrom));
      if(linkedSnap.exists()){
        const linked = linkedSnap.data();
        const linkedMap = new Map((linked.subjects||[]).map(s=>[s.name, s.max||0]));
        for(const cs of chosenSubjects){
          const linkedMax = linkedMap.get(cs.name) || 0;
          if((linkedMax + cs.max) > 100){
            return alert(`Subject ${cs.name} combined max (${linkedMax + cs.max}) exceeds 100. Adjust values.`);
          }
        }
      }
    }

    const chosenClasses = Array.from(modalBody.querySelectorAll('#examClasses input.exam-cls:checked')).map(i=> i.dataset.name );
    const enableAssignment = Boolean(document.getElementById('enableAssignment').checked);
    const enableQuiz = Boolean(document.getElementById('enableQuiz').checked);
    const enableMonthly = Boolean(document.getElementById('enableMonthly').checked);
    const enableCW1 = Boolean(document.getElementById('enableCW1').checked);
    const enableCW2 = Boolean(document.getElementById('enableCW2').checked);
    // exam locked -> always true
    const enableExam = true;
    

    await updateDoc(doc(db,'exams',ex.id), {
      name,
      date: date ? new Date(date) : null,
      subjects: chosenSubjects,
      classes: chosenClasses,
      components: { assignment: enableAssignment, quiz: enableQuiz, monthly: enableMonthly, cw1: enableCW1, cw2: enableCW2, exam: enableExam },
      linkedExamId: linkedFrom || null
    });
    closeModal(); await loadExams(); renderExams(); populateStudentsExamDropdown(); toast('Exam updated');
  };

  document.getElementById('cancelExam').onclick = closeModal;
}



async function deleteExam(e){
  const id = e.target.dataset.id;
  if(!confirm('Delete exam?')) return;
  await deleteDoc(doc(db,'exams',id));
  await loadExams(); renderExams(); populateStudentsExamDropdown(); toast('Exam deleted');
}

/* Toggle publish/unpublish - uses helper fallback to update studentsLatest */
async function togglePublishExam(e){
  const id = e.target.dataset.id;
  const exSnap = await getDoc(doc(db,'exams',id));
  if(!exSnap.exists()) return;
  const ex = exSnap.data();
  if(ex.status === 'published'){
    await updateDoc(doc(db,'exams',id), { status:'draft' });
    await fallbackStudentsLatestForUnpublishedExam(id);
    await loadExams(); renderExams(); toast('Exam unpublished');
    return;
  }
  if(ex.status === 'deactivated') return alert('Deactivated exam cannot be published');
  await publishExam(id);
  await loadExams(); renderExams(); toast('Exam published');
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
    toast(`${student.fullName} successfully recorded exam results`);
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

function capitalize(str){
  if(!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
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

/* ------------------------
  Render Payments (UI + list + actions)
-------------------------*/

async function renderPayments(){
  // create payments page if missing
  let page = document.getElementById('pagePayments');
  if(!page){
    page = document.createElement('section');
    page.id = 'pagePayments';
    page.className = 'page';
    const main = document.querySelector('main');
    main && main.appendChild(page);
  }

  page.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;gap:8px">
      <div style="display:flex;gap:8px;align-items:center">
        <button id="paymentsTabStudents" class="tab active">Students</button>
        <button id="paymentsTabTeachers" class="tab">Teachers</button>
        <button id="paymentsTabStaff" class="tab">Staff</button>
        <button id="paymentsTabExpenses" class="tab">Expenses</button>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
        <input id="paymentsSearch" placeholder="Search name / ID / phone" />
        <select id="paymentsClassFilter"><option value="">All classes</option></select>
        <select id="paymentsStatusFilter"><option value="all">All</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="free">Free</option></select>
        <button id="paymentsExport" class="btn btn-ghost">Export</button>
      </div>
    </div>
    <div id="paymentsList"></div>
  `;

  // populate class filter
  const sel = document.getElementById('paymentsClassFilter');
  if(sel){
    sel.innerHTML = '<option value="">All classes</option>' + (classesCache || []).map(c => `<option value="${escape(c.name)}">${escape(c.name)}</option>`).join('');
  }

  // wire tabs and search
  document.getElementById('paymentsTabStudents').onclick = ()=>{ document.querySelectorAll('#pagePayments .tab').forEach(t=>t.classList.remove('active')); document.getElementById('paymentsTabStudents').classList.add('active'); renderPaymentsList('students'); };
  document.getElementById('paymentsTabTeachers').onclick = ()=>{ document.querySelectorAll('#pagePayments .tab').forEach(t=>t.classList.remove('active')); document.getElementById('paymentsTabTeachers').classList.add('active'); renderPaymentsList('teachers'); };
  document.getElementById('paymentsTabStaff').onclick = ()=>{ document.querySelectorAll('#pagePayments .tab').forEach(t=>t.classList.remove('active')); document.getElementById('paymentsTabStaff').classList.add('active'); renderPaymentsList('staff'); };
  document.getElementById('paymentsTabExpenses').onclick = ()=>{ document.querySelectorAll('#pagePayments .tab').forEach(t=>t.classList.remove('active')); document.getElementById('paymentsTabExpenses').classList.add('active'); renderPaymentsList('expenses'); };

  const search = document.getElementById('paymentsSearch');
  if(search) search.oninput = ()=>{ const active = document.querySelector('#pagePayments .tab.active'); renderPaymentsList(active ? active.textContent.toLowerCase() : 'students'); };

  document.getElementById('paymentsExport').onclick = exportCurrentPaymentsView;

  // initial render
  await Promise.all([
    loadStudents && loadStudents(),
    loadTeachers && loadTeachers(),
    loadTransactions()
  ]);
  await renderPaymentsList('students');
  }

async function renderPaymentsList(view = 'students'){
  await loadTransactions(); // keep cache fresh
  const listRoot = document.getElementById('paymentsList');
  if(!listRoot) return;

  const q = (document.getElementById('paymentsSearch') && document.getElementById('paymentsSearch').value || '').trim().toLowerCase();
  const classFilter = (document.getElementById('paymentsClassFilter') && document.getElementById('paymentsClassFilter').value) || '';
  const statusFilter = (document.getElementById('paymentsStatusFilter') && document.getElementById('paymentsStatusFilter').value) || 'all';

  if(view === 'students'){
    let list = (studentsCache || []).slice();
    if(classFilter) list = list.filter(s => (s.classId || '') === classFilter);
    if(q) list = list.filter(s => ((s.fullName||'') + (s.studentId||'') + (s.parentPhone||'') + (s.phone||'')).toLowerCase().includes(q));
    // apply status filter
    list = list.filter(s => {
      const balance = Number(s.balance_cents || 0);
      const fee = Number(s.fee || 0);
      if(statusFilter === 'free') return fee === 0;
      if(statusFilter === 'paid') return fee > 0 && balance === 0;
      if(statusFilter === 'unpaid') return balance > 0;
      return true;
    });
    list.sort((a,b) => (b.balance_cents||0) - (a.balance_cents||0));
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>Students — ${list.length}</strong><div class="muted">Columns: No, ID, Name, Parent/Phone, Balance, Actions</div></div>`;
    html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th>No</th><th>ID</th><th>Name</th><th>Parent/Phone</th><th>Balance</th><th>Actions</th></tr></thead><tbody>`;
    list.forEach((s, idx) => {
      html += `<tr style="border-bottom:1px solid #f1f5f9">
        <td style="padding:8px">${idx+1}</td>
        <td style="padding:8px">${escape(s.studentId||s.id||'')}</td>
        <td style="padding:8px">${escape(s.fullName||'')}</td>
        <td style="padding:8px">${escape(s.parentPhone||s.phone||'—')}</td>
        <td style="padding:8px">${c2p(s.balance_cents||0)}</td>
        <td style="padding:8px">
          <button class="btn btn-ghost btn-sm pay-btn" data-id="${escape(s.studentId||s.id||'')}">Pay</button>
          <button class="btn btn-ghost btn-sm adj-btn" data-id="${escape(s.studentId||s.id||'')}">+</button>
          <button class="btn btn-ghost btn-sm view-trans-btn" data-id="${escape(s.studentId||s.id||'')}">View</button>
        </td></tr>`;
    });
    html += `</tbody></table></div>`;
    listRoot.innerHTML = html;
    listRoot.querySelectorAll('.pay-btn').forEach(b => b.onclick = openPayModal);
    listRoot.querySelectorAll('.adj-btn').forEach(b => b.onclick = openAdjustmentModal);
    listRoot.querySelectorAll('.view-trans-btn').forEach(b => b.onclick = openViewTransactionsModal);
    return;
  }

  if(view === 'teachers' || view === 'staff'){
    const pool = view === 'teachers' ? (teachersCache || []) : (window.staffCache || []);
    let list = pool.slice();
    if(q) list = list.filter(t => ((t.fullName||'') + (t.teacherId||t.id||'') + (t.phone||'')).toLowerCase().includes(q));
    list.sort((a,b) => (b.balance_cents||0) - (a.balance_cents||0));
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>${capitalize(view)} — ${list.length}</strong><div class="muted">Columns: No, ID, Name, Balance, Actions</div></div>`;
    html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th>No</th><th>ID</th><th>Name</th><th>Balance</th><th>Actions</th></tr></thead><tbody>`;
    list.forEach((t, idx) => {
      html += `<tr style="border-bottom:1px solid #f1f5f9">
        <td style="padding:8px">${idx+1}</td>
        <td style="padding:8px">${escape(t.teacherId||t.id||'')}</td>
        <td style="padding:8px">${escape(t.fullName||'')}</td>
        <td style="padding:8px">${c2p(t.balance_cents||0)}</td>
        <td style="padding:8px">
          <button class="btn btn-ghost btn-sm pay-btn" data-id="${escape(t.teacherId||t.id||'')}">Pay</button>
          <button class="btn btn-ghost btn-sm adj-btn" data-id="${escape(t.teacherId||t.id||'')}">+</button>
          <button class="btn btn-ghost btn-sm view-trans-btn" data-id="${escape(t.teacherId||t.id||'')}">View</button>
        </td></tr>`;
    });
    html += `</tbody></table></div>`;
    listRoot.innerHTML = html;
    listRoot.querySelectorAll('.pay-btn').forEach(b => b.onclick = openPayModal);
    listRoot.querySelectorAll('.adj-btn').forEach(b => b.onclick = openAdjustmentModal);
    listRoot.querySelectorAll('.view-trans-btn').forEach(b => b.onclick = openViewTransactionsModal);
    return;
  }

  if(view === 'expenses'){
    // show transactions where target_type === 'expense'
    const rows = (transactionsCache || []).filter(t => t.target_type === 'expense' && !t.is_deleted).sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>Expenses — ${rows.length}</strong><div class="muted">Columns: No, Name, Category, Amount, Date, Actions</div></div>`;
    html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th>No</th><th>Name</th><th>Category</th><th>Amount</th><th>Date</th><th>Actions</th></tr></thead><tbody>`;
    rows.forEach((tx, idx) => {
      html += `<tr style="border-bottom:1px solid #f1f5f9">
        <td style="padding:8px">${idx+1}</td>
        <td style="padding:8px">${escape(tx.note || tx.expense_name || 'Expense')}</td>
        <td style="padding:8px">${escape(tx.subtype || '')}</td>
        <td style="padding:8px">${c2p(tx.amount_cents || 0)}</td>
        <td style="padding:8px">${tx.createdAt ? new Date(tx.createdAt.seconds * 1000).toLocaleString() : ''}</td>
        <td style="padding:8px">
          <button class="btn btn-ghost btn-sm edit-expense" data-id="${tx.id}">Edit</button>
          <button class="btn btn-danger btn-sm del-expense" data-id="${tx.id}">Delete</button>
        </td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
    listRoot.innerHTML = html;
    listRoot.querySelectorAll('.edit-expense').forEach(b => b.onclick = openEditTransactionModal);
    listRoot.querySelectorAll('.del-expense').forEach(b => b.onclick = deleteTransaction);
    return;
  }
}

/* --- Pay modal (students/teachers/staff) --- */
async function openPayModal(e){
  const id = e.target.dataset.id;
  const activeTab = document.querySelector('#pagePayments .tab.active');
  const view = activeTab ? activeTab.textContent.toLowerCase() : 'students';
  const targetType = view === 'students' ? 'student' : (view === 'teachers' ? 'teacher' : 'staff');
  let target = null;
  if(targetType === 'student') target = (studentsCache||[]).find(s => s.studentId === id || s.id === id);
  else if(targetType === 'teacher') target = (teachersCache||[]).find(t => t.teacherId === id || t.id === id);
  else target = (window.staffCache||[]).find(s => s.id === id);

  if(!target) return toast('Target not found');

  // default values
  const currentBalance = Number(target.balance_cents || 0);
  const defaultPhone = target.parentPhone || target.phone || '';
  const monthsOptions = Array.from({length:12}, (_,i)=>`<option value="${i+1}">${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i]}</option>`).join('');

  // Modal HTML (full)
  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><label>Amount (${c2p(0)})</label><input id="payAmount" type="number" min="0" step="0.01" value="${c2p(currentBalance)}" /></div>
      <div><label>Payment Type</label>
        <select id="payType">
          <option value="monthly">Monthly</option>
          <option value="id-card">ID Card</option>
          <option value="registration">Registration</option>
          ${targetType !== 'student' ? '<option value="salary">Salary</option>' : ''}
          <option value="other">Other</option>
        </select>
      </div>
      <div id="payOtherTypeWrapper" style="display:none"><label>Other Type</label><input id="payOtherType" /></div>
      <div id="monthsWrapper"><label>Months (multi)</label><select id="payMonths" multiple size="6">${monthsOptions}</select></div>
      <div><label>Year</label>
        <select id="payYear">${Array.from({length:81},(_,i)=>2020+i).map(y=>`<option value="${y}" ${y===new Date().getFullYear()?'selected':''}>${y}</option>`).join('')}</select>
      </div>
      <div><label>Payment Method</label>
        <select id="payMethod"><option value="mobile">Mobile</option><option value="cash">Cash</option><option value="card">Card</option></select>
      </div>
      <div id="mobileProviderWrapper"><label>Mobile Provider</label>
        <select id="mobileProvider"><option>Hormuud</option><option>Somnet</option><option>Somtel</option><option>Telesom</option><option>Amtel</option><option>Other</option></select>
      </div>
      <div><label>Payer Phone</label><input id="payerPhone" value="${escape(defaultPhone)}" /></div>
      <div style="grid-column:1 / -1"><label>Note</label><input id="payNote" /></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="payClose" class="btn btn-ghost">Close</button>
      <button id="paySave" class="btn btn-primary">Save</button>
    </div>
  `;
  showModal(`Pay • ${escape(target.fullName || target.teacherName || target.id || '')} • Balance: ${c2p(currentBalance)}`, html);

  const payType = modalBody.querySelector('#payType');
  const payMonths = modalBody.querySelector('#payMonths');
  const monthsWrapper = modalBody.querySelector('#monthsWrapper');
  const otherTypeWrapper = modalBody.querySelector('#payOtherTypeWrapper');
  const mobileProviderWrapper = modalBody.querySelector('#mobileProviderWrapper');
  const payMethodEl = modalBody.querySelector('#payMethod');

  function toggleTypeUI(){
    const t = payType.value;
    otherTypeWrapper.style.display = t === 'other' ? 'block' : 'none';
    monthsWrapper.style.display = t === 'monthly' ? 'block' : 'none';
  }
  function toggleMethodUI(){
    mobileProviderWrapper.style.display = payMethodEl.value === 'mobile' ? 'block' : 'none';
  }
  payType.onchange = toggleTypeUI; payMethodEl.onchange = toggleMethodUI;
  toggleTypeUI(); toggleMethodUI();

  modalBody.querySelector('#payClose').onclick = closeModal;

  modalBody.querySelector('#paySave').onclick = async () => {
    try{
      const rawAmount = modalBody.querySelector('#payAmount').value;
      if(rawAmount === '' || rawAmount === null) return toast('Amount required');
      const amountCents = p2c(rawAmount);
      if(amountCents <= 0) return toast('Amount must be > 0');
      const type = payType.value === 'other' ? (modalBody.querySelector('#payOtherType').value.trim() || 'other') : payType.value;
      const months = Array.from(payMonths.selectedOptions).map(o => ({ month: Number(o.value), year: Number(modalBody.querySelector('#payYear').value) }));
      const payment_method = modalBody.querySelector('#payMethod').value;
      const mobile_provider = (modalBody.querySelector('#mobileProvider') && modalBody.querySelector('#mobileProvider').value) || null;
      const payer_phone = modalBody.querySelector('#payerPhone').value.trim() || null;
      const note = modalBody.querySelector('#payNote').value.trim() || null;

      // transaction payload
      const tx = {
        actor: currentUser ? currentUser.uid : null,
        target_type: targetType,
        target_id: target.studentId || target.teacherId || target.id,
        type: type,
        subtype: null,
        amount_cents: amountCents,
        payment_method,
        mobile_provider,
        payer_phone,
        note,
        related_months: (type === 'monthly') ? months.map(m=> `${m.year}-${String(m.month).padStart(2,'0')}`) : [],
        is_reversal: false,
        original_transaction_id: null,
        createdAt: Timestamp.now(),
      };

      // store transaction
      const ref = await addDoc(collection(db,'transactions'), tx);
      // for monthly and salary: update target balance (monthly reduces student balance; salary reduces teacher/staff balance)
      if(type === 'monthly' && targetType === 'student'){
        // monthly payment reduces student's owed balance -> subtract amount
        await updateTargetBalanceGeneric('student', tx.target_id, -amountCents);
      }
      if(type === 'salary' && (targetType === 'teacher' || targetType === 'staff')){
        // paying salary reduces the money owed to teacher/staff
        await updateTargetBalanceGeneric(targetType, tx.target_id, -amountCents);
      }
      await toast('Payment recorded');
      closeModal();
      await loadTransactions(); // refresh cache
      // refresh lists/dash
      renderPaymentsList('students');
      renderPaymentsList('teachers');
      renderPaymentsList('staff');
      renderDashboard && renderDashboard();
    }catch(err){
      console.error('save payment failed', err);
      toast('Failed to save payment');
    }
  };
}

/* --- Adjustment modal (+) --- */
async function openAdjustmentModal(e){
  const id = e.target.dataset.id;
  const activeTab = document.querySelector('#pagePayments .tab.active');
  const view = activeTab ? activeTab.textContent.toLowerCase() : 'students';
  const targetType = view === 'students' ? 'student' : (view === 'teachers' ? 'teacher' : 'staff');
  let target = null;
  if(targetType === 'student') target = (studentsCache||[]).find(s => s.studentId === id || s.id === id);
  else if(targetType === 'teacher') target = (teachersCache||[]).find(t => t.teacherId === id || t.id === id);
  else target = (window.staffCache||[]).find(s => s.id === id);

  if(!target) return toast('Target not found');

  const html = `
    <div style="display:grid;grid-template-columns:1fr;gap:8px">
      <div><label>Amount (enter negative to reduce balance)</label><input id="adjAmount" type="number" step="0.01" value="0" /></div>
      <div><label>Reason / Note</label><input id="adjNote" /></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="adjClose" class="btn btn-ghost">Close</button>
      <button id="adjSave" class="btn btn-primary">Save</button>
    </div>
  `;
  showModal(`Adjust • ${escape(target.fullName || target.id || '')}`, html);
  modalBody.querySelector('#adjClose').onclick = closeModal;
  modalBody.querySelector('#adjSave').onclick = async () => {
    try{
      const raw = modalBody.querySelector('#adjAmount').value;
      if(raw === '' || raw === null) return toast('Amount required');
      const signedCents = Math.round(Number(raw) * 100); // can be negative
      if(signedCents === 0) return toast('Amount should not be zero');
      const note = modalBody.querySelector('#adjNote').value.trim() || 'Adjustment';
      // transaction
      const tx = {
        actor: currentUser ? currentUser.uid : null,
        target_type: targetType,
        target_id: target.studentId || target.teacherId || target.id,
        type: 'adjustment',
        subtype: null,
        amount_cents: signedCents,
        payment_method: 'manual',
        mobile_provider: null,
        payer_phone: null,
        note,
        related_months: [],
        is_reversal: false,
        original_transaction_id: null,
        createdAt: Timestamp.now()
      };
      await addDoc(collection(db,'transactions'), tx);
      // apply balance change: adjustment value is added to balance (positive increases owed, negative decreases owed)
      await updateTargetBalanceGeneric(targetType, tx.target_id, signedCents);
      await toast('Adjustment saved');
      closeModal();
      await loadTransactions();
      renderPaymentsList('students');
      renderPaymentsList('teachers');
      renderPaymentsList('staff');
      renderDashboard && renderDashboard();
    }catch(err){
      console.error('save adjustment failed', err);
      toast('Failed to save adjustment');
    }
  };
}

/* --- View Transactions for a target (open drawer/modal) --- */
async function openViewTransactionsModal(e){
  const id = e.target.dataset.id;
  // determine which list invoked (search for id among students / teachers / staff)
  let targetType = 'student';
  let target = (studentsCache||[]).find(s => s.studentId === id || s.id === id);
  if(!target){
    target = (teachersCache||[]).find(t => t.teacherId === id || t.id === id);
    if(target) targetType = 'teacher';
  }
  if(!target){
    target = (window.staffCache||[]).find(s => s.id === id);
    if(target) targetType = 'staff';
  }
  if(!target) return toast('Target not found');

  // load transactions for that target
  const q = query(collection(db,'transactions'), where('target_type','==',targetType), where('target_id','==',(target.studentId || target.teacherId || target.id)));
  const snap = await getDocs(q);
  const txs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));

  // summary
  const totalMonthly = txs.filter(t => t.type === 'monthly').reduce((s,t) => s + (t.amount_cents || 0), 0);
  const totalAll = txs.reduce((s,t) => s + (t.amount_cents || 0), 0);

  let html = `<div><strong>${escape(target.fullName || target.teacherName || target.id)}</strong> <div class="muted">ID: ${escape(target.studentId || target.teacherId || target.id)}</div></div>`;
  html += `<div style="margin-top:8px"><strong>Summary</strong><div class="muted">Total monthly paid: ${c2p(totalMonthly)} • Total all: ${c2p(totalAll)} • Current balance: ${c2p(target.balance_cents||0)}</div></div>`;
  html += `<div style="overflow:auto;margin-top:8px"><table style="width:100%;border-collapse:collapse"><thead><tr><th>Date</th><th>Type</th><th>Months</th><th>Amount</th><th>Method</th><th>By</th><th>Note</th><th>Actions</th></tr></thead><tbody>`;
  txs.forEach(tx => {
    html += `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px">${tx.createdAt ? new Date(tx.createdAt.seconds * 1000).toLocaleString() : ''}</td>
      <td style="padding:8px">${escape(tx.type)}</td>
      <td style="padding:8px">${(tx.related_months || []).join(', ')}</td>
      <td style="padding:8px">${c2p(tx.amount_cents||0)}</td>
      <td style="padding:8px">${escape(tx.payment_method || '')}${tx.mobile_provider ? ' / ' + escape(tx.mobile_provider) : ''}</td>
      <td style="padding:8px">${escape(tx.actor || '')}</td>
      <td style="padding:8px">${escape(tx.note || '')}</td>
      <td style="padding:8px">
        <button class="btn btn-ghost btn-sm edit-tx" data-id="${tx.id}">Edit</button>
        <button class="btn btn-danger btn-sm del-tx" data-id="${tx.id}">Delete</button>
      </td>
    </tr>`;
  });
  html += `</tbody></table></div><div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end"><button id="closeTxView" class="btn btn-ghost">Close</button></div>`;

  showModal('Transactions', html);
  modalBody.querySelector('#closeTxView').onclick = closeModal;
  modalBody.querySelectorAll('.edit-tx').forEach(b => b.onclick = openEditTransactionModal);
  modalBody.querySelectorAll('.del-tx').forEach(b => b.onclick = deleteTransaction);
}

/* --- Edit transaction modal --- */
async function openEditTransactionModal(e){
  const txId = e.target.dataset.id;
  if(!txId) return;
  const txSnap = await getDoc(doc(db,'transactions', txId));
  if(!txSnap.exists()) return toast('Transaction not found');
  const tx = { id: txSnap.id, ...txSnap.data() };

  // modal fields
  const monthsOptions = Array.from({length:12}, (_,i)=>`<option value="${i+1}">${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i]}</option>`).join('');
  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><label>Amount</label><input id="editAmount" type="number" step="0.01" value="${c2p(tx.amount_cents||0)}" /></div>
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
      const newAmountCents = p2c(modalBody.querySelector('#editAmount').value);
      const newType = modalBody.querySelector('#editType').value.trim();
      const newMonths = Array.from(selectMonths.selectedOptions).map(o => o.value);
      const newMethod = modalBody.querySelector('#editMethod').value.trim();
      const newProvider = modalBody.querySelector('#editProvider').value.trim();
      const newPayer = modalBody.querySelector('#editPayer').value.trim();
      const newNote = modalBody.querySelector('#editNote').value.trim();

      // if type affects balance (monthly or salary) we must compute delta and apply
      const affectsBalance = (tx.type === 'monthly' || tx.type === 'salary') && (newType === tx.type); // only if type remains one that affects balance
      if(affectsBalance){
        // original amount was tx.amount_cents; previously we applied effect (e.g., subtracted from balance). We need to apply difference: delta = old - new (we add delta to balance because old was applied)
        const delta = (tx.amount_cents || 0) - newAmountCents; // if positive -> add to balance; if negative -> subtract
        await updateTargetBalanceGeneric(tx.target_type, tx.target_id, delta);
      } else {
        // also handle case where original affected but new doesn't: we must reverse original effect
        if(tx.type === 'monthly' || tx.type === 'salary'){
          // reverse original effect completely
          await updateTargetBalanceGeneric(tx.target_type, tx.target_id, (tx.amount_cents || 0));
        }
        // if original not affecting but new type affects, apply new effect (subtract)
        if(newType === 'monthly' || newType === 'salary'){
          await updateTargetBalanceGeneric(tx.target_type, tx.target_id, -newAmountCents);
        }
      }

      // save transaction edits and audit fields
      await updateDoc(doc(db,'transactions', tx.id), {
        amount_cents: newAmountCents,
        type: newType,
        payment_method: newMethod || null,
        mobile_provider: newProvider || null,
        payer_phone: newPayer || null,
        note: newNote || null,
        related_months: (newType === 'monthly') ? newMonths.map(m => `${new Date().getFullYear()}-${String(Number(m)).padStart(2,'0')}`) : [],
        edited_by: currentUser ? currentUser.uid : null,
        edited_at: Timestamp.now()
      });

      await toast('Transaction updated');
      closeModal();
      await loadTransactions();
      renderPaymentsList('students');
      renderPaymentsList('teachers');
      renderPaymentsList('staff');
      renderDashboard && renderDashboard();
    }catch(err){
      console.error('edit transaction failed', err);
      toast('Failed to update transaction');
    }
  };
}

/* --- Delete/soft-delete transaction --- */
async function deleteTransaction(e){
  const id = e.target.dataset.id;
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
    // soft-delete
    await updateDoc(doc(db,'transactions', id), { is_deleted: true, deleted_by: currentUser ? currentUser.uid : null, deleted_at: Timestamp.now() });
    await toast('Transaction deleted');
    await loadTransactions();
    renderPaymentsList('students');
    renderPaymentsList('teachers');
    renderPaymentsList('staff');
    renderDashboard && renderDashboard();
  }catch(err){
    console.error('delete transaction failed', err);
    toast('Failed to delete transaction');
  }
}

/* Export current payments view to CSV (simple) */
async function exportCurrentPaymentsView(){
  const active = document.querySelector('#pagePayments .tab.active');
  const view = active ? active.textContent.toLowerCase() : 'students';
  let rows = [];
  if(view === 'students'){
    rows.push(['ID','Name','Phone','AssignedFee','CurrentBalance']);
    (studentsCache||[]).forEach(s => rows.push([s.studentId||s.id, s.fullName||'', s.parentPhone||s.phone||'', s.fee||'', c2p(s.balance_cents||0)]));
  } else if(view === 'teachers'){
    rows.push(['ID','Name','Phone','Salary','CurrentBalance']);
    (teachersCache||[]).forEach(t => rows.push([t.teacherId||t.id, t.fullName||'', t.phone||'', t.salary||'', c2p(t.balance_cents||0)]));
  } else if(view === 'staff'){
    rows.push(['ID','Name','Phone','Role','CurrentBalance']);
    (window.staffCache||[]).forEach(s => rows.push([s.id, s.fullName||'', s.phone||'', s.role||'', c2p(s.balance_cents||0)]));
  } else { // expenses
    rows.push(['TransactionID','Note','Category','Amount','Date','RecordedBy']);
    (transactionsCache||[]).filter(t=> t.target_type === 'expense' && !t.is_deleted).forEach(t => rows.push([t.id, t.note||'', t.subtype||'', c2p(t.amount_cents||0), t.createdAt ? new Date(t.createdAt.seconds*1000).toISOString() : '', t.actor || '']));
  }
  const csv = rows.map(r => r.map(c => '"' + String(c||'').replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `export-${view}.csv`; a.click(); URL.revokeObjectURL(url);
}

/* ------------------------
  Dashboard (simple widget render)
-------------------------*/
async function renderDashboard(){
  // ensure caches loaded
  await Promise.all([ loadStudents(), loadTeachers(), loadTransactions() ]);
  const totalStudents = (studentsCache||[]).length;
  const totalTeachers = (teachersCache||[]).length;
  const totalStaff = (window.staffCache||[]).length || 0;
  const totalOutstandingCents = (studentsCache||[]).reduce((s,x)=> s + (x.balance_cents||0), 0) + (teachersCache||[]).reduce((s,x)=> s + (x.balance_cents||0), 0) + ((window.staffCache||[]).reduce((s,x)=> s + (x.balance_cents||0), 0));
  // due this month: sum of student fee for month + teacher salary owed (simple approximation)
  const totalDueThisMonthCents = (studentsCache||[]).reduce((s,x)=> s + (p2c(x.fee || 0)), 0) + (teachersCache||[]).reduce((s,x)=> s + (p2c(x.salary || 0)), 0);

  // render / update dashboard card
  let dash = document.getElementById('dashboardCard');
  const html = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px">
      <div class="card"><strong>Total Students</strong><div class="muted" id="totalStudentsVal">${totalStudents}</div></div>
      <div class="card"><strong>Total Teachers</strong><div class="muted" id="totalTeachersVal">${totalTeachers}</div></div>
      <div class="card"><strong>Total Staff</strong><div class="muted" id="totalStaffVal">${totalStaff}</div></div>
      <div class="card"><strong>Total Outstanding</strong><div class="muted" id="totalOutstandingVal">${c2p(totalOutstandingCents)}</div></div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button id="openPaymentsQuick" class="btn btn-primary">Open Payments</button>
      <button id="openAttendanceQuick" class="btn btn-ghost">Open Attendance</button>
      <button id="openAddExpenseQuick" class="btn btn-ghost">New Expense</button>
      <button id="openExportQuick" class="btn btn-ghost">Export Reports</button>
    </div>
    <div style="margin-bottom:12px"><strong>Totals</strong> <div class="muted">Due this month: ${c2p(totalDueThisMonthCents)}</div></div>
    <div style="margin-top:8px"><strong>Recent Transactions</strong></div>
    <div id="dashboardRecentTx"></div>
  `;

  if(!dash){
    dash = document.createElement('div');
    dash.id = 'dashboardCard';
    dash.className = 'page';
    const main = document.querySelector('main');
    main && main.prepend(dash);
  }
  dash.innerHTML = html;

  document.getElementById('openPaymentsQuick').onclick = ()=>{ renderPayments(); showPage && showPage('payments'); };
  document.getElementById('openAttendanceQuick').onclick = ()=>{ renderAttendance(); showPage && showPage('attendance'); };
  document.getElementById('openAddExpenseQuick').onclick = async () => {
    // open small add-expense modal
    const html = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><label>Expense Name</label><input id="expName" /></div>
        <div><label>Category</label><input id="expCategory" /></div>
        <div><label>Amount</label><input id="expAmount" type="number" step="0.01" /></div>
        <div><label>Date</label><input id="expDate" type="date" value="${new Date().toISOString().slice(0,10)}" /></div>
        <div style="grid-column:1 / -1"><label>Note</label><input id="expNote" /></div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
        <button id="expClose" class="btn btn-ghost">Close</button>
        <button id="expSave" class="btn btn-primary">Save</button>
      </div>
    `;
    showModal('Add Expense', html);
    modalBody.querySelector('#expClose').onclick = closeModal;
    modalBody.querySelector('#expSave').onclick = async () => {
      const name = modalBody.querySelector('#expName').value.trim();
      const cat = modalBody.querySelector('#expCategory').value.trim();
      const amt = modalBody.querySelector('#expAmount').value;
      const date = modalBody.querySelector('#expDate').value;
      const note = modalBody.querySelector('#expNote').value.trim();
      if(!name || !amt) return toast('Name and amount required');
      const cents = p2c(amt);
      const tx = {
        actor: currentUser ? currentUser.uid : null,
        target_type: 'expense',
        target_id: `EXP-${Date.now()}`,
        type: 'expense',
        subtype: cat || null,
        amount_cents: cents,
        payment_method: 'manual',
        mobile_provider: null,
        payer_phone: null,
        note: name + (note ? ' - ' + note : ''),
        related_months: [],
        is_reversal: false,
        original_transaction_id: null,
        createdAt: Timestamp.now()
      };
      await addDoc(collection(db,'transactions'), tx);
      await toast('Expense recorded');
      closeModal();
      await loadTransactions();
      renderPaymentsList('expenses');
      renderDashboard && renderDashboard();
    };
  };

  // recent 10 tx
  const recent = (transactionsCache || []).filter(t=> !t.is_deleted).sort((a,b)=> (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0)).slice(0,10);
  const recentDiv = document.getElementById('dashboardRecentTx');
  recentDiv.innerHTML = `<table style="width:100%"><thead><tr><th>Date</th><th>Target</th><th>Type</th><th>Amount</th><th>Method</th></tr></thead><tbody>${recent.map(r => `<tr><td>${r.createdAt ? new Date(r.createdAt.seconds*1000).toLocaleString() : ''}</td><td>${escape(r.target_type||'')} ${escape(r.target_id||'')}</td><td>${escape(r.type||'')}</td><td>${c2p(r.amount_cents||0)}</td><td>${escape(r.payment_method||'')}</td></tr>`).join('')}</tbody></table>`;
}

/* ------------------------
  Attendance
-------------------------*/

async function renderAttendance(){
  let page = document.getElementById('pageAttendance');
  if(!page){
    page = document.createElement('section');
    page.id = 'pageAttendance';
    page.className = 'page';
    const main = document.querySelector('main');
    main && main.appendChild(page);
  }

  page.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;gap:8px">
      <select id="attClass" style="min-width:160px"><option value="">Select class</option></select>
      <select id="attSubject" style="min-width:160px"><option value="">Subject (optional)</option></select>
      <input id="attDate" type="date" />
      <div style="margin-left:auto;display:flex;gap:8px">
        <button id="attMark" class="btn btn-primary">Mark Attendance</button>
        <button id="attImport" class="btn btn-ghost">Bulk Import</button>
        <button id="attExport" class="btn btn-ghost">Export</button>
      </div>
    </div>
    <div id="attendanceList"></div>
  `;
  const classSel = document.getElementById('attClass');
  classSel.innerHTML = '<option value="">Select class</option>' + (classesCache||[]).map(c => `<option value="${escape(c.name)}">${escape(c.name)}</option>`).join('');
  const subjSel = document.getElementById('attSubject');
  subjSel.innerHTML = '<option value="">Subject (optional)</option>' + (subjectsCache||[]).map(s => `<option value="${escape(s.name)}">${escape(s.name)}</option>`).join('');
  document.getElementById('attDate').value = new Date().toISOString().slice(0,10);

  document.getElementById('attMark').onclick = openMarkAttendanceModal;
  document.getElementById('attExport').onclick = async () => {
    const classId = document.getElementById('attClass').value;
    const dateISO = document.getElementById('attDate').value;
    if(!classId || !dateISO) return toast('Select class and date');
    await exportAttendanceCSV(classId, dateISO);
  };
}

/* load attendance records for class+date */
async function loadAttendanceForDate(classId, dateISO){
  try{
    const q = query(collection(db,'attendance'), where('class_id','==',classId), where('date','==',dateISO));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }catch(err){
    console.error('loadAttendanceForDate failed', err);
    return [];
  }
}

/* mark attendance modal */
async function openMarkAttendanceModal(){
  const classId = document.getElementById('attClass').value;
  const dateISO = document.getElementById('attDate').value;
  if(!classId) return toast('Choose class');
  if(!dateISO) return toast('Choose date');
  await loadStudents();
  const students = (studentsCache||[]).filter(s => (s.classId || '') === classId);
  const existing = await loadAttendanceForDate(classId, dateISO);

  let html = `<div><strong>Class: ${escape(classId)}</strong> <div class="muted">Date: ${dateISO}</div></div>`;
  html += `<div style="overflow:auto;margin-top:8px"><table style="width:100%;border-collapse:collapse"><thead><tr><th>No</th><th>ID</th><th>Name</th><th>Phone</th><th>Status</th><th>Note</th></tr></thead><tbody>`;
  students.forEach((s, idx) => {
    const rec = existing.find(r => r.student_id === (s.studentId || s.id));
    const status = rec ? rec.status : 'absent';
    const note = rec ? (rec.note || '') : '';
    html += `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px">${idx+1}</td>
      <td style="padding:8px">${escape(s.studentId||s.id||'')}</td>
      <td style="padding:8px">${escape(s.fullName||'')}</td>
      <td style="padding:8px">${escape(s.parentPhone||s.phone||'')}</td>
      <td style="padding:8px">
        <select class="att-status" data-id="${escape(s.studentId||s.id)}">
          <option value="present" ${status==='present'?'selected':''}>Present</option>
          <option value="absent" ${status==='absent'?'selected':''}>Absent</option>
          <option value="late" ${status==='late'?'selected':''}>Late</option>
          <option value="excused" ${status==='excused'?'selected':''}>Excused</option>
        </select>
      </td>
      <td style="padding:8px"><input class="att-note" data-id="${escape(s.studentId||s.id)}" value="${escape(note)}" /></td>
    </tr>`;
  });
  html += `</tbody></table></div><div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end"><button id="attCancel" class="btn btn-ghost">Cancel</button><button id="attSave" class="btn btn-primary">Save</button></div>`;
  showModal('Mark Attendance', html);

  modalBody.querySelector('#attCancel').onclick = closeModal;
  modalBody.querySelector('#attSave').onclick = async () => {
    try{
      const statuses = Array.from(modalBody.querySelectorAll('.att-status')).map(s => ({ student_id: s.dataset.id, status: s.value }));
      const notes = Array.from(modalBody.querySelectorAll('.att-note')).map(n => ({ student_id: n.dataset.id, note: n.value }));
      for(const s of statuses){
        const noteObj = notes.find(n => n.student_id === s.student_id);
        const recId = `${classId}::${dateISO}::${s.student_id}`; // deterministic id avoids duplicates
        const payload = {
          class_id: classId,
          date: dateISO,
          subject_id: (document.getElementById('attSubject') && document.getElementById('attSubject').value) || null,
          student_id: s.student_id,
          status: s.status,
          marked_by: currentUser ? currentUser.uid : null,
          timestamp: Timestamp.now(),
          note: noteObj ? noteObj.note : ''
        };
        await setDoc(doc(db,'attendance', recId), payload);
      }
      toast('Attendance saved');
      closeModal();
    }catch(err){
      console.error('save attendance failed', err);
      toast('Failed to save attendance');
    }
  };
}

/* export attendance CSV for class/date */
async function exportAttendanceCSV(classId, dateISO){
  const recs = await loadAttendanceForDate(classId, dateISO);
  const rows = [['StudentID','Name','Date','Class','Status','Note']];
  for(const r of recs){
    const stu = (studentsCache||[]).find(s => s.studentId === r.student_id || s.id === r.student_id);
    rows.push([r.student_id, stu ? stu.fullName : '', r.date, r.class_id, r.status, r.note || '']);
  }
  const csv = rows.map(r => r.map(c => '"' + String(c||'').replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `attendance-${classId}-${dateISO}.csv`; a.click(); URL.revokeObjectURL(url);
}

/* ------------------------
  Users (admin) CRUD
-------------------------*/
async function renderUsers(){
  let page = document.getElementById('pageUsers');
  if(!page){
    page = document.createElement('section');
    page.id = 'pageUsers';
    page.className = 'page';
    const main = document.querySelector('main');
    main && main.appendChild(page);
  }

  // load users
  let users = [];
  try{
    const snap = await getDocs(collection(db,'users'));
    users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }catch(err){
    console.error('load users failed', err);
  }

  page.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;gap:8px">
      <button id="addUserBtn" class="btn btn-primary">+ Add Admin</button>
      <input id="usersSearch" placeholder="Search users" style="margin-left:auto" />
    </div>
    <div id="usersList"></div>
  `;

  document.getElementById('addUserBtn').onclick = openAddUserModal;
  document.getElementById('usersSearch').oninput = () => renderUsersList(users);

  renderUsersList(users);
}

function renderUsersList(users){
  const q = (document.getElementById('usersSearch') && document.getElementById('usersSearch').value || '').trim().toLowerCase();
  const list = (users || []).filter(u => !q || (u.displayName||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q));
  const container = document.getElementById('usersList');
  if(!container) return;
  let html = `<table style="width:100%;border-collapse:collapse"><thead><tr><th>No</th><th>Email</th><th>Name</th><th>Role</th><th>Actions</th></tr></thead><tbody>`;
  list.forEach((u, idx) => {
    html += `<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:8px">${idx+1}</td><td style="padding:8px">${escape(u.email||'')}</td><td style="padding:8px">${escape(u.displayName||'')}</td><td style="padding:8px">${escape(u.role||'admin')}</td><td style="padding:8px"><button class="btn btn-ghost edit-user" data-id="${u.id}">Edit</button> <button class="btn btn-danger del-user" data-id="${u.id}">Delete</button></td></tr>`;
  });
  html += `</tbody></table>`;
  container.innerHTML = html;
  container.querySelectorAll('.edit-user').forEach(b => b.onclick = openEditUserModal);
  container.querySelectorAll('.del-user').forEach(b => b.onclick = deleteUser);
}

function openAddUserModal(){
  const html = `
    <div style="display:grid;grid-template-columns:1fr;gap:8px">
      <div><label>Email</label><input id="newUserEmail" /></div>
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
    if(!email) return toast('Email required');
    try{
      const payload = { email, displayName: name || '', role, createdAt: Timestamp.now(), createdBy: currentUser ? currentUser.uid : null };
      const ref = await addDoc(collection(db,'users'), payload);
      toast('Admin added');
      closeModal();
      renderUsers(); // reload list
    }catch(err){
      console.error('add admin failed', err);
      toast('Failed to add');
    }
  };
}

async function openEditUserModal(e){
  const id = e.target.dataset.id;
  if(!id) return;
  const snap = await getDoc(doc(db,'users', id));
  if(!snap.exists()) return toast('User not found');
  const u = { id: snap.id, ...snap.data() };
  const html = `
    <div style="display:grid;grid-template-columns:1fr;gap:8px">
      <div><label>Name</label><input id="editUserName" value="${escape(u.displayName||'')}" /></div>
      <div><label>Role</label><input id="editUserRole" value="${escape(u.role||'admin')}" /></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button id="editUserClose" class="btn btn-ghost">Close</button>
      <button id="editUserSave" class="btn btn-primary">Save</button>
    </div>
  `;
  showModal('Edit Admin', html);
  modalBody.querySelector('#editUserClose').onclick = closeModal;
  modalBody.querySelector('#editUserSave').onclick = async () => {
    const name = modalBody.querySelector('#editUserName').value.trim();
    const role = modalBody.querySelector('#editUserRole').value.trim();
    try{
      await updateDoc(doc(db,'users', id), { displayName: name, role, updatedAt: Timestamp.now(), updatedBy: currentUser ? currentUser.uid : null });
      toast('Updated');
      closeModal();
      renderUsers();
    }catch(err){
      console.error('update admin failed', err);
      toast('Failed to update');
    }
  };
}

async function deleteUser(e){
  const id = e.target.dataset.id;
  if(!id) return;
  if(!confirm('Delete admin?')) return;
  try{
    await deleteDoc(doc(db,'users', id));
    toast('Deleted');
    renderUsers();
  }catch(err){
    console.error('delete admin failed', err);
    toast('Failed to delete');
  }
}

/* ------------------------
  Header wiring (add tabs: Dashboard, Payments, Attendance, Users)
-------------------------*/
(function wireHeaderTabs(){
  try{
    const nav = document.querySelector('.tabs');
    if(!nav) return;
    if(!document.getElementById('tabDashboard')){
      const btn = document.createElement('button'); btn.id='tabDashboard'; btn.className='tab'; btn.textContent='Dashboard';
      nav.insertBefore(btn, nav.firstChild);
      btn.onclick = ()=>{ renderDashboard(); showPage && showPage('dashboard'); };
    }
    if(!document.getElementById('tabPayments')){
      const btn = document.createElement('button'); btn.id='tabPayments'; btn.className='tab'; btn.textContent='Payments';
      nav.appendChild(btn);
      btn.onclick = ()=>{ renderPayments(); showPage && showPage('payments'); };
    }
    if(!document.getElementById('tabAttendance')){
      const btn = document.createElement('button'); btn.id='tabAttendance'; btn.className='tab'; btn.textContent='Attendance';
      nav.appendChild(btn);
      btn.onclick = ()=>{ renderAttendance(); showPage && showPage('attendance'); };
    }
    if(!document.getElementById('tabUsers')){
      const btn = document.createElement('button'); btn.id='tabUsers'; btn.className='tab'; btn.textContent='Users';
      nav.appendChild(btn);
      btn.onclick = ()=>{ renderUsers(); showPage && showPage('users'); };
    }
  }catch(err){ console.warn('wireHeaderTabs failed', err); }
})();

/* End of payments/attendance/users additions */
