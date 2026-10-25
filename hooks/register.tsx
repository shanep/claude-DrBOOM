import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Stats } from '../types'

// How Claude talks to Dr. BOOM, added to the end of the system prompt.
const NAMES = `# Names

- Call the user Dr. BOOM! in every reply, in every session.
- Refer to yourself as Sergeant Stupid in chat replies to the user. Keep it out of commit messages, code, comments and anything else that goes out under the user's name.`

// What profile.sh prints first when it changes something. A listing prints
// none of these.
const CHANGED = /^(Switched to .+|Sounds muted|Sounds on)\.$/

// The band above the prompt reads these. They live in $.state so a reload
// keeps the counts.
const stats = atom({ plugin: 'drboom', key: 'stats' } as const, null)
const isBandHidden = atom({ plugin: 'drboom', key: 'isBandHidden' } as const, false)

// The tools the band counts as edits.
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])

function bump(s: Stats | null, now: number, change: Partial<Stats>): Stats {
  const base: Stats = s ?? { startedAt: now, prompts: 0, tools: 0, edits: 0, lastTurnSeconds: null }
  return { ...base, ...change }
}

function age(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export const register: Register = on => {
  let turnStartedAt = 0

  on('session.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, stats, s => s ?? bump(null, now, {}))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    turnStartedAt = now
    await update($, stats, s => bump(s, now, { prompts: (s?.prompts ?? 0) + 1 }))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const now = await $.clock.now()
    const edit = EDIT_TOOLS.has(e.tool) ? 1 : 0
    await update($, stats, s => bump(s, now, { tools: (s?.tools ?? 0) + 1, edits: (s?.edits ?? 0) + edit }))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    const seconds = turnStartedAt === 0 ? null : Math.round((now - turnStartedAt) / 1000)
    await update($, stats, s => bump(s, now, { lastTurnSeconds: seconds }))
    return next(e)
  }).catch(($, e, next) => next(e))

  // Session stats in one row above the prompt, with a button to hide it for
  // the rest of the session.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, stats)
    if (e.props.hasSurvey || s === null || (await read($, isBandHidden))) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const turn = s.lastTurnSeconds === null ? '' : ` | last turn: ${s.lastTurnSeconds}s`

    return (
      <Box>
        <Text dimColor>
          BOOM! {s.prompts} prompts | {s.tools} tool calls | {s.edits} edits | up {age(now - s.startedAt)}
          {turn}{' '}
        </Text>
        <Button key="hide" label="Hide" onPress={() => update($, isBandHidden, () => true)} />
      </Box>
    )
  }).catch(($, e, next) => next(e))

  on('prompt.compose', async ($, e, next) => {
    const { sections } = await next(e)
    return {
      sections: [...sections, { id: `${$.plugin.name}:names`, text: NAMES, scope: 'session' }],
    }
  }).catch(($, e, next) => next(e))

  // Toast the first line profile.sh prints when it switches, mutes or
  // unmutes, so a change made through the profile skill is easy to see.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (!e.command.includes('scripts/profile.sh')) return ran
    if (ran.deny !== undefined || ran.isError === true) return ran
    const first = ran.result.stdout.split('\n')[0]?.trim() ?? ''
    if (CHANGED.test(first)) $.ui.toast(`BOOM! ${first}`)
    return ran
  }).catch(($, e, next) => next(e))
}
