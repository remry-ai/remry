-- Relation kinds are now RELATED, DEPENDS_ON and the derived MENTIONS.
-- OWNS, USES, APPLIES_TO and SUPERSEDES become RELATED. A converted link that
-- would repeat a RELATED link between the same two entities is dropped, with
-- its note.

UPDATE OR IGNORE "relation"
SET "kind" = 'RELATED'
WHERE "kind" IN ('OWNS', 'USES', 'APPLIES_TO', 'SUPERSEDES');

DELETE FROM "relation"
WHERE "kind" IN ('OWNS', 'USES', 'APPLIES_TO', 'SUPERSEDES');

-- RELATED has no direction: keep the older row of a pair linked both ways.
DELETE FROM "relation"
WHERE "kind" = 'RELATED'
  AND EXISTS (
    SELECT 1 FROM "relation" AS "other"
    WHERE "other"."kind" = 'RELATED'
      AND "other"."from_type" = "relation"."to_type"
      AND "other"."from_id" = "relation"."to_id"
      AND "other"."to_type" = "relation"."from_type"
      AND "other"."to_id" = "relation"."from_id"
      AND "other"."id" < "relation"."id"
  );
