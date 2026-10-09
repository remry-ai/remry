import type { EntityType } from './enums';

export interface ReportBrandingProfile {
  readonly id: string;
  readonly name: string;
  readonly iconUrl: string | null;
  readonly logoUrl: string | null;
  readonly primaryColor: string;
  readonly accentColor: string;
  readonly primaryFontColor: string;
  readonly accentFontColor: string;
}

export interface ReportSummary {
  readonly id: string;
  readonly title: string;
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly entityName: string | null;
  readonly entityPath: string;
  /** The branding explicitly chosen for this report, if any. */
  readonly brandingId: string | null;
  readonly brandingName: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ReportDetail extends ReportSummary {
  readonly content: string;
  /** Resolved branding: the report's own, else the default profile, else none. */
  readonly branding: ReportBrandingProfile | null;
}
