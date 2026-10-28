import { Text, View } from "react-native";

import { AlertTriangleIcon } from "@/components/icons";

type InlineWarningProps = {
  message: string;
  /** Marge basse (les champs de formulaire en ont une de 14). */
  spaced?: boolean;
};

/** Petit avertissement discret : une information manque ou est incertaine, sans rien bloquer. */
export function InlineWarning({ message, spaced }: InlineWarningProps) {
  return (
    <View className={["flex-row items-start gap-1.5", spaced ? "mb-[14px]" : "mt-1"].join(" ")} accessibilityRole="alert">
      <View className="mt-[2px]">
        <AlertTriangleIcon size={12} color="#B7791F" />
      </View>
      <Text className="flex-1 text-[12px] leading-[16px] text-[#B7791F]">{message}</Text>
    </View>
  );
}
