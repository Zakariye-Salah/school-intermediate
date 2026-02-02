// app.js - header/sidebar + role gating (drop into project)
// Improvements:
// - Detects role using both uid and email when available
// - Uses cached role for instant UI and only overrides with server result if server returns non-guest
// - Persists verifiedDisplayName in localStorage for instant name display
// - Adds mobile Academics toggle wiring
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

const pageMapCandidates = {
  dashboard: ['pageDashboard'],
  students: ['pageStudents'],
  teachers: ['pageTeachers'],
  classes: ['pageClasses'],
  payments: ['pagePayments'],
  subjects: ['pageSubjects'],
  exams: ['pageExams'],
  announcements: ['pageAnnouncements'],
  attendance: ['pageAttendance'],
  quizzes: ['pageQuizzes'],
  recycle: ['pageRecycle'],
  users: ['pageUsers']
};

window.__requestedPage = null;
window.__roleResolved = false;

export function showPage(pageKey) {
  if (!pageKey) return;
  pageKey = String(pageKey).trim();
  if (!window.__roleResolved) {
    window.__requestedPage = pageKey;
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  const candidates = pageMapCandidates[pageKey] || [`page${pageKey[0].toUpperCase()}${pageKey.slice(1)}`];
  let shown = false;
  for (const id of candidates) {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'block'; shown = true; break; }
  }
  if (!shown) {
    const fallback = document.querySelector('.page');
    if (fallback) fallback.style.display = 'block';
  }
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector(`.tab[data-page="${pageKey}"]`);
  if (tab) tab.classList.add('active');
}

/**
 * detectRole(user)
 * tries multiple fallbacks so DB field naming differences won't break the UI.
 * Returns { role: 'admin'|'teacher'|'student'|'guest', name: string|null }
 */
async function detectRole(user) {
  const uid = user?.uid || null;
  const email = (user?.email || '').toString().trim().toLowerCase();

  try {
    if (uid) {
      // teacher by authUid
      let q = query(collection(db, 'teachers'), where('authUid', '==', uid));
      let snap = await getDocs(q);
      if (!snap.empty) return { role: 'teacher', name: snap.docs[0].data().fullname || snap.docs[0].data().name || null };

      // admin by uid
      q = query(collection(db, 'admin'), where('uid', '==', uid));
      snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0].data();
        return { role: (d.role && String(d.role).toLowerCase()) || 'admin', name: d.fullname || d.name || null };
      }
    }

    // fallback: check by email if uid lookups failed or fields named differently
    if (email) {
      let q = query(collection(db, 'teachers'), where('email', '==', email));
      let snap = await getDocs(q);
      if (!snap.empty) return { role: 'teacher', name: snap.docs[0].data().fullname || snap.docs[0].data().name || null };

      q = query(collection(db, 'admin'), where('email', '==', email));
      snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0].data();
        return { role: (d.role && String(d.role).toLowerCase()) || 'admin', name: d.fullname || d.name || null };
      }

      q = query(collection(db, 'students'), where('email', '==', email));
      snap = await getDocs(q);
      if (!snap.empty) return { role: 'student', name: snap.docs[0].data().fullname || snap.docs[0].data().name || null };
    }

    // last resort: try students by authUid if present
    if (uid) {
      let q = query(collection(db, 'students'), where('authUid', '==', uid));
      let snap = await getDocs(q);
      if (!snap.empty) return { role: 'student', name: snap.docs[0].data().fullname || snap.docs[0].data().name || null };
    }
  } catch (err) {
    console.warn('role lookup failed', err);
  }
  return { role: 'guest', name: null };
}

function showSidebarUser(name, role) {
  const schoolName = document.getElementById('schoolName');
  const nameEl = document.getElementById('userNameLabel');
  const roleEl = document.getElementById('userRoleLabel');
  const mobileRole = document.getElementById('mobileUserRole');
  const mobileName = document.getElementById('mobileSchoolName');

  if (schoolName) schoolName.textContent = 'Alfatxi School';
  const r = (role || '').toString().toLowerCase();

  if (r === 'admin' || r === 'superadmin' || r === 'teacher') {
    if (nameEl) { nameEl.textContent = name || ''; nameEl.style.display = name ? 'inline-block' : 'none'; }
    if (roleEl) { roleEl.textContent = r === 'superadmin' ? 'Superadmin' : (r === 'admin' ? 'Admin' : 'Teacher'); roleEl.style.display = 'inline-block'; }
    if (mobileRole) { mobileRole.textContent = roleEl.textContent; mobileRole.style.display = 'inline-block'; }
  } else {
    if (nameEl) nameEl.style.display = 'none';
    if (roleEl) roleEl.style.display = 'none';
    if (mobileRole) mobileRole.style.display = 'none';
  }

  if (mobileName) mobileName.textContent = 'Alfatxi School';
}

