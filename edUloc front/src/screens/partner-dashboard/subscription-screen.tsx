import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { ToneBadge } from "@/components/ui/tone-badge";
import { usePartnerAction } from "@/hooks/use-partner-action";
import { usePartnerSubscription } from "@/hooks/use-partner-subscription";
import { usePartnerVenue } from "@/hooks/use-partner-venue";
import { SUBSCRIPTION_LABELS } from "@/lib/partner-labels";
import { PartnerService } from "@/services/partner.service";
import type { PartnerPlan, SubscriptionStatusId } from "@/types/partner";
import { useTranslation } from "react-i18next";

const STATUS_TONE: Record<SubscriptionStatusId, "neutral" | "warning" | "success" | "error"> = {
  not_selected: "neutral",
  pending: "warning",
  active: "success",
  expired: "error",
  cancelled: "error",
};

/**
 * Offre commerciale de la structure (couvre toutes ses salles). Elle se choisit APRÈS la validation de la structure et
 * d'au moins une salle, et AVANT la publication. Prix, durée et renouvellement viennent du serveur.
 */
export function PartnerSubscriptionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, reload, apply } = usePartnerSubscription();
  const { state: venueState } = usePartnerVenue();
  const { busy, error, run } = usePartnerAction();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const venue = venueState.status === "ready" ? venueState.venue : null;
  // Le serveur applique la même règle ; on évite simplement de proposer une action vouée à l'échec.
  const eligible = !!venue && venue.status === "approved" && venue.rooms.some((r) => r.status === "approved");

  const select = async (plan: PartnerPlan) => {
    const result = await run(`plan-${plan.id}`, () => PartnerService.selectPlan(plan.id), t("partnerDashboard.subscription.unableToChooseThisPlan"));
    if (result) apply(result);
  };
  const cancel = async () => {
    const result = await run("cancel", () => PartnerService.cancelSubscription(), t("partnerDashboard.subscription.unableToCancelThePlan"));
    if (result) {
      apply(result);
      setConfirmCancel(false);
    }
  };

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <Text className="mb-1 text-[24px] font-bold text-ink">{t("common.commercialPlan")}</Text>
        <Text className="mb-5 text-[13.5px] leading-[20px] text-ink-soft">
          {t("partnerDashboard.subscription.thePlanCoversAllThe")}</Text>

        {error ? (
          <View className="mb-3">
            <FormError message={error} />
          </View>
        ) : null}

        {state.status === "loading" ? (
          <View className="gap-3">
            {[0, 1].map((i) => (
              <View key={i} className="h-[92px] rounded-lg bg-line-soft" />
            ))}
          </View>
        ) : state.status === "error" ? (
          <View className="flex-row items-center gap-3">
            <Text className="flex-1 text-[13.5px] text-error">{state.message}</Text>
            <PressableScale onPress={reload} accessibilityLabel={t("common.tryAgain")}>
              <Text className="text-[13.5px] font-semibold text-primary">{t("common.tryAgain")}</Text>
            </PressableScale>
          </View>
        ) : (
          <>
            <FadeIn delay={30}>
              <View className="rounded-lg border border-line bg-surface p-4">
                <View className="flex-row items-start justify-between gap-3">
                  <Text className="flex-1 text-[15px] font-bold text-ink">{state.subscription.plan?.name ?? t("partnerDashboard.subscription.noPlanChosen")}</Text>
                  <ToneBadge label={SUBSCRIPTION_LABELS[state.subscription.status]} tone={STATUS_TONE[state.subscription.status]} />
                </View>
                {state.subscription.validUntilLabel ? <Text className="mt-2 text-[13px] text-ink-soft">{t("partnerDashboard.subscription.active", { validUntilLabel: state.subscription.validUntilLabel })}</Text> : null}
                {state.subscription.status === "pending" ? (
                  <Text className="mt-2 text-[13px] leading-[19px] text-ink-soft">
                    {t("partnerDashboard.subscription.yourRequestIsRegisteredThe")}</Text>
                ) : null}
                {state.subscription.status === "expired" ? (
                  <Text className="mt-2 text-[13px] leading-[19px] text-error">{t("partnerDashboard.subscription.yourRoomsAreNoLonger")}</Text>
                ) : null}

                {state.subscription.status === "active" || state.subscription.status === "pending" ? (
                  confirmCancel ? (
                    <View className="mt-3 rounded-md bg-error-tint p-3">
                      <Text className="mb-3 text-[13px] leading-[19px] text-ink">
                        {t("partnerDashboard.subscription.cancellingThePlanMakesAll")}</Text>
                      <View className="flex-row gap-[10px]">
                        <Button label={t("partnerDashboard.subscription.keepThePlan")} variant="ghost" size="sm" disabled={busy !== null} onPress={() => setConfirmCancel(false)} />
                        <Button label={t("common.confirmTheCancellation")} size="sm" loading={busy === "cancel"} loadingLabel={t("common.cancelling")} disabled={busy !== null} onPress={cancel} />
                      </View>
                    </View>
                  ) : (
                    <PressableScale onPress={() => setConfirmCancel(true)} accessibilityLabel={t("partnerDashboard.subscription.cancelThePlan")}>
                      <Text className="mt-3 text-[13px] font-bold text-error">{t("partnerDashboard.subscription.cancelThePlan")}</Text>
                    </PressableScale>
                  )
                ) : null}
              </View>
            </FadeIn>

            {state.subscription.status === "active" || state.subscription.status === "pending" ? null : (
              <FadeIn delay={70}>
                <Text className="mb-2 mt-6 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("partnerDashboard.subscription.availablePlans")}</Text>
                {!eligible ? (
                  <View className="mb-3 rounded-lg border border-line bg-paper-alt p-4">
                    <Text className="text-[13px] leading-[19px] text-ink-soft">
                      {t("partnerDashboard.subscription.youWillBeAbleTo")}</Text>
                  </View>
                ) : null}
                {state.plans.length === 0 ? (
                  <Text className="text-[13.5px] text-ink-soft">{t("partnerDashboard.subscription.noPlanIsOfferedAt")}</Text>
                ) : (
                  state.plans.map((plan) => (
                    <View key={plan.id} className="mb-3 rounded-lg border border-line bg-surface p-4">
                      <Text className="text-[15px] font-bold text-ink">{plan.name}</Text>
                      <Text className="mt-[2px] text-[13px] text-ink-soft">
                        {plan.priceLabel} · {plan.durationLabel}
                      </Text>
                      {plan.description ? <Text className="mt-2 text-[12.5px] leading-[18px] text-ink-soft">{plan.description}</Text> : null}
                      <View className="mt-3">
                        <Button
                          label={plan.isFree ? t("partnerDashboard.subscription.activateThisPlan") : t("partnerDashboard.subscription.requestThisPlan")}
                          size="sm"
                          loading={busy === `plan-${plan.id}`}
                          loadingLabel={t("common.pleaseWait")}
                          disabled={!eligible || busy !== null}
                          onPress={() => select(plan)}
                        />
                      </View>
                      {!plan.isFree ? (
                        <Text className="mt-2 text-[12px] leading-[17px] text-ink-faint">
                          {t("partnerDashboard.subscription.onlinePaymentIsNotAvailable")}</Text>
                      ) : null}
                    </View>
                  ))
                )}
              </FadeIn>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
