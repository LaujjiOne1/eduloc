import { useCallback, useState } from "react";

import { ReviewService, ReviewServiceError } from "@/services/review.service";
import type { TutorReviewInput } from "@/types/review";
import { t } from "@/i18n";

export type SubmitReviewState = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "success" };

/** Powers 32_ReviewTutor's "Envoyer". */
export function useSubmitReview() {
  const [state, setState] = useState<SubmitReviewState>({ status: "idle" });

  const submit = useCallback(async (bookingId: string, input: TutorReviewInput): Promise<boolean> => {
    setState({ status: "loading" });
    try {
      await ReviewService.submitReview(bookingId, input);
      setState({ status: "success" });
      return true;
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof ReviewServiceError ? error.message : t("hooks.useSubmitReview.unableToSendYourReview"),
      });
      return false;
    }
  }, []);

  return { state, submit };
}
