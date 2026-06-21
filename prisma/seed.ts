import { PrismaClient, OrgUnitType } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

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

  console.log('Seeding super_admin user...')
  const hashedPassword = bcrypt.hashSync('admin123', 10)
  await prisma.user.upsert({
    where: { email: 'admin@ub.ac.id' },
    update: {},
    create: {
      name: 'Admin Utama',
      email: 'admin@ub.ac.id',
      password: hashedPassword,
      role: 'super_admin',
      avatarInitials: 'AU',
      status: 'active'
    }
  })
  await prisma.user.upsert({
    where: { email: 'admin2@ub.ac.id' },
    update: {},
    create: {
      name: 'Admin Kedua',
      email: 'admin2@ub.ac.id',
      password: hashedPassword,
      role: 'super_admin',
      avatarInitials: 'AK',
      status: 'active'
    }
  })
  console.log('Seeded super_admin: admin@ub.ac.id / admin123')
  console.log('Seeded super_admin: admin2@ub.ac.id / admin123')

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
