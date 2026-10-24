import type { Register } from 'claude-code'

// How Claude talks to Dr. BOOM, added to the end of the system prompt.
const NAMES = `# Names

- Call the user Dr. BOOM! in every reply, in every session.
- Refer to yourself as Sergeant Stupid in chat replies to the user. Keep it out of commit messages, code, comments and anything else that goes out under the user's name.`

export const register: Register = on => {
  // Plugin values sit beneath the settings files, so a TUI picked in
  // /config still wins. One-source reads are left alone.
  on('settings.read', async ($, e, next) => {
    const settings = await next(e)
    if (e.source !== undefined) return settings
    return { tui: 'fullscreen', ...settings }
  }).catch(($, e, next) => next(e))

  on('prompt.compose', async ($, e, next) => {
    const { sections } = await next(e)
    return {
      sections: [...sections, { id: `${$.plugin.name}:names`, text: NAMES, scope: 'session' }],
    }
  })
}
