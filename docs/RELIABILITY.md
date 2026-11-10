# Limits and recovery

In Settings, open **Run limits and recovery**. Defaults are 10 minutes, 100 tool starts, five tool failures, and one million output characters per local response. Limits can be lowered or raised within the displayed bounds. A paused response retains partial text and tool receipts; Retry sends a continuation with that progress. Queued messages remain paused after a limit. Change the relevant limit before retrying a task that needs more room.

A network operation already accepted by another service may finish after local cancellation. Check its receipt before retrying an external action. Local limits do not impose a remote T3 or cloud-provider billing cap.

T3 monitoring pauses after eight consecutive connection failures or 24 hours by default. **Resume monitoring** checks the same saved remote task and reuses an unconfirmed submission's request ID. Pausing monitoring does not stop the remote worker. Use **Stop task** or T3 itself to stop it. The local UI reports that distinction explicitly.

Each bot's Files workspace accepts at most 100 MB or 1,000 files, with the existing per-file limits. Concurrent writes share the same quota check. Rejected writes preserve existing bytes. Use **Open folder** to archive or remove unused files yourself. Generated text writes are atomic. Diagnostic activity logs contain status metadata only, rotate at 1 MB, and retain three older copies. User messages and saved files are not aged out automatically.

## Local checkpoints

Before opening an existing workspace, Gratis checks its format and saves a verified local checkpoint. **Create recovery checkpoint** does the same on demand. The five most recent distinct checkpoints are retained in the data directory's `checkpoints` folder. A checkpoint includes chats, settings, encrypted memory plus its wrapped key, saved encrypted connections, schedules, and T3 task records. It does not include bot Files, provider-owned session directories, phone pairing, or team-service databases. Back those up separately if you need a complete machine backup.

Checkpoints are sensitive local data. They are not bot templates and must not be posted to GitHub or sent to strangers. Encrypted credentials remain bound to the operating system's key storage; copying a checkpoint to another machine does not transfer a working login.

## Restore from source

Quit Gratis first. Use Node.js 22.16 or newer from this repository:

```sh
node scripts/workspace-recovery.mjs backup "PATH_TO_GRATIS_DATA"
node scripts/workspace-recovery.mjs restore "PATH_TO_GRATIS_DATA" "PATH_TO_CHECKPOINT"
```

Choose the directory containing `workspace.json`. The recovery command refuses a live Gratis process. It verifies every manifest checksum and the workspace schema before replacing data, saves the current state first (damaged bytes go into a separate `recovery-before-*` archive), and uses a recovery journal so an interrupted restore completes consistently on next launch. Files absent from a checkpoint are removed only for the explicitly listed checkpoint-managed state files; unrelated files are left alone.

Unknown versions are refused without rewriting them. A future ownership migration must increase the workspace schema and minimum-reader marker before it ships. This release adds the refusal/recovery infrastructure; it does not migrate your personal chats into a team database. Older binaries cannot be retroactively taught a new marker, so never downgrade a migrated profile without the matching older checkpoint.

## Validation boundaries

Automated tests cover a stalled provider, late callbacks after cancellation, repeated tool failures, queue pausing, continuation, concurrent file limits, T3 retries, corrupted checkpoints, interrupted restore, future-version refusal, and a live-workspace recovery lock. Provider streams and remote T3 replies in those tests are synthetic. No test accesses a real user's keychain or chats. A passing test suite is not a claim of notarization or an external security audit.

## Keychain access

On macOS, saved connections and the memory key use the same OS-backed provider. A denied secure-storage operation blocks further attempts in that process, so background work cannot reopen the prompt. The startup dialog offers an explicit Try again action; existing encrypted files are preserved. Unsigned or ad-hoc signed updates may still need fresh macOS approval because their signing identity is not stable across builds. No plaintext credential fallback is enabled.
