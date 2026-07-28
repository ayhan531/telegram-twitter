import React from 'react';
import { 
  Zap, 
  PlusCircle, 
  Menu, 
  X, 
  Cloud, 
  CheckCircle2, 
  Smartphone,
  Share2
} from 'lucide-react';

export default function Navbar({ 
  activeTab, 
  setActiveTab, 
  mobileMenuOpen, 
  setMobileMenuOpen, 
  onOpenQuickCompose,
  accountCount,
  activeRulesCount
}) {
  return (
    <header className="sticky top-0 z-40 glass-panel border-b border-slate-800/80 px-4 lg:px-8 py-3 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        
        {/* Left Side: Brand & Logo */}
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          <div 
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center space-x-2.5 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-sky-500 to-pink-500 p-0.5 shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Share2 className="w-5 h-5 text-indigo-400 group-hover:text-sky-300 transition-colors" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
                  OmniSync <span className="text-indigo-400 font-bold">Social</span>
                </h1>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1"></span>
                  Canlı Hub
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">Telegram • Twitter • WhatsApp • LinkedIn Çapraz Paylaşım</p>
            </div>
          </div>
        </div>

        {/* Center / Right Quick Stats & Status */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          
          {/* Render Cloud Readiness Pill */}
          <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-indigo-950/40 border border-indigo-800/40 text-xs text-indigo-300">
            <Cloud size={15} className="text-indigo-400 animate-pulse" />
            <span>Render Deploy Ready</span>
            <CheckCircle2 size={13} className="text-emerald-400 ml-0.5" />
          </div>

          {/* Quick Active Channels Stats */}
          <div className="hidden xl:flex items-center space-x-3 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
            <div className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-sky-400"></span>
              <span className="font-semibold text-white">{accountCount}</span>
              <span className="text-slate-400">Hesap</span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="font-semibold text-white">{activeRulesCount}</span>
              <span className="text-slate-400">Kural Aktif</span>
            </div>
          </div>

          {/* Mobile Phone Quick Info */}
          <div className="hidden sm:flex md:hidden items-center text-xs text-slate-400 space-x-1">
            <Smartphone size={14} className="text-sky-400" />
            <span>Mobil Uyumlu</span>
          </div>

          {/* Create Post Button */}
          <button
            onClick={onOpenQuickCompose}
            className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white font-medium px-3.5 py-2 rounded-xl text-xs sm:text-sm shadow-md shadow-indigo-600/20 active:scale-95 transition-all"
          >
            <PlusCircle size={16} />
            <span className="font-semibold">Hızlı Paylaş</span>
          </button>
        </div>

      </div>
    </header>
  );
}
