/**
 * Seeder: University Records tahun 2024
 * -------------------------------------------------------------------------
 * Sumber jawaban: PDF "WUR Portal-Impact Ranking 2024-Universitas Brawijaya"
 * (submission resmi UB ke THE pusat tahun 2024).
 *
 * Mengisi `theAnswers` setiap UniversityRecord SDG×2024 sesuai jawaban di PDF,
 * DIPETAKAN ke field form yang berlaku di sistem sekarang (THE_SDG_CONFIG_2026).
 * Field yang tidak dijawab / tidak ada di PDF DIBIARKAN KOSONG (anggap user
 * memang tidak mengisi). Indikator BIBLIOMETRIC tidak diisi (diisi validator).
 *
 * Catatan pemetaan:
 *  - Beberapa pertanyaan PDF menggabungkan dua indikator config (mis.
 *    "students and staff", "maternity and paternity", "agriculture and tourism").
 *    Untuk itu kedua indikator config diisi dengan jawaban yang sama.
 *  - Nilai numerik PDF berformat Indonesia ("55.332" = 55332) dinormalkan ke
 *    integer polos saat disimpan.
 *  - Bukti berupa "File uploaded" (bukan URL) tidak punya publicLink → publicLinks
 *    dibiarkan kosong (sistem sekarang hanya menyimpan publicLinks/URL).
 *
 * Menjalankan: npx ts-node prisma/seed-university-2024.ts
 * Seeder ini MENGHAPUS seluruh university_records year=2024 lalu menulis ulang.
 */
import { PrismaClient, Prisma } from '@prisma/client'
import { THE_SDG_CONFIG_2026, type SdgAnswers, type QualAnswer } from '../src/config/the-sdg-config'
import { wrapTheAnswers } from '../src/config/the-answer-key'
import { calcSdgEstimate } from '../src/config/sdg-scoring'

const prisma = new PrismaClient()

const YEAR = 2024

// ─────────────── helper DSL ───────────────

interface QualOpts {
  a?: 'ya' | 'tidak'      // answered (default 'ya')
  c?: string              // comment
  l?: string[]            // publicLinks (evidence URLs)
  choice?: string         // existenceChoice (select mode)
  choices?: string[]      // existenceChoices (multi mode)
  pol?: boolean           // policyUpdated (4pt indicators)
  year?: number           // targetYear (13.4.2)
  scope?: QualAnswer['scopeCoverage'] // 13.4.1
}

function ql(o: QualOpts = {}): QualAnswer {
  const ans: QualAnswer = {
    answered: o.a ?? 'ya',
    comment: o.c ?? '',
    publicLinks: o.l ?? [],
  }
  if (o.choice !== undefined) ans.existenceChoice = o.choice
  if (o.choices !== undefined) ans.existenceChoices = o.choices
  if (o.pol !== undefined) ans.policyUpdated = o.pol
  if (o.year !== undefined) ans.targetYear = o.year
  if (o.scope !== undefined) ans.scopeCoverage = o.scope
  return ans
}

// QUANTITATIVE metric map (values stored as strings)
function qt(obj: Record<string, string>): Record<string, string> {
  return obj
}

// ─────────────── jawaban per SDG (key = indicator code) ───────────────

const ANSWERS: Record<number, SdgAnswers> = {}

// ══════════════ SDG 1 — No Poverty ══════════════
ANSWERS[1] = {
  '1.2.1': qt({ totalStudentsFTE: '55332', lowIncomeStudentsWithAid: '24385' }),
  '1.3.1': ql({ l: ['https://prasetya.ub.ac.id/en/sekolah-susah-bayar-spp-kuliah-dibantu-bidik-misi/'] }),
  '1.3.2': ql({ l: ['https://prasetya.ub.ac.id/en/cerita-lulusan-peraih-beasiswa-adik-dan-wisudawan-termuda-ub/'] }),
  '1.3.3': ql({
    choice: 'free',
    c: 'Housing is provided by the university for low income family.',
    l: ['https://bantuankeuangan.ub.ac.id/', 'https://prasetya.ub.ac.id/en/asrama-baru-untuk-mahasiswa-tidak-mampu/'],
  }),
  '1.3.4': ql({
    c: 'The university provides (from the internal fund) and also actively seeking for scholarship program for low income students.',
    l: ['https://prasetya.ub.ac.id/en/18-mahasiswa-terima-beasiswa-bsi/', 'https://beasiswa.ub.ac.id/category/pengumuman/'],
  }),
  '1.3.5': ql({ l: ['https://industri.ub.ac.id/knb-scholarship-2023/'] }),
  '1.4.1': ql({
    choice: 'free',
    c: "Brawijaya University's MMD program is a program designed to increase higher education involvement through students taking an active role in activities to strengthen the social, economic and environmental capacity of communities in 1000 villages in East Java.",
    l: ['https://mmd.ub.ac.id/'],
  }),
  '1.4.2': ql({}),
  '1.4.3': ql({
    choice: 'direct',
    c: 'The LPPM (Institute of Research and Community Services Brawijaya University) ran a community development program called "Doktor Mengabdi" in 2021-2022. This program has 55 activities aimed at improving basic services for the community.',
    l: ['https://prasetya.ub.ac.id/en/inisiasi-pengabdian-masyarakat-pertanian-desa-melalui-program-meet-ubs-professor/', 'https://prasetya.ub.ac.id/en/fmipa-ub-adakan-gerakan-peduli-dan-berbudaya-lingkungan-di-bali-barat/'],
  }),
  '1.4.4': ql({
    choices: ['local', 'regional', 'national', 'global'],
    c: 'The university is actively involved in local, regional, national, and global programs.',
    l: ['https://www.kemenkopmk.go.id/kemenko-pmk-dan-universitas-brawijaya-sepakat-lakukan-kerja-sama-mempercepat-penghapusan-kemiskinan', 'https://mmd.ub.ac.id/#kegiatan'],
  }),
}

