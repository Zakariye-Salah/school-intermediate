// teacher.js — updated per your requests
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
// import {
//   collection, query, where, getDocs, getDoc, doc, setDoc, Timestamp
// } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

// ---------- QUIZ: teacher side (Firestore collection: 'quizzes', responses: 'quiz_responses') ----------
import {
  collection,
  addDoc,
  setDoc,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp
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

const tabQuizzes = document.getElementById('tabQuizzes');
const pageQuizzes = document.getElementById('pageTeacherQuizzes');


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

  if(tab === 'quizzes'){
    tabQuizzes.classList.add('active');
    pageQuizzes.style.display = 'block';
    renderTeacherQuizzesPage(); // will be added below
    return;
  }
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
tabQuizzes && (tabQuizzes.onclick = () => showTab('quizzes'));
tabTeacherAnnouncements.onclick = () => showTab('announcements');
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
function formatLeftHMS(ms){
  if(!ms || ms<=0) return '00:00:00';
  const s = Math.floor(ms/1000); const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); const r = s%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
}


// helper: only subjects of selected class that teacher is assigned to
function subjectsForClassForCurrentTeacher(classNameOrId){
  const classDoc = (classesCache||[]).find(c => (c.name===classNameOrId || c.id===classNameOrId));
  if(!classDoc) return [];
  const classSubjects = Array.isArray(classDoc.subjects) ? classDoc.subjects.map(String) : [];
  return (currentTeacher.subjects||[]).filter(s => classSubjects.includes(s));
}

