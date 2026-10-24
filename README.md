# Dr. BOOM Sounds

A Claude Code plugin that plays your own sound files when a session starts
or ends, when you send a prompt, when Claude finishes a reply or a subagent,
needs your attention, or asks for permission. Sounds are grouped into
profiles so you can switch the whole set with one command.

Works on macOS (`afplay`) and Linux (`paplay`, `pw-play`, `aplay` or `ffplay`,
whichever it finds first).

## Install

```
/plugin marketplace add shanep/claude-plugins
/plugin install drboom-sounds@shanep
```

To try a local checkout without installing it:

```
claude --plugin-dir ~/repos/claude-DrBOOM
```

## Adding sounds

Each profile is a folder under `sounds/`, and each file is named after the
event it plays on. The extension can be anything your player understands.
Leave out any event you don't want a sound for.

```
sounds/
  default/
    SessionStart.wav       A session starts or resumes
    UserPromptSubmit.wav   You sent a prompt
    Notification.wav       Claude needs your attention
    PermissionRequest.wav  A tool call is waiting for your approval
    SubagentStop.wav       A subagent finished
    Stop.wav               Claude finished responding
    SessionEnd.wav         The session exits
  boom/
    Stop.mp3
```

If the active profile is missing a file, the plugin plays the one from
`default` instead. If `default` doesn't have it either, it stays quiet.

## Switching profiles

```
/drboom-sounds:profile          list profiles, * marks the active one
/drboom-sounds:profile boom     switch to sounds/boom/ and play its Stop sound
/drboom-sounds:profile mute     silence everything
/drboom-sounds:profile unmute   turn sounds back on
```

Your choice is saved in the plugin data directory, so it survives plugin
updates. Two environment variables override it for a single session:

- `DRBOOM_SOUNDS_PROFILE=boom` picks the profile
- `DRBOOM_SOUNDS_MUTE=1` turns sounds off

## Testing

```
npm run check
```

This runs shellcheck on the scripts, checks the JSON files, and tests profile
selection against a throwaway sounds folder. CI runs the same command on
every push.
