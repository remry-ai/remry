-- Page kinds are gone: a wiki page is a plain page again, with no kind and no fields.
-- Nothing typed into a field is lost: a document page's kind and field values are
-- written at the top of its text first, as a list ("- **Amount:** 15.49"), with the
-- field's label where the kind still has it. A spreadsheet page has no text to hold them.
UPDATE "page" SET "content" =
    (CASE WHEN "kind" <> 'GENERAL' THEN '- **Kind:** ' || COALESCE((SELECT k."name" FROM "page_kind" k WHERE k."key" = "page"."kind"), "page"."kind") || char(10) ELSE '' END)
    || COALESCE((
        SELECT group_concat(
            '- **' || COALESCE(
                (SELECT json_extract(f.value, '$.label') FROM "page_kind" k, json_each(k."fields") f
                  WHERE k."key" = "page"."kind" AND json_extract(f.value, '$.key') = p.key),
                p.key
            ) || ':** ' || (CASE p.type
                WHEN 'array' THEN (SELECT group_concat(a.value, ', ') FROM json_each(p.value) a)
                WHEN 'true' THEN 'Yes'
                WHEN 'false' THEN 'No'
                ELSE p.value END),
            char(10))
        FROM json_each("page"."properties") p
        WHERE p.type <> 'null' AND p.value <> '' AND p.value <> '[]'
    ), '')
    || char(10) || char(10) || "content"
WHERE "body_type" = 'doc'
  AND ("kind" <> 'GENERAL'
       OR (json_valid("properties") AND EXISTS (SELECT 1 FROM json_each("page"."properties") p WHERE p.type <> 'null' AND p.value <> '' AND p.value <> '[]')));

-- The search triggers read "properties", so they go before the columns do.
DROP TRIGGER IF EXISTS "search_page_ai";
DROP TRIGGER IF EXISTS "search_page_au";
DROP TRIGGER IF EXISTS "search_page_ad";

DROP INDEX IF EXISTS "page_kind_idx";
ALTER TABLE "page" DROP COLUMN "kind";
ALTER TABLE "page" DROP COLUMN "properties";
DROP TABLE IF EXISTS "page_kind";

-- A page indexes its title and text (a spreadsheet, the values its cells showed).
CREATE TRIGGER "search_page_ai" AFTER INSERT ON "page" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('PAGE', NEW.id, NULL, NULL, NEW.title, (CASE WHEN NEW.body_type = 'sheet' AND json_valid(NEW.content) THEN COALESCE((SELECT group_concat(c.value, ' ') FROM json_each(NEW.content, '$.values') AS row, json_each(row.value) AS c WHERE c.type <> 'null' AND c.value <> ''), '') ELSE NEW.content END));
END;
CREATE TRIGGER "search_page_au" AFTER UPDATE ON "page" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PAGE' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('PAGE', NEW.id, NULL, NULL, NEW.title, (CASE WHEN NEW.body_type = 'sheet' AND json_valid(NEW.content) THEN COALESCE((SELECT group_concat(c.value, ' ') FROM json_each(NEW.content, '$.values') AS row, json_each(row.value) AS c WHERE c.type <> 'null' AND c.value <> ''), '') ELSE NEW.content END));
END;
CREATE TRIGGER "search_page_ad" AFTER DELETE ON "page" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PAGE' AND entity_id = OLD.id;
END;

-- Re-index every page from its text, which now holds what its fields did.
DELETE FROM "search_index" WHERE entity_type = 'PAGE';
INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body)
SELECT 'PAGE', id, NULL, NULL, title, (CASE WHEN body_type = 'sheet' AND json_valid(content) THEN COALESCE((SELECT group_concat(c.value, ' ') FROM json_each(content, '$.values') AS row, json_each(row.value) AS c WHERE c.type <> 'null' AND c.value <> ''), '') ELSE content END) FROM "page";
