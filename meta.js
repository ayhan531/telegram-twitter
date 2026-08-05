// ═══════════════════════════════════════════════════════════════════════════
//  META CONNECTORS — Instagram & Facebook (Graph API)
//
//  Neden resmî API?
//    Instagram'ın gayriresmî yolları ya ölü (Node tarafındaki instagram-private-api
//    2024'ten beri güncellenmiyor) ya da hesap kapanma riski taşıyor. Resmî API
//    ücretsiz, kırılmıyor ve hikâye/Reels/yorum yönetimi dahil hepsini veriyor.
//
//  Gereken tek şey: Instagram hesabının "Profesyonel" (İşletme/Kreatör) olması.
//  Instagram Login kullandığımız için Facebook Sayfası bağlamak GEREKMİYOR.
// ═══════════════════════════════════════════════════════════════════════════

const API_VERSION = process.env.META_API_VERSION || 'v23.0';
const GRAPH_FB = `https://graph.facebook.com/${API_VERSION}`;
const GRAPH_IG = 'https://graph.instagram.com';

export const IG_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_comments',
].join(',');

export const FB_SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_manage_engagement',
].join(',');

// ─── Düşük seviyeli çağrı ───────────────────────────────────────────────────
async function graphCall(base, path, { method = 'GET', params = {}, token } = {}) {
  const url = new URL(`${base}${path}`);
  const body = new URLSearchParams();

  const usesBody = method === 'POST';
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (usesBody) body.set(k, String(v));
    else url.searchParams.set(k, String(v));
  }
  // Jetonu her zaman sorgu dizesine koyuyoruz: DELETE'te gövde gönderilmediği
  // için gövdeye yazsaydık istek kimliksiz gider ve 190 ile dönerdi.
  if (token) url.searchParams.set('access_token', token);

  const res = await fetch(url, {
    method,
    headers: usesBody ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {},
    body: usesBody ? body : undefined,
  });

  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error(`Meta yanıtı okunamadı (HTTP ${res.status})`);
  }
  if (data.error) throw new Error(describeMetaError(data.error));
  if (!res.ok) throw new Error(`Meta hatası (HTTP ${res.status})`);
  return data;
}

// Meta hata kodları teknik; kullanıcıya ne yapması gerektiğini söylüyoruz.
function describeMetaError(err) {
  const code = err.code;
  const sub = err.error_subcode;
  const msg = err.message || 'Bilinmeyen Meta hatası';

  if (code === 190) return 'Meta erişim izni geçersiz veya süresi dolmuş. Hesabı yeniden bağla.';
  if (code === 10 || code === 200) return `Yetki eksik: ${msg}. Uygulama izinlerini kontrol et.`;
  if (code === 4 || code === 17 || code === 32) return 'Meta istek sınırına takıldı, bir süre beklemek gerekiyor.';
  if (code === 9007) return 'Instagram bu medyayı kabul etmedi. Boyut/format sınırlarını kontrol et.';
  if (sub === 2207052) return 'Instagram medyayı indiremedi. Medya bağlantısı erişilebilir olmalı.';
  if (sub === 2207003) return 'Medya indirilemedi (zaman aşımı).';
  if (sub === 2207026) return 'Video formatı Instagram için uygun değil (MP4/MOV, H.264 olmalı).';
  if (code === 36003) return 'Bu Instagram hesabı Profesyonel (İşletme/Kreatör) değil.';
  return msg;
}

const igCall = (path, opts) => graphCall(GRAPH_IG, path, opts);
const fbCall = (path, opts) => graphCall(GRAPH_FB, path, opts);

// ─── Instagram: OAuth ───────────────────────────────────────────────────────
export function instagramAuthUrl({ appId, redirectUri, state }) {
  const u = new URL('https://www.instagram.com/oauth/authorize');
  u.searchParams.set('client_id', appId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', IG_SCOPES);
  u.searchParams.set('response_type', 'code');
  if (state) u.searchParams.set('state', state);
  return u.toString();
}

export async function instagramExchangeCode({ appId, appSecret, redirectUri, code }) {
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    // Instagram bazen kodun sonuna #_ ekliyor; temizlemezsek kod geçersiz sayılır.
    code: code.replace(/#_$/, ''),
  });
  const res = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (data.error_message || data.error) {
    throw new Error(data.error_message || describeMetaError(data.error));
  }

  // Kısa ömürlü jeton 1 saat yaşar; hemen 60 günlüğe çeviriyoruz.
  const long = await igCall('/access_token', {
    params: { grant_type: 'ig_exchange_token', client_secret: appSecret },
    token: data.access_token,
  });

  return {
    token: long.access_token,
    userId: String(data.user_id),
    expiresAt: Date.now() + (long.expires_in || 5184000) * 1000,
  };
}

