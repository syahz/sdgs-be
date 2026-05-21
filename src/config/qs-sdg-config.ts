import { theKey } from "./the-answer-key";

/**
 * QS Sustainability Rankings — Question Config
 *
 * Two kinds of QS questions exist:
 *
 *   1. STANDALONE  — questions stored separately under `submission.qsAnswers[code]`.
 *   2. SOURCED      — questions whose answer is identical to a THE indicator.
 *
 * Note: numbering scheme follows the QS borang (e.g. "1.1.1") which is
 * independent of the THE indicator code.
 */

export type QsInputType =
  | "yes_no"
  | "text"
  | "number"
  | "textarea"

export interface QsSource {
  theCode: string;
  field: string;
  transform?: (raw: unknown) => string;
}

export interface QsQuestion {
  code: string;
  sdgId: number;
  qsNumber: string;
  category: string;
  indicator: string;
  label: string;
  question: string;
  type: QsInputType;
  unit?: string;
  placeholder?: string;
  source?: QsSource;
}

const QS_SDG_CONFIG: QsQuestion[] = [
  // SDG 13 — Climate Action  (Environmental Impact 1.1)
  { code: "QS_13_CLIMATE_POLICY", sdgId: 13, qsNumber: "1.1.1", category: "Environmental Impact", indicator: "1.1 Environmental Sustainability", label: "Sustainability / Climate Action Policy Link", question: "Link to your institution's sustainability/climate action policy.", type: "text", placeholder: "https://ub.ac.id/kebijakan/climate-action" },
  { code: "QS_4_1", sdgId: 4, qsNumber: "1.1.2", category: "Environmental Impact", indicator: "1.1 Environmental Sustainability", label: "Mandatory Environmental Training for Staff", question: "Does the institution provide mandatory annual training on environmental/sustainability aspects for all staff?", type: "yes_no" },
  { code: "QS_4_2", sdgId: 4, qsNumber: "1.1.3", category: "Environmental Impact", indicator: "1.1 Environmental Sustainability", label: "Sustainability Literacy Assessment — Staff", question: "Does the institution have an assessment tool to measure sustainability literacy and knowledge for all staff?", type: "yes_no" },
  { code: "QS_4_3", sdgId: 17, qsNumber: "1.1.4", category: "Environmental Impact", indicator: "1.1 Environmental Sustainability", label: "Sustainability Literacy Assessment — Students", question: "Does the institution have an assessment tool to measure sustainability literacy and knowledge for all students?", type: "yes_no", source: { theCode: "17.4.4", field: "answered" } },
  { code: "QS_12_1", sdgId: 12, qsNumber: "1.1.5", category: "Environmental Impact", indicator: "1.1 Environmental Sustainability", label: "Sustainable Procurement Policy Link", question: "Please provide a link to the institution's sustainable procurement/purchasing policy.", type: "text", placeholder: "https://ub.ac.id/kebijakan/pengadaan-berkelanjutan" },
  { code: "QS_12_2", sdgId: 12, qsNumber: "1.1.6", category: "Environmental Impact", indicator: "1.1 Environmental Sustainability", label: "Sustainable Investment Policy Link", question: "Please provide a link to the institution's sustainable investment policy.", type: "text", placeholder: "https://ub.ac.id/kebijakan/investasi-berkelanjutan" },
  { code: "QS_17_1", sdgId: 17, qsNumber: "1.1.7", category: "Environmental Impact", indicator: "1.1 Environmental Sustainability", label: "Student-Led Sustainability Society", question: "Please provide evidence (link) of the existence of a student-led society aimed at advancing sustainability issues.", type: "text", placeholder: "https://ub.ac.id/himpunan/green-campus" },
  { code: "QS_13_1", sdgId: 13, qsNumber: "1.1.8", category: "Environmental Impact", indicator: "1.1 Environmental Sustainability", label: "GHG Reporting Standard", question: "Does the university report its carbon emissions in line with the GHG Protocol Corporate Standard or another recognised standard?", type: "yes_no" },
  { code: "QS_13_2", sdgId: 13, qsNumber: "1.1.9", category: "Environmental Impact", indicator: "1.1 Environmental Sustainability", label: "Total Scope 1 & 2 Emissions", question: "What is the total Scope 1 and Scope 2 carbon emission in tCO2e for the last reporting year?", type: "number", unit: "tCO2e", placeholder: "e.g. 12500" },
  { code: "QS_13_3", sdgId: 13, qsNumber: "1.1.10", category: "Environmental Impact", indicator: "1.1 Environmental Sustainability", label: "Year Started GHG Recording", question: "What year did your institution begin recording emissions in line with a recognised GHG standard?", type: "number", unit: "year", placeholder: "e.g. 2019" },
  { code: "QS_13_4", sdgId: 13, qsNumber: "1.1.11", category: "Environmental Impact", indicator: "1.1 Environmental Sustainability", label: "Carbon Reduction Target (>=2050)", question: "Does the university have a carbon reduction target (Scope 1 & 2) for at least the year 2050?", type: "yes_no" },
  { code: "QS_13_5", sdgId: 13, qsNumber: "1.1.12", category: "Environmental Impact", indicator: "1.1 Environmental Sustainability", label: "On-Campus Renewable Energy Generated", question: "How much energy (kWh) was generated on campus through renewable sources in the last reporting year?", type: "number", unit: "kWh", placeholder: "e.g. 450000" },
  { code: "QS_13_6", sdgId: 7, qsNumber: "1.1.13", category: "Environmental Impact", indicator: "1.1 Environmental Sustainability", label: "Total Campus Building Footprint", question: "What is the total campus building footprint area (gross floor area)?", type: "number", unit: "m²", placeholder: "e.g. 350000", source: { theCode: "7.3.1", field: "floorSpaceM2" } },
  { code: "QS_13_NETZERO_YEAR", sdgId: 13, qsNumber: "1.1.14", category: "Environmental Impact", indicator: "1.1 Environmental Sustainability", label: "Year Publicly Committed to Net-Zero", question: "Please provide the year your institution has publicly committed to reaching net-zero.", type: "number", unit: "year", placeholder: "e.g. 2050" },
  // SDG 4 — Quality Education
  { code: "QS_4_4", sdgId: 4, qsNumber: "1.2.1", category: "Environmental Impact", indicator: "1.2 Environmental Education", label: "Dedicated Climate/Sustainability Courses", question: "Does the institution offer courses specifically teaching climate science and/or environmental sustainability?", type: "yes_no" },
  { code: "QS_4_5", sdgId: 4, qsNumber: "2.2.1", category: "Social Impact", indicator: "2.2 Knowledge Exchange", label: "Mandatory Social Sustainability Training for Staff", question: "Does the institution provide mandatory annual training on social sustainability aspects for all staff?", type: "yes_no" },
  // SDG 17 — Environmental Research
  { code: "QS_17_2", sdgId: 17, qsNumber: "1.3.1", category: "Environmental Impact", indicator: "1.3 Environmental Research", label: "Sustainability-Focused Research Centre", question: "Is there a Research Centre at the institution with a specific focus on environmental sustainability?", type: "yes_no" },
  // SDG 5 — Gender Equality
  { code: "QS_5_1", sdgId: 5, qsNumber: "2.1.1", category: "Social Impact", indicator: "2.1 Equality", label: "Male Faculty Staff Count", question: "Number of male faculty staff.", type: "number", unit: "persons", placeholder: "e.g. 1800" },
  { code: "QS_5_2", sdgId: 5, qsNumber: "2.1.2", category: "Social Impact", indicator: "2.1 Equality", label: "Female Faculty Staff Count", question: "Number of female faculty staff.", type: "number", unit: "persons", placeholder: "e.g. 2960" },
  { code: "QS_5_3", sdgId: 5, qsNumber: "2.1.3", category: "Social Impact", indicator: "2.1 Equality", label: "Other Faculty Staff Count", question: "Number of faculty staff identifying as other gender.", type: "number", unit: "persons", placeholder: "e.g. 0" },
  { code: "QS_5_4", sdgId: 5, qsNumber: "2.1.4", category: "Social Impact", indicator: "2.1 Equality", label: "Female Student Count", question: "Number of female students enrolled.", type: "number", unit: "persons", placeholder: "e.g. 18000" },
  { code: "QS_5_5", sdgId: 5, qsNumber: "2.1.5", category: "Social Impact", indicator: "2.1 Equality", label: "Other Student Count", question: "Number of students identifying as other gender.", type: "number", unit: "persons", placeholder: "e.g. 0" },
  { code: "QS_5_6", sdgId: 5, qsNumber: "2.1.6", category: "Social Impact", indicator: "2.1 Equality", label: "Senior Leadership Team Size", question: "Total number of members in the Senior Leadership Team.", type: "number", unit: "persons", placeholder: "e.g. 12" },
  { code: "QS_5_7", sdgId: 5, qsNumber: "2.1.7", category: "Social Impact", indicator: "2.1 Equality", label: "Male Senior Leaders Count", question: "Number of senior leadership team members identifying as male.", type: "number", unit: "persons", placeholder: "e.g. 8" },
  { code: "QS_5_8", sdgId: 5, qsNumber: "2.1.8", category: "Social Impact", indicator: "2.1 Equality", label: "EDI Policy", question: "Does the institution have a current Equality, Diversity, and Inclusion (EDI) policy?", type: "yes_no" },
  { code: "QS_5_9", sdgId: 5, qsNumber: "2.1.9", category: "Social Impact", indicator: "2.1 Equality", label: "Disability Support Services", question: "Does the institution offer support services for people with disabilities?", type: "yes_no", source: { theCode: "10.6.8", field: "answered" } },
  { code: "QS_5_10", sdgId: 5, qsNumber: "2.1.10", category: "Social Impact", indicator: "2.1 Equality", label: "Campus Physical Accessibility", question: "Is the campus physically accessible for people with disabilities?", type: "yes_no", source: { theCode: "10.6.7", field: "answered" } },
  { code: "QS_DISABILITY_MENTORING", sdgId: 10, qsNumber: "2.1.11", category: "Social Impact", indicator: "2.1 Equality", label: "Disability Access Scheme (mentoring/support)", question: "Does the institution provide access schemes for people with disabilities?", type: "yes_no", source: { theCode: "10.6.9", field: "answered" } },
  { code: "QS_DISABILITY_CAMPUS_ACCOMMODATION", sdgId: 10, qsNumber: "2.1.12", category: "Social Impact", indicator: "2.1 Equality", label: "Campus Accommodation for People with Disabilities", question: "Does the university provide campus accommodation for people with disabilities?", type: "yes_no" },
  { code: "QS_DISABILITY_REASONABLE_ADJUSTMENT", sdgId: 10, qsNumber: "2.1.13", category: "Social Impact", indicator: "2.1 Equality", label: "Reasonable Adjustment Policy for Disabilities", question: "Does the university have a policy or strategy that outlines the reasonable adjustment and provision for students with disabilities?", type: "yes_no", source: { theCode: "10.6.10", field: "answered" } },
  { code: "QS_5_11", sdgId: 5, qsNumber: "3.1.1", category: "Good Governance", indicator: "3.1 Good Governance", label: "EDI Committee / Officer Existence", question: "Is there a committee, office, or officer specifically tasked with formulating and implementing equality, diversity, inclusion, and human rights policies on campus?", type: "yes_no" },
  { code: "QS_5_12", sdgId: 5, qsNumber: "3.1.2", category: "Good Governance", indicator: "3.1 Good Governance", label: "EDI Committee Evidence Link", question: "Please provide evidence (link) of the existence of this EDI committee/office/officer.", type: "text", placeholder: "https://ub.ac.id/unit/kesetaraan" },
  { code: "QS_GOV_ANTI_DISCRIMINATION", sdgId: 5, qsNumber: "3.1.3", category: "Good Governance", indicator: "3.1 Good Governance", label: "Anti-Discrimination & Anti-Harassment Policies", question: "Does the institution have anti-discrimination and anti-harassment policies in place?", type: "yes_no", source: { theCode: "10.6.4", field: "answered" } },
  { code: "QS_GOV_ANTI_BRIBERY", sdgId: 5, qsNumber: "3.1.4", category: "Good Governance", indicator: "3.1 Good Governance", label: "Anti-Bribery & Corruption Policy", question: "Does the institution have an anti-bribery and corruption policy?", type: "yes_no", source: { theCode: "16.2.5", field: "answered" } },
  { code: "QS_16_7", sdgId: 5, qsNumber: "3.1.5", category: "Good Governance", indicator: "3.1 Good Governance", label: "Dedicated Sustainability Staff/Team", question: "Is there a staff member or team whose primary responsibility is advancing sustainable development at the institution?", type: "yes_no" },
  { code: "QS_16_1", sdgId: 16, qsNumber: "3.1.6", category: "Good Governance", indicator: "3.1 Good Governance", label: "Ethical Organisational Culture", question: "Does the organisation support and facilitate an ethical and holistic organisational culture?", type: "yes_no" },
  { code: "QS_16_2", sdgId: 16, qsNumber: "3.1.7", category: "Good Governance", indicator: "3.1 Good Governance", label: "Public Ethical Values Document", question: "Does the organisation develop clear ethical values documented in a publicly available strategic document?", type: "yes_no" },
  { code: "QS_16_3", sdgId: 16, qsNumber: "3.1.8", category: "Good Governance", indicator: "3.1 Good Governance", label: "Ethics Training at All Levels", question: "Does the university provide ethics training based on those values at all organisational levels?", type: "yes_no" },
  { code: "QS_16_4", sdgId: 16, qsNumber: "3.1.9", category: "Good Governance", indicator: "3.1 Good Governance", label: "Ethics Compliance Office", question: "Is there an ethics compliance office with an appointed officer to oversee ethical matters?", type: "yes_no" },
  { code: "QS_16_5", sdgId: 16, qsNumber: "3.1.10", category: "Good Governance", indicator: "3.1 Good Governance", label: "Internal Whistleblower Reporting System", question: "Does the organisation have an internal reporting system to guarantee confidentiality for whistleblowers?", type: "yes_no" },
  { code: "QS_16_8", sdgId: 5, qsNumber: "3.1.11", category: "Good Governance", indicator: "3.1 Good Governance", label: "Student Union Existence", question: "Does the university have a Student Union (Badan Eksekutif Mahasiswa / BEM)?", type: "yes_no" },
  { code: "QS_16_9", sdgId: 5, qsNumber: "3.1.12", category: "Good Governance", indicator: "3.1 Good Governance", label: "Student Union Represents UG & PG", question: "Does the student union represent both undergraduate and postgraduate students at university level?", type: "yes_no" },
  { code: "QS_16_10", sdgId: 5, qsNumber: "3.1.13", category: "Good Governance", indicator: "3.1 Good Governance", label: "Student Union Affiliated Nationally", question: "Is the student union connected/affiliated with a wider national student body?", type: "yes_no" },
  { code: "QS_16_11", sdgId: 5, qsNumber: "3.1.14", category: "Good Governance", indicator: "3.1 Good Governance", label: "Student Union Leader Elected by Vote", question: "Is the leader of the student union elected by student vote?", type: "yes_no" },
  { code: "QS_16_12", sdgId: 5, qsNumber: "3.1.15", category: "Good Governance", indicator: "3.1 Good Governance", label: "Sustainability Committee Formed", question: "Has the institution established a Sustainability Committee?", type: "yes_no" },
  { code: "QS_GOV_PUBLISH_FINANCE", sdgId: 5, qsNumber: "3.1.16", category: "Good Governance", indicator: "3.1 Good Governance", label: "Publish Annual Financial Reports", question: "Does your institution publish its financial reports on an annual basis?", type: "yes_no", source: { theCode: "16.2.7", field: "answered" } },
  { code: "QS_16_6", sdgId: 5, qsNumber: "3.1.17", category: "Good Governance", indicator: "3.1 Good Governance", label: "AGM Decisions Published Publicly", question: "Does the institution share decisions taken in the Annual General Meeting publicly?", type: "yes_no" },
  { code: "QS_16_13", sdgId: 5, qsNumber: "3.1.18", category: "Good Governance", indicator: "3.1 Good Governance", label: "Student Representation in Governing Body", question: "Does the university governing body include representation from students?", type: "yes_no" },
  // SDG 3 — Good Health & Well-being
  { code: "QS_3_1", sdgId: 3, qsNumber: "2.3.1", category: "Social Impact", indicator: "2.3 Health and Wellbeing", label: "Community Outreach Projects", question: "Does the university offer, manage, or conduct outreach projects for the local community?", type: "yes_no" },
  { code: "QS_3_2", sdgId: 3, qsNumber: "2.3.2", category: "Social Impact", indicator: "2.3 Health and Wellbeing", label: "On-Campus Health & Wellbeing Services", question: "Does the university provide health and wellbeing services on campus or at local level?", type: "yes_no" },
  { code: "QS_3_3", sdgId: 3, qsNumber: "2.3.3", category: "Social Impact", indicator: "2.3 Health and Wellbeing", label: "Physical Health Services Access", question: "Access to physical health services, including information and education services (provide link or description).", type: "text", placeholder: "https://ub.ac.id/layanan/klinik-kesehatan" },
  { code: "QS_SEXUAL_REPRO_HEALTH", sdgId: 3, qsNumber: "2.3.4", category: "Social Impact", indicator: "2.3 Health and Wellbeing", label: "Sexual & Reproductive Healthcare Access", question: "Does the university provide access to sexual and reproductive healthcare services?", type: "yes_no", source: { theCode: "3.3.4", field: "answered" } },
  { code: "QS_MENTAL_HEALTH_SUPPORT", sdgId: 3, qsNumber: "2.3.5", category: "Social Impact", indicator: "2.3 Health and Wellbeing", label: "Mental Health Support (Staff & Students)", question: "Does the university provide access to mental health support for both staff and students?", type: "textarea", placeholder: "Misalnya: Universitas menyediakan konseling gratis untuk mahasiswa..." },
  // Add Information
  { code: "QS_ADD_WATER_CONSUMPTION", sdgId: 13, qsNumber: "4.1.1", category: "Add Information", indicator: "4.1 Additional Metrics", label: "Total Water Consumption (Previous Reporting Year)", question: "Your institution's water consumption for the previous reporting year (m3).", type: "number", unit: "m³", placeholder: "e.g. 297", source: { theCode: "6.2.2", field: "waterUsedM3" } },
  {
    code: "QS_ADD_ENERGY_CONSUMPTION", sdgId: 13, qsNumber: "4.1.2", category: "Add Information", indicator: "4.1 Additional Metrics", label: "Total Energy Consumption (Previous Reporting Year)", question: "Your institution's energy consumption for the previous reporting year (kWh).", type: "number", unit: "kWh", placeholder: "e.g. 9245008",
    source: {
      theCode: "7.3.1",
      field: "totalEnergyGJ",
      transform: (raw) => {
        const n = parseFloat(String(raw ?? ""));
        if (!Number.isFinite(n) || n <= 0) return "";
        return Math.round(n * 277.7778).toString();
      },
    }
  },
  { code: "QS_1_1", sdgId: 1, qsNumber: "4.1.3", category: "Add Information", indicator: "4.1 Additional Metrics", label: "Students on Full Scholarship (100%)", question: "How many students receive a scholarship covering 100% of their tuition fees?", type: "number", unit: "students", placeholder: "e.g. 850" },
  { code: "QS_1_2", sdgId: 1, qsNumber: "4.1.4", category: "Add Information", indicator: "4.1 Additional Metrics", label: "Students on Partial Scholarship (>=50%)", question: "How many students receive a scholarship covering at least 50% of their tuition fees?", type: "number", unit: "students", placeholder: "e.g. 2400" },
];

