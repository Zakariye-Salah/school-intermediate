// exam-editor.js (REPLACE ENTIRE FILE)
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { db } from './firebase-config.js';
import {
  doc, getDoc, getDocs, collection, setDoc, updateDoc, query, where, Timestamp, deleteDoc
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

// require auth
const auth = getAuth();
onAuthStateChanged(auth, user => {
  if(!user) window.location.href = 'login.html';
});

// UI refs
const params = new URLSearchParams(window.location.search);
const examId = params.get('examId');
const examTitleEl = document.getElementById('examTitle');
const examMetaEl = document.getElementById('examMeta');
const examStatusEl = document.getElementById('examStatus');
const examIdLine = document.getElementById('examIdLine');
const studentTableContainer = document.getElementById('studentTableContainer');
const btnBack = document.getElementById('btnBack');
const btnPublish = document.getElementById('btnPublish');
const btnExport = document.getElementById('btnExport');
const searchInput = document.getElementById('searchInput');
const classFilter = document.getElementById('classFilter');

const exportModalBackdrop = document.getElementById('exportModalBackdrop');
const exportExamNameEl = document.getElementById('exportExamName');
const exportCSVBtn = document.getElementById('exportCSV');
const exportPDFBtn = document.getElementById('exportPDF');
const exportCancelBtn = document.getElementById('exportCancel');
const exportIncludeHeader = document.getElementById('exportIncludeHeader');

const stuModalBackdrop = document.getElementById('studentModalBackdrop');
const stuModalClose = document.getElementById('studentModalClose');
const stuModalTitle = document.getElementById('studentModalTitle');
const stuModalBody = document.getElementById('studentModalBody');

btnBack.onclick = ()=> window.history.back();
stuModalClose.onclick = ()=> { stuModalBackdrop.style.display='none'; stuModalBody.innerHTML=''; };


// make subject names safe to use in element ids
function safeId(name){
  if(!name) return '';
  return String(name).replace(/\s+/g,'_').replace(/[^\w\-]/g,'');
}

// export modal open
btnExport.onclick = () => openExportModal();

exportCancelBtn.onclick = () => { exportModalBackdrop.style.display = 'none'; };
exportCSVBtn.onclick = async () => {
  exportModalBackdrop.style.display = 'none';
  const includeHeader = exportIncludeHeader.checked;
  const rows = gatherExportRows(); // uses current classFilter/search
  await downloadCSV(rows, includeHeader);
};
exportPDFBtn.onclick = async () => {
  exportModalBackdrop.style.display = 'none';
  const includeHeader = exportIncludeHeader.checked;
  const rows = gatherExportRows();
  await downloadPDF(rows, includeHeader);
};

// state
let exam = null;
let classesCache = [];
let allStudents = [];
let rowsCache = [];
let resultsMap = {}; // studentId -> marks (current exam)
let linkedTotalsCache = {}; // studentId -> { subjectName -> linkedMark } (populated if exam.linkedExamId)
let linkedSubjectsMeta = {}; // subjectName -> linkedMax (meta from linked exam)
 // ---- added: keep linked exam name for header and labels
let linkedExamName = null; // string name of the linked exam (e.g. "Midterm")

async function init(){
  if(!examId) return alert('No exam id in URL');

  // load fresh exam doc
  const exSnap = await getDoc(doc(db,'exams',examId));
  if(!exSnap.exists()) return alert('Exam not found');
  exam = { id: exSnap.id, ...exSnap.data() };

  // header title + quick exam selector (we'll populate selector just below)
  examTitleEl.innerHTML = `Exam — ${escapeHtml(exam.name || '')} <span id="examJumpContainer" style="margin-left:12px"></span>`;
  examMetaEl.textContent = `Targets: ${ (exam.classes && exam.classes.length) ? exam.classes.join(', ') : 'All classes' } • ${exam.status ? exam.status.charAt(0).toUpperCase()+exam.status.slice(1) : ''}`;
  examIdLine.textContent = `ID: ${exam.id}`;

  updateStatusPill();

  // load classes and students and results
  const classesSnap = await getDocs(collection(db,'classes'));
  classesCache = classesSnap.docs.map(d => ({ id:d.id, ...d.data() }));

  const studentsSnap = await getDocs(collection(db,'students'));
  allStudents = studentsSnap.docs.map(d => ({ id:d.id, ...d.data() }));
  rowsCache = allStudents.filter(s => (exam.classes && exam.classes.length ? exam.classes.includes(s.classId) : true) && s.status !== 'deleted');

  populateClassFilter();
  await loadResultsSnapshot();

  // if exam links to another exam (midterm -> final), prefetch linked examTotals for quick lookup
  if(exam.linkedExamId){
    linkedTotalsCache = {};
    linkedSubjectsMeta = {};
    linkedExamName = null;
    try {
      // load linked exam doc subjects meta + name
      const linkedSnap = await getDoc(doc(db,'exams', exam.linkedExamId));
      if(linkedSnap.exists()){
        const linkedEx = linkedSnap.data();
        linkedExamName = linkedEx.name || null;
        (linkedEx.subjects || []).forEach(s => { linkedSubjectsMeta[s.name] = s.max || 0; });
      }
      // load published examTotals for linked exam (fast lookup)
      const q = query(collection(db,'examTotals'), where('examId','==', exam.linkedExamId));
      const snap = await getDocs(q);
      snap.forEach(d => {
        const data = d.data();
        const sid = data.studentId;
        if(!linkedTotalsCache[sid]) linkedTotalsCache[sid] = {};
        (data.subjects || []).forEach(s => {
          linkedTotalsCache[sid][s.name] = Number(s.mark ?? s.total ?? 0);
        });
      });
    } catch(err){
      console.warn('Could not load linked exam totals:', err);
    }
  } else {
    linkedTotalsCache = {};
    linkedSubjectsMeta = {};
    linkedExamName = null;
  }

  renderTable();

  // --- populate exam jump dropdown (all exams, published & draft)
  try {
    const allExSnap = await getDocs(collection(db,'exams'));
    const allEx = allExSnap.docs.map(d => ({ id:d.id, ...d.data() }));
    const container = document.getElementById('examJumpContainer');
    if(container){
      const selHtml = ['<select id="examJumpSelect" style="margin-left:6px">'];
      selHtml.push(`<option value="">— open another exam —</option>`);
      allEx.forEach(x=>{
        const label = `${x.name || '(no name)'} ${x.status ? '('+x.status+')' : ''}`;
        selHtml.push(`<option value="${escapeHtml(x.id)}">${escapeHtml(label)}</option>`);
      });
      selHtml.push('</select>');
      selHtml.push('<button id="examJumpOpen" class="btn btn-ghost btn-sm" style="margin-left:6px">Open</button>');
      container.innerHTML = selHtml.join('');
      document.getElementById('examJumpOpen').onclick = ()=> {
        const id = document.getElementById('examJumpSelect').value;
        if(!id) return alert('Select an exam');
        // build path relative to current location so both /school-exam/exam-editor.html and /exam-editor.html work
        const base = window.location.pathname.replace(/\/[^/]*$/, '/');
        // attempt to navigate to same-folder exam-editor.html
        window.location.href = `${base}exam.html?examId=${encodeURIComponent(id)}`;
      };
    }
  } catch(e){ console.warn('exam jump load failed', e); }

  searchInput.oninput = () => renderTable();
  classFilter.onchange = () => renderTable();

  btnPublish.onclick = async () => {
    if(!confirm(exam.status === 'published' ? 'Unpublish this exam?' : 'Publish this exam? This will compute totals and update public snapshots.')) return;
    if(exam.status === 'published'){
      await updateDoc(doc(db,'exams',exam.id), { status:'draft' });
      exam.status = 'draft';
      updateStatusPill();
      alert('Exam unpublished');
      return;
    }
    if(exam.status === 'deactivated') return alert('Deactivated exam cannot be published');
    // compute totals and publish (local publish implemented here)
    try {
      await publishExamLocal(exam.id);
      // refresh local exam doc
      const fresh = await getDoc(doc(db,'exams',exam.id));
      exam = { id: fresh.id, ...fresh.data() };
      updateStatusPill();
      await loadResultsSnapshot(); renderTable();
      alert('Exam published and totals computed.');
    } catch(err){
      console.error(err);
      alert('Publish failed: '+err.message);
    }
  };
}

function updateStatusPill(){
  if(!exam) return;
  examStatusEl.className = 'status-pill';
  examStatusEl.classList.remove('status-published','status-deactivated','status-draft');
  if(exam.status === 'published'){ examStatusEl.textContent = 'Published'; examStatusEl.classList.add('status-published'); btnPublish.textContent='Unpublish'; }
  else if(exam.status === 'deactivated'){ examStatusEl.textContent = 'Deactivated'; examStatusEl.classList.add('status-deactivated'); btnPublish.textContent='Deactivated'; btnPublish.disabled=true; }
  else { examStatusEl.textContent = 'Draft'; examStatusEl.classList.add('status-draft'); btnPublish.textContent='Publish'; btnPublish.disabled=false; }
}

function populateClassFilter(){
  classFilter.innerHTML = `<option value="">All classes</option>`;
  // prefer classesCache order (explicit class names), fallback to rowsCache
  const classNames = classesCache.length ? classesCache.map(c=>c.name) : Array.from(new Set(allStudents.map(s => s.classId))).sort();
  for(const c of classNames){
    const opt = document.createElement('option'); opt.value = c; opt.textContent = c;
    classFilter.appendChild(opt);
  }
}

async function loadResultsSnapshot(){
  resultsMap = {};
  const resSnap = await getDocs(collection(db,'exams',exam.id,'results'));
  resSnap.forEach(d => resultsMap[d.id] = d.data().marks || {});
}

/* RENDER TABLE
   - headerSubjects: if a class is selected -> intersection (exam.subjects ∩ class.subjects)
                     else -> show all exam.subjects
   - shows a small class header above the table
*/
function renderTable(){
  const q = (searchInput.value || '').trim().toLowerCase();
  const classSel = classFilter.value || '';
  const filtered = rowsCache.filter(s => {
    if(classSel && s.classId !== classSel) return false;
    if(!q) return true;
    return (s.fullName||'').toLowerCase().includes(q) || (s.studentId||'').toLowerCase().includes(q) || (s.phone||'').toLowerCase().includes(q);
  });

  // determine headerSubjects depending on selected class
  let headerSubjects = (exam.subjects || []).slice();
  if(classSel){
    const classDoc = classesCache.find(c => c.name === classSel || c.id === classSel);
    if(classDoc && Array.isArray(classDoc.subjects) && classDoc.subjects.length){
      const classSubNames = new Set(classDoc.subjects);
      const inter = (exam.subjects||[]).filter(s => classSubNames.has(s.name));
      if(inter.length) headerSubjects = inter;
      else headerSubjects = [];
    } else {
      headerSubjects = [];
    }
  }
  if(!headerSubjects || headerSubjects.length === 0) headerSubjects = (exam.subjects || []).slice();

  // labels for linked exam and current exam short label
  const linkedLabel = exam.linkedExamId ? (escapeHtml(exam.linkedExamName || linkedExamName || 'Prev')) : null;
  const examHeaderLabel = escapeHtml(shortLabel(exam.name) || 'Exam');

  // small header showing selected class and quick exam info (published status)
  const classHeaderHtml = `<div style="margin-bottom:8px;display:flex;gap:12px;align-items:center"><div><strong>Class:</strong> ${escapeHtml(classSel || 'All classes')}</div><div style="color:#6b7280;font-size:0.9rem"><strong>Exam:</strong> ${escapeHtml(exam.name || '')}${exam.linkedExamId ? ` • linked: ${linkedLabel}` : ''}</div></div>`;

  // build table header
  let html = classHeaderHtml + `<table><thead><tr><th style="width:48px;text-align:center">Rank</th><th>ID</th><th>Name</th><th style="width:80px">Class</th>`;
  for(const sub of headerSubjects) html += `<th class="subject-header" title="${escapeHtml(sub.name)}">${escapeHtml(shortLabel(sub.name))}</th>`;

// REPLACE occurrences of:
// const comps = exam.components || {};
// WITH:
const comps = Object.assign({ assignment:false, quiz:false, monthly:false, exam:false, cw1:false, cw2:false }, (exam.components || {}));


  if(comps.assignment) html += `<th title="Assignment total">Assn</th>`;
  if(comps.quiz) html += `<th title="Quiz total">Quiz</th>`;
  if(comps.monthly) html += `<th title="Monthly total">Monthly</th>`;
  /* ADD CW1 & CW2 */
  if(comps.cw1)     html += `<th title="CW1 total">CW1</th>`;
  if(comps.cw2)     html += `<th title="CW2 total">CW2</th>`;
  /* existing linked/exam columns follow */
    // linked exam total column (single per-student column)
  if(exam.linkedExamId){
    html += `<th title="Linked exam total">${linkedLabel}</th>`;
  }
  if(comps.exam) html += `<th title="Exam total">${examHeaderLabel}</th>`;

  html += `<th>Total</th><th>Avg</th><th>Actions</th></tr></thead><tbody>`;

  // compute rows with totals to show ranks — use headerSubjects for subject list
  const rowsForRender = computeTotalsForRows(filtered, headerSubjects);

  for(const r of rowsForRender.sortedBySchool){ // sorted by school rank (desc totals)
    html += `<tr data-stu="${escapeHtml(r.studentId)}">`;
    html += `<td style="text-align:center;background:#f3f4f6;font-weight:700">${r.schoolRank}</td>`;
    html += `<td>${escapeHtml(r.studentId)}</td>`;
    html += `<td>${escapeHtml(r.studentName)}</td>`;
    html += `<td style="font-size:0.9rem">${escapeHtml(r.classId)}</td>`;
    // subject cells in headerSubjects order (r.subjects aligns with headerSubjects)
    for(const sub of r.subjects){
      html += `<td style="text-align:center">${escapeHtml(String(sub.mark))}</td>`;
    }
    if(comps.assignment) html += `<td style="text-align:center">${escapeHtml(String(r.compTotals.assignment||0))}</td>`;
    if(comps.quiz) html += `<td style="text-align:center">${escapeHtml(String(r.compTotals.quiz||0))}</td>`;
    if(comps.monthly) html += `<td style="text-align:center">${escapeHtml(String(r.compTotals.monthly||0))}</td>`;
    /* ADD CW1 & CW2 cells */
    if(comps.cw1)     html += `<td style="text-align:center">${escapeHtml(String(r.compTotals.cw1||0))}</td>`;
    if(comps.cw2)     html += `<td style="text-align:center">${escapeHtml(String(r.compTotals.cw2||0))}</td>`;
        if(exam.linkedExamId) html += `<td style="text-align:center">${escapeHtml(String(r.linkedTotal||0))}</td>`;
    if(comps.exam) html += `<td style="text-align:center">${escapeHtml(String(r.compTotals.exam||0))}</td>`;

    html += `<td style="text-align:center">${escapeHtml(String(r.total))}</td>`;
    html += `<td style="text-align:center">${escapeHtml(String(Number(r.average).toFixed(2)))}</td>`;
    html += `<td><button class="btn action-btn btn-primary btn-sm add-edit" data-stu="${escapeHtml(r.studentId)}">Add/Edit</button> <button class="btn btn-ghost btn-sm view" data-stu="${escapeHtml(r.studentId)}">View</button></td>`;
    html += `</tr>`;
  }

  html += `</tbody></table>`;
  studentTableContainer.innerHTML = html;

  // wire actions
  studentTableContainer.querySelectorAll('.add-edit').forEach(b=>{
    b.onclick = async (ev) => {
      const stuId = ev.currentTarget.dataset.stu;
      const student = rowsCache.find(r => r.studentId === stuId);
      if(!student) return alert('Student not found');
      await openStudentEditor(student, exam);
    };
  });

  // VIEW handler — show published snapshot first, fallback to draft + include linked marks if available
  studentTableContainer.querySelectorAll('.view').forEach(b=>{
    b.onclick = async (ev) => {
      const stuId = ev.currentTarget.dataset.stu;
      // try studentsLatest snapshot first (published snapshot)
      const snap = await getDoc(doc(db,'studentsLatest', stuId));
      if(snap.exists()){
        openPreviewModal(snap.data());
        return;
      }
      // otherwise try draft result and fetch student mother name
      const r = await getDoc(doc(db,'exams', exam.id, 'results', stuId));
      if(!r.exists()) return alert('No result saved yet for this student.');
      // fetch student doc to obtain motherName and student full name
      const sSnap = await getDoc(doc(db,'students', stuId));
      const studentDoc = sSnap.exists() ? sSnap.data() : null;

      // try to include linked exam marks (if pre-fetched in linkedTotalsCache)
      const linkedForStudent = linkedTotalsCache[stuId] || {};

      const preview = {
        studentId: stuId,
        studentName: studentDoc ? (studentDoc.fullName || '') : '',
        motherName: studentDoc ? (studentDoc.motherName || '') : '',
        examId: exam.id,
        examName: exam.name,
        linkedExamName: exam.linkedExamName || linkedExamName || null,
        subjects: convertMarksToSubs(r.data().marks || {}, exam, linkedForStudent),
        components: exam.components || {}
      };
      openPreviewModal(preview);
    };
  });
}


/* computeTotalsForRows(studentsList, subjectDefs)
   - subjectDefs: array of subject defs to use for header+calculation (intersection)
*/

function computeTotalsForRows(studentsList, subjectDefs){
  // const comps = exam.components || {};

  const comps = Object.assign(
    { assignment:false, quiz:false, monthly:false, cw1:false, cw2:false, exam:false },
    (exam.components || {})
  );
  
  const arr = [];

  // build rows
  for(const s of studentsList){
    const marks = resultsMap[s.studentId] || {}; // current exam marks
    const linkedForStudent = linkedTotalsCache[s.studentId] || {}; // linked marks (numbers)
    let total = 0;
    let count = 0;
    const subs = [];
// REPLACE:
// const compTotals = { assignment:0, quiz:0, monthly:0, exam:0 };
// WITH:
const compTotals = { assignment:0, quiz:0, monthly:0, cw1:0, cw2:0, exam:0 };
    let linkedTotal = 0;

    const subsToIterate = (subjectDefs && subjectDefs.length) ? subjectDefs : (exam.subjects || []);

    for(const subDef of subsToIterate){
      const subName = subDef.name;
      const max = subDef.max || 100;

      // current exam saved
      const saved = marks[subName];
      let markCur = 0;
      let assignment=0, quiz=0, monthly=0, cw1=0, cw2=0, paper=0;
      
      if(typeof saved === 'number'){
        markCur = Number(saved);
        paper = markCur;
      } else if(typeof saved === 'object' && saved !== null){
        assignment = Number(saved.assignment || 0);
        quiz       = Number(saved.quiz || 0);
        monthly    = Number(saved.monthly || 0);
        cw1        = Number(saved.cw1 || 0);
        cw2        = Number(saved.cw2 || 0);
        paper      = Number(saved.exam || 0);
        markCur = assignment + quiz + monthly + cw1 + cw2 + paper;
      } else {
        // missing saved -> zeros for enabled components
        if(comps.assignment) assignment = 0;
        if(comps.quiz)       quiz = 0;
        if(comps.monthly)    monthly = 0;
        if(comps.cw1)        cw1 = 0;
        if(comps.cw2)        cw2 = 0;
        if(comps.exam)       paper = 0;
        markCur = assignment + quiz + monthly + cw1 + cw2 + paper;
      }
      
      if(markCur > max) markCur = max;

      // linked exam mark (if available) - default 0
      const linkedVal = linkedForStudent[subName] ? Number(linkedForStudent[subName]) : 0;
      const linkedMax = linkedSubjectsMeta[subName] || 0;

      // combined mark for display: linked + current (bounded)
      const combinedMark = Math.min(markCur + linkedVal, (linkedMax + max) || (linkedMax ? linkedMax + max : 100));

      // accumulate linked total (sum of linked parts for the headerSubjects)
      linkedTotal += linkedVal;

      // component totals (current exam only)
      if(comps.assignment) compTotals.assignment += assignment;
      if(comps.quiz)       compTotals.quiz += quiz;
      if(comps.monthly)    compTotals.monthly += monthly;
      if(comps.cw1)        compTotals.cw1 += cw1;
      if(comps.cw2)        compTotals.cw2 += cw2;
      if(comps.exam)       compTotals.exam += paper;

      subs.push({
        name: subName,
        mark: Math.round(combinedMark),
        linked: linkedVal,
        cur: Math.round(markCur),
        max: (linkedMax + max) || max
      });

      total += combinedMark;
      count++;
    }

    const average = count ? (total / count) : 0;

    arr.push({
      studentId: s.studentId,
      studentName: s.fullName || '',
      motherName: s.motherName || '',
      classId: s.classId || '',
      total: Math.round(total),
      average: Number(average.toFixed(2)),
      subjects: subs,
      compTotals,
      linkedTotal: Math.round(linkedTotal)
    });
  }

  // compute dense school ranks (1,1,2 when tie)
  const sorted = arr.slice().sort((a,b) => b.total - a.total || a.studentId.localeCompare(b.studentId));
  let schoolRank = 0;
  let prevTotal = null;
  for(let i=0;i<sorted.length;i++){
    if(prevTotal === null || sorted[i].total !== prevTotal){
      schoolRank++;
      prevTotal = sorted[i].total;
    }
    sorted[i].schoolRank = schoolRank;
  }

  // compute dense class ranks
  const byClass = {};
  sorted.forEach(r => {
    if(!byClass[r.classId]) byClass[r.classId] = [];
    byClass[r.classId].push(r);
  });
  Object.keys(byClass).forEach(cls => {
    const list = byClass[cls].slice().sort((a,b)=> b.total - a.total || a.studentId.localeCompare(b.studentId));
    let cr = 0; let prevC = null;
    for(let i=0;i<list.length;i++){
      if(prevC === null || list[i].total !== prevC){ cr++; prevC = list[i].total; }
      list[i].classRank = cr;
    }
    // write back classRank to matching items in sorted
    list.forEach(item => {
      const idx = sorted.findIndex(x => x.studentId === item.studentId);
      if(idx !== -1) sorted[idx].classRank = item.classRank;
    });
  });

  // ensure arr items have schoolRank/classRank: map from sorted
  const mapped = sorted.map(r => {
    // ensure original subject order preserved (we already used subjectDefs order)
    return r;
  });

  return { all: mapped, sortedBySchool: mapped };
}

function showToast(msg, t = 1600){
  let c = document.getElementById('examToastContainer');
  if(!c){
    c = document.createElement('div');
    c.id = 'examToastContainer';
    c.style.position = 'fixed';
    c.style.right = '18px';
    c.style.bottom = '18px';
    c.style.zIndex = 99999;
    document.body.appendChild(c);
  }
  const el = document.createElement('div');
  el.style.background = 'rgba(0,0,0,0.85)';
  el.style.color = '#fff';
  el.style.padding = '8px 12px';
  el.style.marginTop = '8px';
  el.style.borderRadius = '6px';
  el.style.boxShadow = '0 6px 18px rgba(0,0,0,0.18)';
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(()=> { el.style.transition='opacity 220ms'; el.style.opacity='0'; setTimeout(()=>el.remove(),240); }, t);
}

/* ----------------------
   EXPORT helpers (class-aware subjects)
   ---------------------- */

function openExportModal(){
  exportExamNameEl.textContent = exam.name || exam.id || '';
  exportModalBackdrop.style.display = 'flex';
}

// compute headerSubjects similarly to renderTable but using classFilter value at time of export

function computeHeaderSubjectsForExport(){
  const classSel = classFilter.value || '';
  let headerSubjects = (exam.subjects || []).slice();
  if(classSel){
    const classDoc = classesCache.find(c => c.name === classSel || c.id === classSel);
    if(classDoc && Array.isArray(classDoc.subjects) && classDoc.subjects.length){
      const classSubNames = new Set(classDoc.subjects);
      const inter = (exam.subjects||[]).filter(s => classSubNames.has(s.name));
      if(inter.length) headerSubjects = inter;
      else headerSubjects = [];
    } else {
      headerSubjects = [];
    }
  }
  if(!headerSubjects || headerSubjects.length === 0) headerSubjects = (exam.subjects || []).slice();
  return headerSubjects;
}


// gather export rows (respects current classFilter and search)
function gatherExportRows(){
  const q = (searchInput.value || '').trim().toLowerCase();
  const classSel = classFilter.value || '';
  const filtered = rowsCache.filter(s => {
    if(classSel && s.classId !== classSel) return false;
    if(!q) return true;
    return (s.fullName||'').toLowerCase().includes(q) || (s.studentId||'').toLowerCase().includes(q) || (s.phone||'').toLowerCase().includes(q);
  });

  const headerSubjects = computeHeaderSubjectsForExport();
  const computed = computeTotalsForRows(filtered, headerSubjects);
  // produce rows ordered by schoolRank ascending
  return computed.sortedBySchool.map(r => {
    return {
      schoolRank: r.schoolRank,
      classRank: r.classRank,
      studentId: r.studentId,
      studentName: r.studentName,
      motherName: r.motherName || '',
      classId: r.classId,
      subjects: r.subjects, // array in headerSubjects order
      compTotals: r.compTotals,
      linkedTotal: r.linkedTotal || 0,
      total: r.total,
      average: r.average
    };
  });
}

/* CSV generation */
/* CSV generation */
async function downloadCSV(rows, includeHeader=true){
  const subjectDefs = computeHeaderSubjectsForExport() || [];
  const subjectNames = subjectDefs.map(s=> s.name );
  const linkedLabel = exam.linkedExamId ? (exam.linkedExamName || linkedExamName || 'Prev') : null;
  const examHeaderLabel = shortLabel(exam.name) || 'Exam';

  // header columns
  const header = ['Rank','ID','Name','Class', ...subjectNames];
  if(exam.components?.monthly) header.push('Monthly');
  if(exam.components?.cw1) header.push('CW1');
  if(exam.components?.cw2) header.push('CW2');
  if(linkedLabel) header.push(linkedLabel);
  if(exam.components?.exam) header.push(examHeaderLabel);
  header.push('Total','Avg (%)');

  const lines = [];
  if(includeHeader){
    lines.push(`"${escapeCsv(exam.name || '')}","${escapeCsv(exam.id || '')}"`);
    const classSel = classFilter.value || '';
    if(classSel) lines.push(`Class: "${escapeCsv(classSel)}"`);
    lines.push('');
  }

  lines.push(header.map(escapeCsv).join(','));

  for(const r of rows){
    const subjectMarks = subjectDefs.map(sd=>{
      const found = (r.subjects || []).find(s=> s.name === sd.name);
      return (found ? String(found.mark) : '0');
    });

    const monthly = (r.compTotals && r.compTotals.monthly) ? r.compTotals.monthly : 0;
    const cw1tot  = (r.compTotals && r.compTotals.cw1) ? r.compTotals.cw1 : 0;
    const cw2tot  = (r.compTotals && r.compTotals.cw2) ? r.compTotals.cw2 : 0;
    const examComp = (r.compTotals && r.compTotals.exam) ? r.compTotals.exam : 0;

    // percent calculation: use subject max values from r.subjects
    const sumMax = (r.subjects || []).reduce((a,s)=> a + (s.max || 0), 0) || 0;
    const percent = sumMax ? (Number(r.total) / sumMax * 100) : 0;
    const percentStr = percent.toFixed(2);

    const cols = [
      r.schoolRank,
      r.studentId,
      r.studentName,
      r.classId,
      ...subjectMarks
    ];
    if(exam.components?.monthly) cols.push(monthly);
    if(exam.components?.cw1)     cols.push(cw1tot);
    if(exam.components?.cw2)     cols.push(cw2tot);
    if(linkedLabel)             cols.push(r.linkedTotal || 0);
    if(exam.components?.exam)   cols.push(examComp);
    cols.push(r.total, percentStr);

    lines.push(cols.map(escapeCsv).join(','));
  }

  if(includeHeader){
    lines.push('');
    lines.push(`Generated by al fatxi school, ${new Date().toLocaleString('en-GB', { hour12:false })}`);
  }

  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const fname = `${(exam.name||'exam').replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.csv`;
  triggerDownload(blob, fname);
}





function escapeCsv(v){
  if(v == null) return '';
  const s = String(v);
  if(s.includes('"')) return `"${s.replace(/"/g,'""')}"`;
  if(s.includes(',') || s.includes('\n')) return `"${s}"`;
  return s;
}
function triggerDownload(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* PDF generation using jsPDF + autotable (class-aware subject list, includes Mother) */



async function downloadPDF(rows, includeHeader=true){
  const subjectDefs = computeHeaderSubjectsForExport() || [];
  const subjectCols = subjectDefs.map(s=> ({ header: shortLabel(s.name), dataKey: s.name }) );
  const linkedLabel = exam.linkedExamId ? (exam.linkedExamName || linkedExamName || 'Prev') : null;
  const examHeaderLabel = shortLabel(exam.name) || 'Exam';

  const cols = [
    { header: 'Rank', dataKey: 'rank' },
    { header: 'ID', dataKey: 'id' },
    { header: 'Name', dataKey: 'name' },
    { header: 'Class', dataKey: 'class' },
    ...subjectCols
  ];
  if(exam.components?.monthly) cols.push({ header: 'Monthly', dataKey: 'monthly' });
  if(exam.components?.cw1)     cols.push({ header: 'CW1', dataKey: 'cw1' });
  if(exam.components?.cw2)     cols.push({ header: 'CW2', dataKey: 'cw2' });
  if(linkedLabel)              cols.push({ header: linkedLabel, dataKey: 'linked' });
  if(exam.components?.exam)   cols.push({ header: examHeaderLabel, dataKey: 'exam' });
  cols.push({ header: 'Total', dataKey: 'total' }, { header: 'Avg (%)', dataKey: 'percent' });

  const data = rows.map(r=>{
    const obj = {
      rank: r.schoolRank,
      id: r.studentId,
      name: r.studentName,
      class: r.classId
    };
    for(const sd of subjectDefs){
      const found = (r.subjects || []).find(s => s.name === sd.name);
      obj[sd.name] = found ? String(found.mark) : '0';
    }
    if(exam.components?.monthly) obj['monthly'] = r.compTotals.monthly || 0;
    if(exam.components?.cw1)     obj['cw1'] = r.compTotals.cw1 || 0;
    if(exam.components?.cw2)     obj['cw2'] = r.compTotals.cw2 || 0;
    if(linkedLabel)             obj['linked'] = r.linkedTotal || 0;
    if(exam.components?.exam)   obj['exam'] = r.compTotals.exam || 0;
    obj['total'] = r.total;
    const sumMax = (r.subjects || []).reduce((a,s)=> a + (s.max || 0), 0) || 0;
    const percent = sumMax ? (Number(r.total) / sumMax * 100) : 0;
    obj['percent'] = percent.toFixed(2);
    return obj;
  });

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'l', unit: 'pt', format: 'a4' });
  const margin = 40;
  let cursorY = 40;

  if(includeHeader){
    try {
      const imgData = await getImageDataUrl('assets/logo.png');
      if(imgData){
        const imgW = 60; const imgH = 60;
        doc.addImage(imgData, 'PNG', margin, cursorY, imgW, imgH);
        doc.setFontSize(16);
        doc.text('al fatxi school', margin + imgW + 12, cursorY + 20);
        doc.setFontSize(11);
        doc.text(`${exam.name || ''}${exam.id ? ' — '+exam.id : ''}`, margin + imgW + 12, cursorY + 40);
      } else {
        doc.setFontSize(16);
        doc.text('al fatxi school', margin, cursorY);
        doc.setFontSize(11);
        doc.text(`${exam.name || ''}${exam.id ? ' — '+exam.id : ''}`, margin, cursorY + 18);
      }
    } catch(e){
      doc.setFontSize(16);
      doc.text('al fatxi school', margin, cursorY);
      doc.setFontSize(11);
      doc.text(`${exam.name || ''}${exam.id ? ' — '+exam.id : ''}`, margin, cursorY + 18);
    }
    cursorY += 70;
  }

  doc.setFontSize(8);

  const autoCols = cols.map(c => ({ header: c.header, dataKey: c.dataKey }));

  const columnStyles = {};
  autoCols.forEach((c) => {
    const key = c.dataKey;
    if(key === 'id') columnStyles[key] = { cellWidth: 50 };
    else if(key === 'rank') columnStyles[key] = { cellWidth: 30 };
    else if(key === 'class') columnStyles[key] = { cellWidth: 60, halign: 'center' };
    else if(subjectDefs.find(sd => sd.name === key)) columnStyles[key] = { cellWidth: 40, halign: 'center' };
    else if(['monthly','cw1','cw2','exam','linked','total','percent'].includes(key)) columnStyles[key] = { cellWidth: 50, halign: 'center' };
    else columnStyles[key] = { cellWidth: 'auto' };
  });

  doc.autoTable({
    startY: cursorY,
    head: [autoCols.map(c => c.header)],
    body: data.map(row => autoCols.map(c => row[c.dataKey])),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [240,240,240], textColor: [20,20,20], fontStyle: 'bold' },
    columnStyles: columnStyles,
    margin: { left: margin, right: margin }
  });

  const dateStr = new Date().toLocaleString('en-GB', { hour12:false });
  const foot = `Generated by al fatxi school — ${dateStr}`;
  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 20 : doc.internal.pageSize.getHeight() - 40;
  doc.setFontSize(9);
  doc.text(foot, margin, finalY);

  const fname = `${(exam.name||'exam').replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(fname);
}



// helper to fetch image and convert to dataURL
async function getImageDataUrl(url){
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const dataURL = canvas.toDataURL('image/png');
          resolve(dataURL);
        } catch(e){
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url + (url.indexOf('?')===-1 ? '?_=' + Date.now() : '&_=' + Date.now());
    } catch(e){
      resolve(null);
    }
  });
}

/* Remaining editor functions (Add/Edit, preview, convert, publish) */

/* Open student editor - show mother's name in title and ensure subject intersection for that student */
/* Open student editor - show mother's name in title and ensure subject intersection for that student */
function openStudentEditor(student, exam){
  stuModalBackdrop.style.display = 'flex';
  const momLine = student.motherName ? ` — Ina Hooyo: ${escapeHtml(student.motherName)}` : '';
  const classLine = student.classId ? ` — Class: ${escapeHtml(student.classId)}` : '';
  stuModalTitle.textContent = `Add/Edit — ${student.fullName} (${student.studentId})${classLine}${momLine}`;

  (async ()=>{
    let classDoc = classesCache.find(c => c.name === student.classId || c.id === student.classId) || null;

    let classSubjects = [];
    if(classDoc && Array.isArray(classDoc.subjects) && classDoc.subjects.length){
      classSubjects = classDoc.subjects.slice();
    } else {
      classSubjects = [];
    }

    const enabledSubjects = (exam.subjects || []).filter(s => classSubjects.includes(s.name));
    const toShow = enabledSubjects;
    // const comps = exam.components || {};

    const comps = Object.assign(
      { assignment:false, quiz:false, monthly:false, cw1:false, cw2:false, exam:false },
      (exam.components || {})
    );

    
    let html = `<div><strong>${escapeHtml(student.fullName)}</strong> — ${escapeHtml(student.studentId)}<div style="margin-top:6px"><strong>Exam:</strong> ${escapeHtml(exam.name)}</div></div>`;

    if(!classSubjects.length){
      html += `<div style="margin-top:10px;color:#b91c1c">This student's class has no subjects assigned. Please assign subjects to the class first (Classes → Edit).</div>`;
      stuModalBody.innerHTML = html;
      return;
    }

    if(toShow.length === 0){
      const missingList = classSubjects.length ? `<div style="margin-top:8px">Class subjects not included in this exam: <strong>${classSubjects.map(ms=>escapeHtml(ms)).join(', ')}</strong></div>` : '';
      html += `<div style="margin-top:10px;color:#b91c1c">No common subjects between this student's class and the selected exam.${missingList}<div style="margin-top:8px"><button id="openEditExamQuick" class="btn btn-ghost btn-sm">Edit exam & check subjects</button></div></div>`;
      stuModalBody.innerHTML = html;
      const btn = document.getElementById('openEditExamQuick');
      if(btn) btn.onclick = ()=> { openEditExamModal({ target: { dataset: { id: exam.id } } }); };
      return;
    }

    // fetch linked marks for this student (if exam.linkedExamId)
    let linkedMarksForStudent = {};
    if(exam.linkedExamId){
      // prefer published snapshot in linkedTotalsCache
      linkedMarksForStudent = linkedTotalsCache[student.studentId] || {};
      // fallback: try draft results for linked exam (if not in cache or empty)
      if(Object.keys(linkedMarksForStudent).length === 0){
        try {
          const rld = await getDoc(doc(db,'exams', exam.linkedExamId, 'results', student.studentId));
          if(rld.exists()){
            const mm = rld.data().marks || {};
            for(const k of Object.keys(mm)){
              const v = mm[k];
              if(typeof v === 'number') linkedMarksForStudent[k] = Number(v);
              else if(typeof v === 'object' && v !== null) linkedMarksForStudent[k] = (Number(v.assignment||0) + Number(v.quiz||0) + Number(v.monthly||0) + Number(v.cw1||0) + Number(v.cw2||0) +  Number(v.exam||0));
            }
          }
        } catch(e){
          console.warn('Linked fallback read failed', e);
        }
      }
    }

    
    html += `<form id="stuResForm" style="margin-top:10px"><div style="display:grid;gap:8px">`;
    for(const s of toShow){
      const sid = safeId(s.name);
      const max = s.max || 100;
      // linked preview (if exists)
      const linkedVal = linkedMarksForStudent[s.name] || 0;
      const linkedNote = exam.linkedExamId ? `<div style="font-size:0.9rem;color:#374151;margin-bottom:6px">Prev (linked): <strong>${linkedVal}</strong> (max ${linkedSubjectsMeta[s.name] || '-'})</div>` : '';
      html += `<div style="border:1px solid #f3f4f6;padding:8px;border-radius:6px">
        <div style="display:flex;justify-content:space-between"><strong>${escapeHtml(s.name)}</strong><div style="font-size:0.85rem;color:#6b7280">Max ${max}</div></div>
        ${linkedNote}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">`;
        // when generating each component input include data attributes for clamp logic
        if(comps.assignment) html += `<div><div class="compact-label">Assignment</div><input class="component-input" id="in_${sid}_assignment" data-sub="${escapeHtml(s.name)}" data-comp="assignment" data-max="${max}" data-linked="${linkedVal}" type="number" min="0" /></div>`;
        if(comps.quiz)       html += `<div><div class="compact-label">Quiz</div><input class="component-input" id="in_${sid}_quiz" data-sub="${escapeHtml(s.name)}" data-comp="quiz" data-max="${max}" data-linked="${linkedVal}" type="number" min="0" /></div>`;
        if(comps.monthly)    html += `<div><div class="compact-label">Monthly</div><input class="component-input" id="in_${sid}_monthly" data-sub="${escapeHtml(s.name)}" data-comp="monthly" data-max="${max}" data-linked="${linkedVal}" type="number" min="0" /></div>`;
        if(comps.cw1)        html += `<div><div class="compact-label">CW1</div><input class="component-input" id="in_${sid}_cw1" data-sub="${escapeHtml(s.name)}" data-comp="cw1" data-max="${max}" data-linked="${linkedVal}" type="number" min="0" /></div>`;
        if(comps.cw2)        html += `<div><div class="compact-label">CW2</div><input class="component-input" id="in_${sid}_cw2" data-sub="${escapeHtml(s.name)}" data-comp="cw2" data-max="${max}" data-linked="${linkedVal}" type="number" min="0" /></div>`;
  
        if(comps.exam)       html += `<div><div class="compact-label">Exam</div><input class="component-input" id="in_${sid}_exam" data-sub="${escapeHtml(s.name)}" data-comp="exam" data-max="${max}" data-linked="${linkedVal}" type="number" min="0" /></div>`;
  
      html += `<div style="display:flex;flex-direction:column;justify-content:center"><div class="compact-label">Total</div><div id="preview_${sid}">0</div></div>`;
      html += `</div></div>`;
    }
    html += `</div><div style="margin-top:10px;display:flex;gap:8px"><button id="saveStudentRes" class="btn btn-primary">Save</button><button id="cancelStudentRes" type="button" class="btn btn-ghost">Cancel</button></div></form>`;
    stuModalBody.innerHTML = html;

        // --- attach live clamp handlers for all newly created component inputs
        (function attachClamps(){
          const compNames = ['assignment','quiz','monthly','cw1','cw2','exam'];
          const inputs = Array.from(document.querySelectorAll('#stuResForm .component-input'));
          function clampAndPreview(el){
            const sub = el.dataset.sub;
            const comp = el.dataset.comp;
            const max = Number(el.dataset.max || 100);
            // sum other current component values
            let sumOther = 0;
            for(const name of compNames){
              if(name === comp) continue;
              const other = document.querySelector(`#stuResForm input[data-sub="${sub}"][data-comp="${name}"]`);
              if(other && other.value) sumOther += Number(other.value || 0);
            }
            // allowed remaining for this field
            const allowed = Math.max(0, max - sumOther);
            if(Number(el.value || 0) > allowed){
              el.value = String(allowed);
            }
            // update preview display for this subject
            updatePreview(sub, max, exam);
          }
    
          inputs.forEach(inp => {
            // enforce numeric and clamp while typing
            inp.addEventListener('input', (ev) => {
              // ensure non-negative integer-ish value
              if(ev.target.value === '') { updatePreview(ev.target.dataset.sub, Number(ev.target.dataset.max||100), exam); return; }
              if(isNaN(Number(ev.target.value))) { ev.target.value = '0'; }
              if(Number(ev.target.value) < 0) ev.target.value = '0';
              clampAndPreview(ev.target);
            }, { passive:false });
    
            // when created, call once to ensure preview shows current value
            clampAndPreview(inp);
          });
        })();
    
    // populate existing marks: only for the intersection subjects (toShow)
    const rSnap = await getDoc(doc(db,'exams', exam.id, 'results', student.studentId));
    const savedMarks = rSnap.exists() ? (rSnap.data().marks || {}) : {};

    for(const s of toShow){
      const sid = safeId(s.name);
      const v = savedMarks[s.name];
      if(typeof v === 'number'){
        // previous format: whole-number stored — treat as exam
        const elExam = document.getElementById(`in_${sid}_exam`);
        if(elExam) elExam.value = String(v);
      } else if(typeof v === 'object' && v !== null){
        for(const comp of ['assignment','quiz','monthly','cw1','cw2','exam']){
          const el = document.getElementById(`in_${sid}_${comp}`);
          if(el) el.value = (v[comp] != null) ? String(v[comp]) : '';
        }
      }
      updatePreview(s.name, s.max || 100, exam);
    }
    

    // listeners to update preview
    for(const s of toShow){
      const sid = safeId(s.name);
      ['assignment','quiz','monthly','cw1','cw2','exam'].forEach(comp=>{
        const el = document.getElementById(`in_${sid}_${comp}`);
        if(el) el.oninput = ()=> updatePreview(s.name, s.max || 100, exam);
      });
    }
    

    document.getElementById('cancelStudentRes').onclick = ()=> { stuModalBackdrop.style.display='none'; stuModalBody.innerHTML=''; };
    document.getElementById('saveStudentRes').onclick = async (ev) => {
      ev.preventDefault();
    
      // build marks same as before
      const marks = {};
      for(const s of toShow){
        const sid = safeId(s.name);
        let compObj = {};
        let isObject = false;
        let subTotal = 0;
        // include cw1 & cw2
        for(const comp of ['assignment','quiz','monthly','cw1','cw2','exam']){
          if(!comps[comp]) continue;
          const el = document.getElementById(`in_${sid}_${comp}`);
          const val = el && el.value ? Number(el.value) : 0;
          compObj[comp] = val;
          subTotal += val;
          isObject = true;
        }
      
        // If over subject max, reduce the last editable component (prefer exam -> cw2 -> cw1)
        const subjectMax = (s.max || 100);
        if(subTotal > subjectMax){
          const lastTry = ['exam','cw2','cw1','monthly','quiz','assignment'];
          const lastComp = lastTry.find(c => comps[c] && document.getElementById(`in_${sid}_${c}`));
          if(lastComp){
            const lastEl = document.getElementById(`in_${sid}_${lastComp}`);
            const sumOther = subTotal - (lastEl && lastEl.value ? Number(lastEl.value) : 0);
            const allowedLast = Math.max(0, subjectMax - sumOther);
            if(lastEl){
              lastEl.value = String(Math.min(Number(lastEl.value||0), allowedLast));
              compObj[lastComp] = Number(lastEl.value||0);
            }
            // recompute subTotal after clamp
            subTotal = Object.keys(compObj).reduce((acc,k)=> acc + (Number(compObj[k]||0)), 0);
          }
          showToast(`${s.name} total limited to ${subjectMax}`, 3000);
        }
      
        // store either object (if components enabled) or a number fallback
        if(isObject) marks[s.name] = compObj;
        else marks[s.name] = Math.min(Number(document.getElementById(`in_${sid}_exam`)?.value||0), subjectMax);
      }
      
      
    
      // OPTIMISTIC UI: update local map and re-render immediately so the user sees instant feedback
      resultsMap[student.studentId] = marks;
      renderTable();
    
      // close modal right away
      stuModalBackdrop.style.display = 'none';
      stuModalBody.innerHTML = '';
    
      // show saving toast
      showToast('Saving...', 2000);
    
      // persist to Firestore (do not block UI)
      try {
        await setDoc(doc(db,'exams', exam.id, 'results', student.studentId), { studentId: student.studentId, marks, savedAt: Timestamp.now() });
        showToast('Saved', 1800);
    
        // if exam already published, recompute published totals (notify user, runs async)
        if(exam.status === 'published'){
          showToast('Updating published totals...', 2000);
          publishExamLocal(exam.id)
            .then(async () => {
              await loadResultsSnapshot();
              renderTable();
              showToast('Published totals updated', 2200);
            })
            .catch(err => {
              console.error('publishExamLocal failed', err);
              showToast('Publish update failed', 3000);
            });
        }
      } catch (err) {
        console.error('Save failed', err);
        showToast('Save failed', 3500);
        // on failure you may want to re-load the saved value from server or mark row as stale
        // Re-fetch results for this student:
        try {
          const rSnap = await getDoc(doc(db,'exams', exam.id, 'results', student.studentId));
          resultsMap[student.studentId] = rSnap.exists() ? (rSnap.data().marks || {}) : {};
          renderTable();
        } catch(e){ console.warn('reload after save fail', e); }
      }
    };
    
  })();
}



