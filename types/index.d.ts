// What the band and the pane count in one session.
export type Stats = {
  startedAt: number
  prompts: number
  tools: number
  edits: number
  lastTurnSeconds: number | null
  byTool: Record<string, number>
}

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
}

declare module 'claude-code' {
  interface PluginState {
    'drboom': { stats: Shaped<Stats | null>; sounds: Sounds | null; isBandHidden: boolean }
    'workflow': { repo: Repo | null }
  }
}
