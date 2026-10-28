import { Text, View } from "react-native";

import type { BookingStatus } from "@/types/booking";
import { t } from "@/i18n";

const STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; bgClass: string; textClass: string; dotClass: string }
> = {
  pending: { get label() { return t("common.pending"); }, bgClass: "bg-warning-tint", textClass: "text-warning", dotClass: "bg-warning" },
  confirmed: { get label() { return t("ui.statusBadge.confirmed"); }, bgClass: "bg-accent-tint", textClass: "text-accent", dotClass: "bg-accent" },
  refused: { get label() { return t("tutorOnboarding.tutorApplicationPending.rejected"); }, bgClass: "bg-paper-alt", textClass: "text-ink-soft", dotClass: "bg-ink-soft" },
  cancelled: { get label() { return t("ui.statusBadge.cancelled"); }, bgClass: "bg-error-tint", textClass: "text-error", dotClass: "bg-error" },
  in_progress: { get label() { return t("ui.statusBadge.inProgress"); }, bgClass: "bg-primary-tint", textClass: "text-primary", dotClass: "bg-primary" },
  completed: { get label() { return t("ui.statusBadge.completed"); }, bgClass: "bg-paper-alt", textClass: "text-ink-soft", dotClass: "bg-ink-soft" },
};

/** Pill matching the EduLoc .badge-pending/.badge-confirmed/... styles for each BookingStatus. */
export function StatusBadge({ status }: { status: BookingStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <View
      className={[
        "flex-row items-center gap-[6px] self-start rounded-full px-[11px] py-[5px]",
        config.bgClass,
      ].join(" ")}
    >
      <View className={["h-[7px] w-[7px] rounded-full", config.dotClass].join(" ")} />
      <Text className={["text-[12px] font-semibold", config.textClass].join(" ")}>{config.label}</Text>
    </View>
  );
}
