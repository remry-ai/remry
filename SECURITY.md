# Security policy

## Supported versions

Only the latest release gets security fixes. The desktop app checks for updates at launch, and fixes ship as a new release, not as patches to older ones.

| Version | Supported |
|---|---|
| Latest release ([releases](https://github.com/remry-ai/remry/releases/latest)) | Yes |
| Anything older | No: update to the latest |

## Reporting a vulnerability

Email **security@remry.ai**. Please don't open a public GitHub issue for a vulnerability.

Please include:

- what an attacker can do, and what they need first (a website the user visits, a note they import, another process on the computer, a device on their tailnet)
- the steps to reproduce it, and the version (Remry → About, or `remry health.status`)
- your platform (macOS or Windows, and which version)

Don't include real notebook content. A notebook made for the report is enough.

## What to expect

- An acknowledgement within 3 working days.
- An assessment within 10 working days: whether it's confirmed, how severe it is, and the plan.
- For a confirmed issue, a fixed release as soon as it's ready, with the fix described in the release notes. You'll hear before it ships.
- Credit in the release notes if you'd like it.

Please give us a reasonable time to ship a fix before you disclose publicly. We'll agree a date with you, normally within 90 days of the report.

## Scope

In scope: the Remry desktop app, the `remry` CLI and MCP server, the web app it serves, the release and update pipeline, and the Claude plugin in `plugin/`.

Out of scope: Claude, Claude Code, GitHub Copilot CLI, Tailscale and Excalidraw themselves. Report those to their owners. Attacks that need full control of the user's account already are out of scope too.

What the app stores, which network requests it makes and what it listens on are described in [docs/security.md](docs/security.md).
