-- A synthesis doc or wiki page: what Claude should pull from its linked sources
-- each time it refreshes it. Null for an ordinary doc or page.
ALTER TABLE "doc" ADD COLUMN "prompt" TEXT;
ALTER TABLE "page" ADD COLUMN "prompt" TEXT;
