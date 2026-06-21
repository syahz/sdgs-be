import { ReviewComment } from '@prisma/client'

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

export function toReviewCommentResponse(
  c: ReviewComment & { user: { id: string; name: string; role: string } }
): ReviewCommentResponse {
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