// renderTeacherQuizzesPage — full updated version (live time-left + Add time button)
async function renderTeacherQuizzesPage(){
  const listEl = document.getElementById('teacherQuizzesList');
  const filterEl = document.getElementById('quizFilterClass');
  if(!listEl || !filterEl) return;

  // populate class filter (teacher classes only)
  filterEl.innerHTML = '<option value="__all">All your classes</option>';
  (currentTeacher.classes||[]).forEach(c => {
    const o = document.createElement('option'); o.value = c; o.textContent = c; filterEl.appendChild(o);
  });

  try {
    // load quizzes ordered by createdAt desc
    const snap = await getDocs(query(collection(db,'quizzes'), orderBy('createdAt','desc')));
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // scope: teacher sees quizzes where createdBy === teacher OR quiz.classId in teacher.classes
    const mySet = docs.filter(x =>
      (x.createdBy === currentTeacher.id) ||
      ((x.classId || '') && (currentTeacher.classes||[]).includes(String(x.classId)))
    );

    function renderListFor(filterClass){
      const rows = mySet.filter(q => filterClass === '__all' ? true : String(q.classId) === String(filterClass));
      if(rows.length === 0){
        listEl.innerHTML = '<div class="muted">No quizzes found.</div>';
        return;
      }

      // Build row HTML (table-like card rows)
      listEl.innerHTML = rows.map(q => {
        const subj = q.subjectName || (subjectsCache.find(s=>s.id===q.subjectId)||{}).name || '—';
        const totalPoints = (q.questions||[]).reduce((s,qq) => s + (qq.points||1),0);

        const toMs = (ts) => {
          if(!ts) return null;
          if(typeof ts === 'number') return Number(ts);
          if(ts.seconds) return Number(ts.seconds) * 1000;
          const p = Date.parse(ts); return isNaN(p) ? null : p;
        };
        const startMs = toMs(q.startAt) || toMs(q.createdAt) || null;
        const endMsExplicit = toMs(q.endAt) || null;
        const durMs = (Number(q.durationMinutes) || 0) * 60 * 1000;
        const endMs = endMsExplicit || (startMs ? startMs + durMs : null);
        const left = endMs ? Math.max(0, endMs - Date.now()) : null;
        const leftText = left === null ? '—' : formatLeftHMS(left);

        return `
          <div class="quiz-row-teacher" data-quizid="${escapeHtml(q.id)}" style="padding:10px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center">
            <div style="min-width:0">
              <div style="font-weight:800">${escapeHtml(q.title || '(untitled)')}</div>
              <div class="muted" style="font-size:13px">ID: ${escapeHtml(q.id)} • Class: ${escapeHtml(q.classId||'—')} • Subject: ${escapeHtml(subj)}</div>
              <div class="muted" style="font-size:13px">Duration: ${q.durationMinutes||0}m · Questions: ${ (q.questions||[]).length } · Points: ${ totalPoints }</div>
              <div style="margin-top:6px" class="muted small">Time left: <span class="teacher-time-left" data-end="${endMs||0}">${escapeHtml(leftText)}</span></div>
            </div>

            <div style="display:flex;gap:8px;align-items:center">
              <div>${q.active ? `<span style="color:#0ea5e9;font-weight:700">Active</span>` : `<span class="muted">Inactive</span>`}</div>
              <button class="btn btn-ghost btn-sm open-quiz" data-id="${escapeHtml(q.id)}">Open</button>
              <button class="btn btn-ghost btn-sm edit-quiz" data-id="${escapeHtml(q.id)}">Edit</button>
              <button class="btn btn-ghost btn-sm history-quiz" data-id="${escapeHtml(q.id)}">History</button>
              <button class="btn ${q.active ? 'btn-ghost' : 'btn-primary'} btn-sm toggle-quiz" data-id="${escapeHtml(q.id)}">${q.active ? 'Deactivate' : 'Activate'}</button>
              <button class="btn btn-sm btn-outline add-time" data-id="${escapeHtml(q.id)}">+ Add time</button>
              <button class="btn btn-danger btn-sm del-quiz" data-id="${escapeHtml(q.id)}">Delete</button>
            </div>
          </div>
        `;
      }).join('');

      // wire actions
      listEl.querySelectorAll('.open-quiz').forEach(b => b.onclick = ev => openViewQuizModal(ev.currentTarget.dataset.id));
      listEl.querySelectorAll('.edit-quiz').forEach(b => b.onclick = ev => openEditQuizModal(ev.currentTarget.dataset.id));
      listEl.querySelectorAll('.history-quiz').forEach(b => b.onclick = ev => openQuizHistoryModal(ev.currentTarget.dataset.id));
      listEl.querySelectorAll('.toggle-quiz').forEach(b => b.onclick = ev => toggleActivateQuiz(ev.currentTarget.dataset.id));
      listEl.querySelectorAll('.del-quiz').forEach(b => b.onclick = ev => deleteQuiz(ev.currentTarget.dataset.id));
      listEl.querySelectorAll('.add-time').forEach(b => b.onclick = ev => addExtraTime(ev.currentTarget.dataset.id));

      // ensure live teacher ticker runs (update every second)
      if(window._teacherTimeTicker) clearInterval(window._teacherTimeTicker);
      window._teacherTimeTicker = setInterval(() => {
        document.querySelectorAll('.teacher-time-left').forEach(el => {
          const end = Number(el.dataset.end || 0);
          if(!end || end <= 0){ el.textContent = '—'; return; }
          const left = end - Date.now();
          if(left <= 0){ el.textContent = '00:00:00'; }
          else {
            el.textContent = formatLeftHMS(left);
          }
        });
      }, 1000);
    }

    filterEl.onchange = () => renderListFor(filterEl.value || '__all');
    renderListFor('__all');

  } catch(err){
    console.error('renderTeacherQuizzesPage', err);
    listEl.innerHTML = `<div class="muted">Failed to load quizzes.</div>`;
  }
}


