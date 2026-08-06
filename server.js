import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import {
  PLATFORMS, postToTelegram, parseTelegramTarget, downloadMedia,
  fetchTwitterTimeline, twitterItemToPost, parseTwitterHandle,
} from './connectors.js';
import {
  instagramAuthUrl, instagramExchangeCode, instagramRefreshToken, instagramProfile,
  publishToInstagram, setInstagramComments, listInstagramComments,
  hideInstagramComment, deleteInstagramComment, replyToInstagramComment,
  fetchInstagramOwnMedia, fetchInstagramPublicMedia, parseInstagramHandle,
  facebookAuthUrl, facebookExchangeCode, facebookListPages,
  publishToFacebook, fetchFacebookPagePosts, listFacebookComments,
  hideFacebookComment, deleteFacebookComment, replyToFacebookComment,
  setFacebookCommentControl,
} from './meta.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1); // Trust Render TLS proxy

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── Genel adres ────────────────────────────────────────────────────────────
// Instagram ve Facebook medyayı bizden İNDİRİR; bayt göndermeye izin vermezler.
// Bu yüzden medyayı kısa süreliğine kendi sunucumuzdan yayınlamamız gerekiyor
// ve dışarıdan erişilebilir adresimizi bilmemiz şart.
const PUBLIC_BASE_URL = (
  process.env.PUBLIC_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  ''
).replace(/\/$/, '');

// ─── In-memory stores ────────────────────────────────────────────────────────
const tgQRSessions     = new Map();
const metaAccounts     = new Map(); // accountId -> { platform, token, expiresAt, ... }
const accountsStore    = new Map(); // accountId -> arayüzün gördüğü hesap kaydı
const tempMedia        = new Map(); // token -> { buffer, mediaType, expiresAt }
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
    // İmleçler olmadan yeniden başlatma sonrası kaynaklar "ilk tur" sayılır ve
    // son gönderiler tekrar paylaşılırdı.
    const cursors = Object.fromEntries(sourceCursors);
    const meta = [...metaAccounts.values()];
    const accounts = [...accountsStore.values()];
    fs.writeFileSync(STATE_FILE, JSON.stringify({ sessions, rules, cursors, meta, accounts }, null, 2), { mode: 0o600 });
  } catch (e) {
    console.error('[Persist] Failed to save state:', e.message);
  }
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return { sessions: [], rules: [], cursors: {}, meta: [], accounts: [] };
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return {
      sessions: parsed.sessions || [], rules: parsed.rules || [],
      cursors: parsed.cursors || {}, meta: parsed.meta || [],
      accounts: parsed.accounts || [],
    };
  } catch (e) {
    console.error('[Persist] Failed to load state:', e.message);
    return { sessions: [], rules: [], cursors: {}, meta: [], accounts: [] };
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
//  HESAP DEPOSU
//
//  Hesaplar eskiden yalnızca tarayıcının localStorage'ında tutuluyordu; bu
//  yüzden başka bir tarayıcıdan ya da başka bir cihazdan girince liste boş
//  görünüyordu. Artık tek doğru kaynak sunucu.
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/accounts', (_req, res) => {
  res.json({ success: true, accounts: [...accountsStore.values()] });
});

// Tek hesap ekle/güncelle. Aynı kimlik varsa üzerine yazar; farklıysa YENİ
// hesap olarak eklenir, böylece birden fazla Telegram/X hesabı bağlanabilir.
app.post('/api/accounts', (req, res) => {
  const acc = req.body || {};
  if (!acc.id || !acc.platform) {
    return res.status(400).json({ success: false, error: 'id ve platform zorunlu.' });
  }
  accountsStore.set(acc.id, { ...accountsStore.get(acc.id), ...acc });
  saveState();
  return res.json({ success: true, accounts: [...accountsStore.values()] });
});

app.delete('/api/accounts/:id', (req, res) => {
  const id = req.params.id;
  const acc = accountsStore.get(id);
  accountsStore.delete(id);

  // Telegram hesabıysa dinleyicisini de kapat; yoksa kaldırılmış bir hesap
  // arka planda mesaj dinlemeye devam ederdi.
  const tgId = acc?.credentials?.accountId || id;
  const sess = tgActiveSessions.get(tgId);
  if (sess) {
    sess.client?.disconnect().catch(() => {});
    tgActiveSessions.delete(tgId);
  }
  saveState();
  return res.json({ success: true, accounts: [...accountsStore.values()] });
});

// Tarayıcıda kalmış eski kayıtları bir kereye mahsus sunucuya taşır.
app.post('/api/accounts/import', (req, res) => {
  const incoming = Array.isArray(req.body?.accounts) ? req.body.accounts : [];
  let added = 0;
  for (const acc of incoming) {
    if (!acc?.id || !acc.platform) continue;
    if (accountsStore.has(acc.id)) continue;
    accountsStore.set(acc.id, acc);
    added++;
  }
  if (added) saveState();
  return res.json({ success: true, added, accounts: [...accountsStore.values()] });
});

// ═══════════════════════════════════════════════════════════════════════════
//  GEÇİCİ MEDYA SUNUCUSU
//
//  Meta platformları medyayı bir URL'den çeker. Telegram/X'ten gelen baytları
//  tahmin edilemez bir adreste kısa süre yayınlayıp iş bitince siliyoruz.
// ═══════════════════════════════════════════════════════════════════════════
const TEMP_MEDIA_TTL_MS = 30 * 60 * 1000;

// Bu uç kendi alan adımızdan içerik sunuyor. Tür serbest bırakılırsa
// text/html yükleyip sitemizin üstünde betik çalıştırmak mümkün olurdu,
// bu yüzden yalnızca bu listedekilere izin veriyoruz.
const ALLOWED_MEDIA_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png',  'png'],
  ['image/gif',  'gif'],
  ['image/webp', 'webp'],
  ['video/mp4',  'mp4'],
]);

function publishTempMedia(buffer, mediaType) {
  if (!PUBLIC_BASE_URL) {
    throw new Error('PUBLIC_URL ayarlı değil. Instagram/Facebook medya paylaşımı için sunucunun genel adresi gerekiyor.');
  }
  const ext = ALLOWED_MEDIA_TYPES.get(mediaType);
  if (!ext) {
    throw new Error(`Desteklenmeyen medya türü: ${mediaType}. İzin verilenler: ${[...ALLOWED_MEDIA_TYPES.keys()].join(', ')}`);
  }
  const token = crypto.randomBytes(24).toString('hex');
  tempMedia.set(token, { buffer, mediaType, expiresAt: Date.now() + TEMP_MEDIA_TTL_MS });
  return { token, url: `${PUBLIC_BASE_URL}/media/${token}.${ext}` };
}

function releaseTempMedia(tokens) {
  for (const t of tokens) tempMedia.delete(t);
}

// Post'un baytlarını Meta'nın çekebileceği URL'lere çevirir.
function postToPublicUrls(post) {
  const tokens = [];
  const mediaUrls = [];
  for (const m of post.media || []) {
    const { token, url } = publishTempMedia(m.data, m.mediaType);
    tokens.push(token);
    mediaUrls.push({ url, mediaType: m.mediaType });
  }
  return { tokens, mediaUrls };
}

app.get('/media/:file', (req, res) => {
  const token = String(req.params.file).replace(/\.[a-z0-9]+$/i, '');
  const entry = tempMedia.get(token);
  if (!entry || Date.now() > entry.expiresAt) {
    tempMedia.delete(token);
    return res.status(404).send('Not found');
  }
  // Türü kayıttan değil izin listesinden alıyoruz: depolanan değer bozulsa
  // bile tarayıcıya asla çalıştırılabilir bir tür gönderilmesin.
  if (!ALLOWED_MEDIA_TYPES.has(entry.mediaType)) {
    tempMedia.delete(token);
    return res.status(415).send('Unsupported media type');
  }
  res.set('Content-Type', entry.mediaType);
  res.set('Content-Length', String(entry.buffer.length));
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  return res.send(entry.buffer);
});

setInterval(() => {
  const now = Date.now();
  for (const [t, e] of tempMedia) if (now > e.expiresAt) tempMedia.delete(t);
}, 5 * 60 * 1000).unref?.();

// ═══════════════════════════════════════════════════════════════════════════
//  TELEGRAM ─ QR LOGIN & SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
// Kullanıcı 2FA şifresini girene kadar bekleyeceğimiz süre. Bunu sınırsız
// bırakırsak QR oturumu ve açık MTProto bağlantısı sonsuza dek asılı kalır.
const QR_PASSWORD_WAIT_MS = 5 * 60 * 1000;
const QR_SESSION_TTL_MS   = 15 * 60 * 1000;

// teleproto, `password`/`onError` geri çağrımlarımız hata fırlattığında ham
// hatayı yutup yerine "AUTH_USER_CANCEL" fırlatıyor. Kullanıcıya bunu
// göstermek anlamsız; gerçek sebebi koruyup okunur bir metne çeviriyoruz.
function readableQRError(raw, existing) {
  if (existing) return existing;
  const msg = raw || 'Bilinmeyen hata';
  if (msg === 'AUTH_USER_CANCEL') return 'Telegram girişi tamamlanamadı. Lütfen QR kodu yeniden oluşturup tekrar deneyin.';
  if (msg.includes('QR login aborted')) return 'QR oturumu iptal edildi.';
  return msg;
}

function releaseQRSession(sessionData) {
  if (sessionData.passwordTimer) {
    clearTimeout(sessionData.passwordTimer);
    sessionData.passwordTimer = null;
  }
  sessionData.passwordResolve = null;
  sessionData.passwordReject = null;
  if (sessionData.client) {
    const client = sessionData.client;
    sessionData.client = null;
    client.disconnect().catch(() => {});
  }
}

