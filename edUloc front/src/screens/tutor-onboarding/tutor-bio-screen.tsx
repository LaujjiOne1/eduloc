import { type Href, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AttachIcon, TrashIcon, VideoIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { StepProgress } from "@/components/ui/step-progress";
import { useTutorApplicationStore } from "@/store/tutor-application.store";
import { useTranslation } from "react-i18next";

const TUTOR_OFFER_ROUTE = "/tutor-offer" as Href;
const TOTAL_STEPS = 9;

export function TutorBioScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const introVideo = useTutorApplicationStore((s) => s.introVideo);
  const setIntroVideo = useTutorApplicationStore((s) => s.setIntroVideo);
  const [isPickingVideo, setIsPickingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const canContinue = introVideo !== null;

  const handlePickVideo = async () => {
    setVideoError(null);
    setIsPickingVideo(true);

    try {
      if (Platform.OS === "ios") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setVideoError(t("tutorOnboarding.tutorBio.accessToYourPhotoLibrary"));
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsEditing: false,
      });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const fileSize = asset.fileSize ?? (await (await fetch(asset.uri)).blob()).size;
      if (fileSize <= 0) {
        setVideoError(t("tutorOnboarding.tutorBio.unableToReadTheSize"));
        return;
      }
      if (fileSize > 100 * 1024 * 1024) {
        setVideoError(t("tutorOnboarding.tutorBio.theVideoMustBe100"));
        return;
      }
      setIntroVideo({
        uri: asset.uri,
        fileName: asset.fileName ?? "video-presentation",
        mimeType: asset.mimeType ?? "video/mp4",
        fileSize,
        duration: asset.duration ?? null,
      });
    } catch (error) {
      setVideoError(
        error instanceof Error
          ? t("tutorOnboarding.tutorBio.unableToOpenTheVideo", { message: error.message })
          : t("tutorOnboarding.tutorBio.unableToOpenTheVideo2"),
      );
    } finally {
      setIsPickingVideo(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-paper"
      style={{ paddingTop: insets.top }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AuthHeader onBack={() => router.back()} />
      <StepProgress step={5} total={TOTAL_STEPS} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={40}>
          <Text className="mb-1 text-[24px] font-bold text-ink">{t("tutorOnboarding.tutorBio.introduceYourselfInAVideo")}</Text>
          <Text className="mb-5 text-[13.5px] text-ink-soft">
            {t("tutorOnboarding.tutorBio.addAShortVideoSo")}</Text>
        </FadeIn>

        <FadeIn delay={90}>
          <View className="mb-6 rounded-xl border border-dashed border-primary/40 bg-primary-tint/10 p-4">
            {introVideo ? (
              <View className="flex-row items-center gap-3">
                <View className="h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <VideoIcon size={23} color="#332E86" />
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-bold text-ink" numberOfLines={1}>
                    {introVideo.fileName}
                  </Text>
                  <Text className="mt-1 text-[12px] text-ink-soft">
                    {[formatDuration(introVideo.duration), formatFileSize(introVideo.fileSize)]
                      .filter(Boolean)
                      .join(" · ") || t("tutorOnboarding.tutorBio.videoSelected")}
                  </Text>
                </View>
                <PressableScale
                  onPress={() => {
                    setIntroVideo(null);
                    setVideoError(null);
                  }}
                  accessibilityLabel={t("tutorOnboarding.tutorBio.deleteTheVideo")}
                >
                  <View className="p-2">
                    <TrashIcon size={17} color="#E04F5F" />
                  </View>
                </PressableScale>
              </View>
            ) : (
              <View className="items-center py-3">
                <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <VideoIcon size={26} color="#332E86" />
                </View>
                <Text className="mb-1 text-[15px] font-bold text-ink">{t("tutorOnboarding.tutorBio.yourPresentationVideo")}</Text>
                <Text className="mb-4 text-center text-[12.5px] text-ink-soft">
                  {t("tutorOnboarding.tutorBio.selectAVideoFromYour")}</Text>
              </View>
            )}

            <Button
              label={introVideo ? t("tutorOnboarding.tutorBio.replaceTheVideo") : t("tutorOnboarding.tutorBio.chooseAVideo")}
              onPress={handlePickVideo}
              loading={isPickingVideo}
              loadingLabel={t("tutorOnboarding.tutorBio.opening")}
              icon={!isPickingVideo ? <AttachIcon size={15} color="#fff" /> : undefined}
              className="py-3"
            />
            {videoError ? (
              <Text className="mt-3 text-[12px] text-red-600" accessibilityRole="alert">
                {videoError}
              </Text>
            ) : null}
            <Text className="mt-3 text-center text-[11.5px] text-ink-faint">
              {t("tutorOnboarding.tutorBio.theVideoWillBeSent")}</Text>
          </View>

        </FadeIn>
      </ScrollView>

      <View
        className="border-t border-line-soft bg-surface px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 22) }}
      >
        <Button label={t("common.continue")} disabled={!canContinue} onPress={() => router.push(TUTOR_OFFER_ROUTE)} />
      </View>
    </KeyboardAvoidingView>
  );
}

function formatDuration(duration: number | null) {
  if (duration === null) return null;
  const seconds = Math.floor(duration / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatFileSize(fileSize: number | null) {
  if (fileSize === null) return null;
  if (fileSize < 1024 * 1024) return `${Math.max(1, Math.round(fileSize / 1024))} Ko`;
  return `${(fileSize / (1024 * 1024)).toFixed(1)} Mo`;
}
