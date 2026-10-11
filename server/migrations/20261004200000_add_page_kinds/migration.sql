-- AlterTable
ALTER TABLE "person" ADD COLUMN "birthday" TEXT;

-- AlterTable
ALTER TABLE "todo" ADD COLUMN "recurrence" TEXT;

-- CreateTable
CREATE TABLE "page_kind" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fields" TEXT NOT NULL DEFAULT '[]',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- Page kinds used to be fixed in code. Give a notebook that already has data the
-- four it had, so its pages keep their kind and properties. A new notebook starts
-- with none (notebook.create adds them to a work notebook).
INSERT INTO "page_kind" ("key", "name", "fields", "sort_order", "updated_at")
SELECT "key", "name", "fields", "sort_order", CURRENT_TIMESTAMP FROM (
    SELECT 'POLICY' AS "key", 'Policy' AS "name", '[{"key":"status","label":"Status","input":"select","options":["DRAFT","ACTIVE","RETIRED"]},{"key":"version","label":"Version","input":"text"},{"key":"effectiveDate","label":"Effective","input":"date"},{"key":"reviewDate","label":"Review by","input":"date"}]' AS "fields", 0 AS "sort_order"
    UNION ALL SELECT 'PRODUCT', 'Product', '[{"key":"status","label":"Status","input":"select","options":["IDEA","BUILDING","LIVE","SUNSET"]},{"key":"url","label":"URL","input":"url"}]', 1
    UNION ALL SELECT 'SOFTWARE', 'Software', '[{"key":"vendor","label":"Vendor","input":"text"},{"key":"url","label":"URL","input":"url"},{"key":"annualCost","label":"Annual cost","input":"number"},{"key":"currency","label":"Currency","input":"text"},{"key":"renewalDate","label":"Renews","input":"date"},{"key":"seats","label":"Seats","input":"number"}]', 2
    UNION ALL SELECT 'DECISION', 'Decision', '[{"key":"status","label":"Status","input":"select","options":["PROPOSED","ACCEPTED","SUPERSEDED","REJECTED"]},{"key":"decidedOn","label":"Decided on","input":"date"}]', 3
)
WHERE EXISTS (SELECT 1 FROM "page") OR EXISTS (SELECT 1 FROM "person") OR EXISTS (SELECT 1 FROM "project")
   OR EXISTS (SELECT 1 FROM "team") OR EXISTS (SELECT 1 FROM "goal");
