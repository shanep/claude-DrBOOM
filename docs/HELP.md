# Dr. BOOM help

This is the long version of the [README](../README.md): every part of the
plugin, with a picture of what you see, and how to use the pane to keep
Claude working through a list of tasks while you do something else.

The pictures are drawn by hand from the pane's code, so the spacing is close
but not exact. In the terminal the titles are cyan, the frames are dim, and
the marks are colored as the table below says.

## The short version

1. Open the pane with `/boom`.
2. Type a few tasks into the Queue card and press Start.
3. Walk away. Autopilot sends one task per turn, and the Inbox (plus a desktop
   notification) tells you when it needs you, a landing fails or the queue is
   empty.
4. When the work looks good, press Land it.

## How the agentic workflow runs

Everything runs on your Mac in the Claude Code session, except the push at
the end of a landing, which goes to GitHub.

```
┌─ Your Mac ───────────────────────────────────────────────┐
│                                                          │
│   you type tasks into the Queue card, then press Start   │
│                            │                             │
│                            ▼                             │
│              ┌──▶ autopilot sends the next task          │
│              │             │                             │
│              │             ▼                             │
│              │   Claude works on it ──▶ agents it starts │
│              │             │            show in the      │
│              │             │            Agents card      │
│              │             ▼                             │
│              │       the turn ends                       │
│              │             │                             │
│              │             ▼                             │
│              │   anything wrong? ──yes──▶ autopilot      │
│              │             │              pauses, Inbox  │
│              └───── no ────┘              + notification │
│                                                          │
│   Land it ──▶ ~/.claude/bin/land ──▶ Landing card ✓ / ✗  │
│                            │                             │
└────────────────────────────┼─────────────────────────────┘
                             │ git push
┌─ GitHub ───────────────────┼─────────────────────────────┐
│                            ▼                             │
│                 origin's default branch                  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Autopilot only moves on after a turn of the main session ends, never after a
subagent's. It stops on its own when:

- you stop a turn (Esc),
- the last landing failed,
- the session is over its budget (needs the workflow plugin), or
- the queue is empty.

Each of those puts an entry in the Inbox. When it stops on a problem, the
card says why under the Autopilot line, and Start turns it back on.

## Reading the pane

Every row is one line, cut at the edge of the card, with a mark in front:

| Mark | Color | Means |
|---|---|---|
| `✓` | green | done or fine |
| `✗` | yellow | a problem |
| `✗` | red | it failed |
| `●` | cyan | running |
| `○` | none | waiting or off |

The button beside each title (`▾`) folds the card down to the title, and
`▸` opens it again. The pane remembers folded cards across sessions.

```
╭────────────────────────────────────────────────────────────╮
│ Top tools [▸]                                              │
╰────────────────────────────────────────────────────────────╯
```

The pane docks beside the chat in fullscreen from 110 columns wide and sits
above the prompt when the terminal is narrower. It redraws whenever the
session does something, and every 10 seconds so the times and the agents stay
current.

## The cards, top to bottom

### Inbox

Shows up only when something needs you, newest first. A waiting entry (`●`)
is a permission or idle prompt, and it goes away on its own once the session
moves on. An alert (`✗`) stays until you press Dismiss: a failed landing,
autopilot pausing, or autopilot finishing the queue. Alerts also send a
desktop notification. An entry with something to fix has a Fix button.

```
╭────────────────────────────────────────────────────────────╮
│ Inbox (2) [▾]                                              │
│ ✗ Landing failed: 1 test failed 2m ago     [Fix] [Dismiss] │
│ ● Claude needs your permission to use Bash       [Dismiss] │
╰────────────────────────────────────────────────────────────╯
```

### Actions

Each button sends a prompt as if you typed it. If Claude is busy, it waits
until the turn ends.

```
╭────────────────────────────────────────────────────────────╮
│ Actions [▾]                                                │
│ [Review diff] [Land it] [Code review] [Hand off]           │
│ [Summarize]                                                │
╰────────────────────────────────────────────────────────────╯
```

| Button | Sends |
|---|---|
| Review diff | Review the uncommitted diff for bugs and CLAUDE.md rules, list findings, no edits yet |
| Land it | Commit the finished work and land it |
| Code review | `/code-review` |
| Hand off | `/handoff`, to move the work to a background worktree |
| Summarize | What changed this session, what landed and what is left |

### Queue

Type a task into the box at the bottom and press Add. Start turns
on autopilot and sends the first task right away when the session is idle.
Pause turns it off and leaves the rest of the queue alone. Run sends one task
now, autopilot or not, and `✗` drops a task.

```
╭────────────────────────────────────────────────────────────╮
│ Queue (2) [▾]                                              │
│ ● Autopilot on runs the next task when a turn ends [Pause] │
│ 1. Add a dark mode toggle to settings            [Run] [✗] │
│ 2. Write tests for the CSV importer              [Run] [✗] │
│ [Add a task for autopilot                    ]       [Add] │
╰────────────────────────────────────────────────────────────╯
```

When autopilot stops on its own, the card says why:

```
╭────────────────────────────────────────────────────────────╮
│ Queue (1) [▾]                                              │
│ ○ Autopilot off                                    [Start] │
│   Paused: the last landing failed.                         │
│ 1. Write tests for the CSV importer              [Run] [✗] │
│ [Add a task for autopilot                    ]       [Add] │
╰────────────────────────────────────────────────────────────╯
```

Write each task the way you would type it as a prompt. Tasks that end in a
commit or a landing work best, because the next task starts from a clean
tree.

### Agents

The subagents and background agents this session started, running ones
first, with how long each has run and its type. The dim line under one is
what it is doing now. Stop ends a running agent, the same as asking Claude to
stop it. With no agents, the card says so.

```
╭────────────────────────────────────────────────────────────╮
│ Agents (1 running) [▾]                                     │
│ ● Port the parser general-purpose | 2m              [Stop] │
│   Reading src/lexer.rs                                     │
│ ✓ Find the tests Explore | 5m                              │
╰────────────────────────────────────────────────────────────╯
```

### Session

The counts for this session: prompts, tool calls, edits and how many calls
failed or were refused. The last one that failed has a Fix button. Under that
are the uptime and the last turn, a sparkline of the last 20 turns, and the
fuse, which burns down as tool calls come in and goes off with a 💥 at 30 a
minute. With the workflow plugin, a last line has what the session cost
against its budget and how far through its tasks it is.

```
╭────────────────────────────────────────────────────────────╮
│ Session [▾]                                                │
│ 12 prompts | 140 tool calls | 23 edits | 2 failed          │
│   last failed: Bash: npm test                        [Fix] │
│ up 48m | last turn 37s                                     │
│ turns ▂▃▁▅█▂▃ longest 212s                                 │
│ fuse  ━━╸······· 9/min                                     │
╰────────────────────────────────────────────────────────────╯
```

### Top tools and Files touched

Top tools lists the six tools Claude called most. Files touched lists the
files this session edited, newest first, with how many times each.

```
╭────────────────────────────────────────────────────────────╮
│ Files touched [▾]                                          │
│ 4× hooks/register.tsx 1m ago                               │
│ 2× README.md 6m ago                                        │
╰────────────────────────────────────────────────────────────╯
```

### Landing

Follows `~/.claude/bin/land` (or a repo's own `npm run land`, `make land`,
`just land` or `scripts/land.sh`) while it runs, even in the background. It
says which commit landed, or why it failed with a Fix button. A landing plays
the Land sound. The streak counts landings in a row that passed, and the best
run, across sessions.

```
╭────────────────────────────────────────────────────────────╮
│ Landing [▾]                                                │
│ ✓ Landed 4d8fbec on master 0m ago                          │
│ 🔥 3 landings in a row | best 7                            │
╰────────────────────────────────────────────────────────────╯
```

```
╭────────────────────────────────────────────────────────────╮
│ Landing [▾]                                                │
│ ✗ Land failed 1m ago                                       │
│   1 test failed: the pane follows a landing          [Fix] │
│ ○ 0 landings in a row | best 7                             │
╰────────────────────────────────────────────────────────────╯
```

### Repo, Health, Sessions, Auto mode and Plans

These come from the [workflow](https://github.com/shanep/claude-workflow)
plugin, and say "Nothing yet." without it. Repo has the branch, the changed
files and anything to rebase on. Health has what the startup check found,
and each problem has a Fix button. Sessions lists the other sessions in the
repo. Auto mode shows the calls auto mode allowed and refused. Plans lists
the newest workflow plans, and a failed task has a Fix button.

### Sounds

A button per profile (`*` marks the active one), Mute or Unmute, and a
button that plays each event's sound. With the pane focused, `m` mutes and
`1` to `7` play Start, Prompt, Notify, Permission, Subagent, Stop and End.
See [Sounds](../README.md#sounds) in the README for adding your own.

## Outside the pane

The stats band sits above the prompt. Hide drops it for the session.

```
BOOM! 3 prompts | 41 tool calls | 6 edits | up 12m | last turn: 37s  [Hide]
```

- **Names.** Claude calls you Dr. BOOM! and itself Sergeant Stupid.
- **Spinner and turn line.** The spinner says things like `Lighting the fuse`
  while Claude works, and the line that ends a turn says things like
  `Detonated for 37s`.
- **Status line.** Model, folder, branch, worktree, sessions in the repo and
  the sound profile. See [Status line](../README.md#status-line) to set it up.
- **Profiles.** `/drboom:profile` lists, switches, mutes and unmutes sound
  profiles.

## When something looks wrong

- **A card is missing.** It may be folded (press `▸`), or it only shows when
  there is something in it (Inbox, and Landing before your first landing).
- **The pane did not change after an update.** Run `/reload-plugins`.
- **Autopilot did nothing after Start.** The queue was empty, or Claude was
  in the middle of a turn. It sends the next task when that turn ends.
- **A Fix or Actions button did nothing right away.** It waits for the
  current turn to end, then sends.
