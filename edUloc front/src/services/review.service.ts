import { api } from "@/api/http";
import { ApiError } from "@/api/errors";
import { toReview } from "@/api/mappers";
import type { BackendReviewDto, ReviewDto } from "@/api/contracts/dto";
import { Session } from "@/api/session";
import type { TutorReview, TutorReviewInput } from "@/types/review";
import { t } from "@/i18n";

export { ApiError as ReviewServiceError };

/** Routes backend : POST /reviews, GET /reviews/tutors/:id. */
export const ReviewService = {
  async submitReview(bookingId: string, input: TutorReviewInput): Promise<TutorReview> {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw ApiError.local("validation_error", t("services.reviewservice.pleaseChooseARating"));
    }
    const created = await api.post<BackendReviewDto>("/reviews", {
      bookingId,
      rating: input.rating,
      text: input.text?.trim() || null,
    });
    return toReview(normalizeReview(created));
  },
  async getTutorReviews(tutorId: string): Promise<TutorReview[]> {
    return (await api.get<BackendReviewDto[]>(`/reviews/tutors/${tutorId}`, undefined, { auth: false }))
      .map((review) => toReview(normalizeReview(review)));
  },
};

function normalizeReview(review: BackendReviewDto): ReviewDto {
  const authorFirstName = review.authorFirstName ?? review.requester?.firstName ?? Session.getUser()?.firstName;
  if (!authorFirstName) {
    throw ApiError.local("server_error", t("services.reviewservice.theApiResponseDoesNot"));
  }
  return {
    id: review.id,
    bookingId: review.bookingId,
    rating: review.rating,
    text: review.text,
    authorFirstName,
    officialReply: review.officialReply,
    repliedAt: review.repliedAt,
    createdAt: review.createdAt,
  };
}
