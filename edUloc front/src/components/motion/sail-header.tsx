import { type ReactNode, useCallback, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/** Durée de l'élévation de la voile. */
const LIFT_MS = 1300;

type UseSailOptions = {
  /** true : écran de démarrage plein écran qui s'élève au toucher ; false : le bandeau est déjà replié. */
  intro: boolean;
};

/** Pilote la voile : `progress` va de 0 (plein écran) à 1 (bandeau replié). Elle ne s'élève qu'au toucher. */
export function useSail({ intro }: UseSailOptions) {
  const progress = useSharedValue(intro ? 0 : 1);
  const [lifted, setLifted] = useState(!intro);

  const lift = useCallback(() => {
    if (progress.get() > 0) return;
    progress.set(
      withTiming(1, { duration: LIFT_MS, easing: Easing.bezier(0.22, 1, 0.36, 1) }, (finished) => {
        if (finished) runOnJS(setLifted)(true);
      }),
    );
  }, [progress]);

  return { progress, lifted, lift };
}

type SailHeaderProps = {
  progress: SharedValue<number>;
  lifted: boolean;
  onLift: () => void;
  /** Hauteur du bandeau une fois la voile élevée (zone sûre comprise). */
  compactHeight: number;
  /** Contenu du départ, plein écran (logo, nom, attente). S'efface pendant l'élévation. */
  expanded: ReactNode;
  /** Contenu du bandeau replié. Apparaît en fin d'élévation. */
  compact: ReactNode;
  accessibilityLabel: string;
};

/**
 * Bandeau de marque qui occupe d'abord tout l'écran puis s'élève comme une voile : son bord inférieur se courbe en
 * montant (le vent), puis se rassemble en bandeau et dévoile le contenu dessous. Elle s'élève au toucher de l'écran.
 */
export function SailHeader({ progress, lifted, onLift, compactHeight, expanded, compact, accessibilityLabel }: SailHeaderProps) {
  const { height: screenHeight } = useWindowDimensions();

  const bandStyle = useAnimatedStyle(() => {
    const p = progress.get();
    // Le bord inférieur se gonfle à mi-course (voile qui prend le vent) puis se tend en bandeau.
    const radius = interpolate(p, [0, 0.5, 1], [0, 130, 34]);
    return {
      height: interpolate(p, [0, 1], [screenHeight, compactHeight]),
      borderBottomLeftRadius: radius,
      borderBottomRightRadius: radius,
    };
  });

  const expandedStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return { opacity: interpolate(p, [0, 0.35], [1, 0], "clamp"), transform: [{ translateY: interpolate(p, [0, 1], [0, -90]) }] };
  });

  const compactStyle = useAnimatedStyle(() => ({ opacity: interpolate(progress.get(), [0.6, 1], [0, 1], "clamp") }));

  return (
    // Style et non className : les composants animés ne reçoivent pas les classes Tailwind (voir FadeIn, ExpandableCard).
    <Animated.View
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          overflow: "hidden",
          backgroundColor: "#332E86",
          shadowColor: "#14162B",
          shadowOpacity: 0.2,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
          zIndex: 10,
        },
        bandStyle,
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, expandedStyle]} pointerEvents="none">
        {expanded}
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, compactStyle]} pointerEvents={lifted ? "box-none" : "none"}>
        {compact}
      </Animated.View>

      {lifted ? null : <Pressable style={StyleSheet.absoluteFill} onPress={onLift} accessibilityRole="button" accessibilityLabel={accessibilityLabel} />}
    </Animated.View>
  );
}

/** Style d'apparition pour ce qui doit se révéler quand la voile finit de s'élever (barre flottante, contenu). */
export function useRevealStyle(progress: SharedValue<number>, offset = 40, from = 0.7) {
  return useAnimatedStyle(() => {
    const p = progress.get();
    return { opacity: interpolate(p, [from, 1], [0, 1], "clamp"), transform: [{ translateY: interpolate(p, [from, 1], [offset, 0], "clamp") }] };
  });
}
