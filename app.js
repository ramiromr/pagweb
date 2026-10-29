/* ===========================================
   DayFlow — app.js
   Daily Gantt Chart · Full Logic
   =========================================== */

// ─── Storage helpers ───────────────────────────────────────
const STORAGE_KEY = 'dayflow_activities';

function loadAll() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveAll(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// Key: "YYYY-MM-DD"
function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

// ─── State ─────────────────────────────────────────────────
const state = {
  today:       new Date(),
  selected:    new Date(),
  calYear:     new Date().getFullYear(),
  calMonth:    new Date().getMonth(),
  activities:  loadAll(),   // { "YYYY-MM-DD": [ {id, name, start, end, status, note} ] }
  editingId:   null,
};

// ─── DOM refs ──────────────────────────────────────────────
const $ = id => document.getElementById(id);

const sidebar        = document.querySelector('.sidebar');
const menuToggle     = $('menuToggle');
const calDays        = $('calDays');
const calMonthYear   = $('calMonthYear');
const prevMonth      = $('prevMonth');
const nextMonth      = $('nextMonth');
const topbarDate     = $('topbarDate');
const topbarSub      = $('topbarSub');
const todayBtn       = $('todayBtn');
const ganttRows      = $('ganttRows');
const timeRuler      = $('timeRuler');
const nowLine        = $('nowLine');
const modalOverlay   = $('modalOverlay');
const openModalBtn   = $('openModalBtn');
const closeModalBtn  = $('closeModalBtn');
const cancelModalBtn = $('cancelModalBtn');
const activityForm   = $('activityForm');
const actName        = $('actName');
const actStart       = $('actStart');
const actEnd         = $('actEnd');
const actNote        = $('actNote');
const actStatusHid   = $('actStatus');
const deleteActBtn   = $('deleteActBtn');
const statusOpts     = document.querySelectorAll('.status-opt');
const statPlanned    = $('statPlanned');
const statExecuted   = $('statExecuted');
const statPercent    = $('statPercent');
const progressFill   = $('progressFill');

// ─── Helpers ───────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10); }

function minutesFromMidnight(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function fmt12(timeStr) {
  let [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2,'0')} ${ampm}`;
}

function formatDateLong(d) {
  return d.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}
function formatMonthYear(y, m) {
  return new Date(y, m, 1).toLocaleDateString('es-ES', { month:'long', year:'numeric' });
}

function activitiesForDay(key) {
  return state.activities[key] || [];
}

// ─── Mini Calendar ─────────────────────────────────────────
function renderCalendar() {
  calMonthYear.textContent = formatMonthYear(state.calYear, state.calMonth);
  calDays.innerHTML = '';

  const first = new Date(state.calYear, state.calMonth, 1);
  // Monday-based weekday (0=Mon … 6=Sun)
  let startDow = (first.getDay() + 6) % 7;

  // Days from previous month
  for (let i = 0; i < startDow; i++) {
    const prev = new Date(state.calYear, state.calMonth, 1 - (startDow - i));
    calDays.appendChild(makeCalDay(prev, true));
  }

  // Current month days
  const daysInMonth = new Date(state.calYear, state.calMonth + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(state.calYear, state.calMonth, d);
    calDays.appendChild(makeCalDay(date, false));
  }

  // Fill to complete last row
  const totalCells = calDays.childElementCount;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const next = new Date(state.calYear, state.calMonth + 1, i);
    calDays.appendChild(makeCalDay(next, true));
  }
}

function makeCalDay(date, otherMonth) {
  const btn = document.createElement('button');
  btn.className = 'cal-day';
  btn.textContent = date.getDate();
  btn.setAttribute('aria-label', date.toLocaleDateString('es-ES'));
  if (otherMonth) btn.classList.add('other-month');

  const today = state.today;
  if (date.toDateString() === today.toDateString()) btn.classList.add('today');
  if (date.toDateString() === state.selected.toDateString()) btn.classList.add('selected');

  const key = dateKey(date);
  if (state.activities[key]?.length) btn.classList.add('has-activity');

  btn.addEventListener('click', () => {
    state.selected = new Date(date);
    state.calYear  = date.getFullYear();
    state.calMonth = date.getMonth();
    refreshAll();
  });
  return btn;
}

prevMonth.addEventListener('click', () => {
  state.calMonth--;
  if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
  renderCalendar();
});
nextMonth.addEventListener('click', () => {
  state.calMonth++;
  if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
  renderCalendar();
});

// ─── Topbar ────────────────────────────────────────────────
function renderTopbar() {
  topbarDate.textContent = formatDateLong(state.selected);
  const isToday = state.selected.toDateString() === state.today.toDateString();
  topbarSub.textContent = isToday ? '— Hoy —' : '';
}

todayBtn.addEventListener('click', () => {
  state.selected = new Date(state.today);
  state.calYear  = state.today.getFullYear();
  state.calMonth = state.today.getMonth();
  refreshAll();
  scrollToNow();
});

// ─── Gantt ─────────────────────────────────────────────────
const HOUR_H = 64; // must match --hour-h CSS var

function renderGantt() {
  // Time ruler
  timeRuler.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const slot = document.createElement('div');
    slot.className = 'ruler-slot';
    const label = h === 0 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? '12 pm' : `${h - 12} pm`;
    slot.textContent = label;
    timeRuler.appendChild(slot);
  }

  // Hour backgrounds
  ganttRows.innerHTML = '';
  ganttRows.style.height = `${24 * HOUR_H}px`;
  for (let h = 0; h < 24; h++) {
    const bg = document.createElement('div');
    bg.className = 'hour-bg';
    bg.style.top = `${h * HOUR_H}px`;
    ganttRows.appendChild(bg);
  }

  // Activity bars
  const key = dateKey(state.selected);
  const acts = activitiesForDay(key);

  // Resolve overlapping columns
  const laid = layoutActivities(acts);
  laid.forEach(({ act, col, cols }) => {
    const bar = buildBar(act, col, cols);
    ganttRows.appendChild(bar);
  });

  updateStats(key);
  updateNowLine();
}

function layoutActivities(acts) {
  // Sort by start
  const sorted = [...acts].sort((a,b) => minutesFromMidnight(a.start) - minutesFromMidnight(b.start));
  const result = [];
  // Simple greedy column assignment
  const colEnds = []; // colEnds[i] = end minute of last activity in column i
  sorted.forEach(act => {
    const startMin = minutesFromMidnight(act.start);
    const endMin   = minutesFromMidnight(act.end);
    let col = colEnds.findIndex(e => e <= startMin);
    if (col === -1) col = colEnds.length;
    colEnds[col] = endMin;
    result.push({ act, col, _colEnds: [...colEnds] });
  });
  // Determine total cols per activity (max col index that overlaps its time range)
  result.forEach(item => {
    const startMin = minutesFromMidnight(item.act.start);
    const endMin   = minutesFromMidnight(item.act.end);
    let maxCols = item.col + 1;
    result.forEach(other => {
      if (other === item) return;
      const oStart = minutesFromMidnight(other.act.start);
      const oEnd   = minutesFromMidnight(other.act.end);
      if (oStart < endMin && oEnd > startMin) {
        maxCols = Math.max(maxCols, other.col + 1);
      }
    });
    item.cols = maxCols;
  });
  return result;
}

function buildBar(act, col, cols) {
  const startMin = minutesFromMidnight(act.start);
  const endMin   = minutesFromMidnight(act.end);
  const topPx    = (startMin / 60) * HOUR_H;
  const heightPx = Math.max(((endMin - startMin) / 60) * HOUR_H, 28);

  const colW   = 100 / cols;
  const left   = col * colW;
  const width  = colW;

  const bar = document.createElement('div');
  bar.className = `activity-bar ${act.status}`;
  bar.style.top    = `${topPx}px`;
  bar.style.height = `${heightPx}px`;
  bar.style.left   = `calc(${left}% + 8px)`;
  bar.style.right  = 'unset';
  bar.style.width  = `calc(${width}% - 16px)`;
  bar.style.zIndex = 3 + col;
  bar.setAttribute('aria-label', act.name);
  bar.setAttribute('role', 'button');
  bar.setAttribute('tabindex', '0');

  const nameEl = document.createElement('div');
  nameEl.className = 'bar-name';
  nameEl.textContent = act.name;

  const timeEl = document.createElement('div');
  timeEl.className = 'bar-time';
  timeEl.textContent = `${fmt12(act.start)} – ${fmt12(act.end)}`;

  bar.appendChild(nameEl);
  if (heightPx >= 42) bar.appendChild(timeEl);

  bar.addEventListener('click', () => openEditModal(act));
  bar.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openEditModal(act); });
  return bar;
}

// ─── Stats ─────────────────────────────────────────────────
function updateStats(key) {
  const acts = activitiesForDay(key);
  const planned  = acts.filter(a => a.status === 'planned').length;
  const executed = acts.filter(a => a.status === 'executed').length;
  const partial  = acts.filter(a => a.status === 'partial').length;
  const total    = acts.length;

  statPlanned.textContent  = planned + partial + executed;
  statExecuted.textContent = executed;

  if (total === 0) {
    statPercent.textContent = '—';
    progressFill.style.width = '0%';
  } else {
    const pct = Math.round(((executed + partial * 0.5) / total) * 100);
    statPercent.textContent = `${pct}%`;
    progressFill.style.width = `${pct}%`;
  }
}

// ─── Now line ──────────────────────────────────────────────
function updateNowLine() {
  const isToday = state.selected.toDateString() === state.today.toDateString();
  if (!isToday) { nowLine.style.display = 'none'; return; }

  const now    = new Date();
  const mins   = now.getHours() * 60 + now.getMinutes();
  const topPx  = (mins / 60) * HOUR_H;
  nowLine.style.display = 'block';
  nowLine.style.top = `${topPx}px`;
}

function scrollToNow() {
  const now  = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const topPx = (mins / 60) * HOUR_H;
  document.querySelector('.gantt-wrapper').scrollTop = Math.max(0, topPx - 150);
}

// Update every minute
setInterval(() => { updateNowLine(); }, 60000);

// ─── Modal ─────────────────────────────────────────────────
function openAddModal() {
  state.editingId = null;
  activityForm.reset();
  $('editId').value = '';
  deleteActBtn.style.display = 'none';
  $('modalTitle').textContent = 'Nueva actividad';

  // Default times: current hour rounded
  const now = new Date();
  const h   = String(now.getHours()).padStart(2,'0');
  const hN  = String(now.getHours() + 1 < 24 ? now.getHours() + 1 : now.getHours()).padStart(2,'0');
  actStart.value = `${h}:00`;
  actEnd.value   = `${hN}:00`;
  setStatusActive('planned');
  modalOverlay.classList.add('open');
  actName.focus();
}

function openEditModal(act) {
  state.editingId    = act.id;
  $('editId').value  = act.id;
  actName.value      = act.name;
  actStart.value     = act.start;
  actEnd.value       = act.end;
  actNote.value      = act.note || '';
  setStatusActive(act.status);
  deleteActBtn.style.display = 'inline-flex';
  $('modalTitle').textContent = 'Editar actividad';
  modalOverlay.classList.add('open');
  actName.focus();
}

function closeModal() {
  modalOverlay.classList.remove('open');
}

openModalBtn.addEventListener('click', openAddModal);
closeModalBtn.addEventListener('click', closeModal);
cancelModalBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

// Status selector
statusOpts.forEach(btn => {
  btn.addEventListener('click', () => setStatusActive(btn.dataset.val));
});
function setStatusActive(val) {
  actStatusHid.value = val;
  statusOpts.forEach(b => b.classList.toggle('active', b.dataset.val === val));
}

// Form submit
activityForm.addEventListener('submit', e => {
  e.preventDefault();

  const start = actStart.value;
  const end   = actEnd.value;
  if (minutesFromMidnight(end) <= minutesFromMidnight(start)) {
    actEnd.setCustomValidity('El fin debe ser posterior al inicio');
    actEnd.reportValidity();
    return;
  }
  actEnd.setCustomValidity('');

  const key = dateKey(state.selected);
  if (!state.activities[key]) state.activities[key] = [];

  if (state.editingId) {
    // Edit
    const idx = state.activities[key].findIndex(a => a.id === state.editingId);
    if (idx !== -1) {
      state.activities[key][idx] = {
        id:     state.editingId,
        name:   actName.value.trim(),
        start,
        end,
        status: actStatusHid.value,
        note:   actNote.value.trim(),
      };
    }
  } else {
    // Add
    state.activities[key].push({
      id:     uid(),
      name:   actName.value.trim(),
      start,
      end,
      status: actStatusHid.value,
      note:   actNote.value.trim(),
    });
  }

  saveAll(state.activities);
  closeModal();
  refreshAll();
});

// Delete
deleteActBtn.addEventListener('click', () => {
  if (!state.editingId) return;
  const key = dateKey(state.selected);
  state.activities[key] = (state.activities[key] || []).filter(a => a.id !== state.editingId);
  if (!state.activities[key].length) delete state.activities[key];
  saveAll(state.activities);
  closeModal();
  refreshAll();
});

// ─── Mobile sidebar ────────────────────────────────────────
menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
document.addEventListener('click', e => {
  if (sidebar.classList.contains('open') &&
      !sidebar.contains(e.target) &&
      e.target !== menuToggle) {
    sidebar.classList.remove('open');
  }
});

// ─── Keyboard shortcuts ────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'n' && !modalOverlay.classList.contains('open') &&
      document.activeElement.tagName !== 'INPUT') openAddModal();
});

// ─── Double-click on gantt to add at that hour ─────────────
ganttRows.addEventListener('dblclick', e => {
  const rect   = ganttRows.getBoundingClientRect();
  const y      = e.clientY - rect.top;
  const mins   = Math.round((y / HOUR_H) * 60);
  const h      = Math.floor(mins / 60);
  const m      = Math.round((mins % 60) / 15) * 15;
  const hStr   = String(Math.min(h, 23)).padStart(2,'0');
  const mStr   = String(m >= 60 ? 45 : m).padStart(2,'0');
  const hEndStr= String(Math.min(h + 1, 23)).padStart(2,'0');
  openAddModal();
  actStart.value = `${hStr}:${mStr}`;
  actEnd.value   = `${hEndStr}:${mStr}`;
});

// ─── Refresh all UI ────────────────────────────────────────
function refreshAll() {
  renderCalendar();
  renderTopbar();
  renderGantt();
}

// ─── Seed demo activities for today ────────────────────────
function seedDemo() {
  const key = dateKey(state.today);
  if (state.activities[key]) return; // already has data
  state.activities[key] = [
    { id: uid(), name: 'Revisión de correos', start: '08:00', end: '08:30', status: 'executed', note: '' },
    { id: uid(), name: 'Stand-up del equipo',  start: '09:00', end: '09:30', status: 'executed', note: 'Breve, 3 puntos' },
    { id: uid(), name: 'Desarrollo feature A', start: '09:30', end: '12:00', status: 'partial',  note: 'PR pendiente' },
    { id: uid(), name: 'Almuerzo',             start: '12:00', end: '13:00', status: 'executed', note: '' },
    { id: uid(), name: 'Code review',          start: '13:00', end: '14:00', status: 'planned',  note: '' },
    { id: uid(), name: 'Reunión cliente',      start: '15:00', end: '16:00', status: 'planned',  note: 'Zoom' },
    { id: uid(), name: 'Documentación',        start: '16:00', end: '17:30', status: 'planned',  note: '' },
  ];
  saveAll(state.activities);
}

// ─── Init ──────────────────────────────────────────────────
seedDemo();
refreshAll();
scrollToNow();
