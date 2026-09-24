const API = {
  get baseUrl() { return localStorage.getItem('notifyflow-api-url') || ''; },
  get token() { return localStorage.getItem('notifyflow-token') || ''; },
  async request(path, options = {}) {
    if (!this.baseUrl) return null;
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const normalizedBaseUrl = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const response = await fetch(`${normalizedBaseUrl}${path}`, { ...options, headers });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || body.error || `Request failed (${response.status})`);
    }
    return response.status === 204 ? null : response.json();
  }
};

const sampleNotifications = [
  { id: 'ntf_7k2m9p', subject: 'Order #10482 shipped', channel: 'email', recipient: 'maya@acme.com', status: 'delivered', createdAt: '2 minutes ago' },
  { id: 'ntf_3v8q1a', subject: 'Your verification code', channel: 'sms', recipient: '+1 555 014 2098', status: 'delivered', createdAt: '18 minutes ago' },
  { id: 'ntf_9f4r6d', subject: 'New feature available', channel: 'in-app', recipient: 'user_2481', status: 'pending', createdAt: '34 minutes ago' },
  { id: 'ntf_1p5x8z', subject: 'Payment receipt', channel: 'email', recipient: 'leo@northstar.io', status: 'failed', createdAt: '1 hour ago' },
  { id: 'ntf_6c0h2w', subject: 'Weekly account summary', channel: 'email', recipient: 'sarah@acme.com', status: 'sent', createdAt: '2 hours ago' }
];
let notifications = [...sampleNotifications];

const el = (selector) => document.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const titleMap = { dashboard: 'Good morning, Acme', send: 'Create a notification', activity: 'Notification activity', credentials: 'API credentials' };
const channelIcons = { email: '✉', sms: '◌', 'in-app': '▣' };

function notificationRow(item) {
  const channel = item.channel || 'in-app';
  const channelIcon = channelIcons[channel] || channelIcons['in-app'];
  return `<tr><td><strong>${escapeHtml(item.subject || item.title || 'Notification')}</strong><span class="notification-id">${escapeHtml(item.id || item._id || '—')}</span></td><td><span class="channel">${channelIcon} ${escapeHtml(channel)}</span></td><td>${escapeHtml(item.recipient || item.to || '—')}</td><td><span class="status ${escapeHtml(item.status || 'pending')} ">${escapeHtml(item.status || 'pending')}</span></td><td>${escapeHtml(formatDate(item.createdAt || item.created_at))}</td></tr>`;
}
function formatDate(value) {
  if (!value) return 'Just now';
  if (typeof value === 'string' && value.endsWith('ago')) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function renderActivity() {
  const query = el('#activitySearch').value.trim().toLowerCase();
  const wantedStatus = el('#statusFilter').value;
  const items = notifications.filter((item) => (wantedStatus === 'all' || item.status === wantedStatus) && JSON.stringify(item).toLowerCase().includes(query));
  el('#activityRows').innerHTML = items.map(notificationRow).join('');
  el('#recentActivity').innerHTML = notifications.slice(0, 5).map(notificationRow).join('');
  el('#emptyActivity').classList.toggle('hidden', items.length > 0);
}
function updateSummary() {
  const counts = notifications.reduce((all, item) => ({ ...all, [item.status]: (all[item.status] || 0) + 1 }), {});
  if (API.baseUrl) {
    el('#sentToday').textContent = notifications.length;
    el('#deliveredCount').textContent = counts.delivered || 0;
    el('#pendingCount').textContent = counts.pending || 0;
    el('#failedCount').textContent = counts.failed || 0;
  }
}
function showToast(message) {
  const toast = el('#toast'); toast.textContent = message; toast.classList.add('show');
  window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2800);
}
function setView(view) {
  document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active-view', section.id === view));
  document.querySelectorAll('[data-view]').forEach((link) => link.classList.toggle('active', link.dataset.view === view));
  el('#pageTitle').textContent = titleMap[view];
  el('.sidebar').classList.remove('open');
}
async function loadNotifications() {
  if (!API.baseUrl) { renderActivity(); return; }
  try {
    const data = await API.request('/api/notifications?limit=50');
    notifications = Array.isArray(data) ? data : data.notifications || data.data || [];
    renderActivity(); updateSummary();
  } catch (error) { showToast(`Could not load activity: ${error.message}`); }
}

