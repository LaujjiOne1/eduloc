import React, { useState } from 'react';
import { ExternalLink, FileText, ShieldAlert } from 'lucide-react';
import { adminApi } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import { useToast } from '../ui/Toast';
import {
  AUTHENTICITY_TYPES, applicationStatus, documentStatus, documentType, equivalenceStatus, formatDate, fullName, highestDegree,
} from '../../lib/labels';
import type { EducationLevel, TutorApplication, TutorDocument } from '../../types';
import { Badge, Btn, Drawer, Field, Row, Section, Select, TextArea } from '../ui/kit';
import { ConfirmModal } from '../ui/ConfirmModal';
import { EquivalenceForm, levelLabel, tutorLevels } from '../equivalences/EquivalenceForm';

interface Props {
  app: TutorApplication;
  levels: EducationLevel[];
  onChanged: () => void;
  onClose: () => void;
}

type Dialog =
  | { kind: 'approve' }
  | { kind: 'reject' }
  | { kind: 'suspend' }
  | { kind: 'reinstate' }
  | { kind: 'doc-approve'; doc: TutorDocument }
  | { kind: 'doc-reject'; doc: TutorDocument }
  | null;

export const ApplicationDetail: React.FC<Props> = ({ app, levels, onChanged, onClose }) => {
  const { run, busy } = useAction();
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const p = app.tutorProfile;
  const name = p.displayName || fullName(p.user);
  const isPending = app.status === 'PENDING';
  const isApproved = app.status === 'APPROVED';

  const openDocument = async (doc: TutorDocument) => {
    try {
      const { url } = await adminApi.documentUrl(doc.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast.error('Ouverture impossible', e instanceof Error ? e.message : String(e));
    }
  };

  const docsToReview = app.documents.filter((d) => d.status === 'PENDING').length;
  const docsRejected = app.documents.filter((d) => d.status === 'REJECTED').length;

  return (
    <Drawer
      title={name}
      onClose={onClose}
      subtitle={
        <>
          <Badge tone={applicationStatus(app.status).tone}>{applicationStatus(app.status).label}</Badge>
          {p.suspendedAt && <Badge tone="rose">Suspendu le {formatDate(p.suspendedAt)}</Badge>}
          <span>{p.user.email}</span>
          <span>· dossier du {formatDate(app.createdAt)}</span>
        </>
      }
    >
      {app.status === 'REJECTED' && app.rejectionReason && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-200">
          <strong>Motif du refus :</strong> {app.rejectionReason}
        </div>
      )}

      <Section title="Profil et diplôme">
        <Row label="Plus haut diplôme déclaré">{highestDegree(p.highestDegree)}</Row>
        <Row label="Intitulé">{p.degreeTitle}</Row>
        <Row label="Domaine / spécialisation">{[p.fieldOfStudy, p.specialization].filter(Boolean).join(' · ')}</Row>
        <Row label="Établissement">{p.degreeInstitution}</Row>
        <Row label="Pays du diplôme">{p.degreeCountry}</Row>
        {p.bio && <p className="mt-3 text-sm text-slate-300 whitespace-pre-line">{p.bio}</p>}
      </Section>

      {(p.highestDegree === 'OTHER' || p.degreeEquivalence) && (
        <EquivalenceBlock app={app} levels={levels} onChanged={onChanged} />
      )}

      <Section title="Matières déclarées">
        {p.subjects.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune matière.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {p.subjects.map((s) => <Badge key={s.id} tone="slate">{s.subject.name} · {s.educationLevel.name}</Badge>)}
          </div>
        )}
      </Section>

      <Section title="Expériences déclarées">
        {p.experiences.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune expérience.</p>
        ) : (
          <ul className="space-y-2">
            {p.experiences.map((x) => (
              <li key={x.id} className="p-3 rounded-xl bg-white/5 border border-white/10 text-sm">
                <p className="font-semibold text-white">{x.title} <span className="font-normal text-slate-400">· {x.organization}</span></p>
                <p className="text-xs text-slate-400">{x.period}</p>
                {x.description && <p className="mt-1 text-slate-300 whitespace-pre-line">{x.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={`Justificatifs (${app.documents.length})`}
        aside={docsToReview > 0 ? <Badge tone="amber">{docsToReview} à contrôler</Badge> : undefined}
      >
        {app.documents.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun justificatif transmis.</p>
        ) : (
          <div className="space-y-3">
            {app.documents.map((d) => (
              <DocumentCard
                key={d.id}
                doc={d}
                busy={busy}
                onOpen={() => void openDocument(d)}
                onApprove={() => setDialog({ kind: 'doc-approve', doc: d })}
                onReject={() => setDialog({ kind: 'doc-reject', doc: d })}
              />
            ))}
          </div>
        )}
      </Section>

      <AcademicLevelBlock key={`${p.academicLevel?.id ?? 'none'}-${p.academicLevelValidatedAt ?? ''}`} app={app} levels={levels} onChanged={onChanged} />

      <Section title="Décision">
        {isPending && (
          <div className="space-y-3">
            {(docsToReview > 0 || docsRejected > 0 || !p.academicLevel) && (
              <ul className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-1 list-disc list-inside">
                {docsToReview > 0 && <li>{docsToReview} justificatif(s) pas encore contrôlé(s).</li>}
                {docsRejected > 0 && <li>{docsRejected} justificatif(s) refusé(s).</li>}
                {!p.academicLevel && <li>Aucun niveau académique validé : le tuteur ne sera pas éligible aux niveaux universitaires.</li>}
              </ul>
            )}
            <div className="flex gap-3">
              <Btn tone="success" disabled={busy} onClick={() => setDialog({ kind: 'approve' })}>Approuver le dossier</Btn>
              <Btn tone="danger" disabled={busy} onClick={() => setDialog({ kind: 'reject' })}>Refuser le dossier</Btn>
            </div>
          </div>
        )}
        {isApproved && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <Btn
                disabled={busy}
                onClick={async () => { if (await run(() => adminApi.reindexTutor(p.id), 'Réindexation demandée.')) onChanged(); }}
              >
                Réindexer la recherche sémantique
              </Btn>
              {p.suspendedAt ? (
                <Btn tone="success" disabled={busy} onClick={() => setDialog({ kind: 'reinstate' })}>Lever la suspension</Btn>
              ) : (
                <Btn tone="danger" disabled={busy} onClick={() => setDialog({ kind: 'suspend' })}>Suspendre le tuteur</Btn>
              )}
            </div>
            {p.suspendedAt && (
              <p className="text-xs text-slate-400">Ce tuteur est suspendu : il n’apparaît plus dans la recherche et ses séances à venir sont signalées dans « Conflits ». Levez la suspension pour le rétablir.</p>
            )}
          </div>
        )}
        {!isPending && !isApproved && <p className="text-sm text-slate-400">Dossier clôturé le {formatDate(app.reviewedAt)}.</p>}
      </Section>

      {dialog?.kind === 'approve' && (
        <ConfirmModal
          title="Approuver le dossier"
          variant="success"
          confirmLabel="Approuver"
          busy={busy}
          description={<>Le profil de <strong>{name}</strong> devient visible dans la recherche et ses compétences libres entrent au catalogue.{p.academicLevel ? <> Niveau académique validé : <strong>{levelLabel(p.academicLevel)}</strong>.</> : null}</>}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            if (await run(() => adminApi.approveApplication(app.id, {}), 'Dossier approuvé.')) { setDialog(null); onChanged(); onClose(); }
          }}
        />
      )}
      {dialog?.kind === 'reject' && (
        <ConfirmModal
          title="Refuser le dossier"
          variant="danger"
          confirmLabel="Refuser"
          busy={busy}
          noteLabel="Motif communiqué au tuteur"
          notePlaceholder="Ex. : diplôme illisible, pièce d’identité manquante…"
          onCancel={() => setDialog(null)}
          onConfirm={async (reason) => {
            if (await run(() => adminApi.rejectApplication(app.id, reason), 'Dossier refusé.')) { setDialog(null); onChanged(); onClose(); }
          }}
        />
      )}
      {dialog?.kind === 'suspend' && (
        <ConfirmModal
          title="Suspendre le tuteur"
          variant="danger"
          confirmLabel="Suspendre"
          busy={busy}
          description="Le profil quitte la recherche, le tuteur est notifié, et ses séances en attente ou confirmées à venir deviennent des conflits à traiter."
          noteLabel="Motif"
          onCancel={() => setDialog(null)}
          onConfirm={async (reason) => {
            const done = await run(() => adminApi.suspendTutor(p.id, reason), (r) => {
              const n = (r as { affectedBookings: number }).affectedBookings;
              return `Tuteur suspendu. ${n} séance(s) à venir signalée(s) en conflit.`;
            });
            if (done) { setDialog(null); onChanged(); }
          }}
        />
      )}
      {dialog?.kind === 'reinstate' && (
        <ConfirmModal
          title="Lever la suspension"
          variant="success"
          confirmLabel="Rétablir le tuteur"
          busy={busy}
          description="Le profil redevient visible dans la recherche et le tuteur est notifié. Les conflits « tuteur suspendu » encore ouverts sont classés ; les autres restent à traiter."
          noteLabel="Note"
          noteRequired={false}
          onCancel={() => setDialog(null)}
          onConfirm={async (note) => {
            const done = await run(() => adminApi.reinstateTutor(p.id, note || undefined), (r) => {
              const n = (r as { dismissedConflicts: number }).dismissedConflicts;
              return `Suspension levée. ${n} conflit(s) classé(s).`;
            });
            if (done) { setDialog(null); onChanged(); }
          }}
        />
      )}
      {dialog?.kind === 'doc-approve' && (
        <ConfirmModal
          title={`Approuver : ${documentType(dialog.doc.type).label}`}
          variant="success"
          confirmLabel={AUTHENTICITY_TYPES.has(dialog.doc.type) ? 'J’atteste avoir contrôlé ce document' : 'Approuver'}
          busy={busy}
          description={dialog.doc.approvalMeaning}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            const doc = dialog.doc;
            if (await run(
              () => adminApi.reviewDocument(doc.id, { status: 'APPROVED', ...(AUTHENTICITY_TYPES.has(doc.type) ? { confirmAuthenticity: true } : {}) }),
              'Justificatif approuvé.',
            )) { setDialog(null); onChanged(); }
          }}
        />
      )}
      {dialog?.kind === 'doc-reject' && (
        <ConfirmModal
          title={`Refuser : ${documentType(dialog.doc.type).label}`}
          variant="danger"
          confirmLabel="Refuser le justificatif"
          busy={busy}
          noteLabel="Motif"
          noteRequired={false}
          notePlaceholder="Ex. : scan illisible, document expiré…"
          onCancel={() => setDialog(null)}
          onConfirm={async (reason) => {
            const doc = dialog.doc;
            if (await run(() => adminApi.reviewDocument(doc.id, { status: 'REJECTED', rejectionReason: reason || undefined }), 'Justificatif refusé.')) {
              setDialog(null); onChanged();
            }
          }}
        />
      )}
    </Drawer>
  );
};

