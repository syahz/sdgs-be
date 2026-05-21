import { ReviewComment, User } from '@prisma/client'

export type ReviewCommentWithUser = ReviewComment & {
  user: { id: string; name: string; role: string }
}

export type ReviewCommentResponse = {
  id: string
  submissionId: string
  questionId: string | null
  userId: string
  user: { id: string; name: string; role: string }
  comment: string
  action: string
  createdAt: Date
}

export function toReviewCommentResponse(c: ReviewCommentWithUser): ReviewCommentResponse {
  return {
    id: c.id,
    submissionId: c.submissionId,
    questionId: c.questionId,
    userId: c.userId,
    user: c.user,
    comment: c.comment,
    action: c.action,
    createdAt: c.createdAt
  }
}
