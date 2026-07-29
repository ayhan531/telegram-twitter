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
const twitterOAuthSessions = new Map(); // state -> { codeVerifier, clientId, clientSecret, accountName, redirectUri }
const tgQRSessions = new Map();         // sessionId -> { status, qrDataUrl, sessionString, user, error, client }

// ═══════════════════════════════════════════════════════════════════════════
//  HEALTH + CONFIG (tells frontend which services are ready)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/health', (_req, res) => {
  res.json({ status: 'online', app: 'OmniSync Social', version: '3.1.0' });
});

// Frontend calls this to know which one-click logins are available
app.get('/api/config', (_req, res) => {
  res.json({
    twitterReady: !!(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET),
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
//  TWITTER ─ OAuth 2.0 PKCE  (credentials come from server env vars)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/twitter/oauth/start', (req, res) => {
  const clientId     = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(503).json({
      success: false,
      error: 'Sunucuda TWITTER_CLIENT_ID ve TWITTER_CLIENT_SECRET ortam değişkenleri ayarlanmamış. Render → Environment bölümünden ekleyin.'
    });
  }

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

  // Direct browser redirect — no JSON, opens Twitter login page directly
  return res.redirect(`https://twitter.com/i/oauth2/authorize?${params}`);
});

app.get('/api/twitter/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.send(`<html><body><script>
      window.opener && window.opener.postMessage({ type:'TWITTER_AUTH_ERROR', error:'${error}' }, '*');
      window.close();
    </script><p>Hata: ${error}. Bu pencere kapanacak...</p></body></html>`);
  }

  const session = twitterOAuthSessions.get(state);
  if (!session) {
    return res.send(`<html><body><script>
      window.opener && window.opener.postMessage({ type:'TWITTER_AUTH_ERROR', error:'Geçersiz state' }, '*');
      window.close();
    </script><p>Hata: Geçersiz state.</p></body></html>`);
  }
  twitterOAuthSessions.delete(state);

  try {
    const { codeVerifier, clientId, clientSecret, accountName, redirectUri } = session;

    // Exchange code for tokens
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(JSON.stringify(tokenData));

    // Get user info
    const userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=name,username,verified', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const userData = await userRes.json();
    const twitterUser = userData.data || {};

    const payload = JSON.stringify({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || '',
      clientId,
      clientSecret,
      username: twitterUser.username || accountName,
      name: twitterUser.name || accountName,
      accountName,
    });

    return res.send(`<html><body><script>
      window.opener && window.opener.postMessage({ type:'TWITTER_AUTH_SUCCESS', payload: ${JSON.stringify(payload)} }, '*');
      window.close();
    </script><p>Twitter bağlantısı başarılı! Bu pencere kapanıyor...</p></body></html>`);
  } catch (err) {
    return res.send(`<html><body><script>
      window.opener && window.opener.postMessage({ type:'TWITTER_AUTH_ERROR', error:${JSON.stringify(err.message)} }, '*');
      window.close();
    </script><p>Hata: ${err.message}</p></body></html>`);
  }
});

// Twitter OAuth 2.0 ─ Refresh token
app.post('/api/twitter/refresh', async (req, res) => {
  const { refreshToken, clientId, clientSecret } = req.body;
  if (!refreshToken || !clientId) return res.status(400).json({ success: false, error: 'refreshToken ve clientId gerekli.' });
  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const r = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth}` },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(data));
    return res.json({ success: true, accessToken: data.access_token, refreshToken: data.refresh_token });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  TWITTER ─ Send tweet (OAuth 2.0 Bearer)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/twitter/send', async (req, res) => {
  const { accessToken, text } = req.body;
  if (!accessToken || !text) return res.status(400).json({ success: false, error: 'accessToken ve text gerekli.' });
  try {
    const r = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
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
        // OAuth 2.0: use accessToken directly
        r = await fetch(`${base}/api/twitter/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: c.accessToken, text }) });
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
//  Static frontend
// ═══════════════════════════════════════════════════════════════════════════
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 OmniSync Social v3.0 port ${PORT}`));
