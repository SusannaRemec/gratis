# Choose connected apps per bot

A user opens a bot's settings and picks which connected apps that bot may use. The list shows every connected app by name, all ticked until the user narrows it, and the choice persists on the bot.

## Sub-features

- `bot-apps-list` lists each connected app by name under Connected apps, all ticked when the bot has no selection.
- `bot-apps-save` unticks an app, saves, and reopens to find the choice kept. Ticking every app again stores no selection.
- `bot-apps-switch` hides the list while Connected apps is unticked and restores it with the choice intact.
- `bot-apps-empty` shows one line pointing to Settings, Connections when no app is connected.
- `bot-apps-composio` lists Composio first when signed in. Not scripted, because Composio must never be configured here. Selection logic is covered by `test/bot-apps.test.mjs`.

## How to get to it (user POV)

- Click the bot's name in the chat header (`#edit-bot`), or choose Edit from a bot's menu. Scroll to Capabilities.

## Driving it with verify-gratis

Preconditions:

- `bot-apps` starts from a profile whose `direct-apps.secure` holds two custom apps, Verify Notes and Verify Mail, each with a fake token and a `.invalid` address. The runner writes it with the app's own encryptor in a first launch, then reopens the app. No sign-in happens and the demo provider never builds an app runtime, so nothing is contacted.
- `bot-apps-empty` starts from an empty profile.

- **Open.** Click `#edit-bot`. `#bot-apps` lists the apps as checked labels.
- **Choose.** Untick Verify Mail and click `#save-bot`.
- **Read back.** `window.orbit.snapshot()` and `workspace.json` show `apps: ['custom_verify_notes']` on the bot.
- **Reopen.** The dialog shows Verify Notes ticked and Verify Mail unticked.
- **Switch.** Untick `#bot-connections`. `#bot-apps` hides. Tick it again and the choice is intact.
- **Everything again.** Tick Verify Mail and save. The `apps` field is gone from the bot.
- **Run it.** `node .claude/skills/verify-gratis/scripts/run.mjs bot-apps` and `... bot-apps-empty`. Proof is the numbered PNGs, which each scroll Capabilities into view, and `workspace.json`.

## Gotchas

- The dialog scrolls, so `capture` shows only the top until the journey scrolls `#bot-connections` into view.
- The list loads after the dialog opens. Wait for `#bot-apps input` or `#bot-apps .field-note` before asserting.
- A seeded app is a fixture, not a sign-in. The OAuth flow itself is covered by `test/direct-apps.test.mjs`.
