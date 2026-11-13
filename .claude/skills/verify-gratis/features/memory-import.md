# Import memories from another assistant

A user pastes what another assistant remembered about them into the Memory panel, reviews each line, and saves the ones they keep as profile memories. Lines already stored are skipped, so importing the same text twice adds nothing.

## Sub-features

- `memory-import-open` opens the paste box from Import. With Memory turned off it explains why instead of opening.
- `memory-import-review` lists one editable, ticked line per candidate. Headings, list markers, quotes and repeated lines are removed and a wrapped line is joined to its item.
- `memory-import-save` saves the ticked, edited lines and reports how many were added and skipped. Credential-like lines are left out and counted.
- `memory-import-repeat` imports the same text again and adds nothing.
- `memory-import-limits` refuses text over 60,000 characters, more than 200 items, or a line over 1,000 characters. Covered by `test/memory-import.test.mjs` and `test/memory-ui.test.mjs`, not scripted.
- `memory-import-paused` shows the Memory-is-off message. Not scripted, because pausing Memory in a profile is covered by `test/memory-service.test.mjs`.

## How to get to it (user POV)

- Open a chat, click Memory in the header, and click Import above the list.

## Driving it with verify-gratis

Preconditions:

- Empty profile with the chat for `Gratis` open. Memory works in a temp demo profile. The mock keychain wraps the vault key, and without the sentence-encoder model the panel falls back to exact search.

- **Open.** Click `#show-memory`, then `#memory-import`. `#memory-import-panel` shows `#memory-import-text`. Cancel closes it.
- **Paste and review.** Fill `#memory-import-text` with a heading, a wrapped item, a repeated item with different case, and four distinct lines. Click `#memory-import-review`. `#memory-import-rows` holds four rows and `#memory-import-save` reads `Save 4`.
- **Choose.** Untick the last row and edit the third. The button reads `Save 3`.
- **Save.** Click `#memory-import-save`. The notice reads `Added 3 memories. Skipped 0 duplicates.` and the panel closes.
- **Read back.** `window.orbit.memoryView({conversationId})` returns exactly the three kept lines under `profile`, all `scope: 'profile'` and `status: 'confirmed'`, and `pending` is empty. `memory.secure` does not contain the plaintext.
- **Repeat.** Import the same text with the same choices. The notice reads `Added 0 memories. Skipped 3 duplicates.` and `profile` is unchanged row for row.
- **Run it.** `node .claude/skills/verify-gratis/scripts/run.mjs memory-import`. Proof is the six numbered PNGs and `log.json`.

## Gotchas

- The review list is taller than the panel. The journey scrolls `#memory-import-save` into view before the capture, or the count is cut off.
- The notice is one shared element. Wait for the exact expected text, because the first import's notice stays visible until the second replaces it.
- A short memory shows its label and its text as the same words, because the label is derived from the text.
- Import is refused while Memory is paused, even though Add a memory still works.
