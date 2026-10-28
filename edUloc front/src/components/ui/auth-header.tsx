import { Text, View } from "react-native";

import { ArrowLeftIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

type AuthHeaderProps = {
  onBack: () => void;
  /** Élément affiché à droite de l'en-tête (ex. sélecteur de langue). */
  right?: ReactNode;
};

/** Back button + EduLoc wordmark, shared by the Login and Signup screens. */
export function AuthHeader({ onBack, right }: AuthHeaderProps) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center gap-3 px-5 pb-[14px] pt-[18px]">
      <PressableScale onPress={onBack} accessibilityLabel={t("common.back")}>
        <View className="h-9 w-9 items-center justify-center rounded-full border border-line">
          <ArrowLeftIcon color="#14162B" />
        </View>
      </PressableScale>
      <Text className="text-[21px] font-bold text-ink">
        edU<Text className="text-primary">loc</Text>
      </Text>
      {right ? <View className="ml-auto">{right}</View> : null}
    </View>
  );
}
