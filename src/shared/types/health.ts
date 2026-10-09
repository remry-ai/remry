export interface HealthStatus {
  readonly ok: boolean;
  readonly checkedAt: Date;
  readonly database: 'up' | 'down';
  readonly version: string;
}
