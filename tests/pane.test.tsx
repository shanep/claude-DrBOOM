import { expect, test } from 'claude-code/testing'

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
    expect((await ui.find({ type: 'Text', text: /lands on/ }))?.text).toBe('feature | lands on master')
    expect((await ui.find({ type: 'Text', text: /^Changing/ }))?.text).toBe('Changing a.txt')
    expect((await ui.find({ type: 'Text', text: /^Rebase/ }))?.text).toBe('Rebase: master changed a.txt')
    expect((await ui.find({ type: 'Text', text: /Fix the b file/ }))?.text).toBe('"Fix the b file" on branch master: b.txt')
    expect((await ui.find({ type: 'Text', text: /^Paused/ }))?.text).toBe('Paused an edit to b.txt 2m ago')
    expect((await ui.find({ type: 'Text', text: /^Ports/ }))?.text).toBe('Ports 40100 to 40199')
    expect((await ui.find({ type: 'Text', text: /^Copied/ }))?.text).toBe('Copied node_modules from the main checkout.')
    expect((await ui.find({ type: 'Text', text: /^Checks/ }))?.text).toBe('Checks: 1 of 3 slots busy')
    expect((await ui.find({ type: 'Text', text: /awake/ }))?.text).toBe('Keeping this computer awake')
    expect((await ui.find({ type: 'Text', text: /^Let/ }))?.text).toBe('Let 4 through | refused 1 | /audit lists them')
    expect((await ui.find({ type: 'Text', text: /npm install/ }))?.text).toBe('1m ago let through Bash: npm install')
    expect((await ui.find({ type: 'Text', text: /rm -rf/ }))?.text).toBe('1m ago refused Bash: rm -rf build')
    expect((await ui.find({ type: 'Text', text: /^Connectors/ }))?.text).toBe('Connectors: 6 connected, 1 not working')
    expect((await ui.find({ type: 'Text', text: /Gmail/ }))?.text).toBe('- claude.ai Gmail: Needs authentication')
    expect((await ui.find({ type: 'Text', text: /^Health/ }))?.text).toBe('Health: 1 problem at head')
    expect((await ui.find({ type: 'Text', text: /^- Local/ }))?.text).toBe('- Local master has 1 commit(s) that are not on origin. Land them.')
    expect((await ui.find({ type: 'Text', text: /^mh2k1/ }))?.text).toBe('mh2k1: Add dark mode | running, 1 of 3 landed')
    expect((await ui.find({ type: 'Text', text: /toggle/ }))?.text).toBe('  toggle: failed (Tests fail.)')
    expect((await ui.find({ type: 'Text', text: /docs/ }))?.text).toBe('  docs: waiting')
    expect((await ui.find({ type: 'Text', text: /theme/ }))?.text).toBe('  theme: landed, $1.50 (abc1234)')
    expect((await ui.find({ type: 'Text', text: /^\$1\.20/ }))?.text).toBe(
      '$1.20 of $5.00 | 2 of 5 tasks, on Fix login | about 20m and $1.80 left | 5h limit 19%',
    )
    expect((await ui.find({ type: 'Text', text: /\$6\.00/ }))?.text).toBe('  $6.00 of $5.00')
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
