# Slack messaging

Slack messaging is an optional feature. It uses your own Slack app and a direct Socket Mode connection from Gratis. No public callback server or additional hosting is needed. Keep Gratis and the computer running; messages sent while it is offline are subject to Slack's retry window.

This first version links one Slack workspace and one Slack user to this desktop. That user can message a selected existing Gratis agent in DMs or explicitly allowed channels. Other people cannot spend your provider subscription through this connection. It does not publish every agent as its own Slack app or grant a shared team member access to your personal tools.

## Connect

1. Open Settings → Connections and computer → Messaging → Connect Slack.
2. Expand **Create your Slack app** and choose **Copy app manifest**. Open Slack app settings and create an app **from a manifest**, choosing your test workspace and pasting the JSON.
3. Install the app to that workspace. In **OAuth & Permissions**, copy its bot token, which starts with `xoxb-`.
4. In **Basic Information → App-Level Tokens**, generate a token with `connections:write`. It starts with `xapp-`. Socket Mode, bot events and interactivity are already in the manifest.
5. Paste both tokens into Gratis, select your existing agent, and choose **Save and connect**. Tokens are saved with the existing OS-backed encryption and cleared from the form after saving.
6. Choose **Link my Slack account**. DM the Slack app the displayed `connect CODE` command within ten minutes. The code is single-use and only its hash is stored.
7. For channels, invite the app in Slack, choose **Choose channels the app has joined**, select the channels and save. You can also enter channel IDs. No channel is joined automatically.
8. DM the bot or mention it in an allowed channel. Replies stay in that Slack thread. Follow-up messages in a linked thread do not need another mention.

Leave the DM access checkboxes off until needed. **Allow personal memory** includes the memory already available to that agent only in your linked DMs. **Allow tools** enables that agent's existing tool capabilities in your DMs. Neither option enables private memory, Files, computer use or connected apps in shared channels. Agent instructions still apply in channels, so review those before allowing a channel.

## Behavior and recovery

- Slack threads become separate conversations under the same Gratis agent. Existing personal history is not copied in and the selected desktop chat does not change.
- The initial working message becomes the final answer. Long answers are split into ordered parts. Detailed tool logs stay in Gratis.
- A Stop button or `stop`/`cancel` in the linked thread cancels the request. Only the requesting user can use its controls.
- Short, non-sensitive tool approvals show the action in Slack with Approve and Deny. Large or credential-shaped arguments must be reviewed in Gratis. Expired approval buttons cannot grant access.
- The receipt is saved before Slack is acknowledged. Replayed events do not start another run. Inbound receipts and outgoing messages are encrypted on disk.
- A rate-limited send waits before trying again. An uncertain send is marked for review rather than blindly duplicated. **Check uncertain deliveries** looks for the saved delivery marker or safely repeats an update to a known message. If Slack cannot prove delivery, inspect the thread and use the saved Gratis reply manually.
- A run interrupted by a restart is inspected for its saved reply; it is not automatically executed again. A corrupt messaging file is preserved and disables this integration rather than resetting it.
- Disconnect stops local ingestion and active Slack requests, cancels queued delivery, and deletes the saved Slack credentials. It preserves your conversations. To revoke the Slack app's access at Slack as well, uninstall it in your workspace's app settings.

## Current boundaries

This is a local, owner-linked pilot. It does not provide multi-user Slack account management, hosted OAuth, an offline relay, Slack Marketplace distribution, inbound file imports, or Slack-accessible public Pages. Private `gratis://` links are replaced with an instruction to open the Page in Gratis.

A single Slack app retains its own Slack identity. The chosen Gratis agent remains the same record on desktop, with the same instructions and avatar. Separate per-agent Slack app identities require separate installations and are not implied by changing the selected agent here.

## Verification

`node --test test/messaging.test.mjs test/slack-transport.test.mjs` covers routing, user/workspace isolation, redelivery, rate limits, uncertain sends, recovery, approval ownership/expiry, secret suppression and message splitting. `node test/slack-desktop.mjs` exercises the real desktop UI against a synthetic Slack transport. It uses a temporary profile and mock keychain; it does not connect a real workspace or consume provider usage. Release smoke checks include it.

A live workspace check still requires installing your own Slack app, linking an opted-in account and testing a disposable channel. Passing synthetic tests does not establish that live check.
