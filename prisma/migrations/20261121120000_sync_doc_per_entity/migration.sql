-- A sync doc belongs to its entity: one per person, group, project or goal (doc.sync_holder,
-- "<ENTITY_TYPE>:<entity id>", unique), written only from the entity's own links marked as
-- sources (link.sync_source). A sync page's sources are its own links, marked the same way.
ALTER TABLE "doc" ADD COLUMN "sync_holder" TEXT;
CREATE UNIQUE INDEX "doc_sync_holder_key" ON "doc"("sync_holder");
ALTER TABLE "link" ADD COLUMN "sync_source" BOOLEAN NOT NULL DEFAULT false;

-- Each entity keeps its newest sync doc.
UPDATE "doc" SET "sync_holder" = "entity_type" || ':' || "entity_id"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "entity_type", "entity_id" ORDER BY "updated_at" DESC, "id" DESC) AS "rank"
    FROM "doc"
    WHERE "prompt" IS NOT NULL AND TRIM("prompt") <> '' AND "body_type" = 'doc'
  ) WHERE "rank" = 1
);

-- Its sources move to the entity. One the entity already links to (the same address) becomes a
-- source there, keeping the later of the two synced times, and the doc's copy goes.
UPDATE "link" SET
  "sync_source" = 1,
  "synced_at" = (
    SELECT MAX(COALESCE(MAX("d"."synced_at"), "link"."synced_at"), COALESCE("link"."synced_at", MAX("d"."synced_at")))
    FROM "link" AS "d" JOIN "doc" ON "d"."entity_type" = 'DOC' AND "d"."entity_id" = "doc"."id"
    WHERE "doc"."sync_holder" = "link"."entity_type" || ':' || "link"."entity_id" AND "d"."url" = "link"."url"
  ),
  "source_edited_at" = (
    SELECT MAX(COALESCE(MAX("d"."source_edited_at"), "link"."source_edited_at"), COALESCE("link"."source_edited_at", MAX("d"."source_edited_at")))
    FROM "link" AS "d" JOIN "doc" ON "d"."entity_type" = 'DOC' AND "d"."entity_id" = "doc"."id"
    WHERE "doc"."sync_holder" = "link"."entity_type" || ':' || "link"."entity_id" AND "d"."url" = "link"."url"
  )
WHERE "entity_type" <> 'DOC' AND EXISTS (
  SELECT 1 FROM "link" AS "d" JOIN "doc" ON "d"."entity_type" = 'DOC' AND "d"."entity_id" = "doc"."id"
  WHERE "doc"."sync_holder" = "link"."entity_type" || ':' || "link"."entity_id" AND "d"."url" = "link"."url"
);

DELETE FROM "link"
WHERE "entity_type" = 'DOC'
  AND "entity_id" IN (SELECT "id" FROM "doc" WHERE "sync_holder" IS NOT NULL)
  AND EXISTS (
    SELECT 1 FROM "link" AS "h" JOIN "doc" ON "doc"."id" = "link"."entity_id"
    WHERE "h"."entity_type" = "doc"."entity_type" AND "h"."entity_id" = "doc"."entity_id" AND "h"."url" = "link"."url"
  );

-- The rest move as they are. A file uploaded to the doc stays in the doc's folder until the app
-- next starts, when adoptStrayFileLinks copies it into the entity's (SQL can't move files).
UPDATE "link" SET
  "sync_source" = 1,
  "entity_type" = (SELECT "doc"."entity_type" FROM "doc" WHERE "doc"."id" = "link"."entity_id"),
  "entity_id" = (SELECT "doc"."entity_id" FROM "doc" WHERE "doc"."id" = "link"."entity_id")
WHERE "entity_type" = 'DOC' AND "entity_id" IN (SELECT "id" FROM "doc" WHERE "sync_holder" IS NOT NULL);

-- Every other doc with a prompt is an ordinary doc now; its links stay on it, as references.
UPDATE "doc" SET "prompt" = NULL, "last_sync_at" = NULL, "last_sync_by" = NULL, "last_sync_outcome" = NULL, "last_sync_message" = NULL
WHERE "sync_holder" IS NULL AND "prompt" IS NOT NULL;

-- A sync page's links are its sources.
UPDATE "link" SET "sync_source" = 1
WHERE "entity_type" = 'PAGE' AND "entity_id" IN (SELECT "id" FROM "page" WHERE "prompt" IS NOT NULL AND TRIM("prompt") <> '' AND "body_type" = 'doc');
