---
name: remry
description: Read and write the user's local Remry notebooks (separate ones for work, home life and personal projects) — their people and groups (teams, departments, families, friend groups — a group's kind is defined per notebook), reporting lines, friends and family and how they're related, projects and who owns them, goals with targets and check-ins, a wiki of pages and spreadsheets (policies, software, expenses, recipes, places, home things, tax records), relations between any of these, notes, docs (with charts), recurring todos and tags. Use whenever the user talks about the people or teams they work with, friends, family, birthdays, who is whose partner, sibling or parent, bills, subscriptions, recurring expenses, taxes, recipes, places to visit, things around the house, personal projects, 1:1s, who reports to whom, org changes ("X moved to team Y", "Z is now X's manager"), projects, goals, OKRs, targets or progress ("we're at 80%", "that goal is at risk"), policies, products, the software or vendors they use, decisions, wiki pages, links between things ("link X to Y", "X depends on Y", "team X uses Y"), follow-ups or reminders about their work, asks you to "remember", "note", "log" or "track" something about their org, wants a report or write-up about a person, team, project or goal, wants a PDF imported into their notes, or wants projects, issues, pages or people from Linear, Notion, Jira, GitHub or another tool brought into their notes.
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
- To start or open the app, call `app_open`; it starts the app on the Mac. Never try to start it any other way.
- The tools may be deferred: if `notebook_list` isn't listed, search for "remry" with your tool-search tool before deciding they're missing.
- If the Remry tools (`notebook_list`, `person_list` and so on) still aren't in this session, stop and tell the user. They need the current Remry plugin installed, and the Cowork session started on their Mac, not in the cloud, with the Claude desktop app open. Local MCP servers don't run in cloud sessions.

**The `remry` CLI**, only in a shell on the user's own Mac (for example Claude Code), not in a sandbox:

```bash
remry help                    # every procedure
remry help person.create      # one procedure's inputs, types and limits
remry person.list
remry person.create --name "Dana Park" --extensions '{"org":{"title":"Senior Engineer"}}'
```

- If the shell says `remry: command not found`, use the first of these that exists, wherever this skill says `remry`:
  - the desktop app's copy: `"$HOME/Library/Application Support/Remry/App/current/remry"` (on Windows, `"$env:LOCALAPPDATA\Remry\App\current\remry.exe"`)
  - a clone set up with `bun run setup`: `"$(cat "$HOME/Library/Application Support/Remry/app-path")/bin/remry"` (on Linux, `"$(cat "${XDG_DATA_HOME:-$HOME/.local/share}/remry/app-path")/bin/remry"`)
- If neither the tools nor `remry` work, or they say Remry isn't set up, tell the user what you saw and stop. Setup is theirs to do: install the Remry desktop app from https://github.com/remry-ai/remry/releases/latest and open it once. Don't look for the data folder yourself.
- stdout is JSON. Most calls return `{"ok": true, "value": ...}` or `{"ok": false, "error": {"message": ...}}`. Exit code 1 means failure; read the message and fix the call.
- Values are typed by each procedure's schema: `--priority 2` is a number, `--title 2024` stays a string, and `null` clears a field (`--email null`, or `{"org":{"title":null}}` in `--extensions`).
- The MCP tools' results leave out fields that are empty (null or an empty list), so a missing field is empty. `remry`'s JSON keeps them.
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
- `notebook.create --name "Garden"` makes a notebook; its id comes from the name, or pass `--id`. Add `--profile home` for home life. A work notebook starts with the group kinds TEAM and DEPARTMENT, a home one with FAMILY and FRIENDS. `notebook.setProfile --id <id> --profile home` changes it, only when the user asks. `notebook.setDefault --id <id>` changes the default for every later call, so do it only when the user asks. There is no delete: the user removes a notebook themselves.

## Rules

