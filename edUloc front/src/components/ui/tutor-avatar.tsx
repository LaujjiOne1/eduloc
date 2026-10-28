import { Image } from "expo-image";
import { View } from "react-native";
import { Circle, Path, Svg } from "react-native-svg";

import type { TutorGender } from "@/types/common";

type TutorAvatarProps = {
  gender?: TutorGender | null;
  /** Photo de profil : prioritaire sur la silhouette. */
  photoUrl?: string | null;
  size?: number;
  /** « full » : rond ; sinon rayon en pixels (carte de résultat : 12). */
  radius?: number | "full";
  accessibilityLabel?: string;
};

type Palette = { bg: string; body: string; hair: string };

/** Couleurs EduLoc : violet profond pour l'homme, violet clair pour la femme, gris chaud sans information. */
const PALETTES: Record<TutorGender | "unknown", Palette> = {
  male: { bg: "#E6E3F7", body: "#332E86", hair: "#1F1B5C" },
  female: { bg: "#F1ECFC", body: "#8D7FE3", hair: "#5B4BC4" },
  unknown: { bg: "#F0EDE3", body: "#B4B6C8", hair: "#9799AF" },
};

/**
 * Avatar du tuteur : sa photo si elle existe ; sinon une silhouette (homme / femme, comme l'avatar par défaut d'un
 * réseau social) choisie d'après le sexe de son profil, et une silhouette neutre quand il n'est pas renseigné.
 * Jamais d'initiale : l'avatar se reconnaît d'un coup d'œil.
 */
export function TutorAvatar({ gender, photoUrl, size = 48, radius = "full", accessibilityLabel }: TutorAvatarProps) {
  const palette = PALETTES[gender ?? "unknown"];
  const borderRadius = radius === "full" ? size / 2 : radius;

  return (
    <View
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: size, borderRadius, overflow: "hidden", backgroundColor: palette.bg }}
    >
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          {gender === "female" ? (
            // Cheveux longs derrière le visage et les épaules
            <Path d="M17 28 C17 13 24 8 32 8 C40 8 47 13 47 28 L49 46 C45 43 42 42 41 39 L23 39 C22 42 19 43 15 46 Z" fill={palette.hair} />
          ) : null}
          {/* Épaules */}
          <Path d="M8 66 C8 49 19 41 32 41 C45 41 56 49 56 66 Z" fill={palette.body} />
          {/* Cou + visage */}
          <Path d="M27 36 L37 36 L37 43 C35 45 29 45 27 43 Z" fill={palette.body} />
          <Circle cx="32" cy="26" r="11" fill={palette.body} />
          {gender === "male" ? (
            // Cheveux courts
            <Path d="M20.5 25 C20 15 26 12 32 12 C38 12 44 15 43.5 25 C41 20 37 19 32 19 C27 19 23 20 20.5 25 Z" fill={palette.hair} />
          ) : null}
          {gender === "female" ? (
            // Frange
            <Path d="M21 25 C22 17 27 14.5 32 14.5 C38 14.5 42 18 43 25 C40 22 36 20.5 31 21 C27 21.5 23.5 22.5 21 25 Z" fill={palette.hair} />
          ) : null}
        </Svg>
      )}
    </View>
  );
}
