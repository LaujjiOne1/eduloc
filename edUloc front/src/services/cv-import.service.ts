import { api } from "@/api/http";
import { ApiError } from "@/api/errors";
import type { UploadTicketDto } from "@/api/contracts/dto";
import { uploadToSignedUrl } from "@/api/upload";
import type { LocalFile } from "@/types/message";
import type { CvImportDto, CvImportErrorCode, CvImportStageDto, CvPrefillDto } from "@/types/cv-import";
import { t } from "@/i18n";
import { t as tr } from "@/i18n";

export { ApiError as CvImportServiceError };

export const CV_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
] as const;
export const CV_MAX_BYTES = 10 * 1024 * 1024;

const POLL_INTERVAL_MS = 1_500;
/** L'OCR d'un scan puis le LLM peuvent prendre plusieurs minutes sur CPU : au-delà, on propose la saisie manuelle. */
const POLL_TIMEOUT_MS = 4 * 60_000;

/** Pourquoi l'analyse a échoué, en français — toujours suivi de la proposition de saisir à la main. */
export const CV_ERROR_MESSAGES: Record<CvImportErrorCode, string> = {
  get UNREADABLE() { return tr("services.cvImportservice.weCouldNotReadThis"); },
  get LLM_UNAVAILABLE() { return tr("services.cvImportservice.automaticAnalysisIsTemporarilyUnavailabl"); },
  get INVALID_OUTPUT() { return tr("services.cvImportservice.theAnalysisOfYourCv"); },
};

/** Où en est l'import : envoi du fichier, puis étape de l'analyse (null tant que le serveur n'a pas commencé). */
export type CvImportProgress = { step: "uploading" } | { step: "analyzing"; stage: CvImportStageDto | null };

/**
 * Routes : POST /cv-imports/uploads (URL signée) → PUT du fichier → POST /cv-imports (lance l'analyse en tâche de fond)
 *          → GET /cv-imports/:id (statut + proposition de pré-remplissage).
 * Authentification requise (le tuteur est déjà inscrit). Le serveur ne bloque jamais l'inscription : un CV illisible
 * donne un échec explicite et l'application propose la saisie manuelle.
 */
export const CvImportService = {
  async importCv(file: LocalFile, onProgress?: (step: CvImportProgress) => void): Promise<CvPrefillDto> {
    if (!(CV_MIME_TYPES as readonly string[]).includes(file.mimeType)) {
      throw ApiError.local("validation_error", t("common.chooseACvInPdf"));
    }
    if (file.sizeBytes > CV_MAX_BYTES) throw ApiError.local("validation_error", t("common.theCvMustBe10"));

    onProgress?.({ step: "uploading" });
    const ticket = await api.post<UploadTicketDto>("/cv-imports/uploads", {
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      fileName: file.fileName,
    });
    await uploadToSignedUrl(ticket, file);
    let current = await api.post<CvImportDto>("/cv-imports", { uploadId: ticket.uploadId });

    onProgress?.({ step: "analyzing", stage: null });
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (current.status === "PENDING" || current.status === "PROCESSING") {
      if (Date.now() > deadline) throw ApiError.local("server_error", t("services.cvImportservice.theAnalysisIsTakingToo"));
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      current = await api.get<CvImportDto>(`/cv-imports/${current.id}`);
      onProgress?.({ step: "analyzing", stage: current.stage });
    }
    if (current.status === "FAILED" || !current.result) {
      throw ApiError.local("server_error", CV_ERROR_MESSAGES[current.errorCode ?? "INVALID_OUTPUT"]);
    }
    return current.result;
  },
};
