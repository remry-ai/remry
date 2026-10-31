-- Reports are removed. Each existing one is kept as a doc on what it was attached to, with the
-- same id, so what hangs off it (notes, todos, links, comments, tags, emoji, relations) follows by
-- changing only its type. A wiki page takes no docs, so a report on one becomes its sub-page.

INSERT INTO "doc" ("id", "entity_type", "entity_id", "title", "content", "sort_order", "created_at", "updated_at")
SELECT r."id", r."entity_type", r."entity_id", r."title", r."content",
       (SELECT COALESCE(MAX(d."sort_order"), -1) + 1 FROM "doc" AS d WHERE d."entity_type" = r."entity_type" AND d."entity_id" = r."entity_id"),
       r."created_at", r."updated_at"
FROM "report" AS r
WHERE r."entity_type" <> 'PAGE';

INSERT INTO "page" ("id", "title", "body_type", "parent_id", "content", "sort_order", "created_at", "updated_at")
SELECT r."id", r."title", 'doc', r."entity_id", r."content",
       (SELECT COALESCE(MAX(p."sort_order"), -1) + 1 FROM "page" AS p WHERE p."parent_id" = r."entity_id"),
       r."created_at", r."updated_at"
FROM "report" AS r
WHERE r."entity_type" = 'PAGE';

-- What was on a report is now on the doc or page it became.
UPDATE "doc" SET "entity_type" = CASE WHEN EXISTS (SELECT 1 FROM "page" WHERE "page"."id" = "doc"."entity_id") THEN 'PAGE' ELSE 'DOC' END WHERE "entity_type" = 'REPORT';
UPDATE "note" SET "entity_type" = CASE WHEN EXISTS (SELECT 1 FROM "page" WHERE "page"."id" = "note"."entity_id") THEN 'PAGE' ELSE 'DOC' END WHERE "entity_type" = 'REPORT';
UPDATE "todo" SET "entity_type" = CASE WHEN EXISTS (SELECT 1 FROM "page" WHERE "page"."id" = "todo"."entity_id") THEN 'PAGE' ELSE 'DOC' END WHERE "entity_type" = 'REPORT';
UPDATE "link" SET "entity_type" = CASE WHEN EXISTS (SELECT 1 FROM "page" WHERE "page"."id" = "link"."entity_id") THEN 'PAGE' ELSE 'DOC' END WHERE "entity_type" = 'REPORT';
UPDATE "comment" SET "entity_type" = CASE WHEN EXISTS (SELECT 1 FROM "page" WHERE "page"."id" = "comment"."entity_id") THEN 'PAGE' ELSE 'DOC' END WHERE "entity_type" = 'REPORT';
UPDATE "tag_attachment" SET "entity_type" = CASE WHEN EXISTS (SELECT 1 FROM "page" WHERE "page"."id" = "tag_attachment"."entity_id") THEN 'PAGE' ELSE 'DOC' END WHERE "entity_type" = 'REPORT';
UPDATE "emoji" SET "entity_type" = CASE WHEN EXISTS (SELECT 1 FROM "page" WHERE "page"."id" = "emoji"."entity_id") THEN 'PAGE' ELSE 'DOC' END WHERE "entity_type" = 'REPORT';
DELETE FROM "page_chat" WHERE "entity_type" = 'REPORT';
UPDATE "relation" SET "from_type" = CASE WHEN EXISTS (SELECT 1 FROM "page" WHERE "page"."id" = "relation"."from_id") THEN 'PAGE' ELSE 'DOC' END WHERE "from_type" = 'REPORT';
UPDATE "relation" SET "to_type" = CASE WHEN EXISTS (SELECT 1 FROM "page" WHERE "page"."id" = "relation"."to_id") THEN 'PAGE' ELSE 'DOC' END WHERE "to_type" = 'REPORT';

-- The table goes, with its search triggers and index rows.
DROP TRIGGER IF EXISTS "search_report_ai";
DROP TRIGGER IF EXISTS "search_report_au";
DROP TRIGGER IF EXISTS "search_report_ad";
DELETE FROM "search_index" WHERE "entity_type" = 'REPORT';
DROP TABLE "report";
