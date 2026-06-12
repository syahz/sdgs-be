// Tes manual year-end auto-approve TANPA nunggu 24 Des.
// Jalankan: npx ts-node scripts/test-year-end.ts [year]
// Default year = tahun sekarang.
import { config } from 'dotenv'
import { autoApproveYearEndService } from '../src/service/submission-service'
import { prismaClient } from '../src/application/database'

config()

async function main() {
  const year = process.argv[2] ? parseInt(process.argv[2]) : new Date().getFullYear()
  console.log(`Menjalankan year-end auto-approve untuk tahun ${year}...`)
  const result = await autoApproveYearEndService(year)
  console.log('Hasil:', result) // { approved: N, year }
  await prismaClient.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