document.querySelectorAll('[data-view]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); setView(link.dataset.view); if (link.dataset.view === 'activity') loadNotifications(); }));
document.querySelectorAll('[data-go-to]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.goTo)));
el('#menuButton').addEventListener('click', () => el('.sidebar').classList.toggle('open'));
el('#activitySearch').addEventListener('input', renderActivity);
el('#statusFilter').addEventListener('change', renderActivity);
el('#refreshActivity').addEventListener('click', loadNotifications);

el('#notificationForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  const message = el('#formMessage'); message.textContent = 'Sending…';
  try {
    const response = await API.request('/api/notifications', { method: 'POST', body: JSON.stringify(payload) });
    notifications.unshift({ id: response?.id || response?._id || `ntf_${crypto.randomUUID()}`, ...payload, status: response?.status || 'pending', createdAt: new Date().toISOString() });
    event.currentTarget.reset();
    event.currentTarget.querySelector('[value="email"]').checked = true;
    message.textContent = API.baseUrl ? 'Notification submitted successfully.' : 'Demo notification added. Connect the backend to send it.';
    renderActivity(); updateSummary();
  } catch (error) { message.textContent = `Unable to send: ${error.message}`; }
});

const dialog = el('#settingsDialog');
el('#settingsButton').addEventListener('click', () => { el('#apiBaseUrl').value = API.baseUrl; el('#accessToken').value = API.token; dialog.showModal(); });
el('#settingsForm').addEventListener('submit', (event) => {
  if (event.submitter?.value !== 'default') return;
  localStorage.setItem('notifyflow-api-url', el('#apiBaseUrl').value.trim().replace(/\/$/, ''));
  localStorage.setItem('notifyflow-token', el('#accessToken').value.trim());
  const live = Boolean(API.baseUrl); el('#connectionStatus').innerHTML = `<span></span> ${live ? 'API connected' : 'Demo mode'}`; el('#connectionStatus').classList.toggle('live', live);
  showToast(live ? 'Connection saved. Loading API data…' : 'Demo mode enabled.'); loadNotifications();
});
let registrationMode = false;
const authDialog = el('#authDialog');
function updateAuthForm() {
  el('#authTitle').textContent = registrationMode ? 'Create your business account' : 'Sign in to your workspace';
  el('#authDescription').textContent = registrationMode ? 'Register your business, then create credentials for your applications.' : 'Use your business account to securely manage notifications and API credentials.';
  el('.register-only').classList.toggle('hidden', !registrationMode);
  el('#businessName').required = registrationMode;
  el('#authSubmit').innerHTML = `${registrationMode ? 'Create account' : 'Sign in'} <span>→</span>`;
  el('#toggleAuth').textContent = registrationMode ? 'I already have an account' : 'Create an account';
  el('#authMessage').textContent = '';
}
el('#accountButton').addEventListener('click', () => { updateAuthForm(); authDialog.showModal(); });
el('#toggleAuth').addEventListener('click', () => { registrationMode = !registrationMode; updateAuthForm(); });
el('#authForm').addEventListener('submit', async (event) => {
  if (event.submitter?.value !== 'default') return;
  event.preventDefault();
  const authMessage = el('#authMessage');
  if (!API.baseUrl) { authMessage.textContent = 'Add your backend URL in Connection settings before signing in.'; return; }
  const body = { email: el('#authEmail').value, password: el('#authPassword').value };
  if (registrationMode) body.businessName = el('#businessName').value;
  authMessage.textContent = registrationMode ? 'Creating account…' : 'Signing in…';
  try {
    const data = await API.request(registrationMode ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: JSON.stringify(body) });
    const token = data.token || data.accessToken || data.data?.token;
    if (!token) throw new Error('The server did not return an access token.');
    localStorage.setItem('notifyflow-token', token); el('#accessToken').value = token;
    el('#accountButton').textContent = body.email; authDialog.close(); showToast(registrationMode ? 'Account created and signed in.' : 'Signed in successfully.'); loadNotifications();
  } catch (error) { authMessage.textContent = error.message; }
});
async function copyText(value, success) { try { await navigator.clipboard.writeText(value); showToast(success); } catch { showToast('Copy failed. Please select and copy manually.'); } }
el('#copyKey').addEventListener('click', () => copyText(el('#apiKeyDisplay').textContent, 'API key copied.'));
el('#copySnippet').addEventListener('click', () => copyText(el('#codeSnippet').textContent, 'Code sample copied.'));
el('#generateKey').addEventListener('click', async () => {
  if (!API.baseUrl) { el('#apiKeyDisplay').textContent = `nf_test_${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}••••••••`; showToast('Demo test key generated.'); return; }
  try { const data = await API.request('/api/api-keys', { method: 'POST' }); el('#apiKeyDisplay').textContent = data.key || data.apiKey || 'Key created — copy it from the server response.'; showToast('New API key generated.'); } catch (error) { showToast(`Could not generate a key: ${error.message}`); }
});
el('#revokeKey').addEventListener('click', () => { if (confirm('Revoke this API key? Applications using it will stop working.')) { el('#apiKeyDisplay').textContent = 'No active key'; showToast('Key revoked in this dashboard. Connect your API to revoke it server-side.'); } });

const hasApi = Boolean(API.baseUrl); el('#connectionStatus').innerHTML = `<span></span> ${hasApi ? 'API connected' : 'Demo mode'}`; el('#connectionStatus').classList.toggle('live', hasApi); renderActivity(); updateSummary();
if (API.token) el('#accountButton').textContent = 'Signed in';
