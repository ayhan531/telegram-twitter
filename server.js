import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import { Rettiwt } from 'rettiwt-api';

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

// X, sunucudan kullanıcı adı/şifre ile girişte kullanılan onboarding akışını
// (guest/activate) kapattı; bu uç nokta artık her koşulda başarısız oluyordu.
// Kullanıcıyı boşuna bekletmek yerine doğru yönteme yönlendiriyoruz.
app.post('/api/twitter/free-login', (_req, res) => {
  return res.status(400).json({
    success: false,
    error: 'X, sunucu üzerinden şifreli girişi tamamen kapattı. Lütfen "Çerez (auth_token)" sekmesini kullanın — kalıcı, ücretsiz ve sınırsızdır.',
  });
});

app.post('/api/twitter/cookie-verify', async (req, res) => {
  const { cookies, authToken, ct0, twid, cookieJson } = req.body;

  let cookieArray = [];

  // Cookie-Editor JSON aktarımı (tüm çerezleri içerir: auth_token, ct0, twid, kdt)
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
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Çerez JSON metni okunamadı: ' + e.message });
    }
  }

  if (!cookieArray.length && Array.isArray(cookies) && cookies.length) {
    cookieArray = cookies;
  } else if (!cookieArray.length && authToken) {
    cookieArray = [`auth_token=${authToken.trim()}`];
    if (ct0 && ct0.trim()) cookieArray.push(`ct0=${ct0.trim()}`);
    if (twid && twid.trim()) cookieArray.push(`twid=${twid.trim()}`);
  }

  if (!cookieArray.length) {
    return res.status(400).json({ success: false, error: 'Lütfen auth_token ve ct0 çerezlerinizi girin.' });
  }

  try {
    // Anahtarı burada üretip saklıyoruz; twid eksikse hesaptan türetiliyor.
    const built = await buildRettiwtKey(cookieArray);
    if (built.error) {
      return res.status(400).json({ success: false, error: built.error });
    }

    const account = built.account || await verifyTwitterCookies(built.cookieMap);
    if (account.error) {
      return res.status(400).json({ success: false, error: account.error });
    }

    console.log(`[Twitter] Hesap doğrulandı: @${account.username}`);
    return res.json({
      success: true,
      user: { username: account.username, name: account.name },
      // Doğrulanmış, twid dahil eksiksiz çerez seti geri dönüyor ve kurallara kaydediliyor.
      cookies: [
        `auth_token=${built.cookieMap.get('auth_token')}`,
        `ct0=${built.cookieMap.get('ct0')}`,
        `twid=${normalizeTwid(built.cookieMap.get('twid')) || twidFromUserId(account.userId)}`,
        ...(built.cookieMap.get('kdt') ? [`kdt=${built.cookieMap.get('kdt')}`] : []),
      ],
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: 'Çerez doğrulama hatası: ' + err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  TWITTER ─ Ücretsiz & Sınırsız Gönderim (rettiwt-api, x.com uç noktaları)
// ═══════════════════════════════════════════════════════════════════════════
// Not: Eski agent-twitter-client api.twitter.com/1.1 üzerinden çalışıyordu ve o
// yol X tarafından kapatıldı (guest/activate artık 404 → "Hata 34"/"Hata 32").
// rettiwt-api güncel x.com/i/api uç noktalarını ve web bearer'ını kullanır.

// x.com web istemcisinin bearer token'ı (rettiwt-api ile aynı).
const TWITTER_BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

// Çerez listesini {key: value} haritasına çevirir. Düz "a=b" metnini,
// Cookie-Editor'ün {name, value} ve tough-cookie'nin {key, value} biçimlerini kabul eder.
function parseCookieMap(input) {
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
    if (key && value && value !== 'undefined' && value !== 'null') jar.set(key, value);
  }
  return jar;
}

// twid, kullanıcı kimliğini taşır ve rettiwt için zorunludur. Tarayıcıdan
// `u%3D1234567890` ya da `"u=1234567890"` biçiminde gelir; ikisini de kabul edip
// tek biçime indiriyoruz. Elde yoksa hesap kimliğinden üretilebilir.
function normalizeTwid(rawTwid) {
  if (!rawTwid) return null;
  const m = /u(?:%3D|=)(\d+)/i.exec(decodeURIComponent(rawTwid).replace(/"/g, '')) ||
            /(\d{5,})/.exec(rawTwid);
  return m ? `u%3D${m[1]}` : null;
}

function twidFromUserId(userId) {
  return userId ? `u%3D${userId}` : null;
}

// Çerezleri x.com'un kendi verify_credentials uç noktasına sorar. Hem hesabı
// doğrular hem de twid üretmek için gereken sayısal kullanıcı kimliğini verir.
async function verifyTwitterCookies(cookieMap) {
  const cookieHeader = [...cookieMap.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  let r, body;
  try {
    r = await fetch('https://x.com/i/api/1.1/account/verify_credentials.json', {
      headers: {
        authorization: `Bearer ${TWITTER_BEARER}`,
        cookie: cookieHeader,
        'x-csrf-token': cookieMap.get('ct0') || '',
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-active-user': 'yes',
        'x-twitter-client-language': 'en',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      },
    });
    body = await r.text();
  } catch (e) {
    return { error: 'Twitter\'a ulaşılamadı: ' + e.message };
  }

  let data = null;
  try { data = JSON.parse(body); } catch (_) {}

  if (r.ok && data?.screen_name) {
    return {
      username: data.screen_name,
      name: data.name || data.screen_name,
      userId: data.id_str || (data.id != null ? String(data.id) : null),
    };
  }

  const code = data?.errors?.[0]?.code;
  const twMsg = data?.errors?.[0]?.message || body.slice(0, 200);
  console.error(`[Twitter] verify_credentials başarısız (HTTP ${r.status}, kod ${code}):`, twMsg);
  return { error: describeTwitterError(code, r.status, twMsg) };
}

function describeTwitterError(code, status, fallback) {
  if (code === 32 || status === 401) {
    return 'Twitter oturumu tanımadı (Hata 32). auth_token geçersiz veya süresi dolmuş. x.com\'da oturumu açık tutarak auth_token, ct0 ve twid değerlerini yeniden kopyalayın.';
  }
  if (code === 353 || status === 403) {
    return 'CSRF doğrulaması başarısız (ct0). auth_token, ct0 ve twid aynı oturuma ait olmalı — üçünü de aynı anda kopyalayın.';
  }
  if (code === 326) {
    return 'Twitter hesabı geçici olarak kilitli. x.com\'a girip doğrulamayı tamamlayın, sonra çerezleri yeniden alın.';
  }
  if (code === 187) {
    return 'Bu tweet birebir aynısı daha önce atıldığı için Twitter tarafından reddedildi (yinelenen içerik).';
  }
  if (code === 226) {
    return 'Twitter bu gönderimi otomasyon şüphesiyle engelledi. Bir süre bekleyip tekrar deneyin.';
  }
  if (status === 429) {
    return 'Twitter geçici hız sınırı uyguladı. Kısa bir süre sonra otomatik olarak tekrar denenecek.';
  }
  return `Twitter hatası (HTTP ${status}${code ? ', kod ' + code : ''}): ${fallback}`;
}

// Kayıtlı çerezlerden rettiwt API anahtarı üretir: base64("auth_token=..;ct0=..;twid=..;")
// twid yoksa hesabı doğrulayıp kullanıcı kimliğinden türetiriz.
async function buildRettiwtKey(cookies) {
  const jar = parseCookieMap(cookies);
  const authToken = jar.get('auth_token');
  const ct0 = jar.get('ct0');

  if (!authToken) {
    return { error: 'Çerezlerde auth_token yok. Twitter hesabını yeniden bağlayın.' };
  }
  if (!ct0) {
    return { error: 'Çerezlerde ct0 yok. x.com çerezlerinden ct0 değerini de kopyalayıp hesabı yeniden bağlayın.' };
  }

  let twid = normalizeTwid(jar.get('twid'));
  let account = null;

  if (!twid) {
    const verified = await verifyTwitterCookies(jar);
    if (verified.error) return { error: verified.error };
    twid = twidFromUserId(verified.userId);
    if (!twid) {
      return { error: 'Kullanıcı kimliği (twid) belirlenemedi. Lütfen x.com çerezlerinden twid değerini de girin.' };
    }
    account = verified;
  }

  let cookieString = `auth_token=${authToken};ct0=${ct0};twid=${twid};`;
  if (jar.get('kdt')) cookieString += `kdt=${jar.get('kdt')};`;

  return { apiKey: Buffer.from(cookieString).toString('base64'), account, cookieMap: jar };
}

// ─── Medya Yükleme (parçalı) ────────────────────────────────────────────────
// rettiwt'in kendi upload()'ı tüm dosyayı tek APPEND segmentinde gönderiyor;
// X segment başına 5 MB kabul ettiği için videolar başarısız oluyordu. Burada
// INIT → APPEND(xN) → FINALIZE akışını kendimiz yürütüp, video işlenmesini de
// STATUS ile bekliyoruz (işlenmemiş medya tweet'e eklenirse gönderim reddedilir).
const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
const UPLOAD_URL = 'https://upload.x.com/i/media/upload.json';

function mediaCategoryFor(mediaType) {
  if (mediaType === 'image/gif') return 'tweet_gif';
  if (mediaType.startsWith('video/')) return 'tweet_video';
  return 'tweet_image';
}

async function uploadCall(cookieMap, params, body) {
  const cookieHeader = [...cookieMap.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  const headers = {
    authorization: `Bearer ${TWITTER_BEARER}`,
    cookie: cookieHeader,
    'x-csrf-token': cookieMap.get('ct0') || '',
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-active-user': 'yes',
    referer: 'https://x.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  };
  const r = await fetch(`${UPLOAD_URL}?${new URLSearchParams(params)}`, { method: 'POST', headers, body });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}
  if (!r.ok) {
    const code = data?.errors?.[0]?.code;
    throw new Error(describeTwitterError(code, r.status, data?.errors?.[0]?.message || text.slice(0, 160)));
  }
  return data || {};
}

async function uploadMediaToTwitter(cookieMap, buffer, mediaType) {
  const category = mediaCategoryFor(mediaType);

  const init = await uploadCall(cookieMap, {
    command: 'INIT',
    total_bytes: String(buffer.length),
    media_type: mediaType,
    media_category: category,
  });
  const mediaId = init.media_id_string;
  if (!mediaId) throw new Error('Medya yükleme başlatılamadı (media_id alınamadı).');

  for (let offset = 0, seg = 0; offset < buffer.length; offset += UPLOAD_CHUNK_BYTES, seg++) {
    const chunk = buffer.subarray(offset, Math.min(offset + UPLOAD_CHUNK_BYTES, buffer.length));
    const form = new FormData();
    form.append('media', new Blob([chunk]));
    await uploadCall(cookieMap, { command: 'APPEND', media_id: mediaId, segment_index: String(seg) }, form);
  }

  const finalized = await uploadCall(cookieMap, { command: 'FINALIZE', media_id: mediaId });

  // Videolar sunucu tarafında kodlanır; hazır olmadan tweet'e eklenemez.
  let info = finalized.processing_info;
  const deadline = Date.now() + 180000;
  while (info && info.state !== 'succeeded') {
    if (info.state === 'failed') {
      throw new Error(`X medyayı işleyemedi: ${info.error?.message || 'bilinmeyen hata'}`);
    }
    if (Date.now() > deadline) throw new Error('Video işlenmesi zaman aşımına uğradı.');
    await new Promise(r => setTimeout(r, Math.max(1000, (info.check_after_secs || 2) * 1000)));
    const status = await uploadCall(cookieMap, { command: 'STATUS', media_id: mediaId });
    info = status.processing_info;
  }

  return mediaId;
}

// Tek bir tweet'i (isteğe bağlı görsel/videolarla) gönderir.
async function postTweetViaCookies(cookies, text, mediaData = []) {
  const built = await buildRettiwtKey(cookies);
  if (built.error) return { success: false, error: built.error };

  try {
    const rettiwt = new Rettiwt({ apiKey: built.apiKey, timeout: 120000, maxRetries: 2 });

    const media = [];
    for (const item of mediaData.slice(0, 4)) { // X en fazla 4 medya kabul eder
      const buf = Buffer.isBuffer(item.data) ? item.data : Buffer.from(item.data);
      const id = await uploadMediaToTwitter(built.cookieMap, buf, item.mediaType);
      media.push({ id });
      console.log(`[Twitter] Medya yüklendi (${item.mediaType}, ${(buf.length / 1024).toFixed(0)} KB), id: ${id}`);
    }

    const payload = {};
    if (text) payload.text = text;
    if (media.length) payload.media = media;

    const tweetId = await rettiwt.tweet.post(payload);
    if (!tweetId) {
      return { success: false, error: 'Twitter tweet kimliği döndürmedi; gönderim doğrulanamadı.' };
    }

    console.log('[Twitter] Tweet gönderildi! ID:', tweetId);
    return { success: true, tweetId };
  } catch (err) {
    const raw = err?.message || String(err);
    console.error('[Twitter] Tweet gönderim hatası:', raw);
    // Twitter'ın kendi hata kodu ile HTTP durum kodunu karıştırmamak için ayrı ayrı ayrıştırıyoruz.
    const code = Number(/"code"\s*:\s*(\d+)/.exec(raw)?.[1] ?? err?.response?.data?.errors?.[0]?.code) || undefined;
    const status = Number(/status code (\d{3})/i.exec(raw)?.[1] ?? err?.response?.status) || undefined;
    return { success: false, error: describeTwitterError(code, status, raw.slice(0, 200)) };
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
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;  // X'in görsel limiti
// X 512 MB'a kadar video kabul ediyor, ancak medya belleğe indiriliyor ve Render
// ücretsiz sürümü 512 MB RAM veriyor. 64 MB pratikte Telegram videolarını karşılar
// ve sunucunun belleğini taşırmaz.
const MAX_VIDEO_BYTES = 64 * 1024 * 1024;

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
