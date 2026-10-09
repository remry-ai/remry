export interface ServerSettings {
  /** Root for all local state: the SQLite database, uploaded files and backups. */
  readonly dataDir: string;
  /** The public key Remry Pro license keys must be signed with. */
  readonly licensePublicKey: string;
}
