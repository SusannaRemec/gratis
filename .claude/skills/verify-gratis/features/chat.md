# Send a chat message

A user opens a bot's chat, types a message, and sends it. The message appears as a user bubble. A reply streams into an assistant bubble and gets a Copy button when it finishes. Both survive in the saved workspace.

## Sub-features

- `chat-send-button` sends with the send button.
- `chat-send-enter` sends with Enter. Shift+Enter inserts a newline instead.
- `chat-reply` streams the demo reply and marks it complete.
- `chat-persist` saves both messages to `workspace.json`.
- `chat-stop` stops a streaming reply with the stop button. Not yet scripted.
- `chat-queue` queues a message while a reply is running. Not yet scripted.

## How to get to it (user POV)

- Click a bot tile on the home screen, then type in the message box.
- Click a bot in the sidebar, then type in the message box.

## Driving it with verify-gratis

Preconditions:

- Empty profile with provider `demo`. The runner enforces this.

- **Open chat.** Click the first `#home-bots button`. `#prompt` becomes visible.
- **Send.** Fill `#prompt` with a unique text and click `#send`. The composer clears.
- **Reply.** Wait for the "Copy message" button inside the last `#messages article.message.assistant`. Its text contains `Local demo response` and the sent text.
- **Persist.** In `workspace.json`, the user message has the sent `content` and the last message is `role: assistant`, `status: complete`, with content that echoes the sent text.
- **Run it.** `node .claude/skills/verify-gratis/scripts/run.mjs chat`. Proof is `01-before-send.png`, `02-reply-complete.png`, `workspace.json`, and `log.json`.

## Gotchas

- The composer is hidden on the home screen. `fill('#prompt')` times out until a chat is open.
- The default bot has `promptMode: 'auto'`, so the first send also runs bot-prompt setup through the demo provider. That is the real first-run path. Don't seed it away.
- The demo reply streams in about half a second, which is too fast to click Stop reliably. A stop journey needs a slower path, and none exists without a real provider.
- A demo pass proves the renderer, IPC, chat-service, and persistence path. It does not exercise `src/claude-backend.mjs`.