// 60 günlük jeton, süresi dolmadan yenilenirse ömrü tekrar 60 güne çıkar.
// Bu yüzden düzenli yenileme "sonsuza kadar bağlı kal" demenin yolu.
export async function instagramRefreshToken(token) {
  const r = await igCall('/refresh_access_token', {
    params: { grant_type: 'ig_refresh_token' },
    token,
  });
  return { token: r.access_token, expiresAt: Date.now() + (r.expires_in || 5184000) * 1000 };
}

export async function instagramProfile(token) {
  const me = await igCall('/me', {
    params: { fields: 'user_id,username,name,account_type,profile_picture_url,followers_count,media_count' },
    token,
  });
  return {
    id: String(me.user_id || me.id),
    username: me.username,
    name: me.name || me.username,
    accountType: me.account_type,
    avatar: me.profile_picture_url,
    followers: me.followers_count,
    mediaCount: me.media_count,
  };
}

// ─── Instagram: yayınlama ───────────────────────────────────────────────────
// Instagram dosya baytı kabul etmiyor; medyayı herkese açık bir adresten
// çekiyor. Bu yüzden çağıran taraf bize geçici genel URL'ler veriyor
// (server.js içindeki /media/<token> ucu).

const CONTAINER_POLL_MS = 4000;
const CONTAINER_MAX_WAIT_MS = 5 * 60 * 1000;

async function waitForContainer(containerId, token) {
  const deadline = Date.now() + CONTAINER_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const r = await igCall(`/${containerId}`, { params: { fields: 'status_code,status' }, token });
    if (r.status_code === 'FINISHED') return;
    if (r.status_code === 'ERROR') throw new Error(`Instagram medyayı işleyemedi: ${r.status || 'ERROR'}`);
    if (r.status_code === 'EXPIRED') throw new Error('Instagram medya kabı zaman aşımına uğradı.');
    await new Promise(r2 => setTimeout(r2, CONTAINER_POLL_MS));
  }
  throw new Error('Instagram medyayı 5 dakikada işleyemedi.');
}

function igMediaParams(item, kind) {
  const isVideo = item.mediaType.startsWith('video/');
  if (kind === 'story') {
    return isVideo
      ? { media_type: 'STORIES', video_url: item.url }
      : { media_type: 'STORIES', image_url: item.url };
  }
  if (kind === 'reel') {
    if (!isVideo) throw new Error('Reels yalnızca video ile paylaşılabilir.');
    return { media_type: 'REELS', video_url: item.url };
  }
  return isVideo ? { media_type: 'REELS', video_url: item.url } : { image_url: item.url };
}

/**
 * @param account { igUserId, token }
 * @param post    { text, mediaUrls: [{url, mediaType}] }
 * @param options { kind: 'post'|'story'|'reel', disableComments, coverUrl, locationId }
 */
