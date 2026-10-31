// Claude Code (`claude -p`): JSON output, tools named one by one, the prompt on stdin (or, to
// convert a file, as an argument), and the user's connected MCP servers for sync.

import { buildChatArgs, buildClaudeArgs, parseChatOutput, parseClaudeOutput } from '../claude-cli';
import { buildSyncArgs, connectedMcpServers } from '../sync-cli';
import type { LlmProvider } from './provider';

export const claudeProvider: LlmProvider = {
  id: 'claude',
  name: 'Claude',
  product: 'Claude Code CLI',
  binary: 'claude',
  installHint: 'Install Claude Code and sign in.',
  invocation: (task) => {
    if (task.kind === 'convert') return { args: buildClaudeArgs(task.fileName) };
    if (task.kind === 'chat') return { args: buildChatArgs(), stdin: task.prompt };
    return { args: buildSyncArgs(task.servers), stdin: task.prompt };
  },
  parse: (stdout, kind) => (kind === 'convert' ? parseClaudeOutput(stdout) : parseChatOutput(stdout)),
  listServersArgs: ['mcp', 'list'],
  parseServers: connectedMcpServers
};
