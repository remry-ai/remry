-- A doc's attached PDF (doc.source_url) becomes a file link, the one way files are kept now: a
-- link row on the doc pointing at the same file in its folder (storage://docs/<id>/source-….pdf),
-- titled "Original.pdf". The file stays where it is. The column stays, empty, so an older Remry
-- still running reads it as "no PDF".
INSERT INTO "link" ("id", "entity_type", "entity_id", "url", "title", "created_at")
SELECT 'c' || lower(hex(randomblob(12))), 'DOC', "id", 'storage://' || "source_url", 'Original.pdf',
       strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')
FROM "doc"
WHERE "source_url" IS NOT NULL AND "source_url" <> '';

UPDATE "doc" SET "source_url" = NULL WHERE "source_url" IS NOT NULL;
