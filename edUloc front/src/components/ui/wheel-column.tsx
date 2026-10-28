import * as Haptics from "expo-haptics";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

export const WHEEL_ITEM_HEIGHT = 48;
export const WHEEL_VISIBLE_ITEMS = 5;
const PADDING = WHEEL_ITEM_HEIGHT * Math.floor(WHEEL_VISIBLE_ITEMS / 2);
/** Sur le web (pas de snapToInterval) : on recale la roue quand le défilement s'arrête. */
const SETTLE_DELAY_MS = 140;
/**
 * Seules les lignes proches du centre sont montées (une roue d'années en compte ~90, chacune animée) : l'ouverture et
 * le défilement restent fluides. Des espaceurs gardent la hauteur — et donc la position — du contenu complet.
 */
const RENDER_WINDOW = 7;

export type WheelItemData = { key: string | number; label: string };

type WheelColumnProps = {
  items: WheelItemData[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  width: number;
  /** Nom lu par les lecteurs d'écran (« Jour », « Mois », « Année »). */
  accessibilityLabel: string;
  disabled?: boolean;
};

function tick(): void {
  // Léger retour haptique à chaque cran franchi (sans effet — et sans erreur — là où non supporté).
  Haptics.selectionAsync().catch(() => undefined);
}

/**
 * Roue de sélection (style TimerSelectMenu) : liste verticale qui s'aimante sur chaque valeur,
 * avec perspective, échelle et opacité animées (reanimated) et un retour haptique à chaque cran.
 */
export function WheelColumn({ items, selectedIndex, onSelect, width, accessibilityLabel, disabled }: WheelColumnProps) {
  const ref = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(selectedIndex * WHEEL_ITEM_HEIGHT);
  const lastTick = useSharedValue(selectedIndex);
  const dragging = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef(selectedIndex);
  const maxIndex = items.length - 1;
  // Ligne au centre pendant le défilement : pilote la fenêtre de lignes montées.
  const [center, setCenter] = useState(selectedIndex);

  const scrollToIndex = useCallback(
    (index: number, animated: boolean) => {
      ref.current?.scrollTo({ y: index * WHEEL_ITEM_HEIGHT, animated });
    },
    [ref],
  );

  const commit = useCallback(
    (offsetY: number) => {
      const index = Math.min(maxIndex, Math.max(0, Math.round(offsetY / WHEEL_ITEM_HEIGHT)));
      if (index !== selectedRef.current) {
        selectedRef.current = index;
        onSelect(index);
      }
      // Recale précisément sur la valeur (le défilement peut s'arrêter entre deux crans).
      if (Math.abs(offsetY - index * WHEEL_ITEM_HEIGHT) > 0.5) scrollToIndex(index, true);
    },
    [maxIndex, onSelect, scrollToIndex],
  );

  const scheduleSettle = useCallback(
    (offsetY: number) => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (dragging.current) return;
      settleTimer.current = setTimeout(() => commit(offsetY), SETTLE_DELAY_MS);
    },
    [commit],
  );

  const setDragging = useCallback((value: boolean) => {
    dragging.current = value;
  }, []);

  const onCrossIndex = useCallback((index: number) => {
    tick();
    setCenter(index);
  }, []);

  const handler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      const index = Math.round(event.contentOffset.y / WHEEL_ITEM_HEIGHT);
      if (index !== lastTick.value) {
        lastTick.value = index;
        runOnJS(onCrossIndex)(index);
      }
      runOnJS(scheduleSettle)(event.contentOffset.y);
    },
    onBeginDrag: () => {
      if (Platform.OS !== "web") runOnJS(setDragging)(true);
    },
    onEndDrag: () => {
      if (Platform.OS !== "web") runOnJS(setDragging)(false);
    },
    onMomentumEnd: (event) => {
      runOnJS(commit)(event.contentOffset.y);
    },
  });

  // Position initiale, puis recalage quand la valeur change de l'extérieur (ex. jour ramené à la fin du mois).
  useEffect(() => {
    selectedRef.current = selectedIndex;
    scrollToIndex(selectedIndex, false);
    // Montage uniquement : les changements suivants sont gérés ci-dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (selectedRef.current !== selectedIndex) {
      selectedRef.current = selectedIndex;
      scrollToIndex(selectedIndex, true);
    }
  }, [selectedIndex, scrollToIndex]);
  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  const choose = (index: number) => {
    selectedRef.current = index;
    onSelect(index);
    scrollToIndex(index, true);
  };
  const chooseRef = useRef(choose);
  const disabledRef = useRef(disabled);
  // Les références suivent le dernier rendu, sans être écrites pendant celui-ci.
  useLayoutEffect(() => {
    chooseRef.current = choose;
    disabledRef.current = disabled;
  });
  const press = useCallback((index: number) => {
    if (!disabledRef.current) chooseRef.current(index);
  }, []);

  const first = Math.max(0, Math.min(center, maxIndex) - RENDER_WINDOW);
  const last = Math.min(maxIndex, Math.min(center, maxIndex) + RENDER_WINDOW);

  return (
    <View
      style={{ width, height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ITEMS }}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: items[selectedIndex]?.label }}
      aria-valuetext={items[selectedIndex]?.label}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) => {
        if (disabled) return;
        const next = selectedIndex + (event.nativeEvent.actionName === "increment" ? 1 : -1);
        if (next >= 0 && next <= maxIndex) choose(next);
      }}
    >
      <Animated.ScrollView
        ref={ref}
        onScroll={handler}
        scrollEventThrottle={16}
        scrollEnabled={!disabled}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: selectedIndex * WHEEL_ITEM_HEIGHT }}
        contentContainerStyle={{ paddingVertical: PADDING }}
      >
        <View style={{ height: first * WHEEL_ITEM_HEIGHT }} />
        {items.slice(first, last + 1).map((item, offset) => {
          const index = first + offset;
          return (
            <WheelItem
              key={item.key}
              label={item.label}
              index={index}
              scrollY={scrollY}
              active={index === selectedIndex}
              onPress={press}
            />
          );
        })}
        <View style={{ height: (maxIndex - last) * WHEEL_ITEM_HEIGHT }} />
      </Animated.ScrollView>
    </View>
  );
}

type WheelItemProps = {
  label: string;
  index: number;
  scrollY: SharedValue<number>;
  active: boolean;
  onPress: (index: number) => void;
};

const WheelItem = memo(function WheelItem({ label, index, scrollY, active, onPress }: WheelItemProps) {
  const style = useAnimatedStyle(() => {
    const offset = (index * WHEEL_ITEM_HEIGHT - scrollY.value) / WHEEL_ITEM_HEIGHT; // 0 = centre
    const distance = Math.abs(offset);
    return {
      opacity: interpolate(distance, [0, 1, 2], [1, 0.5, 0.2], Extrapolation.CLAMP),
      transform: [
        { perspective: 600 },
        { rotateX: `${interpolate(offset, [-2, 0, 2], [38, 0, -38], Extrapolation.CLAMP)}deg` },
        { scale: interpolate(distance, [0, 1, 2], [1.08, 0.92, 0.8], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <Pressable onPress={() => onPress(index)} accessibilityLabel={label} style={{ height: WHEEL_ITEM_HEIGHT }}>
      <Animated.View style={[{ height: WHEEL_ITEM_HEIGHT, alignItems: "center", justifyContent: "center" }, style]}>
        <Text
          numberOfLines={1}
          className={active ? "text-[20px] font-bold text-primary" : "text-[18px] font-medium text-ink-soft"}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
});