1. **Look before you write**, in the notebook you're writing to. Find ids with `person.list`, `group.list` (`--kind TEAM`), `project.list`, `goal.list` and `page.list`, or `search.query` when you only know roughly what it's called. Match names and titles case-insensitively. Never create a second goal or page with a title that already exists (`goal.list` leaves out done and dropped goals, so check with `--closed include`). `person.create`, `group.create` and `project.create` refuse a name already in use (archived ones too) and name the one that exists: update that one instead. Pass `allowDuplicate: true` only when the user confirms it's a different person or thing with the same name.
2. **Ask when it's ambiguous.** For example, two people match "Sam", or it's unclear which project a note belongs to.
3. **Confirm before deleting anything**, and say exactly what will be removed. When someone leaves, or a group, project, goal or page is finished, offer to **archive** it instead: archiving keeps its history, and deleting removes everything attached to it.
4. **Snapshot before bulk or destructive changes.** That means any delete, or more than about five writes in one go:
   `backup_snapshot` with a reason like "before <what>", or `remry backup --force --reason "before <what>"`
5. **Report back by name.** Say "Added Dana Park to Platform, reporting to Alice Johnson", not ids.
6. **Keep the user's words.** A note records what they said. Don't embellish or summarise it unless asked.
7. **Leave out archived items and finished todos** unless the user asks for them ("archived", "old", "everything", "what did I finish", "including done"). Lists and search already skip archived entities; don't pass `--archived only|include` or `--includeArchived true` on your own. `todo.list`, `todo.forEntity` and an entity's `get` also return `COMPLETE` and `CANCELLED` todos: drop them from what you show, count or summarise (or pass `todo.list --status ACTIVE` / `PENDING`). Don't mention an archived entity that a `get`, a relation or a mention turns up, unless it answers the question. When leaving things out changes the answer ("no open todos"), say so in a few words, so the user knows they can ask for the rest.
8. **Link everything you created or changed.** End every reply that wrote something with a markdown link to each item, by name, so the user can open it: `[Dana Park](<app address>/app/people/<id>?notebook=<notebook id>&open=app)`. See **Links to what you changed** below.

## Links to what you changed

After any write (create, update, add, attach, check-in, archive), list what changed at the end of your reply, one link per item. Don't link deleted items; name them.

- **Use the `url` in the result.** The item a get, create or update returns comes back with a `url` beside its `path`: the full link, with the notebook and `open=app` already in it. Give the user that, unchanged. Rows of a list and items nested in a result have only their `path`.
- **Otherwise, build it** the same way: the app's address from `app_open` (its scheme, host and port, for example `http://127.0.0.1:7369`) + the item's path + `?notebook=<notebook id>&open=app` (`&` instead of the first `?` when the path already has a query). `open=app` shows the item in the Remry desktop app's window when it's installed, and in the browser otherwise. Always add the notebook, so the link opens in the right one. The links work only while the app is running: call `app_open` once (with the notebook) if you haven't this session, and use the address it returns.
- **Paths,** when an item has no `url`: `/app/people/<id>`, `/app/groups/<id>`, `/app/projects/<id>`, `/app/goals/<id>`, `/app/wiki/<id>`.
- **Things attached to an entity** link to that entity's page: a note, tag, link, relation, group membership or goal check-in. A doc opens with `?doc=<doc id>` on its entity's path. A todo opens with `/app/todos?popup=todo&todo=<todo id>`.
- **Several changes to one item** are one link. For more than about ten items, link the ten that matter most and say how many more there are.

```markdown
Added to Work:
- [Dana Park](http://127.0.0.1:7369/app/people/abc123?notebook=work&open=app), on [Platform](http://127.0.0.1:7369/app/groups/def456?notebook=work&open=app)
- Todo: [Book 1:1 with Dana](http://127.0.0.1:7369/app/todos?popup=todo&todo=ghi789&notebook=work&open=app)
```

## Showing todos

