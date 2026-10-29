import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

type ExpandableCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Sur le web la hauteur est animée par `Collapsible` : la carte n'est qu'une colonne flex, comme une View. */
export function ExpandableCard({ children, style }: ExpandableCardProps) {
  return <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", ...(style as React.CSSProperties) }}>{children}</div>;
}

type CollapsibleProps = {
  open: boolean;
  children: ReactNode;
};

/** Contenu d'une carte : la hauteur et l'opacité s'animent à l'ouverture comme à la fermeture. */
export function Collapsible({ open, children }: CollapsibleProps) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