// ---------- create / edit modal ----------
// openCreateQuizModal (mobile-friendly, sticky footer)
async function openCreateQuizModal(prefill){
  const classOptions = (currentTeacher.classes||[]).map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  const defaultClass = (prefill && prefill.classId) ? prefill.classId : (currentTeacher.classes && currentTeacher.classes[0]) || '';

  const html = `
    <div style="display:flex;flex-direction:column;max-height:80vh">
      <div style="overflow:auto;padding:10px">
        <label>Title</label><input id="quizTitle" value="${escapeHtml(prefill?.title||'')}" />
        <label style="margin-top:8px">Class</label>
        <select id="quizClass">${classOptions}</select>

        <label style="margin-top:8px">Subject (only your assigned subjects for selected class)</label>
        <select id="quizSubject"></select>

        <label style="margin-top:8px">Duration (minutes)</label>
        <input id="quizDuration" type="number" min="1" value="${prefill?.durationMinutes || 30}" />

        <div style="display:flex;gap:8px;margin-top:8px">
          <label><input id="randQuestions" type="checkbox" /> Randomize questions</label>
          <label><input id="randChoices" type="checkbox" /> Randomize choices</label>
        </div>

        <div id="questionsEditor" style="margin-top:12px"></div>
      </div>

      <div style="position:sticky;bottom:0;background:var(--card,#fff);padding:10px;border-top:1px solid #eee;display:flex;justify-content:flex-end;gap:8px">
        <button id="cancelQuiz" class="btn btn-ghost">Cancel</button>
        <button id="addQuestionBtn" class="btn btn-ghost">+ Add question</button>
        <button id="saveQuizBtn" class="btn btn-primary">Save quiz</button>
      </div>
    </div>
  `;
  showModal('Create quiz', html);
  modalBody.querySelector('#quizClass').value = defaultClass;

  function refreshSubjectOptions(){
    const cls = modalBody.querySelector('#quizClass').value;
    const opts = subjectsForClassForCurrentTeacher(cls).map(s => {
      const docS = subjectsCache.find(x => x.name === s || x.id === s);
      const label = docS ? (docS.name || s) : s;
      const val = docS ? docS.id : s;
      return `<option value="${escapeHtml(val)}">${escapeHtml(label)}</option>`;
    }).join('');
    modalBody.querySelector('#quizSubject').innerHTML = opts || '<option value="">(no subjects assigned)</option>';
  }
  refreshSubjectOptions();
  modalBody.querySelector('#quizClass').onchange = refreshSubjectOptions;

  // questions editor
  const questions = [{ text:'Example: 1+2 = ?', choices:['1','2','3','4'], correctIndex:2, points:1 }];
  function renderQuestionsEditor(questionsArr = []) {
    const root = modalBody.querySelector('#questionsEditor');
    if(!questionsArr.length){ root.innerHTML = `<div class="muted">No questions yet.</div>`; return; }
    root.innerHTML = questionsArr.map((q,i)=> {
      const choicesHtml = (q.choices||[]).map((c,ci)=>`<div style="display:flex;gap:8px;align-items:center"><input name="q${i}_choice" data-q="${i}" data-c="${ci}" type="radio" ${q.correctIndex===ci ? 'checked':''} /> <input class="choiceText" data-q="${i}" data-c="${ci}" value="${escapeHtml(c||'')}" /></div>`).join('');
      return `<div style="border:1px dashed #e6eef8;padding:8px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between"><div style="font-weight:700">Q${i+1}</div><div><button class="btn btn-ghost btn-sm remove-question" data-i="${i}">Remove</button></div></div>
        <div style="margin-top:6px"><input class="qText" data-q="${i}" value="${escapeHtml(q.text||'')}" style="width:100%" /></div>
        <div style="margin-top:6px">Points: <input type="number" class="qPoints" data-q="${i}" value="${q.points||1}" min="0" style="width:80px" /></div>
        <div style="margin-top:8px">${choicesHtml}</div>
        <div style="margin-top:6px"><button class="btn btn-ghost btn-sm add-choice" data-q="${i}">+ Choice</button></div>
      </div>`;
    }).join('');

    // wire
    root.querySelectorAll('.remove-question').forEach(b => b.onclick = () => { questionsArr.splice(Number(b.dataset.i),1); renderQuestionsEditor(questionsArr); });
    root.querySelectorAll('.add-choice').forEach(b => b.onclick = () => { const qi = Number(b.dataset.q); questionsArr[qi].choices = questionsArr[qi].choices || []; questionsArr[qi].choices.push('New choice'); renderQuestionsEditor(questionsArr); });
    root.querySelectorAll('.choiceText').forEach(inp => inp.oninput = () => { const qi = Number(inp.dataset.q), ci = Number(inp.dataset.c); questionsArr[qi].choices[ci] = inp.value; });
    root.querySelectorAll('.qText').forEach(inp => inp.oninput = () => { questionsArr[Number(inp.dataset.q)].text = inp.value; });
    root.querySelectorAll('.qPoints').forEach(inp => inp.oninput = () => { questionsArr[Number(inp.dataset.q)].points = Number(inp.value) || 0; });
    root.querySelectorAll(`input[name^="q"]`).forEach(r => r.onchange = () => { const qi = Number(r.dataset.q), ci = Number(r.dataset.c); questionsArr[qi].correctIndex = ci; });
  }
  renderQuestionsEditor(questions);

  modalBody.querySelector('#addQuestionBtn').onclick = () => { questions.push({ text:'New question', choices:['Option A','Option B'], correctIndex:0, points:1 }); renderQuestionsEditor(questions); };
  modalBody.querySelector('#cancelQuiz').onclick = closeModal;

  modalBody.querySelector('#saveQuizBtn').onclick = async () => {
    const btn = modalBody.querySelector('#saveQuizBtn'); setButtonLoading(btn, true, 'Saving...');
    try {
      const title = (modalBody.querySelector('#quizTitle').value||'').trim();
      const classId = modalBody.querySelector('#quizClass').value;
      const subjectId = modalBody.querySelector('#quizSubject').value;
      const durationMinutes = Number(modalBody.querySelector('#quizDuration').value) || 30;
      const randomizeQuestions = modalBody.querySelector('#randQuestions').checked;
      const randomizeChoices = modalBody.querySelector('#randChoices').checked;
      if(!title || !classId || !subjectId){ toast('Title, class and subject are required'); setButtonLoading(btn,false); return; }

      const qs = questions.map(q => ({ text: (q.text||'').toString(), choices: (q.choices||[]).map(c=> (c||'').toString()), correctIndex: Number(q.correctIndex||0), points: Number(q.points||1) }));
      const docObj = {
        title, classId, subjectId,
        durationMinutes, randomizeQuestions, randomizeChoices,
        questions: qs,
        active: false,
        createdBy: currentTeacher.id,
        createdAt: Timestamp.now()
      };
      await addDoc(collection(db,'quizzes'), docObj);
      toast('Quiz created');
      closeModal();
      await renderTeacherQuizzesPage();
    } catch(e){
      console.error('saveQuiz failed', e); toast('Failed to save quiz');
    } finally { setButtonLoading(btn,false); }
  };
}

