# Remry data model

Everything belongs to one user; there are no accounts, orgs or permissions. Ids are opaque strings. Always look them up; never guess.

## People and groups

| Entity | Fields | Relationships |
|---|---|---|
| **Person** | `name`, `email?`, and each module's fields under `extensions` | Groups through membership (any number, of any kind) |
| **Group** | `kind` (a group kind key), `name`, `description?` | Members are People: `group.addMember` / `group.removeMember` / `group.listMembers` |
| **Group kind** | `key` (`TEAM`, `FAMILY`), `name`, `plural`, `exclusive` | `groupKind.list/get/create/update/delete`. In an **exclusive** kind (DEPARTMENT) a person is in one group at most: `group.addMember` moves them, and `replaced` in the result names the group they left |

**Person fields by module.** Write them with `person.create` / `person.update --extensions '{"<module>":{...}}'`; `null` clears one. A module the notebook doesn't use is refused.

| Module (profile) | Fields |
|---|---|
| `org` (work) | `title`, `leadId` (their manager: writing it adds or replaces the `LEAD_OF` person relation to them; `person.get` returns `leadName` and `reports`) |
| `personal` (home) | `birthday` (`1990-05-03`, or `--05-03` without the year), `knownAs` (how you know them) |

- `person.get` returns `groups` (each with `kind` and `kindName`) and `extensions` (each module's data).
- **Me:** `person.setMe --id <id>` (or `null`) marks the notebook's owner, one at most. `person.list` and `person.get` return `isMe` and `toMe`, each relationship between that person and me labelled from their side (`["Child of"]`).
- A work notebook starts with the group kinds TEAM and DEPARTMENT (exclusive); a home notebook with FAMILY and FRIENDS. Add others with `groupKind.create` when the user agrees.
- Deleting a person removes their memberships and their module data, and clears them as anyone's lead. Deleting a group kind is refused while groups use it, unless `--moveTo` names another kind.
- A home notebook has no goals (the `goal.*` tools are refused there) and no org fields; the home page lists birthdays in the next 30 days.

## Projects

**Project**: `name`, `description?`, `status?` (one of `proposed` for prospective projects, `committed`, `in-progress`, `blocked`, `done`, `abandoned`; common words map onto these, such as `active` → `in-progress`, `planning` → `committed`, `cancelled` → `abandoned`, and anything else is refused), `startDate?`, `endDate?`, `parentId?` (sub-projects), an owner (`ownerType` `PERSON` or `GROUP` + `ownerId`), and three-point estimates `daysOptimistic?`, `daysLikely?`, `daysPessimistic?`.

- Set `ownerType` and `ownerId` together. Set both to `null` to clear the owner. The owner must exist.
- `project.list` filters by `ownerType` + `ownerId`. `project.get` returns the `owner` with its name and path. `project.create` returns `{ id, path }`.
- A parent that would make a loop (a project under its own sub-project) is rejected.

## Goals

**Goal**: `title`, `description?`, an owner (`ownerType` `PERSON` or `GROUP` + `ownerId`; no owner means the whole notebook), `parentId?` (the cascade, e.g. a team's goal under a department's), `period?`, `status`, and an optional metric: `unit?`, `baseline?`, `target?`.

- `period` is `2026`, `2026-H2` or `2026-Q3`: a calendar year, half or quarter. The app reads it as dates (`2026-H2` is 1 Jul to 31 Dec 2026), shows how much of it has gone by, draws a pace line from `baseline` to `target` across it, and flags a goal "Behind pace" when `progress` trails the time elapsed by more than 10 points, or "Period ended" when the period is over and the goal isn't `DONE` or `DROPPED`. The flags are hints; they never change `status`.
- `status` is one of `NOT_STARTED ON_TRACK AT_RISK OFF_TRACK DONE DROPPED` (default `NOT_STARTED`).
- `goal.list` filters by `ownerType` + `ownerId`, `period`, `status`, `parentId` (`null` for top-level goals) and `projectId`.
- `goal.get` returns the owner, parent, sub-goals, check-ins (newest first), linked projects, `current`, `progress` and `path`. `goal.create` returns `{ id, path }`.
- `current` is the value of the latest check-in that has one. `progress` is 0–1 from `baseline` (0 if unset) to `target`, and `null` until there is a target and a current value. It works for goals where lower is better.
- Owner rules are the same as for projects. A parent that would make a loop is rejected.
- Deleting a goal moves its sub-goals up to its parent, and deletes its check-ins and project links.

**Check-in**: `date` (defaults to now), `value?`, `status?`, `comment?`. It needs at least one of value, status or comment. A status on a check-in also becomes the goal's status. Procedures: `goal.checkIn --goalId`, `goal.removeCheckIn --id`.

**Projects**: a goal links to many projects, and a project to many goals: `goal.addProject` / `goal.removeProject` with `--goalId` and `--projectId`.

## Wiki pages

**Page**: `title`, `kind` (default `GENERAL`), `parentId?` (the page tree), `content` (markdown), and `properties` (a JSON object whose keys are the kind's fields). Procedures: `page.list` (filters `kind`, `parentId`), `page.get`, `page.create` (returns `{ id, path }`), `page.update`, `page.delete`, and `page.query` (below).

**Page kind**: each notebook defines its own. `key` (`EXPENSE`: capitals, digits and `_`), `name`, `description?`, `fields`. `GENERAL` (no fields) always exists and can't be changed. A work notebook starts with these, a home notebook with none:

| Kind | Fields |
|---|---|
| `POLICY` | `status` (`DRAFT ACTIVE RETIRED`), `version`, `effectiveDate`, `reviewDate` |
| `PRODUCT` | `status` (`IDEA BUILDING LIVE SUNSET`), `url` |
| `SOFTWARE` | `vendor`, `url`, `annualCost`, `currency`, `renewalDate`, `seats` |
| `DECISION` | `status` (`PROPOSED ACCEPTED SUPERSEDED REJECTED`), `decidedOn` |

A field is `{ "key": "amount", "label": "Amount", "input": "number" }` (key camelCase, up to 30 fields), where `input` is `text`, `number`, `date`, `url`, `select` or `multiselect` (both need `options`), or `checkbox`. A number can add `"format": "money", "currency": "USD"`. Procedures: `pageKind.list` (with `pageCount`), `pageKind.get --key`, `pageKind.create`, `pageKind.update --key` (the whole new `fields` list; removing a field clears its values; dropping an option or changing a type that pages use is refused, naming them), `pageKind.delete --key [--moveTo <kind>]` (refused while pages use the kind unless `moveTo` is given).

- Every property is optional. Dates are `YYYY-MM-DD`, numbers may be negative, a `url` is a full URL, a `multiselect` value is a list of its options, and a `checkbox` is `true` or `false`. Other keys are rejected, and the error lists the allowed ones. An unknown kind is an error listing the notebook's kinds.
- `page.query --kind <key>`: the kind's pages as a dataset. `--filters` (a list, all must match) of `field:op[:value]`, ops `is not anyOf contains gte lte empty set` (`anyOf` values are split by `|`; `gte` and `lte` compare numbers and dates); `title` and `updatedAt` work too. `--sort field[:asc|desc]` (empty values last). `--groupBy` a select, multiselect, checkbox or text field (a multiselect page counts in each of its groups). `--aggregates` a list of `field:sum|avg|min|max` on number fields. Returns `{ kind, pages, count, totals, groups }`, totals keyed `field:fn`. The same view in the app is `/app/wiki?kind=<key>&f=<filter>&sort=…&group=…&agg=…`.
- `page.update` merges `properties` into the current values: keys you pass are set, `null` removes a key, and the rest stay. Changing `kind` drops keys the new kind doesn't have.
- Chart blocks in page content are validated like reports.
- Deleting a page moves its sub-pages up to its parent. A parent that would make a loop is rejected.

## Relations

A relation links two entities, with a `kind` and an optional `note` (up to 1000 characters). Either end is `PERSON`, `GROUP`, `PROJECT`, `GOAL`, `PAGE`, `DOC`, `NOTE`, `REPORT` or `TODO`. Procedures: `relation.add` (`fromType`, `fromId`, `toType`, `toId`, `kind`, `note`), `relation.update` (`id`, `kind?`, `note?`), `relation.remove`, `relation.forEntity` (`entityType`, `entityId`).

| Kind | From the `from` side | From the `to` side |
|---|---|---|
| `RELATED` (default, no direction) | Related to | Related to |
| `DEPENDS_ON` | Depends on | Needed by |
| `MENTIONS` (derived) | Mentions | Mentioned in |

Those are the only kinds. Relationships between people are person relations (below).

- Only one relation of each kind can exist between the same two entities (for a kind with no direction, in either direction), and an entity can't relate to itself.
- For a link that's neither ("uses", "replaces"), use `RELATED` with a `note`.
- `relation.forEntity` returns both directions, grouped by the label from that entity's side, and each item has the other entity's name and `path`.
- `project.dependencies` (`--archived`) lists every project-to-project `DEPENDS_ON` link (`fromId` depends on `toId`), every goal–project link, and those goals' status and progress in one call. It feeds the projects page's dependency map (`/app/projects?view=map`).
- **`MENTIONS` is derived.** When a page, doc, note or report's content is saved, each markdown link to an app path (`/app/wiki/<id>`, relative or on `http://127.0.0.1:5173`) becomes a `MENTIONS` relation from that page, doc, note or report to the target. Paths are `/app/people/`, `/app/groups/`, `/app/projects/`, `/app/goals/`, `/app/wiki/` and `/app/reports/`, each followed by the id. Links in code blocks and links to ids that don't exist are ignored. `relation.add`, `update` and `remove` refuse `MENTIONS`.

## Person relations

A relationship between two people, with a `kind` and an optional `note`. Procedures: `personRelation.add` (`fromId`, `toId`, `kind`, `note?`), `personRelation.update` (`id`, `kind?`, `note?`), `personRelation.remove`, `personRelation.forPerson` (`personId`). `relation.forEntity` on a person includes them too. Deleting a person deletes their relationships; ending one deletes it (no history).

Kinds are the notebook's own: `personRelationKind.list` (with their use), `create` (`key`, `label`, `inverseLabel?`, `exclusive?`), `update` (labels and order only), `delete --moveTo <kind>` (moves a used kind's relationships first, not into a one-each kind).

| Seeded kind | From the `from` person | From the `to` person |
|---|---|---|
| `LEAD_OF` (work; one each) | Lead of | Reports to |
| `PARTNER_OF` (home; no direction) | Partner of | Partner of |
| `PARENT_OF` (home) | Parent of | Child of |
| `SIBLING_OF` (home; no direction) | Sibling of | Sibling of |
| `FRIEND_OF` (home; no direction) | Friend of | Friend of |
| `PARENT_IN_LAW_OF` (home) | Parent-in-law of | Child-in-law of |
| `SIBLING_IN_LAW_OF` (home; no direction) | Sibling-in-law of | Sibling-in-law of |

- A kind with **no direction** (leave out `inverseLabel`) is one relationship either way: adding B→A when A→B exists is a duplicate.
- A kind that's **one each** (`exclusive`) allows one relationship at its `to` person: a new `LEAD_OF` to someone replaces their old lead, and the result's `replaced` names it. It forms a tree, so a loop (leading someone above you) is refused.

## Things attached to any entity

These use `entityType` + `entityId`, where `entityType` is `PERSON`, `GROUP`, `PROJECT`, `GOAL` or `PAGE` (also `DOC`, `NOTE`, `REPORT`, `TODO`, `LINK`, `TAG`, `COMMENT`, `EMOJI`).

Deleting a person, group, project, goal, page or report also deletes everything attached to it and its relations, and clears any goal or project owner that pointed at it. Removing a doc, note or todo deletes its relations.

| Entity | Fields | Procedures |
|---|---|---|
| **Note** | `content` (markdown), `parentId?` for a reply | `note.list`, `note.add`, `note.update`, `note.remove` |
| **Doc** | `title`, `content` (markdown), `sortOrder`, `sourceUrl?` (attached PDF) | `doc.list`, `doc.get`, `doc.add`, `doc.update`, `doc.reorder`, `doc.attachSource`, `doc.getReadUrl`, `doc.remove` |
| **Todo** | `title`, `description?`, `status`, `priority` 0–3 (3 is highest), `targetDate?`, `recurrence?` (`WEEKLY MONTHLY QUARTERLY YEARLY`: completing it creates the next one, due one interval after `targetDate`, and returns its id as `nextId`), `completedAt` (set automatically) | `todo.list` (filter `--status`, `--entityType`), `todo.forEntity`, `todo.create`, `todo.update`, `todo.delete` |
| **Link** | `url`, `title?`, `syncedAt?` (set by `--synced true` on add, or `link.markSynced`) | `link.list`, `link.find` (`--url`, or `--contains` text; returns the entity each match is attached to, with `label` and `path`), `link.add`, `link.markSynced` (`--id`), `link.remove` |
| **Tag** | `name` (unique), `color` | `tag.list`, `tag.create`, `tag.delete`; `tag.forEntity`, `tag.attach`, `tag.detach` |
| **Comment** | `content` | `comment.list`, `comment.add`, `comment.remove` |

Todo `status` is one of `PENDING ACTIVE COMPLETE CANCELLED`. `todo.list` returns each todo's `entityLabel` (the person, group or project name) and `entityPath`.

`link.find --url` compares URLs normalized: protocol, `www.`, host case, a trailing slash, the fragment and tracking parameters (`utm_*` and similar) don't matter, but the path's case and other query parameters do. `--contains` matches any part of the URL, ignoring case. Either returns at most 50 links, newest first, leaving out links on deleted entities. Use it to find the entity an imported item (a Linear issue, a Notion page) already lives on. A link with a `syncedAt` is the entity's source: `syncedAt` is when the entity was last brought up to date from it, set to the current time by `link.add --synced true` or `link.markSynced --id <link>`. A plain link (a reference, a dashboard) has none.

Docs are for longer reference material (a career plan, an imported PDF). They attach to anything except a wiki page: `doc.add` on a `PAGE` fails, because the page's own `content` is the place for that material. Notes are short, dated observations. Reports are switched off for now, so write finished write-ups as docs.

## Search

| Procedure | Inputs | Returns |
|---|---|---|
| `search.query` | `q` (1–200 chars; words, `"phrase"`, `OR`, `-exclude`), `types?`, `within?` (`{entityType, entityId}`), `includeArchived?`, `limit?` 1–50 | `results`: `entityType`, `entityId`, `name`, `path`, `on` (the entity an attachment hangs off: `entityType`, `entityId`, `name`), `snippet` (matches in `**bold**`), `score` (lower is more relevant) |
| `search.recall` | `entityType` (`PERSON GROUP PROJECT GOAL PAGE DOC NOTE REPORT TODO`), `entityId`, `limit?` 1–50 (default 10) | `name`, `path`, `archived`, `entity` (what the type's `get` returns), `notes`, `comments`, `todos` (open only), `docs` (`excerpt` of the start), `links`, `tags`, `relations`, `ownedGoals` (with `latestCheckIn`), `ownedProjects`, `unlinkedMentions` (search results naming it without linking it). Each list is `{items, truncated}` |

Search result types are the entity types plus `GOAL_CHECKIN`, a goal check-in's comment, which opens on its goal. Chats with Claude, relation notes and tag names aren't searched.

## Branding

**Branding**: `name`, colours (`primaryColor`, `accentColor`, `primaryFontColor`, `accentFontColor`, as `#rrggbb`), an optional logo and icon, and `isDefault`. A report with no `brandingId` uses the default branding. Brandings are managed in the UI; you rarely need to touch them.

## Dates

Pass ISO dates (`2026-10-01` or `2026-10-01T09:00:00Z`). Results come back as ISO strings.

## Archiving

People, groups, projects, goals and pages can be archived: `<type>.archive --id` and `<type>.unarchive --id` (for example `person.archive`, `project.unarchive`). Archiving sets `archivedAt`; archiving twice keeps the first date.

- **Hidden:** `person.list`, `group.list`, `project.list`, `goal.list` and `page.list` leave archived entities out. Pass `--archived only` for just the archived ones, or `--archived include` for both. The org map, the home feed, the home focus graph and `todo.list` leave out archived entities and what's attached to them.
- **Still readable:** `get` returns an archived entity with its `archivedAt`, and its docs, notes, todos, reports and relations stay as they were.
- **Read-only:** updates, membership changes, check-ins, goal–project links, and adding, editing or removing docs, notes, todos, reports, links, tags, comments and emoji on an archived entity fail, and the error says to unarchive it first. A relation can point *to* an archived entity (a project that supersedes an archived one) but not start from one.
- **Delete still works** on an archived entity, and removes everything attached to it, as for any delete.

