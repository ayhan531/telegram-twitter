import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', app: 'OmniSync Social', version: '2.0.0', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// TELEGRAM – Bot token live verify
// ---------------------------------------------------------------------------
app.post('/api/telegram/test-bot', async (req, res) => {
  const { botToken } = req.body;
  if (!botToken) return res.status(400).json({ success: false, error: 'Bot Token gerekli.' });

  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await r.json();
    if (data.ok) {
      return res.json({
        success: true,
        botInfo: { id: data.result.id, name: data.result.first_name, username: `@${data.result.username}` }
      });
    }
    return res.status(400).json({ success: false, error: data.description || 'Geçersiz Bot Token' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Telegram API erişim hatası: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// TELEGRAM – Send real message via Bot API
// ---------------------------------------------------------------------------
app.post('/api/telegram/send', async (req, res) => {
  const { botToken, chatId, text, mediaUrl } = req.body;
  if (!botToken || !chatId || !text) {
    return res.status(400).json({ success: false, error: 'botToken, chatId ve text gerekli.' });
  }

  try {
    let endpoint, payload;

    if (mediaUrl) {
      // Send photo with caption
      endpoint = `https://api.telegram.org/bot${botToken}/sendPhoto`;
      payload = { chat_id: chatId, photo: mediaUrl, caption: text, parse_mode: 'HTML' };
    } else {
      // Send text message
      endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;
      payload = { chat_id: chatId, text, parse_mode: 'HTML' };
    }

    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json();

    if (data.ok) {
      return res.json({ success: true, messageId: data.result.message_id });
    }
    return res.status(400).json({ success: false, error: data.description || 'Telegram mesaj gönderilemedi.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// WHATSAPP – Send real message via Meta Cloud API
// ---------------------------------------------------------------------------
app.post('/api/whatsapp/send', async (req, res) => {
  const { accessToken, phoneNumberId, recipientPhone, text, mediaUrl } = req.body;
  if (!accessToken || !phoneNumberId || !recipientPhone || !text) {
    return res.status(400).json({ success: false, error: 'accessToken, phoneNumberId, recipientPhone ve text gerekli.' });
  }

  const cleanPhone = recipientPhone.replace(/\D/g, '');
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  try {
    let body;
    if (mediaUrl) {
      body = {
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'image',
        image: { link: mediaUrl, caption: text }
      };
    } else {
      body = {
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'text',
        text: { body: text }
      };
    }

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(body)
    });
    const data = await r.json();

    if (r.ok && data.messages) {
      return res.json({ success: true, messageId: data.messages[0]?.id });
    }
    return res.status(400).json({ success: false, error: JSON.stringify(data.error || data) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DISCORD – Test webhook live ping
// ---------------------------------------------------------------------------
app.post('/api/discord/test-webhook', async (req, res) => {
  const { webhookUrl } = req.body;
  if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
    return res.status(400).json({ success: false, error: 'Geçersiz Discord Webhook URL' });
  }

  try {
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '🤖 **OmniSync Social**: Discord Webhook bağlantısı başarıyla doğrulandı!' })
    });

    if (r.ok || r.status === 204) {
      return res.json({ success: true, message: 'Discord Webhook testi başarılı!' });
    }
    return res.status(400).json({ success: false, error: 'Discord yanıt vermedi.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DISCORD – Send real message via Webhook
// ---------------------------------------------------------------------------
app.post('/api/discord/send', async (req, res) => {
  const { webhookUrl, username, text, mediaUrl } = req.body;
  if (!webhookUrl || !text) {
    return res.status(400).json({ success: false, error: 'webhookUrl ve text gerekli.' });
  }

  try {
    const payload = {
      username: username || 'OmniSync Social',
      content: text
    };
    if (mediaUrl) {
      payload.embeds = [{ image: { url: mediaUrl } }];
    }

    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (r.ok || r.status === 204) {
      return res.json({ success: true, message: 'Discord mesajı gönderildi.' });
    }
    const errText = await r.text();
    return res.status(400).json({ success: false, error: errText });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// TWITTER/X – Send tweet via v2 API (OAuth 1.0a User Context required)
// ---------------------------------------------------------------------------
app.post('/api/twitter/send', async (req, res) => {
  const { apiKey, apiSecret, accessToken, accessTokenSecret, text } = req.body;
  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret || !text) {
    return res.status(400).json({ success: false, error: 'API Key, API Secret, Access Token ve Access Token Secret gerekli.' });
  }

  // Build OAuth 1.0a signature for Twitter v2
  try {
    const oauth = buildOAuthHeader('POST', 'https://api.twitter.com/2/tweets', {}, apiKey, apiSecret, accessToken, accessTokenSecret);

    const r = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: oauth
      },
      body: JSON.stringify({ text })
    });
    const data = await r.json();

    if (r.ok && data.data?.id) {
      return res.json({ success: true, tweetId: data.data.id, tweetText: data.data.text });
    }
    return res.status(400).json({ success: false, error: JSON.stringify(data.errors || data.detail || data) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// BROADCAST DISPATCH – Send to multiple accounts at once
// ---------------------------------------------------------------------------
app.post('/api/dispatch', async (req, res) => {
  const { accounts, text, mediaUrl } = req.body;
  if (!accounts || accounts.length === 0 || !text) {
    return res.status(400).json({ success: false, error: 'accounts ve text gerekli.' });
  }

  const results = [];

  for (const acc of accounts) {
    try {
      let result;
      if (acc.platform === 'telegram') {
        const r = await fetch(`${req.protocol}://${req.get('host')}/api/telegram/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken: acc.credentials.botToken, chatId: acc.credentials.chatId, text, mediaUrl })
        });
        result = await r.json();
      } else if (acc.platform === 'whatsapp') {
        const r = await fetch(`${req.protocol}://${req.get('host')}/api/whatsapp/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: acc.credentials.accessToken, phoneNumberId: acc.credentials.phoneNumberId, recipientPhone: acc.credentials.recipientPhone, text, mediaUrl })
        });
        result = await r.json();
      } else if (acc.platform === 'discord') {
        const r = await fetch(`${req.protocol}://${req.get('host')}/api/discord/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ webhookUrl: acc.credentials.webhookUrl, username: acc.credentials.username, text, mediaUrl })
        });
        result = await r.json();
      } else if (acc.platform === 'twitter') {
        const r = await fetch(`${req.protocol}://${req.get('host')}/api/twitter/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: acc.credentials.apiKey, apiSecret: acc.credentials.apiSecret, accessToken: acc.credentials.accessToken, accessTokenSecret: acc.credentials.accessTokenSecret, text })
        });
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

// ---------------------------------------------------------------------------
// OAuth 1.0a Header Builder for Twitter
// ---------------------------------------------------------------------------
function buildOAuthHeader(method, url, params, consumerKey, consumerSecret, token, tokenSecret) {
  const nonce = Math.random().toString(36).substring(2);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: token,
    oauth_version: '1.0'
  };

  const allParams = { ...params, ...oauthParams };
  const sortedParams = Object.keys(allParams).sort().map(k => `${encode(k)}=${encode(allParams[k])}`).join('&');
  const baseString = `${method.toUpperCase()}&${encode(url)}&${encode(sortedParams)}`;
  const signingKey = `${encode(consumerSecret)}&${encode(tokenSecret)}`;

  // HMAC-SHA1 using Node crypto
  const crypto = await import('crypto').catch(() => null);
  let signature = '';
  if (crypto) {
    signature = crypto.default.createHmac('sha1', signingKey).update(baseString).digest('base64');
  }
  oauthParams.oauth_signature = signature;

  return 'OAuth ' + Object.keys(oauthParams).sort()
    .map(k => `${encode(k)}="${encode(oauthParams[k])}"`)
    .join(', ');
}

function encode(str) {
  return encodeURIComponent(String(str)).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

// ---------------------------------------------------------------------------
// Serve static frontend
// ---------------------------------------------------------------------------
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 OmniSync Social running on port ${PORT}`);
});
