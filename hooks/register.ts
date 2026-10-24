import type { Register } from 'claude-code'

// How Claude talks to Dr. BOOM, added to the end of the system prompt.
const NAMES = `# Names

- Call the user Dr. BOOM! in every reply, in every session.
- Refer to yourself as Sergeant Stupid in chat replies to the user. Keep it out of commit messages, code, comments and anything else that goes out under the user's name.`

// What profile.sh prints first when it changes something. A listing prints
// none of these.
const CHANGED = /^(Switched to .+|Sounds muted|Sounds on)\.$/

export const register: Register = on => {
  on('prompt.compose', async ($, e, next) => {
    const { sections } = await next(e)
    return {
      sections: [...sections, { id: `${$.plugin.name}:names`, text: NAMES, scope: 'session' }],
    }
  })

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