// ══════════════ SDG 2 — Zero Hunger ══════════════
ANSWERS[2] = {
  '2.2.1': ql({ choice: 'whole' }),
  '2.2.2': qt({ totalFoodWasteTon: '28', campusPopulationFTE: '59521' }),
  '2.3.1': ql({
    c: 'The university provides affordable campus canteen facilities, found in every faculty building and around the student activity center. UB also has a program called "Nasi Darurat" (Emergency Rice) that provides free food to students in need.',
    l: ['https://twitter.com/nasidarurat_ub', 'https://ub.ac.id/id/campus-life/eateries/'],
  }),
  // PDF: "interventions to prevent or alleviate hunger among students and staff (food banks/pantries)"
  // → mengisi indikator mahasiswa (2.3.2) dan staf (2.3.5) dengan jawaban yang sama.
  '2.3.2': ql({
    c: 'According to standard operating procedures, each staff member is possible to receive a daily meal allowance. Additionally, UB has a budget item that allows the institution to provide nutritional supplies for both staff and students.',
    l: ['https://fisip.ub.ac.id/wp-content/uploads/2019/05/5.-SOP-PROSEDUR-PENGAJUAN-UANG-MAKAN-PNS.pdf'],
  }),
  '2.3.5': ql({
    c: 'According to standard operating procedures, each staff member is possible to receive a daily meal allowance. Additionally, UB has a budget item that allows the institution to provide nutritional supplies for both staff and students.',
    l: ['https://fisip.ub.ac.id/wp-content/uploads/2019/05/5.-SOP-PROSEDUR-PENGAJUAN-UANG-MAKAN-PNS.pdf'],
  }),
  '2.3.3': ql({
    choice: 'all',
    c: 'UB Canteen is one of the business units operating under the Non-Academic Business Entity (BUNA) founded in 2016, specializing in food and beverage services, providing high-quality Halal and Thoyyib food and drinks to the academic community.',
    l: ['https://ubkantin.ub.ac.id/'],
  }),
  '2.3.4': ql({
    choice: 'all',
    c: 'UB Canteen provides Halal and Thoyyib food and drinks to support the academic community within Brawijaya University.',
    l: ['https://ubkantin.ub.ac.id/'],
  }),
  '2.4.1': qt({ totalGraduates: '11717', agricultureSustainGraduates: '2978' }),
  '2.5.1': ql({
    choice: 'free',
    c: 'Brawijaya University has a mentoring program for local communities and farmers to increase their knowledge and skills in producing food.',
    l: ['https://www.wartabromo.com/2023/08/03/tim-dosen-psdku-agroekoteknologi-universitas-brawijaya-ajak-petani-di-lereng-gunung-wilis-budidaya-durian-unggul/', 'https://feb.ub.ac.id/pendampingan-perawatan-aquaponik-di-rintisan-pondok-pesantren-as-sattar-darrushodiqin-oleh-tim-feb-ub/'],
  }),
  '2.5.2': ql({
    choice: 'free',
    c: 'Brawijaya University is active in providing assistance and counseling to village and coastal communities to increase their agricultural and fisheries production.',
    l: ['https://bua.ub.ac.id/technopark/', 'https://kanal24.co.id/tim-dm-ftp-ub-dorong-pemberdayaan-usaha-olahan-ikan-dan-petani-tembakau-di-probolinggo/'],
  }),
  '2.5.3': ql({
    choice: 'free',
    c: 'Brawijaya University actively assists and counsels village and coastal communities in improving their agricultural and fisheries production.',
    l: ['https://bua.ub.ac.id/technopark/', 'https://timesindonesia.co.id/indonesia-positif/471556/sekolah-lapang-pht-departemen-hpt-fpub-dampingi-petani-atasi-penyakit-akar-gada'],
  }),
  '2.5.4': ql({
    c: 'Agrotekhnopark functions as a business entity associated with a university to produce and market agricultural products while also supporting the local farming community by purchasing their produce.',
    l: ['https://bua.ub.ac.id/technopark/'],
  }),
}

// ══════════════ SDG 3 — Good Health and Well-being ══════════════
ANSWERS[3] = {
  '3.2.1': qt({ totalGraduates: '11717', healthProfGraduates: '1642' }),
  '3.3.1': ql({
    choice: 'three',
    c: 'Brawijaya University partners with national and international institutions to address health-related concerns.',
    l: ['https://dinkes.kalteng.go.id/berita/dinas-kesehatan-provinsi-kalimantan-tengah-jalin-kerjasama-dengan-fakultas-kedokteran-universitas-brawijaya/', 'https://prasetya.ub.ac.id/en/gandeng-national-taiwan-university-hospital-yunlin-branch-fikes-adakan-kuliah-tamu-gizi-dan-keperawatan/'],
  }),
  '3.3.2': ql({
    choices: ['local', 'disadvantaged'],
    c: 'Brawijaya University actively provides community assistance and education to maintain and increase their health knowledge.',
    l: ['https://prasetya.ub.ac.id/en/fk-ub-bantu-masyarakat-desa-kendalpayak-cegah-hipertensi-dan-dm/', 'https://prasetya.ub.ac.id/en/ub-gelar-pengmas-untuk-peningkatan-kesehatan-psiko-sosial-keluarga-pasca-pandemi-covid-19/'],
  }),
  '3.3.3': ql({
    choice: 'freeSome',
    c: 'The free sports facilities at Brawijaya University are aimed at the academic community, while some sports facilities are aimed at the general public with a small fee paid for maintenance.',
    l: ['https://ub.ac.id/campus-life/facilities/', 'https://buna.ub.ac.id/en/unit-usaha/ub-sport-center/'],
  }),
  '3.3.4': ql({
    choice: 'free',
    c: 'The university provides health clinics and hospital where the student can access to sexual and reproductive health-care service.',
    l: ['https://klinik.ub.ac.id/', 'https://rumahsakit.ub.ac.id/'],
  }),
  // PDF: "students and staff with access to mental health support" → isi 3.3.5 (mhs) & 3.3.7 (staf)
  '3.3.5': ql({
    choice: 'active',
    c: 'Brawijaya University has counseling facilities for students and staff.',
    l: ['https://konseling.ub.ac.id/'],
  }),
  '3.3.7': ql({
    choice: 'active',
    c: 'Brawijaya University has counseling facilities for students and staff.',
    l: ['https://konseling.ub.ac.id/'],
  }),
  '3.3.6': ql({
    choice: 'partial',
    pol: true, // policy reviewed 2022 (dalam rentang 2021-2025)
    c: 'The Ministry of Education and Culture of the Republic of Indonesia has made a regulation prohibiting smoking at schools and campuses, reinforced by the local government of Malang City. Universitas Brawijaya implements these regulations to control areas that should be smoke-free.',
  }),
}

