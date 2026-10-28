import type { ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { PressableScale } from "@/components/motion/pressable-scale";

type ButtonVariant = "primary" | "secondary" | "ghost" | "animated";

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: ReactNode;
  fullWidth?: boolean;
  disabled?: boolean;
  /** Submitting state: shows a spinner + loadingLabel and blocks re-taps. */
  loading?: boolean;
  loadingLabel?: string;
  /** "sm" : bouton compact (actions secondaires dans une carte). */
  size?: "md" | "sm";
  /** Halo lumineux autour du bouton (variante « animated » : appel à l'action de l'accueil). */
  animatedGlow?: boolean;
  className?: string;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-primary",
  animated: "bg-primary",
  secondary: "bg-surface border border-primary",
  ghost: "bg-transparent border border-line",
};

const VARIANT_TEXT_CLASSES: Record<ButtonVariant, string> = {
  primary: "text-white",
  animated: "text-white",
  secondary: "text-primary",
  ghost: "text-ink",
};

const VARIANT_SPINNER_COLOR: Record<ButtonVariant, string> = {
  primary: "#fff",
  animated: "#fff",
  secondary: "#332E86",
  ghost: "#14162B",
};

/** Rounded pill/box button matching the EduLoc .btn / .btn-primary / .btn-ghost styles. */
export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  fullWidth,
  disabled,
  loading,
  loadingLabel,
  animatedGlow,
  size = "md",
  className,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      accessibilityLabel={label}
      style={fullWidth ? { flex: 1 } : undefined}
    >
      <View
        className={[
          size === "sm"
            ? "flex-row items-center justify-center gap-2 rounded-md px-[16px] py-[9px]"
            : "flex-row items-center justify-center gap-2 rounded-md px-[22px] py-[14px]",
          VARIANT_CLASSES[variant],
          className ?? "",
        ].join(" ")}
        style={animatedGlow ? { shadowColor: "#332E86", shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 } : undefined}
      >
        {loading ? <ActivityIndicator size="small" color={VARIANT_SPINNER_COLOR[variant]} /> : icon}
        <Text className={["text-[15px] font-semibold", VARIANT_TEXT_CLASSES[variant]].join(" ")}>
          {loading ? (loadingLabel ?? label) : label}
        </Text>
      </View>
    </PressableScale>
  );
}
