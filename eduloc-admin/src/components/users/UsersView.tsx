import React, { useState } from 'react';
import { adminApi } from '../../lib/api';
import { useAction, useAsync } from '../../lib/hooks';
import { formatDate, fullName, userStatus } from '../../lib/labels';
import type { AdminUser, UserStatus } from '../../types';
import { Badge, Btn, Card, Empty, ErrorBox, Loading, Pager, Segmented, Table } from '../ui/kit';
import { ConfirmModal } from '../ui/ConfirmModal';
import { SearchInput } from '../ui/SearchInput';

type Filter = '' | UserStatus;

export const UsersView: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [status, setStatus] = useState<Filter>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<{ user: AdminUser; next: 'ACTIVE' | 'SUSPENDED' } | null>(null);
  const { run, busy } = useAction();
  const users = useAsync(() => adminApi.users({ search: search || undefined, status: status || undefined, page }), [status, search, page, refreshKey]);

  return (
    <div className="space-y-5">
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <div className="w-72"><SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Nom ou e-mail…" /></div>
        <Segmented
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[
            { value: '', label: 'Tous' }, { value: 'ACTIVE', label: 'Actifs' },
            { value: 'SUSPENDED', label: 'Suspendus' }, { value: 'PENDING_VERIFICATION', label: 'E-mail non vérifié' },
          ]}
        />
      </Card>

      {users.error && <ErrorBox message={users.error} onRetry={users.reload} />}

      <Card className="overflow-hidden">
        {users.loading && !users.data ? <Loading /> : !users.data || users.data.length === 0 ? (
          <Empty>Aucun utilisateur.</Empty>
        ) : (
          <Table head={['Utilisateur', 'Statut', 'Inscription', 'Dernière connexion', '']}>
            {users.data.map((u) => {
              const st = userStatus(u.status);
              return (
                <tr key={u.id} className="hover:bg-white/5">
                  <td className="px-4 py-3.5">
                    <p className="font-bold text-white">{fullName(u)} {u.isAdmin && <Badge tone="indigo">Admin</Badge>}</p>
                    <p className="text-[11px] font-mono text-slate-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3.5"><Badge tone={st.tone}>{st.label}</Badge></td>
                  <td className="px-4 py-3.5 text-slate-400">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3.5 text-slate-400">{formatDate(u.lastLoginAt, true)}</td>
                  <td className="px-4 py-3.5 text-right">
                    {u.isAdmin ? null : u.status === 'SUSPENDED'
                      ? <Btn small tone="success" onClick={() => setTarget({ user: u, next: 'ACTIVE' })}>Réactiver</Btn>
                      : u.status === 'ACTIVE'
                        ? <Btn small tone="danger" onClick={() => setTarget({ user: u, next: 'SUSPENDED' })}>Suspendre</Btn>
                        : null}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
        <Pager page={page} count={users.data?.length ?? 0} onChange={setPage} />
      </Card>

      {target && (
        <ConfirmModal
          title={target.next === 'SUSPENDED' ? 'Suspendre ce compte' : 'Réactiver ce compte'}
          variant={target.next === 'SUSPENDED' ? 'danger' : 'success'}
          confirmLabel={target.next === 'SUSPENDED' ? 'Suspendre' : 'Réactiver'}
          busy={busy}
          description={target.next === 'SUSPENDED'
            ? <><strong>{fullName(target.user)}</strong> est déconnecté de toutes ses sessions et ne peut plus se connecter.</>
            : <><strong>{fullName(target.user)}</strong> pourra de nouveau se connecter.</>}
          onCancel={() => setTarget(null)}
          onConfirm={async () => {
            if (await run(() => adminApi.setUserStatus(target.user.id, target.next), target.next === 'SUSPENDED' ? 'Compte suspendu.' : 'Compte réactivé.')) {
              setTarget(null); users.reload();
            }
          }}
        />
      )}
    </div>
  );
};