// ══════════════ SDG 4 — Quality Education ══════════════
ANSWERS[4] = {
  '4.2.1': qt({ totalGraduates: '11717', primaryTeachingGraduates: '356' }),
  '4.3.1': ql({
    choices: ['courses', 'facilities', 'online'],
    c: "Universitas Brawijaya's MBKM program enables students outside of Brawijaya to participate as regular students and access a variety of educational resources. UB also provides a library in collaboration with City Library, accessible by students outside UB.",
    l: ['https://mbkm.ub.ac.id/program-mahasiswa/pertukaran-pelajar/#'],
  }),
  '4.3.2': ql({
    choice: 'allFree',
    c: 'Brawijaya University holds many public lectures held online and live with some of them broadcast on YouTube.',
    l: ['https://prasetya.ub.ac.id/en/prodi-teknik-informatika-filkom-ub-adakan-webinar-inspiratif-untuk-kenalkan-dunia-informatika-kepada-siswa-sma-dan-smk/', 'https://www.youtube.com/watch?v=RSdpkUJtBQw'],
  }),
  '4.3.3': ql({
    choices: ['programmed'],
    c: 'Diversity schools are aimed at providing an understanding of the issues of multiculturalism and inclusive living to the community and students.',
    l: ['https://fib.ub.ac.id/memperkuat-keterlibatan-sosial-diseminasi-program-sekolah-keragaman-menuju-harmoni-multikultural/'],
  }),
  '4.3.4': ql({
    choices: ['programmed', 'adhoc'],
    c: 'Brawijaya University has units and programs involving staff and students in community development.',
    l: ['https://mbkm.ub.ac.id/program-mahasiswa/asisten-mengajar-di-satuan-pendidikan/'],
  }),
  '4.3.5': ql({
    pol: false, // policy reviewed 2020 (di luar rentang 2021-2025)
    c: 'Brawijaya University has a service unit that specifically helps people who experience physical limitations.',
    l: ['https://pld.ub.ac.id/'],
  }),
  '4.3.6': qt({ policyCreatedYear: '2012' }),
  '4.3.7': qt({ policyReviewedYear: '2020' }),
  '4.4.1': qt({ totalStudents: '55332', studentsStartingDegree: '13991', firstGenStudents: '2657' }),
}

// ══════════════ SDG 5 — Gender Equality ══════════════
ANSWERS[5] = {
  '5.2.1': qt({ totalStudentsFTE: '55332', studentsStartingDegree: '13991', firstGenStudentsStarting: '2657', femaleStudentsStarting: '8255', firstGenFemaleStudents: '1568' }),
  '5.3.1': ql({}), // bukti File uploaded (png) → tanpa URL
  '5.3.2': ql({
    pol: true, // policy reviewed 2021
    c: 'Universitas Brawijaya never set a limititation of student entry based on their gender. Brawijaya University accommodates student admissions through national selection organized by the Ministry of Education since UB was founded in 1963 and independent selection managed locally on campus.',
    l: ['https://selma.ub.ac.id/'],
  }),
  '5.3.3': ql({
    choices: ['mentoring', 'scholarships', 'other'],
    c: "There's no gender issues on mentoring services or scholarships. All university services can be accessed by both men or women.",
    l: ['https://beasiswa.ub.ac.id/'],
  }),
  '5.3.4': ql({
    a: 'tidak',
    c: "There's no gender issues on mentoring services or scholarships. All university services can be accessed by both men or women.",
  }),
  '5.4.1': qt({ totalEmployeesFTE: '4673', totalAcademicFTE: '3345', totalSeniorAcademicFTE: '82', femaleSeniorAcademicFTE: '25' }),
  '5.5.1': qt({ totalGraduates: '11717', graduatesSTEM: '6054', graduatesMedicine: '1642', graduatesArts: '4021', femaleGraduatesSTEM: '3135', femaleGraduatesMedicine: '1150', femaleGraduatesArts: '2362' }),
  '5.6.1': ql({
    pol: false, // reviewed 2015
    c: "There's no gender issues in all aspect of UB.",
    l: ['https://grc.ub.ac.id/about-gender-research-center/vision-and-mission/'],
  }),
  '5.6.2': ql({ a: 'tidak', c: 'There is no transgender issue in the university' }),
  // PDF: "maternity and paternity policies" → isi 5.6.3 (maternity) & 5.6.9 (paternity)
  '5.6.3': ql({
    pol: true, // reviewed 2022
    c: "There is no issue regarding women's participation in Universitas Brawijaya. Women staff or students can participate in every aspect of campus activity.",
  }),
  '5.6.9': ql({
    pol: true,
    c: "There is no issue regarding women's participation in Universitas Brawijaya. Women staff or students can participate in every aspect of campus activity.",
  }),
  '5.6.4': ql({
    choice: 'free',
    l: ['https://bss.ub.ac.id/profil-bss/unit/children-center/', 'https://prasetya.ub.ac.id/en/peduli-anak-ub-dirikan-children-centre/'],
  }),
  '5.6.5': ql({
    choice: 'free',
    l: ['https://bss.ub.ac.id/profil-bss/unit/children-center/'],
  }),
  '5.6.6': ql({ l: ['https://ppsub.ub.ac.id/pmkw/profil-2/sample-page/'] }),
  '5.6.7': ql({ l: ['https://dpka.ub.ac.id/services/'] }),
  '5.6.8': ql({
    pol: false, // reviewed 2015
    l: ['https://dpka.ub.ac.id/'],
  }),
}

