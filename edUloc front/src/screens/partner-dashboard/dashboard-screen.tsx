import { type Href, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronRightIcon, PlusIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { ToneBadge } from "@/components/ui/tone-badge";
import { usePartnerVenue } from "@/hooks/use-partner-venue";
import { PUBLICATION_LABELS, REVIEW_STATUS, SUBSCRIPTION_LABELS } from "@/lib/partner-labels";
import type { PartnerRoomSummary, PartnerVenue } from "@/types/partner";
import { useTranslation } from "react-i18next";
import { t } from "@/i18n";

const VENUE_ROUTE = "/partner-dashboard/venue" as Href;
const NEW_ROOM_ROUTE = "/partner-dashboard/rooms/new" as Href;
const SUBSCRIPTION_ROUTE = "/partner-dashboard/subscription" as Href;
const RESERVATIONS_ROUTE = "/partner-dashboard/reservations" as Href;
const MODE_CHOICE_ROUTE = "/mode-choice" as Href;
const roomRoute = (id: string) => `/partner-dashboard/rooms/${id}` as Href;

/** Tableau de bord du Gestionnaire de lieu : structure, salles (chacune avec son propre statut), offre commerciale. */
export function PartnerDashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, reload } = usePartnerVenue();
  const back = () => (router.canGoBack() ? router.back() : router.replace(MODE_CHOICE_ROUTE));

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={back} />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <Text className="mb-1 text-[25px] font-bold text-ink">{t("partnerDashboard.dashboard.partnerVenues")}</Text>
        <Text className="mb-5 text-[13.5px] leading-[20px] text-ink-soft">
          {t("partnerDashboard.dashboard.offerYourRoomsToEduloc")}</Text>

        {state.status === "loading" ? (
          <View className="gap-3">
            {[0, 1, 2].map((i) => (
              <View key={i} className="h-[84px] rounded-lg bg-line-soft" />
            ))}
          </View>
        ) : state.status === "error" ? (
          <View className="flex-row items-center gap-3">
            <Text className="flex-1 text-[13.5px] text-error">{state.message}</Text>
            <PressableScale onPress={reload} accessibilityLabel={t("common.tryAgain")}>
              <Text className="text-[13.5px] font-semibold text-primary">{t("common.tryAgain")}</Text>
            </PressableScale>
          </View>
        ) : state.venue === null ? (
          <FadeIn delay={40}>
            <View className="rounded-lg border border-line bg-surface p-5">
              <Text className="mb-2 text-[16px] font-bold text-ink">{t("partnerDashboard.dashboard.becomeAPartnerVenue")}</Text>
              <Text className="mb-4 text-[13.5px] leading-[20px] text-ink-soft">
                {t("partnerDashboard.dashboard.n1PresentYourOrganisationAnd")}</Text>
              <Button label={t("common.saveMyOrganisation")} onPress={() => router.push(VENUE_ROUTE)} />
            </View>
          </FadeIn>
        ) : (
          <VenueOverview
            venue={state.venue}
            onOpenVenue={() => router.push(VENUE_ROUTE)}
            onNewRoom={() => router.push(NEW_ROOM_ROUTE)}
            onOpenRoom={(id) => router.push(roomRoute(id))}
            onOpenSubscription={() => router.push(SUBSCRIPTION_ROUTE)}
            onOpenReservations={() => router.push(RESERVATIONS_ROUTE)}
          />
        )}
      </ScrollView>
    </View>
  );
}

