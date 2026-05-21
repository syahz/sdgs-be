import { PrismaClient } from '@prisma/client'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL not set')
}

const globalForPrisma = globalThis as unknown as { prismaClient?: PrismaClient }

export const prismaClient =
  globalForPrisma.prismaClient ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaClient = prismaClient
}

const shutdown = async () => {
  await prismaClient.$disconnect()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
