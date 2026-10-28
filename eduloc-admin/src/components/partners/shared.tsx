import React, { useState } from 'react';
import { historyScope, formatDate } from '../../lib/labels';
import type { StatusEvent } from '../../types';
import { Btn } from '../ui/kit';
import { ConfirmModal } from '../ui/ConfirmModal';

export interface DecisionAction {
  decision: string;
  label: string;
  needsNote: boolean;
  tone: 'primary' | 'danger' | 'neutral';
}

/** Boutons de décision d'un dossier ; une décision qui doit être expliquée au Gestionnaire exige un motif. */
export const DecisionBar: React.FC<{
  actions: DecisionAction[];
  busy: boolean;
  subject: string;
  onDecide: (decision: string, note: string | undefined) => Promise<boolean>;
}> = ({ actions, busy, subject, onDecide }) => {
  const [pending, setPending] = useState<DecisionAction | null>(null);

  if (actions.length === 0) return <p className="text-sm text-slate-400">Aucune décision possible dans cet état.</p>;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Btn key={a.decision} tone={a.tone === 'primary' ? 'success' : a.tone} disabled={busy} onClick={() => setPending(a)}>{a.label}</Btn>
        ))}
      </div>
      {pending && (
        <ConfirmModal
          title={`${pending.label} — ${subject}`}
          variant={pending.tone === 'danger' ? 'danger' : pending.tone === 'primary' ? 'success' : 'primary'}
          confirmLabel={pending.label}
          busy={busy}
          description={pending.needsNote
            ? 'Le Gestionnaire reçoit ce motif et doit savoir quoi faire ensuite : il est conservé dans l’historique.'
            : 'Le Gestionnaire est notifié de cette décision.'}
          noteLabel={pending.needsNote ? 'Motif' : 'Note pour le Gestionnaire'}
          noteRequired={pending.needsNote}
          onCancel={() => setPending(null)}
          onConfirm={async (note) => {
            if (await onDecide(pending.decision, note || undefined)) setPending(null);
          }}
        />
      )}
    </>
  );
};

export const History: React.FC<{ events: StatusEvent[] }> = ({ events }) => (
  events.length === 0 ? <p className="text-sm text-slate-400">Aucun historique.</p> : (
    <ol className="space-y-2">
      {events.map((e) => (
        <li key={e.id} className="text-xs p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex flex-wrap justify-between gap-2 text-slate-400">
            <span>{historyScope(e.scope)} : {e.from ?? '—'} → <strong className="text-slate-200">{e.to}</strong></span>
            <span>{formatDate(e.at, true)}</span>
          </div>
          {e.note && <p className="mt-1 text-slate-300">{e.note}</p>}
        </li>
      ))}
    </ol>
  )
);