function setRoleVisibility(role) {
  const r = (role || 'guest').toString().toLowerCase();

  document.querySelectorAll('.role-admin').forEach(el => { el.style.display = 'none'; el.setAttribute('aria-hidden','true'); });
  document.querySelectorAll('.role-teacher').forEach(el => { el.style.display = 'none'; el.setAttribute('aria-hidden','true'); });
  document.querySelectorAll('#mobileMenu .role-admin').forEach(el => { el.style.display = 'none'; });
  document.querySelectorAll('#mobileMenu .role-teacher').forEach(el => { el.style.display = 'none'; });

  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('btnLogout');
  const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
  const mobileLoginLink = document.getElementById('mobileLoginLink');

  if (r === 'admin' || r === 'superadmin') {
    document.querySelectorAll('.role-admin').forEach(el => { el.style.display = ''; el.removeAttribute('aria-hidden'); });
    if (logoutBtn) logoutBtn.hidden = false;
    if (loginBtn) loginBtn.hidden = true;
    if (mobileLogoutBtn) mobileLogoutBtn.hidden = false;
    if (mobileLoginLink) mobileLoginLink.hidden = true;
  } else if (r === 'teacher') {
    document.querySelectorAll('.role-teacher').forEach(el => { el.style.display = ''; el.removeAttribute('aria-hidden'); });
    if (logoutBtn) logoutBtn.hidden = false;
    if (loginBtn) loginBtn.hidden = true;
    if (mobileLogoutBtn) mobileLogoutBtn.hidden = false;
    if (mobileLoginLink) mobileLoginLink.hidden = true;
  } else {
    if (logoutBtn) logoutBtn.hidden = true;
    if (loginBtn) loginBtn.hidden = false;
    if (mobileLogoutBtn) mobileLogoutBtn.hidden = true;
    if (mobileLoginLink) mobileLoginLink.hidden = false;
  }
}

/* nav group toggles for desktop */
function bindNavGroups() {
  document.querySelectorAll('.nav-group-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      const body = btn.parentElement?.querySelector('.nav-group-body');
      if (body) {
        if (expanded) body.classList.add('hidden');
        else body.classList.remove('hidden');
      }
    });
  });
}

/* sidebar collapse */
function bindSidebarToggle() {
  const sidebar = document.getElementById('siteSidebar');
  const toggle = document.getElementById('sidebarToggle');
  if (!sidebar || !toggle) return;
  function setCollapsed(v, save = true) {
    if (v) {
      sidebar.classList.add('collapsed');
      document.body.classList.add('sidebar-collapsed');
      toggle?.setAttribute('aria-expanded', 'false');
    } else {
      sidebar.classList.remove('collapsed');
      document.body.classList.remove('sidebar-collapsed');
      toggle?.setAttribute('aria-expanded', 'true');
    }
    if (save) localStorage.setItem('sidebarCollapsed', v ? '1' : '0');
  }
  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    setCollapsed(!sidebar.classList.contains('collapsed'));
  });
  if (localStorage.getItem('sidebarCollapsed') === '1') setCollapsed(true, false);
}

