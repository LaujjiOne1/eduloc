import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CheckIcon, ClockIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { type DayMarkers, HabitCalendar } from "@/components/ui/habit-calendar";
import { useOfferSlots } from "@/hooks/use-offer-slots";
import { useBookingOptions } from "@/hooks/use-booking-options";
import { useDevicePosition } from "@/hooks/use-device-position";
import { useRoomDaySlots } from "@/hooks/use-room-day-slots";
import { DurationPicker } from "@/components/booking/duration-picker";
import { RoomPicker } from "@/components/booking/room-picker";
import { Chip } from "@/components/ui/chip";
import { TeachingModePicker } from "@/components/booking/teaching-mode-picker";
import { offerTeachingModes, slotTeachingMode } from "@/lib/teaching-mode";
import { toIsoDate } from "@/lib/week";
import { useAuthStore } from "@/store/auth.store";
import { useBookingWizardStore } from "@/store/booking-wizard.store";
import type { TeachingModeId } from "@/types/booking";
import type { OfferSlot } from "@/types/offer";
import { formatDayLabel } from "@/utils/calendar";
import { useTranslation } from "react-i18next";

// Existing routes — Login already exists (src/app/login.tsx); Beneficiary is
// built by this same task (src/app/beneficiary.tsx).
const LOGIN_ROUTE = "/login" as Href;
const BENEFICIARY_ROUTE = "/beneficiary" as Href;

/**
 * Choix du rendez-vous : le calendrier (semaine glissante, extensible en mois) montre les jours avec des
 * créneaux ; on choisit une date, on voit ses créneaux, puis on en choisit un. C'est le SEUL écran de choix de
 * créneau du parcours de réservation (la fiche de l'offre n'en propose plus).
 */
