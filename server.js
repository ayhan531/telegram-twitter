import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import { Scraper } from 'agent-twitter-client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1); // Render terminates TLS upstream; trust X-Forwarded-Proto so req.protocol is 'https'

// ─── Server-side credentials (set in Render Environment Variables) ──────────
// TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET
// TELEGRAM_API_ID,   TELEGRAM_API_HASH
// These are NEVER exposed to the frontend.

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── In-memory stores ────────────────────────────────────────────────────────
const twitterOAuthSessions = new Map();
const tgQRSessions        = new Map();
const tgActiveSessions    = new Map(); // accountId -> { client, sessionString, accountName }
const syncRulesStore      = new Map(); // ruleId -> rule object
const recentlySynced      = new Set(); // messageId -> to prevent double-posting
const syncLog             = [];        // audit trail for auto-sync attempts (Telegram msg -> Twitter etc.)

// ─── Disk persistence ────────────────────────────────────────────────────────
// So a plain server restart (crash, redeploy) doesn't force the user to
// reconnect Telegram/rescan a QR — the frontend heartbeat covers the case
// where a browser tab is open, this covers it even when no one is looking.
// On Render this survives restarts of the same instance; it only survives a
// full redeploy too if DATA_DIR points at an attached persistent Disk.
const DATA_DIR   = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

function saveState() {
  try {
    // This file holds Telegram session strings and Twitter session cookies
    // in the clear — restrict it to the owning process's user only.
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    const sessions = [...tgActiveSessions.values()].map(s => ({
      accountId: s.accountId, accountName: s.accountName,
      sessionString: s.sessionString, apiId: s.apiId, apiHash: s.apiHash,
    }));
    const rules = [...syncRulesStore.values()];
    fs.writeFileSync(STATE_FILE, JSON.stringify({ sessions, rules }, null, 2), { mode: 0o600 });
    fs.chmodSync(STATE_FILE, 0o600); // writeFileSync's mode only applies when creating the file, not on overwrite
  } catch (e) {
    console.error('[Persist] Failed to save state:', e.message);
  }
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return { sessions: [], rules: [] };
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { sessions: parsed.sessions || [], rules: parsed.rules || [] };
  } catch (e) {
    console.error('[Persist] Failed to load state:', e.message);
    return { sessions: [], rules: [] };
  }
}

