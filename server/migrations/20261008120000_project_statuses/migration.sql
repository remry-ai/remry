-- Project status becomes one of six: proposed, committed, in-progress, blocked,
-- done, abandoned. Map the free text stored so far (the same words
-- `toProjectStatus` in src/shared/utils/project-status.ts accepts); clear the rest.
UPDATE "project"
SET "status" = CASE lower(trim(replace(replace("status", '-', ' '), '_', ' ')))
  WHEN 'proposed' THEN 'proposed'
  WHEN 'idea' THEN 'proposed'
  WHEN 'prospective' THEN 'proposed'
  WHEN 'proposal' THEN 'proposed'
  WHEN 'backlog' THEN 'proposed'
  WHEN 'pitched' THEN 'proposed'
  WHEN 'committed' THEN 'committed'
  WHEN 'planning' THEN 'committed'
  WHEN 'planned' THEN 'committed'
  WHEN 'todo' THEN 'committed'
  WHEN 'to do' THEN 'committed'
  WHEN 'not started' THEN 'committed'
  WHEN 'in progress' THEN 'in-progress'
  WHEN 'active' THEN 'in-progress'
  WHEN 'started' THEN 'in-progress'
  WHEN 'doing' THEN 'in-progress'
  WHEN 'wip' THEN 'in-progress'
  WHEN 'blocked' THEN 'blocked'
  WHEN 'at risk' THEN 'blocked'
  WHEN 'off track' THEN 'blocked'
  WHEN 'on hold' THEN 'blocked'
  WHEN 'paused' THEN 'blocked'
  WHEN 'waiting' THEN 'blocked'
  WHEN 'done' THEN 'done'
  WHEN 'complete' THEN 'done'
  WHEN 'completed' THEN 'done'
  WHEN 'shipped' THEN 'done'
  WHEN 'launched' THEN 'done'
  WHEN 'finished' THEN 'done'
  WHEN 'abandoned' THEN 'abandoned'
  WHEN 'archived' THEN 'abandoned'
  WHEN 'cancelled' THEN 'abandoned'
  WHEN 'canceled' THEN 'abandoned'
  WHEN 'dropped' THEN 'abandoned'
  WHEN 'won''t do' THEN 'abandoned'
  ELSE NULL
END
WHERE "status" IS NOT NULL;
