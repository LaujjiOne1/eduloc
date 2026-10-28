import { useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";

import { PlusIcon, SearchIcon, XIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { useTranslation } from "react-i18next";
import { t as translate } from "@/i18n";

type FieldComboboxProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Séries ou mentions proposées ; la saisie libre reste toujours possible. */
  suggestions: string[];
  /** Titre de la liste quand rien n'est tapé (« Séries du bac », « Mentions »). */
  suggestionsTitle: string;
  isLoading?: boolean;
  /** Échec du chargement des suggestions : affiché dans la liste, avec « Réessayer ». */
  loadError?: string | null;
  onRetry?: () => void;
  disabled?: boolean;
  placeholder?: string;
};

const MAX_LENGTH = 200;

/** Minuscules sans accents : « Maïeutique » se retrouve avec « maieutique ». */
const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/**
 * Même champ que « Qu'enseignez-vous ? » : le tuteur tape, l'app suggère les séries ou mentions correspondantes, et
 * propose d'utiliser son texte tel quel quand aucune ne convient. Ce qui est tapé est déjà la valeur : choisir une
 * suggestion ne fait que la remplacer.
 */
export function FieldCombobox({
  label,
  value,
  onChange,
  suggestions,
  suggestionsTitle,
  isLoading,
  loadError,
  onRetry,
  disabled,
  placeholder = translate("ui.fieldCombobox.typeYourField"),
}: FieldComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const text = value.replace(/\s+/g, " ").trim();
  const key = fold(text);
  const matches = key ? suggestions.filter((s) => fold(s).includes(key)) : suggestions;
  const exact = suggestions.some((s) => fold(s) === key);
  const canUseAsIs = text.length >= 2 && !exact;

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const scheduleClose = () => {
    cancelClose();
    // Laisse le temps à un appui sur une suggestion d'aboutir avant de refermer la liste.
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };

  return (
    <View className="mb-[14px]">
      <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{label}</Text>
      <View
        className={[
          "flex-row items-center gap-[10px] rounded-lg border px-[14px] py-3",
          disabled ? "border-line-soft bg-line-soft/40" : open ? "border-primary bg-surface" : "border-line bg-surface",
        ].join(" ")}
      >
        <SearchIcon size={17} color="#9799AF" />
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={() => {
            cancelClose();
            setOpen(true);
          }}
          onBlur={scheduleClose}
          onSubmitEditing={() => (matches.length > 0 && !exact ? choose(matches[0]) : setOpen(false))}
          editable={!disabled}
          placeholder={disabled ? t("ui.fieldCombobox.chooseYourStudyLevelFirst") : placeholder}
          placeholderTextColor="#9799AF"
          autoCapitalize="sentences"
          autoCorrect={false}
          returnKeyType="done"
          maxLength={MAX_LENGTH}
          className="flex-1 text-[14.5px] text-ink"
          accessibilityRole="combobox"
          accessibilityLabel={label}
          accessibilityState={{ expanded: open, disabled }}
        />
        {value && !disabled ? (
          <PressableScale onPress={() => onChange("")} accessibilityLabel={t("common.clearTheInput")}>
            <XIcon size={16} color="#9799AF" />
          </PressableScale>
        ) : null}
      </View>

      {open && !disabled ? (
        <View
          className="mt-2 overflow-hidden rounded-lg border border-line bg-surface"
          accessibilityRole="list"
          onTouchStart={cancelClose}
          // @ts-expect-error — web uniquement : garde la liste ouverte pendant le clic (avant le blur du champ).
          onMouseDown={cancelClose}
        >
          {isLoading ? (
            <View className="flex-row items-center gap-2 px-4 py-3.5">
              <ActivityIndicator size="small" color="#332E86" />
              <Text className="text-[13px] text-ink-soft">{t("common.loading")}</Text>
            </View>
          ) : null}

          {loadError ? (
            <View className="flex-row items-center gap-3 px-4 py-3.5">
              <Text className="flex-1 text-[13px] text-error">{loadError}</Text>
              {onRetry ? (
                <PressableScale onPress={onRetry} accessibilityLabel={t("ui.fieldCombobox.tryLoadingTheListAgain")}>
                  <Text className="text-[13px] font-semibold text-primary">{t("common.tryAgain")}</Text>
                </PressableScale>
              ) : null}
            </View>
          ) : null}

          {!isLoading && !key && matches.length > 0 ? (
            <Text className="px-4 pb-1 pt-3 text-[11.5px] font-semibold uppercase text-ink-faint">{suggestionsTitle}</Text>
          ) : null}

          {!isLoading && matches.length > 0 ? (
            // Toute la liste reste atteignable (34 mentions) : elle défile dans sa propre zone.
            <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {matches.map((suggestion) => (
                <PressableScale key={suggestion} onPress={() => choose(suggestion)} accessibilityLabel={t("ui.fieldCombobox.choose", { suggestion })}>
                  <View className="border-t border-line-soft px-4 py-3">
                    <Text className="text-[14.5px] font-semibold text-ink">{suggestion}</Text>
                  </View>
                </PressableScale>
              ))}
            </ScrollView>
          ) : null}

          {!isLoading && !loadError && key && matches.length === 0 && !canUseAsIs ? (
            <Text className="px-4 py-3.5 text-[13px] text-ink-faint">{t("common.noResults")}</Text>
          ) : null}

          {canUseAsIs ? (
            <PressableScale onPress={() => choose(text)} accessibilityLabel={t("ui.fieldCombobox.useAsAField", { text })}>
              <View className="flex-row items-center gap-2.5 border-t border-line-soft bg-primary-tint/30 px-4 py-3.5">
                <PlusIcon size={16} color="#332E86" />
                <Text className="flex-1 text-[14px] font-bold text-primary">{t("ui.fieldCombobox.useAsAField", { text })}</Text>
              </View>
            </PressableScale>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