export function BookDateScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const offer = useBookingWizardStore((s) => s.offer);
  const preselectedSlot = useBookingWizardStore((s) => s.slot);
  const preselectedChoice = useBookingWizardStore((s) => s.choice);
  const setBooking = useBookingWizardStore((s) => s.setBooking);

  const position = useDevicePosition();
  const near = position.state.status === "ready" ? position.state : null;
  const { state: optionsState, retry: retryOptions } = useBookingOptions(offer?.id ?? null, near);
  const options = optionsState.status === "ready" ? optionsState.options : null;
  const durations = options?.durations ?? [];
  const minNoticeHours = options?.minNoticeHours ?? 12;

  // Durée choisie parmi celles configurées par le tuteur ; null = durée par défaut de l'offre.
  const [durationMinutes, setDurationMinutes] = useState<number | null>(preselectedChoice.durationMinutes);
  const effectiveDuration = durationMinutes ?? offer?.durationMinutes ?? null;
  const { slots, loading, error, ensureRange, retry } = useOfferSlots(offer, effectiveDuration);
  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const places = useMemo(() => offer?.places ?? [], [offer]);
  // « Salle partenaire » vient du serveur (salles ACCEPTÉES par le tuteur et réservables), pas des lieux du tuteur.
  const availableModes = useMemo(() => {
    const base = offerTeachingModes(places).filter((m) => m !== "partner_room");
    return options?.modes.includes("partner_room") ? [...base, "partner_room" as const] : base;
  }, [places, options]);

  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(preselectedSlot?.id ?? null);
  const [isNavigating, setIsNavigating] = useState(false);
  // Où se déroule le cours : le choix filtre les créneaux. Un seul mode proposé par le tuteur → retenu d'office.
  const [mode, setMode] = useState<TeachingModeId | null>(
    preselectedSlot
      ? slotTeachingMode(preselectedSlot, places)
      : availableModes.length === 1
        ? availableModes[0]
        : null,
  );
  const isRoomMode = mode === "partner_room";
  // Les salles se classent de la plus proche à la plus éloignée : on demande la position dès que ce mode est choisi.
  const requestPosition = position.request;
  const positionIdle = position.state.status === "idle";
  useEffect(() => {
    if (isRoomMode && positionIdle) void requestPosition();
  }, [isRoomMode, positionIdle, requestPosition]);
  const [roomId, setRoomId] = useState<string | null>(preselectedChoice.room?.id ?? null);
  const room = options?.rooms.find((r) => r.id === roomId) ?? null;
  const [participants, setParticipants] = useState(preselectedChoice.participantsCount);
  const [equipment, setEquipment] = useState<string[]>(preselectedChoice.requiredEquipment);

  useFocusEffect(
    useCallback(() => {
      setIsNavigating(false);
    }, []),
  );

  const chooseMode = (next: TeachingModeId) => {
    if (next === mode) return;
    setMode(next);
    setSelectedSlotId(null);
    setPickedDate(null);
  };

  const chooseRoom = (id: string) => {
    if (id === roomId) return;
    setRoomId(id);
    setSelectedSlotId(null);
    // Effectif et équipements dépendent de la salle : on repart d'une base valide.
    setParticipants(1);
    setEquipment([]);
  };

  const chooseDuration = (minutes: number) => {
    if (minutes === effectiveDuration) return;
    setDurationMinutes(minutes);
    setSelectedSlotId(null);
  };

  const toggleEquipment = (item: string) =>
    setEquipment((current) => (current.includes(item) ? current.filter((e) => e !== item) : [...current, item]));

  // Salle partenaire : créneaux d'UNE date, calculés par le serveur (tuteur ∩ salle, préavis, marges).
  const roomDay = useRoomDaySlots({
    offerId: offer?.id ?? null,
    // Même règle que `selectedDate` ci-dessous : la date affichée est celle dont on charge les créneaux.
    date: pickedDate ?? (preselectedSlot && slotTeachingMode(preselectedSlot, places) === "partner_room" ? preselectedSlot.date : null) ?? todayIso,
    mode,
    roomId,
    durationMinutes: effectiveDuration,
  });

  // Jours avec au moins un créneau libre dans le mode choisi → pastille sur le calendrier.
  const availableSlots = useMemo(
    () =>
      isRoomMode
        ? []
        : slots.filter((s) => s.status === "available" && mode !== null && slotTeachingMode(s, places) === mode),
    [slots, mode, places, isRoomMode],
  );
  const markers = useMemo(() => {
    const out: Record<string, DayMarkers> = {};
    for (const slot of availableSlots) out[slot.date] = { availability: true };
    return out;
  }, [availableSlots]);
  const firstAvailableDate = availableSlots.length > 0 ? availableSlots.map((s) => s.date).sort()[0] : null;

  // Date affichée : celle que le demandeur a choisie, sinon celle d'un créneau déjà retenu, sinon la première
  // disponible, sinon aujourd'hui.
  const preselectedDate = preselectedSlot && slotTeachingMode(preselectedSlot, places) === mode ? preselectedSlot.date : null;
  const selectedDate = pickedDate ?? preselectedDate ?? firstAvailableDate ?? todayIso;
  const daySlots = useMemo(
    () =>
      isRoomMode
        ? roomDay.slots
        : slots.filter((s) => s.date === selectedDate && mode !== null && slotTeachingMode(s, places) === mode),
    [slots, selectedDate, mode, places, isRoomMode, roomDay.slots],
  );
  const slotsLoading = isRoomMode ? roomDay.loading : loading && slots.length === 0;
  const slotsError = isRoomMode ? roomDay.error : error;
  const retrySlots = isRoomMode ? roomDay.retry : retry;
  const selectedSlot = daySlots.find((s) => s.id === selectedSlotId) ?? null;
  const nextDate = useMemo(
    () => availableSlots.map((s) => s.date).filter((d) => d > selectedDate).sort()[0] ?? null,
    [availableSlots, selectedDate],
  );

  // Guard: BookDate only makes sense once an offer has been picked
  // (OfferDetail's "Choisir un créneau" sets it before navigating here).
  // Reaching this route without that context — e.g. a stale deep link —
  // bounces to Home instead of rendering a broken screen (AGENTS.md §13).
  useEffect(() => {
    if (!offer) router.replace("/home");
  }, [offer, router]);

  if (!offer) return null;

  const canReserve =
    !!selectedSlot && selectedSlot.status === "available" && !isNavigating && (!isRoomMode || !!room);

  const pickDate = (iso: string) => {
    setPickedDate(iso);
    setSelectedSlotId(null);
  };

  const reserve = () => {
    if (!canReserve || !selectedSlot) return;
    setIsNavigating(true);
    setBooking(offer, selectedSlot, {
      durationMinutes: effectiveDuration,
      room: isRoomMode ? room : null,
      participantsCount: isRoomMode ? participants : 1,
      requiredEquipment: isRoomMode ? equipment : [],
    });
    const authenticated = useAuthStore.getState().user !== null;
    router.push(authenticated ? BENEFICIARY_ROUTE : LOGIN_ROUTE);
  };

  const dayLabel = daySlots[0]?.dateLabel ?? formatDayLabel(selectedDate);

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={40}>
          <Text className="mb-1 text-[24px] font-bold text-ink">{t("booking.bookDate.chooseYourAppointment")}</Text>
          <Text className="mb-[18px] text-[13.5px] text-ink-soft">
            {t("booking.bookDate.with", { title: offer.title, tutorName: offer.tutorName })}
          </Text>
        </FadeIn>

        <FadeIn delay={60}>
          <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
            {t("booking.bookDate.whereWouldYouLikeThe")}</Text>
          {availableModes.length === 0 ? (
            optionsState.status === "loading" ? (
              <View className="h-[64px] rounded-lg bg-line-soft" />
            ) : (
              <Text className="text-[13.5px] text-ink-soft">{t("booking.bookDate.thisTutorHasNotYet")}</Text>
            )
          ) : (
            <TeachingModePicker available={availableModes} value={mode} onChange={chooseMode} />
          )}
          {optionsState.status === "error" ? (
            <View className="mt-2 flex-row items-center gap-3">
              <Text className="flex-1 text-[12.5px] text-error">{t("booking.bookDate.thePartnerRoomsCouldNot")}</Text>
              <PressableScale onPress={retryOptions} accessibilityLabel={t("common.tryAgain")}>
                <Text className="text-[13px] font-semibold text-primary">{t("common.tryAgain")}</Text>
              </PressableScale>
            </View>
          ) : null}
        </FadeIn>

        {isRoomMode && options ? (
          <FadeIn delay={70}>
            <View className="mt-[20px]">
              <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
                {t("booking.bookDate.whichRoom")}</Text>
              {position.state.status === "loading" ? (
                <Text className="mb-2 text-[12.5px] text-ink-soft">{t("booking.bookDate.calculatingDistances")}</Text>
              ) : position.state.status === "unavailable" ? (
                <View className="mb-3 flex-row items-center gap-3">
                  <Text className="flex-1 text-[12.5px] leading-[18px] text-ink-soft">
                    {t("booking.bookDate.distancesUnavailable", { message: position.state.message })}
                  </Text>
                  <PressableScale onPress={() => void position.request()} accessibilityLabel={t("booking.bookDate.retryThePosition")}>
                    <Text className="text-[13px] font-semibold text-primary">{t("common.tryAgain")}</Text>
                  </PressableScale>
                </View>
              ) : near ? (
                <Text className="mb-2 text-[12.5px] text-ink-soft">{t("booking.bookDate.sortedFromNearestToFarthest")}</Text>
              ) : null}
              <RoomPicker rooms={options.rooms} value={roomId} onChange={chooseRoom} />
              {room ? (
                <View className="mt-4 gap-3">
                  <View className="flex-row items-center justify-between rounded-lg border border-line bg-surface p-4">
                    <Text className="text-[14px] font-semibold text-ink">{t("common.participants")}</Text>
                    <View className="flex-row items-center gap-4">
                      <PressableScale
                        onPress={() => setParticipants((n) => Math.max(1, n - 1))}
                        disabled={participants <= 1}
                        accessibilityLabel={t("booking.bookDate.oneParticipantLess")}
                      >
                        <Text className="text-[22px] font-bold text-primary">−</Text>
                      </PressableScale>
                      <Text className="min-w-[24px] text-center text-[16px] font-bold text-ink">{participants}</Text>
                      <PressableScale
                        onPress={() => setParticipants((n) => Math.min(room.capacity, n + 1))}
                        disabled={participants >= room.capacity}
                        accessibilityLabel={t("booking.bookDate.oneParticipantMore")}
                      >
                        <Text className="text-[22px] font-bold text-primary">+</Text>
                      </PressableScale>
                    </View>
                  </View>
                  {room.equipment.length > 0 ? (
                    <View>
                      <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
                        {t("booking.bookDate.requiredEquipmentOptional")}</Text>
                      <View className="flex-row flex-wrap gap-2">
                        {room.equipment.map((item) => (
                          <Chip key={item} label={item} active={equipment.includes(item)} onPress={() => toggleEquipment(item)} />
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </FadeIn>
        ) : null}

        {mode !== null && durations.length > 1 ? (
          <FadeIn delay={75}>
            <View className="mt-[20px]">
              <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
                {t("common.duration3")}</Text>
              <DurationPicker durations={durations} value={effectiveDuration} onChange={chooseDuration} />
            </View>
          </FadeIn>
        ) : null}

        {mode === null || (isRoomMode && !room) ? null : (
        <>
        <FadeIn delay={80}>
          <View className="mt-[20px]" />
          <HabitCalendar
            variant="card"
            selectedDate={selectedDate}
            onSelectDate={pickDate}
            markers={markers}
            minDate={todayIso}
            onViewChange={ensureRange}
          />
          {isRoomMode ? (
            <Text className="mt-2.5 px-1 text-[12px] text-ink-soft">
              {t("booking.bookDate.chooseADateTheRoom")}</Text>
          ) : (
            <View className="mt-2.5 flex-row items-center gap-2 px-1">
              <View className="h-[7px] w-[7px] rounded-full bg-accent" />
              <Text className="text-[12px] text-ink-soft">{t("booking.bookDate.daysWithAvailableSlots")}</Text>
            </View>
          )}
        </FadeIn>

        <FadeIn delay={120}>
          <View className="mt-[20px]">
            <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
              {t("booking.bookDate.slots", { value: dayLabel.charAt(0).toLowerCase() + dayLabel.slice(1) })}
            </Text>
            {slotsError ? (
              <View className="flex-row items-center gap-3">
                <Text className="flex-1 text-[13.5px] text-error">{slotsError}</Text>
                <PressableScale onPress={retrySlots} accessibilityLabel={t("common.tryAgain")}>
                  <Text className="text-[13.5px] font-semibold text-primary">{t("common.tryAgain")}</Text>
                </PressableScale>
              </View>
            ) : slotsLoading ? (
              <View className="gap-[10px]">
                {[0, 1].map((i) => (
                  <View key={i} className="h-[56px] rounded-lg bg-line-soft" />
                ))}
              </View>
            ) : daySlots.length === 0 ? (
              <View className="rounded-lg border border-line bg-surface p-4">
                <Text className="text-[13.5px] text-ink-soft">
                  {isRoomMode
                    ? t("booking.bookDate.noSlotsThatDayIn")
                    : slots.length === 0 && !loading
                      ? t("booking.bookDate.noSlotsAvailableAtThe")
                      : t("booking.bookDate.noSlotsThatDay")}
                </Text>
                {nextDate ? (
                  <PressableScale onPress={() => pickDate(nextDate)} accessibilityLabel={t("booking.bookDate.goToTheNextAvailability")}>
                    <Text className="mt-2 text-[13.5px] font-bold text-primary">
                      {t("booking.bookDate.nextAvailability", { toLowerCase: formatDayLabel(nextDate).toLowerCase() })}</Text>
                  </PressableScale>
                ) : null}
              </View>
            ) : (
              <View className="gap-[10px]">
                {daySlots.map((slot) => (
                  <TimeSlotRow
                    key={slot.id}
                    slot={slot}
                    selected={slot.id === selectedSlotId}
                    onPress={() => setSelectedSlotId(slot.id)}
                  />
                ))}
              </View>
            )}
          </View>
        </FadeIn>
        </>
        )}

        <FadeIn delay={160}>
          <Text className="mt-4 text-[12px] leading-[18px] text-ink-faint">
            {t("booking.bookDate.availabilityIsCheckedByEduloc", { minNoticeHours, value: isRoomMode
              ? t("booking.bookDate.choosingARoomDoesNot")
              : "" })}
          </Text>
        </FadeIn>
      </ScrollView>

      <View
        className="border-t border-line-soft bg-surface px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 22) }}
      >
        <Button label={t("booking.bookDate.bookThisSlot")} disabled={!canReserve} onPress={reserve} />
      </View>
    </View>
  );
}

type TimeSlotRowProps = {
  slot: OfferSlot;
  selected: boolean;
  onPress: () => void;
};

function TimeSlotRow({ slot, selected, onPress }: TimeSlotRowProps) {
  const { t } = useTranslation();
  const booked = slot.status === "unavailable";

  return (
    <PressableScale
      onPress={onPress}
      disabled={booked}
      accessibilityLabel={booked ? t("booking.bookDate.slotTaken", { range: slot.timeRangeLabel }) : slot.timeRangeLabel}
    >
      <View
        className={[
          "flex-row items-center justify-between rounded-lg border p-4",
          !booked && selected ? "border-primary bg-primary-tint" : "border-line bg-surface",
        ].join(" ")}
      >
        <View className="flex-row items-center gap-[10px]">
          <ClockIcon size={16} color={!booked && selected ? "#332E86" : "#585B78"} />
          <Text className="text-[14.5px] font-bold text-ink">{slot.timeRangeLabel}</Text>
        </View>
        {booked ? (
          <Text className="text-[12px] font-semibold text-ink-faint">{t("booking.bookDate.taken")}</Text>
        ) : selected ? (
          <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
            <CheckIcon size={11} color="#fff" />
          </View>
        ) : (
          <View className="h-5 w-5 rounded-full border-2 border-line" />
        )}
      </View>
    </PressableScale>
  );
}
