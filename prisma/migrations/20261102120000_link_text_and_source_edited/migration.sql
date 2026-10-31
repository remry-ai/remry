-- A file link's saved text, and the source's last-edited time as of the last sync.
ALTER TABLE "link" ADD COLUMN "source_edited_at" DATETIME;
ALTER TABLE "link" ADD COLUMN "text" TEXT;

-- Search a file link's saved text along with its address.
DROP TRIGGER IF EXISTS "search_link_ai";
DROP TRIGGER IF EXISTS "search_link_au";
CREATE TRIGGER "search_link_ai" AFTER INSERT ON "link" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('LINK', NEW.id, NEW.entity_type, NEW.entity_id, COALESCE(NEW.title, ''), NEW.url || char(10) || COALESCE(NEW.text, ''));
END;
CREATE TRIGGER "search_link_au" AFTER UPDATE ON "link" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'LINK' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('LINK', NEW.id, NEW.entity_type, NEW.entity_id, COALESCE(NEW.title, ''), NEW.url || char(10) || COALESCE(NEW.text, ''));
END;