// ══════════════ SDG 6 — Clean Water and Sanitation ══════════════
ANSWERS[6] = {
  '6.2.1': ql({ choice: 'whole' }), // bukti File uploaded → tanpa URL
  '6.2.2': qt({ waterUsedM3: '289007', campusPopulationFTE: '59521' }),
  '6.3.1': ql({ l: ['https://tep.ub.ac.id/en/facility/laboratory/waste-management/'] }),
  '6.3.2': ql({ a: 'tidak' }),
  '6.3.3': ql({ l: ['https://prasetya.ub.ac.id/en/fasilitas-air-minum-kontribusi-fisip-ub-dalam-menjaga-lingkungan/'] }),
  '6.3.4': ql({ a: 'tidak' }),
  '6.3.5': ql({ a: 'tidak' }),
  '6.4.1': ql({ a: 'tidak' }),
  '6.4.2': ql({ a: 'tidak' }),
  '6.5.1': ql({
    choice: 'both',
    c: 'The study program routinely carries out community service programs related to the scientific field of water management for the surrounding community.',
    l: ['https://tanah.ub.ac.id/pta/'],
  }),
  '6.5.3': ql({ l: ['https://malang.times.co.id/news/berita/myvcoug302/UB-Perkuat-Pengunaan-PAMSIMAS-di-Kabupaten-Malang'] }),
  '6.5.4': ql({ a: 'tidak' }),
  '6.5.5': ql({
    choices: ['local', 'regional', 'national'],
    l: ['https://pengairan.ub.ac.id/2023/07/20/departemen-teknik-pengairan-ftub-tingkatkan-kerja-sama-internasional-dalam-bidang-kualitas-air-dan-lingkungan-melalui-kegiatan-outbound-di-jepang/'],
  }),
  // PDF: "actively promote conscious water usage on campus, and in the wider community" → 6.5.6 & 6.5.7
  '6.5.6': ql({
    l: ['https://tp.ub.ac.id/gandeng-karang-taruna-lima-mahasiswa-brawijaya-tawarkan-solusi-permasalahan-air-kapur-di-mulyosari-malang/', 'https://www.cnbcindonesia.com/news/20221206180122-4-394337/kelola-air-berkelanjutan-5-pilar-ini-harus-jadi-perhatian'],
  }),
  '6.5.7': ql({
    l: ['https://tp.ub.ac.id/gandeng-karang-taruna-lima-mahasiswa-brawijaya-tawarkan-solusi-permasalahan-air-kapur-di-mulyosari-malang/', 'https://www.cnbcindonesia.com/news/20221206180122-4-394337/kelola-air-berkelanjutan-5-pilar-ini-harus-jadi-perhatian'],
  }),
}

// ══════════════ SDG 7 — Affordable and Clean Energy ══════════════
ANSWERS[7] = {
  '7.2.1': ql({ a: 'tidak' }),
  '7.2.2': ql({ a: 'tidak' }),
  '7.2.3': ql({
    l: ['https://bsilhk.menlhk.go.id/index.php/2023/07/07/klhk-tandatangani-perjanjian-kerja-sama-pengelolaan-lingkungan-hidup-dan-kehutanan-dengan-universitas-brawijaya/', 'https://rri.co.id/index.php/jawa-timur/iptek/136822/bantu-pengendalian-emisi-gas-rumah-kaca-ub-maksimalkan-peran-ub-forest'],
  }),
  '7.2.4': ql({ a: 'tidak' }),
  '7.2.5': ql({ l: ['http://repository.ub.ac.id/id/eprint/197172/'] }),
  '7.2.6': ql({ a: 'tidak' }),
  '7.3.1': qt({ totalEnergyGJ: '3282', floorSpaceM2: '522095' }),
  '7.4.1': ql({ l: ['https://filkom.ub.ac.id/2022/12/01/mahasiswa-tekkom-berjaya-di-program-mahasiswa-wirausaha-ub-2022/#'] }),
  '7.4.2': ql({ a: 'tidak' }),
  '7.4.3': ql({ a: 'tidak' }),
  '7.4.4': ql({
    choices: ['local', 'regional'],
    l: ['https://setneg.go.id/baca/index/kaum_muda_deklarasikan_dukungan_pilar_keberlanjutan_di_ktt_ke_42_asean_2023', 'https://www.rri.co.id/malang/iptek/230490/ub-dukung-pilar-sustainability-pada-keketuaan-asean-2023'],
  }),
  '7.4.5': ql({ l: ['https://www.unitedtractors.com/united-tractors-dukung-tim-apatte62-universitas-brawijaya-melakukan-exhibition-dan-sharing-session-terkait-inovasi-mobil-ramah-lingkungan/', 'https://koran-jakarta.com/wujudkan-kampus-hijau-universitas-brawijaya-luncurkan-sepeda-listrik?page=all'] }),
}

// ══════════════ SDG 8 — Decent Work and Economic Growth ══════════════
ANSWERS[8] = {
  '8.2.1': ql({ c: 'Brawijaya University implements civil servant salary regulations set by the government and has a regulation that is enforced on a limited basis within Brawijaya University.' }), // bukti File uploaded
  // PDF: "recognise unions & labour rights (freedom of association & collective bargaining)" → 8.2.2 & 8.2.9
  '8.2.2': ql({
    c: 'All staff are member of the KORPRI (Employee Corps of the Republic of Indonesia)',
    l: ['https://divisihukum.ub.ac.id/storage/file/zX0ImdMJHRPER-REKTOR-UB-No-536-Tahun%202013-tentang-Tenaga-Kependidikan-Tetap-Non-PNS.pdf', 'https://prasetya.ub.ac.id/en/rapat-kerja-korpri-unit-universitas-brawijaya-masa-bakti-2016-2017/'],
  }),
  '8.2.9': ql({
    c: 'All staff are member of the KORPRI (Employee Corps of the Republic of Indonesia)',
    l: ['https://divisihukum.ub.ac.id/storage/file/zX0ImdMJHRPER-REKTOR-UB-No-536-Tahun%202013-tentang-Tenaga-Kependidikan-Tetap-Non-PNS.pdf', 'https://prasetya.ub.ac.id/en/rapat-kerja-korpri-unit-universitas-brawijaya-masa-bakti-2016-2017/'],
  }),
  '8.2.3': ql({
    pol: false, // reviewed 1963
    c: 'The policy is part of the government policy. The Academic Handbook states "Democratic and not discriminatory by upholding human rights..." and Communication Ethics "No discrimination: avoiding discrimination against fellow lecturers or students on the basis of gender, race, ethnicity, or other factors...".',
    l: ['https://ppid.ub.ac.id/dokumen/Academic_Handbook_UB_2021-2022.pdf'],
  }),
  '8.2.4': ql({
    pol: false, // reviewed 1963
    c: 'It is also the government regulation. The policy is made in the university establishment.',
    l: ['https://hukum.ub.ac.id/en/penelitian-dan-pengabdian/fokus-kajian/'],
  }),
  '8.2.5': ql({
    pol: false, // reviewed 2020
    l: ['https://kumparan.com/tugumalang/universitas-brawijaya-proteksi-keselamatan-kerja-ratusan-pegawai-1xUAlcuKoNy/3'],
  }),
  '8.2.6': ql({
    pol: false, // reviewed 2020
    l: ['https://www.suarakarya.id/kesra/pr-2602684971/ratusan-pegawai-kontrak-universitas-brawijaya-malang-dilindungi-bpjamsostek'],
  }),
  '8.2.7': ql({ c: 'Regulations have been established based on rules made by the government.' }), // bukti File uploaded
  '8.2.8': ql({}), // bukti File uploaded
  '8.3.1': qt({ totalEmployeesFTE: '4673', totalAcademicFTE: '3345', universityExpenditureLocal: '1467965972305' }),
  '8.4.1': qt({ totalStudentsFTE: '55332', studentsWithPlacementFTE: '8561' }),
  '8.5.1': qt({ totalEmployeesFTE: '4673', secureContractEmployeesFTE: '4673' }),
}