/* mobile menu with icon swap + animation + mobile Academics toggle */
function bindMobileMenu() {
  const btn = document.getElementById('mobileMenuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  if (!btn || !mobileMenu) return;

  const hambSvg = `<svg id="mobileMenuIcon" width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.6"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`;
  const closeSvg = `<svg id="mobileMenuIcon" width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.6"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const open = mobileMenu.classList.toggle('show');
    if (open) {
      mobileMenu.removeAttribute('hidden'); mobileMenu.setAttribute('aria-hidden','false'); document.body.style.overflow = 'hidden'; btn.setAttribute('aria-expanded','true'); btn.innerHTML = closeSvg;
    } else {
      mobileMenu.classList.remove('show'); mobileMenu.setAttribute('hidden',''); mobileMenu.setAttribute('aria-hidden','true'); document.body.style.overflow = ''; btn.setAttribute('aria-expanded','false'); btn.innerHTML = hambSvg;
    }
  });

  mobileMenu.addEventListener('click', (e) => {
    if (e.target === mobileMenu) {
      mobileMenu.classList.remove('show'); mobileMenu.setAttribute('hidden',''); mobileMenu.setAttribute('aria-hidden','true'); document.body.style.overflow = '';
      btn.setAttribute('aria-expanded','false'); btn.innerHTML = hambSvg;
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileMenu.classList.contains('show')) {
      mobileMenu.classList.remove('show'); mobileMenu.setAttribute('hidden',''); mobileMenu.setAttribute('aria-hidden','true'); document.body.style.overflow = '';
      btn.setAttribute('aria-expanded','false'); btn.innerHTML = hambSvg;
    }
  });

  // mobile Academics toggle
  const mobAcadBtn = document.getElementById('mobileAcademicsBtn');
  const mobAcadBody = document.getElementById('mobileAcademicsBody');
  const mobAcadCaret = document.getElementById('mobileAcademicsCaret');
  if (mobAcadBtn && mobAcadBody && mobAcadCaret) {
    mobAcadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const open = mobAcadBody.style.display !== 'flex';
      mobAcadBody.style.display = open ? 'flex' : 'none';
      mobAcadBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      // rotate caret
      mobAcadCaret.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)';
    });
  }
}

/* tabs, logout, toast */
function bindTabs() {
  const tabs = Array.from(document.querySelectorAll('.tab'));
  if (!tabs.length) return;
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const page = tab.getAttribute('data-page') || tab.dataset.page || tab.id.replace(/^tab/i,'').toLowerCase();
      if (!page) return;
      showPage(page);
    });
  });
}

function bindLogout() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#btnLogout, #mobileLogoutBtn');
    if (!b) return;
    e.preventDefault();
    signOut(auth).then(()=> {
      toast('Logged out', 'success');
      localStorage.removeItem('verifiedRole');
      localStorage.removeItem('verifiedDisplayName');
      window.location.href = 'login.html';
    }).catch(err => {
      console.error(err);
      toast('Logout failed', 'error');
    });
  });
}

function initModalAndToast() {
  window.toast = function(msg = '', type = 'info', duration = 2600) {
    const container = document.getElementById('toast-container'); if (!container) return;
    const el = document.createElement('div'); el.className = 'toast ' + (type||'info');
    el.innerHTML = `<div class="msg">${String(msg)}</div><button class="close" aria-label="Close">✕</button>`;
    container.appendChild(el);
    el.querySelector('.close')?.addEventListener('click', () => el.remove());
    setTimeout(()=> el.remove(), duration);
  };
}

/* DOM ready: hide header until role resolved, hook UI */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('siteSidebar')?.classList.add('hidden');
  document.getElementById('mobileTopbar')?.classList.add('hidden');

  const yearEl = document.getElementById('year'); if (yearEl) yearEl.textContent = new Date().getFullYear();

  initModalAndToast();
  bindNavGroups();
  bindSidebarToggle();
  bindMobileMenu();
  bindTabs();
  bindLogout();
});

/* Auth state flow:
   - Show cached role instantly (if present)
   - Query server; only override cached role if server returns non-guest (authoritative)
*/
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showSidebarUser(null, 'guest');
    setRoleVisibility('guest');
    document.getElementById('siteSidebar')?.classList.remove('hidden');
    document.getElementById('mobileTopbar')?.classList.remove('hidden');
    window.__roleResolved = true;
    const toShow = window.__requestedPage || 'dashboard';
    showPage(toShow);
    return;
  }

  // immediate cached UI
  const cachedRole = localStorage.getItem('verifiedRole');
  const cachedName = localStorage.getItem('verifiedDisplayName') || user.displayName || user.email || '';
  if (cachedRole) {
    showSidebarUser(cachedName, cachedRole);
    setRoleVisibility(cachedRole);
    document.getElementById('siteSidebar')?.classList.remove('hidden');
    document.getElementById('mobileTopbar')?.classList.remove('hidden');
  }

  // verify with server — but only replace cachedRole if server returns a non-guest role
  let serverRole = 'guest';
  let serverName = '';
  try {
    const info = await detectRole(user);
    if (info && info.role) {
      serverRole = info.role;
      serverName = info.name || '';
    }
  } catch (err) {
    console.warn('role detect failed', err);
  }

  // If server returns admin/teacher/student, consider authoritative and update localStorage.
  if (serverRole && serverRole !== 'guest') {
    showSidebarUser(serverName || cachedName, serverRole);
    setRoleVisibility(serverRole);
    localStorage.setItem('verifiedRole', serverRole);
    if (serverName) localStorage.setItem('verifiedDisplayName', serverName);
  } else {
    // server returned guest — if we had a cachedRole, keep it (prevents flicker)
    if (cachedRole) {
      showSidebarUser(cachedName, cachedRole);
      setRoleVisibility(cachedRole);
    } else {
      showSidebarUser(null, 'guest');
      setRoleVisibility('guest');
    }
  }

  // reveal header (if not already)
  document.getElementById('siteSidebar')?.classList.remove('hidden');
  document.getElementById('mobileTopbar')?.classList.remove('hidden');

  window.__roleResolved = true;
  const toShow = window.__requestedPage || 'dashboard';
  showPage(toShow);
});

export default { showPage };
