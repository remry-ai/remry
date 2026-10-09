// Test helper. Build a Registry with safe defaults; override only what the
// operation under test actually touches.

import { vi } from 'vitest';
import type { Registry } from './registry';

export const createTestRegistry = (overrides: Partial<Registry> = {}): Registry => ({
  // The one concession to Prisma's type complexity - mock Prisma is cast.
  prisma: {} as Registry['prisma'],
  now: () => new Date('2024-01-01T00:00:00Z'),
  uuid: () => 'test-uuid-0000',
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  } as unknown as Registry['logger'],
  storage: {
    putObject: vi.fn().mockResolvedValue(undefined),
    readObject: vi.fn().mockResolvedValue(null),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    pathFor: vi.fn((key: string) => `/files/${key}`)
  },
  ...overrides
});
