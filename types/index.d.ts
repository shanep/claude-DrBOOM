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

// What the workflow plugin keeps in $.state for the pane, copied from its
// types/index.d.ts. drboom reads it without listing workflow as a dependency,
// since Claude Code turns off a plugin whose dependency is missing.
export type Repo = {
  root: string
  target: string | null
  branch: string | null
  files: string[]
  peers: { topic: string | null; where: string; files: string[] }[]
  paused: { file: string; at: number }[]
  upstream: string[]
  // Optional, since workflow 0.1.0 published neither.
  ports?: number | null
  setup?: string | null
  // Optional, since workflow 0.2.0 and before did not publish it.
  checks?: { busy: number; slots: number } | null
  // Optional, since workflow 0.3.0 and before did not publish it.
  health?: { at: number; problems: string[] } | null
}

declare module 'claude-code' {
  interface PluginState {
    'drboom': { stats: Shaped<Stats | null>; sounds: Sounds | null; isBandHidden: boolean }
    'workflow': { repo: Repo | null }
  }
}
