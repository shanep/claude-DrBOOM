import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, Timer, ToolCallResult } from 'claude-code'

import type { InboxEntry, Landing, Progress, Queue, Sounds, Stats, Streak } from '../types'

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
const stats = atom({ plugin: 'drboom', key: 'stats' } as const, null, { shape: 'stats-3' })

const sounds = atom({ plugin: 'drboom', key: 'sounds' } as const, null)
const isBandHidden = atom({ plugin: 'drboom', key: 'isBandHidden' } as const, false)
// These two are also kept in $.store, so they outlast the session: which
// cards are folded, and the landing streak.
const folded = atom({ plugin: 'drboom', key: 'folded' } as const, [])
const streak = atom({ plugin: 'drboom', key: 'streak' } as const, null)
// The tasks autopilot runs one per turn, and what needs the person.
const queue = atom({ plugin: 'drboom', key: 'queue' } as const, { items: [], isAuto: false, pausedFor: null })
const inbox = atom({ plugin: 'drboom', key: 'inbox' } as const, [])

// The tools the band counts as edits.
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])

// How many turns the sparkline draws and how many files the Files card lists.
const TURNS = 20
const TOUCHED = 8

// The BOOM meter counts tool calls in the last minute and goes off at this
// many. It keeps 5 minutes of calls, at most 500.
const METER_BOOM = 30
const METER_CELLS = 10
const CALLS_KEPT_MS = 5 * 60000
const CALLS_KEPT = 500

// A command that lands work, wherever the land script lives.
const LAND = /(?:^|[\s/])(?:bin\/land|scripts\/land\.sh)\b|\b(?:npm run|make|just) land\b/
// How often the pane reads a background landing's log, and when it gives up.
const LAND_POLL_MS = 3000
const LAND_GIVE_UP_MS = 30 * 60000

// How many inbox entries and agents the pane keeps and shows.
const INBOX_KEPT = 10
const AGENTS_SHOWN = 8

// The Actions row: each button sends its prompt as if typed.
const ACTIONS: readonly [string, string][] = [
  ['Review diff', 'Review the uncommitted diff in this repo for bugs and anything that breaks a CLAUDE.md rule. List findings, do not edit yet.'],
  ['Land it', 'Commit the finished work in this repo and land it.'],
  ['Code review', '/code-review'],
  ['Hand off', '/handoff'],
  ['Summarize', 'Summarize what changed in this session: what was done, what landed, and anything left open.'],
]

// What Sergeant Stupid says at the bottom of the pane, a new one each turn.
const QUIPS = [
  'Sergeant Stupid reporting for duty, Dr. BOOM!',
  'If it compiles, it ships. If it ships, it BOOMs.',
  'I read the manual. Then I lit it on fire.',
  'Tests are just explosions we planned for.',
  'Every merge conflict is a tiny BOOM.',
  'I put the "fun" in "function". And the "un" in "unit test".',
  'Duck and cover, the linter is coming through.',
  'No bugs were harmed in the making of this commit. Probably.',
  'Rebasing is just time travel with extra steps.',
  'The fuse is lit. Nobody panic. Except the bugs.',
]

// The pane /boom opens.
const PANE = 'boom'

// What the workflow plugin knows about the repo: the other sessions, paused
// edits and what to rebase on. The pane redraws when it changes.
const repo = { plugin: 'workflow', key: 'repo' } as const

// How many files a pane row lists before "and n more".
const PANE_FILES = 5

// The marks the pane's rows start with, and their colors: done or fine,
// a problem, at work, and waiting or idle.
type Mark = 'ok' | 'bad' | 'failed' | 'busy' | 'idle'
const MARKS: Record<Mark, readonly [string, 'green' | 'yellow' | 'red' | 'cyan' | undefined]> = {
  ok: ['✓', 'green'],
  bad: ['✗', 'yellow'],
  failed: ['✗', 'red'],
  busy: ['●', 'cyan'],
  idle: ['○', undefined],
}
const PLAN_MARKS: Record<'running' | 'done' | 'failed' | 'stopped', Mark> = {
  running: 'busy',
  done: 'ok',
  failed: 'failed',
  stopped: 'idle',
}
const TASK_MARKS: Record<'waiting' | 'running' | 'landed' | 'failed' | 'stopped', Mark> = {
  waiting: 'idle',
  running: 'busy',
  landed: 'ok',
  failed: 'failed',
  stopped: 'idle',
}

const AGENT_MARKS: Record<'pending' | 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'killed', Mark> = {
  pending: 'idle',
  running: 'busy',
  waiting: 'idle',
  idle: 'idle',
  completed: 'ok',
  failed: 'failed',
  killed: 'idle',
}

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

