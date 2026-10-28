import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronRightIcon, PlusIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { useMyBeneficiaries } from "@/hooks/use-my-beneficiaries";
import type { SavedBeneficiary } from "@/types/beneficiary";
import { useTranslation } from "react-i18next";

const ADD_BENEFICIARY_ROUTE = "/beneficiaries/new" as Href;

export function BeneficiariesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, retry } = useMyBeneficiaries();

  // Reload whenever this screen regains focus (e.g. returning from "Ajouter
  // un bénéficiaire") so a newly added entry shows up immediately.
  useFocusEffect(
    useCallback(() => {
      retry();
    }, [retry]),
  );

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <Text className="px-5 pb-4 text-[24px] font-bold text-ink">{t("beneficiaries.beneficiaries.myBeneficiaries")}</Text>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {state.status === "loading" ? (
          <View className="gap-[10px]">
            {[0, 1, 2].map((i) => (
              <View key={i} className="h-[72px] rounded-lg bg-line-soft" />
            ))}
          </View>
        ) : state.status === "error" ? (
          <View className="flex-row items-center gap-3">
            <Text className="flex-1 text-[13.5px] text-error">{state.message}</Text>
            <PressableScale onPress={retry} accessibilityLabel={t("common.tryAgain")}>
              <Text className="text-[13.5px] font-semibold text-primary">{t("common.tryAgain")}</Text>
            </PressableScale>
          </View>
        ) : (
          state.beneficiaries.map((beneficiary, index) => (
            <FadeIn key={beneficiary.id} delay={40 + index * 50}>
              <BeneficiaryCard beneficiary={beneficiary} />
            </FadeIn>
          ))
        )}
      </ScrollView>

      <View
        className="border-t border-line-soft bg-surface px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 22) }}
      >
        <Button
          label={t("common.addABeneficiary")}
          icon={<PlusIcon size={17} color="#fff" />}
          onPress={() => router.push(ADD_BENEFICIARY_ROUTE)}
          fullWidth
        />
      </View>
    </View>
  );
}

// The mock's cards carry no href (unlike "Ajouter un bénéficiaire" below) —
// no per-row destination is defined in this batch, so rows stay static
// rather than faking a navigation target (AGENTS.md §4/§11).
function BeneficiaryCard({ beneficiary }: { beneficiary: SavedBeneficiary }) {
  const { t } = useTranslation();
  const initial = beneficiary.firstName.charAt(0).toUpperCase();
  const subtitle = beneficiary.isSelf
    ? t("beneficiaries.beneficiaries.forMe", { value: beneficiary.level?.label ?? "—" })
    : `${beneficiary.relationLabel ?? "—"} • ${beneficiary.level?.label ?? "—"}`;

  return (
    <View className="mb-[10px] flex-row items-center gap-[14px] rounded-lg border border-line bg-surface p-4">
      <View className="h-11 w-11 items-center justify-center rounded-full bg-violet-tint">
        <Text className="text-[15px] font-bold text-violet">{initial}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-bold text-ink">
          {beneficiary.firstName}
          {beneficiary.isSelf ? t("beneficiaries.beneficiaries.you") : ""}
        </Text>
        <Text className="mt-[2px] text-[12.5px] text-ink-soft">{subtitle}</Text>
      </View>
      <ChevronRightIcon size={16} color="#9799AF" />
    </View>
  );
}
