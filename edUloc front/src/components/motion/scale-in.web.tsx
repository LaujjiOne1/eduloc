import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

type ScaleInProps = {
  children: ReactNode;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
};

/** Fades a block in while it scales up from a slightly smaller size. Used for splash branding. */
export function ScaleIn({ children, delay = 0, duration = 520, style }: ScaleInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, transform: "scale(0.85)" }}
      animate={{ opacity: 1, transform: "scale(1)" }}
      transition={{ duration: duration / 1000, delay: delay / 1000, ease: [0.16, 1, 0.3, 1] }}
      // Comme une View React Native : colonne flex (sans cela, titre et sous-titre se retrouvent sur la même ligne).
      style={{ display: "flex", flexDirection: "column", ...(style as React.CSSProperties) }}
    >
      {children}
    </motion.div>
  );
}
