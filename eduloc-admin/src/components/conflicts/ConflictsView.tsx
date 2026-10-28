import React, { useState } from 'react';
import { adminApi } from '../../lib/api';
import { useAction, useAsync } from '../../lib/hooks';
import { bookingStatus, conflictStatus, conflictType, formatDate, fullName, teachingMode } from '../../lib/labels';
import type { AdminConflict, ConflictStatus } from '../../types';
import { Badge, Btn, Card, Empty, ErrorBox, Loading, Segmented } from '../ui/kit';
import { ConfirmModal } from '../ui/ConfirmModal';

type Filter = ConflictStatus | '';

export const ConflictsView: React.FC<{ refreshKey: number; onChanged: () => void }> = ({ refreshKey, onChanged }) => {
  const [status, setStatus] = useState<Filter>('OPEN');
  const [dialog, setDialog] = useState<{ conflict: AdminConflict; kind: 'resolve' | 'dismiss' } | null>(null);
  const { run, busy } = useAction();
  const conflicts = useAsync(() => adminApi.conflicts(status || undefined), [status, refreshKey]);

  const reason = (c: AdminConflict) => {
    const r = c.details && typeof c.details === 'object' ? (c.details as { reason?: unknown }).reason : null;
    return typeof r === 'string' && r ? r : null;
  };

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[{ value: 'OPEN', label: 'Ouverts' }, { value: 'RESOLVED', label: 'Résolus' }, { value: 'DISMISSED', label: 'Classés' }, { value: '', label: 'Tous' }]}
        />
      </Card>

      {conflicts.error && <ErrorBox message={conflicts.error} onRetry={conflicts.reload} />}

      {conflicts.loading && !conflicts.data ? <Loading /> : !conflicts.data || conflicts.data.length === 0 ? (
        <Card><Empty>Aucun conflit.</Empty></Card>
      ) : (
        <div className="space-y-3">
          {conflicts.data.map((c) => {
            const st = conflictStatus(c.status);
            const bs = bookingStatus(c.booking.status);
            return (
              <Card key={c.id} className="p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-white">{conflictType(c.type)}</p>
                    <p className="text-xs text-slate-400">Détecté le {formatDate(c.createdAt, true)}</p>
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/40 border border-white/5 text-sm space-y-1">
                  <p className="text-slate-200">
                    Séance « {c.booking.offerTitle} » · {teachingMode(c.booking.teachingMode)} · {formatDate(c.booking.startAt, true)}
                  </p>
                  <p className="flex items-center gap-2 text-xs text-slate-400">Statut de la séance : <Badge tone={bs.tone}>{bs.label}</Badge></p>
                  {reason(c) && <p className="text-xs text-slate-300">Motif enregistré : {reason(c)}</p>}
                </div>
                {c.status !== 'OPEN' && (
                  <p className="text-xs text-slate-400">
                    {c.status === 'RESOLVED' ? 'Résolu' : 'Classé'} le {formatDate(c.resolvedAt, true)}{c.resolvedBy ? ` par ${fullName(c.resolvedBy)}` : ''}
                    {c.resolution ? ` — ${c.resolution}` : ''}
                  </p>
                )}
                {c.status === 'OPEN' && (
                  <div className="flex gap-2">
                    <Btn small tone="success" onClick={() => setDialog({ conflict: c, kind: 'resolve' })}>Marquer comme résolu</Btn>
                    <Btn small onClick={() => setDialog({ conflict: c, kind: 'dismiss' })}>Classer sans suite</Btn>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {dialog?.kind === 'resolve' && (
        <ConfirmModal
          title="Résoudre le conflit"
          variant="success"
          confirmLabel="Marquer comme résolu"
          busy={busy}
          description="Décrivez ce qui a été fait (séance reprogrammée, demandeur et tuteur contactés…). Cette note est conservée."
          noteLabel="Résolution"
          onCancel={() => setDialog(null)}
          onConfirm={async (resolution) => {
            if (await run(() => adminApi.resolveConflict(dialog.conflict.id, resolution), 'Conflit résolu.')) { setDialog(null); conflicts.reload(); onChanged(); }
          }}
        />
      )}
      {dialog?.kind === 'dismiss' && (
        <ConfirmModal
          title="Classer sans suite"
          confirmLabel="Classer"
          busy={busy}
          description="Le conflit est fermé sans action : à utiliser quand il ne demande rien (fausse alerte, situation déjà réglée)."
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            if (await run(() => adminApi.dismissConflict(dialog.conflict.id), 'Conflit classé.')) { setDialog(null); conflicts.reload(); onChanged(); }
          }}
        />
      )}
    </div>
  );
};
