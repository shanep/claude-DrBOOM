import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'drboom',
  component: 'Pane',
  requestId: 'boom',
  props: {
    title: 'BOOM!',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('the pane shows what the workflow plugin knows', async ($, on) => {
  on('clock.now', () => ({ value: 120_000 }))
  on('state.get', (_, e, next) =>
    e.plugin === 'workflow'
      ? {
          value: {
            value: {
              root: '/repo/wt',
              target: 'master',
              branch: 'feature',
              files: ['a.txt'],
              peers: [
                {
                  topic: 'Fix the b file',
                  where: 'on branch master',
                  files: ['b.txt'],
                  progress: { usd: 6, budget: 5, tasks: null, left: null, fiveHour: null },
                },
              ],
              paused: [{ file: 'b.txt', at: 0 }],
              upstream: ['a.txt'],
              ports: 40100,
              setup: 'Copied node_modules from the main checkout.',
              isAwake: true,
              audit: {
                allowed: 4,
                denied: 1,
                recent: [
                  { at: 60_000, tool: 'Bash', what: 'npm install', decision: 'allow', reason: null },
                  { at: 60_000, tool: 'Bash', what: 'rm -rf build', decision: 'deny', reason: 'Destructive.' },
                ],
              },
              checks: { busy: 1, slots: 3 },
              connectors: { at: 0, ready: 6, problems: ['claude.ai Gmail: Needs authentication'] },
              health: { at: 0, problems: ['Local master has 1 commit(s) that are not on origin. Land them.'] },
              plans: [
                {
                  id: 'mh2k1',
                  goal: 'Add dark mode',
                  state: 'running',
                  tasks: [
                    { id: 'theme', title: 'Theme', state: 'landed', note: 'abc1234', session: 'plan-mh2k1-theme', usd: 1.5 },
                    { id: 'toggle', title: 'Toggle', state: 'failed', note: 'Tests fail.', session: 'plan-mh2k1-toggle' },
                    { id: 'docs', title: 'Docs', state: 'waiting', note: null, session: null },
                  ],
                },
              ],
              progress: {
                usd: 1.2,
                budget: 5,
                tasks: { done: 2, total: 5, current: 'Fix login' },
                left: { usd: 1.8, ms: 1_200_000 },
                fiveHour: 19.4,
              },
            },
            version: 1,
          },
        }
      : next(e),
  )

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const line = async (text: RegExp) => (await ui.find({ type: 'Text', text }))?.text
    expect(await line(/lands on/)).toBe('feature lands on master')
    expect(await line(/Changing/)).toBe('● Changing a.txt')
    expect(await line(/Rebase/)).toBe('✗ Rebase: master changed a.txt')
    expect(await line(/Fix the b file/)).toBe('✗ Fix the b file on branch master: b.txt')
    expect(await line(/Paused/)).toBe('○ Paused an edit to b.txt 2m ago')
    expect(await line(/Ports/)).toBe('○ Ports 40100 to 40199')
    expect(await line(/Copied/)).toBe('  Copied node_modules from the main checkout.')
    expect(await line(/Checks/)).toBe('✓ Checks 1 of 3 slots busy')
    expect(await line(/awake/)).toBe('● Awake keeping this computer awake')
    expect(await line(/allowed/)).toBe('4 allowed | 1 refused')
    expect(await line(/npm install/)).toBe('    1m ✓ Bash npm install')
    expect(await line(/rm -rf/)).toBe('    1m ✗ Bash rm -rf build')
    expect(await line(/Destructive/)).toBe('         Destructive.')
    expect(await line(/Connectors/)).toBe('✗ Connectors 6 connected, 1 not working')
    expect(await line(/Gmail/)).toBe('  claude.ai Gmail: Needs authentication')
    expect(await line(/Head/)).toBe('✗ Head 1 problem')
    expect(await line(/Local master/)).toBe('  Local master has 1 commit(s) that are not on origin. Land them.')
    expect(await line(/mh2k1/)).toBe('● Add dark mode mh2k1 | running, 1 of 3 landed')
    expect(await line(/toggle/)).toBe('  ✗ toggle failed (Tests fail.)')
    expect(await line(/docs/)).toBe('  ○ docs waiting')
    expect(await line(/theme/)).toBe('  ✓ theme landed, $1.50 (abc1234)')
    expect((await ui.find({ type: 'Text', text: /^\$1\.20/ }))?.text).toBe(
      '$1.20 of $5.00 | 2 of 5 tasks, on Fix login | about 20m and $1.80 left | 5h limit 19%',
    )
    expect((await ui.find({ type: 'Text', text: /\$6\.00/ }))?.text).toBe('  $6.00 of $5.00')
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    const titles = ['Session', 'Top tools', 'Repo', 'Health', 'Sessions', 'Auto mode', 'Plans', 'Sounds'].map(t =>
      texts.indexOf(t),
    )
    expect(titles.every((at, i) => at >= 0 && (i === 0 || at > (titles[i - 1] ?? -1)))).toBe(true)
    const health = texts.findIndex(t => t?.startsWith('✗ Head'))
    expect(health > texts.indexOf('Health') && health < texts.indexOf('Sessions')).toBe(true)
    await ui.unmount()
  }
})

