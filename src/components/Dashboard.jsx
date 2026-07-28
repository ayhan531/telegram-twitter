import React from 'react';
import { 
  Repeat, 
  Send, 
  Calendar, 
  TrendingUp, 
  CheckCircle2, 
  ArrowRight, 
  Play, 
  Sparkles,
  Zap,
  MessageSquare,
  Twitter,
  Linkedin,
  Clock,
  Radio,
  Plus
} from 'lucide-react';

export default function Dashboard({ 
  accounts, 
  rules, 
  setRules, 
  scheduledPosts, 
  logs, 
  setActiveTab,
  onOpenQuickCompose 
}) {

  // Calculate Stats
  const totalSynced = rules.reduce((sum, r) => sum + r.totalSyncedCount, 0);
  const activeRulesCount = rules.filter(r => r.active).length;
  const scheduledCount = scheduledPosts.filter(p => p.status === 'scheduled').length;
  const successLogsCount = logs.filter(l => l.status === 'success').length;
  const successRate = logs.length > 0 ? Math.round((successLogsCount / logs.length) * 100) : 100;

  // Toggle active status for a sync rule directly from dashboard
  const toggleRule = (ruleId) => {
    setRules(prev => prev.map(r => r.id === ruleId ? { ...r, active: !r.active } : r));
  };

  return (
    <div className="space-y-6">
      
      {/* Welcome & Top Banner */}
      <div className="p-6 rounded-2xl glass-panel border border-slate-800 bg-gradient-to-r from-indigo-950/40 via-slate-900/80 to-slate-950 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center space-x-1">
              <Zap size={12} className="animate-bounce" />
              <span>Otomatik Sosyal Medya Senkronizasyonu</span>
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-2">
            Çapraz Paylaşım ve Otomasyon Merkezi
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Telegram kanallarınızda paylaştığınız her şeyi anında Twitter (X), WhatsApp, LinkedIn ve diğer hesaplarınıza filtre ve hashtag kurallarıyla aktarın.
          </p>
        </div>

        <div className="flex items-center space-x-3 self-start md:self-auto">
          <button 
            onClick={() => setActiveTab('webhook-tester')}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-semibold border border-slate-700 transition"
          >
            <Sparkles size={16} className="text-amber-400" />
            <span>Simülatörü Çalıştır</span>
          </button>

          <button 
            onClick={onOpenQuickCompose}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-indigo-500/25 transition"
          >
            <Plus size={16} />
            <span>Yeni Paylaşım</span>
          </button>
        </div>
      </div>

      {/* Analytics & Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="p-4 rounded-xl glass-card flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Toplam Aktarılan Mesaj</p>
            <h3 className="text-2xl font-extrabold text-white mt-1">{totalSynced.toLocaleString()}</h3>
            <p className="text-[11px] text-emerald-400 flex items-center mt-1">
              <TrendingUp size={12} className="mr-1" /> %100 Otomatik Senkron
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Send size={22} />
          </div>
        </div>

        <div className="p-4 rounded-xl glass-card flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Aktif Paylaşım Kuralları</p>
            <h3 className="text-2xl font-extrabold text-white mt-1">{activeRulesCount} <span className="text-xs text-slate-400 font-normal">/ {rules.length}</span></h3>
            <p className="text-[11px] text-indigo-400 flex items-center mt-1">
              <Repeat size={12} className="mr-1" /> Canlı Çapraz Bağlantı
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Repeat size={22} />
          </div>
        </div>

        <div className="p-4 rounded-xl glass-card flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Planlanmış Gönderi</p>
            <h3 className="text-2xl font-extrabold text-white mt-1">{scheduledCount}</h3>
            <p className="text-[11px] text-amber-400 flex items-center mt-1">
              <Clock size={12} className="mr-1" /> Takvim Kuyruğunda
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Calendar size={22} />
          </div>
        </div>

        <div className="p-4 rounded-xl glass-card flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Başarı Oranı</p>
            <h3 className="text-2xl font-extrabold text-white mt-1">%{successRate}</h3>
            <p className="text-[11px] text-emerald-400 flex items-center mt-1">
              <CheckCircle2 size={12} className="mr-1" /> Sorunsuz İletim
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 size={22} />
          </div>
        </div>

      </div>

      {/* Visual Sync Diagram & Rule Controller */}
      <div className="p-6 rounded-2xl glass-panel border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <span>Çapraz Paylaşım Akış Diagramı & Kurallar</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Mesajların hangi kanaldan çekilip nerede yayınlanacağını aktif/pasif edin</p>
          </div>

          <button 
            onClick={() => setActiveTab('sync-rules')}
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
          >
            <span>Kural Düzenle</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {/* Visual Live Mapping Diagram */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          
          {/* Source Box */}
          <div className="p-3.5 rounded-xl bg-sky-950/40 border border-sky-500/30 text-center space-y-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 uppercase">
              KAYNAK PLATFORM (Örn: Telegram)
            </span>
            <div className="flex items-center justify-center space-x-2 text-sky-400">
              <MessageSquare size={20} />
              <span className="font-bold text-sm text-white">Telegram Kanalları & Gruplar</span>
            </div>
            <p className="text-[11px] text-slate-400">Gelen mesajlar anlık tetiklenir</p>
          </div>

          {/* Transformer & Filter Center Box */}
          <div className="p-3.5 rounded-xl bg-indigo-950/50 border border-indigo-500/30 text-center space-y-2 relative">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
              DÖNÜŞTÜRÜCÜ & FİLTRE MOTORU
            </span>
            <div className="text-xs text-slate-300 font-medium space-y-1">
              <p className="text-emerald-400 font-semibold">✓ Hashtag Otomatik Ekleme</p>
              <p className="text-indigo-300">✓ Twitter 280 Karakter Bölücü (Thread)</p>
              <p className="text-amber-300">✓ Kelime & Link Temizleyici</p>
            </div>
          </div>

          {/* Target Destinations Box */}
          <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-center space-y-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
              HEDEF PLATFORMLAR
            </span>
            <div className="flex items-center justify-center space-x-3 text-slate-200">
              <div className="flex items-center space-x-1 text-sky-400"><Twitter size={16} /><span className="text-xs font-semibold">Twitter</span></div>
              <div className="flex items-center space-x-1 text-emerald-400"><MessageSquare size={16} /><span className="text-xs font-semibold">WhatsApp</span></div>
              <div className="flex items-center space-x-1 text-blue-400"><Linkedin size={16} /><span className="text-xs font-semibold">LinkedIn</span></div>
            </div>
            <p className="text-[11px] text-slate-400">Eşzamanlı Otomatik Yayın</p>
          </div>

        </div>

        {/* Sync Rules List */}
        <div className="space-y-3 pt-2">
          {rules.map((rule) => {
            const sourceAcc = accounts.find(a => a.id === rule.sourceId);
            const targetAccs = accounts.filter(a => rule.targetIds.includes(a.id));

            return (
              <div 
                key={rule.id}
                className={`p-4 rounded-xl glass-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 border ${rule.active ? 'border-indigo-500/30' : 'border-slate-800 opacity-60'}`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <span className={`w-2 h-2 rounded-full ${rule.active ? 'bg-emerald-400' : 'bg-slate-500'}`}></span>
                    <h4 className="font-semibold text-sm text-white">{rule.title}</h4>
                  </div>
                  
                  {/* Mapping badges */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 font-medium">
                      Kaynak: {sourceAcc ? sourceAcc.name : 'Telegram'}
                    </span>
                    <ArrowRight size={12} className="text-slate-500" />
                    <div className="flex items-center space-x-1">
                      {targetAccs.map(t => (
                        <span key={t.id} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[11px]">
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right controls */}
                <div className="flex items-center space-x-4 self-end sm:self-center">
                  <div className="text-right text-xs">
                    <p className="text-slate-400">Senkronize: <span className="text-white font-semibold">{rule.totalSyncedCount}</span></p>
                    <p className="text-[10px] text-slate-400">Son: {rule.lastSyncTime}</p>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    onClick={() => toggleRule(rule.id)}
                    className={`w-12 h-6 rounded-full p-1 transition-colors ${rule.active ? 'bg-emerald-500' : 'bg-slate-700'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${rule.active ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Logs & Quick Actions Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recent Activity Feed (2 cols) */}
        <div className="lg:col-span-2 p-6 rounded-2xl glass-panel border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Son Çapraz Paylaşım İşlemleri</h3>
            <button 
              onClick={() => setActiveTab('logs')}
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300"
            >
              Tüm Logları Gör
            </button>
          </div>

          <div className="space-y-3">
            {logs.slice(0, 4).map((log) => (
              <div key={log.id} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-start justify-between text-xs gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      log.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      log.status === 'filtered' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {log.status === 'success' ? 'Başarılı Aktarım' : log.status === 'filtered' ? 'Filtrelendi' : 'Hata'}
                    </span>
                    <span className="text-slate-400 text-[11px]">{log.timestamp}</span>
                  </div>
                  <p className="text-slate-200 font-medium line-clamp-1">"{log.messagePreview}"</p>
                  <p className="text-[11px] text-slate-400">{log.details}</p>
                </div>

                <div className="text-right text-[11px] text-slate-400 whitespace-nowrap">
                  <span>Hedefler: {log.targets.join(', ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Tools Box */}
        <div className="p-6 rounded-2xl glass-panel border border-slate-800 space-y-4">
          <h3 className="text-base font-bold text-white">Hızlı Araçlar</h3>
          
          <div className="space-y-3">
            <button
              onClick={() => setActiveTab('webhook-tester')}
              className="w-full p-3.5 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-left transition flex items-center justify-between group"
            >
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white group-hover:text-amber-300">Canlı Mesaj Testi</h4>
                  <p className="text-[11px] text-slate-400">Telegram'dan mesaj gelmiş gibi simüle et</p>
                </div>
              </div>
              <ArrowRight size={14} className="text-slate-500 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={() => setActiveTab('hashtags')}
              className="w-full p-3.5 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-left transition flex items-center justify-between group"
            >
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                  <Repeat size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white group-hover:text-indigo-300">Hashtag Paketleri</h4>
                  <p className="text-[11px] text-slate-400">Platforma özel etiketleri düzenle</p>
                </div>
              </div>
              <ArrowRight size={14} className="text-slate-500 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={() => setActiveTab('accounts')}
              className="w-full p-3.5 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-left transition flex items-center justify-between group"
            >
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                  <Radio size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white group-hover:text-sky-300">Telegram Bot Ayarları</h4>
                  <p className="text-[11px] text-slate-400">Bot Token ve Chat ID ekle/düzenle</p>
                </div>
              </div>
              <ArrowRight size={14} className="text-slate-500 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
