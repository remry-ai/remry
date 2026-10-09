---
name: remry
description: Read and write the user's local Remry notebooks (separate ones for work, home life and personal projects) — their people and groups (teams, departments, families, friend groups — a group's kind is defined per notebook), reporting lines, friends and family and how they're related, projects and who owns them, goals with targets and check-ins, a library of pages of kinds the notebook defines (policies, software, expenses, recipes, places, home things, tax records) that work as filterable tables with totals, relations between any of these, notes, docs (with charts), recurring todos and tags. Use whenever the user talks about the people or teams they work with, friends, family, birthdays, who is whose partner, sibling or parent, bills, subscriptions, recurring expenses, taxes, recipes, places to visit, things around the house, personal projects, 1:1s, who reports to whom, org changes ("X moved to team Y", "Z is now X's manager"), projects, goals, OKRs, targets or progress ("we're at 80%", "that goal is at risk"), policies, products, the software or vendors they use, decisions, wiki pages, links between things ("link X to Y", "X depends on Y", "team X uses Y"), follow-ups or reminders about their work, asks you to "remember", "note", "log" or "track" something about their org, wants a report or write-up about a person, team, project or goal, wants a PDF imported into their notes, or wants projects, issues, pages or people from Linear, Notion, Jira, GitHub or another tool brought into their notes.
---

# Remry

Local notebooks on this computer, stored in SQLite in the user's app data folder (`~/Library/Application Support/Remry` on macOS, `%LOCALAPPDATA%\Remry` on Windows, `~/.local/share/remry` on Linux). Each notebook (their work, their home life, a side project) has its own people, projects, notes and files, and nothing is shared between notebooks. You are the main way data gets in. The user browses them in a web UI.

On a phone, the user can reach you through Claude desktop's Remote Control: the session runs on their Mac, so these tools work the same way.

## Calling it

The notebooks are reachable in two ways, and the app does **not** need to be running for either. Use whichever this session has; if it has both, use the MCP tools.

**MCP tools** from the `remry` server, in Claude desktop Chat, Cowork and Claude Code. Each tool is one procedure, with `_` in place of `.`: `person_list`, `person_create`, `note_add`. Pass inputs as the tool's arguments, and long text inline (there are no `-file` inputs). Every tool except `notebook_*` also takes an optional `notebook`. `backup_snapshot` and `backup_list` handle snapshots, `app_open` starts the app on this computer and returns its link, and `app_restart` stops and starts it again (when the user asks, or the app is stuck or out of date). From a terminal, `remry app restart` does the same.

**In Cowork, or any other sandbox, use only the MCP tools.** The notebooks live on the user's Mac, in `~/Library/Application Support/Remry`, which a sandbox can't see, and `remry` isn't installed there.
- Never read, list, copy or `cat` that folder, open its database, or run `remry` from a sandbox.
- Don't ask the user to attach that folder to the session: the database must not be opened from the sandbox and the Mac at once.
- If the Remry tools (`notebook_list`, `person_list` and so on) aren't in this session, stop and tell the user. They need the current Remry plugin installed, and the Cowork session started on their Mac, not in the cloud, with the Claude desktop app open. Local MCP servers don't run in cloud sessions.

**The `remry` CLI**, only in a shell on the user's own Mac (for example Claude Code), not in a sandbox:

```bash
remry help                    # every procedure
remry help person.create      # one procedure's inputs, types and limits
remry person.list
remry person.create --name "Dana Park" --extensions '{"org":{"title":"Senior Engineer"}}'
```

- If the shell says `remry: command not found`, use the first of these that exists, wherever this skill says `remry`:
  - the app a release installed: `"$HOME/Library/Application Support/Remry/App/current/remry"`
  - a clone set up with `bun run setup`: `"$(cat "$HOME/Library/Application Support/Remry/app-path")/bin/remry"` (on Linux, `"$(cat "${XDG_DATA_HOME:-$HOME/.local/share}/remry/app-path")/bin/remry"`)
