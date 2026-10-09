// The Registry interface - DI contract for backend operations.
// Every backend operation receives a Pick<Registry, ...> as its first parameter.
// See src/api/CLAUDE.md §"The Registry" for the full rationale.

import type { PrismaClient } from '../../generated/prisma/client';
import type { Logger } from '$shared/types/logger';
import type { StorageClient } from '$shared/storage/client.server';

export interface Registry {
  readonly prisma: PrismaClient;
  /** Current time. Never call `new Date()` inside operations - use this. */
  readonly now: () => Date;
  /** UUID generation. Never call `crypto.randomUUID()` inside operations - use this. */
  readonly uuid: () => string;
  readonly logger: Logger;
  /** Local-disk file storage under the notebook's files/ folder. */
  readonly storage: StorageClient;
}