test('the pane says nothing yet without the workflow plugin', async ($, on) => {
  on('clock.now', () => ({ value: 0 }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts[texts.indexOf('Repo') + 1]).toBe('Nothing yet.')
  await ui.unmount()
})

test('the pane says it failed when the repo state is malformed', async ($, on) => {
  on('clock.now', () => ({ value: 0 }))
  on('state.get', (_, e, next) =>
    e.plugin === 'workflow' ? { value: { value: { branch: 'feature', target: null }, version: 1 } } : next(e),
  )
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /failed/ }))?.text).toBe('BOOM! The pane failed to draw.')
  await ui.unmount()
})

test('the pane follows a landing, counts failures and lists edited files', async ($, on) => {
  on('clock.now', () => ({ value: 120_000 }))
  mock.store(on)
  on('tool.call', (_, e) => {
    if (e.tool === 'Bash' && e.command.includes('bin/land')) {
      return { result: { stdout: 'land: landed abc1234 on master.\n', stderr: '', interrupted: false } }
    }
    if (e.tool === 'Bash') return { deny: 'Not today.' }
    return { result: { filePath: '/x/a.txt', oldString: '', newString: '', originalFile: '', structuredPatch: [], userModified: false, replaceAll: false } }
  })
  await $.tool.call({ tool: 'Edit', file_path: '/x/a.txt', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: '/x/a.txt', old_string: 'b', new_string: 'c' })
  await $.tool.call({ tool: 'Bash', command: 'rm -rf /' })
  await $.tool.call({ tool: 'Bash', command: '~/.claude/bin/land' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const line = async (text: RegExp) => (await ui.find({ type: 'Text', text }))?.text
  expect(await line(/failed$/)).toBe('0 prompts | 4 tool calls | 2 edits | 1 failed')
  expect(await line(/last failed/)).toBe('  last failed: Bash: rm -rf /')
  expect(await line(/a\.txt/)).toBe('  2× /x/a.txt 0m ago')
  expect(await line(/Landed/)).toBe('✓ Landed abc1234 on master 0m ago')
  expect(await line(/in a row/)).toBe('🔥 1 landing in a row | best 1')
  expect(await line(/fuse/)).toBe('fuse  ╸········· 4/min')

  // Folding a card leaves only its title, and pressing again opens it.
  await ui.press({ key: 'fold:files' })
  expect(await line(/a\.txt/)).toBe(undefined)
  await ui.press({ key: 'fold:files' })
  expect(await line(/a\.txt/)).toBe('  2× /x/a.txt 0m ago')
  await ui.unmount()
})
