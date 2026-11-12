# The user's AI assistant — `src/shared/assist/`

The app never calls a model. These features run the user's own AI assistant CLI instead, Claude Code (`claude -p`) or GitHub Copilot CLI (`copilot -p`), only from the web app (never the CLI or MCP: `APP_ONLY` in `cli/api.ts`). The app holds no key and makes no request itself. Don't widen this into other model calls without asking.

| Feature | Procedure | What it may do |
|---|---|---|
| Convert with Claude | `link.convert` | Read tool only: write a doc or wiki page from a file uploaded as a link |
| Re-read | `link.transcribe` | Read tool only: save a file link's text |
| Chat tab | `chat.send` | No tools: discuss the open page (its visible text and the conversation). Saved per entity in `page_chat` until Clear or delete |
| `/ask` | `chat.ask` | No tools: answer from the notebook's search hits, linking them. Nothing saved |
| Sync now | `sync.now` | The most reach, which the user approved: Read, WebFetch, and the MCP servers the user's Claude Code has connected (`claude mcp list`, each allowed by name, never Remry's own), in `dontAsk` mode, with connector tools named for writing denied (`SYNC_DENIED_TOOLS`) and a prompt that says only read |

With Copilot, the same features run under tighter rules: shell and writes denied, GitHub's built-in MCP server off, none of the user's Copilot MCP servers, and a sync may fetch only its own links' hosts (`--allow-url`).

How each works, and the job and polling design: `src/api/CLAUDE.md` § Files.

## Providers

Each CLI is a provider in `providers/` (`LlmProvider`: its arguments per task, whether the prompt goes on stdin or in a private temp file, how to parse the reply), listed in `registry.ts`. Adding one is a provider file plus its registry entry, nothing else.

- **The default is per computer:** `llmProvider` in `settings.json` (`llm-choice.server.ts`). With none chosen and one installed, that one is saved. Otherwise every feature replies `{ started: false, needsChoice: true }` and the browser opens the AI assistant popup (`LlmChoicePopup`, `?popup=choose-llm`), which saves the pick (`llm.setDefault`) and starts the feature again (`withLlmChoice`).
- Without the CLI installed, a feature returns a warning and does nothing (an uploaded file just stays a link).
- `claude-process.server.ts` runs them (`runLlm`): a prompt that can only go in an argument is written to `prompt.md` in a fresh private temp folder and removed after; a `.cmd` runs through `cmd.exe` on Windows. `find-cli.ts` (pure) also looks in Windows' npm and winget folders.
