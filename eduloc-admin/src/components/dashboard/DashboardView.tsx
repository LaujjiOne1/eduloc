import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { adminApi } from '../../lib/api';
import { useAction, useAsync } from '../../lib/hooks';
import type { NavSection } from '../layout/nav';
import { Btn, Card, ErrorBox, Loading } from '../ui/kit';
import { ConfirmModal } from '../ui/ConfirmModal';

interface Props {
  refreshKey: number;
  /** Éléments en attente, par section (même source que les pastilles du menu). */
  todo: Partial<Record<NavSection, number>>;
  onNavigate: (section: NavSection) => void;
}

const QUEUES: { section: NavSection; label: string; hint: string }[] = [
  { section: 'applications', label: 'Dossiers tuteurs à examiner', hint: 'Justificatifs, niveau académique, décision' },
  { section: 'venues', label: 'Structures partenaires soumises', hint: 'Dossier, NIF/STAT, justificatifs' },
  { section: 'rooms', label: 'Salles soumises', hint: 'Chaque salle est validée séparément' },
  { section: 'conflicts', label: 'Conflits ouverts', hint: 'Séances devenues impossibles' },
];

export const DashboardView: React.FC<Props> = ({ refreshKey, todo, onNavigate }) => {
  const counts = useAsync(() => adminApi.dashboard(), [refreshKey]);
  const { run, busy } = useAction();
  const [confirmReindex, setConfirmReindex] = useState(false);

  const stats = counts.data && [
    { label: 'Demandeurs', value: counts.data.requesters },
    { label: 'Tuteurs visibles', value: counts.data.tutors },
    { label: 'Offres actives', value: counts.data.offers },
    { label: 'Séances à venir', value: counts.data.upcomingBookings },
    { label: 'Demandes en attente du tuteur', value: counts.data.pendingBookings },
  ];

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">À traiter</h2>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {QUEUES.map((q) => {
            const n = todo[q.section] ?? 0;
            return (
              <button key={q.section} onClick={() => onNavigate(q.section)} className="text-left group">
                <Card className={`p-5 h-full transition-all group-hover:bg-white/10 ${n > 0 ? 'border-rose-500/30' : ''}`}>
                  <p className={`text-4xl font-bold tracking-tight ${n > 0 ? 'text-white' : 'text-slate-500'}`}>{n}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-100">{q.label}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{q.hint}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-300">Ouvrir <ArrowRight className="w-3 h-3" /></span>
                </Card>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Plateforme</h2>
        {counts.error && <ErrorBox message={counts.error} onRetry={counts.reload} />}
        {counts.loading && !stats ? <Loading /> : stats && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {stats.map((s) => (
              <Card key={s.label} className="p-4">
                <p className="text-2xl font-bold text-white">{s.value.toLocaleString('fr-FR')}</p>
                <p className="text-[11px] text-slate-400 mt-1">{s.label}</p>
              </Card>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-500">Compteurs mis en cache 60 secondes côté serveur.</p>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Maintenance</h2>
        <Card className="p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl">
            <p className="text-sm font-semibold text-slate-100">Réindexer la recherche sémantique</p>
            <p className="text-xs text-slate-400 mt-1">
              Recalcule l’index de tous les tuteurs approuvés, en tâche de fond. À lancer après un changement de modèle d’embedding,
              ou pour des tuteurs approuvés avant l’indexation. Un tuteur seul se réindexe depuis sa fiche.
            </p>
          </div>
          <Btn disabled={busy} onClick={() => setConfirmReindex(true)}>Réindexer tous les tuteurs</Btn>
        </Card>
      </section>

      {confirmReindex && (
        <ConfirmModal
          title="Réindexer tous les tuteurs"
          confirmLabel="Lancer la réindexation"
          busy={busy}
          description="Le calcul se fait en arrière-plan et peut prendre plusieurs minutes. La recherche reste disponible pendant ce temps."
          onCancel={() => setConfirmReindex(false)}
          onConfirm={async () => {
            if (await run(() => adminApi.reindexAll(), (r) => `Réindexation demandée pour ${(r as { queued: number }).queued} tuteur(s).`)) setConfirmReindex(false);
          }}
        />
      )}
    </div>
  );
};
