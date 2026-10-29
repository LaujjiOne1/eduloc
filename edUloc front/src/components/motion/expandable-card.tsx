import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";

/** Ressort commun : la carte qui s'ouvre et celles du dessous glissent avec la même courbe. */
const CARD_LAYOUT = LinearTransition.springify().damping(24).stiffness(260).mass(0.9);

type ExpandableCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Carte dont la hauteur s'anime quand son contenu (ou celui d'une carte voisine) change, façon Airbnb. */
export function ExpandableCard({ children, style }: ExpandableCardProps) {
  return (
    <Animated.View layout={CARD_LAYOUT} style={[{ overflow: "hidden" }, style]}>
      {children}
    </Animated.View>
  );
}

type CollapsibleProps = {
  open: boolean;
  children: ReactNode;
};

/** Contenu d'une carte : apparaît en fondu à l'ouverture, disparaît vite à la fermeture. */
export function Collapsible({ open, children }: CollapsibleProps) {
  if (!open) return null;
  return (
    <Animated.View entering={FadeIn.duration(220).delay(70)} exiting={FadeOut.duration(90)}>
      {children}
    </Animated.View>
  );
}
