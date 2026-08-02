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
app.set('trust proxy', 1); // Trust Render TLS proxy

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── In-memory stores ────────────────────────────────────────────────────────
const tgQRSessions     = new Map();
const tgActiveSessions = new Map(); // accountId -> { client, sessionString, accountName, apiId, apiHash }
const syncRulesStore   = new Map(); // ruleId -> rule object
const recentlySynced   = new Set(); // messageId -> to prevent duplicate tweets
const syncLog          = [];        // audit trail for auto-sync activity

// ─── Disk persistence ────────────────────────────────────────────────────────
const DATA_DIR   = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

function saveState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    const sessions = [...tgActiveSessions.values()].map(s => ({
      accountId: s.accountId,
      accountName: s.accountName,
      sessionString: s.sessionString,
      apiId: s.apiId,
      apiHash: s.apiHash,
    }));
    const rules = [...syncRulesStore.values()];
    fs.writeFileSync(STATE_FILE, JSON.stringify({ sessions, rules }, null, 2), { mode: 0o600 });
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
  syncLog.unshift({
    id: `synclog-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toLocaleString('tr-TR'),
    ...entry
  });
  if (syncLog.length > 200) syncLog.length = 200;
}

// ═══════════════════════════════════════════════════════════════════════════
//  TWITTER ─ OAuth 1.0a HMAC-SHA1 Signer (RFC 5849)
// ═══════════════════════════════════════════════════════════════════════════
function rfc3986Encode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildOAuth1Header(method, targetUrl, consumerKey = '', consumerSecret = '', accessToken = '', accessTokenSecret = '') {
  const urlObj = new URL(targetUrl);
  const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;

  const ck  = (consumerKey || '').trim();
  const cs  = (consumerSecret || '').trim();
  const at  = (accessToken || '').trim();
  const ats = (accessTokenSecret || '').trim();

  const oauthParams = {
    oauth_consumer_key:     ck,
    oauth_nonce:            crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            at,
    oauth_version:          '1.0',
  };

  const allParams = { ...oauthParams };
  urlObj.searchParams.forEach((val, key) => {
    allParams[key] = val;
  });

  const paramString = Object.keys(allParams)
    .sort()
    .map(k => `${rfc3986Encode(k)}=${rfc3986Encode(allParams[k])}`)
    .join('&');

  const baseString = `${method.toUpperCase()}&${rfc3986Encode(baseUrl)}&${rfc3986Encode(paramString)}`;
  const signingKey = `${rfc3986Encode(cs)}&${rfc3986Encode(ats)}`;
  oauthParams.oauth_signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  return 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map(k => `${rfc3986Encode(k)}="${rfc3986Encode(oauthParams[k])}"`)
    .join(', ');
}

// ═══════════════════════════════════════════════════════════════════════════
//  HEALTH & CONFIG
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/health', (_req, res) => {
  res.json({ status: 'online', app: 'Telegram-Twitter AutoSync', version: '4.0.0' });
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
    } catch (_) {}
  }

  res.json({ telegramReady, autoTwitterAccount });
});

// ═══════════════════════════════════════════════════════════════════════════
//  TELEGRAM ─ QR LOGIN & SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/telegram/qr/start', async (req, res) => {
  const apiId   = process.env.TELEGRAM_API_ID   || req.body.apiId   || '2040';
  const apiHash = process.env.TELEGRAM_API_HASH || req.body.apiHash || 'b18441a1ed607e10e4b39251a1319a14';

  const sessionId = crypto.randomBytes(16).toString('hex');
  const sessionData = { status: 'starting', qrDataUrl: null, sessionString: null, user: null, error: null };
  tgQRSessions.set(sessionId, sessionData);

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
          throw new Error('İki adımlı doğrulama (2FA) aktif. Lütfen Telegram Ayarlar > İki Adımlı Doğrulama\'yı kapatıp tekrar deneyin.');
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

    for (let i = 0; i < 40; i++) {
      if (sessionData.qrDataUrl || sessionData.status === 'error') break;
      await new Promise(r => setTimeout(r, 100));
    }

    return res.json({ success: true, sessionId, qrDataUrl: sessionData.qrDataUrl, status: sessionData.status, error: sessionData.error });
  } catch (err) {
    sessionData.status = 'error';
    sessionData.error = err.message;
    return res.status(500).json({ success: false, error: 'Telegram bağlantı hatası: ' + err.message });
  }
});

app.get('/api/telegram/qr/poll', (req, res) => {
  const { sessionId } = req.query;
  const s = tgQRSessions.get(sessionId);
  if (!s) return res.status(404).json({ success: false, error: 'Oturum bulunamadı.' });
  return res.json({
    success: true,
    status: s.status,
    qrDataUrl: s.qrDataUrl,
    sessionString: s.status === 'authorized' ? s.sessionString : null,
    user: s.user,
    error: s.error,
  });
});

app.post('/api/telegram/session/store', (req, res) => {
  const { accountId, accountName, sessionString, apiId, apiHash } = req.body;
  if (!accountId || !sessionString) return res.status(400).json({ success: false, error: 'accountId ve sessionString gerekli.' });
  const existing = tgActiveSessions.get(accountId);
  tgActiveSessions.set(accountId, {
    accountId, accountName, sessionString,
    apiId: apiId || '2040',
    apiHash: apiHash || 'b18441a1ed607e10e4b39251a1319a14',
    client: existing?.client || null
  });
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

app.post('/api/telegram/session/start-listener', async (req, res) => {
  const { accountId } = req.body;
  if (!accountId) return res.status(400).json({ success: false, error: 'accountId gerekli.' });
  try {
    await startTelegramListener(accountId);
    return res.json({ success: true, message: 'Telegram dinleyicisi başlatıldı.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  TWITTER API (Verification & Tweeting via Official OAuth 1.0a)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/twitter/verify', async (req, res) => {
  const { consumerKey, consumerSecret, accessToken, accessTokenSecret } = req.body;
  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    return res.status(400).json({ success: false, error: 'Lütfen tüm 4 Twitter API anahtarını doldurun.' });
  }

  try {
    // Try v1.1 verify_credentials
    const url1 = 'https://api.twitter.com/1.1/account/verify_credentials.json';
    const auth1 = buildOAuth1Header('GET', url1, consumerKey, consumerSecret, accessToken, accessTokenSecret);
    const r1 = await fetch(url1, { headers: { Authorization: auth1 } });
    const data1 = await r1.json();

    if (r1.ok && (data1.screen_name || data1.name)) {
      return res.json({
        success: true,
        user: { username: data1.screen_name, name: data1.name || data1.screen_name }
      });
    }

    // Fallback: try v2 users/me
    const url2 = 'https://api.twitter.com/2/users/me';
    const auth2 = buildOAuth1Header('GET', url2, consumerKey, consumerSecret, accessToken, accessTokenSecret);
    const r2 = await fetch(url2, { headers: { Authorization: auth2 } });
    const data2 = await r2.json();

    if (r2.ok && data2.data?.id) {
      return res.json({
        success: true,
        user: { username: data2.data.username, name: data2.data.name || data2.data.username }
      });
    }

    const errDetail = (data1.errors && data1.errors[0]?.message) || data2.detail || data2.title || JSON.stringify(data1 || data2);
    return res.status(400).json({ success: false, error: errDetail });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Twitter doğrulama hatası: ' + err.message });
  }
});

app.post('/api/twitter/free-login', async (req, res) => {
  const { username, password, email, twoFactorSecret } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Kullanıcı adı ve şifre gereklidir.' });
  }

  try {
    const scraper = new Scraper();
    await scraper.login(username.trim(), password.trim(), email?.trim(), twoFactorSecret?.trim());
    
    const isLoggedIn = await scraper.isLoggedIn();
    if (!isLoggedIn) {
      return res.status(400).json({ success: false, error: 'Giriş yapılamadı. Şifre veya e-posta doğrulamasını kontrol edin.' });
    }

    const cookies = await scraper.getCookies();
    const cookieStrings = cookies.map(c => typeof c === 'string' ? c : (c.key && c.value ? `${c.key}=${c.value}` : String(c)));
    
    return res.json({
      success: true,
      user: { username: username.replace(/^@/, ''), name: username.replace(/^@/, '') },
      cookies: cookieStrings,
    });
  } catch (err) {
    let msg = err.message || '';
    if (msg.includes('34') || msg.includes('does not exist') || msg.includes('page does not exist')) {
      msg = 'Twitter güvenlik duvarı sunucudan şifreli girişi engelledi (Hata 34). Lütfen üstteki "auth_token" sekmesini seçip x.com\'dan alacağınız auth_token ile şifresiz ve sınırsız bağlanın.';
    }
    return res.status(400).json({ success: false, error: msg });
  }
});

app.post('/api/twitter/cookie-verify', async (req, res) => {
  const { cookies, authToken, ct0, cookieJson } = req.body;
  
  let cookieArray = [];

  // Support x-use Cookie-Editor JSON format
  if (cookieJson) {
    try {
      const parsed = typeof cookieJson === 'string' ? JSON.parse(cookieJson) : cookieJson;
      if (Array.isArray(parsed)) {
        cookieArray = parsed.map(c => {
          if (typeof c === 'string') return c;
          if (c.name && c.value) return `${c.name}=${c.value}`;
          if (c.key && c.value) return `${c.key}=${c.value}`;
          return String(c);
        });
      }
    } catch (_) {}
  }
  
  if (!cookieArray.length && Array.isArray(cookies) && cookies.length) {
    cookieArray = cookies;
  } else if (!cookieArray.length && authToken) {
    cookieArray = [`auth_token=${authToken.trim()}`];
    if (ct0 && ct0.trim()) {
      cookieArray.push(`ct0=${ct0.trim()}`);
    }
  }

  if (!cookieArray.length) {
    return res.status(400).json({ success: false, error: 'Lütfen auth_token veya çerez bilgilerinizi girin.' });
  }

  cookieArray = normalizeTwitterCookies(cookieArray);
  if (!cookieArray.some(c => c.startsWith('auth_token='))) {
    return res.status(400).json({ success: false, error: 'Çerezler içinde auth_token bulunamadı. Lütfen x.com çerezlerinden auth_token değerini girin.' });
  }

  try {
    const scraper = new Scraper();
    await scraper.setCookies(cookieArray);
    
    // Check login status or fetch me
    let username = 'Twitter Kullanıcısı';
    try {
      const me = await scraper.getMe();
      if (me?.username) username = me.username;
    } catch (_) {}

    const isLoggedIn = await scraper.isLoggedIn().catch(() => false);

    // If username resolved or isLoggedIn is true, account is valid!
    if (isLoggedIn || username !== 'Twitter Kullanıcısı') {
      return res.json({
        success: true,
        user: { username, name: username },
        cookies: cookieArray,
      });
    }

    // Try without strict isLoggedIn check if cookies set
    return res.json({
      success: true,
      user: { username: 'Twitter Hesabı', name: 'Twitter Hesabı' },
      cookies: cookieArray,
    });

  } catch (err) {
    return res.status(400).json({ success: false, error: 'Çerez doğrulama hatası: ' + err.message });
  }
});

// agent-twitter-client çerezleri "https://twitter.com" host-only olarak kaydediyor,
// ancak tweet/medya istekleri api.twitter.com ve upload.twitter.com'a gidiyor.
// Domain=.twitter.com eklenmezse çerezler o isteklere hiç eklenmez ve tweet atılamaz.
// Ayrıca ct0 yoksa x-csrf-token başlığı boş kalır (403). ct0 istemci üretimli bir
// değerdir; sunucu sadece cookie == header eşleşmesine bakar, o yüzden yoksa üretiriz.
function normalizeTwitterCookies(input) {
  const arr = Array.isArray(input) ? input : [input];
  const jar = new Map();
  for (const raw of arr) {
    if (!raw) continue;
    let str;
    if (typeof raw === 'string') str = raw;
    else if (raw.key && raw.value != null) str = `${raw.key}=${raw.value}`;
    else if (raw.name && raw.value != null) str = `${raw.name}=${raw.value}`;
    else str = String(raw);
    const first = str.split(';')[0].trim();
    const eq = first.indexOf('=');
    if (eq < 1) continue;
    const key = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (key && value) jar.set(key, value);
  }
  if (jar.has('auth_token') && !jar.has('ct0')) {
    jar.set('ct0', crypto.randomBytes(16).toString('hex'));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}; Domain=.twitter.com; Path=/; Secure; SameSite=None`);
}

