import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

type PressableScaleProps = {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Classes Tailwind du contenu cliquable (fond, arrondis, padding…). */
  className?: string;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link" | "checkbox";
  accessibilityState?: { checked?: boolean; selected?: boolean; disabled?: boolean };
};

const PRESSED_SCALE = 0.97;

/** A Pressable that scales down slightly while held, giving tactile feedback on tap. */
export function PressableScale({
  children,
  onPress,
  disabled,
  style,
  className,
  accessibilityLabel,
  accessibilityRole = "button",
  accessibilityState,
}: PressableScaleProps) {
  return (
    <motion.div
      onClick={disabled ? undefined : onPress}
      whileTap={disabled ? undefined : { scale: PRESSED_SCALE }}
      transition={{ duration: 0.1 }}
      className={className}
      role={accessibilityRole}
      aria-label={accessibilityLabel}
      aria-checked={accessibilityState?.checked}
      aria-selected={accessibilityState?.selected}
      aria-disabled={disabled}
      style={{
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        ...(style as React.CSSProperties),
      }}
    >
      {children}
    </motion.div>
  );
}
