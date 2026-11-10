# Settings and provider

A user opens Settings from the sidebar to see which AI provider the app uses, adjust appearance and voice options, and read the build identity.

## Sub-features

- `settings-open` opens and closes the Settings dialog.
- `settings-provider-read` shows the current provider in `#provider`.
- `settings-build` shows the build identity in `#app-build`.
- `settings-provider-change` switches providers. Out of scope, because it would leave demo mode.

## How to get to it (user POV)

- Click `#settings-button` in the sidebar.

## Driving it with verify-gratis

Preconditions:

- Empty profile with provider `demo`.
- No scripted journey yet. Drive it with a scratch script that calls `withApp` from `scripts/lib.mjs`.

- **Open.** Click `#settings-button`. `#settings-dialog` is visible.
- **Read provider.** `#provider` has the value `demo`.
- **Read build.** `#app-build` is not empty.
- **Close.** Click `#settings-dialog .dialog-heading .close-dialog`. The dialog is no longer visible.

## Gotchas

- Never submit `#settings-form` after changing `#provider`. Claude and Codex spend real usage. Local contacts a loopback server that may not be the user's to drive.
- Opening Settings may trigger read-only status checks such as `orbit.claudeStatus`, which runs `claude auth status`. Unverified. Check `log.json` and avoid the provider panels if that matters.
