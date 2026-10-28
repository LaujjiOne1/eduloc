import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

type FadeInProps = {
  children: ReactNode;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
};

/** Fades a block in while it rises gently into place. Used for staggered screen reveals. */
export function FadeIn({ children, delay = 0, duration = 420, style }: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, transform: "translateY(16px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{ duration: duration / 1000, delay: delay / 1000, ease: [0.16, 1, 0.3, 1] }}
      // Comme une View React Native : colonne flex (sans cela, titre et sous-titre se retrouvent sur la même ligne).
      style={{ display: "flex", flexDirection: "column", ...(style as React.CSSProperties) }}
    >
      {children}
    </motion.div>
  );
}