// ══════════════ SDG 9 — Industry, Innovation and Infrastructure ══════════════
ANSWERS[9] = {
  '9.3.1': qt({ activeSpinOffs: '15' }),
  '9.4.1': qt({
    researchIncomeSTEM: '72536859201', researchIncomeMedicine: '3495147403', researchIncomeArts: '43461498199',
    academicStaffSTEM: '1668', academicStaffMedicine: '557', academicStaffArts: '1119',
  }),
}

// ══════════════ SDG 10 — Reduced Inequalities ══════════════
ANSWERS[10] = {
  '10.2.1': qt({ totalStudentsFTE: '55332', studentsStartingDegree: '13991', firstGenStudents: '2657' }),
  '10.3.1': qt({ totalStudentsFTE: '55332', intlStudentsDevelopingCountries: '27' }),
  '10.4.1': qt({ totalStudentsFTE: '55332', studentsWithDisabilityFTE: '127' }),
  '10.5.1': qt({ totalEmployeesFTE: '4673', employeesWithDisabilityFTE: '20' }),
  '10.6.1': ql({
    pol: false, // reviewed 2012
    c: 'Disable students have the same opportunities to enter UB in some study programs',
    l: ['https://selma.ub.ac.id/seleks-mandiri-penyandang-disabilitas-smpd/'],
  }),
  '10.6.2': ql({ l: ['https://selma.ub.ac.id/'] }),
  '10.6.3': ql({ l: ['https://selma.ub.ac.id/seleksi-mandiri-penyandang-disabilitas-2023/'] }),
  // PDF: "anti-discrimination and anti-harassment policies" → 10.6.4 & 10.6.11
  '10.6.4': ql({
    pol: false, // reviewed 2012
    l: ['https://ppsub.ub.ac.id/wp-content/uploads/2013/01/Kode-Etik-dosen-UB.pdf'],
  }),
  '10.6.11': ql({
    pol: false,
    l: ['https://ppsub.ub.ac.id/wp-content/uploads/2013/01/Kode-Etik-dosen-UB.pdf'],
  }),
  '10.6.5': ql({
    c: 'UB have bodies that concentrate their activities on issues of diversity, equity, inclusion and human rights.',
    l: ['https://hukum.ub.ac.id/en/jadwal-pelayanan-bkbh-fakultas-hukum-universitas-brawijaya/'],
  }),
  '10.6.6': ql({ l: ['https://konseling.ub.ac.id/'] }),
  '10.6.7': ql({ l: ['https://ub.ac.id/disability-facilities/'] }),
  '10.6.8': ql({ l: ['https://pld.ub.ac.id/en/services/accessibility-service/'] }),
  '10.6.9': ql({ l: ['https://pld.ub.ac.id/en/services/counseling/'] }),
  '10.6.10': ql({
    c: 'UB have policies for students with disabilities related to fund mechanism',
    l: ['https://pld.ub.ac.id/en/services/accommodation-services/'],
  }),
}

// ══════════════ SDG 11 — Sustainable Cities and Communities ══════════════
ANSWERS[11] = {
  '11.2.1': ql({
    choice: 'freeAll',
    c: 'The public can visit the Brawijaya University campus for free, individually or in groups.',
    l: ['https://malangposcomedia.id/pamerkan-foto-jejak-sejarah-pemimpin-ub/'],
  }),
  '11.2.2': ql({
    choice: 'application',
    c: 'Free access for other universities students',
    l: ['https://lib.ub.ac.id/'],
  }),
  '11.2.3': ql({
    choice: 'freeSome',
    l: ['https://senirupa-fib.ub.ac.id/?page_id=3316'],
  }),
  '11.2.4': ql({
    choice: 'permanent',
    l: ['https://ubforest.ub.ac.id/'],
  }),
  '11.2.5': ql({
    choice: 'gt15',
    l: ['https://teaterlingkar.com/berita/kisah-kematian-dalam-pentas-generasi-teater-lingkar-2023/'],
  }),
  '11.2.6': ql({
    choices: ['localRegional', 'national'],
    l: ['https://prasetya.ub.ac.id/en/kayutangan-heritage-malang-memasuki-dunia-metaverse/'],
  }),
  '11.3.1': qt({ totalUniversityExpenditure: '1467965972305', artsHeritageExpenditure: '3337660000' }),
  '11.4.1': ql({ l: ['https://prasetya.ub.ac.id/en/ub-gandeng-beam-wujudkan-kampus-ramah-lingkungan/', 'https://greencampus.ub.ac.id/en/transportasi/'] }),
  '11.4.2': ql({ l: ['https://greencampus.ub.ac.id/en/transportasi/'] }),
  '11.4.3': ql({ l: ['https://vlm2.ub.ac.id/'] }),
  '11.4.4': ql({
    choices: ['provide', 'financial'],
    l: ['https://prasetya.ub.ac.id/en/kpri-presentasi-pembangunan-rumah/', 'https://hukum.ub.ac.id/en/sosialisasi-penawaran-perumahan-untuk-tenaga-dosen-karyawan-ub/'],
  }),
  '11.4.5': ql({
    choices: ['evaluate', 'provide', 'financial'],
    c: 'Dormitories for students for local and international students',
    l: ['https://griyabrawijaya.ub.ac.id/dorm/'],
  }),
  '11.4.6': ql({ l: ['https://greencampus.ub.ac.id/en/transportasi/'] }),
  '11.4.7': ql({ l: ['https://prasetya.ub.ac.id/en/ftub-jalin-kerja-sama-dengan-dinas-dpkp-kota-batu/'] }),
  '11.4.8': ql({ l: ['https://greencampus.ub.ac.id/en/'] }),
  '11.4.9': ql({ l: ['https://prasetya.ub.ac.id/en/ftub-jalin-kerja-sama-dengan-dinas-dpkp-kota-batu/'] }),
}

