#!/bin/sh
# List, pick, mute or unmute sound profiles.
#
#   profile.sh            list profiles and mark the active one
#   profile.sh <name>     switch to sounds/<name>/ and play its Stop sound
#   profile.sh mute       silence all sounds
#   profile.sh unmute     turn sounds back on
#
# --data DIR, given first, sets the plugin data directory. The skill uses it
# because the Bash tool doesn't get CLAUDE_PLUGIN_DATA in its environment.

if [ "${1:-}" = --data ]; then
    CLAUDE_PLUGIN_DATA=$2
    shift 2
fi

# shellcheck source=scripts/lib.sh
. "$(dirname "$0")/lib.sh"

events="SessionStart UserPromptSubmit Notification PermissionRequest SubagentStop Stop SessionEnd"

list() {
    active=$(active_profile)
    for d in "$sounds"/*/; do
        [ -d "$d" ] || continue
        name=$(basename "$d")
        have=""
        for e in $events; do
            if find_sound "$name" "$e" >/dev/null; then
                have="$have $e"
            fi
        done
        mark=" "
        [ "$name" = "$active" ] && mark="*"
        printf '%s %s:%s\n' "$mark" "$name" "${have:- (no sounds yet)}"
    done
    if muted; then
        echo "Sounds are muted."
    fi
    if [ -n "${DRBOOM_SOUNDS_PROFILE:-}" ]; then
        echo "DRBOOM_SOUNDS_PROFILE is set, so it picks the profile."
    fi
}

case ${1:-} in
    "")
        list
        ;;
    mute)
        mkdir -p "$data"
        : >"$data/muted"
        echo "Sounds muted."
        ;;
    unmute)
        rm -f "$data/muted"
        echo "Sounds on."
        if [ -n "${DRBOOM_SOUNDS_MUTE:-}" ]; then
            echo "DRBOOM_SOUNDS_MUTE is still set, so sounds stay off until you unset it."
        fi
        ;;
    *)
        if ! valid_name "$1" || [ ! -d "$sounds/$1" ]; then
            echo "No profile named '$1'. Make a folder at sounds/$1/ first." >&2
            list >&2
            exit 1
        fi
        mkdir -p "$data"
        printf '%s\n' "$1" >"$data/profile"
        echo "Switched to $1."
        if [ -n "${DRBOOM_SOUNDS_PROFILE:-}" ]; then
            echo "DRBOOM_SOUNDS_PROFILE is set to $DRBOOM_SOUNDS_PROFILE, so it still wins until you unset it."
        fi
        if file=$(find_sound "$1" Stop); then
            play_file "$file"
        fi
        ;;
esac
