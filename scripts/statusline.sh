#!/bin/sh
# Status line: model, folder, git branch, worktree and sound profile. Claude Code pipes
# the session as JSON on stdin. Parsed with sed so it needs nothing extra.

# shellcheck source=scripts/lib.sh
. "$(dirname "$0")/lib.sh"

json=$(cat)

# Print the first string value for "key" in the JSON on stdin.
field() {
    printf '%s' "$json" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n 1
}

model=$(field display_name)
dir=$(field current_dir)
[ -n "$dir" ] || dir=$(pwd)

line="Dr. BOOM"
[ -n "$model" ] && line="$line | $model"
line="$line | $(basename "$dir")"
if branch=$(git -C "$dir" symbolic-ref --short -q HEAD 2>/dev/null); then
    line="$line | $branch"
fi
# A linked worktree keeps its own git dir apart from the repo's shared one.
git_dir=$(git -C "$dir" rev-parse --path-format=absolute --git-dir 2>/dev/null)
common_dir=$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
if [ -n "$git_dir" ] && [ "$git_dir" != "$common_dir" ]; then
    line="$line | worktree"
fi
if muted; then
    line="$line | muted"
else
    line="$line | sounds: $(active_profile)"
fi
printf '%s\n' "$line"
