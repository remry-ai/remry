-- Relation kinds become data: RELATED, DEPENDS_ON and MENTIONS stay built in, and
-- every other kind is a row with a label each way. The four kinds the code used
-- to know (partner, parent, sibling, friend) are added where relations use them,
-- so those relations keep reading the same. A reporting line becomes a LEAD_OF
-- relation (lead → report; exclusive: a person has one lead), and org_person keeps
-- only the title. A person can be "me", the notebook's owner.

CREATE TABLE "relation_kind" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "inverse_label" TEXT NOT NULL,
    "symmetric" BOOLEAN NOT NULL DEFAULT false,
    "people_only" BOOLEAN NOT NULL DEFAULT false,
    "exclusive" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

INSERT INTO "relation_kind" ("key", "label", "inverse_label", "symmetric", "people_only", "exclusive", "sort_order", "updated_at")
SELECT k.key, k.label, k.inverse_label, k.symmetric, true, k.exclusive, k.sort_order, CURRENT_TIMESTAMP FROM (
    SELECT 'LEAD_OF' AS key, 'Lead of' AS label, 'Reports to' AS inverse_label, false AS symmetric, true AS exclusive, 0 AS sort_order
    UNION ALL SELECT 'PARTNER_OF', 'Partner of', 'Partner of', true, false, 1
    UNION ALL SELECT 'PARENT_OF', 'Parent of', 'Child of', false, false, 2
    UNION ALL SELECT 'SIBLING_OF', 'Sibling of', 'Sibling of', true, false, 3
    UNION ALL SELECT 'FRIEND_OF', 'Friend of', 'Friend of', true, false, 4
) AS k
WHERE EXISTS (SELECT 1 FROM "relation" AS r WHERE r.kind = k.key)
   OR (k.key = 'LEAD_OF' AND EXISTS (SELECT 1 FROM "org_person" WHERE "lead_id" IS NOT NULL));

-- Reporting lines: lead → report.
INSERT INTO "relation" ("id", "from_type", "from_id", "to_type", "to_id", "kind", "created_at", "updated_at")
SELECT 'lead_' || o.person_id, 'PERSON', o.lead_id, 'PERSON', o.person_id, 'LEAD_OF', o.updated_at, o.updated_at
FROM "org_person" AS o
WHERE o.lead_id IS NOT NULL AND o.lead_id <> o.person_id AND o.lead_id IN (SELECT id FROM "person");

-- org_person without lead_id. SQLite checks every view and trigger when a table is
-- renamed, so the person_search view and the triggers that read it go first; the
-- rebuild drops org_person's own. All are recreated below, as add_groups_and_person_modules made them.
DROP TRIGGER "search_person_ai";
DROP TRIGGER "search_person_au";
DROP TRIGGER "search_personal_person_ai";
DROP TRIGGER "search_personal_person_au";
DROP TRIGGER "search_personal_person_ad";
DROP VIEW "person_search";
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_org_person" (
    "person_id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "org_person_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_org_person" ("person_id", "title", "created_at", "updated_at")
SELECT "person_id", "title", "created_at", "updated_at" FROM "org_person" WHERE "title" IS NOT NULL;
DROP TABLE "org_person";
ALTER TABLE "new_org_person" RENAME TO "org_person";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE VIEW "person_search" AS
SELECT p.id AS id, p.name AS name,
       COALESCE(p.email, '') || ' ' || COALESCE(o.title, '') || ' ' || COALESCE(pp.known_as, '') AS body
FROM "person" AS p
LEFT JOIN "org_person" AS o ON o.person_id = p.id
LEFT JOIN "personal_person" AS pp ON pp.person_id = p.id;

CREATE TRIGGER "search_org_person_ai" AFTER INSERT ON "org_person" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PERSON' AND entity_id = NEW.person_id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'PERSON', id, NULL, NULL, name, body FROM "person_search" WHERE id = NEW.person_id;
END;
CREATE TRIGGER "search_org_person_au" AFTER UPDATE ON "org_person" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PERSON' AND entity_id = NEW.person_id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'PERSON', id, NULL, NULL, name, body FROM "person_search" WHERE id = NEW.person_id;
END;
CREATE TRIGGER "search_org_person_ad" AFTER DELETE ON "org_person" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PERSON' AND entity_id = OLD.person_id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'PERSON', id, NULL, NULL, name, body FROM "person_search" WHERE id = OLD.person_id;
END;

CREATE TRIGGER "search_person_ai" AFTER INSERT ON "person" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'PERSON', id, NULL, NULL, name, body FROM "person_search" WHERE id = NEW.id;
END;
CREATE TRIGGER "search_person_au" AFTER UPDATE ON "person" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PERSON' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'PERSON', id, NULL, NULL, name, body FROM "person_search" WHERE id = NEW.id;
END;
CREATE TRIGGER "search_personal_person_ai" AFTER INSERT ON "personal_person" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PERSON' AND entity_id = NEW.person_id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'PERSON', id, NULL, NULL, name, body FROM "person_search" WHERE id = NEW.person_id;
END;
CREATE TRIGGER "search_personal_person_au" AFTER UPDATE ON "personal_person" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PERSON' AND entity_id = NEW.person_id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'PERSON', id, NULL, NULL, name, body FROM "person_search" WHERE id = NEW.person_id;
END;
CREATE TRIGGER "search_personal_person_ad" AFTER DELETE ON "personal_person" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PERSON' AND entity_id = OLD.person_id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'PERSON', id, NULL, NULL, name, body FROM "person_search" WHERE id = OLD.person_id;
END;

ALTER TABLE "person" ADD COLUMN "is_me" BOOLEAN NOT NULL DEFAULT false;
