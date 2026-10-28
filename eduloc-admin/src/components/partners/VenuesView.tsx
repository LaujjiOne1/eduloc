import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { adminApi } from '../../lib/api';
import { useAction, useAsync } from '../../lib/hooks';
import {
  VENUE_ACTIONS, formatDate, formatMoney, fullName, publication as publicationLabel, roomStatusLabel, subscriptionStatus, venueDocumentType,
  venueStatus, venueType,
} from '../../lib/labels';
import type { VenueDecision, VenueStatus } from '../../types';
import { Badge, Btn, Card, Drawer, Empty, ErrorBox, Loading, Row, Section, Segmented, Table } from '../ui/kit';
import { ConfirmModal } from '../ui/ConfirmModal';
import { DecisionBar, History } from './shared';

type Filter = VenueStatus | '';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'SUBMITTED', label: 'Soumises' }, { value: 'UNDER_REVIEW', label: 'En examen' }, { value: 'NEEDS_CORRECTION', label: 'À corriger' },
  { value: 'APPROVED', label: 'Validées' }, { value: 'SUSPENDED', label: 'Suspendues' }, { value: 'REJECTED', label: 'Refusées' },
  { value: 'DISABLED', label: 'Désactivées' }, { value: '', label: 'Toutes' },
];

export const VenuesView: React.FC<{ refreshKey: number; onChanged: () => void; onOpenRoom: (roomId: string) => void }> = ({ refreshKey, onChanged, onOpenRoom }) => {
  const [status, setStatus] = useState<Filter>('SUBMITTED');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const venues = useAsync(() => adminApi.venues(status || undefined), [status, refreshKey]);

  return (
    <div className="space-y-5">
      <Card className="p-4"><Segmented value={status} onChange={setStatus} options={FILTERS} /></Card>
      {venues.error && <ErrorBox message={venues.error} onRetry={venues.reload} />}
      <Card className="overflow-hidden">
        {venues.loading && !venues.data ? <Loading /> : !venues.data || venues.data.length === 0 ? (
          <Empty>Aucune structure.</Empty>
        ) : (
          <Table head={['Structure', 'Gestionnaire', 'Salles', 'Justificatifs', 'Soumise', 'Statut']}>
            {venues.data.map((v) => {
              const st = venueStatus(v.status);
              return (
                <tr key={v.id} className="hover:bg-white/5 cursor-pointer" onClick={() => setSelectedId(v.id)}>
                  <td className="px-4 py-3.5"><p className="font-bold text-white">{v.name}</p><p className="text-[11px] text-slate-400">{venueType(v.type)}</p></td>
                  <td className="px-4 py-3.5">{fullName(v.manager)}<span className="block text-[11px] font-mono text-slate-400">{v.manager.email}</span></td>
                  <td className="px-4 py-3.5">{v.roomsCount}</td>
                  <td className="px-4 py-3.5">{v.documentsCount}</td>
                  <td className="px-4 py-3.5 text-slate-400">{formatDate(v.submittedAt)}</td>
                  <td className="px-4 py-3.5"><Badge tone={st.tone}>{st.label}</Badge></td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      {selectedId && (
        <VenueDrawer
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => { venues.reload(); onChanged(); }}
          onOpenRoom={(id) => { setSelectedId(null); onOpenRoom(id); }}
        />
      )}
    </div>
  );
};

const VenueDrawer: React.FC<{ id: string; onClose: () => void; onChanged: () => void; onOpenRoom: (roomId: string) => void }> = ({ id, onClose, onChanged, onOpenRoom }) => {
  const detail = useAsync(() => adminApi.venue(id), [id]);
  const { run, busy } = useAction();
  const [cancelling, setCancelling] = useState(false);
  const v = detail.data;

  if (!v) {
    return (
      <Drawer title="Structure" onClose={onClose}>
        {detail.error ? <ErrorBox message={detail.error} onRetry={detail.reload} /> : <Loading />}
      </Drawer>
    );
  }
  const st = venueStatus(v.status);
  const sub = subscriptionStatus(v.subscription.status);
  const missingFiscal = !v.nif?.trim() || !v.stat?.trim();

  return (
    <Drawer
      title={v.name}
      onClose={onClose}
      subtitle={<><Badge tone={st.tone}>{st.label}</Badge><span>{venueType(v.type)}</span><span>· soumise le {formatDate(v.submittedAt)}</span></>}
    >
      {v.reviewNote && <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-300"><strong>Dernière note :</strong> {v.reviewNote}</div>}

      <Section title="Décision">
        {v.status === 'UNDER_REVIEW' || v.status === 'SUBMITTED' ? (
          missingFiscal && <p className="mb-3 text-xs text-amber-300">NIF et STAT obligatoires pour valider la structure comme « Partenaire vérifié » : demandez-les avant de valider.</p>
        ) : null}
        <DecisionBar
          actions={VENUE_ACTIONS[v.status] ?? []}
          busy={busy}
          subject={v.name}
          onDecide={async (decision, note) => {
            const done = await run(() => adminApi.reviewVenue(v.id, decision as VenueDecision, note), 'Décision enregistrée.');
            if (done) { detail.reload(); onChanged(); }
            return done;
          }}
        />
      </Section>

      <Section title="Informations déclarées">
        <Row label="Raison sociale">{v.legalName}</Row>
        <Row label="N° d’immatriculation">{v.registrationNumber}</Row>
        <Row label="NIF">{v.nif}</Row>
        <Row label="STAT">{v.stat}</Row>
        <Row label="Téléphone">{v.contactPhone}</Row>
        <Row label="E-mail">{v.contactEmail}</Row>
        <Row label="Gestionnaire">{fullName(v.manager)} · {v.manager.email}{v.manager.phone ? ` · ${v.manager.phone}` : ''}</Row>
        {v.description && <p className="mt-3 text-sm text-slate-300 whitespace-pre-line">{v.description}</p>}
      </Section>

      <Section title={`Justificatifs (${v.documents.length})`}>
        {v.documents.length === 0 ? <p className="text-sm text-slate-400">Aucun justificatif.</p> : (
          <ul className="space-y-2">
            {v.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/10 text-sm">
                <span className="min-w-0 truncate">{venueDocumentType(d.type)} <span className="text-xs text-slate-400">· {d.fileName ?? d.mimeType} · {formatDate(d.uploadedAt)}</span></span>
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-300 hover:text-indigo-200 shrink-0">
                  Ouvrir <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-slate-400">Liens temporaires (10 min) : rechargez la fiche s’ils expirent.</p>
      </Section>

      <Section title="Offre commerciale">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Badge tone={sub.tone}>{sub.label}</Badge>
          {v.subscription.plan && <span className="text-sm text-slate-200">{v.subscription.plan.name} · {formatMoney(v.subscription.plan.price.amount, v.subscription.plan.price.currency)} / {v.subscription.plan.durationDays} j</span>}
        </div>
        {v.subscription.endsAt && <p className="text-xs text-slate-400 mb-2">Du {formatDate(v.subscription.startsAt)} au {formatDate(v.subscription.endsAt)}</p>}
        <div className="flex gap-2">
          {v.subscription.status === 'PENDING' && (
            <Btn small tone="success" disabled={busy} onClick={async () => { if (await run(() => adminApi.activateSubscription(v.id), 'Offre activée.')) { detail.reload(); onChanged(); } }}>
              Activer (paiement reçu)
            </Btn>
          )}
          {(v.subscription.status === 'PENDING' || v.subscription.status === 'ACTIVE') && (
            <Btn small tone="danger" disabled={busy} onClick={() => setCancelling(true)}>Annuler l’offre</Btn>
          )}
        </div>
        {v.subscription.status === 'PENDING' && <p className="mt-2 text-[11px] text-slate-400">Pas de paiement en ligne : vous activez l’offre après réception du paiement.</p>}
      </Section>

      <Section title={`Salles (${v.rooms.length})`}>
        {v.rooms.length === 0 ? <p className="text-sm text-slate-400">Aucune salle.</p> : (
          <ul className="space-y-2">
            {v.rooms.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/10 text-sm">
                <span className="font-semibold text-white truncate">{r.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <Badge tone={roomStatusLabel(r.status).tone}>{roomStatusLabel(r.status).label}</Badge>
                  <Badge tone={publicationLabel(r.publication).tone}>{publicationLabel(r.publication).label}</Badge>
                  <Btn small onClick={() => onOpenRoom(r.id)}>Examiner</Btn>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Historique"><History events={v.history} /></Section>

      {cancelling && (
        <ConfirmModal
          title="Annuler l’offre commerciale"
          variant="danger"
          confirmLabel="Annuler l’offre"
          busy={busy}
          description="Les salles de la structure ne sont plus réservables ; les séances déjà confirmées restent. Le Gestionnaire est notifié."
          noteLabel="Motif"
          noteRequired={false}
          onCancel={() => setCancelling(false)}
          onConfirm={async (note) => {
            if (await run(() => adminApi.cancelSubscription(v.id, note || undefined), 'Offre annulée.')) { setCancelling(false); detail.reload(); onChanged(); }
          }}
        />
      )}
    </Drawer>
  );
};
