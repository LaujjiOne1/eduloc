import React, { useState } from 'react';
import { adminApi } from '../../lib/api';
import { useAction, useAsync } from '../../lib/hooks';
import { formatDate, formatMoney, fullName } from '../../lib/labels';
import type { AdminOffer } from '../../types';
import { Badge, Btn, Card, Empty, ErrorBox, Loading, Pager, Segmented, Table } from '../ui/kit';
import { ConfirmModal } from '../ui/ConfirmModal';
import { SearchInput } from '../ui/SearchInput';

type State = '' | 'ACTIVE' | 'INACTIVE' | 'DISABLED_BY_ADMIN';

export const OffersView: React.FC<{ refreshKey: number; onChanged: () => void }> = ({ refreshKey, onChanged }) => {
  const [state, setState] = useState<State>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<{ offer: AdminOffer; action: 'disable' | 'enable' } | null>(null);
  const { run, busy } = useAction();
  const offers = useAsync(() => adminApi.offers({ search: search || undefined, state: state || undefined, page }), [state, search, page, refreshKey]);

  return (
    <div className="space-y-5">
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <div className="w-72"><SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Titre, matière, tuteur…" /></div>
        <Segmented
          value={state}
          onChange={(v) => { setState(v); setPage(1); }}
          options={[
            { value: '', label: 'Toutes' }, { value: 'ACTIVE', label: 'Visibles' },
            { value: 'DISABLED_BY_ADMIN', label: 'Retirées par EduLoc' }, { value: 'INACTIVE', label: 'Masquées par le tuteur' },
          ]}
        />
      </Card>

      {offers.error && <ErrorBox message={offers.error} onRetry={offers.reload} />}

      <Card className="overflow-hidden">
        {offers.loading && !offers.data ? <Loading /> : !offers.data || offers.data.length === 0 ? (
          <Empty>Aucune offre.</Empty>
        ) : (
          <Table head={['Offre', 'Tuteur', 'Tarif', 'État', 'Créée', '']}>
            {offers.data.map((o) => (
              <tr key={o.id} className="hover:bg-white/5">
                <td className="px-4 py-3.5">
                  <p className="font-bold text-white">{o.title}</p>
                  <p className="text-[11px] text-slate-400">{o.subject.name}{o.educationLevel ? ` · ${o.educationLevel.name}` : ''} · {o.durationMinutes} min</p>
                </td>
                <td className="px-4 py-3.5">
                  {o.tutorProfile.displayName || fullName(o.tutorProfile.user)}
                  <span className="block text-[11px] font-mono text-slate-400">{o.tutorProfile.user.email}</span>
                  {o.tutorProfile.suspendedAt && <Badge tone="rose">Tuteur suspendu</Badge>}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap">{formatMoney(o.price, o.currency)}</td>
                <td className="px-4 py-3.5">
                  {o.disabledByAdminAt ? <Badge tone="rose">Retirée le {formatDate(o.disabledByAdminAt)}</Badge>
                    : o.isActive ? <Badge tone="green">Visible</Badge> : <Badge tone="slate">Masquée par le tuteur</Badge>}
                </td>
                <td className="px-4 py-3.5 text-slate-400">{formatDate(o.createdAt)}</td>
                <td className="px-4 py-3.5 text-right">
                  {o.disabledByAdminAt
                    ? <Btn small tone="success" onClick={() => setTarget({ offer: o, action: 'enable' })}>Rétablir</Btn>
                    : <Btn small tone="danger" onClick={() => setTarget({ offer: o, action: 'disable' })}>Retirer</Btn>}
                </td>
              </tr>
            ))}
          </Table>
        )}
        <Pager page={page} count={offers.data?.length ?? 0} onChange={setPage} />
      </Card>

      {target && (
        <ConfirmModal
          title={target.action === 'disable' ? 'Retirer cette offre' : 'Rétablir cette offre'}
          variant={target.action === 'disable' ? 'danger' : 'success'}
          confirmLabel={target.action === 'disable' ? 'Retirer' : 'Rétablir'}
          busy={busy}
          description={target.action === 'disable'
            ? <>« {target.offer.title} » disparaît de la recherche et le tuteur ne peut pas la réactiver. Les séances à venir qui en dépendent apparaîtront dans « Conflits ».</>
            : <>« {target.offer.title} » redevient visible dans la recherche.</>}
          onCancel={() => setTarget(null)}
          onConfirm={async () => {
            if (await run(() => adminApi.moderateOffer(target.offer.id, target.action), target.action === 'disable' ? 'Offre retirée.' : 'Offre rétablie.')) {
              setTarget(null); offers.reload(); onChanged();
            }
          }}
        />
      )}
    </div>
  );
};
