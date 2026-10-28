import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { adminApi } from '../../lib/api';
import { useAction, useAsync } from '../../lib/hooks';
import { formatDate, fullName } from '../../lib/labels';
import type { AdminRoomReview } from '../../types';
import { Badge, Btn, Card, Empty, ErrorBox, Loading, Segmented } from '../ui/kit';
import { ConfirmModal } from '../ui/ConfirmModal';

type Filter = 'visible' | 'hidden' | 'all';

export const RoomReviewsView: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [filter, setFilter] = useState<Filter>('visible');
  const [hiding, setHiding] = useState<AdminRoomReview | null>(null);
  const { run, busy } = useAction();
  const reviews = useAsync(() => adminApi.roomReviews(filter === 'all' ? undefined : filter === 'hidden'), [filter, refreshKey]);

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'visible', label: 'Visibles' }, { value: 'hidden', label: 'Masqués' }, { value: 'all', label: 'Tous' }]} />
      </Card>

      {reviews.error && <ErrorBox message={reviews.error} onRetry={reviews.reload} />}

      {reviews.loading && !reviews.data ? <Loading /> : !reviews.data || reviews.data.length === 0 ? (
        <Card><Empty>Aucun avis.</Empty></Card>
      ) : (
        <div className="space-y-3">
          {reviews.data.map((r) => (
            <Card key={r.id} className="p-5 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-white">{r.room.name}</p>
                  <p className="text-xs text-slate-400">{fullName(r.author)} · {formatDate(r.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-sm text-amber-300"><Star className="w-4 h-4 fill-amber-300" />{r.overall}/5</span>
                  {r.hiddenAt && <Badge tone="rose">Masqué le {formatDate(r.hiddenAt)}</Badge>}
                </div>
              </div>
              {r.comment ? <p className="text-sm text-slate-200 whitespace-pre-line">{r.comment}</p> : <p className="text-sm text-slate-500">Sans commentaire.</p>}
              {r.partnerReply && <p className="text-xs p-3 rounded-xl bg-white/5 border border-white/10 text-slate-300"><strong>Réponse du partenaire :</strong> {r.partnerReply}</p>}
              {r.hiddenReason && <p className="text-xs text-rose-300">Motif du masquage : {r.hiddenReason}</p>}
              <div>
                {r.hiddenAt
                  ? <Btn small tone="success" disabled={busy} onClick={async () => { if (await run(() => adminApi.unhideRoomReview(r.id), 'Avis rétabli.')) reviews.reload(); }}>Rétablir l’avis</Btn>
                  : <Btn small tone="danger" disabled={busy} onClick={() => setHiding(r)}>Masquer</Btn>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {hiding && (
        <ConfirmModal
          title="Masquer cet avis"
          variant="danger"
          confirmLabel="Masquer"
          busy={busy}
          description="À réserver aux avis frauduleux, offensants ou contenant des informations privées. La moyenne de la salle est recalculée."
          noteLabel="Motif"
          onCancel={() => setHiding(null)}
          onConfirm={async (reason) => {
            if (await run(() => adminApi.hideRoomReview(hiding.id, reason), 'Avis masqué.')) { setHiding(null); reviews.reload(); }
          }}
        />
      )}
    </div>
  );
};
