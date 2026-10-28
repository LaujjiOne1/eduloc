import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronRightIcon, LanguagesIcon, XIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { RadioCard } from "@/components/ui/selectable-card";
import { useLanguage } from "@/hooks/use-language";

type LanguageSelectorProps = {
  /** « pill » : petit bouton (FR / EN) pour un en-tête ; « row » : ligne de la liste des paramètres. */
  variant?: "pill" | "row";
};

/** Choix de la langue de l'application. La liste vient du registre `@/i18n/registry` : ajouter une langue l'ajoute ici. */
export function LanguageSelector({ variant = "pill" }: LanguageSelectorProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { language, languages, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const current = languages.find((item) => item.code === language);

  const choose = (code: (typeof languages)[number]["code"]) => {
    setOpen(false);
    if (code !== language) setLanguage(code);
  };

  return (
    <>
      {variant === "pill" ? (
        <PressableScale onPress={() => setOpen(true)} accessibilityLabel={t("ui.languageSelector.currentLanguage", { language: current?.label ?? "" })}>
          <View className="flex-row items-center gap-[6px] rounded-full border border-line bg-surface px-3 py-[7px]">
            <LanguagesIcon size={15} color="#585B78" />
            <Text className="text-[12.5px] font-bold uppercase text-ink-soft">{language}</Text>
          </View>
        </PressableScale>
      ) : (
        <PressableScale onPress={() => setOpen(true)} accessibilityLabel={t("ui.languageSelector.currentLanguage", { language: current?.label ?? "" })}>
          <View className="flex-row items-center gap-[14px] py-[13px]">
            <LanguagesIcon size={18} color="#585B78" />
            <Text className="flex-1 text-[14.5px] font-semibold text-ink">{t("ui.languageSelector.language")}</Text>
            <Text className="text-[13.5px] text-ink-soft">{current?.label}</Text>
            <ChevronRightIcon size={16} color="#9799AF" />
          </View>
        </PressableScale>
      )}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/45" onPress={() => setOpen(false)} accessibilityLabel={t("ui.languageSelector.close")}>
          <Pressable onPress={(event) => event.stopPropagation()}>
            <View className="rounded-t-2xl bg-surface p-5" style={{ paddingBottom: Math.max(insets.bottom, 24) }}>
              <View className="mb-4 flex-row items-center justify-between border-b border-line-soft pb-3">
                <View className="flex-1 pr-3">
                  <Text className="text-[17px] font-bold text-ink">{t("ui.languageSelector.language")}</Text>
                  <Text className="text-[12px] text-ink-soft">{t("ui.languageSelector.chooseTheAppLanguage")}</Text>
                </View>
                <PressableScale onPress={() => setOpen(false)} accessibilityLabel={t("ui.languageSelector.close")}>
                  <View className="rounded-full bg-paper p-1.5">
                    <XIcon size={16} color="#606482" />
                  </View>
                </PressableScale>
              </View>
              <View className="gap-[10px]">
                {languages.map((item) => (
                  <RadioCard key={item.code} label={item.label} selected={item.code === language} onPress={() => choose(item.code)} />
                ))}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
