import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";

type FadeInProps = {
  children: ReactNode;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
};

/** Fades a block in while it rises gently into place. Used for staggered screen reveals. */
export function FadeIn({ children, delay = 0, duration = 420, style }: FadeInProps) {
  return (
    <Animated.View
      entering={FadeInUp.duration(duration).delay(delay).springify().damping(18).mass(0.6)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
