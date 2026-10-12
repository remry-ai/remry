-- Groups with kinds replace teams and departments, and a person keeps only the
-- fields every module shares: the org module's title and lead move to
-- org_person, the personal module's birthday to personal_person. Ids are kept,
-- so every polymorphic reference survives once its type reads GROUP.
-- Search: person text comes from the person_search view (core fields plus each
-- module's extension), groups get their own triggers.

-- ----- New tables -----
CREATE TABLE "group_kind" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "plural" TEXT NOT NULL,
    "exclusive" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "archived_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "group_kind_fkey" FOREIGN KEY ("kind") REFERENCES "group_kind" ("key") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "group_member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "group_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "group_member_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "group_member_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "org_person" (
    "person_id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT,
    "lead_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "org_person_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "org_person_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "personal_person" (
    "person_id" TEXT NOT NULL PRIMARY KEY,
    "birthday" TEXT,
    "known_as" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "personal_person_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "group_kind_idx" ON "group"("kind");
CREATE INDEX "group_archived_at_idx" ON "group"("archived_at");
CREATE INDEX "group_member_person_id_idx" ON "group_member"("person_id");
CREATE UNIQUE INDEX "group_member_group_id_person_id_key" ON "group_member"("group_id", "person_id");
CREATE INDEX "org_person_lead_id_idx" ON "org_person"("lead_id");

-- ----- Move the data -----
-- Kinds only where teams or departments exist; a new notebook gets its
-- profile's kinds from notebook.create.
INSERT INTO "group_kind" ("key", "name", "plural", "exclusive", "sort_order", "updated_at")
SELECT 'TEAM', 'Team', 'Teams', false, 0, CURRENT_TIMESTAMP WHERE EXISTS (SELECT 1 FROM "team");
INSERT INTO "group_kind" ("key", "name", "plural", "exclusive", "sort_order", "updated_at")
SELECT 'DEPARTMENT', 'Department', 'Departments', true, 1, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "department") OR EXISTS (SELECT 1 FROM "person" WHERE "department_id" IS NOT NULL);

INSERT INTO "group" ("id", "kind", "name", "description", "archived_at", "created_at", "updated_at")
SELECT "id", 'TEAM', "name", "description", "archived_at", "created_at", "updated_at" FROM "team";
INSERT INTO "group" ("id", "kind", "name", "description", "archived_at", "created_at", "updated_at")
SELECT "id", 'DEPARTMENT', "name", "description", "archived_at", "created_at", "updated_at" FROM "department";

INSERT INTO "group_member" ("id", "group_id", "person_id", "created_at")
SELECT "id", "team_id", "person_id", "created_at" FROM "team_member";
INSERT INTO "group_member" ("id", "group_id", "person_id", "created_at")
SELECT 'dm_' || "id", "department_id", "id", "updated_at" FROM "person"
WHERE "department_id" IS NOT NULL AND "department_id" IN (SELECT "id" FROM "department");

INSERT INTO "org_person" ("person_id", "title", "lead_id", "created_at", "updated_at")
SELECT "id", "title", "lead_id", "created_at", "updated_at" FROM "person" WHERE "title" IS NOT NULL OR "lead_id" IS NOT NULL;
INSERT INTO "personal_person" ("person_id", "birthday", "created_at", "updated_at")
SELECT "id", "birthday", "created_at", "updated_at" FROM "person" WHERE "birthday" IS NOT NULL;

