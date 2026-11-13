import type { NewApplication, CvVersion } from './types';

const FOUND = '2026-11-13';

export const SEED_CVS: Pick<CvVersion, 'name' | 'created_on' | 'focus' | 'file_name' | 'change_summary' | 'active'>[] = [
  { name: 'General v1', created_on: FOUND, focus: 'Lettings, operations, all-rounder', file_name: 'Ridwan_Harir_CV.pdf', change_summary: 'First version.', active: true },
  { name: 'Research v1', created_on: FOUND, focus: 'Research and legal skills listed first', file_name: 'Ridwan_Harir_CV_Research.pdf', change_summary: 'Research and legal skills moved to the top.', active: true },
];

const base = { source: 'Indeed', status: 'Saved', date_found: FOUND } as const;

export const SEED_APPLICATIONS: NewApplication[] = [
  { ...base, company: 'Fusion Lets', role_title: 'Property Acquisition Consultant', sector: 'Property and lettings', location: 'Heathrow', pay_min: 32000, pay_max: 36000, pay_unit: 'year', conflict_risk: 'High', job_url: 'https://uk.indeed.com/viewjob?jk=e0f1b2dd2a79eb4a', notes: 'Pay is basic. OTE £45k to £50k.' },
  { ...base, company: 'Daniels Estate Agents', role_title: 'Lettings Valuer / Manager', sector: 'Property and lettings', location: 'Wembley HA0', pay_min: 50000, pay_max: 55000, pay_unit: 'year', conflict_risk: 'High', job_url: 'https://uk.indeed.com/viewjob?jk=af2ed5584f9bd6a7' },
  { ...base, company: 'Cedar Harp', role_title: 'Newly Qualified Property Manager', sector: 'Property and lettings', location: 'London NW9', pay_min: 40000, pay_max: 40000, pay_unit: 'year', conflict_risk: 'Medium', job_url: 'https://uk.indeed.com/viewjob?jk=7bea1cd8a7f61bce' },
  { ...base, company: 'Pertemps (council client)', role_title: 'Private Sector Housing Officer', sector: 'Housing and local authority', location: 'London', work_mode: 'Hybrid', pay_min: 22.24, pay_max: 36.45, pay_unit: 'hour', conflict_risk: 'High', job_url: 'https://uk.indeed.com/viewjob?jk=0d0877bb7b2d91a0' },
  { ...base, company: 'Integreon', role_title: 'Conflicts Analyst', sector: 'Legal', location: 'London EC2Y', work_mode: 'Hybrid', conflict_risk: 'Low', next_action: 'Find the exact job URL on Indeed' },
  { ...base, company: 'British Transport Police', role_title: 'Intelligence Development Officer', sector: 'Research and investigations', location: 'London Bridge', pay_min: 35006, pay_max: 35006, pay_unit: 'year', conflict_risk: 'Low', next_action: 'Find the exact job URL on Indeed' },
  { ...base, company: 'The Portfolio Group', role_title: 'Field HR Investigator', sector: 'Research and investigations', location: 'London EC2A', pay_min: 30000, pay_max: 33300, pay_unit: 'year', conflict_risk: 'Low', next_action: 'Find the exact job URL on Indeed' },
  { ...base, company: 'Independent Office for Police Conduct', role_title: 'Trainee Investigator', sector: 'Research and investigations', location: 'Sale', work_mode: 'Hybrid', pay_min: 30870, pay_max: 34067, pay_unit: 'year', conflict_risk: 'Low', next_action: 'Find the exact job URL on Indeed' },
];