Whenever you list todos in chat (what's due, a person's open todos, the result of `todo.list`), show them as an interactive widget the user can update, if this session can show one inline (the `show_widget` tool in Claude desktop Chat and Cowork; follow that tool's own setup first).

- Build it from the template in [references/todo-widget.md](references/todo-widget.md), filled with the todos, their app links and the notebook id. Keep your explanation in the reply, not in the widget.
- The user ticks todos done, moves dates and changes priorities, then presses **Save changes**. That sends you a message listing each change by todo id. Make each one with `todo_update` (`status`, `targetDate`, `priority`; `null` clears the date), without listing the todos again first. Then reply with the links, as for any write. Completing a recurring todo returns `nextId`: say when the next one is due.
- For one or two todos, or without a widget tool (Claude Code in a terminal, say), list them in markdown with their links instead.

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
| "Dana left the company" | Ask whether to archive or delete; archiving keeps their notes and history. `entity.archive --entityType PERSON --id <dana>` (first move or close anything that must change: archived people are read-only) |
| "The Q4 migration is finished, archive it" | `project.update --id <project> --status done` first if the status should change, then `entity.archive --entityType PROJECT --id <project>` |
| "What did we archive?" / "Show old projects" | `project.list --archived only` (also `person`, `group`, `goal`, `page`); `--archived include` lists both |
| "Dana is in Engineering" | `group.addMember --groupId <engineering> --personId <dana>`. DEPARTMENT is an exclusive kind (one per person), so this moves her out of her old department; the result's `replaced` names it |
| "Note that Dana wants to lead the migration" | `note.add --entityType PERSON --entityId <dana> --content "..."` |
| "Remind me to book a 1:1 with Dana" | `todo.create --title "Book 1:1 with Dana" --entityType PERSON --entityId <dana>` (optional `--priority 0-3`, `--targetDate 2026-10-01`) |
| "That's done" | `todo.update --id <todo> --status COMPLETE` |
| "Start a project for the Q4 migration" | `project.create --name "Q4 migration" --status in-progress` (optional `--parentId`, `--startDate`, `--daysLikely`) |
| "Tag Dana as high-potential" | `tag.list`, then `tag.create --name high-potential` if it's missing, then `tag.attach --tagId <tag> --entityType PERSON --entityId <dana>` |
| "What do I know about Dana?" / "Catch me up on the Q4 migration" | `search.recall --entityType PERSON --entityId <dana>`: the entity, its notes, open todos, docs (with excerpts), links, tags, relations, owned goals and projects, and `unlinkedMentions` (notes and docs elsewhere that name Dana without linking her). Lists are capped at 10 (`--limit` up to 50) and flagged `truncated`; `doc.get` reads a whole doc |
| "Track the Checkout PRD in Notion" / "Link this doc to Checkout" | Read it, `link.add --entityType PROJECT --entityId <checkout> --url <url> --title "Notion: Checkout PRD" --synced true`, and a note summarising it. See **Tracked docs** |
| "Make a Checkout brief from the PRD, the Linear project and the pricing sheet" | Read each, `doc.add` a "Checkout brief" on the project, link each source to the doc with `--synced true`, then `doc.update --prompt "<what to take from each>" --content-file <the write-up, with ## Discrepancies>` and mark each synced. See **Sync docs** |
| "What's new on Checkout?" | `search.recall` for the project, check each tracked doc for edits since its `syncedAt`, add a note for each that changed, then answer with what's new first. See **Tracked docs** |
| "Move the Checkout brief to the Payments project" | `doc_update --id <doc> --entityType PROJECT --entityId <payments>`. The doc keeps its id, images, sources, prompt, notes and PDF. Never move a doc by copying it into a new doc and deleting the old one |
| "Turn this doc into a wiki page" | `page_create --title "<title>" --content <the doc's content>` (its images are copied to the page), check the page, then confirm and delete the doc |
| "Put this screenshot in the Checkout brief" (an image in the chat) | Shrink it, `doc_uploadImage --docId <brief> --dataBase64 <base64>`, put the returned `markdown` where it belongs and `doc_update` the content. See **Files from the chat** |
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
| "Netflix is $15.49 a month, on autopay" | Records like this live as rows of a spreadsheet page (see **Records and spreadsheets**). `page.list` for one that fits ("Subscriptions", "Expenses"); add a row to it (`page.get`, then `page.update --content` with the whole sheet), or propose one: `page.create --title Subscriptions --bodyType sheet` with columns Item, Amount, Frequency, Autopay and a total row |
| "What do I spend a month on subscriptions?" | `page.get` the sheet and add up the monthly rows yourself (its `values` are what each cell showed, totals included); give the total and the items, and link the page |
| "Save this recipe" (a URL or text) | `page.create --title "<dish>" --content-file recipe.md`: a details list at the top (`- **Serves:** 4`, time, cuisine, source), then the ingredients and method. Put it under a "Recipes" page with `--parentId` if the user keeps one |
| "Remind me to renew the car insurance every March" | `todo.create --title "Renew car insurance" --entityType PAGE --entityId <the insurance page> --targetDate 2027-03-01 --recurrence YEARLY`. Completing it adds next year's (`WEEKLY MONTHLY QUARTERLY YEARLY`) |
| "Add the expense policy, version 2, effective 1 October" | `page.list`, then `page.create --title "Expense policy" --content-file policy.md`, a plain page with the version and date in a details list at the top of its content |
| "Make a budget spreadsheet" / "put this table in a sheet" | `page.create --title "Budget 2027" --bodyType sheet --content '{"columns":[{"title":"Item"},{"title":"Monthly"}],"data":[["Rent","1200"],["Food","400"],["Total","=SUM(B1:B2)"]]}'`. A spreadsheet page is a grid the user edits in the app, for a table or a set of records (see **Records and spreadsheets**) |
| "We pay Datadog $40k a year; it renews in March" | `page.create --title Datadog --content` with a details list at the top (`- **Vendor:** Datadog`, `- **Annual cost:** $40,000`, `- **Renews:** 1 Mar 2027`), and a todo for the renewal. If they track several tools, offer a "Software" spreadsheet page with a row each instead |
| "Platform uses Datadog for alerting" | `relation.add --fromType GROUP --fromId <platform> --toType PAGE --toId <datadog> --note "Uses it for alerting"` (kind defaults to `RELATED`) |
| "Pull my Linear project into my notes" / "Track this Notion page" | Follow **Importing from other tools** below: `link.find --url <url>` first, and update what it finds instead of creating a second one |
| "Checkout can't ship until the payments API is done" | `relation.add --fromType PROJECT --fromId <checkout> --toType PROJECT --toId <payments api> --kind DEPENDS_ON` |

## Records and spreadsheets

Wiki pages have no kinds or fields: a page is a document or a spreadsheet. Pick by what the user keeps:

- **One thing with details** (a tool, a policy, a place, a recipe): a document page whose text starts with a short details list, `- **Label:** value` per line, then everything else. Pages from before 0.16.42 had their fields written into their text this way.
- **Many things of the same shape** (expenses, subscriptions, contacts, a reading list): one spreadsheet page with a row each and a column per detail (`--bodyType sheet`; the content is `{"columns":[{"title":"…"}],"data":[["…"]]}`, and a cell starting with `=` is a formula, like `=SUM(B1:B9)`). Find an existing sheet before starting a new one, and keep one sheet per kind of record. To add or change rows, `page.get` the sheet, edit `data`, and `page.update --content` with the whole sheet.
- **Answering "how much" or "which"**: read the sheet (`values` are what each cell showed, totals included) and work it out; don't make a page per row just to count them.

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

## Where things go on a project

A project page shows four kinds of text. Give each one its own job, so the user finds things in one place:

- **Description (the Brief):** what the project is and why, in 3–5 lines. It changes rarely. Rewrite it when the scope changes; never append updates to it. If it's grown past a few lines, move the detail into a doc and shorten the brief.
- **Notes (the log):** status updates, decisions, what someone said, what changed. One note per event, dated by when it's added. "We slipped a week", "Dana approved the budget", "the vendor said no" are notes.
- **Docs (reference):** things to read or look up: specs, plans, briefs written from sources (sync docs), imported PDFs, write-ups. Not for updates.
- **Sub-projects:** only when a piece has its own owner, its own dates or its own status worth tracking. Smaller steps are todos on the project.

The same goes for groups and goals: a short description, notes for what happens, docs for reference.

## Write-ups

Reports are switched off for now. When the user asks for a report or write-up, write it as a doc on the person, group, project or goal. A wiki page takes no docs; write into its content instead.

1. Gather the facts first (`person.get`, `note.list`, `todo.forEntity`, and so on). Don't invent numbers; ask for them if they're missing.
2. Write the markdown. Add charts as fenced `chart` blocks; the syntax is in [references/charts.md](references/charts.md). A horizontal rule (`---` on its own line, with a blank line above it) starts a new page when the doc is exported to PDF, and isn't drawn; so use `---` only where the user wants a new page (say, before an appendix), not as a decorative divider.
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
6. **Check before you state it as current.** When you answer from an entity with tracked sources, check them first: see **Tracked docs** below.

Say what you did by name and source: "Updated the Checkout project from Linear (now In progress, due 15 Oct); added the Payments API project, which it depends on."

## Tracked docs

A project (or any entity) can track outside docs: a spec in Notion, a plan in Google Docs, a Linear project, a Confluence page. A tracked doc is a link with a `syncedAt`; a plain link (a dashboard, a reference) has none and is never checked.

**Tracking one.** "Link this Notion doc to Checkout", "Keep an eye on the PRD for Checkout":
1. Read the doc with its tool's MCP tools. `link.find --url <url>` first: if it's already linked here, it's already tracked.
2. `link.add --entityType PROJECT --entityId <id> --url <url> --title "<Tool>: <doc title>" --synced true`.
3. Add a note with a short summary of what the doc says that matters to the project (decisions, dates, open questions), starting "From <Tool>: <doc title>". That note is the baseline the next check compares against.

**Checking them, whenever you answer about the entity.** Before you answer a question about a project (its status, "catch me up", a search that lands on it, a report or summary you write about it), check its tracked docs:
1. Get them: `search.recall` returns its `links` with `syncedAt`, and `docSources`, the links on its docs, each with its `docId` (without Pro: `link.list` for the entity and for each doc). Only links with a `syncedAt` count, except on a sync doc (below), where a link without one is a source the user added by hand.
2. For each, ask its tool when the doc was last edited (Notion's `last_edited_time`, Google Drive's `modifiedTime`, Linear's `updatedAt`, Confluence's version date). Fetch metadata first; read the content only when it changed.
3. **Edited after `syncedAt`:** read it, work out what's new since the last "From <Tool>" note on the entity (use the tool's history or comments when it has them), and add a note: "From Notion: Checkout PRD, updated 18 Oct: launch moved to 12 Nov; card-on-file dropped from v1." If the doc is the entity's source (an imported Linear project), also update the fields (see **Importing from other tools**). Then `link.markSynced --id <link>`.
4. **Not edited since:** `link.markSynced --id <link>`, so the app shows it as checked. Add no note.
5. **Tool not available, or the doc can't be read:** don't guess. Answer from the notebook and say how old it is ("the PRD was last checked 3 weeks ago").

