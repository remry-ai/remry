-- A sync the user asked for in the app, for Claude to do with its connectors the next time a
-- chat uses Remry (sync.needed lists it as `requested`). A sync clears it. Additive.
ALTER TABLE "doc" ADD COLUMN "sync_requested_at" DATETIME;
ALTER TABLE "page" ADD COLUMN "sync_requested_at" DATETIME;
