export interface TutorReviewInput {
  rating: number; // 1..5
  text?: string; // [v1~] (était comment) = Review.text
}
export interface TutorReview {
  id: string;
  rating: number;
  text: string | null;
  authorFirstName: string;
  createdAt: string;
  dateLabel: string;
  officialReply: string | null;
}
