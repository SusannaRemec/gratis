# Downloads

[Gratis Core 0.4.2 preview](https://github.com/promptadvisers/gratis/releases/tag/v0.4.2) contains the Keychain and button fixes. Choose the .dmg matching your Mac: arm64 for Apple Silicon, x64 for Intel. The source archives are for developers.

Open the DMG and drag Gratis Core into Applications. Quit the previous app before replacing it. Your local Gratis Core data folder is separate from the application bundle and is retained when replacing the app.

The release is built from the public core repository on separate native Mac runners. Each DMG is mounted, its app identity and signature are checked, and its packaged UI, Slack, secure-storage compatibility and dialog controls are tested using isolated temporary profiles.

## Integrity

Download SHA256SUMS.txt and the installer into the same folder, then run `shasum -a 256 -c SHA256SUMS.txt`. Entries for installers you did not download will report missing files; the installer you chose must report OK. This verifies download integrity, not publisher notarization.

Mac builds are ad-hoc signed and not notarized. System warnings or initial Keychain permission may still appear. Do not turn off Gatekeeper globally. Review the project’s DISCLAIMER, PRIVACY and third-party notices before installation.

The public core does not contain phone pairing, shared human team spaces or Pages. Those remain in the separate community edition.
