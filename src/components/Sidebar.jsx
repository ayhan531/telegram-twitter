import React from 'react';
import { Radio, Repeat, Activity, ShieldCheck } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab }) {
  const menuItems = [
    { id: 'accounts', label: '🔌 Bağlantılar', desc: 'Telegram & Twitter', icon: Radio },
    { id: 'rules',    label: '⚡ Oto-Sync Kuralları', desc: 'Kanal -> Tweet Eşleştirme', icon: Repeat },
    { id: 'logs',     label: '📜 Canlı Akış Logları', desc: 'Anlık İşlem Günlüğü', icon: Activity },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-950/60 hidden lg:flex flex-col justify-between p-4 shrink-0">
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 mb-2">Modüller</p>
        {menuItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button key={item.id} onClick={() => setActiveTab(item.id)}
              className={`w-full text-left p-3 rounded-xl border transition flex items-center space-x-3 ${
                isActive
                  ? 'bg-indigo-600/20 border-indigo-500/50 text-white font-bold'
                  : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                <Icon size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold truncate">{item.label}</p>
                <p className="text-[10px] text-slate-500 truncate">{item.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer Info Box */}
      <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5 text-xs text-slate-400">
        <div className="flex items-center space-x-1.5 text-emerald-400 font-bold text-[11px]">
          <ShieldCheck size={14} />
          <span>Resmi OAuth 1.0a Aktif</span>
        </div>
        <p className="text-[10px] text-slate-400 leading-normal">
          Twitter anti-bot engellemelerine takılmadan %100 kesintisiz çalışır.
        </p>
      </div>
    </aside>
  );
}
