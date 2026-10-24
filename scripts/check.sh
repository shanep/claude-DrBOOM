#!/bin/sh
# Lint the scripts, validate the JSON, and test profile selection against a
# throwaway plugin root and data directory. Run with: npm run check
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(dirname "$here")

shellcheck "$repo"/scripts/*.sh
for f in "$repo"/.claude-plugin/*.json "$repo"/hooks/hooks.json "$repo"/package.json; do
    jq empty "$f"
done

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/sounds/default" "$tmp/sounds/boom" "$tmp/data"
: >"$tmp/sounds/default/Stop.wav"
: >"$tmp/sounds/default/Notification.mp3"
: >"$tmp/sounds/boom/Stop.aiff"

export CLAUDE_PLUGIN_ROOT="$tmp" CLAUDE_PLUGIN_DATA="$tmp/data" DRBOOM_SOUNDS_DRY_RUN=1
unset DRBOOM_SOUNDS_PROFILE DRBOOM_SOUNDS_MUTE

fail=0
expect() {
    if [ "$2" != "$3" ]; then
        printf 'FAIL %s\n  want: %s\n  got:  %s\n' "$1" "$3" "$2"
        fail=1
    fi
}

expect "default profile" "$(sh "$here/play.sh" Stop)" "play $tmp/sounds/default/Stop.wav"
expect "no file is quiet" "$(sh "$here/play.sh" PermissionRequest)" ""
expect "no event is quiet" "$(sh "$here/play.sh")" ""

sh "$here/profile.sh" boom >/dev/null
expect "saved profile" "$(sh "$here/play.sh" Stop)" "play $tmp/sounds/boom/Stop.aiff"
expect "falls back to default" "$(sh "$here/play.sh" Notification)" "play $tmp/sounds/default/Notification.mp3"
expect "list marks active" "$(sh "$here/profile.sh" | grep boom)" "* boom: Stop"

expect "env wins" "$(DRBOOM_SOUNDS_PROFILE=default sh "$here/play.sh" Stop)" "play $tmp/sounds/default/Stop.wav"
expect "bad env name falls back" "$(DRBOOM_SOUNDS_PROFILE=../x sh "$here/play.sh" Stop)" "play $tmp/sounds/default/Stop.wav"

sh "$here/profile.sh" --data "$tmp/data2" default >/dev/null
expect "--data sets the data dir" "$(cat "$tmp/data2/profile")" "default"

if sh "$here/profile.sh" nope >/dev/null 2>&1; then
    echo "FAIL unknown profile should exit non-zero"
    fail=1
fi
expect "unknown profile keeps old one" "$(cat "$tmp/data/profile")" "boom"

sh "$here/profile.sh" mute >/dev/null
expect "mute" "$(sh "$here/play.sh" Stop)" ""
sh "$here/profile.sh" unmute >/dev/null
expect "unmute" "$(sh "$here/play.sh" Stop)" "play $tmp/sounds/boom/Stop.aiff"
expect "env mute" "$(DRBOOM_SOUNDS_MUTE=1 sh "$here/play.sh" Stop)" ""

git -C "$tmp" init -q -b boom
expect "status line" "$(printf '{"model":{"display_name":"Opus"},"workspace":{"current_dir":"%s"}}' "$tmp" | sh "$here/statusline.sh")" "Dr. BOOM | Opus | $(basename "$tmp") | boom | sounds: boom"
git -C "$tmp" -c user.name=check -c user.email=check@example.com commit -q --allow-empty -m init
git -C "$tmp" worktree add -q -b wt "$tmp/wt"
expect "status line in a worktree" "$(printf '{"workspace":{"current_dir":"%s"}}' "$tmp/wt" | sh "$here/statusline.sh")" "Dr. BOOM | wt | wt | worktree | sounds: boom"
sh "$here/profile.sh" mute >/dev/null
expect "status line muted" "$(printf '{"workspace":{"current_dir":"%s"}}' "$tmp/data" | sh "$here/statusline.sh")" "Dr. BOOM | data | boom | muted"
sh "$here/profile.sh" unmute >/dev/null

mkdir -p "$tmp/plugins/cache/shanep/drboom-sounds/1.0.0/scripts" "$tmp/plugins/data/drboom-sounds-shanep"
cp "$here"/*.sh "$tmp/plugins/cache/shanep/drboom-sounds/1.0.0/scripts/"
echo boom >"$tmp/plugins/data/drboom-sounds-shanep/profile"
expect "installed copy finds its data" "$(echo '{}' | env -u CLAUDE_PLUGIN_ROOT -u CLAUDE_PLUGIN_DATA sh "$tmp/plugins/cache/shanep/drboom-sounds/1.0.0/scripts/statusline.sh" | sed 's/.*| //')" "sounds: boom"

[ "$fail" -eq 0 ] && echo "All checks passed."
exit "$fail"
