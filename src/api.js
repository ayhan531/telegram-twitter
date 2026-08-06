// Tüm sunucu istekleri buradan geçiyor: uygulama parolası tanımlıysa her
// isteğe başlığı ekliyoruz ve 401 geldiğinde giriş ekranını tetikliyoruz.

const KEY = 'omnisync_app_password';

export function getPassword() {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

export function setPassword(p) {
  try { localStorage.setItem(KEY, p); } catch { /* özel mod: bellekte kalsın */ }
}

export function clearPassword() {
  try { localStorage.removeItem(KEY); } catch { /* yoksay */ }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

// Uygulamada onlarca fetch çağrısı var; birini atlayıp sessizce 401 almak
// yerine başlığı tek noktadan, /api isteklerinin hepsine ekliyoruz.
export function installFetchInterceptor() {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const isOwnApi = url.startsWith('/api');
    if (!isOwnApi) return original(input, init);

    const pw = getPassword();
    const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined) || {});
    if (pw) headers.set('x-app-password', pw);

    const res = await original(input, { ...init, headers });
    if (res.status === 401) {
      // Parola değişmiş ya da hiç girilmemiş: yeniden sor.
      let needsAuth = true;
      try {
        needsAuth = (await res.clone().json())?.authRequired !== false;
      } catch { /* gövde JSON değilse varsayılanı koru */ }
      if (needsAuth) {
        clearPassword();
        onUnauthorized();
      }
    }
    return res;
  };
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const pw = getPassword();
  if (pw) headers['x-app-password'] = pw;

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401) {
    clearPassword();
    onUnauthorized();
    throw new Error('Uygulama parolası gerekli.');
  }
  return res;
}

export async function apiJson(path, options) {
  const res = await api(path, options);
  return res.json();
}
