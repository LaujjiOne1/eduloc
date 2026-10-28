import { type Href, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AlertTriangleIcon, CalendarIcon, ClockIcon, HouseIcon, LocationIcon, MicIcon, VideoIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { StepProgress } from "@/components/ui/step-progress";
import * as F from "@/api/format/datetime";
import { countdownLabel, useBookingQuote } from "@/hooks/use-booking-quote";
import { useCreateBooking } from "@/hooks/use-create-booking";
import { useDevicePosition } from "@/hooks/use-device-position";
import { useBookingWizardStore } from "@/store/booking-wizard.store";
import type { BookingPricing, BookingRequest, TeachingModeId } from "@/types/booking";
import { useTranslation } from "react-i18next";
import { t as tr } from "@/i18n";

const BOOKING_PENDING_ROUTE = "/booking-pending" as Href;
const BOOK_DATE_ROUTE = "/results/book" as Href;
const BENEFICIARY_PROFILE_ROUTE = "/beneficiary-profile" as Href;

const OBJECTIVE_LABELS: Record<string, string> = {
  get remedial() { return tr("common.catchUp"); },
  get ongoing() { return tr("common.regularSupport"); },
  get excellence() { return tr("common.goDeeper"); },
};

/** Derives the booking's teaching mode from the chosen slot's place — every
 * slot shown on BookDate already comes from one specific availability/place,
 * so no separate "teaching mode" picker is needed (AGENTS.md §11). */
function resolveTeachingMode(placeId: string | null, places: { id: string; type: string }[]): TeachingModeId {
  if (!placeId) return "online";
  const place = places.find((p) => p.id === placeId);
  if (place?.type === "online") return "online";
  if (place?.type === "tutor_home") return "at_home_tutor";
  if (place?.type === "beneficiary_home") return "at_home_beneficiary";
  return "public_place";
}

export function BookingSummaryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const offer = useBookingWizardStore((s) => s.offer);
  const slot = useBookingWizardStore((s) => s.slot);
  const choice = useBookingWizardStore((s) => s.choice);
  const beneficiary = useBookingWizardStore((s) => s.beneficiary);
  const beneficiaryAddress = useBookingWizardStore((s) => s.beneficiaryAddress);
  const setBeneficiaryAddress = useBookingWizardStore((s) => s.setBeneficiaryAddress);
  const setCreatedBookingId = useBookingWizardStore((s) => s.setCreatedBookingId);
  const idempotencyKey = useBookingWizardStore((s) => s.idempotencyKey);
  const note = useBookingWizardStore((s) => s.note);
  const objective = useBookingWizardStore((s) => s.objective);
  const { state, submit } = useCreateBooking();
  const position = useDevicePosition();

  // Guard: a full recap needs an offer, a slot, and a chosen beneficiary —
  // i.e. BookDate + Beneficiary must both be completed already.
  const hasContext = !!offer && !!slot && !!beneficiary;

  useEffect(() => {
    if (!hasContext) router.replace("/home");
  }, [hasContext, router]);

  // Le serveur calcule le mode de chaque créneau d'après son lieu : on réserve exactement ce qui a été affiché.
  const teachingMode: TeachingModeId | null = offer && slot ? (slot.teachingMode ?? resolveTeachingMode(slot.placeId, offer.places)) : null;
  const needsAddress = teachingMode === "at_home_beneficiary";
  const isRoom = teachingMode === "partner_room";
  const room = isRoom ? choice.room : null;
  // Une salle partenaire sans salle choisie ne peut pas être demandée : on revient au choix du rendez-vous.
  const roomMissing = isRoom && !room;
  const latitude = position.state.status === "ready" ? position.state.latitude : null;
  const longitude = position.state.status === "ready" ? position.state.longitude : null;

  // Demande complète (hors note et clé d'idempotence) : sert au devis, qui bloque le créneau 15 minutes côté serveur.
  const quoteRequest = useMemo<BookingRequest | null>(() => {
    if (!offer || !slot || !beneficiary || !teachingMode) return null;
    if ((needsAddress && beneficiaryAddress.trim().length === 0) || roomMissing) return null;
    return {
      offerId: offer.id,
      slot: { availabilityId: slot.availabilityId, startAt: slot.startAt, placeId: slot.placeId },
      beneficiaryId: beneficiary.id,
      teachingMode,
      beneficiaryAddress: needsAddress ? beneficiaryAddress.trim() : undefined,
      beneficiaryCoordinates: needsAddress && latitude !== null && longitude !== null ? { latitude, longitude } : undefined,
      roomId: room?.id,
      durationMinutes: choice.durationMinutes ?? undefined,
      participantsCount: isRoom ? choice.participantsCount : undefined,
      requiredEquipment: isRoom && choice.requiredEquipment.length ? choice.requiredEquipment : undefined,
    };
  }, [offer, slot, beneficiary, teachingMode, needsAddress, beneficiaryAddress, roomMissing, latitude, longitude, room?.id, choice.durationMinutes, choice.participantsCount, choice.requiredEquipment, isRoom]);
  const quote = useBookingQuote(quoteRequest);
  const refreshQuote = quote.refresh;

  // Le blocage a expiré : on en redemande un (le serveur revérifie créneau, salle et prix).
  useEffect(() => {
    if (quote.expired) void refreshQuote();
  }, [quote.expired, refreshQuote]);

  if (!hasContext || !offer || !slot || !beneficiary || !teachingMode) return null;

  const isSubmitting = state.status === "loading";
  // Lieu et format viennent du CRÉNEAU choisi (pas de l'offre, qui peut proposer les deux formats).
  const slotPlace = offer.places.find((p) => p.id === slot.placeId);
  const FormatIcon = teachingMode === "online" ? VideoIcon : HouseIcon;
  const formatLabel = teachingMode === "online" ? t("common.online") : isRoom ? t("booking.bookingSummary.inPersonPartnerRoom") : t("common.inPerson");
  const placeLabel = room
    ? [room.name, room.zoneLabel].filter(Boolean).join(" — ")
    : teachingMode === "online"
      ? t("booking.bookingSummary.onlineVideoCall")
      : teachingMode === "at_home_beneficiary"
        ? tr("booking.bookingSummary.atYourHome") + (slotPlace ? ` · ${slotPlace.label}` : "")
        : (slotPlace?.label ?? offer.location);

  // Le bouton n'est actif que si le prix est connu et le créneau bloqué : « montant unique avant confirmation ».
  const readyQuote = quote.state.status === "ready" && !quote.expired ? quote.state.quote : null;
  const canSubmit = !!readyQuote && !!quoteRequest;

  const sendRequest = async () => {
    if (isSubmitting || !readyQuote || !quoteRequest) return;
    const booking = await submit({
      ...quoteRequest,
      idempotencyKey: idempotencyKey || undefined,
      note: note.trim() || undefined,
      holdId: readyQuote.holdId,
    });
    if (booking) {
      setCreatedBookingId(booking.id);
      router.push(BOOKING_PENDING_ROUTE);
    } else {
      // Ressource prise ou prix modifié entre-temps : le blocage a été libéré, on recalcule pour afficher l'état réel.
      void refreshQuote();
    }
  };

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <StepProgress step={3} total={3} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={40}>
          <Text className="mb-[18px] text-[24px] font-bold text-ink">{t("booking.bookingSummary.yourRequest")}</Text>
        </FadeIn>

        <FadeIn delay={80}>
          <View className="rounded-lg border border-line bg-surface p-4">
            <SummaryRow label={t("common.tutor")} value={offer.tutorName} />
            <Divider />
            <SummaryRow label={t("booking.bookingSummary.lesson")} value={offer.title} />
            <Divider />
            <SummaryRow label={t("common.beneficiary")} value={beneficiary.isSelf ? "Vous" : beneficiary.firstName} />
            <Divider />
            <SummaryRow label={t("common.goal")} value={OBJECTIVE_LABELS[objective] ?? "—"} />
            <Divider />
            <SummaryRow label={t("common.date")} value={slot.dateLabel} icon={<CalendarIcon size={15} color="#9799AF" />} />
            <Divider />
            <SummaryRow label={t("common.schedule")} value={slot.timeRangeLabel} icon={<ClockIcon size={15} color="#9799AF" />} />
            <Divider />
            <SummaryRow label={t("common.duration3")} value={F.durationLongLabel(choice.durationMinutes ?? offer.durationMinutes)} />
            <Divider />
            <SummaryRow label={t("common.place")} value={placeLabel} icon={<LocationIcon size={15} color="#9799AF" />} />
            <Divider />
            <SummaryRow
              label={t("common.format")}
              value={formatLabel}
              icon={<FormatIcon size={15} color="#9799AF" />}
            />
            {room ? (
              <>
                <Divider />
                <SummaryRow label={t("common.participants")} value={String(choice.participantsCount)} />
                {room.pricePerHourLabel ? (
                  <>
                    <Divider />
                    <SummaryRow label={t("booking.bookingSummary.roomFee")} value={room.pricePerHourLabel} />
                  </>
                ) : null}
              </>
            ) : null}
          </View>
        </FadeIn>

        {isRoom ? (
          <FadeIn delay={95}>
            <View className="mt-[14px] flex-row gap-3 rounded-lg border border-line bg-paper-alt p-4">
              <AlertTriangleIcon size={18} color="#BD7E28" />
              <Text className="flex-1 text-[12.5px] leading-[19px] text-ink-soft">
                {t("booking.bookingSummary.thisSlotAndThisRoom")}</Text>
            </View>
          </FadeIn>
        ) : null}

        {needsAddress ? (
          <FadeIn delay={100}>
            <View className="mt-[14px]">
              <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
                {t("booking.bookingSummary.beneficiarySAddress")}</Text>
              <TextInput
                value={beneficiaryAddress}
                onChangeText={setBeneficiaryAddress}
                placeholder={t("booking.bookingSummary.theTutorTravelsToYou")}
                placeholderTextColor="#9799AF"
                className="rounded-sm border border-line bg-surface px-[14px] py-[13px] text-[15px] text-ink"
                accessibilityLabel={t("booking.bookingSummary.beneficiarySAddress")}
              />
              {position.state.status === "ready" ? (
                <Text className="mt-[6px] ml-0.5 text-[12px] text-ink-soft">{t("booking.bookingSummary.approximatePositionSharedToCalculate")}</Text>
              ) : (
                <PressableScale onPress={() => void position.request()} accessibilityLabel={t("booking.bookingSummary.shareMyApproximatePosition")}>
                  <Text className="mt-[8px] ml-0.5 text-[13px] font-bold text-primary">
                    {position.state.status === "loading" ? t("booking.bookingSummary.locating") : t("booking.bookingSummary.shareMyApproximatePosition")}
                  </Text>
                  {position.state.status === "unavailable" ? (
                    <Text className="mt-[2px] ml-0.5 text-[12px] text-ink-soft">{position.state.message}</Text>
                  ) : null}
                </PressableScale>
              )}
            </View>
          </FadeIn>
        ) : null}

        <FadeIn delay={110}>
          <PriceCard
            status={quote.state.status}
            pricing={quote.state.status === "ready" ? quote.state.quote.pricing : null}
            secondsLeft={quote.secondsLeft}
            error={quote.state.status === "error" ? quote.state.message : null}
            onRetry={() => void refreshQuote()}
            waitingForAddress={needsAddress && beneficiaryAddress.trim().length === 0}
          />
        </FadeIn>

        <FadeIn delay={120}>
          <PressableScale onPress={() => router.push(BENEFICIARY_PROFILE_ROUTE)} accessibilityLabel={t("booking.bookingSummary.editYourNeed")}>
            <View className="mt-[14px] flex-row items-center gap-3 rounded-lg border border-line bg-surface p-4">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-accent-tint">
                <MicIcon size={16} color="#0E9C82" />
              </View>
              <View className="flex-1">
                <Text className="text-[12px] text-ink-soft">{t("common.need")}</Text>
                <Text className="text-[14px] font-bold text-ink" numberOfLines={2}>
                  {note.trim() ? note.trim() : t("common.noDetailsAdded")}
                </Text>
              </View>
              <Text className="text-[12.5px] font-bold text-primary">{t("common.edit")}</Text>
            </View>
          </PressableScale>
        </FadeIn>

        <FadeIn delay={150}>
          <PressableScale onPress={() => router.push(BOOK_DATE_ROUTE)} accessibilityLabel={t("booking.bookingSummary.editTheDateAndTime")}>
            <Text className="mt-4 text-center text-[14px] font-bold text-primary">{t("common.edit")}</Text>
          </PressableScale>
        </FadeIn>

        {state.status === "error" ? (
          <View className="mt-4">
            <FormError message={state.message} />
          </View>
        ) : null}
      </ScrollView>

      <View
        className="border-t border-line-soft bg-surface px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 22) }}
      >
        <Button
          label={t("booking.bookingSummary.sendTheRequest")}
          loading={isSubmitting}
          loadingLabel={t("common.sending")}
          disabled={isSubmitting || !canSubmit}
          onPress={sendRequest}
        />
      </View>
    </View>
  );
}