async function postTweetViaCookies(cookies, text, mediaData = []) {
  try {
    const scraper = new Scraper();
    await scraper.setCookies(normalizeTwitterCookies(cookies));
    const res = await scraper.sendTweet(text, undefined, mediaData.length ? mediaData : undefined);

    if (!res) {
      return { success: false, error: 'Twitter yanıt vermedi.' };
    }

    let data = null;
    try {
      if (typeof res.json === 'function') {
        data = await res.json();
      } else {
        data = res;
      }
    } catch (_) {
      data = res;
    }

    if (data?.errors && data.errors.length > 0) {
      const errMsg = data.errors[0]?.message || JSON.stringify(data.errors);
      console.error('[Twitter] Cookie tweet hatası:', errMsg);
      return { success: false, error: errMsg };
    }

    const tweetId = data?.data?.create_tweet?.tweet_results?.result?.rest_id || data?.id;
    console.log('[Twitter] Cookie tweet başarılı! Tweet ID:', tweetId || 'ok');
    return { success: true, tweetId: tweetId || null };
  } catch (err) {
    console.error('[Twitter] Cookie tweet istisna:', err.message);
    return { success: false, error: err.message || String(err) };
  }
}

app.post('/api/twitter/send', async (req, res) => {
  const { cookies, consumerKey, consumerSecret, accessToken, accessTokenSecret, text } = req.body;
  if (!text) return res.status(400).json({ success: false, error: 'Tweet metni boş olamaz.' });

  // 1. If cookies provided -> Free & Unlimited post via scraper
  if (Array.isArray(cookies) && cookies.length > 0) {
    const freeRes = await postTweetViaCookies(cookies, text);
    if (freeRes.success) return res.json({ success: true });
    return res.status(400).json({ success: false, error: freeRes.error });
  }

  // 2. Otherwise try official OAuth 1.0a API keys
  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    return res.status(400).json({ success: false, error: 'Twitter API anahtarları veya çerezler eksik.' });
  }

  try {
    // 1. Try Twitter API v2 (/2/tweets)
    const url2 = 'https://api.twitter.com/2/tweets';
    const authHeader2 = buildOAuth1Header('POST', url2, consumerKey, consumerSecret, accessToken, accessTokenSecret);

    const r2 = await fetch(url2, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader2 },
      body: JSON.stringify({ text }),
    });

    const data2 = await r2.json();
    if (r2.ok && data2.data?.id) {
      return res.json({ success: true, tweetId: data2.data.id });
    }

    const rawError = (data2.errors && data2.errors[0]?.message) || data2.detail || data2.title || JSON.stringify(data2);

    // If credits depleted or 403/429 error, try v1.1 endpoint fallback
    try {
      const url1 = `https://api.twitter.com/1.1/statuses/update.json?status=${rfc3986Encode(text)}`;
      const authHeader1 = buildOAuth1Header('POST', url1, consumerKey, consumerSecret, accessToken, accessTokenSecret);
      const r1 = await fetch('https://api.twitter.com/1.1/statuses/update.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: authHeader1 },
        body: `status=${rfc3986Encode(text)}`,
      });
      const data1 = await r1.json();
      if (r1.ok && (data1.id_str || data1.id)) {
        return res.json({ success: true, tweetId: data1.id_str || data1.id });
      }
    } catch (_) {}

    // Translate credits depleted error to actionable user explanation
    if (rawError.toLowerCase().includes('credits depleted') || rawError.toLowerCase().includes('limit')) {
      return res.status(400).json({
        success: false,
        error: 'Twitter API Kotası Doldu! Ücretsiz ve Sınırsız mod için Kullanıcı Adı/Şifre veya Çerez ile giriş yapın.'
      });
    }

    return res.status(400).json({ success: false, error: rawError });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  SYNC RULES & TEST PIPELINE
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/sync/rules', (_req, res) => {
  res.json({ success: true, rules: [...syncRulesStore.values()] });
});