function updatePreview(subName, max, exam){
  const comps = Object.assign(
    { assignment:false, quiz:false, monthly:false, cw1:false, cw2:false, exam:false },
    (exam.components || {})
  );
  let total = 0;
  const sid = safeId(subName);
  // iterate enabled components including cw1/cw2
  const compOrder = ['assignment','quiz','monthly','cw1','cw2','exam'];
  const presentComps = compOrder.filter(c => comps[c]);

  for(const comp of presentComps){
    const el = document.getElementById(`in_${sid}_${comp}`);
    const val = el && el.value ? Number(el.value) : 0;
    total += val;
  }

  if(total > max){
    // try to find last changed component in this order (prefer exam then cw2,cw1,monthly,quiz,assignment)
    const lastCompOrder = ['exam','cw2','cw1','monthly','quiz','assignment'];
    const lastComp = lastCompOrder.find(c => presentComps.includes(c) && document.getElementById(`in_${sid}_${c}`) && document.getElementById(`in_${sid}_${c}`).value);
    if(lastComp){
      const lastEl = document.getElementById(`in_${sid}_${lastComp}`);
      const sumOther = total - (lastEl && lastEl.value ? Number(lastEl.value) : 0);
      const allowedLast = Math.max(0, max - sumOther);
      lastEl.value = String(Math.min(Number(lastEl.value||0), allowedLast));
      // recompute total
      total = presentComps.reduce((acc,c) => {
        const e = document.getElementById(`in_${sid}_${c}`);
        return acc + (e && e.value ? Number(e.value) : 0);
      }, 0);
    } else {
      total = max;
    }
  }

  const preview = document.getElementById(`preview_${sid}`);
  if(preview) preview.textContent = String(total);
}




