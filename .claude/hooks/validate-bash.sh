#!/usr/bin/env bash
# PreToolUse hook for Bash — blocks a small set of destructive patterns already
# forbidden by root CLAUDE.md (never modify .env, no force-pushing shared history,
# no discarding uncommitted work without going through git status first).
# Exit 2 blocks the tool call; stderr becomes the reason shown to the agent.

set -euo pipefail

input="$(cat)"

command="$(node -e '
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      const data = JSON.parse(raw);
      process.stdout.write(data.tool_input && data.tool_input.command ? data.tool_input.command : "");
    } catch {
      process.stdout.write("");
    }
  });
' <<<"$input")"

[ -z "$command" ] && exit 0

block() {
  echo "Blocked by .claude/hooks/validate-bash.sh: $1" >&2
  exit 2
}

if echo "$command" | grep -qE 'git[[:space:]]+push[[:space:]]+.*--force'; then
  block "force-push can overwrite shared/upstream history — confirm with the user and run it manually if truly needed."
fi

if echo "$command" | grep -qE 'git[[:space:]]+(reset[[:space:]]+--hard|clean[[:space:]]+-[a-z]*f)'; then
  block "this discards uncommitted work — run 'git status' first and confirm with the user before using --hard/-f."
fi

if echo "$command" | grep -qE '(^|[;&|[:space:]])rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)[[:space:]]'; then
  block "recursive force-delete — verify the target path with the user before running this."
fi

if echo "$command" | grep -qE '(^|[;&|[:space:]])(echo|cat|printf|tee)[^|]*(>>?|[|][[:space:]]*tee)[[:space:]]*\.env([^.]|$)'; then
  block "direct writes to .env are not allowed — document new variables in .env.example instead (see root CLAUDE.md)."
fi

exit 0
