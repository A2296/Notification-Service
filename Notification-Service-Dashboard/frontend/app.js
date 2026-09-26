// NotifyFlow dashboard for the Notification Service.
//
// The page is served by the API itself, so every request is same-origin and the
// session lives in an HttpOnly cookie that this script can never read. Nothing
// sensitive is kept in browser storage. Opened without the API (for example from
// a static file server), the dashboard runs as a demo with sample data.

const API_BASE = '/api/v1';
const REQUEST_TIMEOUT_MS = 15000;
const SEARCH_DEBOUNCE_MS = 300;

const CHANNELS = {
  email: {
    api: 'EMAIL',
    name: 'Email',
    icon: '✉',
    recipientField: 'email',
    recipientLabel: 'Recipient email',
    inputType: 'email',
    placeholder: 'name@example.com'
  },
  sms: {
    api: 'SMS',
    name: 'SMS',
    icon: '◌',
    recipientField: 'phone',
    recipientLabel: 'Recipient phone',
    inputType: 'tel',
    placeholder: '+2348012345678 (international format)'
  },
  'in-app': {
    api: 'IN_APP',
    name: 'In-app',
    icon: '▣',
    recipientField: 'id',
    recipientLabel: 'Recipient user ID',
    inputType: 'text',
    placeholder: 'Your user ID, e.g. user_2481'
  }
};

const STATUSES = new Set(['pending', 'processing', 'sent', 'delivered', 'failed']);

const TITLES = {
  send: 'Create a notification',
  activity: 'Notification activity',
  credentials: 'API credentials'
};

const state = {
  mode: 'loading', // 'live' (served by the API) or 'demo'
  view: 'dashboard',
  user: null,
  demo: [],
  apiKeys: [],
  idempotencyKey: null,
  activityRequest: 0
};

const el = (selector) => document.querySelector(selector);

// ---- API client ----

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function describeError(data, status) {
  if (status === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  if (status >= 500) {
    return 'The service had a problem. Please try again shortly.';
  }

  const [firstError] = Array.isArray(data.errors) ? data.errors : [];

  if (firstError?.message) {
    return firstError.field
      ? `${firstError.field}: ${firstError.message}`
      : firstError.message;
  }

  return typeof data.message === 'string'
    ? data.message
    : `Request failed (${status})`;
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        // Required by the API for cookie-authenticated changes (CSRF protection)
        'X-Requested-With': 'XMLHttpRequest',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new ApiError(describeError(data, response.status), response.status);
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error.name === 'AbortError') {
      throw new ApiError('The server took too long to respond. Please try again.', 0);
    }

    throw new ApiError('Could not reach the Notification Service. Check your connection.', 0);
  } finally {
    window.clearTimeout(timer);
  }
}

// Authenticated call: an expired or revoked session returns the user to sign-in
async function callApi(path, options) {
  try {
    return await request(`${API_BASE}${path}`, options);
  } catch (error) {
    if (error.status === 401 && state.user) {
      setSignedOut();
      showToast('Your session has ended. Please sign in again.');
      openAuthDialog();
    }

    throw error;
  }
}

async function detectBackend() {
  if (location.protocol === 'file:') {
    return false;
  }

  try {
    const health = await request('/health');
    return typeof health.database === 'string';
  } catch (error) {
    // 503: the API is running but its database is not reachable yet
    return error.status === 503;
  }
}

// ---- Helpers ----

function createElement(tag, { className, text } = {}) {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text !== undefined) {
    node.textContent = text;
  }

  return node;
}

function renderTable(bodySelector, emptySelector, items, toRow) {
  el(bodySelector).replaceChildren(...items.map(toRow));
  el(emptySelector).classList.toggle('hidden', items.length > 0);
}

