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

declare module 'claude-code' {
  interface PluginState {
    'drboom': { stats: Shaped<Stats | null>; sounds: Sounds | null; isBandHidden: boolean }
  }
}
