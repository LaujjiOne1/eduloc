import React from 'react';

/** Toque de diplômé : même tracé que GraduationCapIcon du front mobile (src/components/icons.tsx). */
export const GraduationCap: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = '#fff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4 2.5 9 12 14l9.5-5Z" />
    <path d="M6.5 11.4V16c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-4.6" />
  </svg>
);

/** Logo edUloc : carré arrondi translucide sur le violet de la marque (#332e86), avec la toque. */
export const LogoMark: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <div
    className="flex items-center justify-center shrink-0 border border-white/10 shadow-lg shadow-black/30"
    style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: '#332e86' }}
  >
    <GraduationCap size={size * 0.6} />
  </div>
);

/** Marque + nom « edUloc » (graphie de l'application) ; `suffix` ajoute une étiquette, par ex. « Admin ». */
export const Logo: React.FC<{ size?: number; suffix?: string; className?: string }> = ({ size = 40, suffix, className = '' }) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <LogoMark size={size} />
    <div className="flex items-baseline gap-1.5">
      <span className="font-bold tracking-tight text-white" style={{ fontSize: size * 0.55 }}>edUloc</span>
      {suffix && <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">{suffix}</span>}
    </div>
  </div>
);
