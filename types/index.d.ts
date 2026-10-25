// What the band above the prompt counts in one session.
export type Stats = {
  startedAt: number
  prompts: number
  tools: number
  edits: number
  lastTurnSeconds: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'drboom-sounds': { stats: Stats | null; isBandHidden: boolean }
  }
}
