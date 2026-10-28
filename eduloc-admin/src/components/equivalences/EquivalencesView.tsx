import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { adminApi } from '../../lib/api';
import { useAction, useAsync } from '../../lib/hooks';
import { equivalenceStatus, formatDate, highestDegree } from '../../lib/labels';
import type { DegreeEquivalence, EquivalenceStatus } from '../../types';
import { Badge, Btn, Card, Drawer, Empty, ErrorBox, Loading, Pager, Segmented, Table } from '../ui/kit';
import { SearchInput } from '../ui/SearchInput';
import { EquivalenceForm, levelLabel } from './EquivalenceForm';

type Filter = EquivalenceStatus | 'ALL';

export const EquivalencesView: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<DegreeEquivalence | 'new' | null>(null);
  const { run, busy } = useAction();
  const list = useAsync(
    () => adminApi.equivalences({ status: filter === 'ALL' ? undefined : filter, search: search || undefined, page }),
    [filter, search, page, refreshKey],
  );
  const levels = useAsync(() => adminApi.educationLevels(), []);

  return (
    <div className="space-y-5">
      <Card className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            value={filter}
            onChange={(v) => { setFilter(v); setPage(1); }}
            options={[
              { value: 'PENDING', label: 'À trancher' }, { value: 'VALIDATED', label: 'Validées' },
              { value: 'REJECTED', label: 'Non reconnues' }, { value: 'ALL', label: 'Toutes' },
            ]}
          />
          <div className="w-64"><SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Diplôme, pays, spécialité…" /></div>
        </div>
        <Btn tone="primary" onClick={() => setEditing('new')}><Plus className="w-4 h-4" /> Nouvelle équivalence</Btn>
      </Card>

      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}

      <Card className="overflow-hidden">
        {list.loading && !list.data ? <Loading /> : !list.data || list.data.length === 0 ? (
          <Empty>Aucune équivalence.</Empty>
        ) : (
          <Table head={['Diplôme', 'Pays', 'Statut', 'Équivalent à', 'Mise à jour']}>
            {list.data.map((e) => {
              const st = equivalenceStatus(e.status);
              return (
                <tr key={e.id} className="hover:bg-white/5 cursor-pointer" onClick={() => setEditing(e)}>
                  <td className="px-4 py-3.5">
                    <p className="font-bold text-white">{e.degreeTitle}</p>
                    {e.specialty && <p className="text-[11px] text-slate-400">{e.specialty}</p>}
                  </td>
                  <td className="px-4 py-3.5">{e.country}</td>
                  <td className="px-4 py-3.5"><Badge tone={st.tone}>{st.label}</Badge></td>
                  <td className="px-4 py-3.5">
                    {e.status === 'VALIDATED' ? <>{highestDegree(e.equivalentDegree)}{e.equivalentLevel ? <span className="block text-[11px] text-slate-400">{levelLabel(e.equivalentLevel)}</span> : null}</> : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-slate-400">{formatDate(e.updatedAt)}</td>
                </tr>
              );
            })}
          </Table>
        )}
        <Pager page={page} count={list.data?.length ?? 0} onChange={setPage} />
      </Card>

      {editing && (
        <Drawer
          title={editing === 'new' ? 'Nouvelle équivalence' : editing.degreeTitle}
          subtitle={editing === 'new' ? undefined : <span>{editing.country}{editing.specialty ? ` · ${editing.specialty}` : ''}</span>}
          onClose={() => setEditing(null)}
        >
          {editing === 'new' ? (
            <EquivalenceForm
              levels={levels.data ?? []}
              withIdentity={{ degreeTitle: '', country: '', specialty: '' }}
              busy={busy}
              submitLabel="Créer l’équivalence"
              onSubmit={async (body) => {
                const { degreeTitle, country, specialty, ...decision } = body;
                if (await run(() => adminApi.createEquivalence({ ...decision, degreeTitle: degreeTitle!, country: country!, specialty }), 'Équivalence créée.')) {
                  setEditing(null); list.reload();
                }
              }}
            />
          ) : (
            <EquivalenceForm
              key={editing.id}
              levels={levels.data ?? []}
              initial={{ status: editing.status, equivalentDegree: editing.equivalentDegree, equivalentLevelId: editing.equivalentLevel?.id, notes: editing.notes }}
              busy={busy}
              submitLabel="Enregistrer la décision"
              onSubmit={async (body) => {
                if (await run(() => adminApi.decideEquivalence(editing.id, body), 'Décision enregistrée.')) { setEditing(null); list.reload(); }
              }}
            />
          )}
        </Drawer>
      )}
    </div>
  );
};
