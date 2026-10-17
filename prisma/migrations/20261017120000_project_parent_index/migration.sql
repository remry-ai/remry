-- A project's children are found by parent_id (sub-projects on its page, the projects list's
-- sub-project counts, the home graph). Goals and pages already index theirs.
CREATE INDEX "project_parent_id_idx" ON "project"("parent_id");
