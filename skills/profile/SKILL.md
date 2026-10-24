---
name: profile
description: List, switch, mute or unmute Dr. BOOM sound profiles
argument-hint: "[profile-name | mute | unmute]"
disable-model-invocation: true
allowed-tools: Bash(sh *scripts/profile.sh*)
---

Run this command exactly once with the Bash tool and show its output to the
user without adding anything else:

```
sh "${CLAUDE_PLUGIN_ROOT}/scripts/profile.sh" --data "${CLAUDE_PLUGIN_DATA}" $ARGUMENTS
```

If it exits with an error, show the error and stop.
