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
              peers: [{ topic: 'Fix the b file', where: 'on branch master', files: ['b.txt'] }],
              paused: [{ file: 'b.txt', at: 0 }],
              upstream: ['a.txt'],
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
