import React from 'react';
import { 
  Repeat, 
  Send, 
  Calendar, 
  TrendingUp, 
  CheckCircle2, 
  ArrowRight, 
  Sparkles,
  Zap,
  Radio,
  Plus,
  MessageSquare,
  Twitter
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

  const totalSynced = rules.reduce((sum, r) => sum + r.totalSyncedCount, 0);
  const activeRulesCount = rules.filter(r => r.active).length;

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="p-6 rounded-2xl glass-panel border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center space-x-1">
              <Zap size={12} className="animate-pulse" />
              <span>Sade Sosyal Medya Otomasyonu</span>
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-2">
            Çapraz Paylaşım & Otomasyon Merkezi
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Telegram kanallarınızda sizin veya belirlediğiniz kişilerin attığı tüm mesajları Twitter, WhatsApp ve diğer hesaplarınıza otomatik aktarın.
          </p>
        </div>

        <div className="flex items-center space-x-3 self-start md:self-auto">
          <button 
            onClick={() => setActiveTab('accounts')}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold shadow-md transition"
          >
            <Radio size={16} />
            <span>Hesap Ekle / Bağla</span>
          </button>

          <button 
            onClick={onOpenQuickCompose}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-semibold border border-slate-700 transition"
          >
            <Plus size={16} />
            <span>Hızlı Paylaş</span>
          </button>
        </div>
      </div>

      {/* Quick Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl glass-card flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Bağlı Hesap Sayısı</p>
            <h3 className="text-2xl font-extrabold text-white mt-1">{accounts.length}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
            <Radio size={20} />
          </div>
        </div>

        <div className="p-4 rounded-xl glass-card flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Aktif Çapraz Paylaşım Kuralları</p>
            <h3 className="text-2xl font-extrabold text-white mt-1">{activeRulesCount}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
            <Repeat size={20} />
          </div>
        </div>

        <div className="p-4 rounded-xl glass-card flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Aktarılan Mesaj Sayısı</p>
            <h3 className="text-2xl font-extrabold text-white mt-1">{totalSynced}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <Send size={20} />
          </div>
        </div>
      </div>

      {/* Onboarding Guide if no accounts connected yet */}
      {accounts.length === 0 ? (
        <div className="p-8 rounded-2xl glass-panel border border-slate-800 text-center space-y-4 max-w-2xl mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center mx-auto">
            <Radio size={24} />
          </div>
          <h3 className="text-base font-bold text-white">Sisteme Henüz Hesap Bağlamadınız</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Telegram kanallarınızın Chat ID'lerini ve Twitter/WhatsApp hesaplarınızı bağlayarak hemen çapraz paylaşıma başlayın. Sahte veri temizlendi; tamamen sizin gerçek verileriniz çalışacaktır!
          </p>

          <div className="flex justify-center space-x-3 pt-2">
            <button
              onClick={() => setActiveTab('accounts')}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/20"
            >
              + İlk Hesabını Bağla
            </button>
          </div>
        </div>
      ) : (
        /* Action Flow List */
        <div className="p-6 rounded-2xl glass-panel border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Aktif Çapraz Bağlantılarınız</h3>
            <button 
              onClick={() => setActiveTab('sync-rules')}
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300"
            >
              Kuralları Yönet
            </button>
          </div>

          <div className="space-y-3">
            {rules.map(rule => {
              const sourceAcc = accounts.find(a => a.id === rule.sourceId);
              const targetAccs = accounts.filter(a => rule.targetIds.includes(a.id));

              return (
                <div key={rule.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <h4 className="font-bold text-white">{rule.title}</h4>
                    <p className="text-slate-400 mt-0.5">
                      Kaynak: <span className="text-sky-300 font-semibold">{sourceAcc?.name || 'Telegram'}</span> → Hedefler: {targetAccs.map(t => t.name).join(', ')}
                    </p>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${rule.active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'}`}>
                    {rule.active ? 'Otomatik Aktarım Aktif' : 'Pasif'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
