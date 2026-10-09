// Resolves the active base settings based on APP_ENV.
// Import from client or server: `import { settings } from '$shared/settings/base'`.

import { development } from "./development";
import { production } from "./production";
import type { BaseSettings } from "./types";

const env = (import.meta.env.PUBLIC_APP_ENV ??
  import.meta.env.MODE ??
  "development") as string;

export const settings: BaseSettings =
  env === "production" ? production : development;

export type { BaseSettings };