export async function publishToInstagram(account, post, options = {}) {
  const { igUserId, token } = account;
  const kind = options.kind || 'post';
  const media = post.mediaUrls || [];
  const caption = post.text || '';

  if (!media.length) {
    // Instagram'da salt metin gönderi yoktur — bu bir API kısıtı değil,
    // platformun kendi kuralı.
    return { success: false, error: 'Instagram yalnızca metin paylaşımını desteklemiyor; görsel veya video gerekli.' };
  }
  if (kind === 'story' && media.length > 1) {
    return { success: false, error: 'Hikâye tek seferde tek medya alır.' };
  }

  try {
    let containerId;

    if (media.length > 1 && kind === 'post') {
      // Karusel: önce her medya için alt kap, sonra bunları toplayan ana kap.
      const children = [];
      for (const item of media.slice(0, 10)) {
        const c = await igCall(`/${igUserId}/media`, {
          method: 'POST',
          params: { ...igMediaParams(item, 'post'), is_carousel_item: 'true' },
          token,
        });
        children.push(c.id);
      }
      for (const id of children) await waitForContainer(id, token);

      const parent = await igCall(`/${igUserId}/media`, {
        method: 'POST',
        params: { media_type: 'CAROUSEL', children: children.join(','), caption },
        token,
      });
      containerId = parent.id;
    } else {
      const params = { ...igMediaParams(media[0], kind) };
      // Hikâyelerde açıklama gösterilmez, göndermek hataya yol açabilir.
      if (kind !== 'story') params.caption = caption;
      if (options.coverUrl && kind === 'reel') params.cover_url = options.coverUrl;

      const c = await igCall(`/${igUserId}/media`, { method: 'POST', params, token });
      containerId = c.id;
    }

    await waitForContainer(containerId, token);

    const published = await igCall(`/${igUserId}/media_publish`, {
      method: 'POST',
      params: { creation_id: containerId },
      token,
    });

    // Yorum kapatma yayından sonra yapılır; kap oluştururken böyle bir alan yok.
    if (options.disableComments && published.id) {
      try {
        await setInstagramComments(account, published.id, false);
      } catch (e) {
        return { success: true, mediaId: published.id, warning: `Paylaşıldı ama yorumlar kapatılamadı: ${e.message}` };
      }
    }

    return { success: true, mediaId: published.id };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── Instagram: yorum yönetimi ──────────────────────────────────────────────
export async function setInstagramComments(account, mediaId, enabled) {
  await igCall(`/${mediaId}`, {
    method: 'POST',
    params: { comment_enabled: enabled ? 'true' : 'false' },
    token: account.token,
  });
  return { success: true };
}

export async function listInstagramComments(account, mediaId) {
  const r = await igCall(`/${mediaId}/comments`, {
    params: { fields: 'id,text,username,timestamp,like_count,hidden,replies{id,text,username,timestamp}' },
    token: account.token,
  });
  return r.data || [];
}

export async function hideInstagramComment(account, commentId, hidden = true) {
  await igCall(`/${commentId}`, {
    method: 'POST',
    params: { hide: hidden ? 'true' : 'false' },
    token: account.token,
  });
  return { success: true };
}

export async function deleteInstagramComment(account, commentId) {
  await graphCall(GRAPH_IG, `/${commentId}`, { method: 'DELETE', token: account.token });
  return { success: true };
}

export async function replyToInstagramComment(account, commentId, message) {
  const r = await igCall(`/${commentId}/replies`, {
    method: 'POST',
    params: { message },
    token: account.token,
  });
  return { success: true, id: r.id };
}

// ─── Instagram: kaynak olarak okuma ─────────────────────────────────────────
export async function fetchInstagramOwnMedia(account, limit = 25) {
  const r = await igCall(`/${account.igUserId}/media`, {
    params: {
      fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url}',
      limit,
    },
    token: account.token,
  });
  return (r.data || []).map(normalizeIgMedia);
}

// Başka bir hesabı okumak: Instagram yalnızca herkese açık PROFESYONEL
// hesapların okunmasına izin veriyor (business_discovery). Kişisel hesaplar
// resmî yolla okunamıyor — bu Instagram'ın kuralı, bizim eksiğimiz değil.
export async function fetchInstagramPublicMedia(account, usernameRaw, limit = 25) {
  const username = parseInstagramHandle(usernameRaw);
  if (!username) throw new Error(`Instagram hesabı anlaşılamadı: "${usernameRaw}"`);

  const fields = `business_discovery.username(${username}){username,followers_count,media_count,media.limit(${limit}){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url}}}`;
  let r;
  try {
    r = await igCall(`/${account.igUserId}`, { params: { fields }, token: account.token });
  } catch (e) {
    if (/does not exist|cannot be loaded|Invalid user/i.test(e.message)) {
      throw new Error(`@${username} okunamadı. Instagram yalnızca herkese açık İşletme/Kreatör hesaplarının bu yolla okunmasına izin veriyor.`);
    }
    throw e;
  }

  const bd = r.business_discovery;
  if (!bd) throw new Error(`@${username} bulunamadı ya da profesyonel hesap değil.`);
  return {
    username: bd.username,
    followers: bd.followers_count,
    items: (bd.media?.data || []).map(normalizeIgMedia),
  };
}

export function parseInstagramHandle(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  const link = /instagram\.com\/([A-Za-z0-9._]+)/i.exec(s);
  if (link && !['p', 'reel', 'reels', 'stories', 'explore'].includes(link[1])) return link[1];
  const bare = /^@?([A-Za-z0-9._]{1,30})$/.exec(s);
  return bare ? bare[1] : null;
}

function normalizeIgMedia(m) {
  const urls = [];
  if (m.media_type === 'CAROUSEL_ALBUM' && m.children?.data) {
    for (const c of m.children.data) {
      if (c.media_url) urls.push({ url: c.media_url, mediaType: c.media_type === 'VIDEO' ? 'video/mp4' : 'image/jpeg' });
    }
  } else if (m.media_url) {
    urls.push({ url: m.media_url, mediaType: m.media_type === 'VIDEO' ? 'video/mp4' : 'image/jpeg' });
  }
  return {
    id: m.id,
    text: m.caption || '',
    createdAt: m.timestamp,
    url: m.permalink,
    mediaType: m.media_type,
    media: urls,
  };
}

// ─── Facebook: OAuth ve Sayfa yönetimi ──────────────────────────────────────
export function facebookAuthUrl({ appId, redirectUri, state }) {
  const u = new URL(`https://www.facebook.com/${API_VERSION}/dialog/oauth`);
  u.searchParams.set('client_id', appId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', FB_SCOPES);
  u.searchParams.set('response_type', 'code');
  if (state) u.searchParams.set('state', state);
  return u.toString();
}

export async function facebookExchangeCode({ appId, appSecret, redirectUri, code }) {
  const short = await fbCall('/oauth/access_token', {
    params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
  });
  // Uzun ömürlü kullanıcı jetonu (~60 gün). Sayfa jetonları bundan türetilince
  // süresiz olur, bu yüzden bu adımı atlamıyoruz.
  const long = await fbCall('/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: short.access_token,
    },
  });
  return { token: long.access_token, expiresAt: Date.now() + (long.expires_in || 5184000) * 1000 };
}

