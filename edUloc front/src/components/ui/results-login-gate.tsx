import { Text, View } from "react-native";

import { FadeIn } from "@/components/motion/fade-in";
import { Button } from "@/components/ui/button";
import { TutorAvatar } from "@/components/ui/tutor-avatar";
import type { TutorGender } from "@/types/common";
import { useTranslation } from "react-i18next";

type ResultsLoginGateProps = {
  /** Nombre de tuteurs disponibles près de chez le visiteur. */
  count: number;
  /** Silhouettes d'aperçu (jamais les photos, ni les noms) — au plus quelques-unes. */
  genders: (TutorGender | null)[];
  onLogin: () => void;
  onSignup: () => void;
};

/**
 * Visiteur non connecté : on annonce combien de tuteurs sont disponibles près de lui, mais les résultats
 * (profils, tarifs, créneaux) ne s'affichent qu'après connexion.
 */
export function ResultsLoginGate({ count, genders, onLogin, onSignup }: ResultsLoginGateProps) {
  const { t } = useTranslation();
  const preview = genders.slice(0, 4);
  return (
    <FadeIn delay={80}>
      <View className="mx-5 mt-2 items-center rounded-2xl border border-line bg-surface px-5 py-8">
        {preview.length > 0 ? (
          <View className="mb-5 flex-row">
            {preview.map((gender, index) => (
              <View
                key={index}
                className="rounded-full border-[3px] border-surface"
                style={{ marginLeft: index === 0 ? 0 : -14 }}
              >
                <TutorAvatar gender={gender} size={52} />
              </View>
            ))}
            {count > preview.length ? (
              <View
                className="h-[58px] w-[58px] items-center justify-center rounded-full border-[3px] border-surface bg-primary"
                style={{ marginLeft: -14 }}
              >
                <Text className="text-[14px] font-bold text-white">+{count - preview.length}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Text className="text-center text-[34px] font-bold leading-[38px] text-primary">{count}</Text>
        <Text className="mt-1 text-center text-[18px] font-bold text-ink">
          {t("ui.resultsLoginGate.tutorsAvailableNearYou", { count })}
        </Text>
        <Text className="mt-2 max-w-[300px] text-center text-[13.5px] leading-[20px] text-ink-soft">
          {t("ui.resultsLoginGate.signInToSeeThe")}</Text>

        <View className="mt-6 w-full gap-3">
          <Button label={t("common.signIn")} onPress={onLogin} />
          <Button label={t("common.createAnAccount")} variant="secondary" onPress={onSignup} />
        </View>
      </View>
    </FadeIn>
  );
}