function PriceCard({
  status, pricing, secondsLeft, error, onRetry, waitingForAddress,
}: {
  status: "idle" | "loading" | "error" | "ready";
  pricing: BookingPricing | null;
  secondsLeft: number | null;
  error: string | null;
  onRetry: () => void;
  waitingForAddress: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View className="mt-[14px] rounded-lg border border-line bg-surface p-4">
      <Text className="mb-1 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("booking.bookingSummary.priceBreakdown")}</Text>
      {pricing ? (
        <>
          {pricing.lines.map((line, index) => (
            <View key={line.key}>
              {index > 0 ? <Divider /> : null}
              <SummaryRow label={line.label} value={line.amountLabel} />
            </View>
          ))}
          <Divider />
          <View className="flex-row items-center justify-between py-[11px]">
            <Text className="text-[14.5px] font-bold text-ink">{t("booking.bookingSummary.totalToPay")}</Text>
            <Text className="text-[16px] font-bold text-ink" accessibilityLabel={t("booking.bookingSummary.totalToPay2", { totalLabel: pricing.totalLabel })}>{pricing.totalLabel}</Text>
          </View>
          {secondsLeft !== null ? (
            <Text className="text-[12px] text-ink-soft">
              {t("booking.bookingSummary.slotHeldForYouFor", { countdownLabel: countdownLabel(secondsLeft), serviceFeeRatePercent: pricing.serviceFeeRatePercent })}</Text>
          ) : null}
        </>
      ) : status === "loading" ? (
        <Text className="py-[11px] text-[13.5px] text-ink-soft">{t("booking.bookingSummary.calculatingThePrice")}</Text>
      ) : error ? (
        <View className="py-[6px]">
          <FormError message={error} />
          <PressableScale onPress={onRetry} accessibilityLabel={t("booking.bookingSummary.recalculateThePrice")}>
            <Text className="mt-2 text-[13.5px] font-bold text-primary">{t("common.tryAgain")}</Text>
          </PressableScale>
        </View>
      ) : (
        <Text className="py-[11px] text-[13.5px] text-ink-soft">
          {waitingForAddress ? t("booking.bookingSummary.enterTheAddressToCalculate") : t("booking.bookingSummary.thePriceWillBeShown")}
        </Text>
      )}
    </View>
  );
}

function Divider() {
  return <View className="h-px bg-line-soft" />;
}

function SummaryRow({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between py-[11px]">
      <Text className="text-[13.5px] text-ink-soft">{label}</Text>
      <View className="flex-row items-center gap-[6px]">
        <Text className="text-[14px] font-bold text-ink">{value}</Text>
        {icon}
      </View>
    </View>
  );
}
