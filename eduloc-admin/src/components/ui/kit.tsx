import React from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import type { Tone } from '../../lib/labels';

const TONES: Record<Tone, string> = {
  green: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  amber: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  rose: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  indigo: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  blue: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  slate: 'bg-white/10 text-slate-300 border-white/10',
};

export const Badge: React.FC<{ tone?: Tone; children: React.ReactNode }> = ({ tone = 'slate', children }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${TONES[tone]}`}>
    {children}
  </span>
);

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 ${className}`}>{children}</div>
);

type BtnTone = 'primary' | 'danger' | 'neutral' | 'success';
const BTN: Record<BtnTone, string> = {
  primary: 'bg-indigo-500 hover:bg-indigo-600 text-white border-indigo-400/30',
  success: 'bg-emerald-500/80 hover:bg-emerald-500 text-white border-emerald-400/30',
  danger: 'bg-rose-500/20 hover:bg-rose-500 text-rose-200 hover:text-white border-rose-500/40',
  neutral: 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/10',
};

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: BtnTone; small?: boolean }> = ({
  tone = 'neutral', small = false, className = '', children, ...rest
}) => (
  <button
    type="button"
    {...rest}
    className={`inline-flex items-center justify-center gap-1.5 rounded-xl border font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
      small ? 'px-2.5 py-1 text-[11px]' : 'px-4 py-2 text-sm'
    } ${BTN[tone]} ${className}`}
  >
    {children}
  </button>
);

const FIELD = 'w-full text-sm bg-slate-950/60 text-white placeholder-slate-500 px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
  </label>
);

export const TextInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={`${FIELD} ${props.className ?? ''}`} />
);
export const TextArea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea rows={3} {...props} className={`${FIELD} ${props.className ?? ''}`} />
);
export const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={`${FIELD} ${props.className ?? ''}`} />
);

export const Segmented = <T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string; count?: number | null }[];
  onChange: (v: T) => void;
}) => (
  <div className="flex flex-wrap items-center gap-1.5">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
          value === o.value ? 'bg-white/15 text-white border border-white/20' : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
        }`}
      >
        {o.label}
        {o.count ? <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px]">{o.count}</span> : null}
      </button>
    ))}
  </div>
);

export const Loading: React.FC<{ label?: string }> = ({ label = 'Chargement…' }) => (
  <div className="p-12 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
    <Loader2 className="w-4 h-4 animate-spin" /> {label}
  </div>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="p-12 text-center text-slate-400 text-sm">{children}</div>
);

export const ErrorBox: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm flex items-start gap-3">
    <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
    <div className="flex-1">
      <p>{message}</p>
      {onRetry && <button onClick={onRetry} className="mt-2 text-xs font-semibold underline text-rose-300">Réessayer</button>}
    </div>
  </div>
);

/** Pagination sans total : le serveur ne renvoie qu'une page de 50 ; « suivant » est possible si la page est pleine. */
export const Pager: React.FC<{ page: number; count: number; pageSize?: number; onChange: (p: number) => void }> = ({
  page, count, pageSize = 50, onChange,
}) => {
  if (page === 1 && count < pageSize) return null;
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 text-xs text-slate-400">
      <span>Page {page}</span>
      <div className="flex gap-1.5">
        <Btn small disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft className="w-3.5 h-3.5" /> Précédente</Btn>
        <Btn small disabled={count < pageSize} onClick={() => onChange(page + 1)}>Suivante <ChevronRight className="w-3.5 h-3.5" /></Btn>
      </div>
    </div>
  );
};

/** Panneau latéral pour les fiches de détail. */
export const Drawer: React.FC<{ title: string; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode }> = ({
  title, subtitle, onClose, children,
}) => (
  <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
    <div
      className="w-full max-w-3xl h-full overflow-y-auto bg-slate-900 border-l border-white/10 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-6 py-4 bg-slate-900/95 backdrop-blur border-b border-white/10">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-white truncate">{title}</h2>
          {subtitle && <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-2">{subtitle}</div>}
        </div>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10" title="Fermer">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-6 space-y-6">{children}</div>
    </div>
  </div>
);

export const Section: React.FC<{ title: string; aside?: React.ReactNode; children: React.ReactNode }> = ({ title, aside, children }) => (
  <section>
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</h3>
      {aside}
    </div>
    {children}
  </section>
);

export const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 py-2 border-b border-white/5 last:border-0 text-sm">
    <span className="text-slate-400 shrink-0">{label}</span>
    <span className="text-slate-100 text-right min-w-0 break-words">{children || '—'}</span>
  </div>
);

export const Table: React.FC<{ head: string[]; children: React.ReactNode }> = ({ head, children }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs text-slate-300">
      <thead className="bg-white/5 text-[11px] uppercase font-bold text-slate-400 border-b border-white/10">
        <tr>{head.map((h) => <th key={h} className="px-4 py-3.5 whitespace-nowrap">{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-white/5">{children}</tbody>
    </table>
  </div>
);