Then answer, leading with what's new: "Two updates since you last looked: the PRD moved launch to 12 Nov, and the Linear project is now In progress." Keep the summary to what changed; link the doc for the rest. Never copy a doc in bulk, and never change the user's own notes or todos because a doc disagrees: tell them instead.

Keep it proportionate: check the docs of the entities your answer is about, not every entity a search touches. If that's more than about five docs, check the ones that matter most and offer to check the rest. Don't re-check a doc you checked earlier in the same conversation.

## Sync docs

The user can ask for one write-up drawn from several sources, with where they disagree flagged: "Make a Checkout brief from the PRD, the Linear project and the pricing sheet", "Pull the pricing from these three docs into the vendor page". A write-up like this is a **sync doc**: a doc or wiki page with a **prompt**, kept in sync with its sources. The app shows it under a "Sync" banner, with the prompt and the sources, so it's never mistaken for something the user wrote.

**The prompt is the recipe.** It says what to take from each source and what to watch for, in the user's terms: "PRD: scope and launch plan. Linear: status and dates. Pricing sheet: the tiers only. Flag any disagreement on dates or scope." Write it from what the user asked; ask when it's unclear which parts of a source they want. It's stored on the doc or page (`--prompt`, up to 2000 characters), so every later refresh, in any session, pulls the same parts. The user can edit it in the banner. `search.recall` returns each doc's `prompt`; `page.get` returns a page's.

