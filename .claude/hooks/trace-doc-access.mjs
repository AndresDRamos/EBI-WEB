#!/usr/bin/env node
// Doc-access telemetry hook (EBI-Web, pieza C).
//
// Registered in .claude/settings.json on two events:
//   PostToolUse  matcher Read|Grep|Glob  -> logs every file/path the agent opens.
//   SubagentStop --subagent-stop          -> writes a phase marker that segments the trace.
//
// Reads the hook payload as JSON on stdin and appends ONE TSV line to
// <cwd>/.claude/traces/<session_id>.tsv. Captures paths only, never file contents.
// Never throws and always exits 0 so it cannot block a tool call. Disable by removing the
// hook from settings.json. Consumed by /trace-map.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const HEADER = 'timestamp\tphase\ttool\ttarget\tis_md\n';
const SUBAGENT_STOP = process.argv.includes('--subagent-stop');

function readStdin() {
  try {
    return readFileSync(0, 'utf8'); // fd 0 = stdin
  } catch {
    return '';
  }
}

// `target` is the thing the agent looked at: the file for Read, the query for Grep/Glob.
function describe(toolName, input = {}) {
  switch (toolName) {
    case 'Read':
      return input.file_path ?? '';
    case 'Glob':
      return input.path ? `${input.pattern} @ ${input.path}` : (input.pattern ?? '');
    case 'Grep': {
      const where = input.glob ?? input.path ?? '';
      return where ? `/${input.pattern}/ @ ${where}` : `/${input.pattern}/`;
    }
    default:
      return '';
  }
}

function main() {
  let payload = {};
  try {
    payload = JSON.parse(readStdin() || '{}');
  } catch {
    payload = {};
  }

  const cwd = payload.cwd || process.cwd();
  const sessionId = payload.session_id || 'unknown';
  const ts = new Date().toISOString();

  const dir = join(cwd, '.claude', 'traces');
  const file = join(dir, `${sessionId}.tsv`);

  let line;
  if (SUBAGENT_STOP) {
    line = `${ts}\t---\tSubagentStop\t--- subagent boundary ---\t\n`;
  } else {
    const tool = payload.tool_name || '';
    const target = describe(tool, payload.tool_input);
    if (!target) return; // nothing useful to record
    const isMd = target.toLowerCase().endsWith('.md') ? 'md' : '';
    line = `${ts}\tmain\t${tool}\t${target}\t${isMd}\n`;
  }

  try {
    mkdirSync(dir, { recursive: true });
    if (!existsSync(file)) appendFileSync(file, HEADER);
    appendFileSync(file, line);
  } catch {
    // telemetry is best-effort; never fail a tool call
  }
}

main();