// Yarım kalan QR oturumları (kullanıcı pencereyi kapattı, taramadı vs.) aksi
// hâlde MTProto bağlantısını açık tutar ve bellekte birikir.
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of tgQRSessions) {
    if (now - (s.createdAt || 0) < QR_SESSION_TTL_MS) continue;
    releaseQRSession(s);
    tgQRSessions.delete(id);
  }
}, 5 * 60 * 1000).unref?.();

app.post('/api/telegram/qr/start', async (req, res) => {
  const apiId   = process.env.TELEGRAM_API_ID   || req.body.apiId   || '2040';
  const apiHash = process.env.TELEGRAM_API_HASH || req.body.apiHash || 'b18441a1ed607e10e4b39251a1319a14';

  const sessionId = crypto.randomBytes(16).toString('hex');
  const sessionData = {
    status: 'starting', qrDataUrl: null, sessionString: null, user: null, error: null,
    createdAt: Date.now(), passwordHint: '', passwordError: null,
    passwordResolve: null, passwordReject: null, passwordTimer: null, client: null,
  };
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
        // Hesapta iki adımlı doğrulama varsa QR taraması başarılı olur ama
        // Telegram bulut şifresini ister. Burada hata fırlatmak yerine
        // arayüzden şifreyi isteyip bekliyoruz.
        password: async (hint) => {
          sessionData.passwordHint = hint || '';
          sessionData.status = 'awaiting_password';
          return await new Promise((resolve, reject) => {
            sessionData.passwordResolve = resolve;
            sessionData.passwordReject = reject;
            sessionData.passwordTimer = setTimeout(() => {
              sessionData.passwordResolve = null;
              sessionData.passwordReject = null;
              sessionData.error = 'İki adımlı doğrulama şifresi zamanında girilmedi. Lütfen tekrar deneyin.';
              sessionData.status = 'error';
              reject(new Error(sessionData.error));
            }, QR_PASSWORD_WAIT_MS);
          });
        },
        onError: async (err) => {
          const msg = err?.errorMessage || err?.message || '';
          // Yanlış şifre ölümcül değil: akışı sonlandırmak yerine kullanıcıya
          // tekrar sorduruyoruz (false döndürmek teleproto'ya "devam et" der).
          if (msg.includes('PASSWORD_HASH_INVALID') || msg === 'Password is empty') {
            // Durumu burada 'awaiting_password' yapmıyoruz: teleproto şifreyi
            // yeniden isteyene kadar bekleyen bir promise yok, arayüz erken
            // gönderirse kaybolurdu. Bunu password geri çağrımı üstleniyor.
            sessionData.passwordError = 'Şifre hatalı. Lütfen tekrar deneyin.';
            return false;
          }
          sessionData.error = readableQRError(msg, sessionData.error);
          sessionData.status = 'error';
          return true;
        },
      }
    ).then(async (user) => {
      sessionData.sessionString = client.session.save();
      sessionData.passwordError = null;
      sessionData.status = 'authorized';
      sessionData.user = {
        id: user.id.toString(),
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || '',
        phone: user.phone || '',
      };
      // Oturum dizesi kaydedildi; geçici istemciyi açık tutmaya gerek yok.
      // Dinleyici kendi bağlantısını kuruyor.
      releaseQRSession(sessionData);
    }).catch((err) => {
      if (sessionData.status !== 'authorized') {
        // Daha açıklayıcı bir mesajı zaten yakalamışsak onu ezmiyoruz;
        // aksi hâlde kullanıcı "AUTH_USER_CANCEL" görüyordu.
        sessionData.error = readableQRError(err?.message, sessionData.error);
        sessionData.status = 'error';
      }
      releaseQRSession(sessionData);
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
    passwordHint: s.passwordHint || '',
    passwordError: s.passwordError || null,
  });
});

// İki adımlı doğrulama (2FA) şifresi: QR taraması başarılı olduğunda Telegram
// bulut şifresini ister, bunu arayüzden alıp bekleyen akışa iletiyoruz.
app.post('/api/telegram/qr/password', (req, res) => {
  const { sessionId, password } = req.body || {};
  const s = tgQRSessions.get(sessionId);
  if (!s) return res.status(404).json({ success: false, error: 'Oturum bulunamadı. QR kodu yeniden oluşturun.' });
  if (!password) return res.status(400).json({ success: false, error: 'Şifre boş olamaz.' });
  if (!s.passwordResolve) {
    return res.status(409).json({ success: false, error: 'Şu anda şifre beklenmiyor. QR kodu yeniden oluşturun.' });
  }

  const resolve = s.passwordResolve;
  s.passwordResolve = null;
  s.passwordReject = null;
  clearTimeout(s.passwordTimer);
  s.passwordTimer = null;
  s.passwordError = null;
  s.status = 'verifying_password';
  resolve(password);
  return res.json({ success: true });
});

