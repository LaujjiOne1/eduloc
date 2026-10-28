import * as DocumentPicker from "expo-document-picker";
import { useCallback, useState } from "react";

import { isApiError } from "@/api/errors";
import { CV_MAX_BYTES, CV_MIME_TYPES, CvImportService } from "@/services/cv-import.service";
import type { CvImportStageDto, CvPrefillDto } from "@/types/cv-import";
import { t } from "@/i18n";

export type CvImportState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "analyzing"; stage: CvImportStageDto | null }
  | { status: "done"; prefill: CvPrefillDto }
  | { status: "failed"; message: string };

/** Choix du fichier, envoi, analyse en tâche de fond, puis proposition de pré-remplissage. Ne bloque jamais l'inscription. */
export function useCvImport() {
  const [state, setState] = useState<CvImportState>({ status: "idle" });

  const pickAndImport = useCallback(async () => {
    if (state.status === "uploading" || state.status === "analyzing") return;
    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({ type: [...CV_MIME_TYPES], copyToCacheDirectory: true, multiple: false });
    } catch {
      setState({ status: "failed", message: t("common.unableToSelectTheFile") });
      return;
    }
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    if (!asset.mimeType || !(CV_MIME_TYPES as readonly string[]).includes(asset.mimeType)) {
      setState({ status: "failed", message: t("common.chooseACvInPdf") });
      return;
    }
    if (!asset.size || asset.size > CV_MAX_BYTES) {
      setState({ status: "failed", message: t("common.theCvMustBe10") });
      return;
    }

    setState({ status: "uploading" });
    try {
      const prefill = await CvImportService.importCv(
        { uri: asset.uri, mimeType: asset.mimeType, sizeBytes: asset.size, fileName: asset.name },
        (progress) =>
          setState(progress.step === "uploading" ? { status: "uploading" } : { status: "analyzing", stage: progress.stage }),
      );
      setState({ status: "done", prefill });
    } catch (error) {
      setState({ status: "failed", message: isApiError(error) ? error.message : t("hooks.useCvImport.theCvImportFailed") });
    }
  }, [state.status]);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, pickAndImport, reset };
}
