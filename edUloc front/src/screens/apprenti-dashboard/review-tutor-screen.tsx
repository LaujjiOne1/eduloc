import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StarIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { useMyBooking } from "@/hooks/use-my-booking";
import { useSubmitReview } from "@/hooks/use-submit-review";
import { useTranslation } from "react-i18next";

const DASHBOARD_ROUTE = "/apprenti-dashboard" as Href;
const RATING_VALUES = [1, 2, 3, 4, 5] as const;

export function ReviewTutorScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useMyBooking(id);
  const { state: submitState, submit } = useSubmitReview();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const isSubmitting = submitState.status === "loading";
  const canSubmit = rating > 0 && !isSubmitting;

  const handleSubmit = async (bookingId: string) => {
    if (rating < 1) return;
    const ok = await submit(bookingId, { rating, text: comment.trim() });
    if (ok) router.replace(DASHBOARD_ROUTE);
  };

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />

      {state.status === "loading" ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#332E86" />
        </View>
      ) : state.status === "error" || state.booking.status !== "completed" ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-[14px] text-error">
            {state.status === "error" ? state.message : t("apprentiDashboard.reviewTutor.youWillBeAbleTo")}
          </Text>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20, alignItems: "center" }} showsVerticalScrollIndicator={false}>
          <Text className="mb-6 text-center text-[22px] font-bold text-ink">{t("apprentiDashboard.reviewTutor.howDidTheSessionGo")}</Text>

          <View className="mb-7 flex-row justify-center gap-2">
            {RATING_VALUES.map((value) => (
              <PressableScale key={value} onPress={() => setRating(value)} accessibilityLabel={t("apprentiDashboard.reviewTutor.starCount", { count: value })}>
                <StarIcon size={30} color="#BD7E28" filled={value <= rating} />
              </PressableScale>
            ))}
          </View>

          {submitState.status === "error" ? (
            <View className="w-full">
              <FormError message={submitState.message} />
            </View>
          ) : null}

          <View className="w-full">
            <Text className="mb-[6px] ml-0.5 text-[12.5px] font-semibold uppercase tracking-[0.03em] text-ink-soft">{t("apprentiDashboard.reviewTutor.yourComment")}</Text>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder={t("apprentiDashboard.reviewTutor.shareYourExperience")}
              placeholderTextColor="#9799AF"
              multiline
              textAlignVertical="top"
              accessibilityLabel={t("apprentiDashboard.reviewTutor.yourComment")}
              className="rounded-sm border border-line bg-surface px-[14px] py-[13px] text-[15px] text-ink"
              style={{ height: 110 }}
            />
          </View>
        </ScrollView>
      )}

      {state.status === "success" && state.booking.status === "completed" ? (
        <View className="border-t border-line-soft bg-surface px-5 pt-4" style={{ paddingBottom: Math.max(insets.bottom, 22) }}>
          <Button
            label={t("common.send")}
            fullWidth
            disabled={!canSubmit}
            loading={isSubmitting}
            loadingLabel={t("common.sending")}
            onPress={() => handleSubmit(state.booking.id)}
          />
        </View>
      ) : null}
    </View>
  );
}
