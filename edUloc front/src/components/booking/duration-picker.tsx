import { View } from "react-native";

import { Chip } from "@/components/ui/chip";
import type { BookingDuration } from "@/types/room";

type DurationPickerProps = {
  durations: BookingDuration[];
  value: number | null;
  onChange: (minutes: number) => void;
};

/** Durées configurées par le tuteur pour cette offre (jamais d'autre valeur), avec le prix de chacune. */
export function DurationPicker({ durations, value, onChange }: DurationPickerProps) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {durations.map((d) => (
        <Chip key={d.minutes} label={`${d.label} · ${d.priceLabel}`} active={d.minutes === value} onPress={() => onChange(d.minutes)} />
      ))}
    </View>
  );
}
