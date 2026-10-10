-- Relationships between people get their own table, with foreign keys: deleting
-- a person deletes their relationships, and the database refuses a relationship
-- with a missing person, to oneself, or a second one of a "one each" kind (a
-- second lead). Their kinds move to person_relation_kind (people_only goes: every
-- kind here links people). A symmetric kind is stored with the smaller id first,
-- so the unique index also refuses the same pair the other way round.
-- `relation` keeps the built-in kinds only: RELATED, DEPENDS_ON and MENTIONS.

CREATE TABLE "person_relation_kind" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "inverse_label" TEXT NOT NULL,
    "symmetric" BOOLEAN NOT NULL DEFAULT false,
    "exclusive" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

INSERT INTO "person_relation_kind" ("key", "label", "inverse_label", "symmetric", "exclusive", "sort_order", "created_at", "updated_at")
SELECT "key", "label", "inverse_label", "symmetric", "exclusive", "sort_order", "created_at", "updated_at" FROM "relation_kind";

CREATE TABLE "person_relation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "from_person_id" TEXT NOT NULL,
    "to_person_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "person_relation_from_person_id_fkey" FOREIGN KEY ("from_person_id") REFERENCES "person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "person_relation_to_person_id_fkey" FOREIGN KEY ("to_person_id") REFERENCES "person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "person_relation_kind_fkey" FOREIGN KEY ("kind") REFERENCES "person_relation_kind" ("key") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("from_person_id" <> "to_person_id")
);

CREATE UNIQUE INDEX "person_relation_from_person_id_to_person_id_kind_key" ON "person_relation"("from_person_id", "to_person_id", "kind");
CREATE INDEX "person_relation_to_person_id_kind_idx" ON "person_relation"("to_person_id", "kind");

-- Move person-to-person relations of the notebook's kinds, keeping ids; a symmetric
-- pair stored both ways keeps one row. Only rows whose people exist move.
INSERT OR IGNORE INTO "person_relation" ("id", "from_person_id", "to_person_id", "kind", "note", "created_at", "updated_at")
SELECT r."id",
       CASE WHEN k."symmetric" AND r."from_id" > r."to_id" THEN r."to_id" ELSE r."from_id" END,
       CASE WHEN k."symmetric" AND r."from_id" > r."to_id" THEN r."from_id" ELSE r."to_id" END,
       r."kind", r."note", r."created_at", r."updated_at"
FROM "relation" AS r
JOIN "person_relation_kind" AS k ON k."key" = r."kind"
WHERE r."from_type" = 'PERSON' AND r."to_type" = 'PERSON' AND r."from_id" <> r."to_id"
  AND EXISTS (SELECT 1 FROM "person" WHERE "id" = r."from_id")
  AND EXISTS (SELECT 1 FROM "person" WHERE "id" = r."to_id")
ORDER BY r."created_at";

DELETE FROM "relation" WHERE "kind" IN (SELECT "key" FROM "person_relation_kind") AND "from_type" = 'PERSON' AND "to_type" = 'PERSON';

-- A notebook kind used between other things (none of the seeded kinds allow it)
-- becomes RELATED, keeping its note; one that would repeat a RELATED link goes.
UPDATE OR IGNORE "relation" SET "kind" = 'RELATED' WHERE "kind" NOT IN ('RELATED', 'DEPENDS_ON', 'MENTIONS');
DELETE FROM "relation" WHERE "kind" NOT IN ('RELATED', 'DEPENDS_ON', 'MENTIONS');

DROP TABLE "relation_kind";

-- "One each": a person is the `to` end of one relation of an exclusive kind at most.
CREATE TRIGGER "person_relation_exclusive_ai" BEFORE INSERT ON "person_relation"
WHEN (SELECT "exclusive" FROM "person_relation_kind" WHERE "key" = NEW."kind")
 AND EXISTS (SELECT 1 FROM "person_relation" WHERE "to_person_id" = NEW."to_person_id" AND "kind" = NEW."kind")
BEGIN
    SELECT RAISE(ABORT, 'person_relation: this person already has a relation of this one-each kind');
END;

CREATE TRIGGER "person_relation_exclusive_au" BEFORE UPDATE OF "to_person_id", "kind" ON "person_relation"
WHEN (SELECT "exclusive" FROM "person_relation_kind" WHERE "key" = NEW."kind")
 AND EXISTS (SELECT 1 FROM "person_relation" WHERE "to_person_id" = NEW."to_person_id" AND "kind" = NEW."kind" AND "id" <> NEW."id")
BEGIN
    SELECT RAISE(ABORT, 'person_relation: this person already has a relation of this one-each kind');
END;

-- A symmetric kind is stored with the smaller id first.
CREATE TRIGGER "person_relation_symmetric_ai" BEFORE INSERT ON "person_relation"
WHEN (SELECT "symmetric" FROM "person_relation_kind" WHERE "key" = NEW."kind") AND NEW."from_person_id" > NEW."to_person_id"
BEGIN
    SELECT RAISE(ABORT, 'person_relation: a symmetric kind is stored with the smaller person id first');
END;

CREATE TRIGGER "person_relation_symmetric_au" BEFORE UPDATE OF "from_person_id", "to_person_id", "kind" ON "person_relation"
WHEN (SELECT "symmetric" FROM "person_relation_kind" WHERE "key" = NEW."kind") AND NEW."from_person_id" > NEW."to_person_id"
BEGIN
    SELECT RAISE(ABORT, 'person_relation: a symmetric kind is stored with the smaller person id first');
END;
