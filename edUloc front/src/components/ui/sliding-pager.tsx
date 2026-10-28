import { type ReactNode, useCallback, useLayoutEffect } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

const SLIDE_MS = 220;
/** Part de la largeur (ou vitesse) au-delà de laquelle le geste change de page. */
const SWIPE_RATIO = 0.22;
const SWIPE_VELOCITY = 450;

type SlidingPagerProps = {
  width: number;
  onPrev: () => void;
  onNext: () => void;
  /** -1 = page précédente, 0 = page courante, 1 = page suivante. */
  renderPage: (offset: -1 | 0 | 1) => ReactNode;
  /** Change quand la page courante change : le glissement est remis à zéro. */
  resetKey: string | number;
  disabled?: boolean;
  /** Début / fin d'un glissement : les appuis qui l'accompagnent ne doivent pas sélectionner un jour. */
  onDragChange?: (dragging: boolean) => void;
};

/**
 * Pager horizontal à trois pages (précédente · courante · suivante) piloté par un geste de glissement : fluide et
 * identique sur mobile et sur le web. Le parent reste maître de la page courante (onPrev / onNext).
 */
export function SlidingPager({ width, onPrev, onNext, renderPage, resetKey, disabled, onDragChange }: SlidingPagerProps) {
  const translateX = useSharedValue(0);
  const activated = useSharedValue(false);

  // La nouvelle page est montée au centre : on remet le glissement à zéro avant le prochain affichage.
  useLayoutEffect(() => {
    translateX.set(0);
  }, [resetKey, translateX]);

  const commit = useCallback(
    (direction: 1 | -1) => {
      if (direction === 1) onNext();
      else onPrev();
    },
    [onNext, onPrev],
  );

  const pan = Gesture.Pan()
    .enabled(!disabled && width > 0)
    // Un glissement vertical appartient à la page, un glissement horizontal au pager.
    .activeOffsetX([-10, 10])
    .failOffsetY([-14, 14])
    .onStart(() => {
      activated.set(true);
      if (onDragChange) runOnJS(onDragChange)(true);
    })
    .onUpdate((event) => {
      translateX.set(event.translationX);
    })
    .onFinalize(() => {
      // Seul un vrai glissement (activé) bloque l'appui qui l'accompagne : un simple toucher doit sélectionner.
      if (activated.get()) {
        activated.set(false);
        if (onDragChange) runOnJS(onDragChange)(false);
      }
    })
    .onEnd((event) => {
      const next = event.translationX < 0;
      const far = Math.abs(event.translationX) > width * SWIPE_RATIO || Math.abs(event.velocityX) > SWIPE_VELOCITY;
      if (far) {
        translateX.set(
          withTiming((next ? -1 : 1) * width, { duration: SLIDE_MS }, (finished) => {
            if (finished) runOnJS(commit)(next ? 1 : -1);
          }),
        );
      } else {
        translateX.set(withTiming(0, { duration: SLIDE_MS }));
      }
    });

  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.get() }] }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ flexDirection: "row", width: width * 3, marginLeft: -width }, slideStyle]}>
        {([-1, 0, 1] as const).map((offset) => (
          <View key={offset} style={{ width }}>
            {renderPage(offset)}
          </View>
        ))}
      </Animated.View>
    </GestureDetector>
  );
}
