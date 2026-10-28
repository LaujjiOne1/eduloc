import React, { useState } from 'react';
import type { DecideEquivalenceBody, DegreeEquivalence, EducationLevel, EquivalenceStatus, EquivalentDegree } from '../../types';
import { Btn, Field, Select, TextArea, TextInput } from '../ui/kit';
import { highestDegree } from '../../lib/labels';

/** Niveaux qu'un tuteur peut se voir valider : actifs, sur l'échelle, du Lycée/Bac (rang 3) au Doctorat. */
export const tutorLevels = (levels: EducationLevel[]) =>
  levels.filter((l) => l.isActive && l.academicRank !== null && l.academicRank >= 3)
    .sort((a, b) => (a.academicRank! - b.academicRank!) || a.displayOrder - b.displayOrder);

export const levelLabel = (l: { name: string; category: string }) => (l.category && l.category !== l.name ? `${l.category} · ${l.name}` : l.name);

interface Props {
  levels: EducationLevel[];
  /** Fournis seulement à la création : une équivalence se retrouve par intitulé + pays + spécialité. */
  withIdentity?: { degreeTitle: string; country: string; specialty: string };
  initial?: Pick<DegreeEquivalence, 'status' | 'equivalentDegree' | 'notes'> & { equivalentLevelId?: string | null };
  busy: boolean;
  submitLabel: string;
  onSubmit: (body: DecideEquivalenceBody & { degreeTitle?: string; country?: string; specialty?: string }) => void;
}

export const EquivalenceForm: React.FC<Props> = ({ levels, withIdentity, initial, busy, submitLabel, onSubmit }) => {
  const [identity, setIdentity] = useState(withIdentity ?? { degreeTitle: '', country: '', specialty: '' });
  const [status, setStatus] = useState<EquivalenceStatus>(initial?.status ?? 'VALIDATED');
  const [degree, setDegree] = useState<EquivalentDegree | ''>(initial?.equivalentDegree ?? '');
  const [levelId, setLevelId] = useState(initial?.equivalentLevelId ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const validated = status === 'VALIDATED';
  const identityOk = !withIdentity || (identity.degreeTitle.trim() && identity.country.trim());
  const ok = identityOk && (!validated || (degree && levelId));

  return (
    <div className="space-y-4">
      {withIdentity && (
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Intitulé du diplôme">
            <TextInput value={identity.degreeTitle} onChange={(e) => setIdentity({ ...identity, degreeTitle: e.target.value })} />
          </Field>
          <Field label="Pays / système">
            <TextInput value={identity.country} onChange={(e) => setIdentity({ ...identity, country: e.target.value })} />
          </Field>
          <Field label="Spécialité" hint="Facultatif">
            <TextInput value={identity.specialty} onChange={(e) => setIdentity({ ...identity, specialty: e.target.value })} />
          </Field>
        </div>
      )}

      <Field label="Décision">
        <Select value={status} onChange={(e) => setStatus(e.target.value as EquivalenceStatus)}>
          <option value="VALIDATED">Équivalence reconnue</option>
          <option value="REJECTED">Aucune équivalence reconnue</option>
          <option value="PENDING">À trancher plus tard</option>
        </Select>
      </Field>

      {validated && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Équivaut au diplôme">
            <Select value={degree} onChange={(e) => setDegree(e.target.value as EquivalentDegree)}>
              <option value="">Choisir…</option>
              {(['BAC', 'LICENCE', 'MASTER', 'DOCTORAT'] as const).map((d) => <option key={d} value={d}>{highestDegree(d)}</option>)}
            </Select>
          </Field>
          <Field label="Niveau académique retenu" hint="Alimentera le niveau validé du tuteur à l’application.">
            <Select value={levelId} onChange={(e) => setLevelId(e.target.value)}>
              <option value="">Choisir…</option>
              {tutorLevels(levels).map((l) => <option key={l.id} value={l.id}>{levelLabel(l)}</option>)}
            </Select>
          </Field>
        </div>
      )}

      <Field label="Notes" hint="Source consultée, raisonnement : conservé avec la décision.">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="flex justify-end">
        <Btn
          tone="primary"
          disabled={busy || !ok}
          onClick={() => onSubmit({
            status,
            ...(validated ? { equivalentDegree: degree as EquivalentDegree, equivalentLevelId: levelId } : {}),
            notes: notes.trim() || undefined,
            ...(withIdentity ? {
              degreeTitle: identity.degreeTitle.trim(),
              country: identity.country.trim(),
              specialty: identity.specialty.trim() || undefined,
            } : {}),
          })}
        >
          {busy ? 'En cours…' : submitLabel}
        </Btn>
      </div>
    </div>
  );
};