app.post('/api/telegram/session/store', (req, res) => {
  const { accountId, accountName, sessionString, apiId, apiHash } = req.body;
  if (!accountId || !sessionString) return res.status(400).json({ success: false, error: 'accountId ve sessionString gerekli.' });
  const existing = tgActiveSessions.get(accountId);

  // Oturum dizesi değiştiyse eski istemci artık eski hesaba bağlıdır; onu
  // kapatmazsak yeni oturum hiç kullanılmaz ve dinleyici eskisinde takılı kalır.
  const sessionChanged = existing && existing.sessionString !== sessionString;
  if (sessionChanged && existing.client) {
    existing.client.disconnect().catch(() => {});
    console.log(`[Telegram] Oturum değişti, eski dinleyici kapatıldı: ${accountId}`);
  }

  tgActiveSessions.set(accountId, {
    accountId, accountName, sessionString,
    apiId: apiId || '2040',
    apiHash: apiHash || 'b18441a1ed607e10e4b39251a1319a14',
    client: sessionChanged ? null : (existing?.client || null),
    authExpired: false,
  });
  saveState();

  // Yeni oturumda dinleyiciyi hemen başlat; kullanıcı ayrıca tetiklemek zorunda kalmasın.
  startTelegramListener(accountId).catch(e =>
    console.error('[Telegram] Dinleyici otomatik başlatılamadı:', e.message));

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
//  META (Instagram & Facebook) ─ OAuth ve hesap yönetimi
// ═══════════════════════════════════════════════════════════════════════════
const META_APP_ID     = process.env.META_APP_ID     || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const oauthStates = new Map(); // state -> { platform, createdAt }

function metaRedirectUri(platform) {
  return `${PUBLIC_BASE_URL}/api/${platform}/callback`;
}

function metaConfigError() {
  if (!PUBLIC_BASE_URL) return 'PUBLIC_URL ayarlı değil. Render ortam değişkenlerine uygulamanın genel adresini ekle.';
  if (!META_APP_ID || !META_APP_SECRET) return 'META_APP_ID ve META_APP_SECRET ayarlı değil. Meta geliştirici uygulamanı oluşturup bu değerleri Render ortam değişkenlerine ekle.';
  return null;
}

function newOAuthState(platform) {
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, { platform, createdAt: Date.now() });
  // Yarım kalan girişler birikmesin.
  for (const [s, v] of oauthStates) {
    if (Date.now() - v.createdAt > 10 * 60 * 1000) oauthStates.delete(s);
  }
  return state;
}

app.get('/api/meta/status', (_req, res) => {
  res.json({
    configured: !metaConfigError(),
    error: metaConfigError(),
    publicUrl: PUBLIC_BASE_URL || null,
    redirectUris: {
      instagram: PUBLIC_BASE_URL ? metaRedirectUri('instagram') : null,
      facebook: PUBLIC_BASE_URL ? metaRedirectUri('facebook') : null,
    },
    accounts: [...metaAccounts.values()].map(publicMetaAccount),
  });
});

function publicMetaAccount(a) {
  return {
    id: a.id, platform: a.platform, name: a.name, username: a.username,
    avatar: a.avatar, followers: a.followers,
    expiresAt: a.expiresAt, pages: a.pages?.map(p => ({ id: p.id, name: p.name, avatar: p.avatar })),
  };
}

app.get('/api/:platform(instagram|facebook)/auth-url', (req, res) => {
  const err = metaConfigError();
  if (err) return res.status(400).json({ success: false, error: err });

  const platform = req.params.platform;
  const state = newOAuthState(platform);
  const args = { appId: META_APP_ID, redirectUri: metaRedirectUri(platform), state };
  const url = platform === 'instagram' ? instagramAuthUrl(args) : facebookAuthUrl(args);
  return res.json({ success: true, url });
});

app.get('/api/:platform(instagram|facebook)/callback', async (req, res) => {
  const platform = req.params.platform;
  const { code, state, error_description: errDesc } = req.query;

  // Buraya gelen metin kullanıcıdan (sorgu dizesi) ve Meta'dan geliyor;
  // doğrudan HTML'e gömersek yansıtılmış XSS olur.
  const esc = (s) => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const finish = (ok, message) =>
    res
      .set('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'")
      .set('X-Content-Type-Options', 'nosniff')
      .send(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center;max-width:420px;padding:24px">
<div style="font-size:44px">${ok ? '✅' : '❌'}</div>
<h2 style="margin:12px 0">${ok ? 'Hesap bağlandı' : 'Bağlanamadı'}</h2>
<p style="color:#94a3b8;font-size:14px">${esc(message)}</p>
<p style="color:#64748b;font-size:12px">Bu pencereyi kapatabilirsin.</p>
</div><script>setTimeout(()=>window.close(),${ok ? 2500 : 8000})</script></body>`);

  if (errDesc) return finish(false, String(errDesc));
  if (!code) return finish(false, 'Meta yetkilendirme kodu göndermedi.');
  if (!state || oauthStates.get(String(state))?.platform !== platform) {
    // State eşleşmiyorsa bu isteği biz başlatmamışız demektir.
    return finish(false, 'Güvenlik doğrulaması başarısız (state uyuşmadı). Baştan dene.');
  }
  oauthStates.delete(String(state));

  try {
    const args = {
      appId: META_APP_ID, appSecret: META_APP_SECRET,
      redirectUri: metaRedirectUri(platform), code: String(code),
    };

    if (platform === 'instagram') {
      const tok = await instagramExchangeCode(args);
      const profile = await instagramProfile(tok.token);
      const id = `ig-${profile.id}`;
      metaAccounts.set(id, {
        id, platform: 'instagram', igUserId: profile.id,
        name: profile.name, username: profile.username, avatar: profile.avatar,
        followers: profile.followers, token: tok.token, expiresAt: tok.expiresAt,
      });
      saveState();
      return finish(true, `Instagram: @${profile.username}`);
    }

    const tok = await facebookExchangeCode(args);
    const pages = await facebookListPages(tok.token);
    if (!pages.length) {
      return finish(false, 'Bu hesapta yönetebileceğin bir Facebook Sayfası yok. Facebook kişisel profiline API ile paylaşım yapılamıyor, Sayfa gerekiyor.');
    }
    const id = 'fb-user';
    metaAccounts.set(id, {
      id, platform: 'facebook', name: pages[0].name,
      username: pages.map(p => p.name).join(', '),
      avatar: pages[0].avatar, token: tok.token, expiresAt: tok.expiresAt, pages,
    });
    saveState();
    return finish(true, `Facebook Sayfaları: ${pages.map(p => p.name).join(', ')}`);
  } catch (e) {
    return finish(false, e.message);
  }
});

app.delete('/api/meta/accounts/:id', (req, res) => {
  const existed = metaAccounts.delete(req.params.id);
  saveState();
  res.json({ success: existed });
});

// 60 günlük jetonlar süresi dolmadan yenilenirse ömürleri tekrar uzuyor.
// Günde bir kontrol edip 15 günden az kalanları tazeliyoruz; böylece hesap
// elle müdahale olmadan bağlı kalıyor.
const TOKEN_REFRESH_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

async function refreshMetaTokens() {
  for (const acc of metaAccounts.values()) {
    if (acc.platform !== 'instagram') continue; // Sayfa jetonları süresiz
    if (!acc.expiresAt || acc.expiresAt - Date.now() > TOKEN_REFRESH_THRESHOLD_MS) continue;
    try {
      const r = await instagramRefreshToken(acc.token);
      acc.token = r.token;
      acc.expiresAt = r.expiresAt;
      saveState();
      console.log(`[Meta] Instagram jetonu yenilendi: @${acc.username}`);
    } catch (e) {
      console.error(`[Meta] Jeton yenilenemedi (@${acc.username}):`, e.message);
      pushSyncLog({
        source: `Instagram @${acc.username}`,
        messagePreview: 'Erişim jetonu yenilenemedi',
        targets: [], status: 'error',
        details: `${e.message} Hesabı yeniden bağlaman gerekebilir.`,
      });
    }
  }
}

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
    const cookieMap = parseCookieMap(cookieArray);
    const account = await verifyTwitterCookies(cookieMap);
    if (account.error) {
      return res.status(400).json({ success: false, error: account.error });
    }

    console.log(`[Twitter] Hesap doğrulandı: @${account.username}`);

    // Gönderim için yalnızca auth_token ve ct0 gerekiyor; kurala bu ikisi kaydedilir.
    const stored = [
      `auth_token=${cookieMap.get('auth_token')}`,
      `ct0=${cookieMap.get('ct0')}`,
    ];
    if (cookieMap.get('twid')) stored.push(`twid=${cookieMap.get('twid')}`);

    return res.json({
      success: true,
      user: { username: account.username, name: account.name },
      cookies: stored,
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: 'Çerez doğrulama hatası: ' + err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  TWITTER ─ Ücretsiz & Sınırsız Gönderim (x.com GraphQL, doğrudan)
// ═══════════════════════════════════════════════════════════════════════════
// Geçmişte iki kütüphane de aynı sebepten çöktü: X hem v1.1 account/* uç
// noktalarını emekliye ayırdı hem de GraphQL sorgu kimliklerini periyodik olarak
// değiştiriyor. Gömülü kimlik kullanan her istemci er geç 404 alıyor. Bu yüzden
// sorgu kimliğini ve feature listesini X'in kendi web paketinden çalışma anında
// okuyoruz; X kimliği değiştirdiğinde sistem kendi kendini onarır.

const TWITTER_BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Paketten okuma başarısız olursa kullanılacak, canlı olduğu doğrulanmış değerler.
const FALLBACK_OP = {
  queryId: 'wUgPBh9hEKhMMGlg8uDuFw',
  featureSwitches: [
    'premium_content_api_read_enabled', 'communities_web_enable_tweet_community_results_fetch',
    'c9s_tweet_anatomy_moderator_badge_enabled', 'responsive_web_grok_analyze_button_fetch_trends_enabled',
    'responsive_web_grok_analyze_post_followups_enabled', 'rweb_cashtags_composer_attachment_enabled',
    'responsive_web_jetfuel_frame', 'responsive_web_grok_share_attachment_enabled',
    'responsive_web_grok_annotations_enabled', 'responsive_web_edit_tweet_api_enabled',
    'rweb_conversational_replies_downvote_enabled', 'graphql_is_translatable_rweb_tweet_is_translatable_enabled',
    'view_counts_everywhere_api_enabled', 'longform_notetweets_consumption_enabled',
    'responsive_web_twitter_article_tweet_consumption_enabled', 'content_disclosure_indicator_enabled',
    'content_disclosure_ai_generated_indicator_enabled', 'responsive_web_grok_show_grok_translated_post',
    'responsive_web_grok_analysis_button_from_backend', 'post_ctas_fetch_enabled',
    'longform_notetweets_rich_text_read_enabled', 'longform_notetweets_inline_media_enabled',
    'profile_label_improvements_pcf_label_in_post_enabled', 'responsive_web_profile_redirect_enabled',
    'rweb_tipjar_consumption_enabled', 'verified_phone_label_enabled', 'articles_preview_enabled',
    'rweb_cashtags_enabled', 'responsive_web_grok_community_note_auto_translation_is_enabled',
    'freedom_of_speech_not_reach_fetch_enabled', 'standardized_nudges_misinfo',
    'tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled',
    'responsive_web_grok_image_annotation_enabled', 'responsive_web_grok_imagine_annotation_enabled',
    'responsive_web_graphql_timeline_navigation_enabled',
  ],
  fieldToggles: [
    'withArticleRichContentState', 'withArticlePlainText', 'withArticleSummaryText',
    'withArticleVoiceOver', 'withGrokAnalyze', 'withDisallowedReplyControls',
    'withPayments', 'withAuxiliaryUserLabels',
  ],
};

// Keşfedilen operasyon 6 saat önbelleklenir; X kimliği değiştirirse bir sonraki
// yenilemede ya da 404 alındığında anında tazelenir.
let opCache = { op: null, fetchedAt: 0 };
const OP_CACHE_MS = 6 * 60 * 60 * 1000;

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

function cookieHeaderOf(cookieMap) {
  return [...cookieMap.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

// X'in web istemcisi her isteğe, sayfadaki animasyon verisinden türetilen bir
// x-client-transaction-id başlığı koyar. Bu başlık olmadan gönderimler bot olarak
// işaretlenip "kod 226" ile veya sessizce düşürülüyor. Üreteci bir kez kurup
// (X ana sayfasını okur) periyodik olarak tazeliyoruz.
let txClient = null;
let txCreatedAt = 0;
const TX_TTL_MS = 60 * 60 * 1000;

async function clientTransactionId(method, pathname) {
  try {
    if (!txClient || Date.now() - txCreatedAt > TX_TTL_MS) {
      const { ClientTransaction, fetchXDocument } = await import('x-client-transaction-id');
      txClient = await ClientTransaction.create(await fetchXDocument());
      txCreatedAt = Date.now();
      console.log('[Twitter] x-client-transaction-id üreteci hazırlandı.');
    }
    return await txClient.generateTransactionId(method, pathname);
  } catch (e) {
    console.warn('[Twitter] Transaction ID üretilemedi:', e.message);
    txClient = null;
    return null;
  }
}

function apiHeaders(cookieMap, extra = {}) {
  return {
    authorization: `Bearer ${TWITTER_BEARER}`,
    cookie: cookieHeaderOf(cookieMap),
    'x-csrf-token': cookieMap.get('ct0') || '',
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-active-user': 'yes',
    'x-twitter-client-language': 'en',
    referer: 'https://x.com/home',
    'User-Agent': BROWSER_UA,
    ...extra,
  };
}

function describeTwitterError(code, status, fallback) {
  if (code === 32 || status === 401) {
    return 'X oturumu tanımadı. auth_token geçersiz veya süresi dolmuş — x.com\'da oturum açıp auth_token ve ct0 değerlerini yeniden kopyalayın.';
  }
  if (code === 353 || status === 403) {
    return 'CSRF doğrulaması başarısız (ct0). auth_token ve ct0 aynı oturuma ait olmalı — ikisini de aynı anda kopyalayın.';
  }
  if (code === 326) {
    return 'X hesabı geçici olarak kilitli. x.com\'a girip doğrulamayı tamamlayın, sonra çerezleri yeniden alın.';
  }
  if (code === 187) {
    return 'Bu tweet birebir aynısı daha önce atıldığı için X tarafından reddedildi (yinelenen içerik).';
  }
  if (code === 226) {
    return 'X bu gönderimi otomasyon şüphesiyle engelledi. Bir süre bekleyip tekrar deneyin.';
  }
  if (status === 429) {
    return 'X geçici hız sınırı uyguladı. Kısa bir süre sonra tekrar deneyin.';
  }
  if (code === 34 || status === 404) {
    return 'X uç noktası bulunamadı — sorgu kimliği eskimiş olabilir. Sistem bir sonraki denemede kendini tazeleyecek.';
  }
  return `X hatası (HTTP ${status}${code ? ', kod ' + code : ''}): ${fallback}`;
}

// ─── Oturum Tazeleme ────────────────────────────────────────────────────────
// X, isteklere yanıt verirken ct0'ı (CSRF) zaman zaman yeniler. Yenilenen değeri
// yakalamazsak elimizdeki ct0 eskir ve gönderimler bir gün aniden 403 vermeye
// başlar. Yanıtlardaki set-cookie'yi izleyip auth_token bazında saklıyor, kurallara
// da yazıp diske kaydediyoruz — böylece yeniden başlatmalarda da korunuyor.
const refreshedCookies = new Map(); // auth_token -> { ct0, updatedAt }

function absorbSetCookies(response, cookieMap) {
  try {
    const list = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);

    const fresh = {};
    for (const sc of list) {
      const m = /^\s*(ct0|auth_token)=([^;]+)/.exec(sc || '');
      if (m && m[2] && m[2] !== 'undefined') fresh[m[1]] = m[2];
    }
    if (!fresh.ct0 && !fresh.auth_token) return;

    const authToken = fresh.auth_token || cookieMap.get('auth_token');
    if (!authToken) return;

    const current = cookieMap.get('ct0');
    if (fresh.ct0 && fresh.ct0 !== current) {
      cookieMap.set('ct0', fresh.ct0);
      refreshedCookies.set(authToken, { ct0: fresh.ct0, updatedAt: Date.now() });
      persistRefreshedCookie(authToken, fresh.ct0);
      console.log('[Twitter] ct0 tazelendi ve kaydedildi.');
    }
  } catch (e) {
    console.warn('[Twitter] set-cookie işlenemedi:', e.message);
  }
}

// Tazelenen ct0'ı, o hesabı kullanan tüm kurallara yazar ve diske kaydeder.
function persistRefreshedCookie(authToken, ct0) {
  let changed = false;
  for (const rule of syncRulesStore.values()) {
    for (const acc of rule.targetAccounts || []) {
      const cookies = acc.credentials?.cookies;
      if (!Array.isArray(cookies)) continue;
      if (!cookies.some(c => String(c).includes(authToken))) continue;

      acc.credentials.cookies = cookies
        .filter(c => !String(c).startsWith('ct0='))
        .concat(`ct0=${ct0}`);
      changed = true;
    }
  }
  if (changed) saveState();
}

// Kayıtlı çerezlere, daha önce tazelenmiş ct0 varsa onu uygular.
function applyRefreshedCookies(cookieMap) {
  const authToken = cookieMap.get('auth_token');
  const fresh = authToken && refreshedCookies.get(authToken);
  if (fresh?.ct0) cookieMap.set('ct0', fresh.ct0);
  return cookieMap;
}

// Oturumu doğrular. X, v1.1 verify_credentials'ı kapattığı için giriş yapılmış
// ana sayfayı okuyup içindeki hesap bilgisine bakıyoruz.
async function fetchHomePage(cookieMap) {
  const r = await fetch('https://x.com/home', {
    headers: { cookie: cookieHeaderOf(cookieMap), 'User-Agent': BROWSER_UA },
  });
  absorbSetCookies(r, cookieMap);
  const html = await r.text();
  return { status: r.status, html };
}

async function verifyTwitterCookies(cookieMap) {
  if (!cookieMap.get('auth_token')) {
    return { error: 'Çerezlerde auth_token yok. Hesabı yeniden bağlayın.' };
  }
  if (!cookieMap.get('ct0')) {
    return { error: 'Çerezlerde ct0 yok. x.com çerezlerinden ct0 değerini de kopyalayın.' };
  }

  let page;
  try {
    page = await fetchHomePage(cookieMap);
  } catch (e) {
    return { error: 'X\'e ulaşılamadı: ' + e.message };
  }

  const screenName = /"screen_name":"([^"]+)"/.exec(page.html)?.[1];
  const loggedIn = /"isLoggedIn":true/.test(page.html);

  if (!screenName || !loggedIn) {
    console.error(`[Twitter] Oturum doğrulanamadı (HTTP ${page.status}, giriş: ${loggedIn}).`);
    return { error: 'X oturumu doğrulanamadı. auth_token ve ct0 geçersiz veya süresi dolmuş olabilir — x.com\'da oturum açıkken ikisini yeniden kopyalayın.' };
  }

  const userId = /"user_id":"(\d+)"/.exec(page.html)?.[1] ||
                 /u%3D(\d+)/.exec(cookieMap.get('twid') || '')?.[1] || null;

  return { username: screenName, name: screenName, userId, html: page.html };
}

// CreateTweet operasyonunu X'in web paketinden okur (sorgu kimliği + feature listesi).
async function discoverCreateTweetOp(cookieMap, force = false) {
  if (!force && opCache.op && Date.now() - opCache.fetchedAt < OP_CACHE_MS) {
    return opCache.op;
  }
  try {
    const { html } = await fetchHomePage(cookieMap);
    const bundle = /https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/main\.[0-9a-f]+\.js/.exec(html)?.[0];
    if (!bundle) throw new Error('main paketi bulunamadı');

    const js = await (await fetch(bundle, { headers: { 'User-Agent': BROWSER_UA } })).text();
    const idx = js.indexOf('operationName:"CreateTweet"');
    if (idx < 0) throw new Error('CreateTweet tanımı bulunamadı');

    const segment = js.slice(Math.max(0, idx - 400), idx + 2000);
    const queryId = /queryId:"([^"]+)",operationName:"CreateTweet"/.exec(segment)?.[1];
    if (!queryId) throw new Error('queryId okunamadı');

    const listOf = (label) => {
      const m = new RegExp(`${label}:\\[([^\\]]*)\\]`).exec(segment.slice(segment.indexOf('operationName:"CreateTweet"')));
      return m ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : [];
    };

    const op = {
      queryId,
      featureSwitches: listOf('featureSwitches').length ? listOf('featureSwitches') : FALLBACK_OP.featureSwitches,
      fieldToggles: listOf('fieldToggles').length ? listOf('fieldToggles') : FALLBACK_OP.fieldToggles,
    };
    opCache = { op, fetchedAt: Date.now() };
    console.log(`[Twitter] CreateTweet sorgu kimliği güncellendi: ${queryId} (${op.featureSwitches.length} feature)`);
    return op;
  } catch (e) {
    console.warn('[Twitter] Sorgu kimliği okunamadı, gömülü değer kullanılacak:', e.message);
    return opCache.op || FALLBACK_OP;
  }
}

// ─── Medya Yükleme (parçalı) ────────────────────────────────────────────────
// X segment başına ~5 MB kabul ettiği için INIT → APPEND(xN) → FINALIZE akışını
// kendimiz yürütüyor, videolarda kodlama bitene kadar STATUS ile bekliyoruz
// (işlenmemiş medya tweet'e eklenirse gönderim reddedilir).
const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
const UPLOAD_URL = 'https://upload.x.com/i/media/upload.json';

function mediaCategoryFor(mediaType) {
  if (mediaType === 'image/gif') return 'tweet_gif';
  if (mediaType.startsWith('video/')) return 'tweet_video';
  return 'tweet_image';
}

async function uploadCall(cookieMap, params, body) {
  const txId = await clientTransactionId('POST', '/i/media/upload.json');
  const r = await fetch(`${UPLOAD_URL}?${new URLSearchParams(params)}`, {
    method: 'POST',
    headers: apiHeaders(cookieMap, {
      referer: 'https://x.com',
      ...(txId ? { 'x-client-transaction-id': txId } : {}),
    }),
    body,
  });
  absorbSetCookies(r, cookieMap);
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
  const init = await uploadCall(cookieMap, {
    command: 'INIT',
    total_bytes: String(buffer.length),
    media_type: mediaType,
    media_category: mediaCategoryFor(mediaType),
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

  let info = finalized.processing_info;
  const deadline = Date.now() + 180000;
  while (info && info.state !== 'succeeded') {
    if (info.state === 'failed') {
      throw new Error(`X medyayı işleyemedi: ${info.error?.message || 'bilinmeyen hata'}`);
    }
    if (Date.now() > deadline) throw new Error('Video işlenmesi zaman aşımına uğradı.');
    await new Promise(r => setTimeout(r, Math.max(1000, (info.check_after_secs || 2) * 1000)));
    info = (await uploadCall(cookieMap, { command: 'STATUS', media_id: mediaId })).processing_info;
  }

  return mediaId;
}

// ─── Tweet Gönderimi ────────────────────────────────────────────────────────
// Tweet'e kimlerin yanıt verebileceği. "everyone" X'in varsayılanıdır ve
// istekte hiç alan gönderilmemesi gerekir.
const REPLY_MODES = {
  everyone:  null,
  following: 'Community',    // Takip ettiğin hesaplar
  mentioned: 'ByInvitation', // Yalnızca bahsettiğin hesaplar
  verified:  'Verified',     // Onaylanmış hesaplar
};

async function createTweetRequest(cookieMap, op, text, mediaIds, replyMode = 'everyone') {
  const pathname = `/i/api/graphql/${op.queryId}/CreateTweet`;
  const txId = await clientTransactionId('POST', pathname);
  const variables = {
    tweet_text: text || '',
    dark_request: false,
    media: {
      media_entities: mediaIds.map(id => ({ media_id: id, tagged_users: [] })),
      possibly_sensitive: false,
    },
    semantic_annotation_ids: [],
    disallowed_reply_options: null,
  };

  const controlMode = REPLY_MODES[replyMode];
  if (controlMode) variables.conversation_control = { mode: controlMode };

  const r = await fetch(`https://x.com${pathname}`, {
    method: 'POST',
    headers: apiHeaders(cookieMap, {
      'content-type': 'application/json',
      ...(txId ? { 'x-client-transaction-id': txId } : {}),
    }),
    body: JSON.stringify({
      variables,
      features: Object.fromEntries(op.featureSwitches.map(n => [n, true])),
      fieldToggles: Object.fromEntries(op.fieldToggles.map(n => [n, false])),
      queryId: op.queryId,
    }),
  });

  absorbSetCookies(r, cookieMap);
  const body = await r.text();
  let data = null;
  try { data = JSON.parse(body); } catch (_) {}
  return { status: r.status, data, body };
}

// ─── Gönderim Kuyruğu ───────────────────────────────────────────────────────
// X, art arda hızlı gelen gönderimleri (özellikle veri merkezi IP'lerinden)
// spam sayıp HTTP 200 ile birlikte BOŞ tweet_results döndürerek sessizce düşürür.
// Hata mesajı vermez. Bu yüzden gönderimleri tek sıraya alıp aralarında en az
// SEND_MIN_GAP_MS bekliyor, sessizce düşen tweet'i artan aralıklarla yeniden
// deniyoruz. Telegram akışı yoğunlaşsa bile bağlantı kopmuyor.
const SEND_MIN_GAP_MS = 30 * 1000;
const SOFT_DROP_RETRY_DELAYS = [90 * 1000, 240 * 1000];

let lastSendAt = 0;
let sendChain = Promise.resolve();

const sleep = ms => new Promise(r => setTimeout(r, ms));

function enqueueSend(task) {
  const queued = sendChain.then(async () => {
    const wait = lastSendAt + SEND_MIN_GAP_MS - Date.now();
    if (wait > 0) {
      console.log(`[Twitter] Kuyruk: X hız sınırına takılmamak için ${Math.ceil(wait / 1000)} sn bekleniyor.`);
      await sleep(wait);
    }
    try {
      return await task();
    } finally {
      lastSendAt = Date.now();
    }
  });
  sendChain = queued.then(() => {}, () => {});
  return queued;
}

async function attemptCreateTweet(cookieMap, text, mediaIds, replyMode) {
  let op = await discoverCreateTweetOp(cookieMap);
  let res = await createTweetRequest(cookieMap, op, text, mediaIds, replyMode);

  // Sorgu kimliği eskimişse X 404 döner; kimliği tazeleyip bir kez daha deniyoruz.
  if (res.status === 404) {
    console.warn('[Twitter] Sorgu kimliği eskimiş, yeniden keşfediliyor...');
    op = await discoverCreateTweetOp(cookieMap, true);
    res = await createTweetRequest(cookieMap, op, text, mediaIds, replyMode);
  }
  return res;
}

async function postTweetViaCookies(cookies, text, mediaData = [], replyMode = 'everyone') {
  const cookieMap = applyRefreshedCookies(parseCookieMap(cookies));
  if (!cookieMap.get('auth_token') || !cookieMap.get('ct0')) {
    return { success: false, error: 'Çerezler eksik (auth_token ve ct0 gerekli). Hesabı yeniden bağlayın.' };
  }
  if (!text && !mediaData.length) {
    return { success: false, error: 'Tweet metni ve medya birlikte boş olamaz.' };
  }

  return enqueueSend(async () => {
    try {
      // Medya 24 saat geçerli kalır; yeniden denemelerde tekrar yüklemiyoruz.
      const mediaIds = [];
      for (const item of mediaData.slice(0, 4)) { // X en fazla 4 medya kabul eder
        const buf = Buffer.isBuffer(item.data) ? item.data : Buffer.from(item.data);
        const id = await uploadMediaToTwitter(cookieMap, buf, item.mediaType);
        mediaIds.push(id);
        console.log(`[Twitter] Medya yüklendi (${item.mediaType}, ${(buf.length / 1024).toFixed(0)} KB), id: ${id}`);
      }

      for (let attempt = 0; ; attempt++) {
        const res = await attemptCreateTweet(cookieMap, text, mediaIds, replyMode);

        const tweetId = res.data?.data?.create_tweet?.tweet_results?.result?.rest_id;
        if (tweetId) {
          console.log('[Twitter] Tweet gönderildi! ID:', tweetId);
          return { success: true, tweetId };
        }

        const err = res.data?.errors?.[0];
        // Hatasız 200 + boş tweet_results = X sessizce düşürdü (hız/spam koruması).
        const softDrop = res.status === 200 && !err && res.data?.data?.create_tweet;

        if (softDrop && attempt < SOFT_DROP_RETRY_DELAYS.length) {
          const delay = SOFT_DROP_RETRY_DELAYS[attempt];
          console.warn(`[Twitter] X gönderimi sessizce düşürdü; ${delay / 1000} sn sonra yeniden denenecek (${attempt + 1}/${SOFT_DROP_RETRY_DELAYS.length}).`);
          await sleep(delay);
          continue;
        }

        if (softDrop) {
          console.error('[Twitter] Gönderim X tarafından tekrar tekrar düşürüldü.');
          return {
            success: false,
            error: 'X gönderimi sessizce engelledi (spam/hız koruması). Genelde art arda çok hızlı tweet atınca olur ve kendiliğinden düzelir. Aynı metni tekrar göndermeyi deneyin veya bir süre bekleyin.',
          };
        }

        console.error(`[Twitter] Gönderim reddedildi (HTTP ${res.status}):`, err?.message || res.body.slice(0, 200));
        return {
          success: false,
          error: describeTwitterError(err?.code, res.status, err?.message || res.body.slice(0, 160)),
        };
      }
    } catch (err) {
      const raw = err?.message || String(err);
      console.error('[Twitter] Tweet gönderim hatası:', raw);
      return { success: false, error: raw };
    }
  });
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

  const targets = ruleTargets(rule);
  if (!targets.length) return res.status(400).json({ success: false, error: 'Kurala hedef hesap eklenmemiş.' });

  const testText = text || `⚡ OmniSync Test Gönderisi [${new Date().toLocaleTimeString('tr-TR')}]`;
  const formattedText = buildTweetText(testText, rule);

  if (!formattedText) return res.status(400).json({ success: false, error: 'Yasaklı kelime filtresi mesajı engelledi.' });

  const results = [];
  for (const target of targets) {
    const r = await deliverToTarget(target, { text: formattedText, media: [] }, rule);
    results.push({ account: targetLabel(target), ...r });
  }

  const failCount = results.filter(r => !r.success).length;
  pushSyncLog({
    source: `Test → ${rule.title}`,
    messagePreview: formattedText.slice(0, 80),
    targets: targets.map(targetLabel),
    status: failCount === 0 ? 'success' : 'error',
    details: results.map(r => `${r.account}: ${r.success ? '✅ Gönderildi' : '❌ ' + r.error}`).join(' · '),
  });

  return res.json({ success: failCount === 0, results, error: failCount > 0 ? results.map(r => r.error).join(', ') : null });
});

