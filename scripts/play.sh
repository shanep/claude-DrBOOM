#!/bin/sh
# Play the sound for one Claude Code hook event, for example: play.sh Stop
# Uses the active profile, falls back to default, and stays quiet when there
# is no file. Always exits 0 so a missing sound never breaks a hook.

# shellcheck source=scripts/lib.sh
. "$(dirname "$0")/lib.sh"

event=${1:-}
[ -n "$event" ] || exit 0
muted && exit 0

file=$(find_sound "$(active_profile)" "$event") ||
    file=$(find_sound default "$event") ||
    exit 0
play_file "$file"
exit 0
