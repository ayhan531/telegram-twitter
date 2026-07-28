import React, { useState } from 'react';
import { 
  PenTool, 
  Send, 
  Calendar, 
  Hash, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  MessageSquare, 
  Twitter, 
  Linkedin, 
  Instagram, 
  Share2,
  Image as ImageIcon,
  Clock,
  Check,
  X,
  BadgeCheck
} from 'lucide-react';

export default function PostComposer({ 
  accounts, 
  rules, 
  scheduledPosts, 
  setScheduledPosts, 
  logs, 
  setLogs, 
  hashtagPresets, 
  onShowToast 
}) {
  
  const [content, setContent] = useState(
    '🚀 OmniSync Social ile Telegram, Twitter, WhatsApp ve LinkedIn kanallarımız artık %100 eşzamanlı senkronize edildi! Mavi tikli hesabımız ile 25.000 karaktere kadar paylaşımları gereksiz bölünmeden tek parça halinde iletebilirsiniz.'
  );

  const [selectedAccountIds, setSelectedAccountIds] = useState(
    accounts.slice(0, 4).map(a => a.id)
  );

  const [autoHashtags, setAutoHashtags] = useState('#Teknoloji #Yazılım #Automation');
  const [mediaUrl, setMediaUrl] = useState('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80');
  const [showMediaInput, setShowMediaInput] = useState(true);
  const [scheduleTime, setScheduleTime] = useState('');
  const [isScheduleMode, setIsScheduleMode] = useState(false);
  const [activePreviewTab, setActivePreviewTab] = useState('all');

  // Check if selected Twitter accounts have Blue Tick (isVerified)
  const selectedTwitterAccs = accounts.filter(a => selectedAccountIds.includes(a.id) && a.platform === 'twitter');
  const hasVerifiedTwitter = selectedTwitterAccs.some(a => a.isVerified);

  // Character limits
  const fullTextWithTags = `${content}\n\n${autoHashtags}`.trim();
  const charCount = fullTextWithTags.length;

  // Twitter Character Limit logic: 25,000 for Blue Tick, 280 for Standard
  const twitterCharLimit = hasVerifiedTwitter ? 25000 : 280;
  const isTwitterOverLimit = charCount > twitterCharLimit;

  // Generate Twitter threads only if not verified or exceeds limit
  const generateTwitterThreads = (text) => {
    if (text.length <= twitterCharLimit) return [text];
    
    const words = text.split(' ');
    const chunks = [];
    let current = '';

    words.forEach(word => {
      if ((current + ' ' + word).length > 250) {
        chunks.push(current.trim());
        current = word;
      } else {
        current += (current ? ' ' : '') + word;
      }
    });
    if (current) chunks.push(current.trim());

    return chunks.map((chunk, idx) => `🧵 (${idx + 1}/${chunks.length}) ${chunk}`);
  };

  const twitterThreads = generateTwitterThreads(fullTextWithTags);

  const toggleAccount = (id) => {
    setSelectedAccountIds(prev => 
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const handleAppendHashtagPreset = (tags) => {
    const tagsStr = tags.join(' ');
    setAutoHashtags(prev => prev ? `${prev} ${tagsStr}` : tagsStr);
    onShowToast('Hashtagler eklendi!', 'info');
  };

  const handlePublishNow = () => {
    if (!content.trim()) {
      onShowToast('Lütfen bir paylaşım metni girin!', 'error');
      return;
    }
    if (selectedAccountIds.length === 0) {
      onShowToast('Lütfen en az bir hedef hesap seçin!', 'error');
      return;
    }

    const selectedAccNames = accounts
      .filter(a => selectedAccountIds.includes(a.id))
      .map(a => a.name);

    let detailMsg = 'Tüm seçili kanallara eşzamanlı başarıyla iletildi.';
    if (hasVerifiedTwitter) {
      detailMsg = 'Twitter hesabı Mavi Tik sahibi olduğu için 25.000 karakter desteğiyle BÖLÜNMEDEN tek parça iletildi.';
    } else if (isTwitterOverLimit) {
      detailMsg = `Twitter için ${twitterThreads.length} parçalı Thread oluşturuldu.`;
    }

    if (mediaUrl) {
      detailMsg += ' Görsel medya başarıyla iletildi.';
    }

    const newLog = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleString('tr-TR'),
      source: 'Manuel Paylaşım (Composer)',
      messagePreview: content.slice(0, 60) + '...',
      targets: selectedAccNames,
      status: 'success',
      details: detailMsg
    };

    setLogs(prev => [newLog, ...prev]);
    onShowToast(`Paylaşım ${selectedAccountIds.length} hesaba başarıyla gönderildi!`, 'success');
  };

  const handleSchedulePost = () => {
    if (!content.trim()) {
      onShowToast('Lütfen bir paylaşım metni girin!', 'error');
      return;
    }
    if (!scheduleTime) {
      onShowToast('Lütfen paylaşım tarihi ve saati seçin!', 'error');
      return;
    }

    const newPost = {
      id: `post-${Date.now()}`,
      content: fullTextWithTags,
      targetIds: selectedAccountIds,
      scheduledAt: scheduleTime,
      status: 'scheduled',
      hashtags: autoHashtags.split(' ').filter(Boolean),
      mediaUrl: mediaUrl,
      createdAt: new Date().toLocaleString('tr-TR')
    };

    setScheduledPosts(prev => [newPost, ...prev]);
    onShowToast('Paylaşım medya ile birlikte takvime zamanlandı!', 'success');
    setIsScheduleMode(false);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="p-6 rounded-2xl glass-panel border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <PenTool className="text-indigo-400" />
            <span>Gelişmiş Paylaşım Oluşturucu (Görsel & Mavi Tik Desteği)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Görsellerinizi ve metninizi tek bir yerden yazın; Twitter Mavi Tik (25.000 karakter) ve medya iletimi ile tüm platformlarda canlı önizleyin.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsScheduleMode(!isScheduleMode)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition flex items-center space-x-1.5 ${
              isScheduleMode ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            <Clock size={15} />
            <span>{isScheduleMode ? 'Zamanlama Açık' : 'İleri Tarihe Zamanla'}</span>
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Form Column (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          
          <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">
            
            {/* Account Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">
                Yayınlanacak Hesaplar ({selectedAccountIds.length} Seçili)
              </label>

              <div className="flex flex-wrap gap-2">
                {accounts.map(acc => {
                  const isSelected = selectedAccountIds.includes(acc.id);
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => toggleAccount(acc.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition flex items-center space-x-1.5 ${
                        isSelected 
                          ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/60 shadow-sm' 
                          : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-indigo-400' : 'bg-slate-600'}`}></span>
                      <span>{acc.name}</span>
                      {acc.platform === 'twitter' && acc.isVerified && (
                        <BadgeCheck size={14} className="text-sky-400 ml-0.5 inline" title="Mavi Tik / X Premium (25.000 Karakter)" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Blue Tick Banner Status */}
            {hasVerifiedTwitter && (
              <div className="p-3 rounded-xl bg-sky-950/40 border border-sky-500/30 text-xs text-sky-300 flex items-center space-x-2">
                <BadgeCheck size={18} className="text-sky-400 shrink-0" />
                <div>
                  <p className="font-bold">Twitter Mavi Tik (X Premium) Aktif!</p>
                  <p className="text-[11px] text-sky-400/80">Gönderileriniz gereksiz yere bölünmeyecek (25.000 karaktere kadar izin var).</p>
                </div>
              </div>
            )}

            {/* Main Textarea */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">Paylaşım Metni</label>
                <div className="text-[11px] font-medium text-slate-400 space-x-2">
                  <span>Karakter: <strong className="text-white">{charCount}</strong></span>
                  {hasVerifiedTwitter ? (
                    <span className="text-sky-400 font-bold">✓ Mavi Tik (Max 25k)</span>
                  ) : isTwitterOverLimit ? (
                    <span className="text-amber-400 font-bold">🧵 Standart Twitter Thread ({twitterThreads.length} Tweet)</span>
                  ) : null}
                </div>
              </div>

              <textarea
                rows={6}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paylaşım içeriğinizi buraya yazın..."
                className="w-full p-3.5 rounded-xl glass-input text-xs sm:text-sm text-white resize-none"
              />
            </div>

            {/* Media Attachment Picker / URL */}
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
                  <ImageIcon size={16} className="text-indigo-400" />
                  <span>Görsel / Medya Ekleme</span>
                </label>

                {mediaUrl && (
                  <button 
                    onClick={() => setMediaUrl('')}
                    className="text-[10px] text-rose-400 hover:underline"
                  >
                    Görseli Kaldır
                  </button>
                )}
              </div>

              <input 
                type="text"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://gorsel-linki.com/foto.jpg"
                className="w-full px-3 py-2 rounded-xl glass-input text-xs"
              />

              {/* Sample Media Shortcuts */}
              <div className="flex items-center space-x-2 pt-1 text-[11px]">
                <span className="text-slate-400">Örnek Görseller:</span>
                <button
                  type="button"
                  onClick={() => setMediaUrl('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80')}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300"
                >
                  Teknoloji
                </button>
                <button
                  type="button"
                  onClick={() => setMediaUrl('https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&q=80')}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300"
                >
                  Yazılım & AI
                </button>
              </div>
            </div>

            {/* Auto Hashtag Inputs */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Otomatik Hashtagler</label>
              <input 
                type="text"
                value={autoHashtags}
                onChange={(e) => setAutoHashtags(e.target.value)}
                placeholder="#Teknoloji #Gündem"
                className="w-full px-3 py-2 rounded-xl glass-input text-xs"
              />
            </div>

            {/* Quick Hashtag Presets */}
            <div>
              <p className="text-[11px] font-semibold text-slate-400 mb-1.5">Hızlı Hashtag Paketleri:</p>
              <div className="flex flex-wrap gap-1.5">
                {hashtagPresets.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleAppendHashtagPreset(preset.tags)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-950/60 text-slate-300 hover:text-indigo-300 border border-slate-700 text-[11px] transition"
                  >
                    + {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Schedule Input if Schedule Mode is Active */}
            {isScheduleMode && (
              <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-2">
                <label className="block text-xs font-bold text-amber-300">Planlanacak Tarih & Saat</label>
                <input 
                  type="datetime-local"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs"
                />
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2">
              {isScheduleMode ? (
                <button
                  type="button"
                  onClick={handleSchedulePost}
                  className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-amber-600/20 transition flex items-center justify-center space-x-2"
                >
                  <Calendar size={16} />
                  <span>Seçili Tarihe Zamanla (Görsel Dahil)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePublishNow}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white text-xs sm:text-sm font-bold shadow-lg shadow-indigo-600/30 transition flex items-center justify-center space-x-2"
                >
                  <Send size={16} />
                  <span>Eşzamanlı Yayınla ({selectedAccountIds.length} Kanal)</span>
                </button>
              )}
            </div>

          </div>

        </div>

        {/* Right Preview Column (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          
          <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">
            
            {/* Preview Selector Tabs */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Sparkles className="text-amber-400" size={16} />
                <span>Canlı Sosyal Medya Kart Önizlemeleri</span>
              </h3>

              <div className="flex items-center space-x-1 text-xs">
                <button 
                  onClick={() => setActivePreviewTab('all')}
                  className={`px-2 py-1 rounded-lg ${activePreviewTab === 'all' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400'}`}
                >
                  Tümü
                </button>
                <button 
                  onClick={() => setActivePreviewTab('telegram')}
                  className={`px-2 py-1 rounded-lg ${activePreviewTab === 'telegram' ? 'bg-sky-600 text-white font-semibold' : 'text-slate-400'}`}
                >
                  Telegram
                </button>
                <button 
                  onClick={() => setActivePreviewTab('twitter')}
                  className={`px-2 py-1 rounded-lg ${activePreviewTab === 'twitter' ? 'bg-neutral-700 text-white font-semibold' : 'text-slate-400'}`}
                >
                  Twitter
                </button>
                <button 
                  onClick={() => setActivePreviewTab('whatsapp')}
                  className={`px-2 py-1 rounded-lg ${activePreviewTab === 'whatsapp' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400'}`}
                >
                  WhatsApp
                </button>
              </div>
            </div>

            {/* Preview Cards List */}
            <div className="space-y-4 max-h-[650px] overflow-y-auto pr-1">
              
              {/* Telegram Preview Card */}
              {(activePreviewTab === 'all' || activePreviewTab === 'telegram') && (
                <div className="p-4 rounded-xl bg-slate-900 border border-sky-500/30 space-y-2">
                  <div className="flex items-center justify-between text-xs text-sky-400 font-bold">
                    <div className="flex items-center space-x-2">
                      <MessageSquare size={16} />
                      <span>TELEGRAM KANAL GÖRÜNÜMÜ</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-normal">Görsel + Metin Medya İletimi</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-slate-100 whitespace-pre-wrap leading-relaxed space-y-2">
                    {mediaUrl && (
                      <div className="rounded-lg overflow-hidden border border-slate-800 max-h-56">
                        <img src={mediaUrl} alt="Media" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <p>{fullTextWithTags}</p>
                    <div className="mt-2 text-[10px] text-sky-400 flex items-center justify-end space-x-1">
                      <span>👁 1,420 views</span>
                      <span>• 19:05</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Twitter / X Preview Card */}
              {(activePreviewTab === 'all' || activePreviewTab === 'twitter') && (
                <div className="p-4 rounded-xl bg-slate-900 border border-neutral-700 space-y-2">
                  <div className="flex items-center justify-between text-xs text-white font-bold">
                    <div className="flex items-center space-x-2">
                      <Twitter size={16} className="text-sky-400" />
                      <span>TWITTER (X) GÖRÜNÜMÜ</span>
                    </div>

                    {hasVerifiedTwitter ? (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30 flex items-center space-x-1">
                        <BadgeCheck size={12} className="text-sky-400" />
                        <span>Mavi Tik (25k Limiti - Bölünme Yok)</span>
                      </span>
                    ) : isTwitterOverLimit ? (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                        🧵 Standart Hesabınız İçin {twitterThreads.length} Parçalı Thread
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-normal">280 / {charCount} Karakter</span>
                    )}
                  </div>

                  {(!hasVerifiedTwitter && isTwitterOverLimit) ? (
                    <div className="space-y-2">
                      {twitterThreads.map((thread, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-black border border-neutral-800 text-xs text-slate-100 space-y-2">
                          <div className="flex items-center space-x-2 text-[11px] font-bold text-sky-400">
                            <span className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center text-white text-[10px]">C</span>
                            <span>@cem_tech_x</span>
                          </div>
                          {idx === 0 && mediaUrl && (
                            <div className="rounded-lg overflow-hidden border border-neutral-800 max-h-48">
                              <img src={mediaUrl} alt="Twitter Media" className="w-full h-full object-cover" />
                            </div>
                          )}
                          <p className="whitespace-pre-wrap">{thread}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-black border border-neutral-800 text-xs text-slate-100 space-y-2">
                      <div className="flex items-center space-x-2 text-[11px] font-bold text-white">
                        <span className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center text-white text-[10px]">C</span>
                        <span className="text-sky-400 flex items-center">
                          @cem_tech_x
                          {hasVerifiedTwitter && <BadgeCheck size={13} className="text-sky-400 ml-1" />}
                        </span>
                      </div>
                      {mediaUrl && (
                        <div className="rounded-lg overflow-hidden border border-neutral-800 max-h-56">
                          <img src={mediaUrl} alt="Twitter Media" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{fullTextWithTags}</p>
                    </div>
                  )}
                </div>
              )}

              {/* WhatsApp Preview Card */}
              {(activePreviewTab === 'all' || activePreviewTab === 'whatsapp') && (
                <div className="p-4 rounded-xl bg-slate-900 border border-emerald-500/30 space-y-2">
                  <div className="flex items-center justify-between text-xs text-emerald-400 font-bold">
                    <div className="flex items-center space-x-2">
                      <MessageSquare size={16} />
                      <span>WHATSAPP GÖRÜNÜMÜ</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-normal">Medya & Metin</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#0b141a] border border-emerald-900/40 text-xs text-slate-100 whitespace-pre-wrap leading-relaxed space-y-2">
                    <p className="text-emerald-400 font-bold text-[11px]">Cem (Yönetici):</p>
                    {mediaUrl && (
                      <div className="rounded-lg overflow-hidden border border-emerald-900/50 max-h-56">
                        <img src={mediaUrl} alt="WhatsApp Image" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <p>{fullTextWithTags}</p>
                    <div className="mt-1 text-[10px] text-slate-400 text-right">
                      19:05 ✓✓
                    </div>
                  </div>
                </div>
              )}

              {/* LinkedIn Preview Card */}
              {(activePreviewTab === 'all' || activePreviewTab === 'linkedin') && (
                <div className="p-4 rounded-xl bg-slate-900 border border-blue-500/30 space-y-2">
                  <div className="flex items-center justify-between text-xs text-blue-400 font-bold">
                    <div className="flex items-center space-x-2">
                      <Linkedin size={16} />
                      <span>LINKEDIN GÖRÜNÜMÜ</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-normal">3000 Karakter</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed space-y-2">
                    <div className="flex items-center space-x-2 mb-1">
                      <div className="w-6 h-6 rounded-full bg-blue-700 text-white flex items-center justify-center font-bold text-[10px]">C</div>
                      <div>
                        <p className="font-bold text-xs text-white">Cem • Senior Software Architect</p>
                        <p className="text-[10px] text-slate-400">1d • 🌐 Public</p>
                      </div>
                    </div>
                    <p>{fullTextWithTags}</p>
                    {mediaUrl && (
                      <div className="rounded-lg overflow-hidden border border-slate-800 max-h-56">
                        <img src={mediaUrl} alt="LinkedIn Media" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
