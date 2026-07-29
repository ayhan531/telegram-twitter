import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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

// ═══════════════════════════════════════════════════════════════════════════
//  HEALTH + CONFIG (tells frontend which services are ready)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/health', (_req, res) => {
  res.json({ status: 'online', app: 'OmniSync Social', version: '3.2.0' });
});

app.get('/api/config', (_req, res) => {
  res.json({
    telegramReady: !!(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH),
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
  // Prefer server env vars; fall back to body (for users who supply their own)
  const apiId  = process.env.TELEGRAM_API_ID  || req.body.apiId;
  const apiHash = process.env.TELEGRAM_API_HASH || req.body.apiHash;
  if (!apiId || !apiHash) return res.status(400).json({ success: false, error: 'Sunucuda TELEGRAM_API_ID / TELEGRAM_API_HASH ortam değişkenleri ayarlanmamış.' });

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

// Send tweet with OAuth 1.0a
app.post('/api/twitter/send', async (req, res) => {
  const { consumerKey, consumerSecret, accessToken, accessTokenSecret, text } = req.body;
  if (!text) return res.status(400).json({ success: false, error: 'text gerekli.' });
  if (!consumerKey || !accessToken)
    return res.status(400).json({ success: false, error: 'Twitter kimlik bilgileri eksik.' });
  try {
    const url = 'https://api.twitter.com/2/tweets';
    const auth = buildOAuth1Header('POST', url, consumerKey, consumerSecret, accessToken, accessTokenSecret);
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ text }),
    });
    const data = await r.json();
    if (r.ok && data.data?.id) return res.json({ success: true, tweetId: data.data.id });
    return res.status(400).json({ success: false, error: JSON.stringify(data.errors || data.detail || data) });
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
        // OAuth 1.0a: use consumerKey + accessToken
        r = await fetch(`${base}/api/twitter/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consumerKey: c.consumerKey, consumerSecret: c.consumerSecret, accessToken: c.accessToken, accessTokenSecret: c.accessTokenSecret, text }) });
        result = await r.json();
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

// Store a Telegram user session on the server so we can listen to messages
app.post('/api/telegram/session/store', (req, res) => {
  const { accountId, accountName, sessionString, apiId, apiHash } = req.body;
  if (!accountId || !sessionString) return res.status(400).json({ success: false, error: 'accountId ve sessionString gerekli.' });
  tgActiveSessions.set(accountId, { accountId, accountName, sessionString, apiId, apiHash, client: null });
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
  return res.json({ success: true });
});

app.delete('/api/sync/rules/:id', (req, res) => {
  syncRulesStore.delete(req.params.id);
  return res.json({ success: true });
});

// ─── Execute sync: called when a Telegram message arrives ──────────────────
async function executeSyncRule(rule, message, twitterAccounts) {
  if (!rule.enabled) return;

  const text = buildTweetText(message.text || message.caption || '', rule);
  if (!text) return;

  for (const twAcc of twitterAccounts) {
    try {
      const r = await fetch(`http://localhost:${PORT}/api/twitter/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: twAcc.credentials?.accessToken, text }),
      });
      const d = await r.json();
      console.log(`[Sync] Rule "${rule.title}" → Twitter @${twAcc.username}: ${d.success ? '✅' : '❌ ' + d.error}`);
    } catch (e) {
      console.error('[Sync] Twitter post error:', e.message);
    }
  }
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

      const chatId = msg.peerId?.channelId?.toString() ||
                     msg.peerId?.chatId?.toString() ||
                     msg.peerId?.userId?.toString() || '';
      const senderId = msg.fromId?.userId?.toString() || '';

      console.log(`[Telegram] New message from chatId=${chatId} senderId=${senderId}: ${(msg.text || '').slice(0, 80)}`);

      // Find matching sync rules
      const matchingRules = [...syncRulesStore.values()].filter(rule => {
        if (!rule.enabled) return false;
        if (rule.sourceAccountId !== accountId) return false;

        // Channel filter
        if (rule.sourceChannelId) {
          const ruleChannelId = rule.sourceChannelId.replace(/[^0-9]/g, '');
          if (ruleChannelId && chatId !== ruleChannelId) return false;
        }

        // Sender filter
        if (rule.allowedSenders?.trim()) {
          const allowed = rule.allowedSenders.split(',').map(s => s.trim()).filter(Boolean);
          if (!allowed.includes(senderId) && !allowed.includes(msg.sender?.username)) return false;
        }

        return true;
      });

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

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 OmniSync Social v3.2 port ${PORT}`));
