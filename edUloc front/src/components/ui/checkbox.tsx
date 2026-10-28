import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { CheckIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";

export type CheckboxProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  icon,
  disabled = false,
}: CheckboxProps) {
  return (
    <PressableScale
      onPress={() => !disabled && onCheckedChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      style={{ flex: 1 }}
    >
      <View
        className={[
          "flex-row items-center gap-3 rounded-xl border p-3.5 transition-colors",
          checked
            ? "border-primary bg-primary/5"
            : "border-line bg-surface hover:border-line-strong",
          disabled ? "opacity-50" : "",
        ].join(" ")}
      >
        <View
          className={[
            "h-5 w-5 items-center justify-center rounded-md border transition-colors",
            checked ? "border-primary bg-primary" : "border-line-strong bg-surface",
          ].join(" ")}
        >
          {checked ? <CheckIcon size={12} color="#ffffff" /> : null}
        </View>

        {icon ? <View className="flex-shrink-0">{icon}</View> : null}

        <View className="flex-1">
          <Text
            className={[
              "text-[14px] font-semibold",
              checked ? "text-primary" : "text-ink",
            ].join(" ")}
          >
            {label}
          </Text>
          {description ? (
            <Text className="mt-0.5 text-[12px] text-ink-soft" numberOfLines={1}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>
    </PressableScale>
  );
}
