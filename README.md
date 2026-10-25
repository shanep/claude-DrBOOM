# Dr. BOOM

Dr. BOOM's Claude Code setup as one plugin. It tells Claude what to call you,
prints a status line, and plays your own sound files on hook events.

Works on macOS (`afplay`) and Linux (`paplay`, `pw-play`, `aplay` or `ffplay`,
whichever it finds first).

## Names

A hooks module (`hooks/register.ts`) adds a system prompt section telling
Claude to call you Dr. BOOM! and itself Sergeant Stupid. It also shows a toast
when you switch profiles, mute or unmute, so you can see the change took.

The fullscreen TUI is not set here. Claude Code drops what a plugin's
`settings.read` hook answers, and it picks the renderer at startup anyway, so
put `"tui": "fullscreen"` in `~/.claude/settings.json` instead.

## Stats band

A row above the prompt counts what the session has done so far:

```
BOOM! 3 prompts | 41 tool calls | 6 edits | up 12m | last turn: 37s  [Hide]
```

Edits are Edit, Write and NotebookEdit calls. Hide drops the row for the rest
of the session.

## Status line

`scripts/statusline.sh` prints
`Dr. BOOM | model: <model> | folder: <folder> | branch: <branch> | sounds: <profile>`,
with `| worktree: <name>` after the branch when the folder is a linked git
worktree. `| sessions: <n>` before the profile counts the running Claude Code
sessions in the same repo, this one and any in its worktrees included. When the
line is wider than the terminal, it wraps between fields onto more rows. A
plugin cannot set the status line either, so point `~/.claude/settings.json`
at the installed copy. The path comes from Claude Code's install record because
the version is part of it:

```json
"statusLine": {
  "type": "command",
  "command": "sh \"$(jq -r '.plugins[\"drboom-sounds@shanep\"][0].installPath' ~/.claude/plugins/installed_plugins.json)/scripts/statusline.sh\"",
  "padding": 0
}
```

## Install

```
/plugin marketplace add shanep/claude-plugins
/plugin install drboom-sounds@shanep
```

To try a local checkout without installing it:

```
claude --plugin-dir ~/repos/claude-DrBOOM
```

## Sounds

Sounds play on session start and end, when you send a prompt, when Claude
finishes a reply or a subagent, needs your attention, or asks for permission.

### Adding sounds

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
    SessionEnd.wav         The session exits (not on /clear or /resume)
  boom/
    Stop.mp3
```

If the active profile is missing a file, the plugin plays the one from
`default` instead. If `default` doesn't have it either, it stays quiet.

### Switching profiles

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
selection and the status line against a throwaway sounds folder. CI runs the
same command on every push, and so does a pre-push hook once you turn it on:

```
git config core.hooksPath .githooks
```
