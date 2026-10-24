#!/bin/sh
# Status line: model, folder, git branch, worktree, sessions in the same repo
# and sound profile. Claude Code pipes the session as JSON on stdin. Parsed
# with sed so it needs nothing extra. It runs on every refresh, so it sticks to
# shell built-ins and starts only git and two seds.

# shellcheck source=scripts/lib.sh
. "$(dirname "$0")/lib.sh"

json=$(cat)

# The first model name and folder in the JSON, one per line as m<name> and
# d<folder>.
model=
dir=
fields=$(printf '%s\n' "$json" | sed -n \
    -e 'h' \
    -e 's/.*"display_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/m\1/p' \
    -e 'g' \
    -e 's/.*"current_dir"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/d\1/p')
while IFS= read -r f; do
    case $f in
        m*) [ -n "$model" ] || model=${f#m} ;;
        d*) [ -n "$dir" ] || dir=${f#d} ;;
    esac
done <<EOF
$fields
EOF
dir=$(cd "${dir:-.}" 2>/dev/null && pwd -P) || dir=$(pwd -P)

line="Dr. BOOM"
[ -n "$model" ] && line="$line | model: $model"
folder=${dir##*/}
line="$line | folder: ${folder:-/}"

# One git call lists every worktree of the repo, the main one first, with its
# branch. The folder belongs to the worktree with the longest matching path.
worktrees=$(git -C "$dir" worktree list --porcelain 2>/dev/null)
paths=
here=
branch=
main=
while IFS= read -r l; do
    case $l in
        "worktree "*)
            path=${l#worktree }
            paths="$paths$path
"
            [ -n "$main" ] || main=$path
            current=
            case $dir/ in
                "$path"/*)
                    if [ ${#path} -gt ${#here} ]; then
                        here=$path
                        branch=
                        current=1
                    fi
                    ;;
            esac
            ;;
        "branch refs/heads/"*) [ -z "$current" ] || branch=${l#branch refs/heads/} ;;
    esac
done <<EOF
$worktrees
EOF
[ -n "$branch" ] && line="$line | branch: $branch"
[ -n "$here" ] && [ "$here" != "$main" ] && line="$line | worktree: ${here##*/}"

# Count the live sessions whose folder is in one of the repo's worktrees, this
# one included. Claude Code keeps one sessions/<pid>.json per running session
# with its cwd. Outside a session nothing matches, so the field stays off.
if [ -n "$here" ]; then
    set --
    for f in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/sessions/*.json; do
        pid=${f##*/}
        kill -0 "${pid%.json}" 2>/dev/null && set -- "$@" "$f"
    done
    count=0
    if [ $# -gt 0 ]; then
        cwds=$(sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$@")
        while IFS= read -r cwd; do
            [ -n "$cwd" ] || continue
            while IFS= read -r path; do
                [ -n "$path" ] || continue
                case $cwd/ in
                    "$path"/*)
                        count=$((count + 1))
                        break
                        ;;
                esac
            done <<EOF
$paths
EOF
        done <<EOF
$cwds
EOF
    fi
    [ "$count" -gt 0 ] && line="$line | sessions: $count"
fi
if muted; then
    line="$line | sounds: muted"
else
    line="$line | sounds: $(active_profile)"
fi
printf '%s\n' "$line"