export function getQsQuestionsForSdg(sdgId: number): QsQuestion[] {
  return QS_SDG_CONFIG.filter((q) => q.sdgId === sdgId && !q.source);
}

export function getAllQsQuestionsForSdg(sdgId: number): QsQuestion[] {
  return QS_SDG_CONFIG.filter((q) => q.sdgId === sdgId);
}

export const QS_COVERED_SDG_IDS: number[] = [
  ...new Set(QS_SDG_CONFIG.filter((q) => !q.source).map((q) => q.sdgId)),
];

export type QsAnswers = Record<string, string>;

export interface QsResolveSource {
  sdgId: number;
  theAnswers?: Record<string, unknown>;
  qsAnswers?: Record<string, string>;
}

export function resolveQsAnswer(q: QsQuestion, subs: QsResolveSource[]): string {
  if (q.source) {
    const sdgNum = parseInt(q.source.theCode.split(".")[0] ?? "", 10);
    if (!Number.isFinite(sdgNum)) return "";
    const sub = subs.find((s) => s.sdgId === sdgNum);
    if (!sub) return "";
    const answer = sub.theAnswers?.[theKey(q.source.theCode)] as Record<string, unknown> | undefined;
    if (!answer) return "";
    const val = answer[q.source.field];
    if (q.source.transform) {
      const out = q.source.transform(val);
      return out ?? "";
    }
    if (val == null || val === "") return "";
    if (Array.isArray(val)) {
      const first = (val as unknown[]).find((x) => typeof x === "string" && (x as string).trim() !== "");
      return typeof first === "string" ? first : "";
    }
    if (typeof val === "boolean") return val ? "Yes" : "No";
    return String(val);
  }
  for (const sub of subs) {
    if (sub.sdgId !== q.sdgId) continue;
    const val = sub.qsAnswers?.[q.code];
    if (val && val.trim() !== "") return val;
  }
  return "";
}

export default QS_SDG_CONFIG;