// ═══════════════════════════════════════════════════════════════════════════
//  YORUM YÖNETİMİ (Instagram & Facebook)
// ═══════════════════════════════════════════════════════════════════════════
function metaAccountOr404(req, res) {
  const acc = metaAccounts.get(req.params.accountId);
  if (!acc) {
    res.status(404).json({ success: false, error: 'Hesap bağlı değil.' });
    return null;
  }
  return acc;
}

function fbPageOf(acc, pageId) {
  return (acc.pages || []).find(p => p.id === pageId) || acc.pages?.[0];
}

// Bir gönderinin yorumlarını listele
app.get('/api/meta/:accountId/media/:mediaId/comments', async (req, res) => {
  const acc = metaAccountOr404(req, res);
  if (!acc) return;
  try {
    const comments = acc.platform === 'instagram'
      ? await listInstagramComments({ token: acc.token }, req.params.mediaId)
      : await listFacebookComments(fbPageOf(acc, req.query.pageId), req.params.mediaId);
    return res.json({ success: true, comments });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }
});

// Yorumları aç/kapat (Instagram: comment_enabled, Facebook: comment_control)
app.post('/api/meta/:accountId/media/:mediaId/comment-setting', async (req, res) => {
  const acc = metaAccountOr404(req, res);
  if (!acc) return;
  const { enabled, mode, pageId } = req.body || {};
  try {
    if (acc.platform === 'instagram') {
      await setInstagramComments({ token: acc.token }, req.params.mediaId, enabled !== false);
    } else {
      await setFacebookCommentControl(fbPageOf(acc, pageId), req.params.mediaId, mode || 'EVERYONE');
    }
    return res.json({ success: true });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }
});

