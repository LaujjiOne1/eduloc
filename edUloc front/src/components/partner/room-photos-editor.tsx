import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Platform, Text, View } from "react-native";

import { AttachIcon, TrashIcon } from "@/components/icons";
import { PressableScale } from "@/components/motion/pressable-scale";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { usePartnerAction } from "@/hooks/use-partner-action";
import { PartnerService } from "@/services/partner.service";
import { useTranslation } from "react-i18next";

const MAX_PHOTOS = 10;
const MAX_BYTES = 8 * 1024 * 1024;
const MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

type RoomPhotosEditorProps = {
  roomId: string;
  photos: { id: string; url: string }[];
  disabled?: boolean;
  onChanged: () => void;
};

/** Photos utiles à la compréhension du lieu (10 maximum, 8 Mo chacune). Envoi direct vers le stockage par URL signée. */
export function RoomPhotosEditor({ roomId, photos, disabled, onChanged }: RoomPhotosEditorProps) {
  const { t } = useTranslation();
  const { busy, error, run, clearError } = usePartnerAction();
  const [pickError, setPickError] = useState<string | null>(null);

  const pick = async () => {
    setPickError(null);
    clearError();
    try {
      if (Platform.OS === "ios") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) return setPickError(t("partner.roomPhotosEditor.accessToYourPhotoLibrary"));
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.8 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? "image/jpeg";
      const sizeBytes = asset.fileSize ?? (await (await fetch(asset.uri)).blob()).size;
      if (!MIME_TYPES.includes(mimeType)) return setPickError(t("partner.roomPhotosEditor.chooseAJpgPngOr"));
      if (sizeBytes <= 0 || sizeBytes > MAX_BYTES) return setPickError(t("partner.roomPhotosEditor.eachPhotoMustBe8"));
      const ok = await run(
        "upload",
        () => PartnerService.uploadPhoto(roomId, { uri: asset.uri, mimeType, sizeBytes, fileName: asset.fileName ?? undefined }).then(() => true),
        t("partner.roomPhotosEditor.thePhotoUploadFailed"),
      );
      if (ok) onChanged();
    } catch (e) {
      setPickError(e instanceof Error ? t("partner.roomPhotosEditor.unableToChooseThePhoto", { message: e.message }) : t("partner.roomPhotosEditor.unableToChooseThePhoto2"));
    }
  };

  const remove = async (photoId: string) => {
    const ok = await run(`rm-${photoId}`, () => PartnerService.removePhoto(roomId, photoId).then(() => true), t("partner.roomPhotosEditor.unableToDeleteThisPhoto"));
    if (ok) onChanged();
  };

  return (
    <View>
      {photos.length === 0 ? (
        <Text className="mb-3 text-[13.5px] text-ink-soft">{t("partner.roomPhotosEditor.noPhotosYet")}</Text>
      ) : (
        <View className="mb-3 flex-row flex-wrap gap-3">
          {photos.map((p) => (
            <View key={p.id} className="h-[96px] w-[96px] overflow-hidden rounded-md bg-line-soft">
              <Image source={{ uri: p.url }} style={{ width: 96, height: 96 }} contentFit="cover" accessibilityLabel={t("partner.roomPhotosEditor.roomPhoto")} />
              {disabled ? null : (
                <View className="absolute right-1 top-1">
                  <PressableScale onPress={() => remove(p.id)} disabled={busy !== null} accessibilityLabel={t("partner.roomPhotosEditor.deleteThisPhoto")}>
                    <View className="h-7 w-7 items-center justify-center rounded-full bg-surface">
                      <TrashIcon size={14} color="#AC4A40" />
                    </View>
                  </PressableScale>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
      {pickError || error ? (
        <View className="mb-3">
          <FormError message={(pickError ?? error) as string} />
        </View>
      ) : null}
      {disabled ? null : (
        <Button
          label={photos.length >= MAX_PHOTOS ? t("partner.roomPhotosEditor.maximumNumberOfPhotosReached") : t("partner.roomPhotosEditor.addAPhoto")}
          variant="secondary"
          size="sm"
          icon={<AttachIcon size={14} color="#332E86" />}
          loading={busy === "upload"}
          loadingLabel={t("common.sending")}
          disabled={photos.length >= MAX_PHOTOS || busy !== null}
          onPress={pick}
        />
      )}
    </View>
  );
}
