const state = { tasks: [], filter: 'all', search: '', sort: 'newest', editingId: null, openMenuId: null, toastTimer: null };
const $ = (selector) => document.querySelector(selector);
const taskList = $('#taskList');
const modal = $('#modalBackdrop');
const form = $('#taskForm');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || 'Request failed. Please try again.');
    error.status = response.status;
    error.errors = payload.errors || {};
    throw error;
  }
  return payload;
}

function formatDate(dateString) {
  if (!dateString) return 'No due date';
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function dateClass(dateString, completed) {
  if (!dateString || completed) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dateString}T00:00:00`);
  if (due < today) return 'overdue';
  if (due.getTime() === today.getTime()) return 'today';
  return '';
}

function filteredTasks() {
  let tasks = [...state.tasks];
  if (state.filter === 'active') tasks = tasks.filter((task) => !task.completed);
  if (state.filter === 'completed') tasks = tasks.filter((task) => task.completed);
  if (state.search) {
    const term = state.search.toLowerCase();
    tasks = tasks.filter((task) => `${task.title} ${task.description}`.toLowerCase().includes(term));
  }
  if (state.sort === 'oldest') tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (state.sort === 'newest') tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (state.sort === 'dueDate') tasks.sort((a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31'));
  if (state.sort === 'priority') {
    const rank = { high: 0, medium: 1, low: 2 };
    tasks.sort((a, b) => rank[a.priority] - rank[b.priority]);
  }
  return tasks;
}

function renderStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter((task) => task.completed).length;
  const active = total - completed;
  const high = state.tasks.filter((task) => task.priority === 'high' && !task.completed).length;
  $('#totalStat').textContent = total;
  $('#activeStat').textContent = active;
  $('#completedStat').textContent = completed;
  $('#highStat').textContent = high;
  $('#allCount').textContent = total;
  $('#activeCount').textContent = active;
  $('#completedCount').textContent = completed;
}

function renderTasks() {
  const tasks = filteredTasks();
  $('#visibleCount').textContent = tasks.length;
  $('#footerCount').textContent = `Showing ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`;
  if (!tasks.length) {
    const hasSearch = Boolean(state.search);
    taskList.innerHTML = `<div class="empty-state"><div class="empty-icon">${hasSearch ? '⌕' : '✦'}</div><strong>${hasSearch ? 'No matching tasks' : state.filter === 'completed' ? 'Nothing completed yet' : 'Your space is clear'}</strong><p>${hasSearch ? 'Try another keyword or clear your search.' : 'Add a task and make your next move count.'}</p>${!hasSearch && state.filter !== 'completed' ? '<button class="primary-button" id="emptyAddButton">＋ Add your first task</button>' : ''}</div>`;
    $('#emptyAddButton')?.addEventListener('click', openCreateModal);
    return;
  }
  taskList.innerHTML = tasks.map((task) => `
    <article class="task-row ${task.completed ? 'is-complete' : ''}" data-task-id="${task.id}">
      <input class="task-check" type="checkbox" aria-label="Mark ${escapeHtml(task.title)} ${task.completed ? 'incomplete' : 'complete'}" data-action="toggle" ${task.completed ? 'checked' : ''} />
      <div class="task-main"><div class="task-title">${escapeHtml(task.title)}</div>${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}</div>
      <span class="priority ${task.priority}">${task.priority}</span>
      <span class="due-date ${dateClass(task.dueDate, task.completed)}">${task.dueDate ? `◷ ${formatDate(task.dueDate)}` : '—'}</span>
      <div class="row-actions"><button class="row-menu-button" data-action="menu" aria-label="Task options">···</button>${state.openMenuId === task.id ? `<div class="row-menu"><button data-action="edit">Edit task</button><button class="delete-action" data-action="delete">Delete task</button></div>` : ''}</div>
    </article>`).join('');
}

function renderNavigation() {
  document.querySelectorAll('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.filter === state.filter));
  const names = { all: 'All tasks', active: 'In progress', completed: 'Completed' };
  $('#breadcrumbCurrent').textContent = names[state.filter];
  $('#listTitle').textContent = state.filter === 'all' ? 'Your tasks' : names[state.filter];
  $('#listSubtitle').textContent = state.filter === 'all' ? 'Everything you need to get done, in one place.' : state.filter === 'active' ? 'Keep moving forward, one task at a time.' : 'Look at everything you have accomplished.';
}

function render() {
  renderStats();
  renderNavigation();
  renderTasks();
}

async function loadTasks() {
  taskList.innerHTML = '<div class="loading-state">Loading your tasks<span class="loading-dots">...</span></div>';
  try {
    const result = await api('/api/tasks');
    state.tasks = result.tasks;
    render();
  } catch (error) {
    taskList.innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><strong>Could not load tasks</strong><p>${escapeHtml(error.message)}</p><button class="secondary-button" id="retryButton">Try again</button></div>`;
    $('#retryButton')?.addEventListener('click', loadTasks);
  }
}