// Tek bir yorumu gizle / göster / sil / yanıtla
app.post('/api/meta/:accountId/comments/:commentId/:action', async (req, res) => {
  const acc = metaAccountOr404(req, res);
  if (!acc) return;
  const { action, commentId } = req.params;
  const { message, pageId } = req.body || {};
  const isIG = acc.platform === 'instagram';
  const ctx = isIG ? { token: acc.token } : fbPageOf(acc, pageId);

  try {
    switch (action) {
      case 'hide':
      case 'unhide': {
        const hidden = action === 'hide';
        const r = isIG
          ? await hideInstagramComment(ctx, commentId, hidden)
          : await hideFacebookComment(ctx, commentId, hidden);
        return res.json(r);
      }
      case 'delete':
        return res.json(isIG
          ? await deleteInstagramComment(ctx, commentId)
          : await deleteFacebookComment(ctx, commentId));
      case 'reply': {
        if (!message?.trim()) return res.status(400).json({ success: false, error: 'Yanıt metni boş.' });
        return res.json(isIG
          ? await replyToInstagramComment(ctx, commentId, message)
          : await replyToFacebookComment(ctx, commentId, message));
      }
      default:
        return res.status(400).json({ success: false, error: `Bilinmeyen işlem: ${action}` });
    }
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }
});

