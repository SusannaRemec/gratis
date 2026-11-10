---
name: verify-gratis
description: Drive the real Gratis Core Electron desktop app (this repo) in a throwaway profile and capture proof that a user-facing feature works. Use after changing renderer, IPC, chat-service, bot, or schedule code, or whenever you need screenshots plus persisted-state evidence of desktop behavior. Demo provider only.
---

# Verify Gratis Core

Gratis Core is an Electron app. The surface a user touches is one window. It has a bot sidebar, a home screen of bot tiles, a chat view with a composer, and dialogs (create bot, settings, schedules). The scripts here drive that window with Playwright's Electron driver through the repo's own launcher, `test/electron-fixture.mjs`.

## Safety rules

These rules are not negotiable. The scripts enforce the first three.

- Every run uses a fresh profile at `$TMPDIR/gratis-verify-profile-*`. That path is passed as `GRATIS_DATA_DIR`. `test/electron-fixture.mjs` rejects any profile outside the system temp folder and adds `--use-mock-keychain` on macOS.
- `lib.mjs` reads `settings.provider` from the running app and aborts unless it is `demo`. A fresh profile defaults to `demo` (`DEFAULT_SETTINGS` in `src/store.mjs`).
- Never open or read the person's real data. That means the repo's `data/` folder, `~/Library/Application Support/<edition>/`, and their Keychain. Never point `GRATIS_DATA_DIR` anywhere else.
- Never switch the provider to Claude, Codex, or local. Never configure Composio, Slack, cloud computer, or T3. Those spend real usage or contact real accounts. For those features, document the journey in the feature map and stop there.

## Launch

Run every command from the repo root. The first command is a one-time install.

```sh
npm ci
node .claude/skills/verify-gratis/scripts/doctor.mjs
node .claude/skills/verify-gratis/scripts/run.mjs <journey>
```

`run.mjs` launches the app, waits until it is ready, runs one journey, saves evidence, closes the app, and deletes the profile. A run takes about 2 to 5 seconds. Ready means usable, not just that a process started. A visible bot tile in `#home-bots`, the empty-state `#create-first-bot` button, or a visible `#prompt` must be rendered, and the provider check must pass. An empty profile needs no seed or migration. The app creates the bot "Gratis" and one empty conversation.

The window is visible by default because screenshots need a real window. Set `VERIFY_HIDDEN=1` to keep `GRATIS_TEST_HIDDEN=1` from the fixture. In hidden mode, a capture taken in the first moments after launch has been seen to show a stale frame, so trust hidden screenshots only after the ready wait.

The app takes a single-instance lock and `recovery.lock` per data folder, so parallel runs with different profiles do not collide. Never set two runs to the same profile.

Journeys today: `chat`, `create-bot`, `create-first-bot`, `schedules`. To add one, add a function to `journeys` in `scripts/run.mjs`. It receives `{app, page, capture, step, workspace, profile, evidence}`. A journey that needs a starting `workspace.json` adds a builder to `seeds` in the same file. For ad-hoc exploration, import `withApp` from `scripts/lib.mjs` in a scratch script outside the repo and pass it your own journey function.

## Doctor

```sh
node .claude/skills/verify-gratis/scripts/doctor.mjs
```

This check is read-only. It confirms Node >= 20, that Electron and `@playwright/test` are installed, that the fixture exists, and the build (`git describe --dirty`). It also lists any leftover verify profiles and whether their `recovery.lock` PID is still running. Exit 0 means the setup is worth driving. Run it first, and again whenever a run hangs or fails strangely.

## Drive

These selectors are confirmed against `src/index.html` and `src/renderer.mjs`. Prefer IDs and ARIA names.

- Home tile for a bot: `#home-bots button` (aria-label `"<Bot>, Local demo ready"`). The composer stays hidden (`.composer-area[hidden]`) until a chat is open.
- Composer: `#prompt` (textarea, aria-label "Message"), `#send`, `#stop`, `#attach-menu`.
- Messages: `#messages article.message.user` and `#messages article.message.assistant`. A reply is finished when its "Copy message" button appears, because `renderer.mjs` shows it only after `status !== 'streaming'`.
- Create bot: `#new-bot`, `#new-bot-name`, `#create-bot-submit`, `#create-bot-dialog`.
- Schedules: `#attach-menu`, then menuitem `/Scheduled tasks/`, then `#schedule-title`, `#schedule-prompt`, `#schedule-timezone`, `#schedule-save`. The saved item shows as a heading with its title.
- Settings: `#settings-button`, `#settings-dialog`, `#provider`. Read them only. Never change the provider.

To read state, use the real IPC bridge `window.orbit.snapshot()` and `window.orbit.<feature>View(...)` inside `page.evaluate`. Never call `orbit.updateSettings` or other setters to make a journey pass.

## Evidence

Each run writes to `$TMPDIR/gratis-verify-evidence/<journey>-<timestamp>/` (on macOS, `/var/folders/.../T/gratis-verify-evidence/`). The runner prints the exact path on its last line.

- Numbered PNGs (`01-before-send.png`, ...) capture the screen before and after the action.
- `workspace.json` is a copy of the persisted state at the end of the run. It proves side effects such as messages and bots.
- `log.json` holds the steps, timings, renderer errors, and the pass result or failure stack.

Proof standards:

- Drive the user path through clicks and typing. Never use internal setters or test-only endpoints.
- Capture the action and the resulting state.
- Check side effects alongside the screen (the `workspace.json` contents, `schedules.secure` written and encrypted).
- Any renderer `pageerror` or console error fails the run.
- The demo provider is a production code path (`src/backend.mjs:44`). It is not a mock. It does not exercise `src/claude-backend.mjs`, so a pass says nothing about real Claude replies.

## Cleanup

`run.mjs` closes the Electron app it launched and deletes its own profile in a `finally` block. If a run was killed partway through, use:

```sh
node .claude/skills/verify-gratis/scripts/cleanup.mjs
```

It touches only `$TMPDIR/gratis-verify-profile-*`. `lib.mjs` launches every app with `--gratis-verify-profile=<profile dir>`. If a profile's `recovery.lock` PID is alive and its command line carries that exact flag, cleanup sends it SIGTERM, then SIGKILL after 10 seconds. A live PID without the flag was reused by another process, so cleanup leaves it alone and only deletes the stale profile. It never kills by process name. If it cannot inspect a PID, it leaves both the process and the profile. It never touches `gratis-verify-evidence`. It never touches `gratis-verify-evidence`.

## Feature map

`features/README.md` indexes the user-facing features. Each one has a file covering how to reach it, how to drive it, and the end state that proves it works. A proof is incomplete if it drives one convenient entry point when the map lists others.
