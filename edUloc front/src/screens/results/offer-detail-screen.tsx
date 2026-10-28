import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ClockIcon, LocationIcon, SubjectIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { TutorAvatar } from "@/components/ui/tutor-avatar";
import { Button } from "@/components/ui/button";
import { useOffer } from "@/hooks/use-offer";
import { useBookingWizardStore } from "@/store/booking-wizard.store";
import type { Offer } from "@/types/offer";
import { useTranslation } from "react-i18next";
import { t as tr } from "@/i18n";

// Cast defensively since expo-router's typed-routes union is only refreshed
// when the dev server runs (same convention as every other route in this app).
const BOOK_DATE_ROUTE = "/results/book" as Href;

const FORMAT_LABELS: Record<string, string> = { get in_person() { return tr("common.inPerson"); }, get online() { return tr("common.online"); } };

export function OfferDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, retry } = useOffer(id);

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />

      {state.status === "loading" ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#332E86" />
        </View>
      ) : state.status === "error" ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text className="text-center text-[14px] text-error">{state.message}</Text>
          <PressableScale onPress={retry} accessibilityLabel={t("common.tryAgain")}>
            <Text className="text-[14px] font-semibold text-primary">{t("common.tryAgain")}</Text>
          </PressableScale>
        </View>
      ) : (
        <OfferDetailContent
          offer={state.offer}
          insetsBottom={insets.bottom}
          onBook={() => {
            // Le créneau se choisit à l'étape suivante, sur le calendrier de réservation.
            useBookingWizardStore.getState().setOffer(state.offer);
            router.push(BOOK_DATE_ROUTE);
          }}
        />
      )}
    </View>
  );
}

type OfferDetailContentProps = {
  offer: Offer;
  insetsBottom: number;
  onBook: () => void;
};

function OfferDetailContent({ offer, insetsBottom, onBook }: OfferDetailContentProps) {
  const { t } = useTranslation();
  const formatPrimary = offer.formats[0] ? FORMAT_LABELS[offer.formats[0]] : null;
  const formatSecondary = offer.formats[1] ? FORMAT_LABELS[offer.formats[1]] : null;

  return (
    <>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={30}>
          <Text className="mb-1 text-[24px] font-bold text-ink">{offer.title}</Text>
          <View className="mb-5 flex-row items-center gap-2">
            <TutorAvatar gender={offer.tutorGender} photoUrl={offer.tutorPhotoUrl} size={26} />
            <Text className="text-[14px] text-ink-soft">{t("common.with", { tutorName: offer.tutorName })}</Text>
          </View>
        </FadeIn>

        <FadeIn delay={70}>
          <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
            {t("common.description")}</Text>
          <Text className="mb-5 text-[14.5px] leading-[22px] text-ink-soft">{offer.description}</Text>
        </FadeIn>

        <FadeIn delay={100}>
          <View className="mb-5 flex-row gap-3">
            <StatCard icon={<ClockIcon size={18} color="#332E86" />} value={offer.durationLabel} label={t("common.duration3")} />
            <StatCard
              icon={<SubjectIcon size={18} color="#332E86" />}
              value={formatPrimary ?? "—"}
              label={formatSecondary ? `/ ${formatSecondary}` : t("common.format")}
            />
            <StatCard icon={<LocationIcon size={18} color="#332E86" />} value={offer.location} label={t("common.place")} />
          </View>
        </FadeIn>

      </ScrollView>

      <View className="border-t border-line-soft bg-surface px-5 pt-4" style={{ paddingBottom: Math.max(insetsBottom, 22) }}>
        <Button label={t("results.offerDetail.chooseASlot")} onPress={onBook} />
      </View>
    </>
  );
}

type StatCardProps = {
  icon: ReactNode;
  value: string;
  label: string;
};

function StatCard({ icon, value, label }: StatCardProps) {
  return (
    <View className="flex-1 items-center rounded-lg border border-line bg-surface p-[14px]">
      <View className="mb-[6px]">{icon}</View>
      <Text className="text-[14px] font-bold text-ink" numberOfLines={1}>
        {value}
      </Text>
      <Text className="text-[11.5px] text-ink-soft">{label}</Text>
    </View>
  );
}
