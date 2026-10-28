import { type Href, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PlusIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { TutorBottomNav } from "@/components/ui/tutor-bottom-nav";
import { useTutorOffers } from "@/hooks/use-tutor-offers";
import type { Offer } from "@/types/offer";
import { useTranslation } from "react-i18next";

const NEW_OFFER_ROUTE = "/tutor-dashboard/offers/new" as Href;
function editOfferRoute(id: string): Href {
  return `/tutor-dashboard/offers/${id}` as Href;
}

export function OffersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, retry } = useTutorOffers();

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <Text className="px-5 pb-4 text-[25px] font-bold text-ink">{t("tutorDashboard.offers.myOffers")}</Text>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        {state.status === "loading" ? (
          <View className="gap-3">
            {[0, 1].map((i) => (
              <View key={i} className="h-[92px] rounded-lg bg-line-soft" />
            ))}
          </View>
        ) : state.status === "error" ? (
          <View className="flex-row items-center gap-3">
            <Text className="flex-1 text-[13.5px] text-error">{state.message}</Text>
            <PressableScale onPress={retry} accessibilityLabel={t("common.tryAgain")}>
              <Text className="text-[13.5px] font-semibold text-primary">{t("common.tryAgain")}</Text>
            </PressableScale>
          </View>
        ) : state.status === "empty" ? (
          <View className="items-center py-10">
            <Text className="text-center text-[14px] text-ink-soft">{t("tutorDashboard.offers.youHaveNotCreatedAn")}</Text>
          </View>
        ) : (
          state.offers.map((offer, index) => (
            <FadeIn key={offer.id} delay={40 + index * 50}>
              <OfferCard offer={offer} onEdit={() => router.push(editOfferRoute(offer.id))} />
            </FadeIn>
          ))
        )}
      </ScrollView>

      <View className="border-t border-line-soft bg-surface px-5 pt-4" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
        <Button label={t("common.newOffer")} icon={<PlusIcon size={17} color="#fff" />} onPress={() => router.push(NEW_OFFER_ROUTE)} />
      </View>

      <TutorBottomNav active="offers" />
    </View>
  );
}

function OfferCard({ offer, onEdit }: { offer: Offer; onEdit: () => void }) {
  const { t } = useTranslation();
  return (
    <View className="mb-3 rounded-lg border border-line bg-surface p-4">
      <View className="flex-row items-start justify-between">
        <View>
          <Text className="text-[15px] font-bold text-ink">{offer.title}</Text>
          <Text className="mt-[2px] text-[13px] text-ink-soft">{offer.levelLabel}</Text>
        </View>
        <OfferStatusBadge isActive={offer.isActive} />
      </View>
      <PressableScale onPress={onEdit} accessibilityLabel={t("common.edit2", { title: offer.title })}>
        <Text className="mt-3 text-[13px] font-bold text-primary">{t("common.edit")}</Text>
      </PressableScale>
    </View>
  );
}

export function OfferStatusBadge({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation();
  return (
    <View
      className={[
        "flex-row items-center gap-[6px] self-start rounded-full px-[11px] py-[5px]",
        isActive ? "bg-accent-tint" : "bg-paper-alt",
      ].join(" ")}
    >
      <View className={["h-[7px] w-[7px] rounded-full", isActive ? "bg-accent" : "bg-ink-soft"].join(" ")} />
      <Text className={["text-[12px] font-semibold", isActive ? "text-accent" : "text-ink-soft"].join(" ")}>
        {isActive ? t("tutorDashboard.offers.active") : t("tutorDashboard.offers.deactivated")}
      </Text>
    </View>
  );
}