-- Polymorphic references. The attachments' update triggers reindex their search
-- rows with the new parent type.
UPDATE "doc" SET "entity_type" = 'GROUP' WHERE "entity_type" IN ('TEAM', 'DEPARTMENT');
UPDATE "note" SET "entity_type" = 'GROUP' WHERE "entity_type" IN ('TEAM', 'DEPARTMENT');
UPDATE "report" SET "entity_type" = 'GROUP' WHERE "entity_type" IN ('TEAM', 'DEPARTMENT');
UPDATE "todo" SET "entity_type" = 'GROUP' WHERE "entity_type" IN ('TEAM', 'DEPARTMENT');
UPDATE "link" SET "entity_type" = 'GROUP' WHERE "entity_type" IN ('TEAM', 'DEPARTMENT');
UPDATE "tag_attachment" SET "entity_type" = 'GROUP' WHERE "entity_type" IN ('TEAM', 'DEPARTMENT');
UPDATE "comment" SET "entity_type" = 'GROUP' WHERE "entity_type" IN ('TEAM', 'DEPARTMENT');
UPDATE "emoji" SET "entity_type" = 'GROUP' WHERE "entity_type" IN ('TEAM', 'DEPARTMENT');
UPDATE "page_chat" SET "entity_type" = 'GROUP' WHERE "entity_type" IN ('TEAM', 'DEPARTMENT');
UPDATE "project" SET "owner_type" = 'GROUP' WHERE "owner_type" IN ('TEAM', 'DEPARTMENT');
UPDATE "goal" SET "owner_type" = 'GROUP' WHERE "owner_type" IN ('TEAM', 'DEPARTMENT');
UPDATE "relation" SET "from_type" = 'GROUP' WHERE "from_type" IN ('TEAM', 'DEPARTMENT');
UPDATE "relation" SET "to_type" = 'GROUP' WHERE "to_type" IN ('TEAM', 'DEPARTMENT');

-- ----- Drop teams and departments, slim the person table -----
DROP TABLE "team_member";
DROP TABLE "team";

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "archived_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_person" ("archived_at", "created_at", "email", "id", "name", "updated_at") SELECT "archived_at", "created_at", "email", "id", "name", "updated_at" FROM "person";
DROP TABLE "person";
ALTER TABLE "new_person" RENAME TO "person";
CREATE INDEX "person_archived_at_idx" ON "person"("archived_at");
DROP TABLE "department";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- ----- Search -----
-- Rows indexed as TEAM or DEPARTMENT are groups now (their triggers went with the tables).
UPDATE "search_index" SET "entity_type" = 'GROUP' WHERE "entity_type" IN ('TEAM', 'DEPARTMENT');
UPDATE "search_index" SET "parent_type" = 'GROUP' WHERE "parent_type" IN ('TEAM', 'DEPARTMENT');

CREATE TRIGGER "search_group_ai" AFTER INSERT ON "group" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('GROUP', NEW.id, NULL, NULL, NEW.name, COALESCE(NEW.description, ''));
END;
CREATE TRIGGER "search_group_au" AFTER UPDATE ON "group" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'GROUP' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('GROUP', NEW.id, NULL, NULL, NEW.name, COALESCE(NEW.description, ''));
END;
CREATE TRIGGER "search_group_ad" AFTER DELETE ON "group" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'GROUP' AND entity_id = OLD.id;
END;

-- A person's searchable text: core fields, then what each module adds. A new
-- module that extends person adds its columns here and triggers like the ones below.
CREATE VIEW "person_search" AS
SELECT p.id AS id, p.name AS name,
       COALESCE(p.email, '') || ' ' || COALESCE(o.title, '') || ' ' || COALESCE(pp.known_as, '') AS body
FROM "person" AS p
LEFT JOIN "org_person" AS o ON o.person_id = p.id
LEFT JOIN "personal_person" AS pp ON pp.person_id = p.id;

CREATE TRIGGER "search_person_ai" AFTER INSERT ON "person" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'PERSON', id, NULL, NULL, name, body FROM "person_search" WHERE id = NEW.id;
END;
CREATE TRIGGER "search_person_au" AFTER UPDATE ON "person" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PERSON' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'PERSON', id, NULL, NULL, name, body FROM "person_search" WHERE id = NEW.id;
END;
CREATE TRIGGER "search_person_ad" AFTER DELETE ON "person" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PERSON' AND entity_id = OLD.id;
END;

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

DELETE FROM "search_index" WHERE entity_type = 'PERSON';
INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'PERSON', id, NULL, NULL, name, body FROM "person_search";