// ══════════════ SDG 12 — Responsible Consumption and Production ══════════════
ANSWERS[12] = {
  '12.2.1': ql({
    pol: false, // reviewed 2018
    c: 'Halal certification guarantee that the food and supply originated from ethical sourcing.',
    l: ['https://lphub.ub.ac.id/'],
  }),
  '12.2.3': ql({
    pol: false, // created 2013
    l: ['https://fapet.ub.ac.id/wp-content/uploads/2018/11/14.-SOP-Pembuangan-Limbah.pdf'],
  }),
  '12.2.4': ql({
    pol: false, // reviewed 2016
    l: ['https://kompos.ub.ac.id/'],
  }),
  '12.2.5': ql({ pol: false }), // created 2019 reviewed 2020; bukti File uploaded
  '12.2.6': ql({
    pol: true, // reviewed 2021
    c: 'The prohibition of using single-use materials can reduce the amount of waste',
  }),
  '12.2.7': ql({
    c: 'The regulation also affected to each unit which used third party or outsourced services.',
    l: ['https://prasetya.ub.ac.id/wp-content/uploads/2020/08/Arsip-Mimbar-389-web-PO.pdf'],
  }),
  '12.2.8': ql({ l: ['https://ub.ac.id/wp-content/uploads/2021/06/6151_-_Instr_Rektor_Pengetatan_Pelaksanaan_Pertor_Kampus_Tangguh.pdf'] }),
  '12.3.1': ql({ choice: 'whole', c: 'Since 2021 UB measured waste generated by university' }), // bukti File uploaded
  '12.3.2': qt({ totalWasteTon: '2347', recycledWasteTon: '2330', landfillWasteTon: '17' }),
  '12.4.1': ql({ choice: 'annual', l: ['https://reputasi.ub.ac.id/'] }),
}

// ══════════════ SDG 13 — Climate Action ══════════════
ANSWERS[13] = {
  '13.2.1': ql({ choice: 'partial', l: ['https://feb.ub.ac.id/indonesia-langkah-menuju-transformasi-ekonomi-hijau/'] }),
  '13.2.2': qt({ totalEnergyGJ: '3282', lowCarbonEnergyGJ: '3' }),
  '13.3.1': ql({ l: ['https://ppsub.ub.ac.id/en/akademik/program-studi-interdisipliner/pdklp6/silabus/global-climate-change/', 'https://vokasi.ub.ac.id/category/sdgs-sustainable-development-goals-ub/sdgs-tujuan-13-tindakan-untuk-perubahan-iklim/'] }),
  '13.3.2': ql({ l: ['https://greencampus.ub.ac.id/en/energi-dan-perubahan-iklim/'] }),
  '13.3.3': ql({
    choices: ['local', 'regional'],
    l: ['https://vokasi.ub.ac.id/category/sdgs-sustainable-development-goals-ub/sdgs-tujuan-13-tindakan-untuk-perubahan-iklim/', 'https://hukum.ub.ac.id/en/dosen-hukum-lingkungan-universitas-brawijaya-dan-universitas-kebangsaan-malaysia-bertukar-pandangan-mengenai-fenomena-perubahan-iklim-global/'],
  }),
  '13.3.4': ql({
    c: 'The Gatot Kaca team consisting of UB students created an innovation in the form of an idea for handling the natural disaster evacuation process in Indonesia using the Safety Drone System, guided by Brawijaya lecturers.',
    l: ['https://prasetya.ub.ac.id/en/meningkatkan-kewaspadaan-bencana-alam-di-lumajang-mahasiswa-mmd-universitas-brawijaya-gelar-fun-education-untuk-siswa-sd-kelas-2/', 'https://feb.ub.ac.id/en/tim-gatot-kaca-universitas-brawijaya-membuat-gagasan-safety-drone-system-berbasis-artificial-intelligence-sebagai-sistem-mitigasi-dan-evakuasi-bencana-alam-di-indonesia/'],
  }),
  '13.3.5': ql({ l: ['https://fisip.ub.ac.id/en/bangun-kesadaran-bersama-untuk-mengolah-sampah-mahasiswa-fisip-ub-lakukan-green-campus-campaign/'] }),
  '13.4.1': ql({ a: 'tidak' }),
  // 13.4.2 "Achieve by" tidak diisi di PDF → dibiarkan kosong
}

// ══════════════ SDG 14 — Life Below Water ══════════════
ANSWERS[14] = {
  '14.2.1': ql({
    choice: 'free',
    c: '(a) water management study program (b) Fisheries and Marine Study Program',
    l: ['https://pengairan.ub.ac.id/s1-teknik-pengairan/?lang=en', 'https://fpik.ub.ac.id/en/'],
  }),
  '14.2.2': ql({ choice: 'free', l: ['https://psp.fpik.ub.ac.id/struktur-badan-penelitian-dan-pengabdian/pengabdian-masyarakat/'] }),
  '14.2.3': ql({ choice: 'free', l: ['https://psp.fpik.ub.ac.id/struktur-badan-penelitian-dan-pengabdian/pengabdian-masyarakat/', 'https://adv.kompas.id/baca/fpik-ub-dukung-konservasi-penyu-di-malang-selatan/'] }),
  '14.3.1': ql({ l: ['https://adv.kompas.id/baca/fpik-ub-dukung-konservasi-penyu-di-malang-selatan/', 'https://sep.fpik.ub.ac.id/info/memorandum-of-agreement-moa-antara-fakultas-perikanan-ilmu-kelautan-fpik-universitas-brawijaya-ub-dengan-balai-pengelolaan-sumberdaya-pesisir-dan-laut-bpspl-denpasar-yang-diinisiasi-oleh-p/'] }),
  '14.3.2': ql({ a: 'tidak' }),
  '14.3.3': ql({ l: ['https://jatim.antaranews.com/berita/744354/bupati-ipuk-apresiasi-pelni-ub-dukung-konservasi-terumbu-karang', 'https://timesindonesia.co.id/indonesia-positif/475405/fpik-ub-beri-dukungan-alat-hingga-literasi-untuk-konservasi-penyu-di-malang-selatan'] }),
  '14.3.4': ql({ l: ['https://jatim.antaranews.com/berita/744354/bupati-ipuk-apresiasi-pelni-ub-dukung-konservasi-terumbu-karang', 'https://fpik.ub.ac.id/en/nfo-kerjasama/'] }),
  '14.4.1': ql({ a: 'tidak' }),
  '14.4.2': ql({}), // bukti File uploaded
  '14.4.3': ql({ pol: false }), // created 2020; bukti File uploaded
  '14.5.1': ql({ l: ['https://www.detik.com/jatim/berita/d-7016499/ekosistem-terumbu-karang-banyuwangi-direhabilitasi-dengan-dana-tjsl-pelni'] }),
  '14.5.2': ql({ l: ['https://drive.google.com/file/d/1Cao5_Ct3dmsEk6kU5SBPjqvFlAkEGUXG/view'] }),
  '14.5.3': ql({ choice: 'adhoc', l: ['https://prasetya.ub.ac.id/en/dukung-wisata-bahari-ub-dan-pt-pelni-perbaiki-ekosistem-terumbu-karang/'] }),
  '14.5.4': ql({ l: ['https://malang-post.com/2023/08/24/tim-doktor-mengabdi-universitas-brawijaya-merintis-sekolah-non-formal-di-pedesaan-pesisir/#google_vignette'] }),
  '14.5.5': ql({ c: 'UB has Aquaculture waste management for community at Tuban dan Lamongan in east Java', l: ['https://drive.google.com/file/d/1Cao5_Ct3dmsEk6kU5SBPjqvFlAkEGUXG/view'] }),
}

