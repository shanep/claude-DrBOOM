# Dr. BOOM

Dr. BOOM's Claude Code setup as one plugin. It tells Claude what to call you,
prints a status line, shows session stats above the prompt, puts Dr. BOOM
words on the spinner and the line that closes each turn, opens a pane with
stats and a sound board, and plays your own sound files on hook events.

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

## Pane

`/boom` opens a pane beside the chat with the same counts as the band, the six
tools Claude called most, the files this session edited, the repo, the last
landing, and a sound board. Each part is its own card with a rounded border and
a cyan title. The button beside a title folds the card down to that title, and
the pane remembers which cards are folded across sessions. Every row is one
line, cut at the card's edge, with a mark for how it stands: a green `✓` when
it is done or fine, a yellow `✗` for a problem, a red `✗` when it failed, a cyan
`●` while it runs and `○` while it waits.

The top of the pane is for running agents. Inbox shows up when something
needs you: a permission or idle prompt (it goes once the session moves on), a
failed landing, or autopilot stopping. Failures and autopilot also send a
desktop notification, so you can walk away while agents work. Actions has
buttons that send a standard prompt: Review diff, Land it, Code review, Hand
off and Summarize. Queue holds tasks you type into its box. Start turns on
autopilot, which sends the first task, then the next one each time a turn
ends. It pauses on its own when you stop a turn, a landing fails or the
session goes over its budget, and tells you when the queue is empty. Run sends
one task now and `✗` drops it. Agents lists the subagents and background
agents with what they are doing and how long they have run, and Stop on a
running one stops it. A failed landing, a health problem, a failed plan task
and the last failed tool call each get a Fix button that asks Claude to fix
it.

Session has the counts, how many tool calls failed or were refused (with the
last one), a sparkline of how long the last 20 turns took, and a fuse that
burns down as tool calls come in. The fuse counts the calls in the last minute
and goes off with a 💥 at 30. Files touched lists the files edited, newest
first, with how many times each. Landing follows `~/.claude/bin/land` (or a
repo's own `land` command) while it runs, even in the background, and then
says what landed or why it failed. A landing plays the `Land` sound, which
falls back to the start sound. The card also keeps a streak of landings in a
row that passed, with the best one, across sessions.

The Repo, Health, Sessions, Auto mode and Plans cards come from the
[workflow](https://github.com/shanep/claude-workflow) plugin. Repo has this
session's branch and changed files, files to rebase on, edits it paused, its
ports, how the worktree setup went, and whether it keeps the computer awake.
Health has what the startup health check found, which MCP servers and connectors
work, and how many check slots are busy. Sessions lists the other sessions in
the repo and what they are changing. With workflow the session counts also show
what the session has cost against its budget, how far through its task list it
is and a guess at what is left, and each other session gets the same line,
yellow once it is over budget. Without workflow the Repo card says "Nothing
yet." Plans lists the newest workflow plans with each task, whether it is
waiting, running, landed or failed, and what it cost. Auto mode counts the calls
auto mode let through and refused in this session and shows the newest three,
with the reason under a refusal.

The board has a button for each profile (the active one has a `*`), Mute or
Unmute, and a button that plays each event's sound. With the pane focused, `m`
mutes or unmutes and `1` to `7` play Start, Prompt, Notify, Permission,
Subagent, Stop and End. Sergeant Stupid has a new line at the bottom of the
pane every turn.

The pane docks beside the transcript in fullscreen from 110 columns and sits
above the prompt otherwise. It redraws when the session does something and
once a minute, so the uptime on it and the band is never more than a minute
behind.

## Spinner and turn line

While Claude works, the spinner says one of `BOOMing`, `Lighting the fuse`,
`Calling in Sergeant Stupid`, `Detonating`, `Packing the charges`,
`Counting down`, `Making it go BOOM` or `Consulting Dr. BOOM`, and keeps the
same one for the whole turn. Status messages Claude Code shows in its place
are left alone.

The line that closes a turn (`Baked for 3s`) gets one of `Detonated`,
`Went BOOM`, `Blew it up`, `Lit the fuse`, `Cleared the blast zone`,
`Kaboomed`, `Rattled the windows` or `Shook the lab` instead.

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
  "command": "sh \"$(jq -r '.plugins[\"drboom@shanep\"][0].installPath' ~/.claude/plugins/installed_plugins.json)/scripts/statusline.sh\"",
  "padding": 0
}
```

## Install

```
/plugin marketplace add shanep/claude-plugins
/plugin install drboom@shanep
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
    Land.wav               Work landed (the pane plays it, falls back to SessionStart)
  boom/
    Stop.mp3
```

If the active profile is missing a file, the plugin plays the one from
`default` instead. If `default` doesn't have it either, it stays quiet.

### Switching profiles

```
/drboom:profile          list profiles, * marks the active one
/drboom:profile boom     switch to sounds/boom/ and play its Stop sound
/drboom:profile mute     silence everything
/drboom:profile unmute   turn sounds back on
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

## License

MIT. See [LICENSE](LICENSE).