function randomId() {
  // getRandomValues also works on plain-HTTP origins, unlike crypto.randomUUID
  return Array.from(
    crypto.getRandomValues(new Uint8Array(16)),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');
}

const relativeTime = new Intl.RelativeTimeFormat([], { numeric: 'auto' });

function formatDate(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const minutes = Math.round((date.getTime() - Date.now()) / 60000);

  if (Math.abs(minutes) < 1) {
    return 'Just now';
  }

  if (Math.abs(minutes) < 60) {
    return relativeTime.format(minutes, 'minute');
  }

  if (Math.abs(minutes) < 24 * 60) {
    return relativeTime.format(Math.round(minutes / 60), 'hour');
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function excerpt(text = '', length = 60) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function showToast(message) {
  const toast = el('#toast');

  toast.textContent = message;
  toast.classList.add('show');

  window.clearTimeout(showToast.timer);

  showToast.timer = window.setTimeout(
    () => toast.classList.remove('show'),
    3200
  );
}

function setBusy(button, busy) {
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
}

function setButtonLabel(button, label) {
  button.replaceChildren(`${label} `, createElement('span', { text: '→' }));
}

async function copyText(value, success) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(success);
  } catch {
    showToast('Copy failed. Please select and copy manually.');
  }
}

// ---- Demo data (used only when the API is not available) ----

const minutesAgo = (minutes) =>
  new Date(Date.now() - minutes * 60000).toISOString();

function sampleNotifications() {
  return [
    {
      id: 'ntf_7k2m9p',
      subject: 'Order #10482 shipped',
      channel: 'EMAIL',
      to: 'maya@acme.com',
      status: 'DELIVERED',
      createdAt: minutesAgo(2)
    },
    {
      id: 'ntf_3v8q1a',
      subject: 'Your verification code',
      channel: 'SMS',
      to: '+15550142098',
      status: 'SENT',
      createdAt: minutesAgo(18)
    },
    {
      id: 'ntf_9f4r6d',
      subject: 'New feature available',
      channel: 'IN_APP',
      to: 'user_2481',
      status: 'PENDING',
      createdAt: minutesAgo(34)
    },
    {
      id: 'ntf_1p5x8z',
      subject: 'Payment receipt',
      channel: 'EMAIL',
      to: 'leo@northstar.io',
      status: 'FAILED',
      createdAt: minutesAgo(65)
    },
    {
      id: 'ntf_6c0h2w',
      subject: 'Weekly account summary',
      channel: 'EMAIL',
      to: 'sarah@acme.com',
      status: 'SENT',
      createdAt: minutesAgo(130)
    }
  ];
}

function sampleApiKey(name = 'Demo key') {
  return {
    id: `demo_${randomId()}`,
    name,
    keyId: `ns_pk_demo${randomId().slice(0, 20)}`,
    secretLast4: randomId().slice(0, 4),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null
  };
}

function statsFrom(notifications) {
  const byStatus = {};

  for (const item of notifications) {
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  }

  return { total: notifications.length, byStatus };
}

// ---- Rendering ----

function greeting() {
  const hour = new Date().getHours();
  let part = 'Good evening';

  if (hour < 12) {
    part = 'Good morning';
  } else if (hour < 18) {
    part = 'Good afternoon';
  }

  const name =
    state.user?.business?.name || (state.mode === 'demo' ? 'Acme' : '');

  return name ? `${part}, ${name}` : part;
}

function setConnection(label, live) {
  const pill = el('#connectionStatus');

  pill.replaceChildren(document.createElement('span'), ` ${label}`);
  pill.classList.toggle('live', live);
}

function toDisplay(item) {
  const channel = String(item.channel || 'IN_APP').toLowerCase().replace('_', '-');
  const status = String(item.status || 'PENDING').toLowerCase();

  return {
    id: item.id || '—',
    title: item.subject || excerpt(item.message) || 'Notification',
    channel: CHANNELS[channel] ? channel : 'in-app',
    recipient: item.to || '—',
    status: STATUSES.has(status) ? status : 'pending',
    createdAt: item.createdAt
  };
}

function notificationRow(item) {
  const view = toDisplay(item);
  const row = document.createElement('tr');

  const summary = document.createElement('td');
  summary.append(
    createElement('strong', { text: view.title }),
    createElement('span', { className: 'notification-id', text: view.id })
  );

  const channel = document.createElement('td');
  channel.append(
    createElement('span', {
      className: 'channel',
      text: `${CHANNELS[view.channel].icon} ${CHANNELS[view.channel].name}`
    })
  );

  const status = document.createElement('td');
  status.append(
    createElement('span', { className: `status ${view.status}`, text: view.status })
  );

  row.append(
    summary,
    channel,
    createElement('td', { text: view.recipient }),
    status,
    createElement('td', { text: formatDate(view.createdAt) })
  );

  return row;
}

function renderStats(stats) {
  const byStatus = stats?.byStatus || {};
  const count = (...statuses) =>
    statuses.reduce((sum, status) => sum + (byStatus[status] || 0), 0);
  const show = (selector, value) => {
    el(selector).textContent = stats ? value.toLocaleString() : '—';
  };

  const delivered = count('SENT', 'DELIVERED');

  show('#totalCount', stats?.total || 0);
  show('#deliveredCount', delivered);
  show('#pendingCount', count('PENDING', 'PROCESSING'));
  show('#failedCount', count('FAILED'));

  let rate = 'Accepted by providers';

  if (stats?.total) {
    rate = `${Math.round((delivered / stats.total) * 1000) / 10}% of all notifications`;
  } else if (stats) {
    rate = 'No notifications yet';
  }

  el('#deliveryRate').textContent = rate;
}

function activeKey() {
  return state.apiKeys.find((key) => !key.revokedAt);
}

function apiKeyRow(key) {
  const row = document.createElement('tr');
  const status = key.revokedAt ? 'revoked' : 'active';

  const keyId = document.createElement('td');
  keyId.append(createElement('code', { text: key.keyId }));

  const statusCell = document.createElement('td');
  statusCell.append(createElement('span', { className: `status ${status}`, text: status }));

  const actions = document.createElement('td');

  if (!key.revokedAt) {
    const revoke = createElement('button', {
      className: 'danger-button compact-button',
      text: 'Revoke'
    });
    revoke.type = 'button';
    revoke.setAttribute('aria-label', `Revoke ${key.name}`);
    revoke.addEventListener('click', () => revokeKey(key));
    actions.append(revoke);
  }

  row.append(
    createElement('td', { text: key.name }),
    keyId,
    createElement('td', { text: formatDate(key.createdAt) }),
    createElement('td', { text: key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never' }),
    statusCell,
    actions
  );

  return row;
}

function renderCodeSnippet(key = activeKey()) {
  const origin =
    location.protocol === 'file:'
      ? 'https://your-notification-service.example.com'
      : location.origin;

  el('#codeSnippet').textContent = [
    `curl -X POST "${origin}/api/v1/notifications" \\`,
    `  -H "X-API-Key: ${key ? key.keyId : '$NOTIFY_API_KEY'}" \\`,
    '  -H "X-API-Secret: $NOTIFY_API_SECRET" \\',
    '  -H "Content-Type: application/json" \\',
    '  -H "Idempotency-Key: order-10482-shipped" \\',
    `  -d '{"channel":"EMAIL","recipient":{"email":"user@example.com"},"subject":"Welcome","message":"Thanks for joining us!"}'`
  ].join('\n');
}

function renderApiKeys() {
  const key = activeKey();
  let meta = 'Sign in to manage your API keys.';

  if (key) {
    const lastUsed = key.lastUsedAt ? formatDate(key.lastUsedAt) : 'never';
    meta = `${key.name} · secret ends in …${key.secretLast4} · created ${formatDate(key.createdAt)} · last used ${lastUsed}`;
  } else if (state.user || state.mode === 'demo') {
    meta = 'No active key. Generate one to start integrating.';
  }

  el('#apiKeyDisplay').textContent = key ? key.keyId : 'No active key';
  el('#apiKeyMeta').textContent = meta;
  el('#copyKey').disabled = !key;
  el('#revokeKey').disabled = !key;

  renderTable('#apiKeyRows', '#emptyKeys', state.apiKeys, apiKeyRow);
  renderCodeSnippet(key);
}

function showSecret(secret) {
  el('#apiSecretDisplay').textContent = secret;
  el('#secretBox').classList.remove('hidden');
}

function hideSecret() {
  el('#apiSecretDisplay').textContent = '';
  el('#secretBox').classList.add('hidden');
}

// ---- Data loading ----

const hasBusiness = () => Boolean(state.user?.business);

async function refreshDashboard() {
  if (state.mode === 'demo') {
    renderStats(statsFrom(state.demo));
    renderTable('#recentActivity', '#emptyRecent', state.demo.slice(0, 5), notificationRow);
    return;
  }

  if (!hasBusiness()) {
    renderStats(null);
    renderTable('#recentActivity', '#emptyRecent', [], notificationRow);
    return;
  }

  try {
    const [{ stats }, { notifications }] = await Promise.all([
      callApi('/notifications/stats'),
      callApi('/notifications?limit=5')
    ]);

    renderStats(stats);
    renderTable('#recentActivity', '#emptyRecent', notifications, notificationRow);
  } catch (error) {
    showToast(`Could not load the overview: ${error.message}`);
  }
}

async function loadActivity() {
  const search = el('#activitySearch').value.trim();
  const status = el('#statusFilter').value;

  if (state.mode === 'demo') {
    const query = search.toLowerCase();
    const items = state.demo.filter(
      (item) =>
        (status === 'all' || item.status.toLowerCase() === status) &&
        [item.id, item.subject, item.message, item.to]
          .join(' ')
          .toLowerCase()
          .includes(query)
    );

    renderTable('#activityRows', '#emptyActivity', items, notificationRow);
    return;
  }

  if (!hasBusiness()) {
    renderTable('#activityRows', '#emptyActivity', [], notificationRow);
    return;
  }

  const params = new URLSearchParams({ limit: '50' });

  if (search) {
    params.set('search', search);
  }

  if (status !== 'all') {
    params.set('status', status.toUpperCase());
  }

  // Ignore responses that arrive after a newer search was started
  state.activityRequest += 1;
  const requestNumber = state.activityRequest;

  try {
    const { notifications } = await callApi(`/notifications?${params}`);

    if (requestNumber === state.activityRequest) {
      renderTable('#activityRows', '#emptyActivity', notifications, notificationRow);
    }
  } catch (error) {
    showToast(`Could not load activity: ${error.message}`);
  }
}

async function loadApiKeys() {
  if (state.mode !== 'live' || !hasBusiness()) {
    renderApiKeys();
    return;
  }

  try {
    const { apiKeys } = await callApi('/api-keys');
    state.apiKeys = apiKeys;
    renderApiKeys();
  } catch (error) {
    showToast(`Could not load API keys: ${error.message}`);
  }
}

function refreshView(view = state.view) {
  if (view === 'activity') {
    return loadActivity();
  }

  if (view === 'credentials') {
    return loadApiKeys();
  }

  return refreshDashboard();
}

function setView(view) {
  const next = view === 'dashboard' || TITLES[view] ? view : 'dashboard';
  state.view = next;

  document
    .querySelectorAll('.view')
    .forEach((section) => section.classList.toggle('active-view', section.id === next));

  document
    .querySelectorAll('[data-view]')
    .forEach((link) => link.classList.toggle('active', link.dataset.view === next));

  el('#pageTitle').textContent = next === 'dashboard' ? greeting() : TITLES[next];
  el('.sidebar').classList.remove('open');
  history.replaceState(null, '', `#${next}`);

  if (state.mode !== 'loading') {
    refreshView(next);
  }
}

// ---- Session ----

function setSignedIn(user) {
  state.user = user;

  const account = el('#accountButton');
  account.textContent = user.email;
  account.title = 'Sign out';

  setConnection(user.business ? 'API connected' : 'Admin account', true);

  if (!user.business) {
    showToast('Platform admin accounts manage businesses through the admin API.');
  }

  setView(state.view);
}

function setSignedOut() {
  state.user = null;
  state.apiKeys = [];

  const account = el('#accountButton');
  account.textContent = 'Sign in';
  account.removeAttribute('title');

  setConnection('Signed out', false);
  hideSecret();
  renderStats(null);
  renderApiKeys();
  renderTable('#recentActivity', '#emptyRecent', [], notificationRow);
  renderTable('#activityRows', '#emptyActivity', [], notificationRow);
  el('#pageTitle').textContent =
    state.view === 'dashboard' ? greeting() : TITLES[state.view];
}

async function signOut() {
  if (!window.confirm('Sign out of NotifyFlow? This ends your session on every device.')) {
    return;
  }

  try {
    await request(`${API_BASE}/auth/logout`, { method: 'POST' });
  } catch {
    // Already signed out on the server (for example the session expired)
  }

  setSignedOut();
  showToast('Signed out.');
}

function startDemo() {
  state.mode = 'demo';
  state.demo = sampleNotifications();
  state.apiKeys = [sampleApiKey()];

  setConnection('Demo mode', false);
  setView(state.view);
}

// ---- Auth dialog ----

let registrationMode = false;

const authDialog = el('#authDialog');

function updateAuthForm() {
  el('#authTitle').textContent = registrationMode
    ? 'Create your business account'
    : 'Sign in to your workspace';

  el('#authDescription').textContent = registrationMode
    ? 'Register your business, then create credentials for your applications.'
    : 'Use your business account to securely manage notifications and API credentials.';

  document
    .querySelectorAll('.register-only')
    .forEach((field) => field.classList.toggle('hidden', !registrationMode));

  el('#businessName').required = registrationMode;
  el('#authName').required = registrationMode;

  const password = el('#authPassword');
  password.autocomplete = registrationMode ? 'new-password' : 'current-password';
  password.placeholder = registrationMode ? 'At least 8 characters' : 'Enter your password';

  if (registrationMode) {
    password.minLength = 8;
  } else {
    password.removeAttribute('minlength');
  }

  setButtonLabel(el('#authSubmit'), registrationMode ? 'Create account' : 'Sign in');

  el('#toggleAuth').textContent = registrationMode
    ? 'I already have an account'
    : 'Create an account';

  el('#authMessage').textContent = '';
}

function openAuthDialog() {
  updateAuthForm();

  if (!authDialog.open) {
    authDialog.showModal();
  }
}

async function submitAuth(event) {
  event.preventDefault();

  const message = el('#authMessage');
  const submit = el('#authSubmit');

  if (state.mode === 'demo') {
    message.textContent =
      'This is a demo. Open the dashboard from your Notification Service address (for example http://localhost:5000) to sign in.';
    return;
  }

  const body = {
    email: el('#authEmail').value.trim(),
    password: el('#authPassword').value
  };

  if (registrationMode) {
    body.businessName = el('#businessName').value.trim();
    body.name = el('#authName').value.trim();
  }

  message.textContent = registrationMode ? 'Creating account…' : 'Signing in…';
  setBusy(submit, true);

  try {
    // The session cookie is set by the server; the token in the body is not kept
    const { user } = await request(
      `${API_BASE}${registrationMode ? '/auth/register' : '/auth/login'}`,
      { method: 'POST', body }
    );

    showToast(
      registrationMode
        ? 'Account created. Generate an API key to start integrating.'
        : 'Signed in successfully.'
    );

    // The account exists now, so any later prompt should be a sign-in
    registrationMode = false;
    el('#authPassword').value = '';
    authDialog.close();
    setSignedIn(user);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    setBusy(submit, false);
  }
}

// ---- Send notification ----

function selectedChannel() {
  const value = el('#notificationForm').elements.channel.value;
  return CHANNELS[value] ? value : 'email';
}

function updateChannelFields() {
  const channel = selectedChannel();
  const settings = CHANNELS[channel];

  el('#recipientLabel').textContent = settings.recipientLabel;

  const recipient = el('#recipientInput');
  recipient.type = settings.inputType;
  recipient.placeholder = settings.placeholder;

  if (channel === 'sms') {
    recipient.pattern = String.raw`\+[1-9][0-9]{7,14}`;
    recipient.title = 'International format, e.g. +2348012345678';
  } else {
    recipient.removeAttribute('pattern');
    recipient.removeAttribute('title');
  }

  el('#subjectInput').required = channel === 'email';
  el('#subjectHint').textContent =
    channel === 'email' ? '(required for email)' : '(optional)';

  el('#messageInput').maxLength = channel === 'sms' ? 1600 : 5000;
  el('#messageHint').textContent =
    channel === 'sms'
      ? 'SMS messages are limited to 1,600 characters. Carrier fees may apply.'
      : 'Up to 5,000 characters.';
}

function buildNotification(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const settings = CHANNELS[selectedChannel()];
  const text = (name) => String(values[name] || '').trim();

  const body = {
    channel: settings.api,
    recipient: { [settings.recipientField]: text('recipient') },
    message: text('message')
  };

  if (text('subject')) {
    body.subject = text('subject');
  }

  if (text('referenceId')) {
    body.metadata = { referenceId: text('referenceId') };
  }

  return body;
}

function resetSendForm(form) {
  form.reset();
  form.elements.channel.value = 'email';
  updateChannelFields();
}

async function sendNotification(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const output = el('#formMessage');
  const button = el('#sendButton');
  const body = buildNotification(form);

  if (state.mode === 'demo') {
    state.demo.unshift({
      id: `ntf_${randomId().slice(0, 6)}`,
      subject: body.subject,
      message: body.message,
      channel: body.channel,
      to: Object.values(body.recipient)[0],
      status: 'PENDING',
      createdAt: new Date().toISOString()
    });

    resetSendForm(form);
    output.textContent = 'Demo notification added. Open the dashboard from your Notification Service to send it for real.';
    refreshDashboard();
    return;
  }

  if (!hasBusiness()) {
    output.textContent = 'Sign in with a business account to send notifications.';
    openAuthDialog();
    return;
  }

  // Reused if this same send is retried (e.g. after a timeout), so it is never delivered twice
  state.idempotencyKey = state.idempotencyKey || randomId();

  output.textContent = 'Sending…';
  setBusy(button, true);

  try {
    const { notification } = await callApi('/notifications', {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': state.idempotencyKey }
    });

    state.idempotencyKey = null;
    resetSendForm(form);
    output.textContent = `Notification ${notification.id} queued for delivery.`;
    refreshDashboard();
  } catch (error) {
    output.textContent = `Unable to send: ${error.message}`;
  } finally {
    setBusy(button, false);
  }
}

// ---- API keys ----

async function generateKey() {
  const name = el('#keyName').value.trim() || 'Dashboard key';
  const button = el('#generateKey');

  if (state.mode === 'demo') {
    state.apiKeys.unshift(sampleApiKey(name));
    showSecret(`ns_sk_demo${randomId()}`);
    el('#keyName').value = '';
    renderApiKeys();
    showToast('Demo key generated. It does not work against a real API.');
    return;
  }

  if (!hasBusiness()) {
    openAuthDialog();
    return;
  }

  setBusy(button, true);

  try {
    const { apiKey } = await callApi('/api-keys', { method: 'POST', body: { name } });

    showSecret(apiKey.apiSecret);
    el('#keyName').value = '';
    await loadApiKeys();
    showToast('API key created. Copy the secret now; it is shown only once.');
  } catch (error) {
    showToast(`Could not generate a key: ${error.message}`);
  } finally {
    setBusy(button, false);
  }
}

async function revokeKey(key = activeKey()) {
  if (!key) {
    return;
  }

  const confirmed = window.confirm(
    `Revoke "${key.name}" (${key.keyId})? Applications using it will stop working immediately.`
  );

  if (!confirmed) {
    return;
  }

  if (state.mode === 'demo') {
    key.revokedAt = new Date().toISOString();
    hideSecret();
    renderApiKeys();
    showToast('Demo key revoked.');
    return;
  }

  try {
    await callApi(`/api-keys/${encodeURIComponent(key.id)}`, { method: 'DELETE' });

    hideSecret();
    await loadApiKeys();
    showToast('API key revoked. Requests using it are now rejected.');
  } catch (error) {
    showToast(`Could not revoke the key: ${error.message}`);
  }
}

// ---- Events ----

document.querySelectorAll('[data-view]').forEach((link) =>
  link.addEventListener('click', (event) => {
    event.preventDefault();
    setView(link.dataset.view);
  })
);

document.querySelectorAll('[data-go-to]').forEach((button) =>
  button.addEventListener('click', () => setView(button.dataset.goTo))
);

window.addEventListener('hashchange', () => setView(location.hash.slice(1)));

el('#menuButton').addEventListener('click', () =>
  el('.sidebar').classList.toggle('open')
);

el('#accountButton').addEventListener('click', () => {
  if (state.user) {
    signOut();
  } else {
    openAuthDialog();
  }
});

el('#activitySearch').addEventListener('input', () => {
  window.clearTimeout(loadActivity.timer);
  loadActivity.timer = window.setTimeout(loadActivity, SEARCH_DEBOUNCE_MS);
});

el('#statusFilter').addEventListener('change', loadActivity);
el('#refreshActivity').addEventListener('click', loadActivity);

const notificationForm = el('#notificationForm');

notificationForm.addEventListener('submit', sendNotification);
notificationForm.addEventListener('change', (event) => {
  if (event.target.name === 'channel') {
    updateChannelFields();
  }
});
// Edited content is a new notification, so it gets a new Idempotency-Key
notificationForm.addEventListener('input', () => {
  state.idempotencyKey = null;
});

el('#authForm').addEventListener('submit', submitAuth);
el('#authDialog .dialog-close').addEventListener('click', () => authDialog.close());
authDialog.addEventListener('click', (event) => {
  if (event.target === authDialog) {
    authDialog.close();
  }
});
el('#toggleAuth').addEventListener('click', () => {
  registrationMode = !registrationMode;
  updateAuthForm();
});

el('#copyKey').addEventListener('click', () => {
  const key = activeKey();

  if (key) {
    copyText(key.keyId, 'API key copied.');
  }
});
el('#copySecret').addEventListener('click', () =>
  copyText(el('#apiSecretDisplay').textContent, 'API secret copied.')
);
el('#copySnippet').addEventListener('click', () =>
  copyText(el('#codeSnippet').textContent, 'Code sample copied.')
);
el('#generateKey').addEventListener('click', generateKey);
el('#revokeKey').addEventListener('click', () => revokeKey());

// ---- Start ----

async function init() {
  updateChannelFields();
  renderApiKeys();
  setView(location.hash.slice(1));

  if (!(await detectBackend())) {
    startDemo();
    return;
  }

  state.mode = 'live';

  try {
    const { user } = await request(`${API_BASE}/auth/me`);
    setSignedIn(user);
  } catch {
    setSignedOut();
    openAuthDialog();
  }
}

init();