// ══════════════ SDG 15 — Life On Land ══════════════
ANSWERS[15] = {
  '15.2.1': ql({ l: ['https://brin.go.id/en/news/110522/brin-and-brawijaya-university-discuss-research-on-food-process-technology-and-appropriate-technology'] }),
  '15.2.2': ql({
    pol: false, // created 1963
    c: 'Sustainable organic farming on highland (Agro Techno Park UB) at Cangar; Center of Local Food Development Studies; Organic food',
    l: ['https://lphub.ub.ac.id/', 'https://atp.ub.ac.id/'],
  }),
  '15.2.3': ql({ l: ['https://ubforest.ub.ac.id/'] }),
  '15.2.4': ql({ choice: 'free', l: ['https://prasetya.ub.ac.id/en/fmipa-ub-adakan-gerakan-peduli-dan-berbudaya-lingkungan-sekolah-di-bali-barat/'] }),
  // PDF: "sustainable management of land for agriculture and tourism" → 15.2.5 & 15.2.6
  '15.2.5': ql({
    choice: 'free',
    c: 'There are study programs concerning with sustainable management of land for agriculture and tourism. Lecture activity and research group on the issue are supported by the university. Community development, workshop and open courses for community are conducted together with the community.',
    l: ['https://seru.co.id/100157-1-400-mahasiswa-ub-turut-serta-program-mmd-pada-1-000-desa-se-jatim', 'https://atp.ub.ac.id/visi/'],
  }),
  '15.2.6': ql({
    choice: 'free',
    c: 'There are study programs concerning with sustainable management of land for agriculture and tourism. Lecture activity and research group on the issue are supported by the university.',
    l: ['https://seru.co.id/100157-1-400-mahasiswa-ub-turut-serta-program-mmd-pada-1-000-desa-se-jatim', 'https://atp.ub.ac.id/visi/'],
  }),
  '15.3.1': ql({
    pol: false, // reviewed 2019
    l: ['https://ubforest.ub.ac.id/'],
  }),
  '15.3.2': ql({
    pol: false, // created 2007
    l: ['https://prasetya.ub.ac.id/en/ub-forest-diresmikan-sebagai-zona-konservasi-keanekaragaman-hayati/'],
  }),
  '15.3.3': ql({ l: ['https://greencampus.ub.ac.id/en/pengaturan-dan-infrastruktur/'] }),
  '15.3.4': ql({ a: 'tidak', c: 'There is no issue with the alien species on campus. National law prohibited any alien species on campus.' }),
  '15.3.5': ql({ l: ['https://kumparan.com/nawat-qisthi-al-izzatil-hambra/bersih-sungai-kolaborasi-masyarakat-dengan-mahasiswa-ub-pulihkan-esensi-sungai-20znOyKFpvr'] }),
  '15.4.1': ql({ l: ['https://kumparan.com/nawat-qisthi-al-izzatil-hambra/bersih-sungai-kolaborasi-masyarakat-dengan-mahasiswa-ub-pulihkan-esensi-sungai-20znOyKFpvr', 'https://kanal24.co.id/ekspedisi-brawijaya-bawa-misi-pemberdayaan-masyarakat-pulau-terluar-indonesia/'] }),
  '15.4.2': ql({
    pol: false, // created 2020
    c: "Responding to the government's policy regarding the ban on the use of plastic drinking water packaging, the Chancellor of Brawijaya University (UB) issued a policy regarding the use of single-use plastic packaging on campus.",
  }),
  '15.4.3': ql({
    pol: false, // reviewed 2019
    l: ['https://erp.ub.ac.id/'],
  }),
}

// ══════════════ SDG 16 — Peace, Justice and Strong Institutions ══════════════
ANSWERS[16] = {
  '16.2.1': ql({
    choices: ['students', 'faculty', 'staff'],
    c: '(1) EM is student representative elected by all students of UB (2) UB organization mentions that faculty and staff are represented by university staff (3) Rector selection involves faculty and staff based on procedures for electing the rector of Brawijaya University.',
    l: ['https://em.ub.ac.id/', 'https://www.instagram.com/p/CcX_3OwpH_9/?img_index=1'],
  }),
  '16.2.2': ql({
    choices: ['governance', 'support', 'social'],
    l: ['https://em.ub.ac.id/', 'https://ub.ac.id/id/campus-life/student-activity-unit/'],
  }),
  '16.2.3': ql({
    pol: false, // created 1963
    c: 'commitment for better public institution by developing faculty and department specific for public administration',
    l: ['https://lppm.ub.ac.id/en/kerjasama/', 'https://prasetya.ub.ac.id/en/ftub-jalin-kerja-sama-dengan-dinas-dpkp-kota-batu/'],
  }),
  '16.2.4': ql({ l: ['https://feb.ub.ac.id/en/dialog-jurusan-ilmu-ekonomi-dan-stakeholder/', 'https://fpik.ub.ac.id/workshop-rekonstruksi-kurikulum-prodi-thp-hadirkan-stakeholder-alumni-dan-mahasiswa/'] }),
  '16.2.5': ql({ l: ['https://hukum.ub.ac.id/bincang-santai-mengenai-pentingnya-pendidikan-antikorupsi-sebagai-upaya-pencegahan-korupsi-sejak-dini/', 'https://wbs.ub.ac.id/'] }),
  '16.2.6': ql({
    pol: false, // created 2008
    choices: ['researchSenior', 'researchJunior', 'teachSenior', 'teachJunior'],
    l: ['https://lppm.ub.ac.id/wp-content/uploads/Buku-Panduan-Pelaksanaan-Penelitian-dan-Pengabdian-kepada-Masyarakat-Edisi-XII-1.pdf'],
  }),
  '16.2.7': ql({ l: ['https://ppid.ub.ac.id/wp-content/uploads/UB_Laporan_Keuangan_Audited_KAP_2021_SEC.pdf'] }),
  '16.3.1': ql({
    choices: ['local', 'regional', 'national'],
    l: ['https://ppid.ub.ac.id/blog/2023/04/ub-dan-diskominfo-jatim-bekerjasama-terkait-kip/', 'https://jdih.bappenas.go.id/berita/detailberita2/3213'],
  }),
  '16.3.2': ql({ l: ['https://ub.ac.id/research/community-service/'] }),
  '16.3.3': ql({ l: ['https://ub.ac.id/id/about/cooperation/domestic-cooperation/'] }),
  '16.3.4': ql({ l: ['https://prasetya.ub.ac.id/en/netralitas-aparatur-sipil-negara-dalam-menghadapi-pemilu-2024/'] }),
  '16.4.1': qt({ totalGraduates: '11717', lawEnforcementGraduates: '776' }),
}

