import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";

type ScaleInProps = {
  children: ReactNode;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
};

/** Fades a block in while it scales up from a slightly smaller size. Used for splash branding. */
export function ScaleIn({ children, delay = 0, duration = 520, style }: ScaleInProps) {
  return (
    <Animated.View
      entering={ZoomIn.duration(duration).delay(delay).springify().damping(14).mass(0.7)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