// Bağlı Meta hesabının kendi gönderilerini listele (yorum yönetimi için)
app.get('/api/meta/:accountId/media', async (req, res) => {
  const acc = metaAccountOr404(req, res);
  if (!acc) return;
  try {
    const items = acc.platform === 'instagram'
      ? await fetchInstagramOwnMedia({ igUserId: acc.igUserId, token: acc.token })
      : await fetchFacebookPagePosts(fbPageOf(acc, req.query.pageId));
    return res.json({ success: true, items });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }
});

// Elle paylaşım: arayüzden yüklenen medyayı doğrudan gönder.
app.post('/api/meta/:accountId/publish', async (req, res) => {
  const acc = metaAccountOr404(req, res);
  if (!acc) return;
  const { text, media, kind, disableComments, commentControl, pageId } = req.body || {};

  // media: [{ base64, mediaType }]
  const post = {
    text: text || '',
    media: (media || []).map(m => ({ data: Buffer.from(m.base64, 'base64'), mediaType: m.mediaType })),
  };
  const target = {
    platform: acc.platform, accountId: acc.id, pageId, name: acc.username || acc.name,
    options: { kind: kind || 'post', disableComments, commentControl },
  };
  try {
    const r = await deliverToTarget(target, post, {});
    pushSyncLog({
      source: `Elle → ${PLATFORMS[acc.platform]?.label}`,
      messagePreview: (post.text || '📷 Medya').slice(0, 80),
      targets: [target.name],
      status: r.success ? 'success' : 'error',
      details: r.success ? (r.warning || 'Paylaşıldı') : r.error,
    });
    return res.status(r.success ? 200 : 400).json(r);
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }
});

// Kaynağın gerçekten okunabildiğini kural kaydetmeden önce görebilmek için.
app.post('/api/source/preview', async (req, res) => {
  const { platform, handle } = req.body || {};
  try {
    if (platform === 'twitter') {
      const items = await fetchTwitterTimeline(handle);
      return res.json({
        success: true,
        count: items.length,
        author: items[0]?.author || null,
        items: items.slice(0, 5).map(i => ({
          id: i.id, text: i.text.slice(0, 140), createdAt: i.createdAt,
          media: i.media.map(m => m.mediaType), isRetweet: i.isRetweet, url: i.url,
        })),
      });
    }
    if (platform === 'instagram') {
      // business_discovery çağrısı bağlı bir profesyonel hesap üzerinden yapılır.
      const acc = [...metaAccounts.values()].find(a => a.platform === 'instagram');
      if (!acc) return res.status(400).json({ success: false, error: 'Önce kendi Instagram hesabını bağla; başka hesapları ancak bağlı bir hesap üzerinden okuyabiliyoruz.' });
      const r = await fetchInstagramPublicMedia({ igUserId: acc.igUserId, token: acc.token }, handle);
      return res.json({
        success: true, count: r.items.length, author: `@${r.username}`,
        items: r.items.slice(0, 5).map(i => ({
          id: i.id, text: i.text.slice(0, 140), createdAt: i.createdAt,
          media: i.media.map(m => m.mediaType), url: i.url,
        })),
      });
    }

    return res.status(400).json({ success: false, error: `"${platform}" için önizleme henüz yok.` });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }
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
    // İndirme askıda kalırsa tüm kuyruk kilitlenir; bu yüzden süre sınırı koyuyoruz.
    const buf = await Promise.race([
      msg.downloadMedia(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('indirme 3 dakikada tamamlanmadı')), 180000)),
    ]);
    if (!buf || !buf.length) {
      console.warn('[Media] Medya boş geldi, metin olarak devam ediliyor.');
      return [];
    }

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

// ─── Kanal / Gönderen Filtreleri ────────────────────────────────────────────
// Kullanıcı kanal veya kişi kimliğini çok farklı biçimlerde girebiliyor:
// -1001234567890, 1234567890, @kanaladi, kanaladi, https://t.me/kanaladi ...
// Eskiden çözümlenemeyen bir değer boş stringe düşüyor ve "filtre yok" sayılıp
// TÜM mesajları geçiriyordu; artık anlaşılmayan filtre hiçbir şeyi eşleştirmez.
function parseTargetFilter(raw) {
  const s = (raw || '').trim();
  if (!s) return { type: 'all' };

  // Özel kanal linki: t.me/c/<kanal kimliği>/<mesaj no>
  const privateLink = /(?:t\.me|telegram\.me)\/c\/(\d+)/i.exec(s);
  if (privateLink) return { type: 'id', value: privateLink[1] };

  const link = /(?:t\.me|telegram\.me)\/(?:s\/)?@?([A-Za-z0-9_]+)/i.exec(s);
  if (link) {
    return /^\d+$/.test(link[1])
      ? { type: 'id', value: link[1] }
      : { type: 'username', value: link[1].toLowerCase() };
  }

  if (s.startsWith('@')) {
    const handle = s.slice(1).trim().toLowerCase();
    return handle ? { type: 'username', value: handle } : { type: 'invalid', value: s };
  }

  // -100 öneki, MTProto kanal kimliğinin dışa dönük gösterimidir.
  const digits = s.replace(/^-100/, '').replace(/^-/, '');
  if (/^\d+$/.test(digits)) return { type: 'id', value: digits };

  if (/^[A-Za-z0-9_]{4,}$/.test(s)) return { type: 'username', value: s.toLowerCase() };

  return { type: 'invalid', value: s };
}

const warnedFilters = new Set();

function matchesTarget(filter, id, username, label) {
  if (filter.type === 'all') return true;

  if (filter.type === 'invalid') {
    if (!warnedFilters.has(label + filter.value)) {
      warnedFilters.add(label + filter.value);
      console.error(`[Telegram] ${label} anlaşılamadı: "${filter.value}". @kullaniciadi veya -100... kimliği girin. Bu kural hiçbir mesajı geçirmeyecek.`);
    }
    return false;
  }

  if (filter.type === 'id') return !!id && String(id) === filter.value;
  return !!username && username === filter.value;
}

// Gönderen kimliği/kullanıcı adı. Kanallarda gönderi kanalın kendisine aittir;
// gruplarda gerçek kullanıcıya. İkisini de destekliyoruz.
async function messageSenderInfo(msg) {
  const senderId = msg.senderId?.toString() ||
                   msg.fromId?.userId?.toString() ||
                   msg.fromId?.channelId?.toString() || null;
  let username = null;
  try {
    const s = await msg.getSender();
    username = (s?.username || '').toLowerCase() || null;
  } catch (e) {
    console.warn('[Telegram] Gönderen bilgisi alınamadı:', e.message);
  }
  return { senderId, username };
}

