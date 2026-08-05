// ═══════════════════════════════════════════════════════════════════════════
//  PLATFORM CONNECTORS
//
//  Her platform aynı sözleşmeyi konuşur, böylece kural motoru "Telegram'dan
//  Twitter'a" değil "kaynaktan hedefe" düşünür ve her yön kendiliğinden çalışır.
//
//  Ortak gönderi biçimi (Post):
//    { text, media: [{ data: Buffer, mediaType: 'image/jpeg' | 'video/mp4' }],
//      author, sourceUrl, sourceLabel }
// ═══════════════════════════════════════════════════════════════════════════

export const PLATFORMS = {
  telegram:  { label: 'Telegram',    icon: '✈️', canSource: true, canTarget: true },
  twitter:   { label: 'X (Twitter)', icon: '𝕏',  canSource: true, canTarget: true },
  instagram: { label: 'Instagram',   icon: '📸', canSource: true, canTarget: true },
  facebook:  { label: 'Facebook',    icon: '📘', canSource: true, canTarget: true },
};

export function emptyPost(overrides = {}) {
  return { text: '', media: [], author: null, sourceUrl: null, sourceLabel: null, ...overrides };
}

// ─── Telegram: hedef olarak gönderim ────────────────────────────────────────
// Kullanıcı oturumuyla (MTProto) yazma yetkimiz olan her sohbete/kanala
// gönderebiliriz. Kanala göndermek için o kanalda yönetici olmak gerekir.

// "@kanal", "https://t.me/kanal", "-1001234567890", "1234567890" hepsini kabul et.
export function parseTelegramTarget(raw) {
  const s = (raw || '').trim();
  if (!s) return null;

  const privateLink = /(?:t\.me|telegram\.me)\/c\/(\d+)/i.exec(s);
  if (privateLink) return { kind: 'id', value: privateLink[1] };

  const link = /(?:t\.me|telegram\.me)\/(?:s\/)?@?([A-Za-z0-9_]+)/i.exec(s);
  if (link) {
    return /^\d+$/.test(link[1])
      ? { kind: 'id', value: link[1] }
      : { kind: 'username', value: link[1] };
  }

  if (s.startsWith('@')) {
    const handle = s.slice(1).trim();
    return handle ? { kind: 'username', value: handle } : null;
  }

  const digits = s.replace(/^-100/, '').replace(/^-/, '');
  if (/^\d+$/.test(digits)) return { kind: 'id', value: digits };
  if (/^[A-Za-z0-9_]{4,}$/.test(s)) return { kind: 'username', value: s };
  return null;
}

// MTProto tarafında hedefi çözerken kimliği sayı olarak vermek yetmiyor; kanal
// için erişim karması (access hash) gerekiyor. getInputEntity bunu bizim için
// çözüyor, ama yalnızca istemci o varlığı daha önce görmüşse. Kullanıcı adıyla
// çözmek her zaman çalıştığı için önce onu deniyoruz.
async function resolveTelegramPeer(client, target) {
  if (target.kind === 'username') {
    return await client.getInputEntity(target.value.startsWith('@') ? target.value : '@' + target.value);
  }
  // Kanal kimlikleri MTProto'da -100 öneki olmadan saklanır ama getInputEntity
  // dışa dönük (-100'lü) biçimi bekler.
  try {
    return await client.getInputEntity(Number('-100' + target.value));
  } catch (_) {
    return await client.getInputEntity(Number(target.value));
  }
}

