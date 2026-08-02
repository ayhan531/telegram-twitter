import React from 'react';
import { Repeat, Radio, CheckCircle2, Zap } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, accountCount, activeRulesCount }) {
  return (
    <header className="h-16 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 flex items-center justify-between">
      
      {/* Brand */}
      <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('accounts')}>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-neutral-800 flex items-center justify-center text-white font-black shadow-lg text-lg">
          ⚡
        </div>
        <div>
          <h1 className="font-extrabold text-sm sm:text-base text-white tracking-wide flex items-center space-x-1.5">
            <span>Telegram</span>
            <span className="text-indigo-400">➔</span>
            <span>Twitter AutoSync</span>
          </h1>
          <p className="text-[10px] text-slate-400 font-mono">Resmi OAuth 1.0a Engine</p>
        </div>
      </div>

      {/* Navigation Buttons */}
      <nav className="flex items-center space-x-1 sm:space-x-2">
        <button onClick={() => setActiveTab('accounts')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
            activeTab === 'accounts' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}>
          <Radio size={14} />
          <span>Bağlantılar ({accountCount})</span>
        </button>

        <button onClick={() => setActiveTab('rules')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
            activeTab === 'rules' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}>
          <Repeat size={14} />
          <span>Kurallar ({activeRulesCount})</span>
        </button>

        <button onClick={() => setActiveTab('logs')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
            activeTab === 'logs' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}>
          <Zap size={14} />
          <span>Canlı Loglar</span>
        </button>
      </nav>

    </header>
  );
}
