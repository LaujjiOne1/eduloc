import { Text, View } from "react-native";

import { CheckIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";

type ChipProps = {
  label: string;
  active?: boolean;
  /** When set, the chip becomes an interactive toggle (e.g. TutorSubjects' level chips). */
  onPress?: () => void;
  disabled?: boolean;
};

/** Pill label matching the EduLoc .chip / .chip-active styles — static, or a toggle when `onPress` is set. */
export function Chip({ label, active, onPress, disabled }: ChipProps) {
  const content = (
    <View
      className={[
        "flex-row items-center gap-[6px] rounded-full border px-[14px] py-[9px]",
        active ? "border-primary bg-primary-tint" : "border-line bg-surface",
      ].join(" ")}
    >
      {active && onPress ? <CheckIcon size={11} color="#332E86" /> : null}
      <Text className={["text-[13.5px] font-semibold", active ? "text-primary" : "text-ink-soft"].join(" ")}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return content;

  return (
    <PressableScale onPress={onPress} disabled={disabled} accessibilityLabel={label}>
      {content}
    </PressableScale>
  );
}

export function ChipSkeleton({ width = 96 }: { width?: number }) {
  return <View className="h-[38px] rounded-full bg-line-soft" style={{ width }} />;
}