| Sync doc on | The write-up | Prompt and sources on | Also compare against the sources |
|---|---|---|---|
| A project | A doc on the project, titled "<Project> brief" unless the user names it (not the description, which they edit by hand) | The doc: `doc.update --prompt`, `link.add --entityType DOC` | The project's status, start and target dates, owner and estimates |
| A wiki page | The page's content | The page: `page.update --prompt`, `link.add --entityType PAGE` | The details list at the top of its text (an amount, a date, a renewal) |
| A doc | The doc's content | The doc | Nothing else |

**Writing it:**
1. Read every source with its tool. Link each to the doc or page: `link.add --entityType DOC|PAGE --entityId <id> --url <url> --title "<Tool>: <title>" --synced true`, after `link.find --url` (rule 2 of importing).
2. Take from each source only what the prompt asks for. Write it as one view, organised by topic (goal, scope, timeline, open questions), not source by source. Say where each point comes from, inline: "Launch is 12 Nov (PRD; Linear agrees)". Link the sources for the rest.
3. End with `## Discrepancies`: each place the sources disagree with each other, with the notebook's fields, or with the user's own notes, on what the prompt covers. Quote each side with its source and date: "**Launch date.** PRD (edited 18 Oct): 12 Nov. Linear (updated 15 Oct): 30 Oct. Project's target date: 30 Oct." Don't pick a winner; say which looks newer if that's clear. With none, write "None found." so the user knows you checked.
4. Save the prompt and the text in one call (`doc.update --id <id> --prompt "<prompt>" --content-file <file>`, or `page.update`), then `link.markSynced` each source, so it reads as current from then on.
5. Never change a field the user set because a source disagrees: list it in Discrepancies and ask ("Linear says 30 Oct; update the project's target date?"). The exception is an entity imported from that source, whose shared facts the source owns (see **Importing from other tools**).
6. Reply with the headline points and the discrepancies, then the link.

