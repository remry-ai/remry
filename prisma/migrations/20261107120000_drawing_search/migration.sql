-- A drawing page (body_type 'drawing') indexes the text in it, not its JSON: a
-- scene's text elements, or a skeleton's labels and text. Only the page
-- triggers change, and existing drawing pages (none before this release) are
-- re-indexed.

DROP TRIGGER IF EXISTS "search_page_ai";
DROP TRIGGER IF EXISTS "search_page_au";
DROP TRIGGER IF EXISTS "search_page_ad";

-- A page indexes its title and text (a spreadsheet, the values its cells showed; a drawing, its text).
CREATE TRIGGER "search_page_ai" AFTER INSERT ON "page" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('PAGE', NEW.id, NULL, NULL, NEW.title, (CASE WHEN NEW.body_type = 'sheet' AND json_valid(NEW.content) THEN COALESCE((SELECT group_concat(c.value, ' ') FROM json_each(NEW.content, '$.values') AS row, json_each(row.value) AS c WHERE c.type <> 'null' AND c.value <> ''), '') WHEN NEW.body_type = 'drawing' AND json_valid(NEW.content) THEN COALESCE((SELECT group_concat(t, ' ') FROM (SELECT COALESCE(json_extract(e.value, '$.originalText'), json_extract(e.value, '$.text')) AS t FROM json_each(NEW.content, '$.elements') AS e WHERE json_extract(e.value, '$.type') = 'text' UNION ALL SELECT COALESCE(json_extract(e.value, '$.text'), json_extract(e.value, '$.label.text')) FROM json_each(NEW.content, '$.skeleton') AS e) WHERE typeof(t) = 'text' AND t <> ''), '') ELSE NEW.content END));
END;
CREATE TRIGGER "search_page_au" AFTER UPDATE ON "page" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PAGE' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('PAGE', NEW.id, NULL, NULL, NEW.title, (CASE WHEN NEW.body_type = 'sheet' AND json_valid(NEW.content) THEN COALESCE((SELECT group_concat(c.value, ' ') FROM json_each(NEW.content, '$.values') AS row, json_each(row.value) AS c WHERE c.type <> 'null' AND c.value <> ''), '') WHEN NEW.body_type = 'drawing' AND json_valid(NEW.content) THEN COALESCE((SELECT group_concat(t, ' ') FROM (SELECT COALESCE(json_extract(e.value, '$.originalText'), json_extract(e.value, '$.text')) AS t FROM json_each(NEW.content, '$.elements') AS e WHERE json_extract(e.value, '$.type') = 'text' UNION ALL SELECT COALESCE(json_extract(e.value, '$.text'), json_extract(e.value, '$.label.text')) FROM json_each(NEW.content, '$.skeleton') AS e) WHERE typeof(t) = 'text' AND t <> ''), '') ELSE NEW.content END));
END;
CREATE TRIGGER "search_page_ad" AFTER DELETE ON "page" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PAGE' AND entity_id = OLD.id;
END;

DELETE FROM "search_index" WHERE entity_type = 'PAGE' AND entity_id IN (SELECT id FROM "page" WHERE body_type = 'drawing');
INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body)
SELECT 'PAGE', id, NULL, NULL, title, (CASE WHEN body_type = 'sheet' AND json_valid(content) THEN COALESCE((SELECT group_concat(c.value, ' ') FROM json_each(content, '$.values') AS row, json_each(row.value) AS c WHERE c.type <> 'null' AND c.value <> ''), '') WHEN body_type = 'drawing' AND json_valid(content) THEN COALESCE((SELECT group_concat(t, ' ') FROM (SELECT COALESCE(json_extract(e.value, '$.originalText'), json_extract(e.value, '$.text')) AS t FROM json_each(content, '$.elements') AS e WHERE json_extract(e.value, '$.type') = 'text' UNION ALL SELECT COALESCE(json_extract(e.value, '$.text'), json_extract(e.value, '$.label.text')) FROM json_each(content, '$.skeleton') AS e) WHERE typeof(t) = 'text' AND t <> ''), '') ELSE content END) FROM "page" WHERE body_type = 'drawing';