// ─── Telegram Listener Engine ───────────────────────────────────────────────
async function startTelegramListener(accountId) {
  const sess = tgActiveSessions.get(accountId);
  if (!sess || sess.client) return;   // zaten çalışıyor
  if (sess.authExpired) return;       // oturum ölü; yeniden bağlanana kadar deneme

  try {
    const { TelegramClient } = await import('teleproto');
    const { StringSession } = await import('teleproto/sessions/index.js');
    const { NewMessage } = await import('teleproto/events/index.js');

    const client = new TelegramClient(
      new StringSession(sess.sessionString),
      parseInt(sess.apiId || '2040', 10),
      sess.apiHash || 'b18441a1ed607e10e4b39251a1319a14',
      { connectionRetries: 10, useWSS: true }
    );

    await client.connect();

    // Oturum sonlandırılmışsa bağlantı yine kurulur ama her senkron denemesi
    // AuthKeyUnregisteredError ile döner ve log sonsuza kadar hatayla dolar.
    // Böyle bir oturumu tutmak yerine kapatıp kullanıcıya bildiriyoruz.
    const authorized = await client.isUserAuthorized().catch(() => false);
    if (!authorized) {
      await client.disconnect().catch(() => {});
      sess.client = null;
      sess.authExpired = true;
      console.error(`[Telegram] Oturum geçersiz (${accountId} / ${sess.accountName}). Yeniden QR ile bağlanılmalı.`);
      pushSyncLog({
        source: `Telegram → ${sess.accountName || accountId}`,
        messagePreview: 'Telegram oturumu geçersiz',
        targets: [],
        status: 'error',
        details: 'Bu Telegram hesabının oturumu sonlandırılmış. Hesabı QR ile yeniden bağlayın.',
      });
      return;
    }

    sess.client = client;
    sess.authExpired = false;
    console.log(`[Telegram] Dinleyici başlatıldı: ${accountId} (${sess.accountName})`);

    client.addEventHandler(async (event) => {
      const msg = event.message;
      if (!msg) return;

      const chatId = msg.peerId?.channelId?.toString() ||
                     msg.peerId?.chatId?.toString() ||
                     msg.peerId?.userId?.toString() || '';

      // Mesaj numaraları kanal bazında artar; anahtara kanalı da katmazsak
      // farklı kanallardaki aynı numaralı mesajlar birbirini eler.
      const msgKey = `${accountId}:${chatId}:${msg.id}`;
      if (recentlySynced.has(msgKey)) return;
      recentlySynced.add(msgKey);
      setTimeout(() => recentlySynced.delete(msgKey), 60000);
      // MTProto'da medya açıklaması da .message alanındadır; Bot API'deki
      // "caption" burada yoktur. .text getter'ı istemci bağlı değilse boş döner,
      // bu yüzden ham .message alanına da düşüyoruz.
      const rawText = msg.text || msg.message || '';
      console.log(`[Telegram] Yeni mesaj geldi (Chat: ${chatId}): ${rawText.slice(0, 60)}`);

      const accountRules = [...syncRulesStore.values()].filter(
        r => r.enabled && r.sourceAccountId === accountId
      );

      if (!accountRules.length) {
        console.log('[Telegram] Bu hesap için etkin kural yok, mesaj atlandı.');
        return;
      }

      const channelFilters = accountRules.map(r => parseTargetFilter(r.sourceChannelId));
      const senderFilters  = accountRules.map(r => parseTargetFilter(r.sourceSenderId));

      // Kullanıcı adına göre eşleşme istenmişse kanal/gönderen bilgisini çekiyoruz.
      let chatUsername = null;
      if (channelFilters.some(f => f.type === 'username')) {
        try {
          const chat = await msg.getChat();
          chatUsername = (chat?.username || '').toLowerCase() || null;
        } catch (e) {
          console.warn('[Telegram] Kanal bilgisi alınamadı:', e.message);
        }
      }

      let sender = null;
      if (senderFilters.some(f => f.type !== 'all')) {
        sender = await messageSenderInfo(msg);
      }

      const matchingRules = accountRules.filter((rule, i) => {
        if (!matchesTarget(channelFilters[i], chatId, chatUsername, `${rule.title} kanal filtresi`)) return false;
        if (senderFilters[i].type !== 'all') {
          if (!matchesTarget(senderFilters[i], sender?.senderId, sender?.username, `${rule.title} gönderen filtresi`)) return false;
        }
        return true;
      });

      if (!matchingRules.length) {
        console.log(`[Telegram] Chat ${chatId} hiçbir kuralın kanal filtresine uymadı, atlandı.`);
        return;
      }

      console.log(`[Telegram] ${matchingRules.length} kural eşleşti, gönderiliyor...`);

      // Medyayı kural başına değil bir kez indiriyoruz; aynı mesaj birden çok
      // kurala uyduğunda aynı dosyayı tekrar tekrar çekmenin anlamı yok.
      const post = {
        text: rawText,
        media: await extractTelegramMedia(msg),
        author: sender?.username ? `@${sender.username}` : null,
        sourceUrl: chatUsername ? `https://t.me/${chatUsername}/${msg.id}` : null,
        sourceLabel: `Telegram${chatUsername ? ' @' + chatUsername : ''}`,
      };

      for (const rule of matchingRules) {
        await executeSyncRule(rule, post);
      }
    }, new NewMessage({}));

  } catch (err) {
    console.error(`[Telegram] Dinleyici başlatma hatası (${accountId}):`, err.message);
    sess.client = null;
  }
}

// ─── Kural Hedefleri ────────────────────────────────────────────────────────
// Eski kurallarda hedef yalnızca Twitter'dı (`targetAccounts`). Yeni kurallar
// çok platformlu `targets` dizisi kullanıyor. Eskileri okurken dönüştürüyoruz,
// böylece mevcut kurallar deploy sonrası çalışmaya devam ediyor.
function ruleTargets(rule) {
  if (Array.isArray(rule.targets) && rule.targets.length) return rule.targets;
  return (rule.targetAccounts || []).map(acc => ({
    platform: 'twitter',
    name: acc.name,
    credentials: acc.credentials,
    options: { replyMode: rule.replyMode || 'everyone' },
  }));
}

function targetLabel(t) {
  const p = PLATFORMS[t.platform];
  return `${p?.icon || ''} ${t.name || t.chatId || t.platform}`.trim();
}

// Tek bir hedefe gönderim. Platform ne olursa olsun aynı Post biçimini alır.
async function deliverToTarget(target, post, rule) {
  const opts = target.options || {};
  try {
    switch (target.platform) {
      case 'twitter': {
        const c = target.credentials || {};
        if (Array.isArray(c.cookies) && c.cookies.length > 0) {
          const r = await postTweetViaCookies(c.cookies, post.text, post.media, opts.replyMode || rule.replyMode);
          return { success: r.success, error: r.error };
        }
        if (c.consumerKey && c.consumerSecret) {
          if (!post.text) {
            return { success: false, error: 'Görsel/video paylaşımı yalnızca çerez (auth_token) modunda destekleniyor.' };
          }
          const url = 'https://api.twitter.com/2/tweets';
          const authHeader = buildOAuth1Header('POST', url, c.consumerKey, c.consumerSecret, c.accessToken, c.accessTokenSecret);
          const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: authHeader },
            body: JSON.stringify({ text: post.text }),
          });
          const d = await r.json();
          return {
            success: !!(r.ok && d.data?.id),
            error: d.errors ? d.errors[0]?.message : (d.detail || d.title),
          };
        }
        return { success: false, error: 'Twitter hesabı için giriş bilgisi bulunamadı.' };
      }

      case 'telegram': {
        const sess = tgActiveSessions.get(target.accountId);
        if (!sess) return { success: false, error: 'Hedef Telegram hesabı bağlı değil.' };
        if (!sess.client) await startTelegramListener(target.accountId);
        return await postToTelegram(sess.client, target.chatId, post, opts);
      }

      case 'instagram': {
        const acc = metaAccounts.get(target.accountId);
        if (!acc) return { success: false, error: 'Hedef Instagram hesabı bağlı değil.' };
        // Baytları Meta'nın çekebileceği geçici adreslere koyup iş bitince siliyoruz.
        const { tokens, mediaUrls } = postToPublicUrls(post);
        try {
          return await publishToInstagram(
            { igUserId: acc.igUserId, token: acc.token },
            { text: post.text, mediaUrls },
            { kind: opts.kind || 'post', disableComments: !!opts.disableComments },
          );
        } finally {
          releaseTempMedia(tokens);
        }
      }

      case 'facebook': {
        const acc = metaAccounts.get(target.accountId);
        if (!acc) return { success: false, error: 'Facebook hesabı bağlı değil.' };
        const page = (acc.pages || []).find(p => p.id === target.pageId) || acc.pages?.[0];
        if (!page) return { success: false, error: 'Hedef Facebook Sayfası bulunamadı.' };

        const { tokens, mediaUrls } = postToPublicUrls(post);
        try {
          const r = await publishToFacebook(page, { text: post.text, mediaUrls }, { kind: opts.kind || 'post' });
          if (r.success && opts.commentControl && opts.commentControl !== 'EVERYONE' && r.id) {
            try {
              await setFacebookCommentControl(page, r.id, opts.commentControl);
            } catch (e) {
              return { ...r, warning: `Paylaşıldı ama yorum ayarı uygulanamadı: ${e.message}` };
            }
          }
          return r;
        } finally {
          releaseTempMedia(tokens);
        }
      }

      default:
        return { success: false, error: `Bilinmeyen hedef platform: ${target.platform}` };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Kaynağı ne olursa olsun normalize edilmiş bir gönderiyi kuralın tüm
