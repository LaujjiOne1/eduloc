import React, { useState } from 'react';
import { Menu, RefreshCw } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { NAV_ITEMS, type NavSection } from './nav';

interface AdminLayoutProps {
  currentSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  badges: Partial<Record<NavSection, number>>;
  onRefresh: () => void;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ currentSection, onSelectSection, badges, onRefresh, children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const info = NAV_ITEMS.find((i) => i.id === currentSection);

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 flex relative overflow-x-hidden">
      <div className="fixed top-[-200px] right-[-100px] w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="fixed bottom-[-100px] left-[200px] w-[450px] h-[450px] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none" />

      <Sidebar
        currentSection={currentSection}
        onSelectSection={onSelectSection}
        badges={badges}
        isOpenMobile={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 lg:pl-64 relative z-10">
        <header className="sticky top-0 z-30 bg-[#0F172A]/70 backdrop-blur-xl border-b border-white/10 px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 -ml-1 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 lg:hidden"
              title="Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-tight">{info?.title ?? 'edUloc Admin'}</h1>
              {info && <p className="text-xs text-slate-400 hidden sm:block truncate max-w-2xl mt-0.5">{info.subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onRefresh}
            className="flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all shrink-0"
            title="Actualiser"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Actualiser</span>
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