// ══════════════ SDG 17 — Partnerships for the Goals ══════════════
ANSWERS[17] = {
  '17.2.1': ql({
    c: 'The Minister of Maritime Affairs and Fisheries of the Republic of Indonesia revealed that UB could participate in the in-depth exploration and research on how marine conservation could absorb carbon five times higher than on land. Developing sustainable aquaculture is crucial to support the five commodities expected to become key players in the coming years.',
    l: ['https://prasetya.ub.ac.id/en/kunjungi-ub-menteri-perikanan-dan-kelautan-bahas-program-ekonomi-biru/', 'https://prasetya.ub.ac.id/en/ub-dan-bsip-kementan-sepakat-kerja-sama-standarisasi-produk-pertanian/'],
  }),
  '17.2.2': ql({
    c: 'This conference encourages academic community members to help protect biodiversity by discussing and sharing new strategies, innovative technologies, management methods, and practical case studies. It collects these contributions to provide insights into how a circular economy can contribute to achieving the SDGs.',
    l: ['https://icgrc.ub.ac.id/'],
  }),
  '17.2.3': ql({
    c: 'ICGRC 2022 also collaborates with UNESCO, introducing its program, Man and the Biosphere (MAB)',
    l: ['https://sdgs.ub.ac.id/category/mitra-kerja/go-international/', 'https://kanal24.co.id/icgrc-2022-mengoptimalkan-cagar-biosfer-untuk-mewujudkan-sdgs/'],
  }),
  '17.2.4': ql({
    c: 'IFI enhances collaboration with the SDGs Center at UB to achieve sustainable development goals, partnering with various international donor agencies. This collaboration facilitates the connection between Universitas Brawijaya and several universities and research centers in France.',
    l: ['https://prasetya.ub.ac.id/en/kolaborasi-ifi-dan-sdgs-center-percepat-pembangunan-desa/', 'https://prasetya.ub.ac.id/en/1st-asia-halal-summit-inisiasi-kerjasama-internasional-wujudkan-ekosistem-industri-halal/'],
  }),
  '17.2.5': ql({
    choices: ['volunteering', 'research', 'resources'],
    c: 'FI and Wisma Germany are both non-governmental organizations (NGOs) in Indonesia, prepared to collaborate with UB SDGs, serving as intermediaries for partnerships with entities aligned with SDGs issues.',
    l: ['https://prasetya.ub.ac.id/en/mahasiswa-warga-dan-dinas-kehutanan-lumajang-lakukan-tanam-pohon-bersama-di-desa-sidomulyo/', 'https://prasetya.ub.ac.id/en/sdgs-ub-bangun-jejaring-dengan-ifi-dan-wisma-jerman/'],
  }),
  '17.4.1': ql({
    choice: 'integrated',
    c: 'The second evidence shows students\' projects from one of the courses as part of curriculum.',
    l: ['https://filkom.ub.ac.id/sdg/', 'https://sdgs.ub.ac.id/pendidikan/hasil-praktikum-mahasiswa/'],
  }),
  '17.4.2': ql({
    c: "The Master's Program in Natural Resources Management and the Doctoral Program in Environmental Studies offer dedicated courses, including full degrees and electives, that address sustainability and the SDGs.",
    l: ['https://ppsub.ub.ac.id/pmpslp/', 'https://ppsub.ub.ac.id/pdil/'],
  }),
  '17.4.3': ql({
    choices: ['alumni', 'local', 'displaced'],
    c: 'The university dedicates outreach educational activities for the wider community, managed by the university, faculties, and departments every year.',
    l: ['https://ub.ac.id/research/community-service/'],
  }),
}

// 17.3.1 .. 17.3.17 — Publication of SDG reports (semua "overall report", bukti sama)
for (let i = 1; i <= 17; i++) {
  ANSWERS[17][`17.3.${i}`] = ql({ l: ['https://s.ub.ac.id/sdgreport2022'] })
}

// ─────────────── eksekusi ───────────────

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: 'super_admin' },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) {
    throw new Error('super_admin user tidak ditemukan. Jalankan `npm run seed` dulu.')
  }

  const deleted = await prisma.universityRecord.deleteMany({ where: { year: YEAR } })
  console.log(`Menghapus ${deleted.count} university_records lama (year=${YEAR}).`)

  let created = 0
  for (const sdgIdStr of Object.keys(ANSWERS)) {
    const sdgId = parseInt(sdgIdStr)
    const cfg = THE_SDG_CONFIG_2026[sdgId]
    const codeKeyed = ANSWERS[sdgId]

    const points = calcSdgEstimate(sdgId, codeKeyed)
    const theAnswers = wrapTheAnswers(codeKeyed as Record<string, unknown>)

    await prisma.universityRecord.create({
      data: {
        title: `SDG ${sdgId} - ${cfg.title} (${YEAR})`,
        sdgId,
        year: YEAR,
        status: 'published',
        theAnswers: theAnswers as Prisma.InputJsonValue,
        qsAnswers: {},
        points,
        createdByUserId: admin.id,
      },
    })
    created++
    console.log(`  SDG ${String(sdgId).padStart(2)} → ${cfg.title} (points=${points})`)
  }

  console.log(`Selesai. ${created} university_records ${YEAR} dibuat.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
