-- A sync doc's or page's last sync: when, what ran it (APP or CLAUDE), how it went
-- (OK, PARTIAL or FAILED) and the message (why it failed, or what it couldn't read).
ALTER TABLE "doc" ADD COLUMN "last_sync_at" DATETIME;
ALTER TABLE "doc" ADD COLUMN "last_sync_by" TEXT;
ALTER TABLE "doc" ADD COLUMN "last_sync_outcome" TEXT;
ALTER TABLE "doc" ADD COLUMN "last_sync_message" TEXT;
ALTER TABLE "page" ADD COLUMN "last_sync_at" DATETIME;
ALTER TABLE "page" ADD COLUMN "last_sync_by" TEXT;
ALTER TABLE "page" ADD COLUMN "last_sync_outcome" TEXT;
ALTER TABLE "page" ADD COLUMN "last_sync_message" TEXT;

-- Until now only each source kept a time: a sync doc's or page's last sync is its newest one.
UPDATE "doc" SET "last_sync_at" = (SELECT MAX("synced_at") FROM "link" WHERE "link"."entity_type" = 'DOC' AND "link"."entity_id" = "doc"."id"), "last_sync_outcome" = 'OK'
WHERE "prompt" IS NOT NULL AND EXISTS (SELECT 1 FROM "link" WHERE "link"."entity_type" = 'DOC' AND "link"."entity_id" = "doc"."id" AND "link"."synced_at" IS NOT NULL);
UPDATE "page" SET "last_sync_at" = (SELECT MAX("synced_at") FROM "link" WHERE "link"."entity_type" = 'PAGE' AND "link"."entity_id" = "page"."id"), "last_sync_outcome" = 'OK'
WHERE "prompt" IS NOT NULL AND EXISTS (SELECT 1 FROM "link" WHERE "link"."entity_type" = 'PAGE' AND "link"."entity_id" = "page"."id" AND "link"."synced_at" IS NOT NULL);