// showEditQuizModalFull — edit existing quiz (same mobile-friendly layout)
async function showEditQuizModalFull(qdoc){
  // qdoc: { id, title, classId, subjectId, durationMinutes, randomizeQuestions, randomizeChoices, questions }
  const classOptions = (currentTeacher.classes||[]).map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  const html = `
    <div style="display:flex;flex-direction:column;max-height:80vh">
      <div style="overflow:auto;padding:10px">
        <label>Title</label><input id="e_quizTitle" value="${escapeHtml(qdoc.title||'')}" />
        <label style="margin-top:8px">Class</label>
        <select id="e_quizClass">${classOptions}</select>

        <label style="margin-top:8px">Subject</label><select id="e_quizSubject"></select>

        <label style="margin-top:8px">Duration (minutes)</label><input id="e_quizDuration" type="number" min="1" value="${qdoc.durationMinutes||30}" />

        <div style="display:flex;gap:8px;margin-top:8px">
          <label><input id="e_randQuestions" type="checkbox" ${qdoc.randomizeQuestions ? 'checked' : ''} /> Randomize questions</label>
          <label><input id="e_randChoices" type="checkbox" ${qdoc.randomizeChoices ? 'checked' : ''} /> Randomize choices</label>
        </div>

        <div id="e_questionsEditor" style="margin-top:12px"></div>
      </div>

      <div style="position:sticky;bottom:0;background:var(--card,#fff);padding:10px;border-top:1px solid #eee;display:flex;justify-content:flex-end;gap:8px">
        <button id="e_cancelQuiz" class="btn btn-ghost">Cancel</button>
        <button id="e_saveQuizBtn" class="btn btn-primary">Save changes</button>
      </div>
    </div>
  `;
  showModal('Edit quiz', html);
  modalBody.querySelector('#e_quizClass').value = qdoc.classId || '';

  function refreshSubjectOptionsE(){
    const cls = modalBody.querySelector('#e_quizClass').value;
    const opts = subjectsForClassForCurrentTeacher(cls).map(s => {
      const docS = subjectsCache.find(x => x.name === s || x.id === s);
      const label = docS ? (docS.name || s) : s;
      const val = docS ? docS.id : s;
      return `<option value="${escapeHtml(val)}">${escapeHtml(label)}</option>`;
    }).join('');
    modalBody.querySelector('#e_quizSubject').innerHTML = opts || '<option value="">(no subjects)</option>';
    modalBody.querySelector('#e_quizSubject').value = qdoc.subjectId || '';
  }
  refreshSubjectOptionsE();
  modalBody.querySelector('#e_quizClass').onchange = refreshSubjectOptionsE;

  // render existing questions
  const questions = JSON.parse(JSON.stringify(qdoc.questions || []));
  function renderQuestionsEditorE(){
    const root = modalBody.querySelector('#e_questionsEditor');
    if(!questions.length){ root.innerHTML = `<div class="muted">No questions</div>`; return; }
    root.innerHTML = questions.map((q,i)=>`<div style="border:1px dashed #eee;padding:8px;margin-bottom:6px">
      <div style="display:flex;justify-content:space-between"><div style="font-weight:700">Q${i+1}</div><div><button class="e_remove_q btn btn-ghost btn-sm" data-i="${i}">Remove</button></div></div>
      <div style="margin-top:6px"><input class="e_qText" data-q="${i}" value="${escapeHtml(q.text||'')}" style="width:100%"/></div>
      <div style="margin-top:6px">Points: <input class="e_qPoints" data-q="${i}" value="${q.points||1}" style="width:80px" type="number" min="0"/></div>
      <div style="margin-top:6px">${(q.choices||[]).map((c,ci)=>`<div style="display:flex;gap:8px;align-items:center"><input name="e_q${i}_choice" data-q="${i}" data-c="${ci}" type="radio" ${q.correctIndex===ci ? 'checked':''}/> <input class="e_choiceText" data-q="${i}" data-c="${ci}" value="${escapeHtml(c||'')}" /></div>`).join('')}</div>
      <div style="margin-top:6px"><button class="e_add_choice btn btn-ghost btn-sm" data-q="${i}">+ Choice</button></div>
    </div>`).join('');
    root.querySelectorAll('.e_remove_q').forEach(b=>b.onclick=()=>{questions.splice(Number(b.dataset.i),1);renderQuestionsEditorE();});
    root.querySelectorAll('.e_add_choice').forEach(b=>b.onclick=()=>{const qi=Number(b.dataset.q);questions[qi].choices.push('New');renderQuestionsEditorE();});
    root.querySelectorAll('.e_choiceText').forEach(inp=>inp.oninput=()=>{questions[Number(inp.dataset.q)].choices[Number(inp.dataset.c)] = inp.value;});
    root.querySelectorAll('.e_qText').forEach(inp=>inp.oninput=()=>{questions[Number(inp.dataset.q)].text = inp.value;});
    root.querySelectorAll('.e_qPoints').forEach(inp=>inp.oninput=()=>{questions[Number(inp.dataset.q)].points = Number(inp.value)||0;});
    root.querySelectorAll(`input[name^="e_q"]`).forEach(r=>r.onchange=()=>{const qi=Number(r.dataset.q), ci=Number(r.dataset.c);questions[qi].correctIndex = ci;});
  }
  renderQuestionsEditorE();

  modalBody.querySelector('#e_cancelQuiz').onclick = closeModal;
  modalBody.querySelector('#e_saveQuizBtn').onclick = async () => {
    const btn = modalBody.querySelector('#e_saveQuizBtn'); setButtonLoading(btn,true,'Saving...');
    try {
      const title = (modalBody.querySelector('#e_quizTitle').value||'').trim();
      const classId = modalBody.querySelector('#e_quizClass').value;
      const subjectId = modalBody.querySelector('#e_quizSubject').value;
      const durationMinutes = Number(modalBody.querySelector('#e_quizDuration').value) || 30;
      const randomizeQuestions = modalBody.querySelector('#e_randQuestions').checked;
      const randomizeChoices = modalBody.querySelector('#e_randChoices').checked;
      if(!title || !classId || !subjectId){ toast('Title/class/subject required'); setButtonLoading(btn,false); return; }

      // ensure update path uses doc(db,'quizzes', id)
      await updateDoc(doc(db,'quizzes', qdoc.id), {
        title, classId, subjectId, durationMinutes, randomizeQuestions, randomizeChoices, questions, updatedAt: Timestamp.now()
      });
      toast('Quiz updated');
      closeModal();
      await renderTeacherQuizzesPage();
    } catch(e){ console.error('update quiz', e); toast('Failed to update'); }
    setButtonLoading(btn,false);
  };
}