// What the line that closes a turn says, in place of the engine's word
// (`Baked for 3s` becomes `Detonated for 3s`).
const FOOTER_WORDS = [
  'Detonated',
  'Went BOOM',
  'Blew it up',
  'Lit the fuse',
  'Cleared the blast zone',
  'Kaboomed',
  'Rattled the windows',
  'Shook the lab',
]

// The engine samples one word per turn, so hash it to keep ours steady for
// the turn and on every redraw of the line.
function pick(words: readonly string[], word: string): string {
  let n = 0
  for (const c of word) n = (n * 31 + c.charCodeAt(0)) >>> 0
  return words[n % words.length] ?? 'BOOMing'
}

function bump(s: Stats | null, now: number, change: Partial<Stats>): Stats {
  const base: Stats = s ?? {
    startedAt: now,
    prompts: 0,
    tools: 0,
    edits: 0,
    lastTurnSeconds: null,
    byTool: {},
    turns: [],
    failures: 0,
    lastFailure: null,
    touched: {},
    calls: [],
    landing: null,
  }
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

// Text squeezed onto one line, so a multi-line command reads as one row.
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// Turn lengths as bars, the longest turn a full block.
function sparkline(turns: readonly number[]): string {
  const bars = '▁▂▃▄▅▆▇█'
  const most = Math.max(1, ...turns)
  return turns.map(t => bars[Math.min(bars.length - 1, Math.floor((t / most) * bars.length))] ?? '▁').join('')
}

// Tool calls in the last minute as a burning fuse, "━━━━╸····· 12/min".
function meter(calls: readonly number[], now: number): { bar: string; rate: number; isBoom: boolean } {
  const rate = calls.filter(at => now - at < 60000).length
  const lit = Math.min(METER_CELLS, Math.round((rate / METER_BOOM) * METER_CELLS))
  const bar = lit === 0 ? '·'.repeat(METER_CELLS) : '━'.repeat(lit - 1) + '╸' + '·'.repeat(METER_CELLS - lit)
  return { bar, rate, isBoom: rate >= METER_BOOM }
}

// What a tool call was about, for a row: the command, the file or the pattern.
function about(e: object): string {
  for (const key of ['command', 'file_path', 'notebook_path', 'pattern', 'url', 'query', 'description']) {
    const value: unknown = (e as Record<string, unknown>)[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return ''
}

// How a landing ended, read from its output, or null while it still runs.
// The land script ends with "land: landed abc1234 on master." and a
// background run's log with "[exited with code n]".
function landed(out: string, exitCode: number | null): Pick<Landing, 'state' | 'detail'> | null {
  const done = /land: landed (\w+) on (\S+?)\.?$/m.exec(out)
  if (done !== null) return { state: 'landed', detail: `${done[1] ?? ''} on ${done[2] ?? ''}` }
  const exited = /\[exited with code (\d+)\]/.exec(out)
  const code = exited === null ? exitCode : Number(exited[1])
  if (code === null) return null
  const lines = out.split('\n').map(line => line.trim()).filter(line => line !== '' && !line.startsWith('[exited'))
  const said = [...lines].reverse().find(line => line.startsWith('land:')) ?? lines[lines.length - 1] ?? null
  return code === 0 ? { state: 'landed', detail: said } : { state: 'failed', detail: said ?? `exit code ${code}` }
}

function dollars(usd: number): string {
  return `$${usd.toFixed(2)}`
}

// A session's progress as "$1.20 of $5.00 | 2 of 5 tasks, on Fix login | about 20m and $1.80 left".
function progress(p: Progress): string {
  const parts = [p.budget === null ? dollars(p.usd) : `${dollars(p.usd)} of ${dollars(p.budget)}`]
  if (p.tasks !== null) {
    parts.push(`${p.tasks.done} of ${p.tasks.total} tasks${p.tasks.current === null ? '' : `, on ${p.tasks.current}`}`)
  }
  if (p.left !== null) {
    parts.push(`about ${age(Math.max(p.left.ms, 60000))} and ${dollars(p.left.usd)} left`)
  }
  if (p.fiveHour !== null) {
    parts.push(`5h limit ${Math.round(p.fiveHour)}%`)
  }
  return parts.join(' | ')
}

function isOver(p: Progress): boolean {
  return p.budget !== null && p.usd >= p.budget
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

// Reads a background landing's log until it ends.
let landWatch: Timer | null = null

// Count a failed or refused call, and follow a landing to its end. It
// never throws, since the tool has run and the .catch would run it again.
async function afterCall($: EngineInterface, what: string, ran: ToolCallResult, isLand: boolean): Promise<void> {
  try {
    const now = await $.clock.now()
    const isFailed = ran.deny !== undefined || ran.isError === true
    if (isFailed) {
      await update($, stats, s => bump(s, now, { failures: (s?.failures ?? 0) + 1, lastFailure: what }))
    }
    if (!isLand) return
    if (ran.deny !== undefined) return await finishLanding($, { state: 'failed', detail: oneLine(ran.deny) })
    // A background run answers at once with the log it writes to. Read the
    // log until it ends. A foreground run has ended, so read its output.
    const said = `${ran.text ?? ''} ${JSON.stringify(ran.result ?? '')}`
    const log = /written to: ([^\s"\\]+?)\.?(?:\s|"|\\|$)/.exec(said)?.[1]
    if (log !== undefined) return watchLanding($, log, now)
    const result = (ran.result ?? {}) as { stdout?: unknown; stderr?: unknown }
    const out = `${typeof result.stdout === 'string' ? result.stdout : ''}\n${typeof result.stderr === 'string' ? result.stderr : ''}`
    await finishLanding($, landed(out, isFailed ? 1 : 0) ?? { state: 'failed', detail: null })
  } catch {
    return
  }
}

function watchLanding($: EngineInterface, log: string, startedAt: number): void {
  landWatch?.cancel()
  const watch = $.clock.every(LAND_POLL_MS, async () => {
    try {
      const now = await $.clock.now()
      const ran = await $.process.run(['tail', '-n', '40', log])
      const outcome = landed(ran.stdout, null)
      if (outcome === null && now - startedAt < LAND_GIVE_UP_MS) return
      watch.cancel()
      await finishLanding($, outcome ?? { state: 'failed', detail: 'Stopped watching after 30m.' })
    } catch {
      return
    }
  })
  landWatch = watch
}

// Record how a landing ended, keep the streak and say so. Only a real
// "land: landed" counts toward the streak, not a run with nothing to land.
async function finishLanding($: EngineInterface, outcome: Pick<Landing, 'state' | 'detail'>): Promise<void> {
  const now = await $.clock.now()
  await update($, stats, s => bump(s, now, { landing: { ...outcome, at: now } }))
  const isReal = outcome.state === 'landed' && /^\w+ on /.test(outcome.detail ?? '')
  if (isReal || outcome.state === 'failed') {
    const was = (await read($, streak)) ?? { current: 0, best: 0 }
    const current = isReal ? was.current + 1 : 0
    const next: Streak = { current, best: Math.max(was.best, current) }
    await update($, streak, () => next)
    await $.store.set('streak', next)
  }
  if (outcome.state === 'landed') {
    $.ui.toast(`BOOM! Landed${outcome.detail === null ? '' : ` ${outcome.detail}`}.`)
    await $.process.run(['sh', `${$.plugin.root}/scripts/play.sh`, 'Land'])
  } else {
    const why = outcome.detail ?? 'no reason given'
    $.ui.toast(`BOOM! The landing failed: ${why}`)
    await notifyInbox($, 'alert', `Landing failed: ${why}`, `The landing failed: ${why}\nFix what it reports and land again.`)
  }
}

// Put an entry at the top of the inbox. An alert also goes out as a desktop
// notification, so it reaches the person away from the terminal.
async function notifyInbox($: EngineInterface, kind: InboxEntry['kind'], text: string, fix: string | null): Promise<void> {
  const now = await $.clock.now()
  const entry: InboxEntry = { id: `${now}:${Math.random().toString(36).slice(2, 8)}`, at: now, kind, text, fix }
  await update($, inbox, list => [entry, ...list.filter(other => !(other.kind === kind && other.text === text))].slice(0, INBOX_KEPT))
  if (kind === 'alert') await $.ui.notify(text, { title: 'BOOM!', key: 'drboom-inbox' }).catch(() => undefined)
}

// The session moved on, so whatever waited on the person has been answered.
async function clearWaiting($: EngineInterface): Promise<void> {
  const list = await read($, inbox)
  if (list.some(entry => entry.kind === 'waiting')) await update($, inbox, l => l.filter(entry => entry.kind !== 'waiting'))
}

// Stop autopilot and say why.
async function pauseAutopilot($: EngineInterface, why: string): Promise<void> {
  await update($, queue, q => ({ ...q, isAuto: false, pausedFor: why }))
  await notifyInbox($, 'alert', `Autopilot paused: ${why}`, null)
}

// After a turn of the main loop, start the next queued task, unless
// something says to stop: a stopped turn, a failed landing or a session over
// its budget. Running out of tasks is worth an alert too.
async function autopilot($: EngineInterface, isAborted: boolean): Promise<void> {
  const q = await read($, queue)
  if (!q.isAuto) return
  if (isAborted) return pauseAutopilot($, 'you stopped the last turn.')
  const s = await read($, stats)
  if (s?.landing?.state === 'failed') return pauseAutopilot($, 'the last landing failed.')
  const { value: r } = await $.state.get(repo)
  if (r?.progress != null && isOver(r.progress)) return pauseAutopilot($, 'the session is over its budget.')
  const [first, ...rest] = q.items
  if (first === undefined) {
    await update($, queue, was => ({ ...was, isAuto: false, pausedFor: null }))
    return notifyInbox($, 'alert', 'Autopilot finished the queue.', null)
  }
  await update($, queue, was => ({ ...was, items: rest }))
  await $.prompt.submit({ text: first.text, asUser: true })
}

// Read the folded cards and the streak back from $.store, where they outlast
// the session. A bad value keeps the default.
async function loadKept($: EngineInterface): Promise<void> {
  try {
    const keptFolded: unknown = await $.store.get('folded')
    if (Array.isArray(keptFolded)) {
      const ids = keptFolded.filter((id): id is string => typeof id === 'string')
      await update($, folded, () => ids)
    }
    const keptStreak: unknown = await $.store.get('streak')
    if (typeof keptStreak === 'object' && keptStreak !== null) {
      const { current, best } = keptStreak as { current?: unknown; best?: unknown }
      if (typeof current === 'number' && typeof best === 'number') await update($, streak, () => ({ current, best }))
    }
  } catch {
    return
  }
}

export const register: Register = on => {
  let turnStartedAt = 0
  // Redraws the band and the pane every 10 seconds, so the uptime and the
  // agents' status stay current.
  // session.start runs again after /clear, so a second start replaces it.
  let tick: Timer | null = null

  on('session.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, stats, s => s ?? bump(null, now, {}))
    await $.command.register({ name: 'boom', description: 'Open the Dr. BOOM pane' })
    await refreshSounds($)
    await loadKept($)
    tick?.cancel()
    tick = $.clock.every(10000, () => $.ui.invalidate('ui.render'))
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
    await clearWaiting($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const now = await $.clock.now()
    const edit = EDIT_TOOLS.has(e.tool) ? 1 : 0
    const path = edit === 1 ? about(e) : ''
    const isLand = e.tool === 'Bash' && LAND.test(e.command)
    await update($, stats, s =>
      bump(s, now, {
        tools: (s?.tools ?? 0) + 1,
        edits: (s?.edits ?? 0) + edit,
        byTool: { ...(s?.byTool ?? {}), [e.tool]: (s?.byTool[e.tool] ?? 0) + 1 },
        calls: [...(s?.calls ?? []).filter(at => now - at < CALLS_KEPT_MS), now].slice(-CALLS_KEPT),
        touched:
          path === ''
            ? (s?.touched ?? {})
            : { ...(s?.touched ?? {}), [path]: { count: (s?.touched[path]?.count ?? 0) + 1, at: now } },
        landing: isLand ? { state: 'running', at: now, detail: null } : (s?.landing ?? null),
      }),
    )
    await clearWaiting($)
    const ran = await next(e)
    await afterCall($, `${e.tool}: ${oneLine(about(e))}`, ran, isLand)
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    const seconds = turnStartedAt === 0 ? null : Math.round((now - turnStartedAt) / 1000)
    await update($, stats, s =>
      bump(s, now, {
        lastTurnSeconds: seconds,
        turns: seconds === null ? (s?.turns ?? []) : [...(s?.turns ?? []), seconds].slice(-TURNS),
      }),
    )
    const done = await next(e)
    // Only the main loop's turns move the queue, not a subagent's.
    if (e.agentId === undefined) await autopilot($, e.isAborted).catch(() => undefined)
    return done
  }).catch(($, e, next) => next(e))

  // A permission prompt or an idle prompt waits on the person. The engine's
  // own Notification hook still plays the sound.
  on('classic.Notification', async ($, e, next) => {
    await notifyInbox($, 'waiting', oneLine(e.message), null)
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
    const { Box, Button, Input, Text } = $.ui.resolve(e)
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

    // Each part of the pane is its own bordered card with a colored title,
    // since a blank line between parts was too little to tell them apart.
    // The button beside a title folds the card down to that title, and the
    // folded set is kept in $.store so it outlasts the session.
    const isFolded = await read($, folded)
    const fold = async (id: string) => {
      const was = await read($, folded)
      const next = was.includes(id) ? was.filter(other => other !== id) : [...was, id]
      await update($, folded, () => next)
      // Losing the saved copy only means the fold lasts this session.
      await $.store.set('folded', next).catch(() => undefined)
    }
    const card = (id: string, title: string, body: RenderChildren) => (
      <Box key={`card:${id}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
        <Box columnGap={1}>
          <Text bold color="cyan">
            {title}
          </Text>
          <Button key={`fold:${id}`} label={isFolded.includes(id) ? '▸' : '▾'} onPress={() => void fold(id)} />
        </Box>
        {!isFolded.includes(id) && body}
      </Box>
    )
    // Every card draws its rows the same way: one line each, cut at the
    // card's edge, a colored mark for how it stands, the name in bold and the
    // details dim. Long text wrapped across many rows buried what mattered.
    const mark = (kind: Mark) => <Text color={MARKS[kind][1]}>{MARKS[kind][0]} </Text>
    const row = (key: string, kind: Mark | null, name: string, detail = '', indent = '') => (
      <Box key={key}>
        <Text wrap="truncate-end">
          {indent}
          {kind !== null && mark(kind)}
          <Text bold>{name}</Text>
          <Text dimColor>{detail === '' ? '' : ` ${oneLine(detail)}`}</Text>
        </Text>
      </Box>
    )
    const note = (key: string, text: string, color?: 'yellow' | 'red') => (
      <Box key={key}>
        <Text wrap="truncate-end" dimColor={color === undefined} color={color}>
          {'  '}
          {oneLine(text)}
        </Text>
      </Box>
    )
    const hasHealth = r != null && (r.health != null || r.connectors != null || r.checks != null)
    const fuse = meter(s?.calls ?? [], now)
    const kept = await read($, streak)
    const byRecent = Object.entries(s?.touched ?? {}).sort((a, b) => b[1].at - a[1].at)
    const touched = byRecent.slice(0, TOUCHED)
    const touchedRest = byRecent.length - touched.length
    // A path inside the repo, from its root.
    const short = (path: string) => (r != null && path.startsWith(`${r.root}/`) ? path.slice(r.root.length + 1) : path)
    const landedCount = (tasks: readonly { state: string }[]) => tasks.filter(task => task.state === 'landed').length

    // The agentic parts: what needs the person, the queue autopilot runs,
    // and the agents at work. A list that fails to read draws as empty.
    const q = await read($, queue)
    const box = await read($, inbox)
    const agents = await $.agent.list().catch(() => [])
    const active = (status: string) => status === 'running' || status === 'pending' || status === 'waiting' || status === 'idle'
    const shownAgents = [...agents]
      .sort((a, b) => Number(active(b.status)) - Number(active(a.status)) || b.startTime - a.startTime)
      .slice(0, AGENTS_SHOWN)
    const runningAgents = agents.filter(a => active(a.status)).length
    // A button press sends the prompt as if typed. It runs once the session is idle.
    const send = (text: string) => void $.prompt.submit({ text, asUser: true }).catch(() => undefined)
    // A row with a Fix button at its end, which asks Claude to fix it.
    const withFix = (key: string, content: RenderChildren, prompt: string) => (
      <Box key={key} columnGap={1}>
        <Box flexGrow={1} flexShrink={1}>
          {content}
        </Box>
        <Button key={`fix:${key}`} label="Fix" onPress={() => send(prompt)} />
      </Box>
    )
    const addTask = async (text: string) => {
      const task = text.trim()
      if (task === '') return
      const id = `${await $.clock.now()}:${Math.random().toString(36).slice(2, 8)}`
      await update($, queue, was => ({ ...was, items: [...was.items, { id, text: task }] }))
    }
    // Turning autopilot on starts the next task now when the session is idle;
    // after that, each turn's end starts the next.
    const toggleAuto = async () => {
      const was = await read($, queue)
      await update($, queue, () => ({ ...was, isAuto: !was.isAuto, pausedFor: null }))
      if (!was.isAuto) {
        const [first, ...rest] = was.items
        if (first !== undefined) {
          await update($, queue, now => ({ ...now, items: rest }))
          send(first.text)
        }
      }
    }
    const runTask = async (id: string) => {
      const was = await read($, queue)
      const task = was.items.find(item => item.id === id)
      if (task === undefined) return
      await update($, queue, now => ({ ...now, items: now.items.filter(item => item.id !== id) }))
      send(task.text)
    }
    const dropTask = (id: string) => update($, queue, was => ({ ...was, items: was.items.filter(item => item.id !== id) }))
    const stopAgent = (id: string, description: string) =>
      void $.tool
        .call({ tool: 'TaskStop', task_id: id, consent: `The user pressed "Stop" on the agent "${description}" in the BOOM pane.` })
        .catch(() => undefined)

    return (
      <Box flexDirection="column">
        {box.length > 0 &&
          card(
            'inbox',
            `Inbox (${box.length})`,
            <Box flexDirection="column">
              {box.map(entry => (
                <Box key={`inbox:${entry.id}`} columnGap={1}>
                  <Box flexGrow={1} flexShrink={1}>
                    <Text wrap="truncate-end">
                      {mark(entry.kind === 'alert' ? 'bad' : 'busy')}
                      <Text bold>{oneLine(entry.text)}</Text>
                      <Text dimColor> {age(now - entry.at)} ago</Text>
                    </Text>
                  </Box>
                  {entry.fix !== null && (
                    <Button key={`inbox:fix:${entry.id}`} label="Fix" onPress={() => send(entry.fix ?? '')} />
                  )}
                  <Button
                    key={`inbox:dismiss:${entry.id}`}
                    label="Dismiss"
                    onPress={() => void update($, inbox, list => list.filter(other => other.id !== entry.id))}
                  />
                </Box>
              ))}
            </Box>,
          )}
        {card(
          'actions',
          'Actions',
          <Box flexWrap="wrap">
            {ACTIONS.map(([label, prompt]) => (
              <Button key={`action:${label}`} label={label} onPress={() => send(prompt)} />
            ))}
          </Box>,
        )}
        {card(
          'queue',
          `Queue${q.items.length === 0 ? '' : ` (${q.items.length})`}`,
          <Box flexDirection="column">
            <Box columnGap={1}>
              <Text wrap="truncate-end">
                {mark(q.isAuto ? 'busy' : 'idle')}
                <Text bold>Autopilot {q.isAuto ? 'on' : 'off'}</Text>
                <Text dimColor>{q.isAuto ? ' runs the next task when a turn ends' : ''}</Text>
              </Text>
              <Button key="queue:auto" label={q.isAuto ? 'Pause' : 'Start'} onPress={() => void toggleAuto()} />
            </Box>
            {q.pausedFor !== null && note('queue:paused', `Paused: ${q.pausedFor}`, 'yellow')}
            {q.items.length === 0 && <Text dimColor>No tasks waiting.</Text>}
            {q.items.map((item, i) => (
              <Box key={`queue:${item.id}`} columnGap={1}>
                <Box flexGrow={1} flexShrink={1}>
                  <Text wrap="truncate-end">
                    <Text dimColor>{String(i + 1).padStart(2)}. </Text>
                    {oneLine(item.text)}
                  </Text>
                </Box>
                <Button key={`queue:run:${item.id}`} label="Run" onPress={() => void runTask(item.id)} />
                <Button key={`queue:drop:${item.id}`} label="✗" onPress={() => void dropTask(item.id)} />
              </Box>
            ))}
            <Input key="queue:add" placeholder="Add a task for autopilot" submitLabel="Add" onSubmit={value => void addTask(value)} />
          </Box>,
        )}
        {agents.length > 0 &&
          card(
            'agents',
            `Agents${runningAgents === 0 ? '' : ` (${runningAgents} running)`}`,
            <Box flexDirection="column">
              {shownAgents.map(a => (
                <Box key={`agent:${a.id}`} flexDirection="column">
                  <Box columnGap={1}>
                    <Box flexGrow={1} flexShrink={1}>
                      <Text wrap="truncate-end">
                        {mark(AGENT_MARKS[a.status])}
                        <Text bold>{oneLine(a.description)}</Text>
                        <Text dimColor>
                          {' '}
                          {a.type} | {age(now - a.startTime)}
                        </Text>
                      </Text>
                    </Box>
                    {active(a.status) && (
                      <Button key={`agent:stop:${a.id}`} label="Stop" onPress={() => stopAgent(a.id, a.description)} />
                    )}
                  </Box>
                  {a.label !== a.description && note(`agent:label:${a.id}`, a.label.split('\n')[0] ?? '')}
                </Box>
              ))}
            </Box>,
          )}
        {card(
          'session',
          'Session',
          <Box flexDirection="column">
            {s === null ? (
              <Text dimColor>Nothing yet.</Text>
            ) : (
              <Box flexDirection="column">
                <Text>
                  <Text bold>{s.prompts}</Text> prompts<Text dimColor> | </Text>
                  <Text bold>{s.tools}</Text> tool calls<Text dimColor> | </Text>
                  <Text bold>{s.edits}</Text> edits
                  {s.failures > 0 && <Text color="yellow"> | {s.failures} failed</Text>}
                </Text>
                {s.lastFailure !== null &&
                  withFix(
                    'failure',
                    note('failure:text', `last failed: ${s.lastFailure}`),
                    `This tool call failed: ${s.lastFailure}\nFind out why and fix it.`,
                  )}
                <Text dimColor>
                  up {age(now - s.startedAt)}
                  {s.lastTurnSeconds === null ? '' : ` | last turn ${s.lastTurnSeconds}s`}
                </Text>
                {s.turns.length > 0 && (
                  <Text wrap="truncate-end">
                    <Text dimColor>turns </Text>
                    <Text color="cyan">{sparkline(s.turns)}</Text>
                    <Text dimColor> longest {Math.max(...s.turns)}s</Text>
                  </Text>
                )}
                <Text wrap="truncate-end">
                  <Text dimColor>fuse  </Text>
                  <Text color={fuse.isBoom ? 'red' : 'yellow'}>{fuse.bar}</Text>
                  <Text dimColor> {fuse.rate}/min</Text>
                  {fuse.isBoom && <Text color="red"> 💥 BOOM!</Text>}
                </Text>
              </Box>
            )}
            {r?.progress != null && (
              <Text wrap="truncate-end" color={isOver(r.progress) ? 'yellow' : undefined}>
                {progress(r.progress)}
              </Text>
            )}
          </Box>,
        )}
        {card(
          'tools',
          'Top tools',
          <Box flexDirection="column">
            {top.length === 0 && <Text dimColor>No tool calls yet.</Text>}
            {top.map(([tool, n]) => (
              <Box key={`tool:${tool}`}>
                <Text wrap="truncate-end">
                  <Text dimColor>{String(n).padStart(4)} </Text>
                  <Text bold>{tool}</Text>
                </Text>
              </Box>
            ))}
          </Box>,
        )}
        {card(
          'files',
          'Files touched',
          <Box flexDirection="column">
            {touched.length === 0 && <Text dimColor>No edits yet.</Text>}
            {touched.map(([path, t]) => (
              <Box key={`touched:${path}`}>
                <Text wrap="truncate-end">
                  <Text dimColor>{`${t.count}×`.padStart(4)} </Text>
                  <Text bold>{short(path)}</Text>
                  <Text dimColor> {age(now - t.at)} ago</Text>
                </Text>
              </Box>
            ))}
            {touchedRest > 0 && <Text dimColor>and {touchedRest} more</Text>}
          </Box>,
        )}
        {card(
          'repo',
          'Repo',
          r == null ? (
            <Text dimColor>Nothing yet.</Text>
          ) : (
            <Box flexDirection="column">
              <Text wrap="truncate-end">
                <Text bold>{r.branch ?? 'no branch'}</Text>
                <Text dimColor>{r.target === null || r.target === r.branch ? '' : ` lands on ${r.target}`}</Text>
              </Text>
              {r.files.length === 0
                ? row('files', 'idle', 'No changes yet')
                : row('files', 'busy', 'Changing', files(r.files))}
              {r.upstream.length > 0 && (
                <Text wrap="truncate-end" color="yellow">
                  {mark('bad')}Rebase: {r.target} changed {files(r.upstream)}
                </Text>
              )}
              {r.paused.map(p => row(`paused:${p.file}:${p.at}`, 'idle', 'Paused', `an edit to ${p.file} ${age(now - p.at)} ago`))}
              {r.ports != null && row('ports', 'idle', 'Ports', `${r.ports} to ${r.ports + 99}`)}
              {r.isAwake === true && row('awake', 'busy', 'Awake', 'keeping this computer awake')}
              {r.setup != null && note('setup', r.setup)}
            </Box>
          ),
        )}
        {(s?.landing != null || kept !== null) &&
          card(
            'landing',
            'Landing',
            <Box flexDirection="column">
              {s?.landing == null && <Text dimColor>No landing this session.</Text>}
              {s?.landing?.state === 'running' && row('land', 'busy', 'Landing', `started ${age(now - s.landing.at)} ago`)}
              {s?.landing?.state === 'landed' &&
                row('land', 'ok', 'Landed', `${s.landing.detail ?? ''} ${age(now - s.landing.at)} ago`)}
              {s?.landing?.state === 'failed' && row('land', 'failed', 'Land failed', `${age(now - s.landing.at)} ago`)}
              {s?.landing?.state === 'failed' &&
                withFix(
                  'land:why',
                  note('land:why:text', s.landing.detail ?? 'No reason given.', 'red'),
                  `The landing failed: ${s.landing.detail ?? 'no reason given'}\nFix what it reports and land again.`,
                )}
              {kept !== null && (
                <Text wrap="truncate-end">
                  <Text color={kept.current > 0 ? 'yellow' : undefined}>{kept.current > 0 ? '🔥' : '○'} </Text>
                  <Text bold>
                    {kept.current} landing{kept.current === 1 ? '' : 's'} in a row
                  </Text>
                  <Text dimColor> | best {kept.best}</Text>
                </Text>
              )}
            </Box>,
          )}
        {r != null &&
          hasHealth &&
          card(
            'health',
            'Health',
            <Box flexDirection="column">
              {r.health != null &&
                (r.health.problems.length === 0
                  ? row('head', 'ok', 'Head', `healthy, checked ${age(now - r.health.at)} ago`)
                  : row('head', 'bad', 'Head', `${r.health.problems.length} problem${r.health.problems.length === 1 ? '' : 's'}`))}
              {r.health?.problems.map((problem, i) =>
                withFix(`health:${i}`, note(`health:${i}:text`, problem.split('\n')[0] ?? '', 'yellow'), `Fix this repo health problem: ${problem}`),
              )}
              {r.connectors != null &&
                row(
                  'connectors',
                  r.connectors.problems.length === 0 ? 'ok' : 'bad',
                  'Connectors',
                  `${r.connectors.ready} connected${r.connectors.problems.length === 0 ? '' : `, ${r.connectors.problems.length} not working`}`,
                )}
              {r.connectors?.problems.map((problem, i) => note(`connector:${i}`, problem, 'yellow'))}
              {r.checks != null &&
                row('checks', r.checks.busy < r.checks.slots ? 'ok' : 'bad', 'Checks', `${r.checks.busy} of ${r.checks.slots} slots busy`)}
            </Box>,
          )}
        {r != null &&
          card(
            'sessions',
            'Sessions',
            <Box flexDirection="column">
              {r.peers.length === 0 && <Text dimColor>No other sessions.</Text>}
              {r.peers.map((peer, i) => (
                <Box key={`peer:${i}`} flexDirection="column">
                  {row(
                    `peer:${i}:name`,
                    peer.progress != null && isOver(peer.progress) ? 'bad' : 'busy',
                    peer.topic ?? 'A session',
                    `${peer.where}${peer.files.length === 0 ? '' : `: ${files(peer.files)}`}`,
                  )}
                  {peer.progress != null &&
                    note(`peer:${i}:progress`, progress(peer.progress), isOver(peer.progress) ? 'yellow' : undefined)}
                </Box>
              ))}
            </Box>,
          )}
        {r?.audit != null &&
          card(
            'audit',
            'Auto mode',
            <Box flexDirection="column">
              <Text>
                <Text color="green">{r.audit.allowed} allowed</Text>
                <Text dimColor> | </Text>
                <Text color={r.audit.denied === 0 ? undefined : 'yellow'}>{r.audit.denied} refused</Text>
              </Text>
              {/* Newest first, with the age in a column so the marks line up. */}
              {[...r.audit.recent].reverse().map((entry, i) => (
                <Box key={`audit:${i}`} flexDirection="column">
                  <Text wrap="truncate-end">
                    <Text dimColor>{age(now - entry.at).padStart(6)} </Text>
                    {entry.decision === 'allow' ? <Text color="green">✓</Text> : <Text color="yellow">✗</Text>}
                    <Text bold> {entry.tool}</Text>
                    <Text dimColor> {oneLine(entry.what)}</Text>
                  </Text>
                  {entry.decision === 'deny' && entry.reason !== null && (
                    <Text color="yellow" wrap="truncate-end">
                      {'         '}
                      {oneLine(entry.reason)}
                    </Text>
                  )}
                </Box>
              ))}
              <Text dimColor>/audit lists them all</Text>
            </Box>,
          )}
        {r?.plans != null &&
          r.plans.length > 0 &&
          card(
            'plans',
            'Plans',
            <Box flexDirection="column">
              {r.plans.map(plan => (
                <Box key={`plan:${plan.id}`} flexDirection="column">
                  {row(
                    `plan:${plan.id}:goal`,
                    PLAN_MARKS[plan.state],
                    plan.goal,
                    `${plan.id} | ${plan.state}, ${landedCount(plan.tasks)} of ${plan.tasks.length} landed`,
                  )}
                  {plan.tasks.map(task => {
                    const line = row(
                      `task:${plan.id}:${task.id}`,
                      TASK_MARKS[task.state],
                      task.id,
                      `${task.state}${task.usd == null ? '' : `, ${dollars(task.usd)}`}${task.note === null ? '' : ` (${task.note.split('\n')[0]})`}`,
                      '  ',
                    )
                    return task.state === 'failed'
                      ? withFix(
                          `task:${plan.id}:${task.id}:fix`,
                          line,
                          `Task ${task.id} of plan ${plan.id} (${plan.goal}) failed${task.note === null ? '' : `: ${task.note}`}\nFind out why and fix it.`,
                        )
                      : line
                  })}
                </Box>
              ))}
            </Box>,
          )}
        {card(
          'sounds',
          `Sounds${board?.isMuted === true ? ' (muted)' : ''}`,
          <Box flexDirection="column">
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
          </Box>,
        )}
        <Text dimColor italic wrap="truncate-end">
          {' '}Sergeant Stupid: "{QUIPS[(s?.prompts ?? 0) % QUIPS.length]}"
        </Text>
      </Box>
    )
    // Nothing beneath draws a plugin's pane, so next(e) would leave it blank.
    // Say what went wrong instead.
  }).catch(($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text color="red">BOOM! The pane failed to draw.</Text>
        <Text dimColor>{next.error.message ?? next.error.kind}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Spinner' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, word: pick(SPINNER_WORDS, e.props.word) } }),
  ).catch(($, e, next) => next(e))

  on('ui.render', { component: 'TurnDuration' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, word: pick(FOOTER_WORDS, e.props.word) } }),
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