export async function postToTelegram(client, targetRaw, post, options = {}) {
  const target = parseTelegramTarget(targetRaw);
  if (!target) {
    return { success: false, error: `Telegram hedefi anlaşılamadı: "${targetRaw}". @kanaladi veya -100... kimliği girin.` };
  }
  if (!client) {
    return { success: false, error: 'Telegram oturumu bağlı değil.' };
  }

  try {
    const peer = await resolveTelegramPeer(client, target);
    const caption = post.text || '';

    if (post.media?.length) {
      // Birden fazla medya varsa Telegram bunları albüm olarak gruplar.
      const CustomFile = await getCustomFile();
      const files = post.media.map((m, i) => new CustomFile(
        m.mediaType.startsWith('video/') ? `video${i}.mp4` : `image${i}.jpg`,
        m.data.length,
        '',
        m.data,
      ));
      await client.sendFile(peer, {
        file: files.length === 1 ? files[0] : files,
        caption,
        // Görselleri belge olarak değil, önizlemeli medya olarak gönder.
        forceDocument: false,
        silent: !!options.silent,
      });
    } else {
      if (!caption.trim()) return { success: false, error: 'Gönderilecek metin veya medya yok.' };
      await client.sendMessage(peer, {
        message: caption,
        silent: !!options.silent,
        linkPreview: options.linkPreview !== false,
      });
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: describeTelegramSendError(e) };
  }
}

// teleproto'nun CustomFile sınıfını tembel yüklüyoruz; modül yükleme sırasında
// teleproto'yu çekmek sunucu açılışını gereksiz yavaşlatıyor.
let _CustomFile = null;
async function getCustomFile() {
  if (!_CustomFile) {
    const mod = await import('teleproto/client/uploads.js');
    _CustomFile = mod.CustomFile || mod.default?.CustomFile;
    if (!_CustomFile) throw new Error('teleproto CustomFile bulunamadı');
  }
  return _CustomFile;
}

// ─── Medya indirme (ortak) ──────────────────────────────────────────────────
export const MEDIA_LIMITS = {
  image: 5 * 1024 * 1024,
  video: 64 * 1024 * 1024,
};

const BROWSER_UA_C = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export async function downloadMedia(url, mediaType) {
  const limit = mediaType.startsWith('video/') ? MEDIA_LIMITS.video : MEDIA_LIMITS.image;
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA_C } });
  if (!res.ok) throw new Error(`medya indirilemedi (HTTP ${res.status})`);

  // Sunucu boyutu önceden bildiriyorsa indirmeye hiç başlamayalım.
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared && declared > limit) {
    throw new Error(`medya boyut sınırını aşıyor (${(declared / 1048576).toFixed(1)} MB)`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > limit) {
    throw new Error(`medya boyut sınırını aşıyor (${(buf.length / 1048576).toFixed(1)} MB)`);
  }
  return buf;
}

// ─── X (Twitter): kaynak olarak okuma ───────────────────────────────────────
// X'in kendi gömme (embed) uç noktasını kullanıyoruz: herkese açık, çerez
// istemiyor, hesap riski yok ve son 20 gönderiyi medyasıyla birlikte veriyor.
// Böylece "linkini yapıştır, o hesaptan çek" isteği kendi hesabın olmadan da
// çalışıyor.
const SYNDICATION_URL = 'https://syndication.twitter.com/srv/timeline-profile/screen-name/';

export function parseTwitterHandle(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  const link = /(?:twitter\.com|x\.com)\/@?([A-Za-z0-9_]{1,15})/i.exec(s);
  if (link) return link[1];
  const bare = /^@?([A-Za-z0-9_]{1,15})$/.exec(s);
  return bare ? bare[1] : null;
}

function pickVideoUrl(m) {
  const variants = (m.video_info?.variants || []).filter(v => v.content_type === 'video/mp4');
  if (!variants.length) return null;
  // En yüksek bit hızı en iyi kalite, ama boyut sınırını aşma ihtimali de en
  // yüksek olan. Sınırı aşarsa indirme aşamasında zaten eleniyor.
  return variants.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0].url;
}

// Uç nokta hız sınırlı (HTTP 429). Sınıra takılan hesabı bir süre hiç
// yoklamıyoruz; yoksa her turda tekrar vurup sınırı uzatırdık.
const twitterCooldown = new Map(); // handle -> ne zamana kadar beklenecek
const TWITTER_COOLDOWN_MS = 15 * 60 * 1000;

