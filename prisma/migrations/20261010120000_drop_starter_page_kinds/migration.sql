-- Work notebooks no longer start with page kinds. Drop the four starter kinds
-- (POLICY, PRODUCT, SOFTWARE, DECISION): their pages become plain GENERAL pages
-- and lose their properties, as pageKind.delete with moveTo GENERAL does. The
-- page update trigger rebuilds each page's search text.
UPDATE "page" SET "kind" = 'GENERAL', "properties" = '{}'
  WHERE "kind" IN ('POLICY', 'PRODUCT', 'SOFTWARE', 'DECISION');

DELETE FROM "page_kind" WHERE "key" IN ('POLICY', 'PRODUCT', 'SOFTWARE', 'DECISION');
