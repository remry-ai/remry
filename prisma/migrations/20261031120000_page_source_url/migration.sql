-- A wiki page's source file (a PDF, an image or a text file), as on a doc: Claude can write the
-- page from it. Null for a page without one.
ALTER TABLE "page" ADD COLUMN "source_url" TEXT;
