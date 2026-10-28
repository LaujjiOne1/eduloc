import { type Href, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AttachIcon, FileIcon, TrashIcon } from "@/components/icons";
import { FadeIn } from "@/components/motion/fade-in";
import { PressableScale } from "@/components/motion/pressable-scale";
import { AuthHeader } from "@/components/ui/auth-header";
import { Button } from "@/components/ui/button";
import { StepProgress } from "@/components/ui/step-progress";
import { type TutorDocumentEntry, useTutorApplicationStore } from "@/store/tutor-application.store";
import type { TutorDocumentKind } from "@/types/tutor-application";
import { useTranslation } from "react-i18next";
import { documentLabel } from "@/lib/document-labels";

const TUTOR_APPLICATION_SUMMARY_ROUTE = "/tutor-application-summary" as Href;
const TOTAL_STEPS = 9;

export function TutorDocumentsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const documents = useTutorApplicationStore((s) => s.documents);
  const removeDocumentFile = useTutorApplicationStore((s) => s.removeDocumentFile);
  const attachDocumentFile = useTutorApplicationStore((s) => s.attachDocumentFile);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleSelectFile = async (kind: TutorDocumentKind) => {
    setFileError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/jpeg", "image/png"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (!asset.mimeType || !["application/pdf", "image/jpeg", "image/png"].includes(asset.mimeType)) {
        setFileError(t("common.chooseAPdfJpgOr"));
        return;
      }
      if (!asset.size || asset.size > 10 * 1024 * 1024) {
        setFileError(t("common.eachDocumentMustBe10"));
        return;
      }
      const sizeKb = Math.round(asset.size / 1024);
      const sizeLabel = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} Mo` : `${sizeKb} Ko`;
      attachDocumentFile(
        kind,
        { uri: asset.uri, mimeType: asset.mimeType, sizeBytes: asset.size, fileName: asset.name },
        sizeLabel,
      );
    } catch (error) {
      setFileError(error instanceof Error ? t("common.unableToSelectTheFile2", { message: error.message }) : t("common.unableToSelectTheFile"));
    }
  };

  const providedCount = documents.filter((d) => d.provided).length;

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <AuthHeader onBack={() => router.back()} />
      <StepProgress step={TOTAL_STEPS} total={TOTAL_STEPS} title={t("common.supportingDocuments")} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={40}>
          <Text className="mb-1 text-[24px] font-bold text-ink">{t("tutorOnboarding.tutorDocuments.supportingDocuments")}</Text>
          <Text className="mb-4 text-[13.5px] text-ink-soft">
            {t("tutorOnboarding.tutorDocuments.selectYourFilesFromYour")}</Text>
        </FadeIn>

        <FadeIn delay={90}>
          <View className="gap-3">
            {documents.map((doc) => (
              <DocumentUploadCard
                key={doc.kind}
                document={doc}
                onUpload={() => handleSelectFile(doc.kind)}
                onRemove={() => removeDocumentFile(doc.kind)}
              />
            ))}
          </View>
          <Text className="mt-3 text-[12px] text-ink-faint">
            {t("tutorOnboarding.tutorDocuments.acceptedFormatsPdfJpgPng")}</Text>
          {fileError ? (
            <Text className="mt-2 text-[12px] text-red-600" accessibilityRole="alert">
              {fileError}
            </Text>
          ) : null}
        </FadeIn>
      </ScrollView>

      <View
        className="border-t border-line-soft bg-surface px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 22) }}
      >
        <Button
          label={t("tutorOnboarding.tutorDocuments.continueWithDocuments", { count: providedCount })}
          onPress={() => router.push(TUTOR_APPLICATION_SUMMARY_ROUTE)}
        />
      </View>
    </View>
  );
}

function DocumentUploadCard({
  document,
  onUpload,
  onRemove,
}: {
  document: TutorDocumentEntry;
  onUpload: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      className={[
        "rounded-xl border p-4 transition-colors",
        document.provided ? "border-accent/40 bg-accent-tint/15" : "border-dashed border-line bg-surface",
      ].join(" ")}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-[14.5px] font-bold text-ink">{documentLabel(document.kind)}</Text>
          {document.provided && document.fileName ? (
            <View className="mt-1.5 flex-row items-center gap-1.5">
              <FileIcon size={14} color="#0E9C82" />
              <Text className="text-[12.5px] font-semibold text-accent" numberOfLines={1}>
                {document.fileName} {document.fileSize ? `(${document.fileSize})` : ""}
              </Text>
            </View>
          ) : (
            <Text className="mt-0.5 text-[12px] text-ink-soft">{t("common.notProvided")}</Text>
          )}
        </View>

        <View className="flex-row items-center gap-2">
          {document.provided ? (
            <>
              <PressableScale onPress={onUpload} accessibilityLabel={t("tutorOnboarding.tutorDocuments.replaceTheDocument")}>
                <View className="rounded-md border border-line bg-surface px-2.5 py-1.5">
                  <Text className="text-[11.5px] font-bold text-ink-soft">{t("tutorOnboarding.tutorDocuments.replace")}</Text>
                </View>
              </PressableScale>
              <PressableScale onPress={onRemove} accessibilityLabel={t("tutorOnboarding.tutorDocuments.deleteTheDocument")}>
                <View className="p-1">
                  <TrashIcon size={15} color="#E04F5F" />
                </View>
              </PressableScale>
            </>
          ) : (
            <PressableScale onPress={onUpload} accessibilityLabel={t("common.add2", { label: documentLabel(document.kind) })}>
              <View className="flex-row items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2">
                <AttachIcon size={14} color="#fff" />
                <Text className="text-[12.5px] font-bold text-white">{t("tutorOnboarding.tutorDocuments.browse")}</Text>
              </View>
            </PressableScale>
          )}
        </View>
      </View>
    </View>
  );
}