export async function facebookListPages(userToken) {
  const r = await fbCall('/me/accounts', {
    params: { fields: 'id,name,access_token,category,picture{url}' },
    token: userToken,
  });
  return (r.data || []).map(p => ({
    id: p.id,
    name: p.name,
    token: p.access_token,
    category: p.category,
    avatar: p.picture?.data?.url,
  }));
}

// ─── Facebook: yayınlama ────────────────────────────────────────────────────
/**
 * @param page    { id, token }
 * @param post    { text, mediaUrls: [{url, mediaType}] }
 * @param options { kind: 'post'|'story'|'reel' }
 */
export async function publishToFacebook(page, post, options = {}) {
  const kind = options.kind || 'post';
  const media = post.mediaUrls || [];
  const text = post.text || '';

  try {
    if (kind === 'reel') {
      const video = media.find(m => m.mediaType.startsWith('video/'));
      if (!video) return { success: false, error: 'Reels için video gerekli.' };
      const r = await fbCall(`/${page.id}/video_reels`, {
        method: 'POST',
        params: { upload_phase: 'start' },
        token: page.token,
      });
      await uploadFacebookReel(r.video_id, video.url, page.token);
      const fin = await fbCall(`/${page.id}/video_reels`, {
        method: 'POST',
        params: { upload_phase: 'finish', video_id: r.video_id, video_state: 'PUBLISHED', description: text },
        token: page.token,
      });
      return { success: !!fin.success, id: r.video_id };
    }

    if (kind === 'story') {
      const item = media[0];
      if (!item) return { success: false, error: 'Hikâye için görsel veya video gerekli.' };
      if (item.mediaType.startsWith('video/')) {
        return { success: false, error: 'Facebook video hikâyesi şu an desteklenmiyor; görsel kullan.' };
      }
      // Hikâye için önce yayınlanmamış bir fotoğraf yükleyip kimliğini alıyoruz.
      const photo = await fbCall(`/${page.id}/photos`, {
        method: 'POST',
        params: { url: item.url, published: 'false' },
        token: page.token,
      });
      const r = await fbCall(`/${page.id}/photo_stories`, {
        method: 'POST',
        params: { photo_id: photo.id },
        token: page.token,
      });
      return { success: !!(r.success ?? r.post_id ?? r.id), id: r.post_id || r.id };
    }

    // Normal gönderi
    if (!media.length) {
      if (!text.trim()) return { success: false, error: 'Gönderilecek metin veya medya yok.' };
      const r = await fbCall(`/${page.id}/feed`, { method: 'POST', params: { message: text }, token: page.token });
      return { success: !!r.id, id: r.id };
    }

    const video = media.find(m => m.mediaType.startsWith('video/'));
    if (video) {
      const r = await fbCall(`/${page.id}/videos`, {
        method: 'POST',
        params: { file_url: video.url, description: text },
        token: page.token,
      });
      return { success: !!r.id, id: r.id };
    }

    if (media.length === 1) {
      const r = await fbCall(`/${page.id}/photos`, {
        method: 'POST',
        params: { url: media[0].url, message: text },
        token: page.token,
      });
      return { success: !!r.id, id: r.post_id || r.id };
    }

    // Çoklu fotoğraf: her biri yayınlanmamış olarak yüklenip tek gönderiye eklenir.
    const ids = [];
    for (const m of media.slice(0, 10)) {
      const p = await fbCall(`/${page.id}/photos`, {
        method: 'POST',
        params: { url: m.url, published: 'false' },
        token: page.token,
      });
      ids.push(p.id);
    }
    const params = { message: text };
    ids.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
    const r = await fbCall(`/${page.id}/feed`, { method: 'POST', params, token: page.token });
    return { success: !!r.id, id: r.id };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function uploadFacebookReel(videoId, fileUrl, token) {
  const res = await fetch(`https://rupload.facebook.com/video-upload/${API_VERSION}/${videoId}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, file_url: fileUrl },
  });
  const data = await res.json().catch(() => ({}));
  if (data.error) throw new Error(describeMetaError(data.error));
  if (!res.ok) throw new Error(`Reels yüklenemedi (HTTP ${res.status})`);
  return data;
}

// ─── Facebook: kaynak olarak okuma ve yorum yönetimi ────────────────────────
export async function fetchFacebookPagePosts(page, limit = 25) {
  const r = await fbCall(`/${page.id}/posts`, {
    params: { fields: 'id,message,created_time,permalink_url,full_picture,attachments{media_type,media,subattachments}', limit },
    token: page.token,
  });
  return (r.data || []).map(p => ({
    id: p.id,
    text: p.message || '',
    createdAt: p.created_time,
    url: p.permalink_url,
    media: collectFacebookMedia(p),
  }));
}

function collectFacebookMedia(post) {
  const out = [];
  const atts = post.attachments?.data || [];
  for (const a of atts) {
    const subs = a.subattachments?.data;
    if (subs?.length) {
      for (const s of subs) {
        if (s.media?.image?.src) out.push({ url: s.media.image.src, mediaType: 'image/jpeg' });
      }
    } else if (a.media?.image?.src) {
      out.push({ url: a.media.image.src, mediaType: 'image/jpeg' });
    }
  }
  if (!out.length && post.full_picture) out.push({ url: post.full_picture, mediaType: 'image/jpeg' });
  return out;
}

export async function listFacebookComments(page, postId) {
  const r = await fbCall(`/${postId}/comments`, {
    params: { fields: 'id,message,from,created_time,like_count,is_hidden' },
    token: page.token,
  });
  return r.data || [];
}

export async function hideFacebookComment(page, commentId, hidden = true) {
  await fbCall(`/${commentId}`, { method: 'POST', params: { is_hidden: hidden ? 'true' : 'false' }, token: page.token });
  return { success: true };
}

export async function deleteFacebookComment(page, commentId) {
  await graphCall(GRAPH_FB, `/${commentId}`, { method: 'DELETE', token: page.token });
  return { success: true };
}

export async function replyToFacebookComment(page, commentId, message) {
  const r = await fbCall(`/${commentId}/comments`, { method: 'POST', params: { message }, token: page.token });
  return { success: true, id: r.id };
}

// Facebook gönderilerinde yorumu tamamen kapatma resmî olarak yalnızca
// Sayfa gönderilerinde ve `comment_control` alanıyla ayarlanır.
export async function setFacebookCommentControl(page, postId, mode = 'EVERYONE') {
  // EVERYONE | FOLLOWERS_AND_MENTIONED | MENTIONED_ONLY | PEOPLE_AND_PAGES_YOU_FOLLOW
  await fbCall(`/${postId}`, { method: 'POST', params: { comment_control: mode }, token: page.token });
  return { success: true };
}
