import { Text, View } from "react-native";

import { ClockIcon, LocationIcon, StarIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { TutorAvatar } from "@/components/ui/tutor-avatar";
import type { Tutor } from "@/types/tutor";

export const TUTOR_AVATAR_TONE_CLASSES: Record<string, { bg: string; text: string }> = {
  primary: { bg: "bg-primary-tint", text: "text-primary" },
  violet: { bg: "bg-violet-tint", text: "text-violet" },
  accent: { bg: "bg-accent-tint", text: "text-accent" },
  navy: { bg: "bg-primary-tint", text: "text-primary" },
  amber: { bg: "bg-amber-100", text: "text-amber-800" },
  emerald: { bg: "bg-emerald-100", text: "text-emerald-800" },
  indigo: { bg: "bg-indigo-100", text: "text-indigo-800" },
  rose: { bg: "bg-rose-100", text: "text-rose-800" },
};

export const DEFAULT_AVATAR_TONE = { bg: "bg-primary-tint", text: "text-primary" };

export function getTutorAvatarTone(tone?: string | null): { bg: string; text: string } {
  if (!tone) return DEFAULT_AVATAR_TONE;
  return TUTOR_AVATAR_TONE_CLASSES[tone] ?? DEFAULT_AVATAR_TONE;
}

function locationLine(tutor: Tutor): string {
  return tutor.location.distanceKm != null
    ? `${tutor.location.label}, ${tutor.location.distanceKm} km`
    : tutor.location.label;
}

type TutorCardProps = {
  tutor: Tutor;
  onPress: () => void;
  disabled?: boolean;
};

/** Results-list row: avatar, name, rating, subject/level, location and next available slot. */
export function TutorCard({ tutor, onPress, disabled }: TutorCardProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={`${tutor.firstName} ${tutor.lastName}`}
    >
      <View className="mb-3 flex-row gap-[14px] rounded-lg border border-line bg-surface p-4">
        <TutorAvatar gender={tutor.gender} photoUrl={tutor.photoUrl} size={64} radius={12} />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-[15.5px] font-bold text-ink" numberOfLines={1}>
              {tutor.firstName} {tutor.lastName}
            </Text>
            <View className="flex-row items-center gap-1">
              <StarIcon size={13} color="#BD7E28" />
              <Text className="text-[13px] font-bold text-ink">{tutor.rating.toFixed(1)}</Text>
            </View>
          </View>
          <Text className="mt-[2px] text-[13px] text-ink-soft" numberOfLines={1}>
            {[tutor.subjects[0], tutor.levels[0]].filter(Boolean).join(" • ")}
          </Text>
          {tutor.matchReasons && tutor.matchReasons.length > 0 ? (
            <Text className="mt-1 text-[12.5px] font-semibold text-primary" numberOfLines={2}>
              {tutor.matchReasons.join(" • ")}
            </Text>
          ) : null}
          <View className="mt-[6px] flex-row items-center gap-[5px]">
            <LocationIcon size={13} color="#9799AF" />
            <Text className="flex-1 text-[12.5px] text-ink-faint" numberOfLines={1}>
              {locationLine(tutor)}
            </Text>
          </View>
          <View className="mt-1 flex-row items-center gap-[5px]">
            <ClockIcon size={13} color="#0E9C82" />
            <Text className="flex-1 text-[12.5px] font-semibold text-accent" numberOfLines={1}>
              {tutor.nextSlotLabel}
            </Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}