function pushSyncLog(entry) {
  syncLog.unshift({ id: `synclog-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: new Date().toLocaleString('tr-TR'), ...entry });
  if (syncLog.length > 200) syncLog.length = 200;
}

// ═══════════════════════════════════════════════════════════════════════════
//  HEALTH + CONFIG (tells frontend which services are ready)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/health', (_req, res) => {
  res.json({ status: 'online', app: 'OmniSync Social', version: '3.2.0' });
});

app.get('/api/config', async (_req, res) => {
  const telegramReady = true;
  
  const ck  = process.env.TWITTER_CONSUMER_KEY || process.env.TWITTER_API_KEY;
  const cs  = process.env.TWITTER_CONSUMER_SECRET || process.env.TWITTER_API_SECRET;
  const at  = process.env.TWITTER_ACCESS_TOKEN;
  const ats = process.env.TWITTER_ACCESS_TOKEN_SECRET;

  let autoTwitterAccount = null;
  if (ck && cs && at && ats) {
    try {
      const url = 'https://api.twitter.com/1.1/account/verify_credentials.json';
      const auth = buildOAuth1Header('GET', url, ck, cs, at, ats);
      const r = await fetch(url, { headers: { Authorization: auth } });
      const d = await r.json();
      if (r.ok && (d.screen_name || d.name)) {
        autoTwitterAccount = {
          id: 'acc-env-twitter',
          platform: 'twitter',
          name: d.name || d.screen_name || 'Twitter Hesabı',
          username: `@${d.screen_name}`,
          status: 'connected',
          avatarColor: 'bg-neutral-800',
          credentials: { consumerKey: ck, consumerSecret: cs, accessToken: at, accessTokenSecret: ats }
        };
      }
    } catch (e) {}
  }

  res.json({
    telegramReady,
    autoTwitterAccount,
  });
});



// ═══════════════════════════════════════════════════════════════════════════
//  TELEGRAM ─ BOT API (test + send)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/telegram/test-bot', async (req, res) => {
  const { botToken } = req.body;
  if (!botToken) return res.status(400).json({ success: false, error: 'Bot Token gerekli.' });
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await r.json();
    if (data.ok) return res.json({ success: true, botInfo: { id: data.result.id, name: data.result.first_name, username: `@${data.result.username}` } });
    return res.status(400).json({ success: false, error: data.description || 'Geçersiz Bot Token' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/telegram/send', async (req, res) => {
  const { botToken, chatId, text, mediaUrl } = req.body;
  if (!botToken || !chatId || !text) return res.status(400).json({ success: false, error: 'botToken, chatId ve text gerekli.' });
  try {
    const endpoint = mediaUrl
      ? `https://api.telegram.org/bot${botToken}/sendPhoto`
      : `https://api.telegram.org/bot${botToken}/sendMessage`;
    const payload = mediaUrl
      ? { chat_id: chatId, photo: mediaUrl, caption: text }
      : { chat_id: chatId, text };
    const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await r.json();
    if (data.ok) return res.json({ success: true, messageId: data.result.message_id });
    return res.status(400).json({ success: false, error: data.description });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  TELEGRAM ─ QR LOGIN (gramjs user session)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/telegram/qr/start', async (req, res) => {
  // Prefer server env vars; fall back to body or standard Telegram app keys
  const apiId   = process.env.TELEGRAM_API_ID   || req.body.apiId   || '2040';
  const apiHash = process.env.TELEGRAM_API_HASH || req.body.apiHash || 'b18441a1ed607e10e4b39251a1319a14';


  const sessionId = crypto.randomBytes(16).toString('hex');
  const sessionData = { status: 'starting', qrDataUrl: null, sessionString: null, user: null, error: null };
  tgQRSessions.set(sessionId, sessionData);

  // Lazy-load gramjs to avoid startup cost
  try {
    const { TelegramClient } = await import('teleproto');
    const { StringSession } = await import('teleproto/sessions/index.js');
    const QRCode = await import('qrcode');

    const client = new TelegramClient(new StringSession(''), parseInt(apiId, 10), apiHash, {
      connectionRetries: 5,
      useWSS: true,
    });

    await client.connect();
    sessionData.client = client;

    // Start QR sign-in flow (async, fires callbacks)
    client.signInUserWithQrCode(
      { apiId: parseInt(apiId, 10), apiHash },
      {
        qrCode: async (code) => {
          try {
            const tokenB64 = Buffer.from(code.token).toString('base64url');
            const tgUrl = `tg://login?token=${tokenB64}`;
            sessionData.qrDataUrl = await QRCode.default.toDataURL(tgUrl, { width: 256, margin: 2 });
            sessionData.status = 'awaiting_scan';
          } catch (e) {
            sessionData.error = e.message;
            sessionData.status = 'error';
          }
        },
        password: async () => {
          // 2FA: we can't handle interactively here, reject
          throw new Error('2FA şifresi desteklenmiyor. Telegram > Ayarlar > Gizlilik > İki Adımlı Doğrulama\'yı geçici olarak kapatın.');
        },
        onError: async (err) => {
          sessionData.error = err.message;
          sessionData.status = 'error';
          return true;
        },
      }
    ).then(async (user) => {
      sessionData.sessionString = client.session.save();
      sessionData.status = 'authorized';
      sessionData.user = {
        id: user.id.toString(),
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || '',
        phone: user.phone || '',
      };
    }).catch((err) => {
      if (sessionData.status !== 'authorized') {
        sessionData.error = err.message;
        sessionData.status = 'error';
      }
    });

    // Wait up to 4s for first QR to be generated
    for (let i = 0; i < 40; i++) {
      if (sessionData.qrDataUrl || sessionData.status === 'error') break;
      await new Promise(r => setTimeout(r, 100));
    }

    return res.json({ success: true, sessionId, qrDataUrl: sessionData.qrDataUrl, status: sessionData.status, error: sessionData.error });
  } catch (err) {
    sessionData.status = 'error';
    sessionData.error = err.message;
    return res.status(500).json({ success: false, error: 'gramjs yüklenemedi: ' + err.message });
  }
});

app.get('/api/telegram/qr/poll', (req, res) => {
  const { sessionId } = req.query;
  const s = tgQRSessions.get(sessionId);
  if (!s) return res.status(404).json({ success: false, error: 'Session bulunamadı.' });
  return res.json({
    success: true,
    status: s.status,
    qrDataUrl: s.qrDataUrl,
    sessionString: s.status === 'authorized' ? s.sessionString : null,
    user: s.user,
    error: s.error,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  TWITTER ─ OAuth 1.0a (API Key + Access Token — no redirect needed)
// ═══════════════════════════════════════════════════════════════════════════

// Build OAuth 1.0a Authorization header (RFC 5849 compliant)
function buildOAuth1Header(method, targetUrl, consumerKey, consumerSecret, accessToken, accessTokenSecret) {
  const urlObj = new URL(targetUrl);
  const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;

  const oauthParams = {
    oauth_consumer_key:     consumerKey.trim(),
    oauth_nonce:            crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            accessToken.trim(),
    oauth_version:          '1.0',
  };

  const allParams = { ...oauthParams };
  urlObj.searchParams.forEach((val, key) => {
    allParams[key] = val;
  });

  const paramString = Object.keys(allParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&');

  const baseString = `${method.toUpperCase()}&${encodeURIComponent(baseUrl)}&${encodeURIComponent(paramString)}`;
  const signingKey = `${encodeURIComponent(consumerSecret.trim())}&${encodeURIComponent(accessTokenSecret.trim())}`;
  oauthParams.oauth_signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  return 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');
}

// Verify credentials and get user info
app.post('/api/twitter/verify', async (req, res) => {
  const { consumerKey, consumerSecret, accessToken, accessTokenSecret } = req.body;
  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret)
    return res.status(400).json({ success: false, error: 'Tüm 4 alan gerekli.' });
  try {
    // Try v1.1 verify_credentials first
    const url1 = 'https://api.twitter.com/1.1/account/verify_credentials.json';
    const auth1 = buildOAuth1Header('GET', url1, consumerKey, consumerSecret, accessToken, accessTokenSecret);
    const r1 = await fetch(url1, { headers: { Authorization: auth1 } });
    const data1 = await r1.json();
    
    if (r1.ok && (data1.screen_name || data1.name)) {
      return res.json({ success: true, user: { username: data1.screen_name, name: data1.name || data1.screen_name } });
    }

    // Fallback: try v2 users/me
    const url2 = 'https://api.twitter.com/2/users/me';
    const auth2 = buildOAuth1Header('GET', url2, consumerKey, consumerSecret, accessToken, accessTokenSecret);
    const r2 = await fetch(url2, { headers: { Authorization: auth2 } });
    const data2 = await r2.json();

    if (r2.ok && data2.data?.id) {
      return res.json({ success: true, user: data2.data });
    }

    const errDetail = (data1.errors && data1.errors[0]?.message) || data2.detail || data2.title || JSON.stringify(data1 || data2);
    return res.status(400).json({ success: false, error: errDetail });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// OAuth 2.0 access tokens expire after ~2h. We requested the
// `offline.access` scope at login time specifically so we'd get a
// refresh_token back — use it to silently mint a new access token instead
// of the automation quietly dying every couple of hours.
async function refreshTwitterOAuth2Token(refreshToken) {
  const clientId     = process.env.TWITTER_CLIENT_ID || 'UXdLRTNQNmxTVW1Fc1pwWVVmVmI6MTpjaQ';
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (clientSecret) headers['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;

  const r = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers,
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId }),
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) throw new Error(data.error_description || data.error || 'Token yenilenemedi.');
  return { accessToken: data.access_token, refreshToken: data.refresh_token || refreshToken };
}

// Send tweet (supports OAuth 1.0a, OAuth 2.0 Bearer with auto-refresh)
app.post('/api/twitter/send', async (req, res) => {
  const { consumerKey, consumerSecret, accessToken, accessTokenSecret, refreshToken, text } = req.body;
  if (!text) return res.status(400).json({ success: false, error: 'text gerekli.' });
  if (!accessToken) return res.status(400).json({ success: false, error: 'accessToken gerekli.' });

  const url = 'https://api.twitter.com/2/tweets';
  const isOAuth1 = !!(consumerKey && consumerSecret && accessTokenSecret);

  const post = async (token) => {
    const authHeader = isOAuth1
      ? buildOAuth1Header('POST', url, consumerKey, consumerSecret, accessToken, accessTokenSecret)
      : `Bearer ${token}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ text }),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };

  try {
    let { status, data } = await post(accessToken);
    let refreshedTokens = null;

    if (status === 401 && !isOAuth1 && refreshToken) {
      try {
        refreshedTokens = await refreshTwitterOAuth2Token(refreshToken);
        ({ status, data } = await post(refreshedTokens.accessToken));
      } catch (refreshErr) {
        return res.status(401).json({
          success: false,
          error: 'Twitter oturumunun süresi doldu ve otomatik yenileme başarısız oldu: ' + refreshErr.message + ' — Hesaplar sekmesinden Twitter\'ı OAuth ile yeniden bağla.',
        });
      }
    }

    if (status >= 200 && status < 300 && data.data?.id) {
      return res.json({ success: true, tweetId: data.data.id, ...(refreshedTokens ? { refreshedTokens } : {}) });
    }
    return res.status(400).json({ success: false, error: JSON.stringify(data.errors || data.detail || data) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  TWITTER ─ OAuth 2.0 PKCE 1-Click Login (Universal for unlimited accounts)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/twitter/oauth/start', (req, res) => {
  const clientId     = process.env.TWITTER_CLIENT_ID || 'UXdLRTNQNmxTVW1Fc1pwWVVmVmI6MTpjaQ';
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;

  const state        = crypto.randomBytes(16).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const redirectUri  = `${req.protocol}://${req.get('host')}/api/twitter/callback`;

  twitterOAuthSessions.set(state, { codeVerifier, clientId, clientSecret, redirectUri });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'tweet.read tweet.write users.read offline.access',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return res.redirect(`https://twitter.com/i/oauth2/authorize?${params}`);
});

app.get('/api/twitter/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.send(`<html><body style="background:#0f172a;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px;">
      <div style="font-size:48px">❌</div>
      <h2 style="margin:0">Twitter Yetkilendirme Hatası</h2>
      <p style="color:#94a3b8;margin:0">${error}</p>
      <script>window.opener && window.opener.postMessage({ type:'TWITTER_AUTH_ERROR', error:'${error}' }, '*');</script>
    </body></html>`);
  }

  const session = twitterOAuthSessions.get(state);
  if (!session) {
    return res.send(`<html><body><script>
      window.opener && window.opener.postMessage({ type:'TWITTER_AUTH_ERROR', error:'Session süresi doldu.' }, '*');
      window.close();
    </script></body></html>`);
  }
  twitterOAuthSessions.delete(state);

  try {
    const { codeVerifier, clientId, clientSecret, redirectUri } = session;

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (clientSecret) {
      headers['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    }

    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        client_id: clientId,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error_description || JSON.stringify(tokenData));

    // Get user info
    const userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=name,username', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const userData = await userRes.json();
    const twitterUser = userData.data || {};

    const payload = JSON.stringify({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || '',
      username: twitterUser.username || 'Twitter',
      name: twitterUser.name || 'Twitter Hesabı',
    });

    return res.send(`<html><body><script>
      window.opener && window.opener.postMessage({ type:'TWITTER_AUTH_SUCCESS', payload: ${JSON.stringify(payload)} }, '*');
      window.close();
    </script><p style="font-family:sans-serif;text-align:center;padding:40px;color:green;">✅ Twitter hesabı başarıyla bağlandı! Bu pencere kapanıyor...</p></body></html>`);
  } catch (err) {
    return res.send(`<html><body style="background:#0f172a;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px;">
      <div style="font-size:48px">❌</div>
      <h2 style="margin:0">Twitter Bağlantı Hatası</h2>
      <p style="color:#f43f5e">${err.message}</p>
      <script>window.opener && window.opener.postMessage({ type:'TWITTER_AUTH_ERROR', error:${JSON.stringify(err.message)} }, '*');</script>
    </body></html>`);
  }
});





// ═══════════════════════════════════════════════════════════════════════════
//  TWITTER ─ Free "no developer account" login (username + password → cookies)
//  Uses Twitter's own web session (like logging in from a browser) instead of
//  the paid Twitter Developer API. No client id / API key needed at all.
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/twitter/free-login', async (req, res) => {
  const { username, password, email, twoFactorSecret } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Kullanıcı adı ve şifre gerekli.' });
  }
  try {
    const scraper = new Scraper();
    await scraper.login(username.trim(), password, email?.trim() || undefined, twoFactorSecret?.trim() || undefined);

    const cookies = (await scraper.getCookies()).map(c => c.toString());
    if (!cookies.some(c => /^auth_token=/.test(c))) {
      throw new Error('Giriş başarısız. Kullanıcı adı/şifreyi kontrol et.');
    }

    // Real authenticated check (this hits verify_credentials.json using the
    // now-established user session, not the guest-token login flow — it
    // actually confirms Twitter accepts these cookies for authenticated
    // requests, instead of just trusting that login() didn't throw).
    const loggedIn = await scraper.isLoggedIn();
    if (!loggedIn) {
      throw new Error('Oturum doğrulanamadı. Twitter bu çerezleri reddetti — "Çerezle Bağlan" sekmesini kullanmayı dene.');
    }
    const profile = await scraper.me();

    return res.json({
      success: true,
      user: {
        username: profile?.username || username.trim(),
        name: profile?.name || profile?.username || username.trim(),
      },
      cookies,
    });
  } catch (err) {
    console.error('[Twitter free-login] failed:', err.message);
    let msg = err.message || 'Giriş başarısız.';
    if (/acid|arkose|challenge|LoginAcid|Denied login/i.test(msg)) {
      msg = 'X (Twitter) bu girişi şüpheli buldu ve ek doğrulama istiyor. Bu genellikle sunucu IP\'sinden otomatik giriş denemelerinde olur. Aşağıdaki "Çerezle Bağlan" sekmesini kullan — %100 çalışır ve şifreni hiç sunucuya göndermez.';
    } else if (/page does not exist|does not exist/i.test(msg)) {
      msg = 'X şu an bu otomatik giriş yöntemini engelliyor (sunucu IP\'si şüpheli görünüyor olabilir). Aşağıdaki "Çerezle Bağlan" sekmesini kullan — kesin çözüm.';
    }
    return res.status(400).json({ success: false, error: msg });
  }
});

// ── Cookie-paste login: the most reliable free method. The user logs into
// x.com in their own browser (so it looks like a normal human session, not
// a datacenter IP hitting Twitter's login flow) and pastes the auth_token +
// ct0 cookies here. No password ever touches our server.
app.post('/api/twitter/free-login-cookies', async (req, res) => {
  const { authToken, ct0, username } = req.body;
  if (!authToken || !ct0) {
    return res.status(400).json({ success: false, error: 'auth_token ve ct0 çerez değerleri gerekli.' });
  }
  const cleanUsername = username?.trim().replace(/^@/, '') || '';
  try {
    const scraper = new Scraper();
    await scraper.setCookies([
      `auth_token=${authToken.trim()}; Domain=twitter.com; Path=/`,
      `ct0=${ct0.trim()}; Domain=twitter.com; Path=/`,
    ]);

    // Actually verify these cookies authenticate — getProfile() works even
    // for logged-out guests, so it can't tell us whether tweeting will work.
    // isLoggedIn()/me() hit verify_credentials.json with the real session
    // and fail loudly (instead of silently) if the cookies are stale/wrong.
    const loggedIn = await scraper.isLoggedIn();
    if (!loggedIn) {
      throw new Error('Twitter bu çerezleri kabul etmedi. auth_token/ct0 süresi dolmuş olabilir — x.com\'da çıkış yapmadan (!) tekrar DevTools\'tan taze değerleri kopyala.');
    }
    const profile = await scraper.me();

    const cookies = (await scraper.getCookies()).map(c => c.toString());
    return res.json({
      success: true,
      user: {
        username: profile?.username || cleanUsername || 'twitter',
        name: profile?.name || profile?.username || cleanUsername || 'Twitter Hesabı',
      },
      cookies,
    });
  } catch (err) {
    console.error('[Twitter free-login-cookies] failed:', err.message);
    return res.status(400).json({ success: false, error: err.message.includes('çerez') ? err.message : 'Çerezler geçersiz görünüyor: ' + err.message });
  }
});

// Send a tweet using stored session cookies (no API keys involved)
app.post('/api/twitter/free-send', async (req, res) => {
  const { cookies, text } = req.body;
  if (!cookies?.length || !text) return res.status(400).json({ success: false, error: 'cookies ve text gerekli.' });
  try {
    const scraper = new Scraper();
    await scraper.setCookies(cookies);
    const result = await scraper.sendTweet(text);
    let data = {};
    try { data = await result.json(); } catch (_) {}
    const tweetId = data?.data?.create_tweet?.tweet_results?.result?.rest_id;
    const errMsg = data?.errors?.[0]?.message;
    if (errMsg) return res.status(400).json({ success: false, error: errMsg });
    return res.json({ success: true, tweetId: tweetId || null });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  WHATSAPP ─ Send
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/whatsapp/send', async (req, res) => {
  const { accessToken, phoneNumberId, recipientPhone, text, mediaUrl } = req.body;
  if (!accessToken || !phoneNumberId || !recipientPhone || !text)
    return res.status(400).json({ success: false, error: 'Tüm alanlar gerekli.' });
  const cleanPhone = recipientPhone.replace(/\D/g, '');
  try {
    const body = mediaUrl
      ? { messaging_product: 'whatsapp', to: cleanPhone, type: 'image', image: { link: mediaUrl, caption: text } }
      : { messaging_product: 'whatsapp', to: cleanPhone, type: 'text', text: { body: text } };
    const r = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (r.ok && data.messages) return res.json({ success: true, messageId: data.messages[0]?.id });
    return res.status(400).json({ success: false, error: JSON.stringify(data.error || data) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  DISCORD ─ Test + Send
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/discord/test-webhook', async (req, res) => {
  const { webhookUrl } = req.body;
  if (!webhookUrl?.startsWith('https://discord.com/api/webhooks/'))
    return res.status(400).json({ success: false, error: 'Geçersiz Webhook URL' });
  try {
    const r = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '🤖 OmniSync: Webhook bağlantısı doğrulandı!' }) });
    if (r.ok || r.status === 204) return res.json({ success: true });
    return res.status(400).json({ success: false, error: 'Discord yanıt vermedi.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/discord/send', async (req, res) => {
  const { webhookUrl, username, text, mediaUrl } = req.body;
  if (!webhookUrl || !text) return res.status(400).json({ success: false, error: 'webhookUrl ve text gerekli.' });
  try {
    const payload = { username: username || 'OmniSync Social', content: text };
    if (mediaUrl) payload.embeds = [{ image: { url: mediaUrl } }];
    const r = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (r.ok || r.status === 204) return res.json({ success: true });
    return res.status(400).json({ success: false, error: await r.text() });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  BROADCAST DISPATCH
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/dispatch', async (req, res) => {
  const { accounts, text, mediaUrl } = req.body;
  if (!accounts?.length || !text) return res.status(400).json({ success: false, error: 'accounts ve text gerekli.' });

  const base = `${req.protocol}://${req.get('host')}`;
  const results = [];

  for (const acc of accounts) {
    try {
      const c = acc.credentials || {};
      let r, result;

      if (acc.platform === 'telegram') {
        r = await fetch(`${base}/api/telegram/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botToken: c.botToken, chatId: c.chatId, text, mediaUrl }) });
        result = await r.json();
      } else if (acc.platform === 'twitter') {
        if (c.cookies?.length) {
          // Free cookie-session login (no developer API)
          r = await fetch(`${base}/api/twitter/free-send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cookies: c.cookies, text }) });
        } else {
          // OAuth 1.0a: use consumerKey + accessToken, or OAuth2 bearer accessToken
          r = await fetch(`${base}/api/twitter/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consumerKey: c.consumerKey, consumerSecret: c.consumerSecret, accessToken: c.accessToken, accessTokenSecret: c.accessTokenSecret, refreshToken: c.refreshToken, text }) });
        }
        result = await r.json();
        // OAuth2 tokens auto-rotate on refresh — hand the new ones back so
        // the caller (frontend account state) doesn't keep using dead ones.
        if (result.refreshedTokens) result.updatedCredentials = result.refreshedTokens;
      } else if (acc.platform === 'whatsapp') {
        r = await fetch(`${base}/api/whatsapp/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: c.accessToken, phoneNumberId: c.phoneNumberId, recipientPhone: c.recipientPhone, text, mediaUrl }) });
        result = await r.json();
      } else if (acc.platform === 'discord') {
        r = await fetch(`${base}/api/discord/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ webhookUrl: c.webhookUrl, username: c.username, text, mediaUrl }) });
        result = await r.json();
      } else {
        result = { success: false, error: 'Desteklenmeyen platform: ' + acc.platform };
      }

      results.push({ accountId: acc.id, accountName: acc.name, platform: acc.platform, ...result });
    } catch (err) {
      results.push({ accountId: acc.id, accountName: acc.name, platform: acc.platform, success: false, error: err.message });
    }
  }

  return res.json({ success: true, results });
});

// ═══════════════════════════════════════════════════════════════════════════
//  TELEGRAM SESSION STORE (frontend pushes session after QR login)
// ═══════════════════════════════════════════════════════════════════════════

// Store a Telegram user session on the server so we can listen to messages.
// The frontend re-posts this on a heartbeat to self-heal after restarts, so
// we must NOT clobber an already-connected client — that would silently
// spin up a second listener alongside the first and double-post everything.
app.post('/api/telegram/session/store', (req, res) => {
  const { accountId, accountName, sessionString, apiId, apiHash } = req.body;
  if (!accountId || !sessionString) return res.status(400).json({ success: false, error: 'accountId ve sessionString gerekli.' });
  const existing = tgActiveSessions.get(accountId);
  tgActiveSessions.set(accountId, { accountId, accountName, sessionString, apiId, apiHash, client: existing?.client || null });
  saveState();
  return res.json({ success: true, message: 'Oturum sunucuya kaydedildi.' });
});

app.get('/api/telegram/session/list', (_req, res) => {
  const list = [...tgActiveSessions.entries()].map(([id, s]) => ({
    accountId: id,
    accountName: s.accountName,
    connected: !!s.client,
  }));
  res.json({ success: true, sessions: list });
});

// ═══════════════════════════════════════════════════════════════════════════
//  SYNC RULES ENGINE
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/sync/rules', (_req, res) => {
  res.json({ success: true, rules: [...syncRulesStore.values()] });
});

app.post('/api/sync/rules', (req, res) => {
  const rule = req.body;
  if (!rule?.id) return res.status(400).json({ success: false, error: 'rule.id gerekli.' });
  syncRulesStore.set(rule.id, { ...rule, enabled: rule.enabled !== false });
  saveState();
  return res.json({ success: true });
});

app.delete('/api/sync/rules/:id', (req, res) => {
  syncRulesStore.delete(req.params.id);
  saveState();
  return res.json({ success: true });
});

// Audit trail so the frontend can show WHY an auto-sync attempt succeeded,
// was filtered, or failed — otherwise those results only ever hit the
// server console and the user has no way to see them.
app.get('/api/sync/logs', (_req, res) => {
  res.json({ success: true, logs: syncLog });
});

// ─── Execute sync: called when a Telegram message arrives ──────────────────
async function executeSyncRule(rule, message, twitterAccounts) {
  if (!rule.enabled) return;

  const rawText = message.text || message.caption || '';
  const text = buildTweetText(rawText, rule);
  if (!text) {
    pushSyncLog({
      source: `Telegram → ${rule.title}`,
      messagePreview: (rawText || '(boş mesaj)').slice(0, 80),
      targets: (twitterAccounts || []).map(a => a.name),
      status: 'filtered',
      details: rawText.trim() ? 'Yasaklı kelime filtresine takıldı veya metin boş kaldı.' : 'Mesajda metin yok (sadece medya/diğer).',
    });
    return;
  }

  if (!twitterAccounts?.length) {
    pushSyncLog({
      source: `Telegram → ${rule.title}`,
      messagePreview: text.slice(0, 80),
      targets: [],
      status: 'error',
      details: 'Kuralda hedef hesap seçili değil.',
    });
    return;
  }

  const results = [];
  for (const twAcc of twitterAccounts) {
    try {
      const c = twAcc.credentials || {};
      const endpoint = c.cookies?.length ? 'free-send' : 'send';
      const body = c.cookies?.length
        ? { cookies: c.cookies, text }
        : { consumerKey: c.consumerKey, consumerSecret: c.consumerSecret, accessToken: c.accessToken, accessTokenSecret: c.accessTokenSecret, refreshToken: c.refreshToken, text };
      const r = await fetch(`http://localhost:${PORT}/api/twitter/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      console.log(`[Sync] Rule "${rule.title}" → Twitter @${twAcc.username}: ${d.success ? '✅' : '❌ ' + d.error}`);
      results.push({ account: twAcc.name, success: !!d.success, error: d.error });

      // Persist rotated OAuth2 tokens back into the stored rule so the next
      // auto-sync (and the next server restart, via disk) uses the live one
      // instead of the one that just expired.
      if (d.refreshedTokens) {
        twAcc.credentials.accessToken = d.refreshedTokens.accessToken;
        twAcc.credentials.refreshToken = d.refreshedTokens.refreshToken;
        saveState();
      }
    } catch (e) {
      console.error('[Sync] Twitter post error:', e.message);
      results.push({ account: twAcc.name, success: false, error: e.message });
    }
  }

  const failCount = results.filter(r => !r.success).length;
  pushSyncLog({
    source: `Telegram → ${rule.title}`,
    messagePreview: text.slice(0, 80),
    targets: twitterAccounts.map(a => a.name),
    status: failCount === 0 ? 'success' : (failCount === results.length ? 'error' : 'partial'),
    details: results.map(r => `${r.account}: ${r.success ? '✅ gönderildi' : '❌ ' + (r.error || 'bilinmeyen hata')}`).join(' · '),
  });
}

function buildTweetText(rawText, rule) {
  let text = rawText.trim();
  if (!text) return '';

  // Banned keywords filter
  if (rule.bannedKeywords) {
    const banned = rule.bannedKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    if (banned.some(k => text.toLowerCase().includes(k))) return '';
  }

  // Max 280 chars for tweets
  if (text.length > 270) text = text.slice(0, 267) + '...';

  // Auto hashtags
  if (rule.autoHashtags) {
    const tags = rule.autoHashtags.split(',').map(t => t.trim().replace(/^#?/, '#')).filter(Boolean).join(' ');
    if (text.length + tags.length + 1 <= 280) text += '\n' + tags;
  }

  return text;
}

// ─── Start Telegram listener for an account ────────────────────────────────
async function startTelegramListener(accountId) {
  const sess = tgActiveSessions.get(accountId);
  if (!sess || sess.client) return; // already running

  try {
    const { TelegramClient } = await import('teleproto');
    const { StringSession } = await import('teleproto/sessions/index.js');
    const { NewMessage } = await import('teleproto/events/index.js');

    const client = new TelegramClient(
      new StringSession(sess.sessionString),
      parseInt(sess.apiId || process.env.TELEGRAM_API_ID, 10),
      sess.apiHash || process.env.TELEGRAM_API_HASH,
      { connectionRetries: 5, useWSS: true }
    );
    await client.connect();
    sess.client = client;
    console.log(`[Telegram] Listener started for account ${accountId}`);

    client.addEventHandler(async (event) => {
      const msg = event.message;
      if (!msg) return;

      const msgKey = `${accountId}:${msg.id}`;
      if (recentlySynced.has(msgKey)) return;
      recentlySynced.add(msgKey);
      setTimeout(() => recentlySynced.delete(msgKey), 60000); // cleanup after 1 min

      // gramjs exposes the internal channelId/chatId (no sign, no -100
      // prefix), but the UI tells users to paste Telegram's *display* id
      // (e.g. -1001234567890). Normalize both sides the same way so they
      // actually compare equal.
      const chatId = msg.peerId?.channelId?.toString() ||
                     msg.peerId?.chatId?.toString() ||
                     msg.peerId?.userId?.toString() || '';
      const senderId = msg.fromId?.userId?.toString() || '';

      console.log(`[Telegram] New message from chatId=${chatId} senderId=${senderId}: ${(msg.text || '').slice(0, 80)}`);

      const accountRules = [...syncRulesStore.values()].filter(
        r => r.enabled && r.sourceAccountId === accountId
      );

      // Only resolve the chat's @username if some rule actually filters by it
      let chatUsername = null;
      if (accountRules.some(r => r.sourceChannelId?.trim().startsWith('@'))) {
        try {
          const chat = await msg.getChat();
          chatUsername = (chat?.username || '').toLowerCase();
        } catch (_) { /* ignore, falls through as no match for @-filters */ }
      }

      const matchingRules = accountRules.filter(rule => {
        // Channel filter
        const rawFilter = rule.sourceChannelId?.trim();
        if (rawFilter) {
          if (rawFilter.startsWith('@')) {
            if (rawFilter.slice(1).toLowerCase() !== chatUsername) return false;
          } else {
            const ruleChannelId = rawFilter.replace(/^-100/, '').replace(/^-/, '').replace(/[^0-9]/g, '');
            if (ruleChannelId && chatId !== ruleChannelId) return false;
          }
        }

        // Sender filter
        if (rule.allowedSenders?.trim()) {
          const allowed = rule.allowedSenders.split(',').map(s => s.trim()).filter(Boolean);
          if (!allowed.includes(senderId) && !allowed.includes(msg.sender?.username)) return false;
        }

        return true;
      });

      if (accountRules.length && !matchingRules.length) {
        console.log(`[Telegram] Message did not match any rule for account ${accountId} (chatId=${chatId}, chatUsername=${chatUsername || '-'})`);
      }

      for (const rule of matchingRules) {
        await executeSyncRule(rule, msg, rule.targetAccounts || []);
      }
    }, new NewMessage({}));

  } catch (e) {
    console.error(`[Telegram] Listener error for ${accountId}:`, e.message);
  }
}

app.post('/api/telegram/session/start-listener', async (req, res) => {
  const { accountId } = req.body;
  if (!tgActiveSessions.has(accountId)) return res.status(404).json({ success: false, error: 'Oturum bulunamadı.' });
  startTelegramListener(accountId);
  return res.json({ success: true, message: 'Dinleyici başlatıldı.' });
});

// ─── Manual trigger endpoint (for testing) ────────────────────────────────
app.post('/api/sync/test', async (req, res) => {
  const { ruleId, text } = req.body;
  const rule = syncRulesStore.get(ruleId);
  if (!rule) return res.status(404).json({ success: false, error: 'Kural bulunamadı.' });
  await executeSyncRule(rule, { text }, rule.targetAccounts || []);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Static frontend
// ═══════════════════════════════════════════════════════════════════════════
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));

// ─── Restore persisted state on boot: revive sync rules + reconnect any
// Telegram sessions we knew about before this restart, without waiting on
// the frontend heartbeat or the user reconnecting anything by hand.
function restoreState() {
  const { sessions, rules } = loadState();
  for (const rule of rules) syncRulesStore.set(rule.id, rule);
  for (const s of sessions) {
    tgActiveSessions.set(s.accountId, { ...s, client: null });
    startTelegramListener(s.accountId).catch(e => console.error(`[Persist] Restore listener failed for ${s.accountId}:`, e.message));
  }
  if (sessions.length || rules.length) {
    console.log(`[Persist] Restored ${sessions.length} Telegram session(s) and ${rules.length} sync rule(s) from disk.`);
  }
}
restoreState();

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 OmniSync Social v3.2 port ${PORT}`));
