import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  variant?: 'danger' | 'primary' | 'success';
  /** Affiche un champ de texte (motif, note, décision…). */
  noteLabel?: string;
  notePlaceholder?: string;
  noteRequired?: boolean;
  busy?: boolean;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}

/** Confirmation d'une action sensible, avec un motif obligatoire ou facultatif. Le champ est vide à chaque ouverture. */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title, description, confirmLabel = 'Confirmer', variant = 'primary', noteLabel, notePlaceholder,
  noteRequired = true, busy = false, onConfirm, onCancel,
}) => {
  const [note, setNote] = useState('');
  const isDanger = variant === 'danger';
  const isSuccess = variant === 'success';
  const blocked = busy || (noteLabel !== undefined && noteRequired && !note.trim());

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="w-full max-w-lg bg-slate-900/95 rounded-2xl shadow-2xl border border-white/15 text-slate-100">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl border ${
                  isDanger ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                  : isSuccess ? 'bg-green-500/20 text-green-400 border-green-500/30'
                  : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                }`}
              >
                {isSuccess ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
              </div>
              <h3 className="text-lg font-bold text-white">{title}</h3>
            </div>
            <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>

          {description && <div className="mt-3 text-sm text-slate-300 leading-relaxed">{description}</div>}

          {noteLabel !== undefined && (
            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                {noteLabel}{noteRequired ? ' (obligatoire)' : ' (facultatif)'}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={notePlaceholder}
                rows={3}
                autoFocus
                className="w-full text-sm rounded-xl border border-white/10 bg-slate-950/70 text-white placeholder-slate-500 p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 rounded-xl"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => onConfirm(note.trim())}
              disabled={blocked}
              className={`px-5 py-2.5 text-sm font-semibold rounded-xl border disabled:opacity-50 disabled:cursor-not-allowed ${
                isDanger ? 'bg-rose-500/80 hover:bg-rose-500 text-white border-rose-500/40'
                : isSuccess ? 'bg-green-500/80 hover:bg-green-500 text-white border-green-500/40'
                : 'bg-indigo-500 hover:bg-indigo-600 text-white border-indigo-400/30'
              }`}
            >
              {busy ? 'En cours…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
