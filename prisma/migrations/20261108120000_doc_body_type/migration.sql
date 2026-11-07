-- Docs get a body type, as wiki pages have: markdown (doc), a spreadsheet (sheet)
-- or a drawing (drawing). Every existing doc is markdown. The doc search
-- triggers index a spreadsheet's values and a drawing's text, not their JSON,
-- as the page triggers do. Not additive: an older Remry would show a
-- spreadsheet doc's JSON as markdown, and could save over it.

ALTER TABLE "doc" ADD COLUMN "body_type" TEXT NOT NULL DEFAULT 'doc';

DROP TRIGGER IF EXISTS "search_doc_ai";
DROP TRIGGER IF EXISTS "search_doc_au";
DROP TRIGGER IF EXISTS "search_doc_ad";

-- A doc indexes its title and text (a spreadsheet, the values its cells showed; a drawing, its text).
CREATE TRIGGER "search_doc_ai" AFTER INSERT ON "doc" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('DOC', NEW.id, NEW.entity_type, NEW.entity_id, NEW.title, (CASE WHEN NEW.body_type = 'sheet' AND json_valid(NEW.content) THEN COALESCE((SELECT group_concat(c.value, ' ') FROM json_each(NEW.content, '$.values') AS row, json_each(row.value) AS c WHERE c.type <> 'null' AND c.value <> ''), '') WHEN NEW.body_type = 'drawing' AND json_valid(NEW.content) THEN COALESCE((SELECT group_concat(t, ' ') FROM (SELECT COALESCE(json_extract(e.value, '$.originalText'), json_extract(e.value, '$.text')) AS t FROM json_each(NEW.content, '$.elements') AS e WHERE json_extract(e.value, '$.type') = 'text' UNION ALL SELECT COALESCE(json_extract(e.value, '$.text'), json_extract(e.value, '$.label.text')) FROM json_each(NEW.content, '$.skeleton') AS e) WHERE typeof(t) = 'text' AND t <> ''), '') ELSE NEW.content END));
END;
CREATE TRIGGER "search_doc_au" AFTER UPDATE ON "doc" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'DOC' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('DOC', NEW.id, NEW.entity_type, NEW.entity_id, NEW.title, (CASE WHEN NEW.body_type = 'sheet' AND json_valid(NEW.content) THEN COALESCE((SELECT group_concat(c.value, ' ') FROM json_each(NEW.content, '$.values') AS row, json_each(row.value) AS c WHERE c.type <> 'null' AND c.value <> ''), '') WHEN NEW.body_type = 'drawing' AND json_valid(NEW.content) THEN COALESCE((SELECT group_concat(t, ' ') FROM (SELECT COALESCE(json_extract(e.value, '$.originalText'), json_extract(e.value, '$.text')) AS t FROM json_each(NEW.content, '$.elements') AS e WHERE json_extract(e.value, '$.type') = 'text' UNION ALL SELECT COALESCE(json_extract(e.value, '$.text'), json_extract(e.value, '$.label.text')) FROM json_each(NEW.content, '$.skeleton') AS e) WHERE typeof(t) = 'text' AND t <> ''), '') ELSE NEW.content END));
END;
CREATE TRIGGER "search_doc_ad" AFTER DELETE ON "doc" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'DOC' AND entity_id = OLD.id;
END;
