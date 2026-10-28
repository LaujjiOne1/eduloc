import React, { useState } from 'react';
import { adminApi } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { bookingStatus, formatDate, formatMoney, fullName, teachingMode } from '../../lib/labels';
import type { BookingStatus } from '../../types';
import { Badge, Card, Empty, ErrorBox, Loading, Pager, Segmented, Table } from '../ui/kit';

type Scope = 'all' | 'rooms';
type Filter = '' | BookingStatus;

const STATUS_OPTIONS: { value: Filter; label: string }[] = [
  { value: '', label: 'Toutes' }, { value: 'PENDING', label: 'En attente' }, { value: 'CONFIRMED', label: 'Confirmées' },
  { value: 'IN_PROGRESS', label: 'En cours' }, { value: 'COMPLETED', label: 'Terminées' },
  { value: 'CANCELLED', label: 'Annulées' }, { value: 'REFUSED', label: 'Refusées' },
];

/** Consultation seulement : l'administration n'a pas d'action sur le statut d'une séance (c'est le tuteur et le demandeur qui décident). */
export const BookingsView: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [scope, setScope] = useState<Scope>('all');
  const [status, setStatus] = useState<Filter>('');
  const [page, setPage] = useState(1);
  const bookings = useAsync(() => (scope === 'all' ? adminApi.bookings({ status: status || undefined, page }) : Promise.resolve([])), [scope, status, page, refreshKey]);
  const rooms = useAsync(() => (scope === 'rooms' ? adminApi.roomReservations(status || undefined) : Promise.resolve([])), [scope, status, refreshKey]);

  return (
    <div className="space-y-5">
      <Card className="p-4 flex flex-wrap items-center gap-4">
        <Segmented value={scope} onChange={(v) => { setScope(v); setPage(1); }} options={[{ value: 'all', label: 'Toutes les séances' }, { value: 'rooms', label: 'Séances en salle partenaire' }]} />
        <Segmented value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUS_OPTIONS} />
      </Card>

      {scope === 'all' ? (
        <>
          {bookings.error && <ErrorBox message={bookings.error} onRetry={bookings.reload} />}
          <Card className="overflow-hidden">
            {bookings.loading && !bookings.data ? <Loading /> : !bookings.data || bookings.data.length === 0 ? (
              <Empty>Aucune réservation.</Empty>
            ) : (
              <Table head={['Séance', 'Demandeur', 'Tuteur', 'Lieu', 'Total', 'Statut']}>
                {bookings.data.map((b) => {
                  const st = bookingStatus(b.status);
                  return (
                    <tr key={b.id} className="hover:bg-white/5">
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-white">{b.offerTitle}</p>
                        <p className="text-[11px] text-slate-400">{formatDate(b.startAt, true)} → {new Date(b.endAt).toLocaleTimeString('fr-FR', { timeStyle: 'short' })}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        {fullName(b.requester)}
                        <span className="block text-[11px] text-slate-400">pour {b.beneficiary.firstName}</span>
                      </td>
                      <td className="px-4 py-3.5">{b.tutorProfile.displayName || fullName(b.tutorProfile.user)}</td>
                      <td className="px-4 py-3.5">
                        {teachingMode(b.teachingMode)}
                        {b.room && <span className="block text-[11px] text-slate-400">{b.room.name} · {b.room.venue.name}</span>}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {formatMoney(b.totalAmount, b.currency)}
                        <span className="block text-[11px] text-slate-400">dont frais EduLoc {formatMoney(b.serviceFee, b.currency)}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={st.tone}>{st.label}</Badge>
                          {b.openConflicts > 0 && <Badge tone="rose">{b.openConflicts} conflit(s)</Badge>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
            <Pager page={page} count={bookings.data?.length ?? 0} onChange={setPage} />
          </Card>
        </>
      ) : (
        <>
          {rooms.error && <ErrorBox message={rooms.error} onRetry={rooms.reload} />}
          <Card className="overflow-hidden">
            {rooms.loading && !rooms.data ? <Loading /> : !rooms.data || rooms.data.length === 0 ? (
              <Empty>Aucune séance en salle partenaire.</Empty>
            ) : (
              <Table head={['Salle', 'Date', 'Tuteur', 'Participants', 'Statut']}>
                {rooms.data.map((r) => {
                  const st = bookingStatus(r.status);
                  return (
                    <tr key={r.id} className="hover:bg-white/5">
                      <td className="px-4 py-3.5"><p className="font-bold text-white">{r.room?.name ?? '—'}</p><p className="text-[11px] text-slate-400">{r.room?.venue.name}</p></td>
                      <td className="px-4 py-3.5 text-slate-300">{formatDate(r.startAt, true)}</td>
                      <td className="px-4 py-3.5">{r.tutorProfile.displayName ?? '—'}</td>
                      <td className="px-4 py-3.5">{r.participantsCount}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={st.tone}>{st.label}</Badge>
                          {r.openConflicts.length > 0 && <Badge tone="rose">{r.openConflicts.length} conflit(s)</Badge>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
