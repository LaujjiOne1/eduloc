/**
 * Vérifie le temps réel de bout en bout avec le VRAI client du front (src/realtime) :
 * le tuteur accepte une demande → le demandeur reçoit « booking.confirmed » sur son canal personnel
 * (outbox → Centrifugo → WebSocket), sans rien recharger.
 *
 *   EXPO_PUBLIC_API_URL=http://localhost:3003/api npx tsx scripts/realtime-e2e.ts
 */
process.env.EXPO_PUBLIC_API_MODE = "http";

import { api } from "@/api/http";
import { Session } from "@/api/session";
import { Realtime, type RealtimeEvent } from "@/realtime/realtime-client";

let failed = 0;
const ok = (cond: unknown, label: string, extra?: unknown) => {
  if (!cond) failed += 1;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`, cond || extra === undefined ? "" : JSON.stringify(extra).slice(0, 300));
};

interface Login { accessToken: string; refreshToken: string; refreshExpiresAt: string; user: { id: string } }
const login = (email: string, password: string) => api.post<Login>("/auth/login", { email, password }, { auth: false });
const as = (token: string) => ({ headers: { Authorization: `Bearer ${token}` }, auth: false });

async function waitFor<T>(poll: () => T | undefined, ms: number): Promise<T | undefined> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = poll();
    if (value !== undefined) return value;
    await new Promise((r) => setTimeout(r, 150));
  }
  return undefined;
}

async function main() {
  const requester = await login("demo@eduloc.mg", "Demo12345!");
  const tutor = await login("hery.rasolofo@demo.eduloc.mg", "Demo12345!");
  await Session.setTokens({ accessToken: requester.accessToken, refreshToken: requester.refreshToken, refreshExpiresAt: requester.refreshExpiresAt });

  const events: RealtimeEvent[] = [];
  Realtime.subscribe((event) => events.push(event));
  await Realtime.connect(requester.user.id);
  await new Promise((r) => setTimeout(r, 1500)); // souscription établie
  ok(true, "connexion Centrifugo établie (jeton obtenu via /realtime/connection-token)");

  // Le demandeur envoie une demande à Hery ; Hery l'accepte.
  const subjects = await api.get<{ id: string; name: string }[]>("/catalog/subjects", undefined, { auth: false });
  const french = subjects.find((s) => s.name === "Français")!;
  const search = await api.get<{ offers: { id: string }[]; tutor: { displayName: string } }[]>(
    "/search/offers", { subjectId: french.id, format: "ONLINE" }, { auth: false },
  );
  const hery = search.find((r) => r.tutor.displayName?.includes("Hery"))!;
  const offerId = hery.offers[0].id;
  const tutorId = (await api.get<{ tutor: { id: string } }[]>("/search/offers", { subjectId: french.id, format: "ONLINE" }, { auth: false }))[0].tutor.id;
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const slots = await api.get<{ startAt: string; teachingMode: string; placeId: string | null }[]>(
    `/search/tutors/${tutorId}/slots`, { offerId, from, to, duration: 60 }, { auth: false },
  );
  const slot = slots[slots.length - 1];
  const beneficiaries = await api.get<{ id: string }[]>("/beneficiaries", undefined, as(requester.accessToken));
  const booking = await api.post<{ id: string }>(
    "/bookings",
    { offerId, beneficiaryId: beneficiaries[0].id, startAt: slot.startAt, teachingMode: slot.teachingMode, placeId: slot.placeId ?? undefined },
    as(requester.accessToken),
  );

  const requested = await api.get<{ id: string }[]>("/bookings", { role: "tutor", status: "PENDING" }, as(tutor.accessToken));
  ok(requested.some((b) => b.id === booking.id), "la demande est visible côté tuteur");

  await api.post(`/bookings/${booking.id}/accept`, undefined, as(tutor.accessToken));
  const confirmed = await waitFor(() => events.find((e) => e.type === "booking.confirmed" && e.payload.bookingId === booking.id), 12_000);
  ok(!!confirmed, "le demandeur reçoit « booking.confirmed » en direct (< 12 s)", events.map((e) => e.type));
  ok(!!confirmed?.eventId, "l'événement porte un eventId (dédoublonnage)", confirmed);

  // Nettoyage : on annule pour ne pas laisser de séance confirmée dans les données de démo.
  await api.post(`/bookings/${booking.id}/cancel`, { reason: "Test automatisé" }, as(requester.accessToken)).catch(() => undefined);
  Realtime.disconnect();

  console.log(`\n${failed === 0 ? "✅ temps réel OK" : "❌ temps réel en échec"}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("ÉCHEC INATTENDU :", error);
  process.exit(2);
});
