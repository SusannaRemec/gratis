# Create a bot

A user creates a new assistant from the sidebar's plus button. They give it a name and an avatar, and it appears in the sidebar with its own chat.

## Sub-features

- `bot-create` creates a named bot with the default avatar.
- `bot-create-avatar` picks a shape and color in the dialog. Not yet scripted.
- `bot-create-cancel` closes the dialog without creating a bot. Not yet scripted.
- `bot-create-empty` keeps Create disabled while the name is blank.

## How to get to it (user POV)

- Click the plus button at the top of the sidebar (`#new-bot`).
- Click `#create-first-bot` on the empty home screen when no bots exist.

## Driving it with verify-gratis

Preconditions:

- Empty profile. It has one bot, `Gratis`.

- **Open dialog.** Click `#new-bot`. `#create-bot-dialog` opens and `#create-bot-submit` is disabled.
- **Name.** Fill `#new-bot-name` with a unique name. `#create-bot-submit` becomes enabled.
- **Create.** Click `#create-bot-submit`. The dialog closes.
- **Persist.** `workspace.json` lists the new bot, and the name is visible in the window.
- **Run it.** `node .claude/skills/verify-gratis/scripts/run.mjs create-bot`. Proof is `01-create-dialog.png`, `02-after-create.png`, and `workspace.json`.

## Gotchas

- `#create-first-bot` only appears when the profile has no bots. Reaching it needs a seeded `workspace.json` with an empty `bots` array, which this map does not script yet.
- The new bot uses `promptMode: 'auto'`, so its first chat message triggers prompt setup.
- `main.cjs` tries to start a cloud computer after create only when a cloud connection is configured. A fresh profile has none, so nothing is contacted.
