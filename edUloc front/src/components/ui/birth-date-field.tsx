import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import { CalendarIcon, ChevronRightIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { ageOn, BirthDateSelectModal, formatBirthDate } from "@/components/ui/birth-date-select-modal";
import { useTranslation } from "react-i18next";

export type BirthDateFieldProps = {
  label?: string;
  /** Valeur au format JJ/MM/AAAA (vide tant que rien n'est choisi). */
  value: string;
  onChangeText: (formattedDate: string) => void;
  error?: string;
  disabled?: boolean;
  minYear?: number;
  maxYear?: number;
};

/** « 12/05/1997 » → Date (undefined si invalide). */
function parseDdMmYyyy(raw: string): Date | undefined {
  const match = raw.trim().match(/^(\d{1,2})[/ ]+(\d{1,2})[/ ]+(\d{4})$/);
  if (!match) return undefined;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

function formatDdMmYyyy(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${date.getFullYear()}`;
}

/**
 * Champ « Date de naissance » : un appui ouvre la modale à trois roues (jour · mois · année).
 * La valeur reste au format JJ/MM/AAAA attendu par le reste du parcours.
 */
export function BirthDateField({
  label = "Date de naissance",
  value,
  onChangeText,
  error,
  disabled = false,
  minYear = 1920,
  maxYear = new Date().getFullYear() - 15,
}: BirthDateFieldProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const date = useMemo(() => parseDdMmYyyy(value), [value]);
  const age = date ? ageOn(date) : null;

  return (
    <View className="mb-[14px]">
      <View className="mb-[6px] ml-0.5 flex-row items-center justify-between">
        <Text className="text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{label}</Text>
        {age !== null && age >= 0 ? (
          <View className="rounded-full border border-primary/20 bg-primary-tint px-2.5 py-0.5">
            <Text className="text-[11.5px] font-bold text-primary">{t("common.yearsOld", { age })}</Text>
          </View>
        ) : null}
      </View>

      <PressableScale
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityLabel={t("ui.birthDateField.labelValue", { label, value: date ? formatBirthDate(date) : t("ui.birthDateField.notSpecified") })}
      >
        <View
          className={[
            "flex-row items-center justify-between rounded-lg border bg-surface px-4 py-3",
            error ? "border-error" : "border-line",
            disabled ? "opacity-50" : "",
          ].join(" ")}
        >
          <View className="flex-row items-center gap-2.5">
            <View className="h-8 w-8 items-center justify-center rounded-md bg-primary-tint">
              <CalendarIcon size={16} color="#332E86" />
            </View>
            <View>
              <Text className={["text-[15px]", date ? "font-bold text-ink" : "text-ink-faint"].join(" ")}>
                {date ? formatBirthDate(date) : t("ui.birthDateField.chooseADate")}
              </Text>
              {date ? <Text className="text-[11.5px] font-medium text-ink-soft">{value}</Text> : null}
            </View>
          </View>
          <ChevronRightIcon size={16} color="#332E86" />
        </View>
      </PressableScale>

      {error ? <Text className="mb-0 ml-0.5 mt-[6px] text-[12.5px] text-error">{error}</Text> : null}

      {open ? (
        <BirthDateSelectModal
          visible
          onClose={() => setOpen(false)}
          onSelect={(selected) => {
            onChangeText(formatDdMmYyyy(selected));
            setOpen(false);
          }}
          initialDate={date}
          minYear={minYear}
          maxYear={maxYear}
        />
      ) : null}
    </View>
  );
}