// hedeflerine dağıtır.
async function executeSyncRule(rule, post) {
  if (!rule.enabled) return;

  const targets = ruleTargets(rule);
  const sourceLabel = post.sourceLabel || PLATFORMS[rule.sourcePlatform || 'telegram']?.label || 'Kaynak';
  const rawText = post.text || '';
  const text = buildTweetText(rawText, rule);
  const media = post.media || [];

  if (!text && !media.length) {
    pushSyncLog({
      source: `${sourceLabel} → ${rule.title}`,
      messagePreview: (rawText || '(boş mesaj)').slice(0, 80),
      targets: targets.map(targetLabel),
      status: 'filtered',
      details: rawText.trim() ? 'Yasaklı kelime filtresine takıldı.' : 'Mesajda metin ve medya yok.',
    });
    return;
  }
  if (!text && rawText.trim()) {
    // Metin yasaklı kelimeye takıldıysa medya olsa bile gönderme.
    pushSyncLog({
      source: `${sourceLabel} → ${rule.title}`,
      messagePreview: rawText.slice(0, 80),
      targets: targets.map(targetLabel),
      status: 'filtered',
      details: 'Yasaklı kelime filtresine takıldı.',
    });
    return;
  }

  if (!targets.length) {
    pushSyncLog({
      source: `${sourceLabel} → ${rule.title}`,
      messagePreview: text.slice(0, 80),
      targets: [],
      status: 'error',
      details: 'Kurala hedef hesap eklenmemiş.',
    });
    return;
  }

  const outgoing = { ...post, text };
  const results = [];
  for (const target of targets) {
    const r = await deliverToTarget(target, outgoing, rule);
    results.push({ account: targetLabel(target), ...r });
  }

  const failCount = results.filter(r => !r.success).length;
  pushSyncLog({
    source: `${sourceLabel} → ${rule.title}`,
    messagePreview: (text || '📷 Medya paylaşımı').slice(0, 80) + (media.length ? ' [+medya]' : ''),
    targets: targets.map(targetLabel),
    status: failCount === 0 ? 'success' : (failCount === results.length ? 'error' : 'partial'),
    details: results.map(r => `${r.account}: ${r.success ? '✅ Gönderildi' : '❌ ' + (r.error || 'Hata')}`).join(' · '),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  KAYNAK YOKLAYICI (Telegram dışındaki platformlar)
//
//  Telegram anlık olay gönderir (push); X/Instagram/Facebook için düzenli
//  aralıklarla yeni gönderi var mı diye bakmamız gerekiyor.
// ═══════════════════════════════════════════════════════════════════════════
const sourceCursors = new Map(); // ruleId -> en son işlenen gönderi kimliği
const POLL_INTERVAL_MS = 3 * 60 * 1000;

// Gönderi kimlikleri X'te artan sayılardır ama 64-bit olduğu için sayıya
// çevirmek hassasiyet kaybettirir; string olarak uzunluk+sözlük sırası
// karşılaştırması güvenli.
function idIsNewer(a, b) {
  if (!b) return true;
  if (a.length !== b.length) return a.length > b.length;
  return a > b;
}

async function pollTwitterSource(rule) {
  const handle = rule.sourceHandle || rule.sourceChannelId;
  if (!parseTwitterHandle(handle)) return;

  let items;
  try {
    items = await fetchTwitterTimeline(handle);
  } catch (e) {
    // Hız sınırı normal işleyişin parçası, hata olarak kaydetmiyoruz.
    if (!/hız sınırı/i.test(e.message)) {
      console.warn(`[X kaynak] ${rule.title}: ${e.message}`);
    }
    return;
  }
  if (!items.length) return;

  const newest = items.reduce((m, i) => (idIsNewer(i.id, m) ? i.id : m), '');
  const cursor = sourceCursors.get(rule.id);

  // İlk turda geçmişi göndermiyoruz; yoksa kural eklenir eklenmez son 20
  // gönderi arka arkaya paylaşılırdı.
  if (!cursor) {
    sourceCursors.set(rule.id, newest);
    console.log(`[X kaynak] ${rule.title}: başlangıç noktası ${newest} olarak ayarlandı.`);
    return;
  }

  const fresh = items
    .filter(i => idIsNewer(i.id, cursor))
    .filter(i => !(rule.skipRetweets && i.isRetweet))
    .filter(i => !(rule.skipReplies && i.isReply))
    .sort((a, b) => (idIsNewer(a.id, b.id) ? 1 : -1)); // eskiden yeniye

  sourceCursors.set(rule.id, newest);
  if (!fresh.length) return;

  console.log(`[X kaynak] ${rule.title}: ${fresh.length} yeni gönderi bulundu.`);
  for (const item of fresh) {
    const post = await twitterItemToPost(item);
    await executeSyncRule(rule, post);
  }
}

// Instagram/Facebook öğelerini ortak Post biçimine çevirir. Meta medyayı
// imzalı geçici adreslerde tutar, bu yüzden hemen indiriyoruz.
async function metaItemToPost(item, label) {
  const media = [];
  for (const m of item.media || []) {
    try {
      media.push({ data: await downloadMedia(m.url, m.mediaType), mediaType: m.mediaType });
    } catch (e) {
      console.warn(`[${label}] Medya atlandı:`, e.message);
    }
  }
  return { text: item.text, media, author: item.author || null, sourceUrl: item.url, sourceLabel: label };
}

async function pollMetaSource(rule) {
  const acc = metaAccounts.get(rule.sourceAccountId);
  if (!acc) return;

  let items = [];
  let label = '';
  if (rule.sourcePlatform === 'instagram') {
    const handle = rule.sourceHandle && parseInstagramHandle(rule.sourceHandle);
    // Kendi hesabın değilse business_discovery ile herkese açık profesyonel
    // hesapları okuyabiliyoruz; Instagram kişisel hesaplara izin vermiyor.
    if (handle && handle.toLowerCase() !== (acc.username || '').toLowerCase()) {
      const r = await fetchInstagramPublicMedia({ igUserId: acc.igUserId, token: acc.token }, handle);
      items = r.items;
      label = `Instagram @${r.username}`;
    } else {
      items = await fetchInstagramOwnMedia({ igUserId: acc.igUserId, token: acc.token });
      label = `Instagram @${acc.username}`;
    }
  } else {
    const page = (acc.pages || []).find(p => p.id === rule.sourcePageId) || acc.pages?.[0];
    if (!page) return;
    items = await fetchFacebookPagePosts(page);
    label = `Facebook ${page.name}`;
  }

  if (!items.length) return;

  const cursor = sourceCursors.get(rule.id);
  // Meta kimlikleri artan sayı değil; en yeni öğe listenin başında geliyor.
  const newest = items[0].id;
  if (!cursor) {
    sourceCursors.set(rule.id, newest);
    console.log(`[${label}] ${rule.title}: başlangıç noktası ayarlandı.`);
    return;
  }
  if (cursor === newest) return;

  const seenIdx = items.findIndex(i => i.id === cursor);
  // İmleç listede yoksa (çok yeni gönderi birikmiş) yalnızca en yenisini alıyoruz;
  // aksi hâlde 25 eski gönderi birden paylaşılırdı.
  const fresh = (seenIdx === -1 ? items.slice(0, 1) : items.slice(0, seenIdx)).reverse();
  sourceCursors.set(rule.id, newest);
  if (!fresh.length) return;

  console.log(`[${label}] ${rule.title}: ${fresh.length} yeni gönderi.`);
  for (const item of fresh) {
    await executeSyncRule(rule, await metaItemToPost(item, label));
  }
}

async function pollAllSources() {
  for (const rule of syncRulesStore.values()) {
    if (!rule.enabled) continue;
    try {
      if (rule.sourcePlatform === 'twitter') await pollTwitterSource(rule);
      else if (rule.sourcePlatform === 'instagram' || rule.sourcePlatform === 'facebook') {
        await pollMetaSource(rule);
      }
    } catch (e) {
      console.error(`[Yoklayıcı] ${rule.title} hatası:`, e.message);
    }
  }
}

setInterval(() => { pollAllSources().catch(() => {}); }, POLL_INTERVAL_MS).unref?.();

// ─── Oturum Sağlık Takibi ───────────────────────────────────────────────────
// Çerezler çıkış yapılana veya şifre değiştirilene kadar geçerli kalır, ama bu
// olduğunda uygulama bunu ancak bir mesaj kaçtığında fark ederdi. Düzenli kontrol
// edip durumu kayıt altına alıyoruz; böylece sorun mesaj kaybetmeden görülüyor.
const twitterHealth = new Map(); // hesap adı -> { ok, username, checkedAt, error }
const HEALTH_INTERVAL_MS = 6 * 60 * 60 * 1000;

function connectedTwitterAccounts() {
  const seen = new Map();
  for (const rule of syncRulesStore.values()) {
    for (const acc of ruleTargets(rule)) {
      if (acc.platform !== 'twitter') continue;
      const cookies = acc.credentials?.cookies;
      if (Array.isArray(cookies) && cookies.length && !seen.has(acc.name)) {
        seen.set(acc.name, cookies);
      }
    }
  }
  return seen;
}

async function checkTwitterSessions() {
  const accounts = connectedTwitterAccounts();
  if (!accounts.size) return;

  for (const [name, cookies] of accounts) {
    try {
      const result = await verifyTwitterCookies(applyRefreshedCookies(parseCookieMap(cookies)));
      const ok = !result.error;
      const previous = twitterHealth.get(name);
      twitterHealth.set(name, {
        ok,
        username: result.username || null,
        checkedAt: new Date().toISOString(),
        error: result.error || null,
      });

      if (ok) {
        console.log(`[Sağlık] Twitter oturumu geçerli: @${result.username}`);
      } else {
        console.error(`[Sağlık] Twitter oturumu geçersiz (${name}): ${result.error}`);
        // Aynı arızayı her turda tekrar tekrar loglamıyoruz.
        if (!previous || previous.ok) {
          pushSyncLog({
            source: `Oturum kontrolü → ${name}`,
            messagePreview: 'Twitter oturumu doğrulanamadı',
            targets: [name],
            status: 'error',
            details: result.error + ' Yeni auth_token ve ct0 ile hesabı yeniden bağlayın.',
          });
        }
      }
    } catch (e) {
      console.error(`[Sağlık] Kontrol hatası (${name}):`, e.message);
    }
  }
}

app.get('/api/twitter/health', (_req, res) => {
  res.json({
    success: true,
    accounts: [...twitterHealth.entries()].map(([name, h]) => ({ name, ...h })),
  });
});

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
for (const [ruleId, cursor] of Object.entries(saved.cursors || {})) {
  sourceCursors.set(ruleId, cursor);
}
for (const a of saved.meta || []) {
  metaAccounts.set(a.id, a);
}
for (const a of saved.accounts || []) {
  accountsStore.set(a.id, a);
}

app.listen(PORT, () => {
  console.log(`🚀 Telegram-Twitter AutoSync server running on port ${PORT}`);
  // Auto-start listeners after 3s
  setTimeout(() => {
    for (const id of tgActiveSessions.keys()) {
      startTelegramListener(id).catch(console.error);
    }
  }, 3000);

  // Twitter oturumlarını açılışta ve 6 saatte bir kontrol et.
  setTimeout(() => { checkTwitterSessions().catch(console.error); }, 20000);
  setInterval(() => { checkTwitterSessions().catch(console.error); }, HEALTH_INTERVAL_MS);

  // Yoklamalı kaynakları (X vb.) açılıştan kısa süre sonra bir kez tara.
  setTimeout(() => { pollAllSources().catch(console.error); }, 30000);

  // Meta jetonlarını açılışta ve günde bir yenile ki bağlantı kendiliğinden sürsün.
  setTimeout(() => { refreshMetaTokens().catch(console.error); }, 45000);
  setInterval(() => { refreshMetaTokens().catch(console.error); }, 24 * 60 * 60 * 1000).unref?.();
  // İmleçleri kaybetmemek için düzenli olarak diske yaz.
  setInterval(saveState, 5 * 60 * 1000).unref?.();
});
