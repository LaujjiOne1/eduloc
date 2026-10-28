import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronRightIcon, HouseIcon, StarIcon, VerifiedBadgeIcon, VideoIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { TutorAvatar } from "@/components/ui/tutor-avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useTutor } from "@/hooks/use-tutor";
import type { Tutor, TutorOfferSummary } from "@/types/tutor";
import { useTranslation } from "react-i18next";
import { t as tr } from "@/i18n";

function offerRoute(id: string): Href {
  // Route already exists as of this task (src/app/results/offer/[id].tsx).
  return `/results/offer/${id}` as Href;
}

const FORMAT_LABELS: Record<string, string> = { get in_person() { return tr("common.inPerson"); }, get online() { return tr("common.online"); } };

export function TutorProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, retry } = useTutor(id);

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
        <TutorProfileContent
          tutor={state.tutor}
          insetsBottom={insets.bottom}
          onSelectOffer={(offerId) => router.push(offerRoute(offerId))}
        />
      )}
    </View>
  );
}

type TutorProfileContentProps = {
  tutor: Tutor;
  insetsBottom: number;
  onSelectOffer: (offerId: string) => void;
};

function TutorProfileContent({ tutor, insetsBottom, onSelectOffer }: TutorProfileContentProps) {
  const { t } = useTranslation();
  const firstOffer = tutor.offers[0];

  return (
    <>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={30}>
          <View className="items-center pb-5 pt-[6px]">
            <View className="mb-[14px]">
              <TutorAvatar gender={tutor.gender} photoUrl={tutor.photoUrl} size={88} />
            </View>
            <Text className="text-[21px] font-bold text-ink">
              {tutor.firstName} {tutor.lastName}
            </Text>
            <View className="mt-[6px] flex-row items-center gap-[6px]">
              <StarIcon size={14} color="#BD7E28" />
              <Text className="text-[13.5px] font-bold text-ink">
                {tutor.rating.toFixed(1)} <Text className="font-medium text-ink-faint">{t("common.reviews", { reviewCount: tutor.reviewCount })}</Text>
              </Text>
            </View>
            {tutor.isVerified ? (
              <View className="mt-2 flex-row items-center gap-[6px] rounded-full bg-accent-tint px-[11px] py-[5px]">
                <VerifiedBadgeIcon size={12} color="#0E9C82" />
                <Text className="text-[12px] font-semibold text-accent">{t("results.tutorProfile.verifiedTutor")}</Text>
              </View>
            ) : null}
          </View>
        </FadeIn>

        <FadeIn delay={70}>
          <View className="mb-[22px]">
            <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
              {t("common.about")}</Text>
            <Text className="text-[14.5px] leading-[22px] text-ink-soft">{tutor.bio}</Text>
          </View>
        </FadeIn>

        <FadeIn delay={100}>
          <View className="mb-[22px]">
            <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
              {t("results.tutorProfile.subjects")}</Text>
            <View className="flex-row flex-wrap gap-2">
              {tutor.subjects.map((subject) => (
                <Chip key={subject} label={subject} />
              ))}
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={130}>
          <View className="mb-[22px]">
            <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
              {t("results.tutorProfile.levels")}</Text>
            <Text className="text-[14.5px] font-semibold text-ink">{tutor.levels.join(" • ")}</Text>
          </View>
        </FadeIn>

        <FadeIn delay={160}>
          <View className="mb-[22px]">
            <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
              {t("results.tutorProfile.formats")}</Text>
            <View className="flex-row gap-[18px]">
              {tutor.formats.includes("in_person") ? (
                <View className="flex-row items-center gap-[7px]">
                  <HouseIcon size={16} color="#585B78" />
                  <Text className="text-[14px] font-semibold text-ink">{t("common.inPerson")}</Text>
                </View>
              ) : null}
              {tutor.formats.includes("online") ? (
                <View className="flex-row items-center gap-[7px]">
                  <VideoIcon size={16} color="#585B78" />
                  <Text className="text-[14px] font-semibold text-ink">{t("common.online")}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={190}>
          <View>
            <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">
              {t("results.tutorProfile.offers")}</Text>
            {tutor.offers.map((offer) => (
              <OfferRow key={offer.id} offer={offer} onPress={() => onSelectOffer(offer.id)} />
            ))}
          </View>
        </FadeIn>
      </ScrollView>

      <View className="border-t border-line-soft bg-surface px-5 pt-4" style={{ paddingBottom: Math.max(insetsBottom, 22) }}>
        <Button
          label={t("results.tutorProfile.viewTheOffer")}
          disabled={!firstOffer}
          onPress={() => firstOffer && onSelectOffer(firstOffer.id)}
        />
      </View>
    </>
  );
}

function OfferRow({ offer, onPress }: { offer: TutorOfferSummary; onPress: () => void }) {
  const formatLabel = offer.formats.map((f) => FORMAT_LABELS[f]).join(" / ");
  return (
    <PressableScale onPress={onPress} accessibilityLabel={offer.title}>
      <View className="mb-[10px] flex-row items-center justify-between rounded-lg border border-line bg-surface p-4">
        <View>
          <Text className="text-[15px] font-bold text-ink">{offer.title}</Text>
          <Text className="mt-[3px] text-[12.5px] text-ink-soft">
            {offer.durationLabel} • {formatLabel}
          </Text>
        </View>
        <ChevronRightIcon size={17} color="#9799AF" />
      </View>
    </PressableScale>
  );
}
