export const PIPELINE = ['Saved', 'Applied', 'Screening', 'Interview', 'Final interview', 'Offer', 'Accepted'] as const;
export const CLOSED = ['Rejected', 'Withdrawn', 'No response'] as const;
export const STATUSES = [...PIPELINE, ...CLOSED] as const;
export type Status = (typeof STATUSES)[number];

export const SOURCES = ['Indeed', 'Company site', 'Recruiter', 'Referral', 'Other'] as const;
export type Source = (typeof SOURCES)[number];

export const SECTORS = [
  'Property and lettings',
  'Housing and local authority',
  'Research and investigations',
  'Legal',
  'Operations',
  'Other',
] as const;
export type Sector = (typeof SECTORS)[number];

export const WORK_MODES = ['On-site', 'Hybrid', 'Remote'] as const;
export type WorkMode = (typeof WORK_MODES)[number];
export const CONTRACT_TYPES = ['Permanent', 'Fixed term', 'Temporary', 'Contract'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export const PAY_UNITS = ['year', 'day', 'hour'] as const;
export type PayUnit = (typeof PAY_UNITS)[number];
export const RISKS = ['Low', 'Medium', 'High'] as const;
export type Risk = (typeof RISKS)[number];
export const INTERVIEW_TYPES = ['Phone', 'Video', 'In person', 'Assessment'] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export interface Application {
  id: string;
  company: string;
  role_title: string;
  job_url: string | null;
  source: Source;
  sector: Sector;
  location: string | null;
  work_mode: WorkMode | null;
  contract_type: ContractType | null;
  pay_min: number | null;
  pay_max: number | null;
  pay_unit: PayUnit | null;
  date_found: string | null; // YYYY-MM-DD
  date_applied: string | null;
  closing_date: string | null;
  cv_version_id: string | null;
  cover_letter: boolean;
  status: Status;
  fit_score: number | null;
  conflict_risk: Risk | null;
  next_action: string | null;
  next_action_date: string | null;
  contact_name: string | null;
  contact_email: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StatusEvent {
  id: string;
  application_id: string;
  from_status: Status | null;
  to_status: Status;
  changed_at: string; // ISO timestamp
  note: string | null;
}

export interface CvVersion {
  id: string;
  name: string;
  file_path: string | null;
  file_name: string | null;
  created_on: string;
  focus: string | null;
  change_summary: string | null;
  active: boolean;
  created_at: string;
}

export interface Interview {
  id: string;
  application_id: string;
  date_time: string;
  type: InterviewType;
  interviewer: string | null;
  questions_asked: string | null;
  how_it_went: number | null;
  notes: string | null;
}

export interface Settings {
  weekly_target: number;
  no_response_days: number;
  day_multiplier: number;
  hour_multiplier: number;
  seeded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  weekly_target: 10,
  no_response_days: 21,
  day_multiplier: 220,
  hour_multiplier: 1950,
  seeded: false,
};

export interface Data {
  applications: Application[];
  events: StatusEvent[];
  cvs: CvVersion[];
  interviews: Interview[];
  settings: Settings;
}

export type NewApplication = Partial<Omit<Application, 'id' | 'created_at' | 'updated_at'>> &
  Pick<Application, 'company' | 'role_title'>;

/** A CV version is required for every status except these two. */
export function needsCv(status: Status): boolean {
  return status !== 'Saved' && status !== 'Withdrawn';
}
export function isClosed(status: Status): boolean {
  return (CLOSED as readonly string[]).includes(status);
}
