-- AlterTable
ALTER TABLE "department" ADD COLUMN "archived_at" DATETIME;

-- AlterTable
ALTER TABLE "goal" ADD COLUMN "archived_at" DATETIME;

-- AlterTable
ALTER TABLE "page" ADD COLUMN "archived_at" DATETIME;

-- AlterTable
ALTER TABLE "person" ADD COLUMN "archived_at" DATETIME;

-- AlterTable
ALTER TABLE "project" ADD COLUMN "archived_at" DATETIME;

-- AlterTable
ALTER TABLE "team" ADD COLUMN "archived_at" DATETIME;

-- CreateIndex
CREATE INDEX "department_archived_at_idx" ON "department"("archived_at");

-- CreateIndex
CREATE INDEX "goal_archived_at_idx" ON "goal"("archived_at");

-- CreateIndex
CREATE INDEX "page_archived_at_idx" ON "page"("archived_at");

-- CreateIndex
CREATE INDEX "person_archived_at_idx" ON "person"("archived_at");

-- CreateIndex
CREATE INDEX "project_archived_at_idx" ON "project"("archived_at");

-- CreateIndex
CREATE INDEX "team_archived_at_idx" ON "team"("archived_at");
