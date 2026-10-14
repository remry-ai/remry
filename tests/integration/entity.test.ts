// entity.archive and entity.delete, which stand in for every type's archive, unarchive,
// delete and remove in the CLI and MCP, and the guard against a second person, group or
// project with a name already in use. Through the CLI, as Claude calls them.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const remry = (...args: string[]) => {
  const r = spawnSync(resolve('bin/remry'), args, { env: { ...process.env, APP_ENV: 'test' }, encoding: 'utf8' });
  return JSON.parse(r.stdout) as { ok: boolean; value?: Record<string, unknown>; error?: { message: string } };
};

const created = (...args: string[]): string => {
  const r = remry(...args);
  if (!r.ok) throw new Error(r.error?.message);
  return r.value?.['id'] as string;
};

describe('entity.archive', () => {
  it('archives and unarchives any archivable type', () => {
    const project = created('project.create', '--name', 'Entity archive project');
    const archived = remry('entity.archive', '--entityType', 'PROJECT', '--id', project);
    expect(archived.ok && archived.value?.['archivedAt']).toBeTruthy();

    const blocked = remry('project.update', '--id', project, '--name', 'Renamed');
    expect(blocked.error?.message).toContain(`entity.archive --entityType PROJECT --id ${project} --archived false`);

    const back = remry('entity.archive', '--entityType', 'PROJECT', '--id', project, '--archived', 'false');
    expect(back.ok && back.value?.['archivedAt']).toBeNull();
    expect(remry('project.update', '--id', project, '--name', 'Renamed').ok).toBe(true);
  });

  it('refuses a type that cannot be archived', () => {
    const r = spawnSync(resolve('bin/remry'), ['entity.archive', '--entityType', 'NOTE', '--id', 'x'], { env: { ...process.env, APP_ENV: 'test' }, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('entityType');
  });
});

describe('entity.delete', () => {
  it('deletes each type through its own operation, with what is attached', () => {
    const person = created('person.create', '--name', 'Entity delete person');
    const note = created('note.add', '--entityType', 'PERSON', '--entityId', person, '--content', 'A note');
    const todo = created('todo.create', '--title', 'A todo', '--entityType', 'PERSON', '--entityId', person);

    expect(remry('entity.delete', '--entityType', 'NOTE', '--id', note).ok).toBe(true);
    expect(remry('note.list', '--entityType', 'PERSON', '--entityId', person).value).toEqual([]);

    expect(remry('entity.delete', '--entityType', 'PERSON', '--id', person).ok).toBe(true);
    expect(remry('person.get', '--id', person).ok).toBe(false);
    expect(remry('todo.update', '--id', todo, '--title', 'Gone').ok).toBe(false);
  });

  it('says so when the entity does not exist', () => {
    const missing = remry('entity.delete', '--entityType', 'PROJECT', '--id', 'no-such-project');
    expect(missing.ok).toBe(false);
  });
});

describe('duplicate names', () => {
  it('refuses a second person with the same name, ignoring case and spaces, unless allowDuplicate', () => {
    const first = created('person.create', '--name', 'Dana Duplicate');
    const again = remry('person.create', '--name', '  dana   duplicate ');
    expect(again.ok).toBe(false);
    expect(again.error?.message).toContain(`Person "Dana Duplicate" already exists (id ${first})`);
    expect(again.error?.message).toContain(`person.update --id ${first}`);

    expect(remry('person.create', '--name', 'Dana Duplicate', '--allowDuplicate', 'true').ok).toBe(true);
  });

  it('counts an archived one, and names it as archived', () => {
    const project = created('project.create', '--name', 'Old duplicate project');
    remry('entity.archive', '--entityType', 'PROJECT', '--id', project);
    expect(remry('project.create', '--name', 'Old duplicate project').error?.message).toContain(`(id ${project}, archived)`);
  });

  it('allows the same group name in a different kind', () => {
    created('group.create', '--kind', 'TEAM', '--name', 'Duplicate Platform');
    expect(remry('group.create', '--kind', 'TEAM', '--name', 'Duplicate Platform').error?.message).toContain('Team "Duplicate Platform" already exists');
    expect(remry('group.create', '--kind', 'DEPARTMENT', '--name', 'Duplicate Platform').ok).toBe(true);
  });
});

describe('deleting what is attached to attachments', () => {
  const list = (procedure: string, entityType: string, entityId: string): unknown[] =>
    (remry(procedure, '--entityType', entityType, '--entityId', entityId).value as unknown as unknown[]) ?? [];

  it('removes comments, todos and tags hanging off an entity\'s notes, at any depth', () => {
    const person = created('person.create', '--name', 'Deep cleanup person');
    const note = created('note.add', '--entityType', 'PERSON', '--entityId', person, '--content', 'A note');
    const comment = created('comment.add', '--entityType', 'NOTE', '--entityId', note, '--content', 'On the note');
    const todo = created('todo.create', '--title', 'On the comment', '--entityType', 'COMMENT', '--entityId', comment);
    const tag = created('tag.create', '--name', 'deep-cleanup');
    expect(remry('tag.attach', '--tagId', tag, '--entityType', 'TODO', '--entityId', todo).ok).toBe(true);

    expect(remry('entity.delete', '--entityType', 'PERSON', '--id', person).ok).toBe(true);
    expect(list('comment.list', 'NOTE', note)).toEqual([]);
    expect(list('todo.forEntity', 'COMMENT', comment)).toEqual([]);
    expect(list('tag.forEntity', 'TODO', todo)).toEqual([]);
  });

  it('removes a note\'s replies and what hangs off them with the note', () => {
    const note = created('note.add', '--entityType', 'PERSON', '--entityId', 'person_carol', '--content', 'Thread');
    const reply = created('note.add', '--entityType', 'PERSON', '--entityId', 'person_carol', '--content', 'Reply', '--parentId', note);
    const comment = created('comment.add', '--entityType', 'NOTE', '--entityId', reply, '--content', 'On the reply');

    expect(remry('entity.delete', '--entityType', 'NOTE', '--id', note).ok).toBe(true);
    expect(list('comment.list', 'NOTE', reply)).toEqual([]);
    expect(remry('comment.remove', '--id', comment).error?.message).toContain('not found');
  });
});

describe('attaching to something that does not exist', () => {
  it('is refused, naming the id', () => {
    const r = remry('note.add', '--entityType', 'PERSON', '--entityId', 'no-such-person', '--content', 'Lost');
    expect(r.ok).toBe(false);
    expect(r.error?.message).toContain('PERSON no-such-person not found');
    expect(remry('todo.create', '--title', 'Lost', '--entityType', 'NOTE', '--entityId', 'no-such-note').ok).toBe(false);
  });

  it('refuses a reply to a note on another entity', () => {
    const note = created('note.add', '--entityType', 'PERSON', '--entityId', 'person_alice', '--content', 'Alice note');
    const r = remry('note.add', '--entityType', 'PERSON', '--entityId', 'person_bob', '--content', 'Reply', '--parentId', note);
    expect(r.ok).toBe(false);
    expect(r.error?.message).toContain("isn't a note on this person");
  });
});
