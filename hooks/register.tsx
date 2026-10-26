import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Sounds, Stats } from '../types'

// How Claude talks to Dr. BOOM, added to the end of the system prompt.
const NAMES = `# Names

- Call the user Dr. BOOM! in every reply, in every session.
- Refer to yourself as Sergeant Stupid in chat replies to the user. Keep it out of commit messages, code, comments and anything else that goes out under the user's name.`

// What profile.sh prints first when it changes something. A listing prints
// none of these.
const CHANGED = /^(Switched to .+|Sounds muted|Sounds on)\.$/

// The band above the prompt and the pane read these. They live in $.state so
// a reload keeps the counts. Change the tag when Stats changes, so a reload
// starts the counts over instead of reading an older shape.
const stats = atom({ plugin: 'drboom', key: 'stats' } as const, null, { shape: 'stats-2' })
const sounds = atom({ plugin: 'drboom', key: 'sounds' } as const, null)
const isBandHidden = atom({ plugin: 'drboom', key: 'isBandHidden' } as const, false)

// The tools the band counts as edits.
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])

// The pane /boom opens.
const PANE = 'boom'

// What the workflow plugin knows about the repo: the other sessions, paused
// edits and what to rebase on. The pane redraws when it changes.
const repo = { plugin: 'workflow', key: 'repo' } as const

// How many files a pane row lists before "and n more".
const PANE_FILES = 5

// The events the pane can play, with the label each button shows.
const EVENTS: readonly [string, string][] = [
  ['SessionStart', 'Start'],
  ['UserPromptSubmit', 'Prompt'],
  ['Notification', 'Notify'],
  ['PermissionRequest', 'Permission'],
  ['SubagentStop', 'Subagent'],
  ['Stop', 'Stop'],
  ['SessionEnd', 'End'],
]

// What the spinner says while Claude works, in place of the engine's verbs.
const SPINNER_WORDS = [
  'BOOMing',
  'Lighting the fuse',
  'Calling in Sergeant Stupid',
  'Detonating',
  'Packing the charges',
  'Counting down',
  'Making it go BOOM',
  'Consulting Dr. BOOM',
]

// The engine samples one word per turn, so hash it to keep ours steady for
// the turn too.
function spinnerWord(word: string): string {
  let n = 0
  for (const c of word) n = (n * 31 + c.charCodeAt(0)) >>> 0
  return SPINNER_WORDS[n % SPINNER_WORDS.length] ?? 'BOOMing'
}

function bump(s: Stats | null, now: number, change: Partial<Stats>): Stats {
  const base: Stats = s ?? { startedAt: now, prompts: 0, tools: 0, edits: 0, lastTurnSeconds: null, byTool: {} }
  return { ...base, ...change }
}

