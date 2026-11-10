# Gratis Core verification map

This directory is the maintained source for verifying the user-facing behavior of Gratis Core. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Run every command from the repo root. Run `npm ci` once.
- `node .claude/skills/verify-gratis/scripts/doctor.mjs` exits 0.
- Each run starts from an empty profile at `$TMPDIR/gratis-verify-profile-*`. It contains one bot named `Gratis` with one empty conversation, and the provider is `demo`.
- Never drive an instance this run did not start. Never use the person's real data folder or Keychain.

## Driving conventions

- Scripted journeys run with `node .claude/skills/verify-gratis/scripts/run.mjs <journey>`.
- A feature without a scripted journey gets driven by a scratch script that imports `withApp` from `scripts/lib.mjs`. Add the journey to `run.mjs` once it is stable.
- Prefer element IDs from `src/index.html` and ARIA names over DOM position.
- Open a chat by clicking its tile in `#home-bots`. The composer is hidden on the home screen.
- Never change the provider and never connect external accounts.

## Proof and skip reporting

- Capture a screenshot before and after the action. The runner does this through `capture(label)`.
- Check a stored side effect for every mutation. Use the copied `workspace.json`, an IPC read such as `window.orbit.schedulesView`, or a file in the profile.
- Any renderer error fails the run.
- Report the evidence folder the runner prints. Report a skipped entry point as skipped, never as verified through a different path.

## Feature entry contract

Each feature file has an H1 title, one paragraph of user-visible behavior, then four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-gratis`, `Gotchas`.

## Features

- [Send a chat message](./chat.md) covers composing, sending, the streamed demo reply, and persistence. Journey `chat`.
- [Create a bot](./create-bot.md) covers the create dialog, naming, and the new bot in the sidebar. Journeys `create-bot` and `create-first-bot`.
- [Scheduled tasks](./schedules.md) covers creating a schedule from the composer menu and its encrypted storage. Journey `schedules`.
- [Settings and provider](./settings.md) covers opening Settings and confirming the provider, read-only. No journey yet.
