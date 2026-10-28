import { t } from "@/i18n";
import type { TutorDocumentKind } from "@/types/tutor-application";

/** Libellé d'une pièce justificative du dossier tuteur dans la langue active. */
export function documentLabel(kind: TutorDocumentKind): string {
  switch (kind) {
    case "identity":
      return t("tutorOnboarding.documentLabels.identity");
    case "diploma":
      return t("tutorOnboarding.documentLabels.diploma");
    case "certificate":
      return t("tutorOnboarding.documentLabels.certificate");
    case "professional_proof":
      return t("tutorOnboarding.documentLabels.professionalProof");
    default:
      return t("tutorOnboarding.documentLabels.other");
  }
}