function openPreviewModal(snapshot){
  stuModalBackdrop.style.display = 'flex';
  // include mother's name if available
  const motherLine = snapshot.motherName ? `<div style="margin-top:6px"><strong>Ina Hooyo:</strong> ${escapeHtml(snapshot.motherName)}</div>` : '';
  stuModalTitle.innerHTML = `${escapeHtml(snapshot.examName || snapshot.examId || 'Exam')} — ${escapeHtml(snapshot.studentName || snapshot.studentId || '')}${motherLine ? '' : ''}`;

  const subs = snapshot.subjects || [];
  // detect if any subject has linked data or snapshot has linkedExamName
  const hasLinked = (snapshot.linkedExamName || (subs.some(s => s.components && s.components.linked)));

  // components enabled for current exam snapshot (may be null)
  const compsEnabled = snapshot.components || {};

  const linkedLabel = snapshot.linkedExamName || linkedExamName || 'Prev';

  let html = `<div style="font-size:0.95rem"><div style="margin-bottom:8px"><strong>Exam:</strong> ${escapeHtml(snapshot.examName || snapshot.examId || '')}</div>`;
  if(snapshot.motherName) html += `<div style="margin-bottom:6px"><strong>Ina Hooyo:</strong> ${escapeHtml(snapshot.motherName)}</div>`;

  html += `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th>Subject</th>`;
  if(hasLinked) html += `<th>${escapeHtml(linkedLabel)}</th>`;
  if(compsEnabled.assignment) html += `<th>Assignment</th>`;
  if(compsEnabled.quiz)       html += `<th>Quiz</th>`;
  if(compsEnabled.monthly)    html += `<th>Monthly</th>`;
  if(compsEnabled.cw1)        html += `<th>CW1</th>`;
  if(compsEnabled.cw2)        html += `<th>CW2</th>`;
  if(compsEnabled.exam)       html += `<th>Exam</th>`;
  
  html += `<th>Total</th><th>Max</th></tr></thead><tbody>`;

  let totGot = 0, totMax = 0;
  for(const s of subs){
    const comps = s.components || {};
    const combinedMark = typeof s.mark !== 'undefined' ? Number(s.mark) : (Number(s.total || 0));
    let componentSum = 0;
    if(typeof s.mark === 'undefined'){
      if(comps.assignment != null) componentSum += Number(comps.assignment);
      else if(s.assignment != null) componentSum += Number(s.assignment);
      if(comps.quiz != null) componentSum += Number(comps.quiz);
      else if(s.quiz != null) componentSum += Number(s.quiz);
      if(comps.monthly != null) componentSum += Number(comps.monthly);
      else if(s.monthly != null) componentSum += Number(s.monthly);

      if(comps.cw1 != null) componentSum += Number(comps.cw1);
else if(s.cw1 != null) componentSum += Number(s.cw1);
if(comps.cw2 != null) componentSum += Number(comps.cw2);
else if(s.cw2 != null) componentSum += Number(s.cw2);


      if(comps.exam != null) componentSum += Number(comps.exam);
      else if(s.exam != null) componentSum += Number(s.exam);
    }
    const rowTotal = (typeof s.mark !== 'undefined') ? combinedMark : componentSum;
    const rowMax = Number(s.max || 0);

    html += `<tr><td style="padding:6px">${escapeHtml(s.name)}</td>`;
    if(hasLinked){
      const prev = (s.components && s.components.linked && (typeof s.components.linked.total !== 'undefined')) ? s.components.linked.total : (s.components && typeof s.components.linked === 'number' ? s.components.linked : '-');
      html += `<td style="text-align:center">${escapeHtml(prev != null ? String(prev) : '-')}</td>`;
    }

    if(compsEnabled.assignment) html += `<td style="text-align:center">${escapeHtml(comps.assignment != null ? String(comps.assignment) : (s.assignment != null ? String(s.assignment) : '-'))}</td>`;
    if(compsEnabled.quiz)       html += `<td style="text-align:center">${escapeHtml(comps.quiz != null ? String(comps.quiz) : (s.quiz != null ? String(s.quiz) : '-'))}</td>`;
    if(compsEnabled.monthly)    html += `<td style="text-align:center">${escapeHtml(comps.monthly != null ? String(comps.monthly) : (s.monthly != null ? String(s.monthly) : '-'))}</td>`;
    if(compsEnabled.cw1)        html += `<td style="text-align:center">${escapeHtml(comps.cw1 != null ? String(comps.cw1) : (s.cw1 != null ? String(s.cw1) : '-'))}</td>`;
    if(compsEnabled.cw2)        html += `<td style="text-align:center">${escapeHtml(comps.cw2 != null ? String(comps.cw2) : (s.cw2 != null ? String(s.cw2) : '-'))}</td>`;
    if(compsEnabled.exam)       html += `<td style="text-align:center">${escapeHtml(comps.exam != null ? String(comps.exam) : (s.exam != null ? String(s.exam) : '-'))}</td>`;
    

    html += `<td style="text-align:center">${escapeHtml(String(rowTotal))}</td><td style="text-align:center">${escapeHtml(String(rowMax||''))}</td></tr>`;

    totGot += Number(rowTotal || 0);
    totMax += Number(rowMax || 0);
  }

  html += `</tbody></table></div>`;
  const percent = totMax ? (totGot / totMax * 100) : 0;
  const grade = gradeForPercent(percent);
  const passfail = percent >= 50 ? 'Pass' : 'Fail';
  html += `<div style="margin-top:8px"><strong>Total:</strong> ${totGot} / ${totMax} &nbsp;&nbsp; <strong>Percent:</strong> ${percent.toFixed(2)}% &nbsp;&nbsp; <strong>Grade:</strong> ${grade} &nbsp;&nbsp; <strong>Status:</strong> ${passfail}</div>`;
  html += `<div style="margin-top:8px"><button id="closePreview" class="btn btn-ghost">Close</button></div></div>`;

  stuModalBody.innerHTML = html;
  document.getElementById('closePreview').onclick = ()=> { stuModalBackdrop.style.display='none'; stuModalBody.innerHTML=''; };
}



