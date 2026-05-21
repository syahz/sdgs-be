import { prismaClient } from '../application/database'
import { ResponseError } from '../error/response-error'
import { UserWithRelations } from '../type/user-request'

export const deleteCommentService = async (commentId: string, currentUser: UserWithRelations) => {
  const comment = await prismaClient.reviewComment.findUnique({
    where: { id: commentId }
  })
  if (!comment) throw new ResponseError(404, 'Komentar tidak ditemukan', 'NOT_FOUND')

  // Only comment owner or super_admin can delete
  if (currentUser.role !== 'super_admin' && comment.userId !== currentUser.id) {
    throw new ResponseError(403, 'Akses ditolak', 'FORBIDDEN')
  }

  await prismaClient.reviewComment.delete({ where: { id: commentId } })
  return { message: 'Komentar berhasil dihapus' }
}
