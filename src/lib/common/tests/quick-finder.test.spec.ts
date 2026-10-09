import { describe, it, expect } from 'vitest';
import { finderRows, type FinderRow, type FinderSources } from '../quick-finder';

const sources: FinderSources = {
  scopes: [
    { id: 'TEAM', label: 'Team', slash: 'team' },
    { id: 'PROJECT', label: 'Project', slash: 'project' }
  ],
  commands: [
    { id: 'todo', label: 'New todo', slash: 'todo' },
    { id: 'notebook', label: 'New notebook', slash: 'notebook' }
  ],
  entries: [
    { id: 'TEAM:1', name: 'Console', scope: 'TEAM', meta: 'Team' },
    { id: 'PROJECT:1', name: 'Console migration', scope: 'PROJECT', meta: 'Project' },
    { id: 'route:/app/teams', name: 'Teams', meta: 'Go to' },
    { id: 'notebook:side', name: 'Switch to side', meta: 'Notebook' }
  ],
  home: [{ id: 'route:/app/teams', name: 'Teams', meta: 'Go to' }]
};

const keys = (rows: readonly FinderRow[]): readonly string[] => rows.map((row) => row.key);

describe('finderRows', () => {
  it('lists the commands, then the app sections, before anything is typed', () => {
    expect(keys(finderRows('', sources))).toEqual(['command:todo', 'command:notebook', 'route:/app/teams']);
  });

  it('lists types, then commands, for a slash', () => {
    expect(keys(finderRows('/', sources))).toEqual(['scope:TEAM', 'scope:PROJECT', 'command:todo', 'command:notebook']);
    expect(keys(finderRows('/t', sources))).toEqual(['scope:TEAM', 'command:todo']);
    expect(keys(finderRows('/todo ', sources))).toEqual(['command:todo']);
  });

  it('searches everything for plain text', () => {
    expect(keys(finderRows('con', sources))).toEqual(['TEAM:1', 'PROJECT:1']);
    expect(keys(finderRows('side', sources))).toEqual(['notebook:side']);
  });

  it('searches one type after a slash word and a space', () => {
    expect(keys(finderRows('/project con', sources))).toEqual(['PROJECT:1']);
    expect(keys(finderRows('/team ', sources))).toEqual(['TEAM:1']);
  });
});
