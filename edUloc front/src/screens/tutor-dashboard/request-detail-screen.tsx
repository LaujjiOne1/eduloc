import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { RoomLocationBlock } from "@/components/booking/room-location-block";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AlertTriangleIcon, MicIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { StatusBadge } from "@/components/ui/status-badge";
import { DIFFICULTY_LABELS, OBJECTIVE_LABELS } from "@/api/mappers";
import { useBookingRequestAction } from "@/hooks/use-booking-request-action";
import { useTutorBooking } from "@/hooks/use-tutor-booking";
import type { Booking } from "@/types/booking";
import { useTranslation } from "react-i18next";
import { t as translate } from "@/i18n";

function acceptedRoute(id: string): Href {
  return `/tutor-dashboard/requests/${id}/accepted` as Href;
}
function conflictRoute(id: string, code?: string): Href {
  return `/tutor-dashboard/requests/${id}/conflict${code ? `?code=${encodeURIComponent(code)}` : ""}` as Href;
}
const REQUESTS_ROUTE = "/tutor-dashboard/requests" as Href;

export function RequestDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, retry } = useTutorBooking(id);
  const { state: actionState, accept, refuse } = useBookingRequestAction();

  const isAccepting = actionState.status === "accepting";
  const isRefusing = actionState.status === "refusing";

  const handleAccept = async (bookingId: string) => {
    const result = await accept(bookingId);
    if (result.ok) router.replace(acceptedRoute(bookingId));
    else if (result.conflict) router.replace(conflictRoute(bookingId, result.code));
  };

  const handleRefuse = async (bookingId: string) => {
    const refused = await refuse(bookingId);
    if (refused) router.replace(REQUESTS_ROUTE);
  };

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />

      {state.status === "loading" ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#332E86" />
        </View>
      ) : state.status === "error" ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text className="text-center text-[14px] text-error">{state.message}</Text>
          <PressableScale onPress={retry} accessibilityLabel={t("common.tryAgain")}>
            <Text className="text-[14px] font-semibold text-primary">{t("common.tryAgain")}</Text>
          </PressableScale>
        </View>
      ) : (
        <RequestDetailContent booking={state.booking} formError={actionState.status === "error" ? actionState.message : null} />
      )}

      {state.status === "success" && state.booking.status === "pending" ? (
        <View className="bg-surface px-5 pt-4 " style={{ paddingBottom: Math.max(insets.bottom, 22) }}>
          <View className="flex-row gap-[10px] border-t border-line-soft px-15 pt-[14px] items-center justify-center">
            <Button
              label={t("common.decline")}
              variant="ghost"
              disabled={isAccepting || isRefusing}
              loading={isRefusing}
              loadingLabel={t("tutorDashboard.requestDetail.declining")}
              className="w-65"  
              onPress={() => handleRefuse(state.booking.id)}
            />
            <Button
              label={t("common.accept")}
              disabled={isAccepting || isRefusing}
              loading={isAccepting}
              loadingLabel={t("tutorDashboard.requestDetail.accepting")}
              onPress={() => handleAccept(state.booking.id)}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function RequestDetailContent({ booking, formError }: { booking: Booking; formError: string | null }) {
  const { t } = useTranslation();
  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
      <View className="mb-[18px] flex-row items-center justify-between">
        <Text className="text-[24px] font-bold text-ink">{t("common.requestFrom", { firstName: booking.beneficiary.firstName })}</Text>
      </View>

      {booking.status !== "pending" ? (
        <View className="mb-[14px]">
          <StatusBadge status={booking.status} />
        </View>
      ) : null}

      {formError ? <FormError message={formError} /> : null}

      {booking.status === "pending" && booking.competingRequests.length > 0 ? (
        <CompetingRequestsNotice competing={booking.competingRequests} />
      ) : null}

      <View className="rounded-lg border border-line bg-surface p-4">
        <Row label={t("common.beneficiary")} value={booking.beneficiary.firstName} />
        <Divider />
        <Row label={t("common.level")} value={booking.beneficiary.level?.label ?? "—"} />
        <Divider />
        <Row label={t("common.goal")} value={booking.beneficiary.objective ? OBJECTIVE_LABELS[booking.beneficiary.objective] : translate("tutorDashboard.requestDetail.notSpecifiedMasculine")} />
        <Divider />
        <Row label={t("tutorDashboard.requestDetail.difficulty")} value={booking.beneficiary.difficulty ? DIFFICULTY_LABELS[booking.beneficiary.difficulty] : translate("tutorDashboard.requestDetail.notSpecifiedFeminine")} />
        <Divider />
        <Row label={t("common.date")} value={booking.slot.dateLabel} />
        <Divider />
        <Row label={t("common.schedule")} value={`${booking.slot.startTime} → ${booking.slot.endTime}`} />
        <Divider />
        <Row label={t("common.place")} value={booking.offer.location} />
      </View>

      <View className="mt-[14px]">
        <RoomLocationBlock booking={booking} />
      </View>

      <View className="mt-[14px] flex-row items-center gap-3 rounded-lg border border-line bg-surface p-4">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-accent-tint">
          <MicIcon size={16} color="#0E9C82" />
        </View>
        <View className="flex-1">
          <Text className="text-[12px] text-ink-soft">{t("common.need")}</Text>
          <Text className="text-[14px] font-bold text-ink" numberOfLines={3}>
            {booking.note.trim() ? booking.note.trim() : t("common.noDetailsAdded")}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

/** Plusieurs demandes sur le même horaire : accepter celle-ci refusera automatiquement les autres. */
function CompetingRequestsNotice({ competing }: { competing: Booking["competingRequests"] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const many = competing.length > 1;
  return (
    <View className="mb-[14px] rounded-lg border border-warning/40 bg-warning-tint p-4" accessibilityRole="alert">
      <View className="flex-row items-center gap-2">
        <AlertTriangleIcon size={16} color="#BD7E28" />
        <Text className="flex-1 text-[14px] font-bold text-warning">
          {many ? t("tutorDashboard.requestDetail.otherRequestsTargetTheSame", { length: competing.length }) : t("tutorDashboard.requestDetail.anotherRequestTargetsTheSame")}
        </Text>
      </View>
      <Text className="mt-1.5 text-[13px] leading-[19px] text-ink-soft">
        {t("tutorDashboard.requestDetail.youCanOnlyAcceptOne", { value: many ? t("tutorDashboard.requestDetail.theOthers") : t("tutorDashboard.requestDetail.theOtherOne") })}</Text>
      <View className="mt-3 gap-2">
        {competing.map((other) => (
          <PressableScale key={other.id} onPress={() => router.push(`/tutor-dashboard/requests/${other.id}` as Href)} accessibilityLabel={t("tutorDashboard.requestDetail.viewSRequest", { beneficiaryFirstName: other.beneficiaryFirstName })}>
            <View className="flex-row items-center justify-between rounded-md bg-surface px-3 py-2.5">
              <Text className="text-[13.5px] font-bold text-ink">{other.beneficiaryFirstName}</Text>
              <Text className="text-[12px] text-ink-soft">{t("tutorDashboard.requestDetail.view", { requesterName: other.requesterName })}</Text>
            </View>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between py-[9px]">
      <Text className="text-[13.5px] text-ink-soft">{label}</Text>
      <Text className="text-[14px] font-bold text-ink">{value}</Text>
    </View>
  );
}

function Divider() {
  return <View className="h-px bg-line-soft" />;
}
