import React from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { Logo } from '../ui/Logo';
import { NAV, type NavSection } from './nav';

interface SidebarProps {
  currentSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  /** Nombre d'éléments en attente par section (pastille rouge). */
  badges: Partial<Record<NavSection, number>>;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentSection, onSelectSection, badges, isOpenMobile, onCloseMobile }) => {
  const { admin, logout } = useAuth();

  return (
    <>
      {isOpenMobile && <div onClick={onCloseMobile} className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden" />}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-slate-900/80 backdrop-blur-xl border-r border-white/10 text-slate-100 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-6 flex items-center border-b border-white/10 shrink-0">
          <Logo size={40} suffix="Admin" />
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
          {NAV.map((group, gi) => (
            <div key={group.label ?? gi} className="space-y-1">
              {group.label && (
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{group.label}</div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentSection === item.id;
                const badge = badges[item.id];
                return (
                  <button
                    key={item.id}
                    onClick={() => { onSelectSection(item.id); onCloseMobile(); }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center space-x-3 min-w-0">
                      <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-indigo-400' : 'opacity-80'}`} />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {badge ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-500 text-white">{badge}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10 bg-white/5 shrink-0">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                {admin?.firstName?.[0]?.toUpperCase() ?? 'A'}
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-white truncate">{admin ? `${admin.firstName} ${admin.lastName}` : 'Administrateur'}</p>
                <p className="text-[10px] text-slate-400">Administrateur EduLoc</p>
              </div>
            </div>
            <button
              onClick={() => void logout()}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-white/10 rounded-lg transition-colors shrink-0"
              title="Déconnexion"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
