<p align="center">
  <img src="docs/images/splash.png" alt="Remry: your mind palace, kept by Claude." width="400">
</p>

# Remry

**Your mind palace, kept by Claude.** Tell Claude who moved teams, what came up in a 1:1, where a
goal stands. Claude files it in a notebook on your own computer, and looks it up when you ask.

Remry is a local, structured notebook that Claude writes to over MCP. It's ready to use: no
templates, no plugins.

> **Get it:** [Mac (Apple silicon)](https://github.com/remry-ai/remry/releases/latest/download/Remry-macos-arm64.dmg) ·
> [Windows](https://github.com/remry-ai/remry/releases/latest/download/Remry-windows-x64-setup.exe),
> then connect Claude with [docs/INSTALL.md](docs/INSTALL.md).
> Remry is free; [Remry Pro](#remry-pro) adds full-text search, branding and PDF export.
> More at [remry.ai](https://remry.ai).

![A tour: telling Claude about a new hire, a note and a todo on her page, a blocked project, the projects timeline and a peek, a goal check-in, a wiki page, and a doc with charts](docs/images/demo.gif)

## You carry a lot in your head

Who reports to whom, which team owns what, where each goal stands, why you chose that vendor, what
you promised after the last 1:1. Your team's tools don't hold your version of it. Remry does.

## How it works

**You talk, Claude files.** Say "Dana moved from Platform to Payments" and Claude makes the change.
No forms, and the app doesn't need to be open.

**It doesn't forget.** It keeps what you said, word for word, and Claude looks it up when you ask.

**It keeps the shape of things.** People have managers, projects have owners, goals have dated
check-ins. So "what depends on the payments API?" gets the same answer every time.

**Nothing leaves your computer.** Your notebooks live in a folder on your Mac or PC. No accounts, no
keys, no sync. The app never calls a language model; Claude works on it from outside.

## What using it looks like

### An org change

> **You:** Dana Park joined as a senior engineer, on Platform, reporting to Priya.

Claude adds Dana, sets her lead and team. For a reorg, edit the org chart by hand.

![The org chart: Alice Johnson's reports, with Dana Park and Tom Reid under Priya Shah](docs/images/org-map.png)

### After a 1:1

> **You:** Note that Dana wants to lead the migration. She'd change the on-call rotation first.
> Remind me to book a 1:1.

Both land in the panel beside Dana's page: the note dated, in your words, and the todo above it.
Months later, "what do I know about Dana?" returns her notes, todos and docs.

![Dana's page: her title, lead and groups, with the todo "Book 1:1 with Dana" and a dated note in the right panel](docs/images/person.png)

### Projects

> **You:** The search rewrite is blocked on the new index. Note it, and remind me to chase Tom.

Each project has a status: proposed, committed, in progress, blocked, done or abandoned. The
projects list puts every project on one timeline, coloured by status, and a peek shows a project in
the side panel without leaving the list.

### Goals with real numbers

> **You:** Platform's H2 goal is p95 latency under 200ms, from 480. We're at 310 now.

Each check-in adds to the history instead of overwriting it. `2026-H2` means July to December, so
the chart shows the pace you need, and a goal that trails it is flagged "Behind pace".

![The goal page: progress against the target and the period, a chart of check-ins against the pace, and the check-in history](docs/images/goal.png)

### A wiki that links up

> **You:** We pay Datadog $40k a year for 40 seats; it renews in March. Platform uses it for
> alerting.

Pages are markdown, or spreadsheets for many records of one shape. A page's details go in a list at
the top. Anything can link to anything, and mentioning a project in a page adds a "Mentioned in"
link to the project.

![The Datadog page: vendor, cost and renewal in a list, with Platform linked to it](docs/images/wiki-page.png)

### Writing up the quarter

> **You:** Write up Platform's quarter as a doc: delivery and reliability, with charts.

Claude builds it from what's already in the notebook. Docs are markdown with charts drawn from
figures you give Claude. Paste or drop images into a doc or wiki page, and export either to PDF
with Remry Pro.

![A doc on the Platform team: a bar chart of committed against delivered story points](docs/images/doc-charts.png)

## The app

In Notion or Obsidian you start on a blank page and build the templates, databases and plugins
yourself. Remry has people, teams, projects, goals and docs built in, already linked. The app is
mostly for reading, in a browser pane beside Claude or as a desktop app.

- **Home:** open todos, recent changes, and a graph of everything linked to one thing.
- **Org:** the org chart, or each owner's projects and goals.
- **Projects:** every project on one timeline, with late stretches in red. Peek at one without
  leaving the list.
- **A page for everything:** each person, project, goal and page gets one: docs in the middle,
  todos and notes in the panel on the right, finished todos under Done.
- **Find anything:** press ⌘K and type a name. With Remry Pro, `/search budget review` searches the
  full text, and `/ask who owns billing?` asks your local Claude and answers with links.
- **Ask about this page:** the side panel's Chat tab asks Claude about the page you're on.

![The home dashboard: open todos and a feed of the latest updates](docs/images/home.png)

Remry sits beside your other tools. Linear and Notion hold the team's version of things; Remry
holds yours. Ask Claude to bring a project in and it copies what matters to you, links back to the
source, and updates the same entry next time.

Work and home are separate notebooks, and nothing links across them. A work notebook knows titles,
leads, teams and goals; a home notebook knows birthdays and who is whose partner, parent or sibling.

Archiving takes a thing out of every list but keeps it and its history. Deleting removes everything
attached to it, so Claude offers to archive first.

## How is this different from…

**…your assistant's own memory?** It decides what to keep and summarises it. Remry keeps what you
said, where you can see it.

**…a memory server, like Basic Memory?** Those store free text. Remry knows what a person, project
and goal are, so it can answer "which goals are behind pace?" instead of searching for the word
"goal".

**…Obsidian, Notion or Apple Notes with an assistant connected?** There you build the structure and
file every page yourself. In Remry the structure is built in, and Claude does the filing.

**…Linear, Notion or Lattice?** Those hold the team's shared version. Remry holds yours, privately,
and links back to them.

## Privacy

- **Local only.** Notebooks are files on your computer, with hourly backups. No cloud sync.
- **No accounts.** Nothing to sign up for or log in to.
- **The app never calls a model.** Claude works on it from outside. The app's only request is the
  desktop app checking GitHub for updates, and it sends nothing about you or your notebooks.
- **Offline license key.** A Pro key is checked on your computer. No license server.

## Getting started

1. **Download the app** for [Mac (Apple silicon)](https://github.com/remry-ai/remry/releases/latest/download/Remry-macos-arm64.dmg)
   or [Windows](https://github.com/remry-ai/remry/releases/latest/download/Remry-windows-x64-setup.exe)
   ([all releases](https://github.com/remry-ai/remry/releases)). It brings everything it needs and
   updates itself.
2. **Connect Claude.** Add the Remry plugin in Cowork's Customize panel, or use the app's Claude
   menu. [docs/INSTALL.md](docs/INSTALL.md) has every route, Claude Code included.
3. **Tell Claude about your team.** Then open Remry and look.

More: [docs/CLI.md](docs/CLI.md) covers the `remry` command and the tools Claude uses;
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) covers running from a clone and how releases work.

## Backups

Remry copies each notebook every hour when something changed, and restoring saves your current
data first, so you can undo it. `remry backup install` keeps the copies running while nothing else
is open. Copies stay on this disk; Time Machine covers them against losing the disk.

## Remry Pro

Remry is free. **Remry Pro** is a yearly license that adds:

- **Full-text search** across notes, docs, wiki pages, todos and comments, and "what do I know
  about X" from Claude.
- **Branding:** your organisation's colours and icon, on screen and in print.
- **PDF export** of docs and wiki pages.

It costs **$40 USD a year** ($50 CAD). That's the founding price, locked in while you renew; it goes
to $60 USD / $80 CAD later. **[Buy Remry Pro →](https://buy.stripe.com/bJefZg54rbNLa0H1sb0Jq01)**

Stripe runs the checkout, sales tax and receipts. Your license key is shown after you pay and
emailed to you; each renewal emails a new one. To activate it, choose **License** from the notebook
menu (the chevron beside the notebook name) and paste the key, or ask Claude to.

- **When a license lapses,** search, branding and PDF export lock. Nothing else changes and no data
  is lost; a renewed key brings it all back.
- **The key is checked offline,** on your computer. Remry never contacts a license server.
- **Refunds:** ask within 30 days of buying. The refunded key stops working with the next update.
- **Lost your key?** Use the [contact form](https://jweatherby.dev/contact) with the email you
  bought it with.

## Status

Remry is made by one person, [jweatherby.dev](https://jweatherby.dev). The code is public, and it
changes often.

The desktop app runs on Apple silicon Macs and Windows (x64). The Windows installer isn't
code-signed yet, so Windows asks before opening it the first time; see
[docs/INSTALL.md](docs/INSTALL.md).

## License

Remry is under the [Functional Source License, Version 1.1, MIT Future License](LICENSE.md)
(FSL-1.1-MIT), copyright 2026 jweatherby.dev. You may use, copy, modify and share it for any
purpose except offering a competing commercial product or service. Each release also becomes
available under the MIT license two years after it's published. Remry Pro keys are separate: the
license above covers the code, and a key unlocks Pro features in the app.
