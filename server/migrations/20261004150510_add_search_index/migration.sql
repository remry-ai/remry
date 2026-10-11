-- Full-text search: one FTS5 index over every entity's text, kept in sync by
-- triggers on the source tables, so no operation has to remember to update it.
-- Prisma doesn't model virtual tables or triggers. A later migration that
-- redefines one of these tables (DROP TABLE + RENAME) drops its triggers and
-- must recreate them; tests/integration/search.test.ts checks they all exist.
-- See src/api/CLAUDE.md § Search.

CREATE VIRTUAL TABLE "search_index" USING fts5(
    entity_type UNINDEXED,
    entity_id UNINDEXED,
    parent_type UNINDEXED,
    parent_id UNINDEXED,
    title,
    body,
    tokenize = 'porter unicode61 remove_diacritics 2',
    prefix = '2 3'
);

-- PERSON
CREATE TRIGGER "search_person_ai" AFTER INSERT ON "person" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('PERSON', NEW.id, NULL, NULL, NEW.name, COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.email, ''));
END;
CREATE TRIGGER "search_person_au" AFTER UPDATE ON "person" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PERSON' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('PERSON', NEW.id, NULL, NULL, NEW.name, COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.email, ''));
END;
CREATE TRIGGER "search_person_ad" AFTER DELETE ON "person" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PERSON' AND entity_id = OLD.id;
END;
INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'PERSON', t.id, NULL, NULL, t.name, COALESCE(t.title, '') || ' ' || COALESCE(t.email, '') FROM "person" AS t;

-- TEAM
CREATE TRIGGER "search_team_ai" AFTER INSERT ON "team" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('TEAM', NEW.id, NULL, NULL, NEW.name, COALESCE(NEW.description, ''));
END;
CREATE TRIGGER "search_team_au" AFTER UPDATE ON "team" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'TEAM' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('TEAM', NEW.id, NULL, NULL, NEW.name, COALESCE(NEW.description, ''));
END;
CREATE TRIGGER "search_team_ad" AFTER DELETE ON "team" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'TEAM' AND entity_id = OLD.id;
END;
INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'TEAM', t.id, NULL, NULL, t.name, COALESCE(t.description, '') FROM "team" AS t;

-- DEPARTMENT
CREATE TRIGGER "search_department_ai" AFTER INSERT ON "department" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('DEPARTMENT', NEW.id, NULL, NULL, NEW.name, COALESCE(NEW.description, ''));
END;
CREATE TRIGGER "search_department_au" AFTER UPDATE ON "department" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'DEPARTMENT' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('DEPARTMENT', NEW.id, NULL, NULL, NEW.name, COALESCE(NEW.description, ''));
END;
CREATE TRIGGER "search_department_ad" AFTER DELETE ON "department" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'DEPARTMENT' AND entity_id = OLD.id;
END;
INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'DEPARTMENT', t.id, NULL, NULL, t.name, COALESCE(t.description, '') FROM "department" AS t;

-- PROJECT
CREATE TRIGGER "search_project_ai" AFTER INSERT ON "project" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('PROJECT', NEW.id, NULL, NULL, NEW.name, COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.status, ''));
END;
CREATE TRIGGER "search_project_au" AFTER UPDATE ON "project" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PROJECT' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('PROJECT', NEW.id, NULL, NULL, NEW.name, COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.status, ''));
END;
CREATE TRIGGER "search_project_ad" AFTER DELETE ON "project" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PROJECT' AND entity_id = OLD.id;
END;
INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'PROJECT', t.id, NULL, NULL, t.name, COALESCE(t.description, '') || ' ' || COALESCE(t.status, '') FROM "project" AS t;

-- GOAL
CREATE TRIGGER "search_goal_ai" AFTER INSERT ON "goal" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('GOAL', NEW.id, NULL, NULL, NEW.title, COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.period, ''));
END;
CREATE TRIGGER "search_goal_au" AFTER UPDATE ON "goal" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'GOAL' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('GOAL', NEW.id, NULL, NULL, NEW.title, COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.period, ''));
END;
CREATE TRIGGER "search_goal_ad" AFTER DELETE ON "goal" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'GOAL' AND entity_id = OLD.id;
END;
INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'GOAL', t.id, NULL, NULL, t.title, COALESCE(t.description, '') || ' ' || COALESCE(t.period, '') FROM "goal" AS t;

-- PAGE
CREATE TRIGGER "search_page_ai" AFTER INSERT ON "page" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('PAGE', NEW.id, NULL, NULL, NEW.title, NEW.content || char(10) || COALESCE(CASE WHEN json_valid(NEW.properties) THEN (SELECT group_concat(value, ' ') FROM json_each(NEW.properties) WHERE type <> 'null') ELSE NEW.properties END, ''));
END;
CREATE TRIGGER "search_page_au" AFTER UPDATE ON "page" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PAGE' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('PAGE', NEW.id, NULL, NULL, NEW.title, NEW.content || char(10) || COALESCE(CASE WHEN json_valid(NEW.properties) THEN (SELECT group_concat(value, ' ') FROM json_each(NEW.properties) WHERE type <> 'null') ELSE NEW.properties END, ''));
END;
CREATE TRIGGER "search_page_ad" AFTER DELETE ON "page" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'PAGE' AND entity_id = OLD.id;
END;
INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'PAGE', t.id, NULL, NULL, t.title, t.content || char(10) || COALESCE(CASE WHEN json_valid(t.properties) THEN (SELECT group_concat(value, ' ') FROM json_each(t.properties) WHERE type <> 'null') ELSE t.properties END, '') FROM "page" AS t;

