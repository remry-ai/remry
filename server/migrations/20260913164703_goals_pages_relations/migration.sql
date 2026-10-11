-- AlterTable
ALTER TABLE "project" ADD COLUMN "owner_id" TEXT;
ALTER TABLE "project" ADD COLUMN "owner_type" TEXT;

-- CreateTable
CREATE TABLE "goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "owner_type" TEXT,
    "owner_id" TEXT,
    "parent_id" TEXT,
    "period" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "unit" TEXT,
    "baseline" REAL,
    "target" REAL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "goal_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "goal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "goal_check_in" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goal_id" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "value" REAL,
    "status" TEXT,
    "comment" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "goal_check_in_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "goal_project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goal_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "goal_project_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "goal_project_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "page" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'GENERAL',
    "parent_id" TEXT,
    "content" TEXT NOT NULL DEFAULT '',
    "properties" TEXT NOT NULL DEFAULT '{}',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "page_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "page" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "relation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "from_type" TEXT NOT NULL,
    "from_id" TEXT NOT NULL,
    "to_type" TEXT NOT NULL,
    "to_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'RELATED',
    "note" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "goal_owner_type_owner_id_idx" ON "goal"("owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "goal_parent_id_idx" ON "goal"("parent_id");

-- CreateIndex
CREATE INDEX "goal_period_idx" ON "goal"("period");

-- CreateIndex
CREATE INDEX "goal_check_in_goal_id_date_idx" ON "goal_check_in"("goal_id", "date");

-- CreateIndex
CREATE INDEX "goal_project_project_id_idx" ON "goal_project"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "goal_project_goal_id_project_id_key" ON "goal_project"("goal_id", "project_id");

-- CreateIndex
CREATE INDEX "page_kind_idx" ON "page"("kind");

-- CreateIndex
CREATE INDEX "page_parent_id_idx" ON "page"("parent_id");

-- CreateIndex
CREATE INDEX "relation_from_type_from_id_idx" ON "relation"("from_type", "from_id");

-- CreateIndex
CREATE INDEX "relation_to_type_to_id_idx" ON "relation"("to_type", "to_id");

-- CreateIndex
CREATE UNIQUE INDEX "relation_from_type_from_id_to_type_to_id_kind_key" ON "relation"("from_type", "from_id", "to_type", "to_id", "kind");

-- CreateIndex
CREATE INDEX "project_owner_type_owner_id_idx" ON "project"("owner_type", "owner_id");
