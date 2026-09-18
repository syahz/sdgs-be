import { PrismaClient, OrgUnitType } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { generateAvatarInitials } from '../src/model/user-model'

const prisma = new PrismaClient()

/**
 * Email super admin awal, dibaca dari env SEED_SUPER_ADMIN_EMAILS (pisah koma).
 * Tidak ada default — seeder tidak boleh menciptakan akun istimewa yang alamatnya
 * bisa ditebak siapa pun yang membaca repo ini.
 *
 * SEED_SUPER_ADMIN_PASSWORD opsional:
 *   - diisi  → akun bisa login email+password DAN lewat SSO
 *   - kosong → akun SSO-only, hanya bisa masuk lewat Akun UB
 *
 * Email wajib sama persis dengan email akun IAM kalau jalur SSO mau dipakai.
 * Password tidak pernah dicetak ke log.
 *
 * Contoh:
 *   SEED_SUPER_ADMIN_EMAILS="budi@ub.ac.id,siti@ub.ac.id" \
 *   SEED_SUPER_ADMIN_PASSWORD='...' npx prisma db seed
 */
const superAdminEmails = (process.env.SEED_SUPER_ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

const seedPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? ''

if (seedPassword && seedPassword.length < 8) {
  throw new Error('SEED_SUPER_ADMIN_PASSWORD minimal 8 karakter. Seeding dibatalkan.')
}

/** "budi.santoso@ub.ac.id" → "Budi Santoso". Nama asli diperbaiki admin lewat UI. */
function nameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

// Disamakan dengan org_units di production (backup 2026-09-18), tanpa unit uji
// (Fakultas Dummy, Fakultas Ilmu Percobaan, Fakultas simulasi, Fakultas Simulasi Sistem).
const faculties = [
  { name: 'Fakultas Bio-Industri Pertanian dan Kehutanan', abbreviation: 'FBiPK' },
  { name: 'Fakultas Ekonomi dan Bisnis', abbreviation: 'FEB' },
  { name: 'Fakultas Hukum', abbreviation: 'FH' },
  { name: 'Fakultas Ilmu Administrasi', abbreviation: 'FIA' },
  { name: 'Fakultas Ilmu Budaya', abbreviation: 'FIB' },
  { name: 'Fakultas Ilmu Kesehatan', abbreviation: 'FIKES' },
  { name: 'Fakultas Ilmu Komputer', abbreviation: 'FILKOM' },
  { name: 'Fakultas Ilmu Sosial dan Ilmu Politik', abbreviation: 'FISIP' },
  { name: 'Fakultas Kedokteran', abbreviation: 'FK' },
  { name: 'Fakultas Kedokteran Gigi', abbreviation: 'FKG' },
  { name: 'Fakultas Kedokteran Hewan', abbreviation: 'FKH' },
  { name: 'Fakultas Perikanan dan Ilmu Kelautan', abbreviation: 'FPIK' },
  { name: 'Fakultas Sains dan Teknologi Peternakan', abbreviation: 'FAST' },
  { name: 'Fakultas Sains, Teknologi, dan Matematika', abbreviation: 'FSTeM' },
  { name: 'Fakultas Teknik', abbreviation: 'FT' },
  { name: 'Fakultas Teknologi Agroindustri dan Biosistem', abbreviation: 'FTAB' },
  { name: 'Fakultas Vokasi', abbreviation: 'FV' },
  { name: 'Postgraduate School', abbreviation: 'SPs' },
  { name: 'PSDKU Kediri', abbreviation: 'UBKediri' }
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
    const mode = seedPassword ? 'email+password & SSO' : 'SSO-only (tanpa password)'
    console.log(`Seeding ${superAdminEmails.length} super_admin — ${mode}...`)

    // Hash sekali, bukan per-user: bcrypt cost 10 lambat by design.
    const hashed = seedPassword ? bcrypt.hashSync(seedPassword, 10) : null

    for (const email of superAdminEmails) {
      const name = nameFromEmail(email)
      await prisma.user.upsert({
        where: { email },
        // Password hanya ditimpa bila env diisi — menjalankan ulang seeder tanpa
        // SEED_SUPER_ADMIN_PASSWORD tidak boleh menghapus password yang sudah ada.
        update: {
          role: 'super_admin',
          status: 'active',
          isLocked: false,
          failedLogins: 0,
          lockedUntil: null,
          ...(hashed ? { password: hashed } : {})
        },
        create: {
          name,
          email,
          password: hashed,
          role: 'super_admin',
          avatarInitials: generateAvatarInitials(name),
          status: 'active'
        }
      })
      console.log(`  super_admin: ${email}`)
    }

    if (seedPassword) {
      console.log('  Password diambil dari SEED_SUPER_ADMIN_PASSWORD (tidak dicetak).')
      console.log('  Ganti lewat Settings > Ganti Password setelah login pertama.')
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
