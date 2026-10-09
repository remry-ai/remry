// Features switched off while they're unfinished. Client-safe.

export interface Features {
  /**
   * Reports: the nav link, the finder entry, the sidebar widget, the home feed and graph,
   * the /app/reports pages (404) and the report.* CLI and MCP tools. The router, data and
   * operations stay, so turning this back on loses nothing.
   */
  readonly reports: boolean;
}

export const features: Features = {
  reports: false
};