**Started in the app.** "Make sync doc" (under a doc's title) and "Make sync page" (on the line of links above a wiki page's content) let the user write the prompt and add sources themselves; the app writes nothing. So a doc or page with a `prompt` and no text, or with sources that aren't synced yet, is waiting for you. When the user asks about it, asks you to write or update it, or you come across it (in `search.recall`, `doc.list`, `page.get`), write it as under **Writing it** below, from its prompt and the sources already linked, and ask for any source the prompt names that isn't linked.

**Sources added in the app.** The user can add a link to a doc's or sync page's sources with "Add link", or upload a file there (a link whose `url` starts `storage://`, titled with the file's name; read it with `link.read --id`, which gives a text file's text or an image or PDF to look at); it has no `syncedAt` and shows "not synced yet". On a sync doc, treat it as a new source: read it, and if the prompt doesn't say what to take from it, ask, then add that to the prompt. Fold it into the write-up (a rewrite, under the rules below), then `link.markSynced` it. On an ordinary doc, it's a reference: mention it if it's relevant, and offer to make it a sync doc when the user seems to want its content pulled in.

**Refreshing it.** Run **Tracked docs** over its sources whenever you answer about the sync doc or what it's on, and read the prompt first: a change outside what it covers doesn't count, unless it contradicts something the write-up says. When a covered part changed:
- If the doc or page hasn't been edited since its sources were last synced (its `updatedAt` is no later than the newest `syncedAt` among them), rewrite it from all its sources, following the prompt, Discrepancies included.
- If it has (the user edited the text or the prompt), don't overwrite it. Add a note with what's new and which discrepancies appeared or went away, and ask whether to rewrite it from the prompt.
- Either way, tell the user what changed: "Since the last brief: the PRD moved launch to 12 Nov, so the launch-date discrepancy with Linear is new; the pricing sheet now matches the PRD on tiers, so that one's resolved."
Then `link.markSynced` each source you checked.

**Changing what it covers.** "Also pull the risks from the PRD" or "drop the pricing sheet": update the prompt (and add or remove the link), then rewrite. `--prompt null` turns a sync doc back into an ordinary doc or page; its text stays.

## Importing a PDF

The app stores PDFs but can't read them; you do the reading.

1. Read the PDF and convert it to clean markdown, keeping headings, lists and tables.
2. `remry doc.add --entityType PERSON --entityId <id> --title "<title>"`, then `remry doc.update --id <doc> --content-file /tmp/doc.md`
3. To keep the original attached: with a shell on the user's Mac, `base64 -i file.pdf > /tmp/pdf.b64`, then `remry doc.attachSource --docId <doc> --dataBase64-file /tmp/pdf.b64`; from a sandbox, `doc_attachSource` only for a small file (**Files from the chat**).

## Files from the chat

When the user shares a file in the chat and wants it in the notebook, add it yourself; don't send them to the app to do it. The app stores two kinds of file, images and a doc's source PDF; everything else goes in as text you write.