async function openEditQuizModal(quizId){
  try {
    const snap = await getDoc(doc(db,'quizzes', quizId));
    if(!snap.exists()) return toast('Quiz not found');
    const qdoc = { id: snap.id, ...snap.data() };
    // open dedicated edit modal for updates
    showEditQuizModalFull(qdoc);
  } catch(e){ console.error(e); toast('Failed to load quiz'); }
}



// ensure button opens the create-quiz modal
try {
  const newQuizBtn = document.getElementById('btnNewQuiz');
  if (newQuizBtn) {
    newQuizBtn.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        // openCreateQuizModal should exist in this file
        if (typeof openCreateQuizModal === 'function') {
          openCreateQuizModal({});
        } else {
          console.error('openCreateQuizModal is not defined');
          toast('Quiz editor not available (function missing).');
        }
      } catch (err) {
        console.error('Failed to open quiz modal', err);
        toast('Failed to open quiz editor');
      }
    });
  } else {
    console.warn('#btnNewQuiz not found in DOM');
  }
} catch (err) {
  console.error('btnNewQuiz wiring error', err);
}



// ---------- delete ----------
async function deleteQuiz(id){
  const ok = await modalConfirm('Delete quiz','Delete permanently? This will remove all students references.');
  if(!ok) return;
  try {
    await deleteDoc(doc(db,'quizzes', id));
    toast('Deleted');
    await renderTeacherQuizzesPage();
  } catch(e){ console.error(e); toast('Delete failed'); }
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
async function openViewQuizModal(id){
  const snap = await getDoc(doc(db,'quizzes', id));
  if(!snap.exists()) return toast('Not found');
  const qd = { id: snap.id, ...snap.data() };
  // counts: total students in class, submissions, pending
  const classStudents = studentsCache.filter(s => String(s.classId||s.class||s.className||'') === String(qd.classId||''));
  const totalStudents = classStudents.length;
  const respSnap = await getDocs(query(collection(db,'quiz_responses'), where('quizId','==', qd.id)));
  const totalSubmitted = respSnap.size;
  const notSubmitted = totalStudents - totalSubmitted;
  const html = `
    <div>
      <div style="font-weight:800">${escapeHtml(qd.title)}</div>
      <div class="muted">Quiz ID: ${qd.id} · Class: ${escapeHtml(qd.classId||'')} · Subject: ${escapeHtml(qd.subjectName||'')}</div>
      <div style="margin-top:8px">Duration: ${qd.durationMinutes} minutes</div>
      <div style="margin-top:8px">Total students: ${totalStudents} · Submitted: ${totalSubmitted} · Not yet: ${notSubmitted}</div>
      <div style="margin-top:12px;text-align:right">
        <button id="openQuizHistoryInView" class="btn btn-ghost">Open history</button>
        <button id="closeViewQuiz" class="btn btn-ghost">Close</button>
      </div>
    </div>
  `;
  showModal(`Quiz — ${escapeHtml(qd.title)}`, html);
  modalBody.querySelector('#closeViewQuiz').onclick = closeModal;
  modalBody.querySelector('#openQuizHistoryInView').onclick = () => { closeModal(); openQuizHistoryModal(qd.id); };
}


// openQuizHistoryModal — single column layout (header -> summary -> students list with rank)
async function openQuizHistoryModal(quizId){
  const snap = await getDoc(doc(db,'quizzes',quizId));
  if(!snap.exists()) return toast('Quiz not found');
  const qd = { id: snap.id, ...snap.data() };

  // fetch responses ordered by score desc for ranking
  const respSnap = await getDocs(query(collection(db,'quiz_responses'), where('quizId','==', quizId), orderBy('score','desc')));
  const responses = respSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // compute question-level summary (percent correct)
  const questions = qd.questions || [];
  const qStats = questions.map((q,i)=>({ index:i, total:0, correct:0 }));
  responses.forEach(r => {
    (r.answers||[]).forEach((a, ai) => {
      qStats[ai] = qStats[ai] || { index: ai, total:0, correct:0 };
      qStats[ai].total++;
      if(typeof a.selectedIndex !== 'undefined' && a.selectedIndex === (questions[ai]?.correctIndex)) qStats[ai].correct++;
    });
  });
  const summaryHtml = qStats.map(s => {
    const pct = s.total ? Math.round((s.correct/s.total)*100) : 0;
    const qtxt = escapeHtml(questions[s.index]?.text || `Q${s.index+1}`);
    return `<div style="padding:6px;border-bottom:1px solid #f1f5f9"><div style="font-weight:700">${qtxt}</div><div class="muted">${pct}% correct (${s.correct}/${s.total})</div></div>`;
  }).join('') || `<div class="muted">No question data yet.</div>`;

  // students list (rank, name, id, class, score, view)
  const studentsHtml = responses.map((r, idx) => {
    const name = escapeHtml(r.studentName || r.studentId || 'Student');
    const sid = escapeHtml(r.studentId || '');
    const cls = escapeHtml(r.classId || '');
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

  // header details (single column)
  const subj = qd.subjectName || (subjectsCache.find(s=>s.id===qd.subjectId)||{}).name || '—';
  const status = qd.active ? '<span style="color:#0ea5e9;font-weight:700">Active</span>' : '<span class="muted">Inactive</span>';
  const html = `
    <div style="max-height:80vh;overflow:auto;padding:10px">
      <div style="margin-bottom:8px">
        <div style="font-weight:900">${escapeHtml(qd.title)}</div>
        <div class="muted small">Quiz ID: ${qd.id} • Class: ${escapeHtml(qd.classId||'')} • Subject: ${escapeHtml(subj)} • ${status}</div>
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

  // wire Add time and Close
  document.getElementById('qhClose').onclick = closeModal;
  document.getElementById('qhAddTime').onclick = async () => {
    closeModal();
    await addExtraTime(qd.id); // uses your existing addExtraTime helper
  };

  // wire view buttons for each response
  modalBody.querySelectorAll('.view-resp').forEach(b => b.onclick = async (ev) => {
    const rid = ev.currentTarget.dataset.id;
    const rdoc = await getDoc(doc(db,'quiz_responses',rid));
    if(!rdoc.exists()) return toast('Response not found');
    const r = { id: rdoc.id, ...rdoc.data() };
    // show a simple response modal with summary + optional per-question details
    const answersHtml = (r.answers || []).map((a,i)=> {
      const q = questions[i] || {};
      const sel = typeof a.selectedIndex !== 'undefined' ? a.selectedIndex : null;
      const correctIdx = q.correctIndex;
      const choiceText = sel!==null && q.choices ? escapeHtml(q.choices[sel]||'') : '<em>Skipped</em>';
      const correctText = (q.choices && typeof correctIdx!=='undefined') ? escapeHtml(q.choices[correctIdx]||'') : '—';
      const pts = (sel === correctIdx) ? (q.points||1) : 0;
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

// small fallback helpers (safe to keep)
function setButtonLoading(btn, isLoading, text) {
  if (!btn) return;
  if (isLoading) {
    btn.dataset._orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = text || '...';
  } else {
    btn.disabled = false;
    if (btn.dataset._orig) { btn.innerHTML = btn.dataset._orig; delete btn.dataset._orig; }
  }
}

async function modalConfirm(title, htmlMessage) {
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
