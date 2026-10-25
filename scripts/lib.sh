# shellcheck shell=sh
# Shared by play.sh and profile.sh so both agree on the active profile and
# mute state. Source it, don't run it.

root=${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
root=${root%/}
# Hooks get CLAUDE_PLUGIN_DATA from Claude Code, and the profile skill passes
# the same path with --data. The status line gets neither, so an installed
# copy at plugins/cache/<marketplace>/<name>/<version> finds its data folder
# at plugins/data/<name>-<marketplace>, the way Claude Code names it.
# Built with parameter expansion, since the status line runs on every refresh.
default_data() {
    name_dir=${root%/*}
    name=${name_dir##*/}
    market_dir=${name_dir%/*}
    cache_dir=${market_dir%/*}
    if [ "${cache_dir##*/}" = cache ]; then
        printf '%s/data/%s-%s\n' "${cache_dir%/*}" "$name" "${market_dir##*/}"
    else
        printf '%s\n' "$HOME/.claude/plugins/data/drboom"
    fi
}
data=${CLAUDE_PLUGIN_DATA:-$(default_data)}
sounds="$root/sounds"

# A profile name is a folder under sounds/, so keep it to one plain path part.
valid_name() {
    case $1 in
        "" | .* | *[!A-Za-z0-9_-]*) return 1 ;;
    esac
    return 0
}

active_profile() {
    if [ -n "${DRBOOM_SOUNDS_PROFILE:-}" ]; then
        printf '%s\n' "$DRBOOM_SOUNDS_PROFILE"
    elif [ -s "$data/profile" ]; then
        IFS= read -r profile <"$data/profile" || true
        printf '%s\n' "$profile"
    else
        echo default
    fi
}

muted() {
    [ -n "${DRBOOM_SOUNDS_MUTE:-}" ] || [ -f "$data/muted" ]
}

# Print the first file in sounds/<profile>/ named <event>.<anything>.
find_sound() {
    valid_name "$1" || return 1
    for f in "$sounds/$1/$2".*; do
        if [ -f "$f" ]; then
            printf '%s\n' "$f"
            return 0
        fi
    done
    return 1
}

# Play in the background so the hook returns right away. DRBOOM_SOUNDS_DRY_RUN
# prints the file instead, which the checks use.
play_file() {
    if [ -n "${DRBOOM_SOUNDS_DRY_RUN:-}" ]; then
        printf 'play %s\n' "$1"
        return 0
    fi
    if [ "$(uname -s)" = Darwin ]; then
        nohup afplay "$1" >/dev/null 2>&1 &
        return 0
    fi
    for p in paplay pw-play aplay; do
        if command -v "$p" >/dev/null 2>&1; then
            nohup "$p" "$1" >/dev/null 2>&1 &
            return 0
        fi
    done
    if command -v ffplay >/dev/null 2>&1; then
        nohup ffplay -nodisp -autoexit -loglevel quiet "$1" >/dev/null 2>&1 &
    fi
    return 0
}
