import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { CheckIcon, ChevronRightIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";

type MenuCardProps = {
  icon: ReactNode;
  title: string;
  description?: string;
  iconTone?: "primary" | "violet";
  iconSize?: "sm" | "md";
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

const TONE_CLASSES: Record<"primary" | "violet", string> = {
  primary: "bg-primary-tint",
  violet: "bg-violet-tint",
};

const SIZE_CLASSES: Record<"sm" | "md", string> = {
  sm: "h-[38px] w-[38px] rounded-md",
  md: "h-11 w-11 rounded-md",
};

/**
 * Icon-led row with a title (+ optional description) and a trailing chevron.
 * Tapping it both records the choice and advances to the next wizard step —
 * used for drill-down menu choices (subject, for-whom).
 */
export function MenuCard({
  icon,
  title,
  description,
  iconTone = "primary",
  iconSize = "sm",
  onPress,
  disabled,
  accessibilityLabel,
}: MenuCardProps) {
  return (
    <PressableScale onPress={onPress} disabled={disabled} accessibilityLabel={accessibilityLabel ?? title}>
      <View className="flex-row items-center gap-3 rounded-lg border border-line bg-surface p-4">
        <View
          className={["items-center justify-center", SIZE_CLASSES[iconSize], TONE_CLASSES[iconTone]].join(" ")}
        >
          {icon}
        </View>
        <View className="flex-1">
          <Text className={description ? "text-[15.5px] font-bold text-ink" : "text-[15px] font-semibold text-ink"}>
            {title}
          </Text>
          {description ? <Text className="mt-[2px] text-[12.5px] text-ink-soft">{description}</Text> : null}
        </View>
        <ChevronRightIcon size={17} color="#9799AF" />
      </View>
    </PressableScale>
  );
}

type RadioCardProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** "check" = filled circle + checkmark (Level, Objective). "dot" = thick-border dot, no fill (Location format). */
  variant?: "check" | "dot";
};

/** Label row with a trailing radio indicator, highlighted when selected — single-choice lists. */
export function RadioCard({
  label,
  selected,
  onPress,
  disabled,
  accessibilityLabel,
  variant = "check",
}: RadioCardProps) {
  return (
    <PressableScale onPress={onPress} disabled={disabled} accessibilityLabel={accessibilityLabel ?? label}>
      <View
        className={[
          "flex-row items-center justify-between rounded-lg border p-4",
          selected ? "border-primary bg-primary-tint" : "border-line bg-surface",
        ].join(" ")}
      >
        <Text className="text-[15px] font-semibold text-ink">{label}</Text>
        {variant === "check" ? (
          <View
            className={[
              "h-5 w-5 items-center justify-center rounded-full border-2",
              selected ? "border-primary bg-primary" : "border-line",
            ].join(" ")}
          >
            {selected ? <CheckIcon size={11} color="#fff" /> : null}
          </View>
        ) : (
          <View
            className="h-5 w-5 rounded-full"
            style={{ borderWidth: selected ? 6 : 2, borderColor: selected ? "#332E86" : "#E7E3D7" }}
          />
        )}
      </View>
    </PressableScale>
  );
}

type CheckboxCardProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/** Label row with a leading square checkbox (+ optional icon) — multi-choice lists (Skills, Format). */
export function CheckboxCard({ label, selected, onPress, icon, disabled, accessibilityLabel }: CheckboxCardProps) {
  return (
    <PressableScale onPress={onPress} disabled={disabled} accessibilityLabel={accessibilityLabel ?? label}>
      <View
        className={[
          "flex-row items-center gap-3 rounded-lg border p-4",
          selected ? "border-primary bg-primary-tint" : "border-line bg-surface",
        ].join(" ")}
      >
        <View
          className={[
            "h-5 w-5 items-center justify-center rounded-[6px] border-2",
            selected ? "border-primary bg-primary" : "border-line",
          ].join(" ")}
        >
          {selected ? <CheckIcon size={11} color="#fff" /> : null}
        </View>
        {icon ? (
          <View className="flex-1 flex-row items-center gap-[10px]">
            {icon}
            <Text className="text-[14.5px] font-semibold text-ink">{label}</Text>
          </View>
        ) : (
          <Text className="flex-1 text-[14.5px] font-semibold text-ink">{label}</Text>
        )}
      </View>
    </PressableScale>
  );
}