const DocumentCard: React.FC<{
  doc: TutorDocument; busy: boolean; onOpen: () => void; onApprove: () => void; onReject: () => void;
}> = ({ doc, busy, onOpen, onApprove, onReject }) => {
  const t = documentType(doc.type);
  const s = documentStatus(doc.status);
  const check = doc.autoCheck && typeof doc.autoCheck === 'object' ? doc.autoCheck : null;
  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="font-semibold text-white text-sm">{t.label}</span>
          <Badge tone={s.tone}>{s.label}</Badge>
        </div>
        <span className="text-[11px] text-slate-400 truncate">{doc.fileName ?? doc.mimeType} · reçu le {formatDate(doc.uploadedAt)}</span>
      </div>
      <p className="text-xs text-slate-400 flex items-start gap-1.5">
        {AUTHENTICITY_TYPES.has(doc.type) && <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />}
        {doc.approvalMeaning}
      </p>
      {doc.status === 'REJECTED' && doc.rejectionReason && <p className="text-xs text-rose-300">Motif : {doc.rejectionReason}</p>}
      {check && (
        <details className="text-xs text-slate-400">
          <summary className="cursor-pointer select-none">Pré-contrôle automatique (indicatif, jamais décisionnel)</summary>
          <pre className="mt-2 p-3 rounded-lg bg-slate-950/60 overflow-x-auto text-[11px] text-slate-300">{JSON.stringify(check, null, 2)}</pre>
        </details>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <Btn small onClick={onOpen}><ExternalLink className="w-3.5 h-3.5" /> Ouvrir le fichier</Btn>
        {doc.status !== 'APPROVED' && <Btn small tone="success" disabled={busy} onClick={onApprove}>Approuver</Btn>}
        {doc.status !== 'REJECTED' && <Btn small tone="danger" disabled={busy} onClick={onReject}>Refuser</Btn>}
      </div>
    </div>
  );
};

/** Diplôme « Autre » : l'équivalence déjà tranchée est proposée ; sinon l'admin la crée et la tranche ici. */
const EquivalenceBlock: React.FC<{ app: TutorApplication; levels: EducationLevel[]; onChanged: () => void }> = ({ app, levels, onChanged }) => {
  const { run, busy } = useAction();
  const p = app.tutorProfile;
  const applied = p.degreeEquivalence;
  const suggestion = app.degreeEquivalenceSuggestion;
  const [creating, setCreating] = useState(false);

  return (
    <Section title="Équivalence du diplôme">
      {applied && (
        <p className="text-sm text-slate-300 mb-3">
          Équivalence appliquée : <strong>{applied.degreeTitle}</strong> ({applied.country}) →{' '}
          <strong>{highestDegree(applied.equivalentDegree)}</strong>{applied.equivalentLevel ? ` · ${levelLabel(applied.equivalentLevel)}` : ''}.
        </p>
      )}
      {suggestion && suggestion.id !== applied?.id && (
        <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
          <p className="text-sm text-slate-200 flex items-center gap-2 flex-wrap">
            Décision déjà prise pour ce diplôme : <Badge tone={equivalenceStatus(suggestion.status).tone}>{equivalenceStatus(suggestion.status).label}</Badge>
            {suggestion.status === 'VALIDATED' && <span>→ {highestDegree(suggestion.equivalentDegree)}{suggestion.equivalentLevel ? ` · ${levelLabel(suggestion.equivalentLevel)}` : ''}</span>}
          </p>
          {suggestion.notes && <p className="text-xs text-slate-400">{suggestion.notes}</p>}
          {suggestion.status === 'VALIDATED' && (
            <>
              <Btn
                tone="primary"
                small
                disabled={busy}
                onClick={async () => { if (await run(() => adminApi.applyEquivalence(app.id, suggestion.id), 'Équivalence appliquée.')) onChanged(); }}
              >
                Appliquer au dossier
              </Btn>
              <p className="text-[11px] text-slate-400">Met à jour le plus haut diplôme et le niveau académique validé du tuteur.</p>
            </>
          )}
        </div>
      )}
      {!suggestion && !applied && !creating && (
        <div className="space-y-2">
          <p className="text-sm text-slate-400">Aucune décision n’existe encore pour « {p.degreeTitle ?? '—'} » ({p.degreeCountry ?? 'pays inconnu'}).</p>
          <Btn small onClick={() => setCreating(true)} disabled={!p.degreeTitle || !p.degreeCountry}>Trancher l’équivalence</Btn>
          {(!p.degreeTitle || !p.degreeCountry) && <p className="text-[11px] text-amber-300">Intitulé ou pays manquant : demandez-les au tuteur.</p>}
        </div>
      )}
      {creating && (
        <EquivalenceForm
          levels={levels}
          withIdentity={{ degreeTitle: p.degreeTitle ?? '', country: p.degreeCountry ?? '', specialty: p.fieldOfStudy ?? '' }}
          busy={busy}
          submitLabel="Enregistrer la décision"
          onSubmit={async (body) => {
            const { degreeTitle, country, specialty, ...decision } = body;
            if (await run(
              () => adminApi.createEquivalence({ ...decision, degreeTitle: degreeTitle!, country: country!, specialty }),
              'Équivalence enregistrée. Appliquez-la au dossier.',
            )) { setCreating(false); onChanged(); }
          }}
        />
      )}
    </Section>
  );
};

/** Niveau académique VALIDÉ : seul celui-ci compte pour l'éligibilité universitaire ; jamais automatique. */
const AcademicLevelBlock: React.FC<{ app: TutorApplication; levels: EducationLevel[]; onChanged: () => void }> = ({ app, levels, onChanged }) => {
  const { run, busy } = useAction();
  const p = app.tutorProfile;
  const options = tutorLevels(levels);
  const [levelId, setLevelId] = useState(p.academicLevel?.id ?? '');
  const [note, setNote] = useState(p.academicLevelNote ?? '');
  const selected = options.find((l) => l.id === levelId);
  // Expert professionnel validé Doctorat sans doctorat : justification obligatoire (miroir de la règle du serveur).
  const noteRequired = !!selected && selected.academicRank! >= 9 && p.highestDegree !== 'DOCTORAT';
  const unchanged = levelId === (p.academicLevel?.id ?? '') && note.trim() === (p.academicLevelNote ?? '');

  return (
    <Section title="Niveau académique validé">
      <p className="text-xs text-slate-400 mb-3">
        Le niveau déclaré ne compte pas : seul le niveau que vous validez ici rend le tuteur éligible aux niveaux universitaires.
        {p.academicLevel && p.academicLevelValidatedAt ? ` Validé le ${formatDate(p.academicLevelValidatedAt)}.` : ''}
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Niveau">
          <Select value={levelId} onChange={(e) => setLevelId(e.target.value)}>
            <option value="">Aucun</option>
            {options.map((l) => <option key={l.id} value={l.id}>{levelLabel(l)}</option>)}
          </Select>
        </Field>
        <Field label={noteRequired ? 'Justification (obligatoire)' : 'Note'} hint={noteRequired ? 'Niveau Doctorat sans doctorat déclaré : expliquez votre décision.' : undefined}>
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </Field>
      </div>
      <div className="flex gap-3 mt-3">
        <Btn
          tone="primary"
          disabled={busy || !levelId || unchanged || (noteRequired && !note.trim())}
          onClick={async () => { if (await run(() => adminApi.setAcademicLevel(p.id, levelId, note.trim() || undefined), 'Niveau académique enregistré.')) onChanged(); }}
        >
          Valider ce niveau
        </Btn>
        {p.academicLevel && (
          <Btn
            tone="danger"
            disabled={busy}
            onClick={async () => { if (await run(() => adminApi.revokeAcademicLevel(p.id), 'Validation retirée.')) { setLevelId(''); setNote(''); onChanged(); } }}
          >
            Retirer la validation
          </Btn>
        )}
      </div>
    </Section>
  );
};