function VenueOverview({
  venue,
  onOpenVenue,
  onNewRoom,
  onOpenRoom,
  onOpenSubscription,
  onOpenReservations,
}: {
  venue: PartnerVenue;
  onOpenVenue: () => void;
  onNewRoom: () => void;
  onOpenRoom: (id: string) => void;
  onOpenSubscription: () => void;
  onOpenReservations: () => void;
}) {
  const { t } = useTranslation();
  const status = REVIEW_STATUS[venue.status];
  const approved = venue.status === "approved";
  const hasApprovedRoom = venue.rooms.some((r) => r.status === "approved");
  const canChoosePlan = approved && hasApprovedRoom;

  return (
    <>
      <FadeIn delay={30}>
        <PressableScale onPress={onOpenVenue} accessibilityLabel={t("partnerDashboard.dashboard.openTheOrganisationPage")}>
          <View className="rounded-lg border border-line bg-surface p-4">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-[16px] font-bold text-ink">{venue.name}</Text>
                <Text className="mt-[2px] text-[12.5px] text-ink-soft">
                  {t("common.supportingDocumentCount", { count: venue.documents.length })}
                </Text>
              </View>
              <ToneBadge label={status.label} tone={status.tone} />
            </View>
            {venue.reviewNote && (venue.status === "needs_correction" || venue.status === "suspended") ? (
              <View className="mt-3 rounded-md bg-warning-tint p-3">
                <Text className="text-[12.5px] font-bold text-warning">{t("common.messageFromEduloc")}</Text>
                <Text className="mt-1 text-[13px] leading-[19px] text-ink">{venue.reviewNote}</Text>
              </View>
            ) : null}
            <Text className="mt-3 text-[13px] font-bold text-primary">
              {venue.editable ? t("partnerDashboard.dashboard.completeSubmitTheFile") : t("partnerDashboard.dashboard.viewThePage")}
            </Text>
          </View>
        </PressableScale>
      </FadeIn>

      <FadeIn delay={70}>
        <Text className="mb-2 mt-6 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("partnerDashboard.dashboard.myRooms")}</Text>
        {venue.rooms.length === 0 ? (
          <Text className="mb-3 text-[13.5px] text-ink-soft">{t("partnerDashboard.dashboard.youHaveNotAddedA")}</Text>
        ) : (
          venue.rooms.map((room) => <RoomCard key={room.id} room={room} onPress={() => onOpenRoom(room.id)} />)
        )}
        <Button
          label={t("partnerDashboard.dashboard.addARoom")}
          variant="secondary"
          icon={<PlusIcon size={16} color="#332E86" />}
          disabled={venue.status === "suspended"}
          onPress={onNewRoom}
        />
        {venue.status === "draft" || venue.status === "needs_correction" ? (
          <Text className="mt-2 text-[12px] leading-[18px] text-ink-faint">
            {t("partnerDashboard.dashboard.youCanPrepareYourRooms")}</Text>
        ) : null}
      </FadeIn>

      <FadeIn delay={110}>
        <Text className="mb-2 mt-6 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("common.commercialPlan")}</Text>
        <PressableScale onPress={onOpenSubscription} accessibilityLabel={t("common.manageTheCommercialPlan")}>
          <View className="flex-row items-center gap-3 rounded-lg border border-line bg-surface p-4">
            <View className="flex-1">
              <Text className="text-[14.5px] font-bold text-ink">{venue.subscription.plan?.name ?? SUBSCRIPTION_LABELS[venue.subscription.status]}</Text>
              <Text className="mt-[2px] text-[12.5px] text-ink-soft">
                {venue.subscription.status === "active"
                  ? t("partnerDashboard.dashboard.active", { value: venue.subscription.validUntilLabel ?? "" })
                  : canChoosePlan
                    ? SUBSCRIPTION_LABELS[venue.subscription.status]
                    : t("partnerDashboard.dashboard.availableOnceTheOrganisationAnd")}
              </Text>
            </View>
            <ChevronRightIcon size={16} color="#9799AF" />
          </View>
        </PressableScale>
      </FadeIn>

      <FadeIn delay={140}>
        <Text className="mb-2 mt-6 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("common.reservations")}</Text>
        <PressableScale onPress={onOpenReservations} accessibilityLabel={t("partnerDashboard.dashboard.viewConfirmedReservations")}>
          <View className="flex-row items-center gap-3 rounded-lg border border-line bg-surface p-4">
            <Text className="flex-1 text-[14.5px] font-bold text-ink">{t("partnerDashboard.dashboard.confirmedSessionsInMyRooms")}</Text>
            <ChevronRightIcon size={16} color="#9799AF" />
          </View>
        </PressableScale>
      </FadeIn>

      {venue.history.length > 0 ? (
        <FadeIn delay={170}>
          <Text className="mb-2 mt-6 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("partnerDashboard.dashboard.history")}</Text>
          <View className="rounded-lg border border-line bg-surface px-4">
            {venue.history.slice(0, 8).map((entry, index) => (
              <View key={entry.id} className={["py-3", index > 0 ? "border-t border-line-soft" : ""].join(" ")}>
                <Text className="text-[13px] font-semibold text-ink">
                  {scopeLabel(entry.scope)} · {entry.fromLabel ? `${entry.fromLabel} → ` : ""}
                  {entry.toLabel}
                </Text>
                <Text className="mt-[2px] text-[12px] text-ink-faint">{entry.atLabel}</Text>
                {entry.note ? <Text className="mt-1 text-[12.5px] text-ink-soft">{entry.note}</Text> : null}
              </View>
            ))}
          </View>
        </FadeIn>
      ) : null}
    </>
  );
}

function scopeLabel(scope: string): string {
  return scope === "venue" ? t("partnerDashboard.dashboard.organisation") : scope === "room" ? t("common.room") : scope === "publication" ? t("common.publication") : t("partnerDashboard.dashboard.plan");
}

function RoomCard({ room, onPress }: { room: PartnerRoomSummary; onPress: () => void }) {
  const { t } = useTranslation();
  const status = REVIEW_STATUS[room.status];
  return (
    <PressableScale onPress={onPress} accessibilityLabel={t("partnerDashboard.dashboard.openTheRoom", { name: room.name })}>
      <View className="mb-3 rounded-lg border border-line bg-surface p-4">
        <View className="flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-[15px] font-bold text-ink">{room.name}</Text>
          <ToneBadge label={status.label} tone={status.tone} />
        </View>
        <View className="mt-2 flex-row flex-wrap items-center gap-2">
          <Text className="text-[12.5px] text-ink-soft">{PUBLICATION_LABELS[room.publication]}</Text>
          <Text className="text-[12.5px] text-ink-faint">·</Text>
          <Text className={["text-[12.5px] font-semibold", room.bookable ? "text-accent" : "text-ink-soft"].join(" ")}>
            {room.bookable ? t("common.bookable") : t("common.notBookable")}
          </Text>
          {!room.isActive ? <Text className="text-[12.5px] text-warning">{t("partnerDashboard.dashboard.temporarilyClosed")}</Text> : null}
        </View>
        {room.reviewNote && (room.status === "needs_correction" || room.status === "suspended" || room.status === "rejected") ? (
          <Text className="mt-2 text-[12.5px] leading-[18px] text-warning">{room.reviewNote}</Text>
        ) : null}
      </View>
    </PressableScale>
  );
}
