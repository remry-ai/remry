-- CreateTable
CREATE TABLE "branding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "icon_url" TEXT,
    "logo_url" TEXT,
    "primary_color" TEXT NOT NULL DEFAULT '#4f46e5',
    "accent_color" TEXT NOT NULL DEFAULT '#06b6d4',
    "primary_font_color" TEXT NOT NULL DEFAULT '#ffffff',
    "accent_font_color" TEXT NOT NULL DEFAULT '#ffffff',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "title" TEXT,
    "lead_id" TEXT,
    "department_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "person_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "person_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "team_member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "team_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_member_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "team_member_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "doc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "source_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "content" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "note_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "note" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "branding_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "report_branding_id_fkey" FOREIGN KEY ("branding_id") REFERENCES "branding" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT,
    "start_date" DATETIME,
    "end_date" DATETIME,
    "days_optimistic" INTEGER,
    "days_likely" INTEGER,
    "days_pessimistic" INTEGER,
    "parent_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "project_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "todo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "target_date" DATETIME,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "link" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6b7280'
);

-- CreateTable
CREATE TABLE "tag_attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tag_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tag_attachment_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "emoji" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "branding_is_default_idx" ON "branding"("is_default");

-- CreateIndex
CREATE INDEX "person_lead_id_idx" ON "person"("lead_id");

-- CreateIndex
CREATE INDEX "person_department_id_idx" ON "person"("department_id");

-- CreateIndex
CREATE INDEX "team_member_person_id_idx" ON "team_member"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_member_team_id_person_id_key" ON "team_member"("team_id", "person_id");

-- CreateIndex
CREATE INDEX "doc_entity_type_entity_id_idx" ON "doc"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "note_entity_type_entity_id_idx" ON "note"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "report_entity_type_entity_id_idx" ON "report"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "report_branding_id_idx" ON "report"("branding_id");

-- CreateIndex
CREATE INDEX "todo_entity_type_entity_id_idx" ON "todo"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "todo_status_idx" ON "todo"("status");

-- CreateIndex
CREATE INDEX "link_entity_type_entity_id_idx" ON "link"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "tag_name_key" ON "tag"("name");

-- CreateIndex
CREATE INDEX "tag_attachment_entity_type_entity_id_idx" ON "tag_attachment"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "tag_attachment_tag_id_entity_type_entity_id_key" ON "tag_attachment"("tag_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "comment_entity_type_entity_id_idx" ON "comment"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "emoji_entity_type_entity_id_emoji_key" ON "emoji"("entity_type", "entity_id", "emoji");
