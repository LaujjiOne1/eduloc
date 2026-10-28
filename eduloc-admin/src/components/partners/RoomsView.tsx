import React, { useState } from 'react';
import { adminApi } from '../../lib/api';
import { useAction, useAsync } from '../../lib/hooks';
import { ROOM_ACTIONS, formatDate, formatMoney, publication as publicationLabel, roomStatusLabel, weekday } from '../../lib/labels';
import type { RoomDecision, RoomStatus } from '../../types';
import { Badge, Btn, Card, Drawer, Empty, ErrorBox, Loading, Row, Section, Segmented, Table } from '../ui/kit';
import { ConfirmModal } from '../ui/ConfirmModal';
import { DecisionBar, History } from './shared';

type Filter = RoomStatus | '';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'SUBMITTED', label: 'Soumises' }, { value: 'UNDER_REVIEW', label: 'En examen' }, { value: 'NEEDS_CORRECTION', label: 'À corriger' },
  { value: 'APPROVED', label: 'Validées' }, { value: 'SUSPENDED', label: 'Suspendues' }, { value: 'REJECTED', label: 'Refusées' }, { value: '', label: 'Toutes' },
];

interface Props {
  refreshKey: number;
  onChanged: () => void;
  /** Salle à ouvrir d'office (depuis la fiche d'une structure). */
  openRoomId: string | null;
  onOpened: () => void;
}

