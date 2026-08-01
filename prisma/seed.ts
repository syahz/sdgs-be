import { PrismaClient, OrgUnitType } from '@prisma/client'
import { generateAvatarInitials } from '../src/model/user-model'

const prisma = new PrismaClient()

/**
 * Email super admin awal, dibaca dari env SEED_SUPER_ADMIN_EMAILS (pisah koma).
 * Tidak ada default — seeder tidak boleh menciptakan akun istimewa yang alamatnya
 * bisa ditebak siapa pun yang membaca repo ini.
 *
 * Akun dibuat TANPA password: autentikasi sepenuhnya lewat Keycloak (IAM UB),
 * jadi email di sini wajib sama persis dengan email akun IAM yang bersangkutan.
 *
 * Contoh:
 *   SEED_SUPER_ADMIN_EMAILS="budi@ub.ac.id,siti@ub.ac.id" npx prisma db seed
 */
const superAdminEmails = (process.env.SEED_SUPER_ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

/** "budi.santoso@ub.ac.id" → "Budi Santoso". Nama asli diperbaiki admin lewat UI. */
function nameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

const faculties = [
  { name: 'Faculty of Law', abbreviation: 'FH' },
  { name: 'Faculty of Economics and Business', abbreviation: 'FEB' },
  { name: 'Faculty of Agriculture', abbreviation: 'FP' },
  { name: 'Faculty of Animal Science', abbreviation: 'FAPET' },
  { name: 'Faculty of Engineering', abbreviation: 'FT' },
  { name: 'Faculty of Medicine', abbreviation: 'FK' },
  { name: 'Faculty of Fisheries and Marine Science', abbreviation: 'FPIK' },
  { name: 'Faculty of Mathematics and Natural Sciences', abbreviation: 'FMIPA' },
  { name: 'Faculty of Agricultural Technology', abbreviation: 'FTP' },
  { name: 'Faculty of Social and Political Sciences', abbreviation: 'FISIP' },
  { name: 'Faculty of Administrative Sciences', abbreviation: 'FIA' },
  { name: 'Faculty of Cultural Studies', abbreviation: 'FIB' },
  { name: 'Faculty of Veterinary Medicine', abbreviation: 'FKH' },
  { name: 'Faculty of Computer Science', abbreviation: 'FILKOM' },
  { name: 'Faculty of Dentistry', abbreviation: 'FKG' },
  { name: 'Faculty of Health Sciences', abbreviation: 'FIKES' },
  { name: 'Faculty of Vocational Studies', abbreviation: 'Vokasi' },
  { name: 'Postgraduate School', abbreviation: 'SPs' }
]

async function main() {
  console.log('Seeding org units...')
  for (const faculty of faculties) {
    await prisma.orgUnit.upsert({
      where: { name: faculty.name },
      update: {},
      create: {
        name: faculty.name,
        abbreviation: faculty.abbreviation,
        type: OrgUnitType.faculty
      }
    })
  }
  console.log(`Seeded ${faculties.length} org units`)

  if (superAdminEmails.length === 0) {
    console.log('SEED_SUPER_ADMIN_EMAILS kosong — seeding super_admin dilewati.')
    console.log('  Set env-nya lalu jalankan ulang, contoh:')
    console.log('  SEED_SUPER_ADMIN_EMAILS="nama@ub.ac.id" npx prisma db seed')
  } else {
    console.log(`Seeding ${superAdminEmails.length} super_admin (tanpa password, login via SSO)...`)
    for (const email of superAdminEmails) {
      const name = nameFromEmail(email)
      await prisma.user.upsert({
        where: { email },
        update: { role: 'super_admin', status: 'active' },
        create: {
          name,
          email,
          role: 'super_admin',
          avatarInitials: generateAvatarInitials(name),
          status: 'active'
        }
      })
      console.log(`  super_admin: ${email}`)
    }
  }

  console.log('Seeding default SystemSettings...')
  const existingSettings = await prisma.systemSettings.findFirst()
  if (!existingSettings) {
    await prisma.systemSettings.create({
      data: {
        submissionYear: new Date().getFullYear(),
        windowStartMonth: 7,
        windowStartDay: 1,
        windowEndMonth: 9,
        windowEndDay: 15
      }
    })
    console.log('Created default SystemSettings')
  } else {
    console.log('SystemSettings already exists, skipping')
  }

  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
