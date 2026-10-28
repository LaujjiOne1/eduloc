import { useCallback, useState } from "react";

import { TutorService } from "@/services/tutor.service";
import type { TutorProfileSummary } from "@/types/tutor-profile";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type TutorProfileState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; profile: TutorProfileSummary };

/** Loads the signed-in tutor's own profile for the Dashboard header and MyProfile screen. */
export function useTutorProfile() {
  const [state, setState] = useState<TutorProfileState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const profile = await TutorService.getMyProfile();
      setState({ status: "success", profile });
    } catch {
      setState({ status: "error", message: t("hooks.useTutorProfile.unableToLoadYourProfile") });
    }
  }, []);

  useLoadEffect(load);

  return { state, retry: load };
}
