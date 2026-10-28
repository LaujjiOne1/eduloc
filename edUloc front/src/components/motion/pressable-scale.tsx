import type { ReactNode } from "react";
import { Pressable, StyleSheet, type StyleProp, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

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
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // `flex` must also reach the Pressable: it is the actual child of the parent
  // row, so without it the animated view's flex:1 collapses to zero width.
  const flex = StyleSheet.flatten(style)?.flex;

  return (
    <Pressable
      style={flex === undefined ? undefined : { flex }}
      onPress={disabled ? undefined : onPress}
      onPressIn={() => {
        if (!disabled) scale.set(withTiming(PRESSED_SCALE, { duration: 100 }));
      }}
      onPressOut={() => {
        scale.set(withTiming(1, { duration: 150 }));
      }}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled: !!disabled }}
    >
      <Animated.View style={[style, animatedStyle, disabled ? { opacity: 0.5 } : null]}>
        {className ? <View className={className}>{children}</View> : children}
      </Animated.View>
    </Pressable>
  );
}
