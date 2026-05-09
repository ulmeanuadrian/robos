#!/usr/bin/env node
/**
 * hook-post-tool.js
 *
 * Hook handler for Claude Code's PostToolUse event. Fires after EVERY tool
 * call. Records the call via loop-detector.js; if a loop is detected
 * (N consecutive identical calls), injects a warning into the model's context
 * via additionalContext so the next tool call sees it.
 *
 * Stdin payload from Claude Code:
 *   { session_id: "...", tool_name: "Read", tool_input: {...}, tool_response: {...} }
 *
 * Output (JSON on stdout):
 *   {} (silent, no warning) — exit 0
 *   { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "..." } }
 *
 * NEVER blocks the tool. NEVER throws. Errors → data/hook-errors.ndjson via
 * the shared sink. Exit 0 always (failure of an advisory subsystem must not
 * disrupt the user's work).
 *
 * Disable: ROBOS_LOOP_DETECTOR_DISABLED=1 (handled inside lib).
 */

import { readFileSync } from 'fs';
import { loadEnv } from './lib/env-loader.js';
import { recordCall } from './lib/loop-detector.js';
import { logHookError } from './lib/hook-error-sink.js';

// Load .env BEFORE any process.env reads (Claude Code spawns hooks with clean env)
loadEnv();

const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

async function main() {
  let payload = {};
  try {
    const stdin = readFileSync(0, 'utf-8');
    payload = stdin.trim() ? JSON.parse(stdin) : {};
  } catch {
    // Bad input — silent exit. Better than blocking the user's tool.
    process.exit(0);
  }

  const rawSessionId = payload.session_id;
  const sessionId = (typeof rawSessionId === 'string' && SESSION_ID_RE.test(rawSessionId))
    ? rawSessionId
    : null;
  if (!sessionId) process.exit(0);

  const toolName = typeof payload.tool_name === 'string' ? payload.tool_name : null;
  if (!toolName) process.exit(0);

  const toolInput = payload.tool_input || {};

  let result;
  try {
    result = recordCall(sessionId, toolName, toolInput);
  } catch (e) {
    logHookError('hook-post-tool', e);
    process.exit(0);
  }

  if (!result.warning) {
    process.exit(0);
  }

  const output = {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: result.warning,
    },
  };

  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

main().catch((e) => {
  // Last-resort safety net — never block, never throw.
  logHookError('hook-post-tool', e);
  process.exit(0);
});
