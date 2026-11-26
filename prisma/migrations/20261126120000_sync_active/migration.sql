-- A sync can be paused: its prompt and sources stay, and sync.needed, Trigger sync and sync.save
-- leave it alone until it's resumed (sync.setActive). Additive.
ALTER TABLE "doc" ADD COLUMN "sync_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "page" ADD COLUMN "sync_active" BOOLEAN NOT NULL DEFAULT true;
