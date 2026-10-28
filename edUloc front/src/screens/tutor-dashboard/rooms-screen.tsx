import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { TutorBottomNav } from "@/components/ui/tutor-bottom-nav";
import { useTutorRooms } from "@/hooks/use-tutor-rooms";
import type { PartnerRoom } from "@/types/room";
import { useTranslation } from "react-i18next";
import { t as translate } from "@/i18n";

/** Salles partenaires : où le tuteur accepte d'intervenir. Un simple accord, la salle n'est jamais bloquée. */
export function RoomsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, busyRoomId, actionError, retry, accept, withdraw } = useTutorRooms();

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <Text className="px-5 pb-1 text-[25px] font-bold text-ink">{t("common.partnerRooms")}</Text>
      <Text className="px-5 pb-4 text-[13px] leading-[19px] text-ink-soft">
        {t("tutorDashboard.rooms.indicateTheRoomsWhereYou")}</Text>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        {actionError ? (
          <View className="mb-3">
            <FormError message={actionError} />
          </View>
        ) : null}

        {state.status === "loading" ? (
          <View className="gap-3">
            {[0, 1].map((i) => (
              <View key={i} className="h-[92px] rounded-lg bg-line-soft" />
            ))}
          </View>
        ) : state.status === "error" ? (
          <View className="flex-row items-center gap-3">
            <Text className="flex-1 text-[13.5px] text-error">{state.message}</Text>
            <PressableScale onPress={retry} accessibilityLabel={t("common.tryAgain")}>
              <Text className="text-[13.5px] font-semibold text-primary">{t("common.tryAgain")}</Text>
            </PressableScale>
          </View>
        ) : (
          <>
            <SectionTitle label={t("tutorDashboard.rooms.roomsWhereITeach")} />
            {state.accepted.length === 0 ? (
              <Text className="mb-5 text-[13.5px] text-ink-soft">{t("tutorDashboard.rooms.youHaveNotAcceptedAny")}</Text>
            ) : (
              state.accepted.map((room, index) => (
                <FadeIn key={room.id} delay={40 + index * 40}>
                  <RoomRow
                    room={room}
                    note={
                      room.bookable
                        ? null
                        : translate("tutorDashboard.rooms.currentlyNotBookable")
                    }
                    actionLabel={t("tutorDashboard.rooms.withdrawMyAgreement")}
                    actionVariant="ghost"
                    busy={busyRoomId === room.id}
                    disabled={busyRoomId !== null}
                    onAction={() => withdraw(room.id)}
                  />
                </FadeIn>
              ))
            )}

            <SectionTitle label={t("tutorDashboard.rooms.availableRooms")} />
            {state.available.length === 0 ? (
              <Text className="text-[13.5px] text-ink-soft">{t("tutorDashboard.rooms.noOtherPartnerRoomIs")}</Text>
            ) : (
              state.available.map((room, index) => (
                <FadeIn key={room.id} delay={40 + index * 40}>
                  <RoomRow
                    room={room}
                    note={null}
                    actionLabel={t("tutorDashboard.rooms.iAgreeToTeachHere")}
                    actionVariant="secondary"
                    busy={busyRoomId === room.id}
                    disabled={busyRoomId !== null}
                    onAction={() => accept(room.id)}
                  />
                </FadeIn>
              ))
            )}
          </>
        )}
      </ScrollView>

      <TutorBottomNav active="offers" />
    </View>
  );
}

function SectionTitle({ label }: { label: string }) {
  return <Text className="mb-2 mt-1 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{label}</Text>;
}

function RoomRow({
  room,
  note,
  actionLabel,
  actionVariant,
  busy,
  disabled,
  onAction,
}: {
  room: PartnerRoom;
  note: string | null;
  actionLabel: string;
  actionVariant: "secondary" | "ghost";
  busy: boolean;
  disabled: boolean;
  onAction: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="mb-3 rounded-lg border border-line bg-surface p-4">
      <Text className="text-[15px] font-bold text-ink">{room.name}</Text>
      <Text className="mt-[2px] text-[12.5px] text-ink-soft">
        {[room.zoneLabel, t("common.seatCount", { count: room.capacity }), room.pricePerHourLabel].filter(Boolean).join(" · ")}
      </Text>
      {room.equipment.length > 0 ? <Text className="mt-1 text-[12px] text-ink-faint">{room.equipment.join(" · ")}</Text> : null}
      {note ? <Text className="mt-2 text-[12.5px] leading-[18px] text-warning">{note}</Text> : null}
      <View className="mt-3">
        <Button label={actionLabel} variant={actionVariant} size="sm" loading={busy} loadingLabel={t("common.pleaseWait")} disabled={disabled} onPress={onAction} />
      </View>
    </View>
  );
}
