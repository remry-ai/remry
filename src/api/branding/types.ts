export interface BrandingProfile {
  readonly id: string;
  readonly name: string;
  readonly iconUrl: string | null;
  readonly logoUrl: string | null;
  readonly primaryColor: string;
  readonly accentColor: string;
  readonly primaryFontColor: string;
  readonly accentFontColor: string;
  readonly isDefault: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BrandingSummary {
  readonly id: string;
  readonly name: string;
  readonly primaryColor: string;
  readonly accentColor: string;
  readonly primaryFontColor: string;
  readonly accentFontColor: string;
  readonly hasIcon: boolean;
  readonly hasLogo: boolean;
  readonly isDefault: boolean;
}
