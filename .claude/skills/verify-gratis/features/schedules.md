# Scheduled tasks

A user saves a recurring task for a chat from the composer's plus menu. The task shows in the schedules list, and the app stores it encrypted in the profile.

## Sub-features

- `schedule-create` saves a schedule with a title, prompt, and default timing.
- `schedule-list` shows the saved schedule as a heading.
- `schedule-store` writes `schedules.secure` without plaintext titles.
- `schedule-edit`, `schedule-remove`, and `schedule-run-now` are reachable from the list. Not yet scripted.

## How to get to it (user POV)

- Open a chat, click the composer's plus button (`#attach-menu`), and choose the "Scheduled tasks" menu item.

## Driving it with verify-gratis

Preconditions:

- Empty profile, with the chat for `Gratis` open.

- **Open editor.** Click `#attach-menu`, then the menuitem matching `/Scheduled tasks/`. `#schedule-title` is visible.
- **Fill.** Fill `#schedule-title` with a unique title and `#schedule-prompt` with a task. The timezone defaults to the system zone.
- **Save.** Click `#schedule-save`. A heading with the title appears.
- **Confirm by a second view.** `window.orbit.schedulesView({conversationId})` returns the title. `schedules.secure` exists in the profile and does not contain the title as plaintext.
- **Run it.** `node .claude/skills/verify-gratis/scripts/run.mjs schedules`. Proof is `01-schedule-form.png`, `02-schedule-listed.png`, and `log.json` with `storedBytes`.

## Gotchas

- `schedules.secure` is encrypted with Electron safeStorage under `--use-mock-keychain`. That proves storage behavior, not real Keychain permission.
- "Run now" sends the saved prompt as a real chat run. In a demo profile that's safe. Never use it with any other provider.
- The schedule fires on a timer while the app is running. Keep runs short so a schedule doesn't fire mid-journey.