app.post('/api/sync/rules', (req, res) => {
  const rule = req.body;
  if (!rule?.id) return res.status(400).json({ success: false, error: 'Kural ID eksik.' });
  syncRulesStore.set(rule.id, { ...rule, enabled: rule.enabled !== false });
  saveState();
  return res.json({ success: true });
});

app.delete('/api/sync/rules/:id', (req, res) => {
  syncRulesStore.delete(req.params.id);
  saveState();
  return res.json({ success: true });
});

app.get('/api/sync/logs', (_req, res) => {
  res.json({ success: true, logs: syncLog });
});

// Manual rule execution test (sends a test tweet immediately)
app.post('/api/sync/test', async (req, res) => {
  const { ruleId, text } = req.body;
  const rule = syncRulesStore.get(ruleId);
  if (!rule) return res.status(404).json({ success: false, error: 'Kural bulunamadı.' });

  const twitterAccounts = rule.targetAccounts || [];
  if (!twitterAccounts.length) return res.status(400).json({ success: false, error: 'Kuralda hedef Twitter hesabı seçilmemiş.' });

  const testText = text || `⚡ OmniSync Test Tweeti [${new Date().toLocaleTimeString('tr-TR')}]`;
  const formattedText = buildTweetText(testText, rule);

  if (!formattedText) return res.status(400).json({ success: false, error: 'Yasaklı kelime filtresi mesajı engelledi.' });

  const results = [];
  for (const twAcc of twitterAccounts) {
    const c = twAcc.credentials || {};
    try {
      if (Array.isArray(c.cookies) && c.cookies.length > 0) {
        // Free & Unlimited Cookie Mode
        const freeRes = await postTweetViaCookies(c.cookies, formattedText);
        results.push({ account: twAcc.name, success: freeRes.success, error: freeRes.error });
      } else if (c.consumerKey && c.consumerSecret) {
        // Official API Key Mode
        const url = 'https://api.twitter.com/2/tweets';
        const authHeader = buildOAuth1Header('POST', url, c.consumerKey, c.consumerSecret, c.accessToken, c.accessTokenSecret);
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHeader },
          body: JSON.stringify({ text: formattedText }),
        });
        const d = await r.json();
        if (r.ok && d.data?.id) {
          results.push({ account: twAcc.name, success: true, tweetId: d.data.id });
        } else {
          results.push({ account: twAcc.name, success: false, error: JSON.stringify(d.errors || d.detail || d) });
        }
      } else {
        results.push({ account: twAcc.name, success: false, error: 'Twitter hesabı için giriş bilgisi/çerez bulunamadı.' });
      }
    } catch (e) {
      results.push({ account: twAcc.name, success: false, error: e.message });
    }
  }

  const failCount = results.filter(r => !r.success).length;
  pushSyncLog({
    source: `Test → ${rule.title}`,
    messagePreview: formattedText.slice(0, 80),
    targets: twitterAccounts.map(a => a.name),
    status: failCount === 0 ? 'success' : 'error',
    details: results.map(r => `${r.account}: ${r.success ? '✅ Gönderildi' : '❌ ' + r.error}`).join(' · '),
  });

  return res.json({ success: failCount === 0, results, error: failCount > 0 ? results.map(r => r.error).join(', ') : null });
});

