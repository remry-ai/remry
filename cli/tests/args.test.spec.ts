import { describe, it, expect } from 'vitest';
import { coerceArgs, typesOf, type FileReader } from '../args';

// Shapes produced by zod-to-json-schema for our routers.
const schema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    title: { type: 'string' },
    leadId: { type: ['string', 'null'] },
    priority: { type: 'integer', minimum: 0, maximum: 3 },
    isDefault: { type: 'boolean' },
    docIds: { type: 'array', items: { type: 'string' } },
    entityType: { type: 'string', enum: ['PERSON', 'TEAM'] },
    content: { type: 'string' }
  }
};

const noFiles: FileReader = () => {
  throw new Error('no files in this test');
};

const parse = (argv: string[], readFile: FileReader = noFiles) => coerceArgs(argv, schema, readFile);

describe('coerceArgs', () => {
  it('keeps numeric-looking strings as strings when the schema says string', () => {
    const r = parse(['--name', 'Dana', '--title', '2024']);
    expect(r.ok && r.value).toEqual({ name: 'Dana', title: '2024' });
  });

  it('coerces numbers, booleans, null and JSON by schema type', () => {
    const r = parse(['--priority', '2', '--isDefault', 'false', '--leadId', 'null', '--docIds', '["a","b"]']);
    expect(r.ok && r.value).toEqual({ priority: 2, isDefault: false, leadId: null, docIds: ['a', 'b'] });
  });

  it('treats a bare flag as true for booleans', () => {
    const r = parse(['--isDefault']);
    expect(r.ok && r.value).toEqual({ isDefault: true });
  });

  it('supports --key=value', () => {
    const r = parse(['--name=Dana Park', '--priority=1']);
    expect(r.ok && r.value).toEqual({ name: 'Dana Park', priority: 1 });
  });

  it('reads --<key>-file into the field', () => {
    const r = parse(['--content-file', 'q3.md'], (path) => `# from ${path}`);
    expect(r.ok && r.value).toEqual({ content: '# from q3.md' });
  });

  it('passes --input JSON through verbatim', () => {
    const r = parse(['--input', '{"name":"Dana","title":"2024"}']);
    expect(r.ok && r.value).toEqual({ name: 'Dana', title: '2024' });
  });

  it('returns undefined input when there are no options', () => {
    const r = parse([]);
    expect(r.ok && r.value).toBeUndefined();
  });

  it.each([
    [['--nmae', 'Dana'], 'Unknown option --nmae'],
    [['--priority', 'high'], '--priority must be a number'],
    [['--name'], '--name needs a value'],
    [['Dana'], 'Unexpected argument "Dana"'],
    [['--docIds', 'a,b'], '--docIds must be JSON'],
    [['--content-file', 'missing.md'], 'Could not read missing.md'],
    [['--input', '{}', '--name', 'x'], 'not both']
  ])('rejects %j', (argv, message) => {
    const r = parse(argv);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain(message);
  });
});

describe('typesOf', () => {
  it('collects types from type arrays, anyOf and enum', () => {
    expect([...typesOf({ anyOf: [{ type: 'string' }, { type: 'null' }] })].sort()).toEqual(['null', 'string']);
    expect([...typesOf({ enum: ['A', null] })].sort()).toEqual(['null', 'string']);
  });
});