function convertMarksToSubs(marks, exam, linkedMarks = {}) {
  const subs = [];
  const compsEnabled = exam.components || {};

  for(const sub of (exam.subjects || [])) {
    const name = sub.name;
    const saved = marks[name];
    const comp = {};
    let curTotal = 0;

    // populate component values (current exam)
if(typeof saved === 'number') {
  if(compsEnabled && Object.keys(compsEnabled).length) {
    if(compsEnabled.exam) comp.exam = Number(saved);
    else comp.total = Number(saved);
  } else {
    comp.total = Number(saved);
  }
  curTotal = Number(saved);
} else if(typeof saved === 'object' && saved !== null) {
  comp.assignment = Number(saved.assignment || 0);
  comp.quiz       = Number(saved.quiz || 0);
  comp.monthly    = Number(saved.monthly || 0);
  comp.cw1        = Number(saved.cw1 || 0);
  comp.cw2        = Number(saved.cw2 || 0);
  comp.exam       = Number(saved.exam || 0);
  curTotal = (comp.assignment || 0) + (comp.quiz || 0) + (comp.monthly || 0) + (comp.cw1 || 0) + (comp.cw2 || 0) + (comp.exam || 0);
} else {
  // no saved -> zeros for enabled components
  if(compsEnabled.assignment) comp.assignment = 0;
  if(compsEnabled.quiz) comp.quiz = 0;
  if(compsEnabled.monthly) comp.monthly = 0;
  if(compsEnabled.cw1) comp.cw1 = 0;
  if(compsEnabled.cw2) comp.cw2 = 0;
  if(compsEnabled.exam) comp.exam = 0;
  curTotal = (comp.assignment || 0) + (comp.quiz || 0) + (comp.monthly || 0) + (comp.cw1 || 0) + (comp.cw2 || 0) + (comp.exam || 0);
}


    // linked marks (if present)
    const linkedVal = Number(linkedMarks[name] || 0);
    if(linkedVal) {
      comp.linked = { total: linkedVal, max: (linkedSubjectsMeta[name] || 0) };
    }

    // IMPORTANT: set subject.mark to combined (current + linked)
    const combined = curTotal + linkedVal;

    subs.push({
      name,
      mark: Math.round(combined),
      max: (sub.max || 100) + (linkedSubjectsMeta[name] || 0),
      components: comp
    });
  }

  return subs;
}

