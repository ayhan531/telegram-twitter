import React from 'react';
import { 
  LayoutDashboard, 
  Repeat, 
  PenTool, 
  Calendar, 
  Hash, 
  Radio, 
  SlidersHorizontal, 
  ListOrdered,
  Sparkles,
  Cloud,
  ChevronRight
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, mobileMenuOpen, setMobileMenuOpen }) {
  
  const navItems = [
    { id: 'dashboard', label: 'Genel Bakış', icon: LayoutDashboard, badge: null },
    { id: 'sync-rules', label: 'Çapraz Paylaşım Kuralları', icon: Repeat, badge: 'Aktif' },
    { id: 'composer', label: 'Paylaşım Oluşturucu', icon: PenTool, badge: 'Canlı Önizleme' },
    { id: 'scheduler', label: 'Planlanmış Paylaşım & Takvim', icon: Calendar, badge: null },
    { id: 'hashtags', label: 'Hashtag & Kelime Filtreleri', icon: Hash, badge: null },
    { id: 'accounts', label: 'Hesaplar & API Ayarları', icon: Radio, badge: null },
    { id: 'webhook-tester', label: 'Canlı Webhook Simülatörü', icon: Sparkles, badge: 'Test' },
    { id: 'logs', label: 'İşlem Geçmişi & Loglar', icon: ListOrdered, badge: null },
  ];

  const handleSelect = (id) => {
    setActiveTab(id);
    setMobileMenuOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop overlay */}
      {mobileMenuOpen && (
        <div 
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed lg:sticky top-[61px] left-0 z-40 h-[calc(100vh-61px)] w-72 
        glass-panel border-r border-slate-800/80 flex flex-col justify-between p-4 
        transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="space-y-6 overflow-y-auto pr-1">
          
          {/* Navigation Category Header */}
          <div>
            <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Yönetim Paneli
            </p>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    className={`
                      w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all group
                      ${isActive 
                        ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm font-semibold' 
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'}
                    `}
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-300'}`} />
                      <span>{item.label}</span>
                    </div>

                    {item.badge && (
                      <span className={`
                        px-2 py-0.5 text-[10px] font-bold rounded-full
                        ${item.badge === 'Aktif' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : ''}
                        ${item.badge === 'Canlı Önizleme' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : ''}
                        ${item.badge === 'Test' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : ''}
                      `}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Quick Guide Card */}
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-950/40 via-slate-900/60 to-slate-950 border border-indigo-800/30 text-xs space-y-2">
            <div className="flex items-center space-x-2 text-indigo-300 font-semibold">
              <Cloud size={16} className="text-indigo-400" />
              <span>Render Deploy Rehberi</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Uygulamanızı Render'a yükleyerek cep telefonunuzdan 7/24 kesintisiz otomatik çapraz paylaşım yapabilirsiniz.
            </p>
            <button 
              onClick={() => handleSelect('accounts')}
              className="inline-flex items-center space-x-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold group"
            >
              <span>API ve Render Rehberi</span>
              <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

        </div>

        {/* Footer info */}
        <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400 px-2">
          <span>OmniSync v1.0</span>
          <span className="flex items-center space-x-1 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping mr-1"></span>
            Sistem Aktif
          </span>
        </div>
      </aside>
    </>
  );
}