-- DOC
CREATE TRIGGER "search_doc_ai" AFTER INSERT ON "doc" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('DOC', NEW.id, NEW.entity_type, NEW.entity_id, NEW.title, NEW.content);
END;
CREATE TRIGGER "search_doc_au" AFTER UPDATE ON "doc" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'DOC' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('DOC', NEW.id, NEW.entity_type, NEW.entity_id, NEW.title, NEW.content);
END;
CREATE TRIGGER "search_doc_ad" AFTER DELETE ON "doc" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'DOC' AND entity_id = OLD.id;
END;
INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'DOC', t.id, t.entity_type, t.entity_id, t.title, t.content FROM "doc" AS t;

-- REPORT
CREATE TRIGGER "search_report_ai" AFTER INSERT ON "report" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('REPORT', NEW.id, NEW.entity_type, NEW.entity_id, NEW.title, NEW.content);
END;
CREATE TRIGGER "search_report_au" AFTER UPDATE ON "report" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'REPORT' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('REPORT', NEW.id, NEW.entity_type, NEW.entity_id, NEW.title, NEW.content);
END;
CREATE TRIGGER "search_report_ad" AFTER DELETE ON "report" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'REPORT' AND entity_id = OLD.id;
END;
INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'REPORT', t.id, t.entity_type, t.entity_id, t.title, t.content FROM "report" AS t;

-- NOTE
CREATE TRIGGER "search_note_ai" AFTER INSERT ON "note" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('NOTE', NEW.id, NEW.entity_type, NEW.entity_id, '', NEW.content);
END;
CREATE TRIGGER "search_note_au" AFTER UPDATE ON "note" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'NOTE' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('NOTE', NEW.id, NEW.entity_type, NEW.entity_id, '', NEW.content);
END;
CREATE TRIGGER "search_note_ad" AFTER DELETE ON "note" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'NOTE' AND entity_id = OLD.id;
END;
INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'NOTE', t.id, t.entity_type, t.entity_id, '', t.content FROM "note" AS t;

-- COMMENT
CREATE TRIGGER "search_comment_ai" AFTER INSERT ON "comment" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('COMMENT', NEW.id, NEW.entity_type, NEW.entity_id, '', NEW.content);
END;
CREATE TRIGGER "search_comment_au" AFTER UPDATE ON "comment" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'COMMENT' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('COMMENT', NEW.id, NEW.entity_type, NEW.entity_id, '', NEW.content);
END;
CREATE TRIGGER "search_comment_ad" AFTER DELETE ON "comment" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'COMMENT' AND entity_id = OLD.id;
END;
INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'COMMENT', t.id, t.entity_type, t.entity_id, '', t.content FROM "comment" AS t;

-- TODO
CREATE TRIGGER "search_todo_ai" AFTER INSERT ON "todo" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('TODO', NEW.id, NEW.entity_type, NEW.entity_id, NEW.title, COALESCE(NEW.description, ''));
END;
CREATE TRIGGER "search_todo_au" AFTER UPDATE ON "todo" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'TODO' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('TODO', NEW.id, NEW.entity_type, NEW.entity_id, NEW.title, COALESCE(NEW.description, ''));
END;
CREATE TRIGGER "search_todo_ad" AFTER DELETE ON "todo" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'TODO' AND entity_id = OLD.id;
END;
INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'TODO', t.id, t.entity_type, t.entity_id, t.title, COALESCE(t.description, '') FROM "todo" AS t;

-- LINK
CREATE TRIGGER "search_link_ai" AFTER INSERT ON "link" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('LINK', NEW.id, NEW.entity_type, NEW.entity_id, COALESCE(NEW.title, ''), NEW.url);
END;
CREATE TRIGGER "search_link_au" AFTER UPDATE ON "link" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'LINK' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('LINK', NEW.id, NEW.entity_type, NEW.entity_id, COALESCE(NEW.title, ''), NEW.url);
END;
CREATE TRIGGER "search_link_ad" AFTER DELETE ON "link" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'LINK' AND entity_id = OLD.id;
END;
INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'LINK', t.id, t.entity_type, t.entity_id, COALESCE(t.title, ''), t.url FROM "link" AS t;

-- GOAL_CHECKIN
CREATE TRIGGER "search_goal_check_in_ai" AFTER INSERT ON "goal_check_in" BEGIN
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('GOAL_CHECKIN', NEW.id, 'GOAL', NEW.goal_id, '', COALESCE(NEW.comment, ''));
END;
CREATE TRIGGER "search_goal_check_in_au" AFTER UPDATE ON "goal_check_in" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'GOAL_CHECKIN' AND entity_id = OLD.id;
    INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) VALUES ('GOAL_CHECKIN', NEW.id, 'GOAL', NEW.goal_id, '', COALESCE(NEW.comment, ''));
END;
CREATE TRIGGER "search_goal_check_in_ad" AFTER DELETE ON "goal_check_in" BEGIN
    DELETE FROM "search_index" WHERE entity_type = 'GOAL_CHECKIN' AND entity_id = OLD.id;
END;
INSERT INTO "search_index" (entity_type, entity_id, parent_type, parent_id, title, body) SELECT 'GOAL_CHECKIN', t.id, 'GOAL', t.goal_id, '', COALESCE(t.comment, '') FROM "goal_check_in" AS t;