export async function fetchTwitterTimeline(handleRaw) {
  const handle = parseTwitterHandle(handleRaw);
  if (!handle) throw new Error(`X hesabı anlaşılamadı: "${handleRaw}". @kullaniciadi veya x.com/kullaniciadi girin.`);

  const until = twitterCooldown.get(handle.toLowerCase());
  if (until && Date.now() < until) {
    const mins = Math.ceil((until - Date.now()) / 60000);
    throw new Error(`X hız sınırı: @${handle} için ${mins} dakika bekleniyor.`);
  }

  const res = await fetch(SYNDICATION_URL + encodeURIComponent(handle), {
    headers: { 'User-Agent': BROWSER_UA_C, 'Accept-Language': 'en-US,en;q=0.9' },
  });

  if (res.status === 429) {
    twitterCooldown.set(handle.toLowerCase(), Date.now() + TWITTER_COOLDOWN_MS);
    throw new Error(`X hız sınırına takıldı (@${handle}). 15 dakika beklenecek.`);
  }
  if (!res.ok) throw new Error(`X profili okunamadı (HTTP ${res.status})`);
  twitterCooldown.delete(handle.toLowerCase());

  return parseSyndicationHtml(await res.text(), handle);
}

export function parseSyndicationHtml(html, handle = '') {
  const blob = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!blob) {
    throw new Error(`@${handle} okunamadı. Hesap gizli, askıya alınmış ya da adı yanlış olabilir.`);
  }

  let entries;
  try {
    entries = JSON.parse(blob[1])?.props?.pageProps?.timeline?.entries || [];
  } catch (e) {
    throw new Error('X yanıtı çözümlenemedi: ' + e.message);
  }

  return entries
    .map(e => e?.content?.tweet)
    .filter(Boolean)
    .map(t => ({
      id: t.id_str,
      text: t.full_text || t.text || '',
      createdAt: t.created_at,
      author: t.user?.screen_name ? `@${t.user.screen_name}` : null,
      url: t.permalink ? `https://x.com${t.permalink}` : null,
      isRetweet: /^RT @/.test(t.full_text || ''),
      isReply: !!t.in_reply_to_status_id_str,
      media: (t.extended_entities?.media || t.entities?.media || []).map(m => {
        const videoUrl = m.type === 'photo' ? null : pickVideoUrl(m);
        return videoUrl
          ? { url: videoUrl, mediaType: 'video/mp4' }
          : { url: m.media_url_https, mediaType: 'image/jpeg' };
      }).filter(m => m.url),
    }));
}

// Zaman tünelindeki bir gönderiyi ortak Post biçimine çevirir; medyayı indirir.
export async function twitterItemToPost(item) {
  const media = [];
  for (const m of item.media) {
    try {
      media.push({ data: await downloadMedia(m.url, m.mediaType), mediaType: m.mediaType });
    } catch (e) {
      console.warn('[X kaynak] Medya atlandı:', e.message);
    }
  }
  return {
    text: item.text,
    media,
    author: item.author,
    sourceUrl: item.url,
    sourceLabel: `X ${item.author || ''}`.trim(),
  };
}

function describeTelegramSendError(e) {
  const msg = e?.errorMessage || e?.message || 'Bilinmeyen hata';
  if (msg.includes('CHAT_WRITE_FORBIDDEN')) return 'Bu kanala/gruba yazma yetkin yok. Kanalda yönetici olman gerekiyor.';
  if (msg.includes('CHANNEL_PRIVATE')) return 'Kanal özel ya da hesabın kanalda değil.';
  if (msg.includes('USERNAME_NOT_OCCUPIED') || msg.includes('USERNAME_INVALID')) return 'Böyle bir Telegram kullanıcı adı yok.';
  if (msg.includes('PEER_ID_INVALID')) return 'Hedef bulunamadı. Hesabın bu kanalda/grupta olduğundan emin ol.';
  if (msg.includes('Could not find the input entity')) return 'Hedef çözümlenemedi. Kanal kimliği yerine @kullaniciadi dene ya da hesabınla kanala katıl.';
  if (msg.includes('MEDIA_CAPTION_TOO_LONG')) return 'Açıklama Telegram sınırını aşıyor.';
  if (msg.includes('SLOWMODE_WAIT')) return 'Kanalda yavaş mod açık, biraz beklemek gerekiyor.';
  return msg;
}
