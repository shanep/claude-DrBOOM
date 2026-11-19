// What the band and the pane count in one session.
export type Stats = {
  startedAt: number
  prompts: number
  tools: number
  edits: number
  lastTurnSeconds: number | null
  byTool: Record<string, number>
  // How long the last turns took, in seconds, oldest first.
  turns: number[]
  // Tool calls that failed or were refused, and the last one.
  failures: number
  lastFailure: string | null
  // The files edited, by path, with how often and when last.
  touched: Record<string, { count: number; at: number }>
  // When the last tool calls ran, for the BOOM meter, oldest first.
  calls: number[]
  landing: Landing | null
}

// The last landing this session started, as the pane follows it.
export type Landing = {
  state: 'running' | 'landed' | 'failed'
  at: number
  // The commit that landed, or the line that says why it failed.
  detail: string | null
}

// Tasks waiting for autopilot, oldest first, and whether it runs them.
export type Queue = {
  items: { id: string; text: string }[]
  isAuto: boolean
  // Why autopilot stopped on its own, until it is turned on again.
  pausedFor: string | null
}

// Something that needs the person, newest first.
export type InboxEntry = {
  id: string
  at: number
  // waiting: a prompt or permission waits on the person, and goes once the
  // session moves on. alert: stays until dismissed.
  kind: 'waiting' | 'alert'
  text: string
  // A prompt the Fix button sends, when there is something to fix.
  fix: string | null
}

// Landings in a row that passed, and the best run, kept across sessions.
export type Streak = { current: number; best: number }

// What profile.sh lists: the profiles, the active one and the mute state.
export type Sounds = { profiles: string[]; active: string; isMuted: boolean }

// How far a session has got and what it cost, from the workflow plugin.
export type Progress = {
  usd: number
  budget: number | null
  tasks: { done: number; total: number; current: string | null } | null
  left: { usd: number; ms: number } | null
  fiveHour: number | null
}

// What the workflow plugin keeps in $.state for the pane, copied from its
// types/index.d.ts. drboom reads it without listing workflow as a dependency,
// since Claude Code turns off a plugin whose dependency is missing.
export type Repo = {
  root: string
  target: string | null
  branch: string | null
  files: string[]
  // progress is optional, since workflow 0.6.0 and before did not publish it.
  peers: { topic: string | null; where: string; files: string[]; progress?: Progress | null }[]
  paused: { file: string; at: number }[]
  upstream: string[]
  // Optional, since workflow 0.1.0 published neither.
  ports?: number | null
  setup?: string | null
  // Optional, since workflow 0.2.0 and before did not publish it.
  checks?: { busy: number; slots: number } | null
  // Optional, since workflow 0.3.0 and before did not publish it.
  health?: { at: number; problems: string[] } | null
  // Optional, since workflow 0.5.0 and before did not publish it. Newest first.
  plans?: {
    id: string
    goal: string
    state: 'running' | 'done' | 'failed' | 'stopped'
    tasks: {
      id: string
      title: string
      state: 'waiting' | 'running' | 'landed' | 'failed' | 'stopped'
      note: string | null
      session: string | null
      // Optional, since workflow 0.6.0 and before did not publish it.
      usd?: number | null
    }[]
  }[]
  // Optional, since workflow 0.6.0 and before did not publish it.
  progress?: Progress | null
  // Optional, since workflow 0.7.0 and before did not publish it.
  isAwake?: boolean
  // Optional, since workflow 0.8.0 and before did not publish it. Newest last.
  audit?: {
    allowed: number
    denied: number
    recent: { at: number; tool: string; what: string; decision: 'allow' | 'deny'; reason: string | null }[]
  } | null
  // Optional, since workflow 0.9.0 and before did not publish it. Each
  // problem is "<name>: <status>".
  connectors?: { at: number; ready: number; problems: string[] } | null
}

declare module 'claude-code' {
  interface PluginState {
    'drboom': {
      stats: Shaped<Stats | null>
      sounds: Sounds | null
      isBandHidden: boolean
      folded: string[]
      streak: Streak | null
      queue: Queue
      inbox: InboxEntry[]
    }
    'workflow': { repo: Repo | null }
  }
}