function showToast(message, type = 'success') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast show ${type === 'error' ? 'error' : ''}`;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { toast.className = 'toast'; }, 2600);
}

function clearErrors() {
  ['titleError', 'descriptionError'].forEach((id) => { $(`#${id}`).textContent = ''; });
  $('#formError').textContent = '';
}

function openCreateModal() {
  state.editingId = null;
  form.reset();
  $('#taskPriority').value = 'medium';
  $('#modalTitle').textContent = 'Create a task';
  $('#saveTaskButton').innerHTML = 'Create task <span>→</span>';
  clearErrors();
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#taskTitle').focus(), 30);
}

function openEditModal(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  state.editingId = id;
  $('#taskTitle').value = task.title;
  $('#taskDescription').value = task.description;
  $('#taskPriority').value = task.priority;
  $('#taskDueDate').value = task.dueDate || '';
  $('#modalTitle').textContent = 'Edit task';
  $('#saveTaskButton').innerHTML = 'Save changes <span>→</span>';
  clearErrors();
  state.openMenuId = null;
  renderTasks();
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#taskTitle').focus(), 30);
}

function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = '';
  state.editingId = null;
  clearErrors();
}

function validateForm() {
  clearErrors();
  let valid = true;
  const title = $('#taskTitle').value.trim();
  const description = $('#taskDescription').value;
  if (!title) { $('#titleError').textContent = 'Task title is required.'; valid = false; }
  else if (title.length > 100) { $('#titleError').textContent = 'Keep the title within 100 characters.'; valid = false; }
  if (description.length > 500) { $('#descriptionError').textContent = 'Keep the description within 500 characters.'; valid = false; }
  return valid;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validateForm()) return;
  const payload = {
    title: $('#taskTitle').value.trim(),
    description: $('#taskDescription').value.trim(),
    priority: $('#taskPriority').value,
    dueDate: $('#taskDueDate').value || null
  };
  const editing = state.editingId !== null;
  const button = $('#saveTaskButton');
  button.disabled = true;
  button.textContent = editing ? 'Saving...' : 'Creating...';
  try {
    if (editing) await api(`/api/tasks/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
    else await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
    closeModal();
    await loadTasks();
    showToast(editing ? 'Task updated successfully.' : 'Task created successfully.');
  } catch (error) {
    if (error.errors?.title) $('#titleError').textContent = error.errors.title;
    if (error.errors?.description) $('#descriptionError').textContent = error.errors.description;
    $('#formError').textContent = error.message;
  } finally {
    button.disabled = false;
    button.innerHTML = editing ? 'Save changes <span>→</span>' : 'Create task <span>→</span>';
  }
});

taskList.addEventListener('click', async (event) => {
  const actionElement = event.target.closest('[data-action]');
  if (!actionElement) return;
  const row = actionElement.closest('[data-task-id]');
  const id = Number(row?.dataset.taskId);
  const action = actionElement.dataset.action;
  if (action === 'menu') {
    state.openMenuId = state.openMenuId === id ? null : id;
    renderTasks();
    return;
  }
  if (action === 'edit') { openEditModal(id); return; }
  if (action === 'delete') {
    const task = state.tasks.find((item) => item.id === id);
    if (!task || !window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return;
    try {
      await api(`/api/tasks/${id}`, { method: 'DELETE' });
      state.openMenuId = null;
      await loadTasks();
      showToast('Task deleted.');
    } catch (error) { showToast(error.message, 'error'); }
  }
});

taskList.addEventListener('change', async (event) => {
  if (event.target.dataset.action !== 'toggle') return;
  const id = Number(event.target.closest('[data-task-id]')?.dataset.taskId);
  try {
    const result = await api(`/api/tasks/${id}/toggle`, { method: 'PATCH' });
    const index = state.tasks.findIndex((task) => task.id === id);
    if (index !== -1) state.tasks[index] = result.task;
    render();
    showToast(result.task.completed ? 'Task completed. Great work!' : 'Task moved back to in progress.');
  } catch (error) {
    event.target.checked = !event.target.checked;
    showToast(error.message, 'error');
  }
});

document.querySelectorAll('.nav-link').forEach((button) => button.addEventListener('click', () => {
  state.filter = button.dataset.filter;
  state.openMenuId = null;
  render();
  $('#sidebar').classList.remove('open');
}));

$('#searchInput').addEventListener('input', (event) => { state.search = event.target.value.trim(); renderTasks(); });
$('#sortSelect').addEventListener('change', (event) => { state.sort = event.target.value; renderTasks(); });
$('#addTaskButton').addEventListener('click', openCreateModal);
$('#closeModal').addEventListener('click', closeModal);
$('#cancelModal').addEventListener('click', closeModal);
modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
$('#mobileMenu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
document.addEventListener('click', (event) => {
  if (!event.target.closest('.row-actions') && state.openMenuId !== null) { state.openMenuId = null; renderTasks(); }
});
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#searchInput').focus(); }
  if (event.key === 'Escape' && !modal.hidden) closeModal();
});

const now = new Date();
$('#todayLabel').textContent = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(now).toUpperCase();
loadTasks();