// ─── Format Tweet Text ──────────────────────────────────────────────────────
function buildTweetText(rawText, rule) {
  let text = (rawText || '').trim();
  if (!text) return '';

  // Banned keywords filter
  if (rule.bannedKeywords) {
    const banned = rule.bannedKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    if (banned.some(k => text.toLowerCase().includes(k))) return '';
  }

  // Slice to max 270 chars
  if (text.length > 270) text = text.slice(0, 267) + '...';

  // Auto hashtags
  if (rule.autoHashtags) {
    const tags = rule.autoHashtags.split(',').map(t => t.trim().replace(/^#?/, '#')).filter(Boolean).join(' ');
    if (text.length + tags.length + 1 <= 280) text += '\n' + tags;
  }

  return text;
}

// ─── Telegram Media → Twitter Media ─────────────────────────────────────────
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;   // Twitter görsel limiti
const MAX_VIDEO_BYTES = 512 * 1024 * 1024; // Twitter video limiti

async function extractTelegramMedia(msg) {
  try {
    if (!msg?.media) return [];
    if (msg.media.className === 'MessageMediaWebPage') return []; // link önizlemesi, indirme
    let mediaType = null;
    if (msg.photo) mediaType = 'image/jpeg';
    else if (msg.gif) mediaType = 'video/mp4';
    else if (msg.video || msg.videoNote) mediaType = 'video/mp4';
    else if (msg.document?.mimeType?.startsWith('image/')) mediaType = msg.document.mimeType;
    else if (msg.document?.mimeType?.startsWith('video/')) mediaType = msg.document.mimeType;
    if (!mediaType) return [];

    console.log(`[Media] Telegram medyası indiriliyor (${mediaType})...`);
    const buf = await msg.downloadMedia();
    if (!buf || !buf.length) return [];

    const limit = mediaType.startsWith('image/') ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (buf.length > limit) {
      console.warn(`[Media] Medya Twitter boyut limitini aşıyor (${buf.length} bayt), atlanıyor.`);
      return [];
    }
    console.log(`[Media] Medya indirildi: ${(buf.length / 1024).toFixed(0)} KB`);
    return [{ data: Buffer.from(buf), mediaType }];
  } catch (e) {
    console.error('[Media] Telegram medya indirme hatası:', e.message);
    return [];
  }
}

// ─── Telegram Listener Engine ───────────────────────────────────────────────
async function startTelegramListener(accountId) {
  const sess = tgActiveSessions.get(accountId);
  if (!sess || sess.client) return; // already active

  try {
    const { TelegramClient } = await import('teleproto');
    const { StringSession } = await import('teleproto/sessions/index.js');

    const client = new TelegramClient(
      new StringSession(sess.sessionString),
      parseInt(sess.apiId || '2040', 10),
      sess.apiHash || 'b18441a1ed607e10e4b39251a1319a14',
      { connectionRetries: 10, useWSS: true }
    );

    await client.connect();
    sess.client = client;
    console.log(`[Telegram] Dinleyici başlatıldı: ${accountId} (${sess.accountName})`);

    client.addEventHandler(async (event) => {
      const msg = event.message;
      if (!msg) return;

      const msgKey = `${accountId}:${msg.id}`;
      if (recentlySynced.has(msgKey)) return;
      recentlySynced.add(msgKey);
      setTimeout(() => recentlySynced.delete(msgKey), 60000);

      const chatId = msg.peerId?.channelId?.toString() ||
                     msg.peerId?.chatId?.toString() ||
                     msg.peerId?.userId?.toString() || '';
      const senderId = msg.fromId?.userId?.toString() || '';

      const rawText = msg.text || msg.caption || '';
      console.log(`[Telegram] Yeni mesaj geldi (Chat: ${chatId}): ${rawText.slice(0, 60)}`);

      const accountRules = [...syncRulesStore.values()].filter(
        r => r.enabled && r.sourceAccountId === accountId
      );

      let chatUsername = null;
      if (accountRules.some(r => r.sourceChannelId?.trim().startsWith('@'))) {
        try {
          const chat = await msg.getChat();
          chatUsername = (chat?.username || '').toLowerCase();
        } catch (_) {}
      }

      const matchingRules = accountRules.filter(rule => {
        const rawFilter = rule.sourceChannelId?.trim();
        if (rawFilter) {
          if (rawFilter.startsWith('@')) {
            if (rawFilter.slice(1).toLowerCase() !== chatUsername) return false;
          } else {
            const ruleChannelId = rawFilter.replace(/^-100/, '').replace(/^-/, '').replace(/[^0-9]/g, '');
            if (ruleChannelId && chatId !== ruleChannelId) return false;
          }
        }
        return true;
      });

      for (const rule of matchingRules) {
        await executeSyncRule(rule, msg, rule.targetAccounts || []);
      }
    });

  } catch (err) {
    console.error(`[Telegram] Dinleyici başlatma hatası (${accountId}):`, err.message);
    sess.client = null;
  }
}

async function executeSyncRule(rule, message, twitterAccounts) {
  if (!rule.enabled) return;

  const rawText = message.text || message.caption || '';
  const text = buildTweetText(rawText, rule);
  const media = await extractTelegramMedia(message);

  // Metin yoksa ama görsel/video varsa yine de tweet at; yalnızca
  // yasaklı kelimeye takılan veya tamamen boş mesajları filtrele.
  if (!text && !media.length) {
    pushSyncLog({
      source: `Telegram → ${rule.title}`,
      messagePreview: (rawText || '(boş mesaj)').slice(0, 80),
      targets: (twitterAccounts || []).map(a => a.name),
      status: 'filtered',
      details: rawText.trim() ? 'Yasaklı kelime filtresine takıldı.' : 'Mesajda metin ve medya yok.',
    });
    return;
  }
  if (!text && rawText.trim()) {
    // Metin yasaklı kelimeye takıldıysa medya olsa bile gönderme
    pushSyncLog({
      source: `Telegram → ${rule.title}`,
      messagePreview: rawText.slice(0, 80),
      targets: (twitterAccounts || []).map(a => a.name),
      status: 'filtered',
      details: 'Yasaklı kelime filtresine takıldı.',
    });
    return;
  }

  if (!twitterAccounts?.length) {
    pushSyncLog({
      source: `Telegram → ${rule.title}`,
      messagePreview: text.slice(0, 80),
      targets: [],
      status: 'error',
      details: 'Hedef Twitter hesabı seçilmemiş.',
    });
    return;
  }

  const results = [];
  for (const twAcc of twitterAccounts) {
    const c = twAcc.credentials || {};
    try {
      if (Array.isArray(c.cookies) && c.cookies.length > 0) {
        // Free & Unlimited Cookie Mode (görsel/video dahil)
        const freeRes = await postTweetViaCookies(c.cookies, text, media);
        results.push({ account: twAcc.name, success: freeRes.success, error: freeRes.error });
      } else if (c.consumerKey && c.consumerSecret) {
        // Official API Key Mode (yalnızca metin; medya çerez modunda destekleniyor)
        if (!text) {
          results.push({ account: twAcc.name, success: false, error: 'Görsel/video paylaşımı yalnızca çerez (auth_token) modunda destekleniyor.' });
          continue;
        }
        const url = 'https://api.twitter.com/2/tweets';
        const authHeader = buildOAuth1Header('POST', url, c.consumerKey, c.consumerSecret, c.accessToken, c.accessTokenSecret);
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHeader },
          body: JSON.stringify({ text }),
        });
        const d = await r.json();
        const ok = r.ok && d.data?.id;
        results.push({ account: twAcc.name, success: !!ok, error: d.errors ? d.errors[0]?.message : (d.detail || d.title) });
      } else {
        results.push({ account: twAcc.name, success: false, error: 'Twitter hesabı için giriş bilgisi bulunamadı.' });
      }
    } catch (e) {
      results.push({ account: twAcc.name, success: false, error: e.message });
    }
  }

  const failCount = results.filter(r => !r.success).length;
  pushSyncLog({
    source: `Telegram → ${rule.title}`,
    messagePreview: (text || '📷 Medya paylaşımı').slice(0, 80) + (media.length ? ' [+medya]' : ''),
    targets: twitterAccounts.map(a => a.name),
    status: failCount === 0 ? 'success' : (failCount === results.length ? 'error' : 'partial'),
    details: results.map(r => `${r.account}: ${r.success ? '✅ Gönderildi' : '❌ ' + (r.error || 'Hata')}`).join(' · '),
  });
}

// Serve static build from dist folder
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Restore saved sessions and listener loops on server boot
const saved = loadState();
for (const s of saved.sessions) {
  tgActiveSessions.set(s.accountId, { ...s, client: null });
}
for (const r of saved.rules) {
  syncRulesStore.set(r.id, r);
}

app.listen(PORT, () => {
  console.log(`🚀 Telegram-Twitter AutoSync server running on port ${PORT}`);
  // Auto-start listeners after 3s
  setTimeout(() => {
    for (const id of tgActiveSessions.keys()) {
      startTelegramListener(id).catch(console.error);
    }
  }, 3000);
});