function gradeForPercent(p){
  if(p >= 97) return 'A+';
  if(p >= 93) return 'A';
  if(p >= 90) return 'A-';
  if(p >= 87) return 'B+';
  if(p >= 83) return 'B';
  if(p >= 80) return 'B-';
  if(p >= 77) return 'C+';
  if(p >= 73) return 'C';
  if(p >= 70) return 'C-';
  if(p >= 67) return 'D+';
  if(p >= 63) return 'D';
  if(p >= 60) return 'D-';
  if(p >= 50) return 'E+';
  if(p >= 40) return 'E';
  return 'F';
}

function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }

/* publishExamLocal - computes totals and writes examTotals + studentsLatest
   Uses per-student intersection: exam.subjects ∩ class.subjects
*/
/* publishExamLocal - computes totals and writes examTotals + studentsLatest
   Uses per-student intersection: exam.subjects ∩ class.subjects
   Ensures no undefined values are written to Firestore and includes cw1/cw2.
*/
async function publishExamLocal(examIdToPublish){
  const exSnap = await getDoc(doc(db,'exams', examIdToPublish));
  if(!exSnap.exists()) throw new Error('Exam not found');
  const examDoc = { id: exSnap.id, ...exSnap.data() };

  // load students and classes once
  const studentsSnap = await getDocs(collection(db,'students'));
  const studentsList = studentsSnap.docs.map(d => ({ id:d.id, ...d.data() }));

  const classesSnap = await getDocs(collection(db,'classes'));
  const classesMap = {};
  classesSnap.forEach(d => { const data = d.data(); classesMap[data.name] = data; });

  // load results subcollection (current exam drafts)
  const resultsSnap = await getDocs(collection(db,'exams',examIdToPublish,'results'));
  const studentResults = {};
  resultsSnap.forEach(d => studentResults[d.id] = d.data().marks || {});

  // if linked exam exists, prefetch its published examTotals and subject meta
  let linkedTotals = {}; // studentId -> { subjectName -> value }
  const linkedSubjects = {}; // name -> max
  let linkedExamNameLocal = null;
  if(examDoc.linkedExamId){
    try {
      const linkedSnap = await getDoc(doc(db,'exams', examDoc.linkedExamId));
      if(linkedSnap.exists()){
        const linkedEx = linkedSnap.data();
        linkedExamNameLocal = linkedEx.name || linkedEx.linkedExamName || null;
        (linkedEx.subjects || []).forEach(s => linkedSubjects[s.name] = s.max || 0);
      }
      const q = query(collection(db,'examTotals'), where('examId','==', examDoc.linkedExamId));
      const snap = await getDocs(q);
      snap.forEach(d => {
        const data = d.data();
        const sid = data.studentId;
        if(!linkedTotals[sid]) linkedTotals[sid] = {};
        (data.subjects || []).forEach(s => {
          // ensure numeric
          linkedTotals[sid][s.name] = Number(s.mark ?? s.total ?? 0);
        });
      });
    } catch(err){
      console.warn('Could not prefetch linked totals:', err);
    }
  }

  const allowedClasses = examDoc.classes && examDoc.classes.length ? examDoc.classes : null;
  const totals = [];

  for(const s of studentsList){
    if(s.status === 'deleted') continue;
    if(allowedClasses && !allowedClasses.includes(s.classId)) continue;

    const classDoc = classesMap[s.classId] || null;
    const classSubjectNames = classDoc && Array.isArray(classDoc.subjects) ? new Set(classDoc.subjects) : null;

    // studentSubjectsDefs -> strict intersection preserving exam order; fallback to exam subjects
    let studentSubjectsDefs;
    if(classSubjectNames){
      studentSubjectsDefs = (examDoc.subjects || []).filter(sd => classSubjectNames.has(sd.name));
      if(!studentSubjectsDefs || studentSubjectsDefs.length === 0) studentSubjectsDefs = (examDoc.subjects || []).slice();
    } else {
      studentSubjectsDefs = (examDoc.subjects || []).slice();
    }

    const marks = studentResults[s.studentId] || {};
    const linkedForStudent = linkedTotals[s.studentId] || {};
    let total = 0; let count = 0;
    const subs = [];

    for(const sub of studentSubjectsDefs){
      // current exam part (include cw1/cw2)
      let curSubTotal = 0;
      let assignment = 0, quiz = 0, monthly = 0, cw1 = 0, cw2 = 0, paper = 0;
      const savedVal = marks[sub.name];
      if (typeof savedVal === 'number'){
        // legacy numeric -> treat as exam score
        paper = Number(savedVal);
        curSubTotal = paper;
      } else if (typeof savedVal === 'object' && savedVal !== null){
        assignment = Number(savedVal.assignment || 0);
        quiz       = Number(savedVal.quiz || 0);
        monthly    = Number(savedVal.monthly || 0);
        cw1        = Number(savedVal.cw1 || 0);
        cw2        = Number(savedVal.cw2 || 0);
        paper      = Number(savedVal.exam || 0);
        curSubTotal = assignment + quiz + monthly + cw1 + cw2 + paper;
      } else {
        // components enabled -> treat missing as zero
        if (examDoc.components?.assignment) assignment = 0;
        if (examDoc.components?.quiz)       quiz = 0;
        if (examDoc.components?.monthly)    monthly = 0;
        if (examDoc.components?.cw1)        cw1 = 0;
        if (examDoc.components?.cw2)        cw2 = 0;
        if (examDoc.components?.exam)       paper = 0;
        curSubTotal = assignment + quiz + monthly + cw1 + cw2 + paper;
      }

      const curMax = sub.max || 100;
      if(curSubTotal > curMax) curSubTotal = curMax;

      // linked part
      let linkedPart = 0;
      let linkedMax = 0;
      if(examDoc.linkedExamId){
        linkedMax = linkedSubjects[sub.name] || 0;
        linkedPart = Number(linkedForStudent[sub.name] || 0);
      }

      // combined (capped to linkedMax + curMax)
      const combinedTotal = Math.min(curSubTotal + linkedPart, (linkedMax + curMax) || 100);

      // build components object using definite numeric values (no undefined)
      const componentsObj = {
        assignment: Number(assignment || 0),
        quiz: Number(quiz || 0),
        monthly: Number(monthly || 0),
        cw1: Number(cw1 || 0),
        cw2: Number(cw2 || 0),
        exam: Number(paper || 0)
      };
      if(linkedPart > 0){
        componentsObj.linked = { total: Number(linkedPart), max: Number(linkedMax || 0) };
      }

      subs.push({
        name: sub.name,
        mark: Number(Math.round(combinedTotal)),
        max: Number((linkedMax + curMax) || 100),
        components: componentsObj
      });

      total += combinedTotal; count++;
    }

    const average = count ? (total / count) : 0;
    totals.push({
      studentId: s.studentId,
      studentName: s.fullName,
      motherName: s.motherName || '',
      classId: s.classId,
      total: Number(Math.round(total)),
      average: Number(Number(average).toFixed(2)),
      subjects: subs
    });
  }

  // ranks (dense)
  totals.sort((a,b)=> b.total - a.total);
  let schoolRank = 0, prev = null;
  for(let i=0;i<totals.length;i++){
    if(prev === null || totals[i].total !== prev){ schoolRank++; prev = totals[i].total; }
    totals[i].schoolRank = schoolRank;
  }
  const byClass = {};
  totals.forEach(t=>{ if(!byClass[t.classId]) byClass[t.classId]=[]; byClass[t.classId].push(t); });
  Object.keys(byClass).forEach(cls=>{
    byClass[cls].sort((a,b)=> b.total - a.total);
    let cr = 0, prevC = null;
    for(let i=0;i<byClass[cls].length;i++){
      if(prevC === null || byClass[cls][i].total !== prevC){ cr++; prevC = byClass[cls][i].total; }
      byClass[cls][i].classRank = cr;
    }
  });

  // write examTotals and studentsLatest (include linkedExamId/name)
  const writes = [];
  for(const t of totals){
    const examTotalsId = `${examIdToPublish}_${t.studentId}`;

    // Build payload with only definite numeric values (avoid undefined)
    const payload = {
      examId: examIdToPublish,
      examName: examDoc.name || '',
      linkedExamId: examDoc.linkedExamId || null,
      linkedExamName: examDoc.linkedExamId ? (examDoc.linkedExamName || linkedExamNameLocal || null) : null,
      components: examDoc.components || {},
      studentId: t.studentId,
      studentName: t.studentName || '',
      motherName: t.motherName || '',
      classId: t.classId || '',
      className: t.classId || '',
      subjects: t.subjects || [],
      total: Number(t.total || 0),
      average: Number(t.average || 0),
      classRank: Number(t.classRank || 0),
      schoolRank: Number(t.schoolRank || 0),
      publishedAt: Timestamp.now()
    };

    writes.push(setDoc(doc(db,'examTotals', examTotalsId), payload));
    writes.push(setDoc(doc(db,'studentsLatest', t.studentId), payload));
  }

  // also persist linkedExamName onto the exams doc if we fetched it — helps future reads
  try {
    const examUpdate = { status:'published', publishedAt: Timestamp.now() };
    if(examDoc.linkedExamId && linkedExamNameLocal){
      examUpdate.linkedExamName = linkedExamNameLocal;
    } else if(examDoc.linkedExamId && examDoc.linkedExamName){
      examUpdate.linkedExamName = examDoc.linkedExamName;
    }
    writes.push(updateDoc(doc(db,'exams',examIdToPublish), examUpdate));
  } catch(e){
    writes.push(updateDoc(doc(db,'exams',examIdToPublish), { status:'published', publishedAt: Timestamp.now() }));
  }

  await Promise.all(writes);
}




init().catch(err => { console.error(err); alert('Error loading exam editor: '+err.message); });

/* small utility: short labels for subject headers */
function shortLabel(name){
  if(!name) return '';
  const map = {
    'Mat': 'Mat', 'Mathematics':'Mat', 'Somali':'Soo', 'Soomaali':'Soo',
    'English':'Eng','Physics':'Phy','Biology':'Bio','Chemistry':'Che',
    'Arabic':'Ara','Business':'Bus','Computer':'Tec','ICT':'Tec','Technology':'Tec','Taarikh':'Tar','History':'Tar',
    'Juq':'Juq','Taa':'Taa'
  };
  if(map[name]) return map[name];
  return name.slice(0,3);
}

