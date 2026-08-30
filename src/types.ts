/**
 * LinkFlow — shared types.
 */

export type DirType = 'form' | 'listing' | 'article' | 'github' | 'community';
export type DirAuto = 'yes' | 'manual' | 'no';
export type DirStatus = 'active' | 'dead' | 'paid' | 'unknown';

export interface DirectoryEntry {
  name: string;
  submitUrl: string;
  type: DirType;
  auto: DirAuto;
  lang: string;
  category: string;
  dr?: number;
  dofollow?: boolean;
  badgeRequired?: boolean;
  notes?: string;
  status?: DirStatus;
}

export interface LinkFlowConfig {
  siteName: string;
  siteUrl: string;
  siteDescription?: string;
  tags?: string[];
  contentDomain?: string;
  writingSample?: string;
  ai: {
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    maxCallsPerRun?: number;
  };
  pacing?: {
    minSeconds?: number;
    perDay?: number;
  };
}

export interface SubmissionRecord {
  site: string;
  directory: string;
  status: 'submitted' | 'pending' | 'approved' | 'skipped' | 'failed';
  submittedAt: string;
  url?: string;
  proof?: string;
  notes?: string;
}

export interface Payload {
  directory: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  website: string;
  badges?: string[];
  fields?: Record<string, string>;
}