function age(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

// Files as "a, b and 3 more".
function files(list: readonly string[]): string {
  const rest = list.length - PANE_FILES
  return list.slice(0, PANE_FILES).join(', ') + (rest > 0 ? ` and ${rest} more` : '')
}

// What profile.sh prints for args, an empty list asking for the listing.
// lib.sh finds the data folder from the plugin root, as it does for the
// status line. A failed run prints only to stderr, so that comes back then.
async function profile($: EngineInterface, args: string[]): Promise<string> {
  const ran = await $.process.run(['sh', `${$.plugin.root}/scripts/profile.sh`, ...args])
  return ran.stdout !== '' ? ran.stdout : ran.stderr
}

// profile.sh marks the active profile with a star and ends with a line when
// sounds are muted.
function parseProfiles(out: string): Sounds {
  const profiles: string[] = []
  let active = 'default'
  for (const line of out.split('\n')) {
    const m = /^([* ]) ([^:]+):/.exec(line)
    if (m === null) continue
    const name = m[2] ?? ''
    profiles.push(name)
    if (m[1] === '*') active = name
  }
  return { profiles, active, isMuted: out.includes('Sounds are muted.') }
}

// Read the listing back into $.state, which redraws the pane. It never
// throws, since the Bash hook calls it after the tool has run and its .catch
// would run the tool again. A failed listing keeps the last good one.
async function refreshSounds($: EngineInterface): Promise<void> {
  try {
    const ran = await $.process.run(['sh', `${$.plugin.root}/scripts/profile.sh`])
    if (ran.exitCode !== 0 || ran.stdout === '') return
    await update($, sounds, () => parseProfiles(ran.stdout))
  } catch {
    return
  }
}

export const register: Register = on => {
  let turnStartedAt = 0

  on('session.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, stats, s => s ?? bump(null, now, {}))
    await $.command.register({ name: 'boom', description: 'Open the Dr. BOOM pane' })
    await refreshSounds($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Read the sounds again on open, since a shell can switch profiles
  // without the pane hearing about it.
  on('command.run', { command: 'boom' }, async $ => {
    await refreshSounds($)
    const opened = await $.ui.open({ id: PANE, title: 'BOOM!' })
    return { text: opened.isPlaced ? 'BOOM! Pane open.' : 'BOOM! The pane opens once the terminal is wide enough.' }
  })

  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    turnStartedAt = now
    await update($, stats, s => bump(s, now, { prompts: (s?.prompts ?? 0) + 1 }))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const now = await $.clock.now()
    const edit = EDIT_TOOLS.has(e.tool) ? 1 : 0
    await update($, stats, s =>
      bump(s, now, {
        tools: (s?.tools ?? 0) + 1,
        edits: (s?.edits ?? 0) + edit,
        byTool: { ...(s?.byTool ?? {}), [e.tool]: (s?.byTool[e.tool] ?? 0) + 1 },
      }),
    )
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

  // The pane: session stats, the most-called tools, the repo as the workflow
  // plugin sees it, and a sound board that switches profiles, mutes and plays
  // each event's sound.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const s = await read($, stats)
    const board = await read($, sounds)
    const { value: r } = await $.state.get(repo)
    const now = await $.clock.now()

    // Run profile.sh, read its new listing back, and toast what it said.
    const change = async (args: string[]) => {
      const said = (await profile($, args)).split('\n')[0]?.trim() ?? ''
      await refreshSounds($)
      $.ui.toast(`BOOM! ${said !== '' ? said : 'profile.sh printed nothing.'}`)
    }
    const play = async (event: string) => {
      await $.process.run(['sh', `${$.plugin.root}/scripts/play.sh`, event])
    }

    const top = Object.entries(s?.byTool ?? {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)

    return (
      <Box flexDirection="column">
        <Text bold>Session</Text>
        {s === null ? (
          <Text dimColor>Nothing yet.</Text>
        ) : (
          <Box flexDirection="column">
            <Text>
              {s.prompts} prompts | {s.tools} tool calls | {s.edits} edits
            </Text>
            <Text dimColor>
              up {age(now - s.startedAt)}
              {s.lastTurnSeconds === null ? '' : ` | last turn: ${s.lastTurnSeconds}s`}
            </Text>
          </Box>
        )}
        <Text> </Text>
        <Text bold>Top tools</Text>
        {top.length === 0 && <Text dimColor>No tool calls yet.</Text>}
        {top.map(([tool, n]) => (
          <Text>
            {String(n).padStart(4)} {tool}
          </Text>
        ))}
        <Text> </Text>
        <Text bold>Repo</Text>
        {r == null ? (
          <Text dimColor>Nothing yet.</Text>
        ) : (
          <Box flexDirection="column">
            <Text>
              {r.branch ?? 'no branch'}
              {r.target === null || r.target === r.branch ? '' : ` | lands on ${r.target}`}
            </Text>
            <Text dimColor>{r.files.length === 0 ? 'No changes yet.' : `Changing ${files(r.files)}`}</Text>
            {r.ports != null && (
              <Text dimColor>
                Ports {r.ports} to {r.ports + 99}
              </Text>
            )}
            {r.setup != null && <Text dimColor>{r.setup}</Text>}
            {r.checks != null && (
              <Text dimColor={r.checks.busy < r.checks.slots} color={r.checks.busy < r.checks.slots ? undefined : 'yellow'}>
                Checks: {r.checks.busy} of {r.checks.slots} slots busy
              </Text>
            )}
            {r.upstream.length > 0 && <Text color="yellow">Rebase: {r.target} changed {files(r.upstream)}</Text>}
            {r.peers.length === 0 && <Text dimColor>No other sessions.</Text>}
            {r.peers.map(peer => (
              <Text>
                {peer.topic === null ? 'A session' : `"${peer.topic}"`} {peer.where}
                {peer.files.length === 0 ? '' : `: ${files(peer.files)}`}
              </Text>
            ))}
            {r.paused.map(p => (
              <Text dimColor>
                Paused an edit to {p.file} {age(now - p.at)} ago
              </Text>
            ))}
          </Box>
        )}
        <Text> </Text>
        <Text bold>Sounds{board?.isMuted === true ? ' (muted)' : ''}</Text>
        <Box flexWrap="wrap">
          {(board?.profiles ?? []).map(name => (
            <Button
              key={`profile:${name}`}
              label={name === board?.active ? `* ${name}` : name}
              onPress={() => void change([name])}
            />
          ))}
          <Button
            key="mute"
            hotkey="m"
            label={board?.isMuted === true ? 'Unmute' : 'Mute'}
            onPress={() => void change([board?.isMuted === true ? 'unmute' : 'mute'])}
          />
        </Box>
        <Text dimColor>Play:</Text>
        <Box flexWrap="wrap">
          {EVENTS.map(([event, label], i) => (
            <Button key={`play:${event}`} hotkey={String(i + 1)} label={label} onPress={() => void play(event)} />
          ))}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Spinner' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, word: spinnerWord(e.props.word) } }),
  ).catch(($, e, next) => next(e))

  on('prompt.compose', async ($, e, next) => {
    const { sections } = await next(e)
    return {
      sections: [...sections, { id: `${$.plugin.name}:names`, text: NAMES, scope: 'session' }],
    }
  }).catch(($, e, next) => next(e))

  // Toast the first line profile.sh prints when it switches, mutes or
  // unmutes, so a change made through the profile skill is easy to see, and
  // update the pane to match.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (!e.command.includes('scripts/profile.sh')) return ran
    if (ran.deny !== undefined || ran.isError === true) return ran
    const first = ran.result.stdout.split('\n')[0]?.trim() ?? ''
    if (!CHANGED.test(first)) return ran
    $.ui.toast(`BOOM! ${first}`)
    await refreshSounds($)
    return ran
  }).catch(($, e, next) => next(e))
}
