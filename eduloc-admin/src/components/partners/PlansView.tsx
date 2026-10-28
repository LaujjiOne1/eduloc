import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { adminApi } from '../../lib/api';
import { useAction, useAsync } from '../../lib/hooks';
import { formatMoney } from '../../lib/labels';
import type { PartnerPlan } from '../../types';
import { Badge, Btn, Card, Drawer, Empty, ErrorBox, Field, Loading, Table, TextArea, TextInput } from '../ui/kit';

export const PlansView: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const plans = useAsync(() => adminApi.plans(), [refreshKey]);
  const [editing, setEditing] = useState<PartnerPlan | 'new' | null>(null);
  const { run, busy } = useAction();

  return (
    <div className="space-y-5">
      <Card className="p-4 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">Prix et durée sont des données : un changement ne touche pas les souscriptions déjà en cours.</p>
        <Btn tone="primary" onClick={() => setEditing('new')}><Plus className="w-4 h-4" /> Nouveau plan</Btn>
      </Card>
      {plans.error && <ErrorBox message={plans.error} onRetry={plans.reload} />}
      <Card className="overflow-hidden">
        {plans.loading && !plans.data ? <Loading /> : !plans.data || plans.data.length === 0 ? <Empty>Aucun plan.</Empty> : (
          <Table head={['Plan', 'Code', 'Prix', 'Durée', 'Proposé aux structures', '']}>
            {plans.data.map((p) => (
              <tr key={p.id} className="hover:bg-white/5">
                <td className="px-4 py-3.5"><p className="font-bold text-white">{p.name}</p>{p.description && <p className="text-[11px] text-slate-400 max-w-xs truncate">{p.description}</p>}</td>
                <td className="px-4 py-3.5 font-mono text-slate-400">{p.code}</td>
                <td className="px-4 py-3.5">{Number(p.price.amount) === 0 ? 'Gratuit' : formatMoney(p.price.amount, p.price.currency)}</td>
                <td className="px-4 py-3.5">{p.durationDays} j</td>
                <td className="px-4 py-3.5">{p.isActive ? <Badge tone="green">Oui</Badge> : <Badge tone="slate">Non</Badge>}</td>
                <td className="px-4 py-3.5 text-right"><Btn small onClick={() => setEditing(p)}>Modifier</Btn></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {editing && (
        <Drawer title={editing === 'new' ? 'Nouveau plan' : editing.name} onClose={() => setEditing(null)}>
          <PlanForm
            key={editing === 'new' ? 'new' : editing.id}
            plan={editing === 'new' ? null : editing}
            busy={busy}
            onSubmit={async (body) => {
              const done = await run(
                () => (editing === 'new' ? adminApi.createPlan(body) : adminApi.updatePlan(editing.id, body)),
                editing === 'new' ? 'Plan créé.' : 'Plan mis à jour.',
              );
              if (done) { setEditing(null); plans.reload(); }
            }}
          />
        </Drawer>
      )}
    </div>
  );
};

const PlanForm: React.FC<{ plan: PartnerPlan | null; busy: boolean; onSubmit: (body: { code: string; name: string; description?: string; priceAmount: number; durationDays: number; isActive: boolean }) => void }> = ({ plan, busy, onSubmit }) => {
  const [code, setCode] = useState(plan?.code ?? '');
  const [name, setName] = useState(plan?.name ?? '');
  const [description, setDescription] = useState(plan?.description ?? '');
  const [price, setPrice] = useState(plan ? plan.price.amount : '0');
  const [days, setDays] = useState(plan ? String(plan.durationDays) : '365');
  const [active, setActive] = useState(plan?.isActive ?? true);

  const priceNum = Number(price);
  const daysNum = Number(days);
  const ok = /^[A-Z0-9_]{2,40}$/.test(code) && name.trim().length >= 2 && Number.isFinite(priceNum) && priceNum >= 0 && Number.isInteger(daysNum) && daysNum >= 1;

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Code" hint="Majuscules, chiffres et _ (ex. PILOT)"><TextInput value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></Field>
        <Field label="Nom"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </div>
      <Field label="Description"><TextArea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Prix (Ar)" hint="0 = gratuit, activé immédiatement"><TextInput type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <Field label="Durée (jours)"><TextInput type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Proposé aux structures
      </label>
      <div className="flex justify-end">
        <Btn tone="primary" disabled={busy || !ok} onClick={() => onSubmit({ code, name: name.trim(), description: description.trim() || undefined, priceAmount: priceNum, durationDays: daysNum, isActive: active })}>
          {busy ? 'En cours…' : 'Enregistrer'}
        </Btn>
      </div>
    </div>
  );
};