| The file | What to do |
|---|---|
| An image (PNG, JPEG, GIF, WebP; a screenshot, photo, whiteboard) | `doc_uploadImage --docId` or `page_uploadImage --pageId`. It returns `markdown` (`![](storage://<key>)`): put it where the image belongs, with a short alt text (`![Q3 roadmap whiteboard](storage://…)`), and save the text in the same turn (`doc_update --content`, `page_update --content`). An uploaded image the text doesn't show is tidied away on the next save. Text that shows another doc's or page's images (`storage://docs/<id>/…`) gets its own copies when saved, so deleting the other one later can't lose them |
| A PDF | Read it and write its markdown into a doc (**Importing a PDF**). Attaching the original (`doc_attachSource --docId`) is optional, and from a sandbox only when it's small (below) |
| Markdown, text, a Word doc, a web page | Read it and write it as a doc's or page's content, as markdown |
| A spreadsheet or CSV | A markdown table in a doc or page; or, when each row is a record (expenses, contacts), a spreadsheet page with a row each (**Records and spreadsheets**). Ask which when it isn't clear |
| Anything else (audio, video, an archive) | The app can't store it. Say so, and offer to note what it is and link to where it lives |

The upload tools take the file's bytes as base64 (`dataBase64`; a `data:` URL is fine). The bytes decide the type, and anything else is refused with what to do. An error saying it isn't valid base64, or isn't an image or a PDF, means the text was cut or altered: encode it again.

**In Cowork (or any sandbox), the base64 goes through the tool call as text you write**, so the file has to be small: every character costs time and output.
1. Find the file. One the user attached is a file in your sandbox (look in the uploads folder). An image pasted into the message may exist only as a picture you can see; then ask them to attach it as a file.
2. Shrink an image there, keeping it legible: longest side 1400px (1000px for a photo), saved as WebP at quality 70, or JPEG at quality 75 if WebP isn't available. Aim for 50 KB or less and stop at 150 KB: step the size and quality down until it fits. For example, with Python and Pillow:
   ```python
   from PIL import Image
   im = Image.open(src); im.thumbnail((1400, 1400)); im.convert("RGB").save("/tmp/up.webp", "WEBP", quality=70)
   ```
   A PDF can't be shrunk the same way: attach it only when it's 150 KB or less. Otherwise import its text, skip the original, and say that "+ Add link" under the doc's title in the app, then "or upload a file", adds it.
3. `base64 -w0 <file>` (or Python's `base64.b64encode`) and pass the whole output as `dataBase64`, unchanged and in one piece.
4. Say what you reduced or left out ("added at 1400px; the original is larger", "the PDF's text is in the doc; attach the original in the app").

**In Claude Code on the user's Mac**, use the CLI, which reads the file itself, so size doesn't matter: `base64 -i shot.png > /tmp/shot.b64`, then `remry doc.uploadImage --docId <doc> --dataBase64-file /tmp/shot.b64` (`page.uploadImage --pageId`, or `doc.attachSource` for a PDF).

**In Claude desktop Chat**, with no sandbox, you can read a file but can't send its bytes: write its text into the notebook as usual, and say that an image or the original PDF can be dragged in or attached in the app.

## Remry Pro

A yearly license unlocks three things: full-text search (`search.*`), branding (creating or changing brandings, and the app wearing them), and PDF export of docs and wiki pages. Everything else is free. Without a license, those procedures return an error that says so, and the app shows a Pro notice; nothing stored is lost, and it all comes back with the license. The license belongs to the computer, so it covers every notebook. Never look for, edit or work around the license file.

## Backups

Snapshots are kept on this computer in the `Backups` folder, per notebook. Every notebook that changed is snapshotted hourly while the Remry tools or the app are running, and on macOS also by the LaunchAgent if the user ran `remry backup install`.

- A snapshot covers one notebook: `backup_snapshot` with `notebook`, or `remry backup --force --reason "<why>" --notebook <id>`. Snapshot the notebook you're about to change.
- `backup_list` (with `notebook`), or `remry backup list` for every notebook
- Restore **only when the user asks**, and only from a shell on the user's computer: `remry backup restore <id|latest> --notebook <id>`. The app must be closed. Restore snapshots the current data first, so it can be undone. In Cowork, or without a shell on their computer, give the user the command to run in Terminal: `"$HOME/Library/Application Support/Remry/App/current/remry" backup restore <id|latest> --notebook <id>` on a Mac, or in PowerShell on Windows: `& "$env:LOCALAPPDATA\Remry\App\current\remry.exe" backup restore <id|latest> --notebook <id>`.