export const RoomsView: React.FC<Props> = ({ refreshKey, onChanged, openRoomId, onOpened }) => {
  const [status, setStatus] = useState<Filter>(openRoomId ? '' : 'SUBMITTED');
  const [selectedId, setSelectedId] = useState<string | null>(openRoomId);
  const rooms = useAsync(() => adminApi.rooms(status || undefined), [status, refreshKey]);

  return (
    <div className="space-y-5">
      <Card className="p-4"><Segmented value={status} onChange={setStatus} options={FILTERS} /></Card>
      {rooms.error && <ErrorBox message={rooms.error} onRetry={rooms.reload} />}
      <Card className="overflow-hidden">
        {rooms.loading && !rooms.data ? <Loading /> : !rooms.data || rooms.data.length === 0 ? (
          <Empty>Aucune salle.</Empty>
        ) : (
          <Table head={['Salle', 'Structure', 'Soumise', 'Statut', 'Publication']}>
            {rooms.data.map((r) => {
              const st = roomStatusLabel(r.status);
              const pub = publicationLabel(r.publication);
              return (
                <tr key={r.id} className="hover:bg-white/5 cursor-pointer" onClick={() => setSelectedId(r.id)}>
                  <td className="px-4 py-3.5 font-bold text-white">{r.name}{!r.isActive && <span className="ml-2 text-[11px] font-normal text-slate-400">(désactivée par le Gestionnaire)</span>}</td>
                  <td className="px-4 py-3.5">{r.venue.name}</td>
                  <td className="px-4 py-3.5 text-slate-400">{formatDate(r.submittedAt)}</td>
                  <td className="px-4 py-3.5"><Badge tone={st.tone}>{st.label}</Badge></td>
                  <td className="px-4 py-3.5"><Badge tone={pub.tone}>{pub.label}</Badge></td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      {selectedId && (
        <RoomDrawer
          id={selectedId}
          onClose={() => { setSelectedId(null); onOpened(); }}
          onChanged={() => { rooms.reload(); onChanged(); }}
        />
      )}
    </div>
  );
};

const RoomDrawer: React.FC<{ id: string; onClose: () => void; onChanged: () => void }> = ({ id, onClose, onChanged }) => {
  const detail = useAsync(() => adminApi.room(id), [id]);
  const { run, busy } = useAction();
  const [publicationDialog, setPublicationDialog] = useState<'UNPUBLISH' | 'RESTORE' | null>(null);
  const r = detail.data;

  if (!r) {
    return (
      <Drawer title="Salle" onClose={onClose}>
        {detail.error ? <ErrorBox message={detail.error} onRetry={detail.reload} /> : <Loading />}
      </Drawer>
    );
  }
  const st = roomStatusLabel(r.status);
  const pub = publicationLabel(r.publication);

  return (
    <Drawer
      title={r.name}
      onClose={onClose}
      subtitle={<><Badge tone={st.tone}>{st.label}</Badge><Badge tone={pub.tone}>{pub.label}</Badge><span>{r.venue.name}</span></>}
    >
      {r.reviewNote && <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-300"><strong>Dernière note :</strong> {r.reviewNote}</div>}
      {r.venue.status !== 'APPROVED' && r.status !== 'APPROVED' && (
        <p className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
          La structure « {r.venue.name} » n’est pas validée : une salle ne peut être validée qu’après sa structure.
        </p>
      )}

      <Section title="Décision sur la salle">
        <DecisionBar
          actions={ROOM_ACTIONS[r.status] ?? []}
          busy={busy}
          subject={r.name}
          onDecide={async (decision, note) => {
            const done = await run(() => adminApi.reviewRoom(r.id, decision as RoomDecision, note), 'Décision enregistrée.');
            if (done) { detail.reload(); onChanged(); }
            return done;
          }}
        />
        <p className="mt-2 text-[11px] text-slate-400">Valider une salle ne valide aucune autre salle de la structure. Suspendre ou refuser une salle publiée la dépublie.</p>
      </Section>

      <Section title="Publication">
        <p className="text-sm text-slate-300 mb-3">
          {r.bookable ? 'La salle est actuellement réservable par le public.' : 'La salle n’est pas réservable (validation, publication, offre commerciale ou activation manquante).'}
          {r.upcomingConfirmedBookings > 0 && <> {r.upcomingConfirmedBookings} séance(s) confirmée(s) à venir.</>}
        </p>
        {r.publication === 'PUBLISHED' && <Btn tone="danger" disabled={busy} onClick={() => setPublicationDialog('UNPUBLISH')}>Retirer de la publication</Btn>}
        {r.publication === 'UNPUBLISHED_BY_ADMIN' && <Btn tone="success" disabled={busy} onClick={() => setPublicationDialog('RESTORE')}>Lever le retrait</Btn>}
        {r.publication === 'UNPUBLISHED_BY_ADMIN' && <p className="mt-2 text-[11px] text-slate-400">Lever le retrait ne republie pas : le Gestionnaire republie lui-même.</p>}
      </Section>

      <Section title="Lieu et accueil">
        <Row label="Adresse exacte">{[r.addressLine, r.city].filter(Boolean).join(', ')}</Row>
        <Row label="Position">{r.latitude !== null && r.longitude !== null ? `${r.latitude}, ${r.longitude}` : null}</Row>
        <Row label="Zone affichée au public">{r.zoneLabel}</Row>
        <Row label="Consignes d’accès (révélées après confirmation)">{r.accessInstructions}</Row>
        <Row label="Capacité">{r.capacity}</Row>
        <Row label="Accueille des mineurs">{r.welcomesMinors ? 'Oui' : 'Non'}</Row>
        <Row label="Tarif horaire">{r.pricePerHour ? formatMoney(r.pricePerHour.amount, r.pricePerHour.currency) : null}</Row>
        <Row label="Équipements">{r.equipment.join(', ')}</Row>
        <Row label="Accessibilité">{r.accessibility.join(', ')}</Row>
        {r.description && <p className="mt-3 text-sm text-slate-300 whitespace-pre-line">{r.description}</p>}
        {r.rules && <p className="mt-3 text-sm text-slate-300 whitespace-pre-line"><strong>Règles :</strong> {r.rules}</p>}
        {r.cancellationPolicy && <p className="mt-3 text-sm text-slate-300 whitespace-pre-line"><strong>Annulation :</strong> {r.cancellationPolicy}</p>}
      </Section>

      <Section title="Horaires d’ouverture">
        {r.availabilities.length === 0 ? <p className="text-sm text-slate-400">Aucun horaire déclaré.</p> : (
          <ul className="text-sm text-slate-300 grid sm:grid-cols-2 gap-x-6">
            {r.availabilities.map((a) => <li key={a.id}>{weekday(a.dayOfWeek)} : {a.startTime} – {a.endTime}</li>)}
          </ul>
        )}
      </Section>

      <Section title={`Photos (${r.photos.length})`}>
        {r.photos.length === 0 ? <p className="text-sm text-slate-400">Aucune photo.</p> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {r.photos.map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer">
                <img src={p.url} alt="" className="w-full h-32 object-cover rounded-xl border border-white/10" />
              </a>
            ))}
          </div>
        )}
      </Section>

      <Section title="Historique"><History events={r.history} /></Section>

      {publicationDialog && (
        <ConfirmModal
          title={publicationDialog === 'UNPUBLISH' ? 'Retirer la salle de la publication' : 'Lever le retrait'}
          variant={publicationDialog === 'UNPUBLISH' ? 'danger' : 'success'}
          confirmLabel={publicationDialog === 'UNPUBLISH' ? 'Retirer' : 'Lever le retrait'}
          busy={busy}
          noteLabel="Motif"
          noteRequired={publicationDialog === 'UNPUBLISH'}
          description={publicationDialog === 'UNPUBLISH'
            ? 'La salle disparaît de la carte et ne peut plus être réservée. Les séances déjà confirmées sont conservées.'
            : 'La salle repasse « non publiée » ; le Gestionnaire doit la republier.'}
          onCancel={() => setPublicationDialog(null)}
          onConfirm={async (note) => {
            if (await run(() => adminApi.decidePublication(r.id, publicationDialog, note || undefined), publicationDialog === 'UNPUBLISH' ? 'Salle retirée.' : 'Retrait levé.')) {
              setPublicationDialog(null); detail.reload(); onChanged();
            }
          }}
        />
      )}
    </Drawer>
  );
};
