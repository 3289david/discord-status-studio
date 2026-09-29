// One API surface for both hosts:
//  - Windows app: Electron preload exposes window.studio (IPC)
//  - Linux server: HTTP + Server-Sent Events (relative URLs so reverse-proxy subpaths work)

export class AuthError extends Error {}

function desktopApi(studio) {
  return {
    kind: 'desktop',
    call: (method, ...args) => studio.call(method, args),
    onSnapshot: (cb) => studio.onSnapshot(cb),
    onNavigate: (cb) => studio.onNavigate?.(cb),
    session: async () => ({ authed: true }),
    desktop: studio,
  };
}

function webApi() {
  async function request(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'dss' },
      ...opts,
    });
    if (res.status === 401) throw new AuthError('로그인이 필요합니다');
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  }
  let es = null;
  return {
    kind: 'web',
    async call(method, ...args) {
      const j = await request('api/call', { method: 'POST', body: JSON.stringify({ method, args }) });
      return j.result;
    },
    onSnapshot(cb) {
      es?.close();
      es = new EventSource('api/events');
      es.addEventListener('snapshot', (e) => cb(JSON.parse(e.data)));
      es.onerror = () => {
        // EventSource reconnects on its own; nothing to do.
      };
    },
    session: () => request('api/session'),
    login: (password) => request('api/login', { method: 'POST', body: JSON.stringify({ password }) }),
    logout: () => request('api/logout', { method: 'POST', body: '{}' }),
    changePassword: (current, next) => request('api/password', { method: 'POST', body: JSON.stringify({ current, next }) }),
    listTokens: () => request('api/tokens'),
    createToken: (name) => request('api/tokens', { method: 'POST', body: JSON.stringify({ name }) }),
    revokeToken: (id) => request(`api/tokens/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    async upload(file) {
      const res = await fetch(`api/upload?name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': file.type || 'application/octet-stream', 'x-requested-with': 'dss' },
        body: file,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      return j;
    },
    serverInfo: () => request('api/info'),
  };
}

export function createApi() {
  return window.studio ? desktopApi(window.studio) : webApi();
}
