import * as Haptics from "expo-haptics";
import { type ReactNode, useEffect } from "react";
import { ScrollView, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

export type SheetSnap = "peek" | "half" | "full";

type DraggableSheetProps = {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /** Hauteur de la feuille ouverte à fond (en général : le conteneur moins la barre du haut). */
  fullHeight: number;
  /** Partie de la feuille encore visible quand elle est réduite (poignée + titre + bouton flottant). */
  peekVisible: number;
  /** Zone de prise : poignée et titre. Glisser dessus déplace la feuille, quel que soit son état. */
  header: ReactNode;
  children: ReactNode;
  bottomInset?: number;
};

/** Part de la hauteur visible à mi-course. */
const HALF_RATIO = 0.55;
const SPRING = { damping: 28, stiffness: 260, mass: 0.9 } as const;
/** Départ hors écran : la feuille monte du bas à son arrivée. */
const OFFSCREEN = 2000;

/**
 * Feuille qui se glisse sur trois positions (réduite · à moitié · plein écran), façon Airbnb. Le contenu ne défile
 * qu'à plein écran ; sinon, glisser n'importe où sur la feuille la déplace.
 */
export function DraggableSheet({ snap, onSnapChange, fullHeight, peekVisible, header, children, bottomInset = 0 }: DraggableSheetProps) {
  const translateY = useSharedValue(OFFSCREEN);
  const startY = useSharedValue(0);

  // Décalage vers le bas depuis la position « plein écran » (0).
  const halfOffset = Math.max(fullHeight * (1 - HALF_RATIO), 0);
  const peekOffset = Math.max(fullHeight - peekVisible, 0);
  const offsetFor = (target: SheetSnap) => (target === "full" ? 0 : target === "half" ? halfOffset : peekOffset);

  useEffect(() => {
    if (fullHeight <= 0) return;
    translateY.set(withSpring(offsetFor(snap), SPRING));
    // offsetFor ne dépend que de ces valeurs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, fullHeight, peekVisible]);

  const announce = (next: SheetSnap) => {
    void Haptics.selectionAsync();
    onSnapChange(next);
  };

  const makePan = () =>
    Gesture.Pan()
      .activeOffsetY([-10, 10])
      .failOffsetX([-24, 24])
      .onStart(() => {
        startY.set(translateY.get());
      })
      .onUpdate((event) => {
        const next = startY.get() + event.translationY;
        translateY.set(Math.min(Math.max(next, 0), peekOffset));
      })
      .onEnd((event) => {
        // On vise la position la plus proche du point d'arrivée prolongé par l'élan du geste.
        const projected = translateY.get() + event.velocityY * 0.18;
        let target: SheetSnap = "full";
        let best = Math.abs(projected);
        const toHalf = Math.abs(projected - halfOffset);
        if (toHalf < best) {
          best = toHalf;
          target = "half";
        }
        if (Math.abs(projected - peekOffset) < best) target = "peek";
        const targetOffset = target === "full" ? 0 : target === "half" ? halfOffset : peekOffset;
        translateY.set(withSpring(targetOffset, SPRING));
        runOnJS(announce)(target);
      });

  const headerPan = makePan();
  const bodyPan = makePan().enabled(snap !== "full");

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.get() }] }));

  if (fullHeight <= 0) return null;

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: fullHeight,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          backgroundColor: "#FFFFFF",
          overflow: "hidden",
          shadowColor: "#14162B",
          shadowOpacity: 0.16,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: -6 },
          elevation: 12,
        },
        animatedStyle,
      ]}
    >
      <GestureDetector gesture={headerPan}>
        <View>{header}</View>
      </GestureDetector>

      <GestureDetector gesture={bodyPan}>
        <View style={{ flex: 1 }}>
          <ScrollView
            scrollEnabled={snap === "full"}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(bottomInset, 16) + 72 }}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}
