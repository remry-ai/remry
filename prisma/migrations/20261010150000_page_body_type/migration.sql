-- A wiki page's body is a document (markdown) or a spreadsheet (JSON in content,
-- see src/shared/utils/sheet.ts).
ALTER TABLE "page" ADD COLUMN "body_type" TEXT NOT NULL DEFAULT 'doc';

-- A spreadsheet page indexes the values its cells showed when it was last saved
-- (content.values, which the app always writes), not its raw JSON. Documents
-- index as before.
DROP TRIGGER IF EXISTS "search_page_ai";
DROP TRIGGER IF EXISTS "search_page_au";
DROP TRIGGER IF EXISTS "search_page_ad";

CREATE TRIGGER "search_page_ai" AFTER INSERT ON "page" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('PAGE', NEW.id, NULL, NULL, NEW.title, (CASE WHEN NEW.body_type = 'sheet' AND json_valid(NEW.content) THEN COALESCE((SELECT group_concat(c.value, ' ') FROM json_each(NEW.content, '$.values') AS row, json_each(row.value) AS c WHERE c.type <> 'null' AND c.value <> ''), '') ELSE NEW.content END) || char(10) || COALESCE(CASE WHEN json_valid(NEW.properties) THEN (SELECT group_concat(value, ' ') FROM json_each(NEW.properties) WHERE type <> 'null') ELSE NEW.properties END, ''));
END;
CREATE TRIGGER "search_page_au" AFTER UPDATE ON "page" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PAGE' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('PAGE', NEW.id, NULL, NULL, NEW.title, (CASE WHEN NEW.body_type = 'sheet' AND json_valid(NEW.content) THEN COALESCE((SELECT group_concat(c.value, ' ') FROM json_each(NEW.content, '$.values') AS row, json_each(row.value) AS c WHERE c.type <> 'null' AND c.value <> ''), '') ELSE NEW.content END) || char(10) || COALESCE(CASE WHEN json_valid(NEW.properties) THEN (SELECT group_concat(value, ' ') FROM json_each(NEW.properties) WHERE type <> 'null') ELSE NEW.properties END, ''));
END;
CREATE TRIGGER "search_page_ad" AFTER DELETE ON "page" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PAGE' AND entity_id = OLD.id;
END;
