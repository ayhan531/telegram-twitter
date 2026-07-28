export const INITIAL_ACCOUNTS = [
  {
    id: 'acc-1',
    platform: 'telegram',
    name: 'Teknoloji & Yazılım Duyuruları (Kanal)',
    username: '@tech_news_tr',
    type: 'channel',
    status: 'connected',
    botToken: '6891234567:AAHxxxxxx-SampleTelegramBotToken',
    chatId: '-100192837465',
    subscribers: '14,250',
    avatarColor: 'bg-sky-500'
  },
  {
    id: 'acc-2',
    platform: 'telegram',
    name: 'Kişisel Telegram VIP Grubu',
    username: '@cem_vip_chat',
    type: 'group',
    status: 'connected',
    botToken: '6891234567:AAHxxxxxx-SampleTelegramBotToken',
    chatId: '-100987654321',
    subscribers: '3,890',
    avatarColor: 'bg-blue-600'
  },
  {
    id: 'acc-3',
    platform: 'twitter',
    name: 'Cem Yazılım & Tech (Twitter)',
    username: '@cem_tech_x',
    type: 'account',
    status: 'connected',
    isVerified: true, // Mavi Tik / Premium 25.000 karakter limiti
    apiKey: 'x_oauth2_bearer_token_sample',
    followers: '28,400',
    avatarColor: 'bg-neutral-800'
  },
  {
    id: 'acc-4',
    platform: 'whatsapp',
    name: 'VIP Haber Duyuru Kanalı (WhatsApp)',
    phone: '+90 532 *** ** 00',
    type: 'whatsapp_channel',
    status: 'connected',
    webhookUrl: 'https://graph.facebook.com/v18.0/1092837465/messages',
    avatarColor: 'bg-emerald-600'
  },
  {
    id: 'acc-5',
    platform: 'linkedin',
    name: 'Cem | Senior Software Architect (LinkedIn)',
    username: 'cem-tech-dev',
    type: 'profile',
    status: 'connected',
    connections: '500+',
    avatarColor: 'bg-blue-700'
  },
  {
    id: 'acc-6',
    platform: 'instagram',
    name: 'Tech & Lifestyle (Instagram)',
    username: '@cem.techlife',
    type: 'business',
    status: 'idle',
    avatarColor: 'bg-pink-600'
  }
];

export const INITIAL_SYNC_RULES = [
  {
    id: 'rule-1',
    title: 'Telegram Kanalından Twitter (Mavi Tik) & WhatsApp\'a Görselli Çapraz Paylaşım',
    active: true,
    sourceId: 'acc-1', // Telegram Teknoloji Kanalı
    targetIds: ['acc-3', 'acc-4', 'acc-5'], // Twitter (Mavi Tik), WhatsApp, LinkedIn
    options: {
      autoHashtags: '#Teknoloji #Yazılım #Gündem',
      forwardMedia: true, // Görselleri & Medyayı ilet
      respectBlueTick: true, // Mavi Tik varsa 25.000 karaktere kadar gereksiz bölme yapma
      characterLimitTwitter: 280,
      autoThreadTwitter: true, // Standard hesaplar için split
      stripLinks: false,
      appendSourceLink: true,
      sourceLinkText: '💬 Telegram\'da Oku: https://t.me/tech_news_tr',
      bannedKeywords: ['spam', 'yasa dışı', 'promo123'],
      replacementRules: [
        { from: '@admin', to: '@cem_tech_x' }
      ]
    },
    totalSyncedCount: 342,
    lastSyncTime: '2026-07-28 17:40'
  },
  {
    id: 'rule-2',
    title: 'WhatsApp VIP Grubundan Telegram VIP Grubuna Aktarım',
    active: true,
    sourceId: 'acc-4',
    targetIds: ['acc-2'],
    options: {
      autoHashtags: '#VIP #Duyuru',
      forwardMedia: true,
      respectBlueTick: true,
      characterLimitTwitter: 0,
      autoThreadTwitter: false,
      stripLinks: false,
      appendSourceLink: false,
      bannedKeywords: [],
      replacementRules: []
    },
    totalSyncedCount: 189,
    lastSyncTime: '2026-07-28 16:15'
  }
];

export const INITIAL_SCHEDULED_POSTS = [
  {
    id: 'post-101',
    content: '🚀 Yeni Render Cloud Deploy Özelliğimiz Yayında! Artık bilgisayarınız açık kalmasa bile cep telefonunuzdan tüm sosyal medya paylaşımlarınızı anlık yönetebilirsiniz. #Render #Cloud #Automation',
    targetIds: ['acc-1', 'acc-3', 'acc-5'],
    scheduledAt: '2026-07-29T14:30',
    status: 'scheduled',
    hashtags: ['#Render', '#Cloud', '#Automation'],
    mediaUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80',
    createdAt: '2026-07-28 18:20'
  },
  {
    id: 'post-102',
    content: '💡 Haftalık Yazılım ve AI İpuçları #12: Yapay zeka ile otomatik çapraz paylaşım ve karakter bölücü kullanımı kılavuzu yayında!',
    targetIds: ['acc-1', 'acc-3', 'acc-4'],
    scheduledAt: '2026-07-30T10:00',
    status: 'scheduled',
    hashtags: ['#Yazılım', '#AI', '#Tips'],
    mediaUrl: '',
    createdAt: '2026-07-28 18:00'
  }
];

export const INITIAL_HASHTAG_PRESETS = [
  { id: 'h-1', name: 'Yazılım & Teknoloji', tags: ['#Teknoloji', '#Yazılım', '#Coding', '#Developer', '#Software'] },
  { id: 'h-2', name: 'AI & Yapay Zeka', tags: ['#YapayZeka', '#ArtificialIntelligence', '#MachineLearning', '#AI'] },
  { id: 'h-3', name: 'Gündem & Haber', tags: ['#Gündem', '#SonDakika', '#Haber', '#Duyuru'] },
  { id: 'h-4', name: 'İş & Kariyer', tags: ['#Kariyer', '#LinkedinTr', '#Girişimcilik', '#Business'] }
];

export const INITIAL_LOGS = [
  {
    id: 'log-801',
    timestamp: '2026-07-28 17:40:12',
    source: 'Telegram (@tech_news_tr)',
    messagePreview: 'Yapay zeka modellerinde son gelişmeler ve yeni güncelleme paketi duyuruldu...',
    targets: ['Twitter (Mavi Tik)', 'WhatsApp', 'LinkedIn'],
    status: 'success',
    details: 'Twitter hesabı Mavi Tik (X Premium) sahibi olduğu için 25.000 karakter desteğiyle BÖLÜNMEDEN tek parça olarak iletildi. Görsel medya başarıyla iletildi.'
  },
  {
    id: 'log-800',
    timestamp: '2026-07-28 16:15:04',
    source: 'WhatsApp (VIP Haber)',
    messagePreview: 'Önemli VIP topluluk duyurusu: Bu akşam saat 21:00\'de canlı soru-cevap yayını...',
    targets: ['Telegram VIP Group'],
    status: 'success',
    details: 'Mesaj filtrelerden geçti. #VIP #Duyuru etiketleri eklenerek Telegram grubuna iletildi.'
  }
];

// Helper to load or initialize LocalStorage
export function getStoredData(key, fallback) {
  try {
    const item = localStorage.getItem(`omnisync_${key}`);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    console.error(`Error loading key ${key}`, e);
    return fallback;
  }
}

export function saveStoredData(key, value) {
  try {
    localStorage.setItem(`omnisync_${key}`, JSON.stringify(value));
  } catch (e) {
    console.error(`Error saving key ${key}`, e);
  }
}