- If neither the tools nor `remry` work, or they say Remry isn't set up, tell the user what you saw and stop. Setup is theirs to do: install the Remry plugin from a release, which includes the app. Don't look for the data folder yourself.
- stdout is JSON. Most calls return `{"ok": true, "value": ...}` or `{"ok": false, "error": {"message": ...}}`. Exit code 1 means failure; read the message and fix the call.
- Values are typed by each procedure's schema: `--priority 2` is a number, `--title 2024` stays a string, and `null` clears a field (`--email null`, or `{"org":{"title":null}}` in `--extensions`).
- For long text, write it to a file and pass `--content-file path.md` (any `--<field>-file`). For awkward input, pass `--input '{"...": ...}'`.

## Notebooks

Every call works on one notebook: the default, unless you name another.

- **Start with `notebook.list`** (`notebook_list`). It shows each notebook's id and name, and marks the default.
- **Pick the notebook the user means.** Their job belongs in their work notebook, and a side project in its own. If there's more than one notebook and you can't tell, ask.
- **Name it on the call** to use a notebook other than the default: `--notebook <id or name>` on any CLI call, or `notebook` in any tool's arguments. Keep passing it for every call in that notebook, lookups included.
- **Ids don't carry across notebooks.** Look people, groups and projects up in the notebook you're writing to.
- **Say which notebook** you read or wrote when there's more than one: "Added Dana Park to Platform, in Work".
- **A notebook's profile** is `work` or `home` (`notebook.list` shows it), and picks its **modules**:
  - `work`: the **org** module (a person's title and lead, Team and Department groups, the org map) and **goals**.
  - `home`: the **personal** module (a person's birthday and how you know them, Family and Friends groups, partner/parent/sibling/friend relations).
  - Everything else (people, groups, projects, pages, docs, notes, todos, relations, tags, search) is the same in both. A tool for a module the notebook doesn't have (`goal_*` in a home notebook, or an `org` field) is refused with a message saying so; don't retry it there.
- `notebook.create --name "Garden"` makes a notebook; its id comes from the name, or pass `--id`. Add `--profile home` for home life. A work notebook starts with the group kinds TEAM and DEPARTMENT and the page kinds POLICY, PRODUCT, SOFTWARE and DECISION; a home one with the group kinds FAMILY and FRIENDS. `notebook.setProfile --id <id> --profile home` changes it, only when the user asks. `notebook.setDefault --id <id>` changes the default for every later call, so do it only when the user asks. There is no delete: the user removes a notebook themselves.

## Rules

1. **Look before you write**, in the notebook you're writing to. Find ids with `person.list`, `group.list` (`--kind TEAM`), `project.list`, `goal.list` and `page.list`, or `search.query` when you only know roughly what it's called. Match names and titles case-insensitively. Never create a second person, group or project with a name that already exists, or a second goal or page with a title that already exists.
2. **Ask when it's ambiguous.** For example, two people match "Sam", or it's unclear which project a note belongs to.
3. **Confirm before deleting anything**, and say exactly what will be removed. When someone leaves, or a group, project, goal or page is finished, offer to **archive** it instead: archiving keeps its history, and deleting removes everything attached to it.
4. **Snapshot before bulk or destructive changes.** That means any delete, or more than about five writes in one go:
   `backup_snapshot` with a reason like "before <what>", or `remry backup --force --reason "before <what>"`
5. **Report back by name.** Say "Added Dana Park to Platform, reporting to Alice Johnson", not ids.
6. **Keep the user's words.** A note records what they said. Don't embellish or summarise it unless asked.
7. **Link everything you created or changed.** End every reply that wrote something with a markdown link to each item, by name, so the user can open it: `[Dana Park](http://127.0.0.1:5173/app/people/<id>?notebook=<notebook id>)`. See **Links to what you changed** below.

## Links to what you changed

After any write (create, update, add, attach, check-in, archive), list what changed at the end of your reply, one link per item. Don't link deleted items; name them.

- **Address:** `http://127.0.0.1:5173` + the item's path + `?notebook=<notebook id>` (or `&notebook=` when the path already has a `?`). Always add the notebook, so the link opens in the right one. The links work only while the app is running: call `app_open` once (with the notebook) if you haven't this session, and use the address it returns.
- **Paths:** use the `path` in the result when there is one. Otherwise: `/app/people/<id>`, `/app/groups/<id>`, `/app/projects/<id>`, `/app/goals/<id>`, `/app/wiki/<id>` (a page kind's table: `/app/wiki?kind=<key>`).
- **Things attached to an entity** link to that entity's page: a note, tag, link, relation, group membership or goal check-in. A doc opens with `?doc=<doc id>` on its entity's path. A todo opens with `/app/todos?popup=todo&todo=<todo id>`.
- **Several changes to one item** are one link. For more than about ten items, link the ten that matter most and say how many more there are.

```markdown
Added to Work:
- [Dana Park](http://127.0.0.1:5173/app/people/abc123?notebook=work), on [Platform](http://127.0.0.1:5173/app/groups/def456?notebook=work)
- Todo: [Book 1:1 with Dana](http://127.0.0.1:5173/app/todos?popup=todo&todo=ghi789&notebook=work)
```

## Recipes

These use CLI syntax. With MCP tools, `person.create --name "Dana Park"` is `person_create` with `{"name": "Dana Park"}`.

| The user says | Do |
|---|---|
| "Start a notebook for my garden project" | `notebook.list`, then `notebook.create --name "Garden"` if there isn't one |
| "In my garden notebook, remind me to order seeds" | `todo.create --title "Order seeds" --notebook garden` (look up any ids with `--notebook garden` too) |
| "Dana joined as a senior engineer" | `person.create --name "Dana Park" --extensions '{"org":{"title":"Senior Engineer"}}'` |
| "Dana reports to Alice" | `personRelation.add --fromId <alice> --toId <dana> --kind LEAD_OF`. A person has one lead, so this replaces Dana's old one, and `replaced` in the result names who it was: tell the user. `personRelation.remove` clears it |
| "This is me" / "I'm Jamie" | `person.setMe --id <person>` (one per notebook). Then relationships with that person read as "To you" on People, and `person.list` gives each person's `toMe` |
| "Dana is on Platform" | `group.list --kind TEAM` to find it (`group.create --kind TEAM --name Platform` if it's new), then `group.addMember --groupId <platform> --personId <dana>` (people can be in many groups) |
| "Dana moved from Platform to Payments" | `group.removeMember` from Platform, then `group.addMember` to Payments |
| "Dana left the company" | Ask whether to archive or delete; archiving keeps their notes and history. `person.archive --id <dana>` (first move or close anything that must change: archived people are read-only) |
| "The Q4 migration is finished, archive it" | `project.update --id <project> --status done` first if the status should change, then `project.archive --id <project>` |
| "What did we archive?" / "Show old projects" | `project.list --archived only` (also `person`, `group`, `goal`, `page`); `--archived include` lists both |
| "Dana is in Engineering" | `group.addMember --groupId <engineering> --personId <dana>`. DEPARTMENT is an exclusive kind (one per person), so this moves her out of her old department; the result's `replaced` names it |
| "Note that Dana wants to lead the migration" | `note.add --entityType PERSON --entityId <dana> --content "..."` |
| "Remind me to book a 1:1 with Dana" | `todo.create --title "Book 1:1 with Dana" --entityType PERSON --entityId <dana>` (optional `--priority 0-3`, `--targetDate 2026-10-01`) |
| "That's done" | `todo.update --id <todo> --status COMPLETE` |
| "Start a project for the Q4 migration" | `project.create --name "Q4 migration" --status in-progress` (optional `--parentId`, `--startDate`, `--daysLikely`) |
| "Tag Dana as high-potential" | `tag.list`, then `tag.create --name high-potential` if it's missing, then `tag.attach --tagId <tag> --entityType PERSON --entityId <dana>` |
| "What do I know about Dana?" / "Catch me up on the Q4 migration" | `search.recall --entityType PERSON --entityId <dana>`: the entity, its notes, open todos, docs (with excerpts), links, tags, relations, owned goals and projects, and `unlinkedMentions` (notes and docs elsewhere that name Dana without linking her). Lists are capped at 10 (`--limit` up to 50) and flagged `truncated`; `doc.get` reads a whole doc |
| "Where did I write about the vendor renewal?" / "Did anyone mention SSO?" | `search.query --q "vendor renewal"`. Each result has a `snippet` with the match in bold, and `on`: the entity a note, doc or todo is attached to |
| "Anything about hiring on the Platform team?" | `search.query --q hiring --within '{"entityType":"GROUP","entityId":"<platform>"}'` (the group and what's attached to it) |
| "Platform owns the Q4 migration" | `project.update --id <project> --ownerType GROUP --ownerId <platform>` (set both together; `--ownerType null --ownerId null` clears the owner) |
| "Engineering's H2 goal is 99.9% uptime, and Platform has a sub-goal for it" | `goal.list`, then `goal.create --title "99.9% uptime" --ownerType GROUP --ownerId <engineering> --period 2026-H2 --unit % --baseline 99.5 --target 99.9`, then `goal.create --title "..." --ownerType GROUP --ownerId <platform> --parentId <eng goal>` |
| "Uptime is at 99.7%, and it's at risk" | `goal.checkIn --goalId <goal> --value 99.7 --status AT_RISK --comment "..."` (optional `--date`; the status also becomes the goal's status) |
| "The Q4 migration is part of the uptime goal" | `goal.addProject --goalId <goal> --projectId <project>` |
| "Sam is my sister" | `person.create --name "Sam" --extensions '{"personal":{"knownAs":"Sister"}}'` if she's new, then `personRelation.add --fromId <me> --toId <sam> --kind SIBLING_OF`. "Me" is the person `person.list` marks `isMe`; if there's none, ask whether the user wants to be in the notebook (`person.create`, then `person.setMe`) |
| "Alex is Sam's partner" / "Jo is Sam's mum" / "Alex and Kim are friends" | `personRelation.add --fromId --toId` with `--kind PARTNER_OF`, `PARENT_OF` (from the parent to the child) or `FRIEND_OF`; `personRelationKind.list` has the notebook's kinds. A relationship that recurs and has no kind ("mentor", "neighbour"): propose `personRelationKind.create --key MENTOR_OF --label "Mentor of" --inverseLabel "Mentee of"` (leave out `inverseLabel` when it reads the same both ways). A one-off ("met at the climbing gym") is `relation.add --kind RELATED` with `--note` |
| "Alex's birthday is 3 May" / "…3 May 1990" | `person.update --id <alex> --extensions '{"personal":{"birthday":"--05-03"}}'` (no year) or `"1990-05-03"` |
| "Add the Riveras as a family" / "my climbing friends" | `group.list --kind FAMILY` (or `FRIENDS`); `group.create --kind FAMILY --name Riveras` if it's missing, then `group.addMember` for each person. Other kinds of group ("book club"): `groupKind.list`, and `groupKind.create --key BOOK_CLUB --name "Book club"` once the user agrees |
| "Netflix is $15.49 a month, on autopay" | `pageKind.list`. If there's an expense-like kind, use it; if not, propose one (see **Page kinds**) and create it once the user agrees. Then `page.list --kind EXPENSE` to check it isn't there, and `page.create --title Netflix --kind EXPENSE --properties '{"amount":15.49,"frequency":"MONTHLY","autopay":true}'` |
| "What do I spend a month on subscriptions?" | `page.query --kind EXPENSE --filters '["frequency:is:MONTHLY","category:is:Subscriptions"]' --aggregates '["amount:sum"]'`; give the total and the items. Link the user to the same view: `/app/wiki?kind=EXPENSE&f=frequency:is:MONTHLY&agg=amount:sum` |
| "Save this recipe" (a URL or text) | Use or propose a RECIPE kind (servings, time, cuisine, source), `page.create --kind RECIPE` with the ingredients and method as the page's markdown `--content` |
| "Remind me to renew the car insurance every March" | `todo.create --title "Renew car insurance" --entityType PAGE --entityId <the insurance page> --targetDate 2027-03-01 --recurrence YEARLY`. Completing it adds next year's (`WEEKLY MONTHLY QUARTERLY YEARLY`) |
| "Add the expense policy, version 2, effective 1 October" | `page.list`, then `page.create --title "Expense policy" --kind POLICY --properties '{"status":"ACTIVE","version":"2","effectiveDate":"2026-10-01"}' --content-file policy.md` |
| "We pay Datadog $40k a year; it renews in March" | `page.create --title Datadog --kind SOFTWARE --properties '{"vendor":"Datadog","annualCost":40000,"currency":"USD","renewalDate":"2027-03-01"}'` |
| "Platform uses Datadog for alerting" | `relation.add --fromType GROUP --fromId <platform> --toType PAGE --toId <datadog> --note "Uses it for alerting"` (kind defaults to `RELATED`) |
| "Pull my Linear project into my notes" / "Track this Notion page" | Follow **Importing from other tools** below: `link.find --url <url>` first, and update what it finds instead of creating a second one |
| "Checkout can't ship until the payments API is done" | `relation.add --fromType PROJECT --fromId <checkout> --toType PROJECT --toId <payments api> --kind DEPENDS_ON` |

## Page kinds

Wiki pages have a kind, and each notebook defines its own kinds: a key (`EXPENSE`), a name and typed fields. A kind's pages open as a table at `/app/wiki?kind=<key>` that the user can filter, sort, group and total.

- **List first:** `pageKind.list` gives each kind's fields and page count. `GENERAL` (a plain page, no fields) always exists. Reuse a kind that fits ("bills" go in an existing Expense kind).
- **Propose before creating.** Suggest the name and a few fields and wait for a yes, then `pageKind.create --input '{"key":"EXPENSE","name":"Expense","fields":[...]}'`. Keep kinds general (one Expense kind with a category field, not a kind per bill) and fields few.
- **Field types** (`input`): `text`, `number` (add `"format":"money","currency":"USD"` for amounts, so they total and show as money), `date` (`YYYY-MM-DD`), `url`, `select` and `multiselect` (with `options`), `checkbox`. Keys are camelCase (`nextDue`). Values: a multiselect takes a list (`["Home","Fun"]`), a checkbox `true`/`false`.
- **Changing a kind:** `pageKind.update --key <key> --fields '[...]'` takes the whole field list, matched by key. Adding is always fine. Removing a field clears its values from every page (say so first). It refuses to drop an option or change a type while pages use it, and names those pages. `pageKind.delete --key <key> --moveTo GENERAL` moves its pages first; confirm before deleting.
- **Querying:** `page.query --kind <key>` takes `--filters` (`field:op[:value]`; ops `is not anyOf contains gte lte empty set`; `anyOf` values split by `|`; `gte`/`lte` work on numbers and dates), `--sort amount:desc`, `--groupBy <select, multiselect, checkbox or text field>` and `--aggregates '["amount:sum"]'` (`sum avg min max` on number fields). It returns the pages, `count`, `totals` and `groups`. Use it for "how much", "which are due", "what's left to do" rather than listing every page.

Entity types for notes, docs, todos, links and tags: `PERSON GROUP PROJECT GOAL PAGE`, except that docs don't attach to a `PAGE` (put the material in the page's content, or a sub-page). They also accept `DOC NOTE REPORT TODO LINK TAG COMMENT EMOJI`. Archived entities are left out of every `list` unless you pass `--archived only` or `--archived include`, and writes to them (or to anything attached to them) fail with an error saying to unarchive first. `get` still works. The full data model is in [references/schema.md](references/schema.md).

## Searching

**Full-text search is part of Remry Pro.** Without an active license, `search.query` and `search.recall` return an error saying so. Then don't retry: answer with the list and get procedures instead (`person.get`, `note.list`, `todo.forEntity`, `doc.list`, `relation.forEntity`, and `<type>.list` to find ids by name), and mention once that full-text search comes with Pro. `license.status` says whether this computer has a license; if the user gives you a key (it starts `WN1.`), add it with `license.activate --key <key>`.

`search.query --q "<words>"` searches the text of everything in the notebook: names and titles, notes, docs, wiki pages (content and property values), todos, comments, links and goal check-in comments. Matches in names and titles rank first.

- **Words:** every word must match, and each also matches as a prefix (`migr` finds "migration"). Word endings are ignored (`leaving` finds "leave"), and so are case and accents.
- **`"exact phrase"`**, **`a OR b`** (either), **`-word`** (leave out matches containing it).
- **Narrow it:** `--types '["NOTE","DOC"]'` (also `PERSON GROUP PROJECT GOAL PAGE TODO COMMENT LINK GOAL_CHECKIN`), `--within` one entity, `--limit` up to 50 (default 20).
- Archived entities and what's attached to them are left out unless `--includeArchived true`, or you search `--within` them.
- Search before saying the notebook has nothing on a topic, and before creating something that might exist under another name.

## Linking things

- **Owners:** a project or goal's owner is its `ownerType` + `ownerId` (a person or a group). There is no ownership relation.
- **Relations:** `relation.add --fromType --fromId --toType --toId --kind --note` links any two of `PERSON GROUP PROJECT GOAL PAGE DOC NOTE REPORT TODO`. `RELATED` (the default) has no direction, so linking B to A when A is already related to B is a duplicate. `DEPENDS_ON` reads from `from` to `to`: "Checkout depends on the payments API" is from Checkout to the payments API, and the API shows it as "Needed by". For anything else ("uses", "replaces", "applies to"), add `RELATED` and say how in `--note`. `relation.forEntity` shows both directions, grouped by label (for a person, with their relationships to people). Change a note or kind with `relation.update`.
- **Relationships between people:** `personRelation.add --fromId --toId --kind --note`, of the notebook's kinds (`personRelationKind.list`). Each reads one way from `from` and another from `to`: `PARENT_OF` goes from parent to child, and the child shows "Child of"; `LEAD_OF` from lead to report, who shows "Reports to". A kind with no direction (friend, partner, sibling) is one relationship either way. A one-each kind (`LEAD_OF`) replaces the person's old one and returns it as `replaced`; it also refuses a loop. `personRelation.update --id --kind --note`, `personRelation.remove --id`, `personRelation.forPerson --personId`. Ending a relationship deletes it; there's no history.
- **Linking in content:** in a page, doc, note or report, write `[Title](<path>)` using the `path` from a get or create result. Saving the content turns the link into a backlink: the target shows "Mentioned in". Other paths are `/app/people/<id>`, `/app/groups/<id>`, `/app/projects/<id>`, `/app/goals/<id>`, and `/app/wiki/<id>`. Links inside code blocks don't count. Don't add `MENTIONS` with `relation.add`; to remove a backlink, remove the link from the content.

## Write-ups

Reports are switched off for now. When the user asks for a report or write-up, write it as a doc on the person, group, project or goal. A wiki page takes no docs; write into its content instead.

1. Gather the facts first (`person.get`, `note.list`, `todo.forEntity`, and so on). Don't invent numbers; ask for them if they're missing.
2. Write the markdown. Add charts as fenced `chart` blocks; the syntax is in [references/charts.md](references/charts.md). A line of just `<!-- pagebreak -->` starts a new page when the doc is exported to PDF; use it only where the user wants one (say, before an appendix).
3. `remry doc.add --entityType GROUP --entityId <id> --title "Q3 review"`, then `remry doc.update --id <doc> --content-file /tmp/q3.md`.
4. Tell the user where to view it. Call `app_open` (with the doc's `notebook`) so the app is running, then link the doc: the entity's page with `?doc=<doc id>&notebook=<notebook id>`. Its "Export PDF" button makes a PDF with the notebook's branding (Remry Pro).

## Importing from other tools

The notebook is the user's own layer over the shared tools (Linear, Notion, Jira, GitHub, a spreadsheet): the parts that matter to them, plus their own view of it. When the user asks you to bring something in, read it with that tool's MCP tools, then:

1. **Import only what the user touches.** Their team, projects they own or depend on, goals they report on, people they manage or work with. Never mirror a whole workspace or project board. If the user asks for "everything", say how many items that is and ask which ones they care about.
2. **Find it first.** `link.find --url <the item's URL>` returns every entity already carrying that link, however the URL was written. Titles in Linear and Notion URLs change on rename, so when that finds nothing, try `link.find --contains <stable id>`: the issue or project key (`ENG-123`), or the 32-character id at the end of a Notion URL. Then check by name with the usual `list` calls (rule 1).
   - **Found:** update that entity. Don't create another.
   - **Not found:** create it, then `link.add --entityType <type> --entityId <id> --url <url> --title "<Tool>: <key or title>" --synced true`, for example `--title "Linear: ENG-123"`. Every imported entity carries a link to its source.
   - **Found an entity by name, without the link:** it was added by hand. Add the link with `--synced true` once you've updated it.
3. **Map shared facts onto fields.** Name and status (`project.status` is one of `proposed committed in-progress blocked done abandoned`: map the tool's word onto one, e.g. Linear's "In Progress" → `in-progress`, "Backlog" → `proposed`, "Canceled" → `abandoned`), dates, owner (look the owner up; create a person only if the user wants them tracked), parent project, `DEPENDS_ON` relations between items you're importing (only between items already in the notebook), and goal–project links.
4. **Mark it synced.** After updating an entity from its source, `link.markSynced --id <link>` records the time on the source link (`syncedAt`, which `link.list` and `link.find` return). When something changed that the user would want to see later, also add a note: "From Linear: now In progress, due 15 Oct, 6 of 9 issues done." Don't copy the item's description or comments in bulk; summarise only what the user needs, and keep the link for the rest.
5. **The source owns shared facts; the user owns their view.** On a re-sync, update fields to match the source, then mark the link synced. Never edit or remove the user's own notes, todos, relations or judgements ("I don't believe that date"): they're the reason the notebook exists. When the source disagrees with something the user said, tell them rather than choosing.
6. **Check before you state it as current.** When you answer from an imported entity, look at its source link's `syncedAt` (`link.list` for the entity). If it's more than about a week old and the tool is available, re-sync first. If it isn't available, say when the information dates from.

Say what you did by name and source: "Updated the Checkout project from Linear (now In progress, due 15 Oct); added the Payments API project, which it depends on."

## Importing a PDF

The app stores PDFs but can't read them; you do the reading.

1. Read the PDF and convert it to clean markdown, keeping headings, lists and tables.
2. `remry doc.add --entityType PERSON --entityId <id> --title "<title>"`, then `remry doc.update --id <doc> --content-file /tmp/doc.md`
3. To keep the original attached, when you have a shell: `base64 -i file.pdf > /tmp/pdf.b64`, then `remry doc.attachSource --docId <doc> --contentType application/pdf --dataBase64-file /tmp/pdf.b64`

## Remry Pro

A yearly license unlocks three things: full-text search (`search.*`), branding (creating or changing brandings, and the app wearing them), and PDF export of docs and wiki pages. Everything else is free. Without a license, those procedures return an error that says so, and the app shows a Pro notice; nothing stored is lost, and it all comes back with the license. The license belongs to the computer, so it covers every notebook. Never look for, edit or work around the license file.

## Backups

Snapshots are kept on this computer in the `Backups` folder, per notebook. Every notebook that changed is snapshotted hourly while the Remry tools or the app are running, and on macOS also by the LaunchAgent if the user ran `remry backup install`.

- A snapshot covers one notebook: `backup_snapshot` with `notebook`, or `remry backup --force --reason "<why>" --notebook <id>`. Snapshot the notebook you're about to change.
- `backup_list` (with `notebook`), or `remry backup list` for every notebook
- Restore **only when the user asks**, and only from a shell on the user's computer: `remry backup restore <id|latest> --notebook <id>`. The app must be closed. Restore snapshots the current data first, so it can be undone. In Cowork, or without a shell on their computer, give the user the command to run in Terminal: `"$HOME/Library/Application Support/Remry/App/current/remry" backup restore <id|latest> --notebook <id>` on a Mac, or in PowerShell on Windows: `& "$env:LOCALAPPDATA\Remry\App\current\remry.exe" backup restore <id|latest> --notebook <id>`.
