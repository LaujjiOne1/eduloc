import { useCallback, useState } from "react";

import { AuthService } from "@/services/auth.service";
import { TutorApplicationService, TutorApplicationServiceError } from "@/services/tutor-application.service";
import type { TutorApplication, TutorApplicationSubmission } from "@/types/tutor-application";
import { t } from "@/i18n";

export type SubmitTutorApplicationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string; code?: string }
  | { status: "success"; application: TutorApplication };

/** Powers the 49_TutorApplicationSummary screen's "Soumettre mon dossier" submission. */
export function useSubmitTutorApplication() {
  const [state, setState] = useState<SubmitTutorApplicationState>({ status: "idle" });

  const submit = useCallback(async (submission: TutorApplicationSubmission) => {
    setState({ status: "loading" });
    try {
      const application = await TutorApplicationService.submitApplication(submission);
      // Le compte porte désormais un rôle tuteur « en attente » : on relit /users/me (menu, gardes).
      await AuthService.getMe().catch(() => undefined);
      setState({ status: "success", application });
      return application;
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof TutorApplicationServiceError
            ? error.message
            : t("hooks.useSubmitTutorApplication.unableToSendYourApplication"),
        code: error instanceof TutorApplicationServiceError ? error.code : undefined,
      });
      return null;
    }
  }, []);

  return { state, submit };
}
