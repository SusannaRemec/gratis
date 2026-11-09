# Gratis

> **Before installing:** Do your own due diligence. This is experimental software, provided without warranty or a maintenance commitment. Review the source, permissions, third-party services and [installation/use notice](DISCLAIMER.md); back up your data and test with a disposable workspace first.


**A desktop home for your AI assistants. Your bots, your context, your connections.**

Gratis brings focused assistants, group conversations, local memory and recurring work into one desktop workspace. Connect an eligible Claude or Codex account, choose which tools a bot can use, and keep its work in one place.

![Gratis Core with a synthetic research conversation](docs/screenshots/core-overview.png)

## Reliability and recovery

Configure run limits, preserve partial work, and create verified local checkpoints in Settings. See [limits and recovery](docs/RELIABILITY.md) for the exact behavior, storage limits and restore commands.

## What you can do

- **Create focused assistants.** Name a bot, choose a geometric badge or your own photo, and describe its purpose. Adjust its instructions and model later.
- **Work as a group.** The primary bot uses judgment about when to involve a specialist. Type `@` to address a teammate, or `@everyone` for all perspectives.
- **Keep useful context.** Inspect and manage memories scoped to you, a bot or a conversation.
- **Schedule recurring checks.** Create daily, weekday, weekly or interval tasks. Results return to the same chat.
- **Chat from Slack.** Link your own Slack account to an existing assistant, with explicit channel permissions. Follow the [Slack setup guide](docs/SLACK.md).
- **Connect your apps.** Optional Composio integration lets you authorize services individually.
- **Use a separate computer.** An optional self-hosted cloud browser supports live viewing, manual takeover and resuming after your changes.
- **Delegate project work.** Connect your own T3 environment for work that continues independently of the desktop window.

## Start from source

The desktop build currently targets **macOS Apple Silicon**. Other platforms have not been release-tested. You need Node.js 22+, npm, and an eligible provider account for live AI replies. You can explore the interface in demo mode without an account.

```sh
git clone https://github.com/promptadvisers/gratis.git
cd gratis
npm ci
npm run setup:assets
npm start
```

In **Settings → AI provider**, choose Claude or Codex and check your sign-in. Provider access, usage limits and available models depend on your account and provider terms. This project does not include a subscription, provide unlimited usage, or bypass provider restrictions.

For the details that matter before installing, start with the [five-minute guide](docs/QUICKSTART.md).

## Pick your depth

| You want to… | Start here |
| --- | --- |
| Install and try a first bot | [Quickstart](docs/QUICKSTART.md) |
| Learn chats, memory, schedules and connections | [User guide](docs/USER_GUIDE.md) |
| Understand what stays local and what is sent out | [Privacy](PRIVACY.md) |
| Build, test or change the app | [Development](docs/DEVELOPMENT.md) |
| Understand the runtime and trust boundaries | [Architecture](docs/ARCHITECTURE.md) |
| Host an optional browser service | [Cloud deployment](docs/CLOUD.md) |
| Check licenses and asset sources | [Third-party notices](THIRD_PARTY_NOTICES.md) |

## Practical limits

Scheduled tasks require Gratis running and the Mac awake. Closing the window keeps enabled schedules active; explicitly quitting stops execution until reopen. A missed period becomes one fresh check, not a backlog. External changes can wait for approval.

Cloud browsing is optional, runs in your own infrastructure, and may incur hosting costs. T3 tasks use the permissions and machine availability of your own T3 environment. Neither service is preconnected.

Microphone transcription needs optional local tools and a model; see the [voice setup](docs/QUICKSTART.md#optional-voice-input). The semantic memory encoder is a separate, checksum-verified download. Model and CLI downloads are excluded from Git.

## Editions

This is the reusable MIT-licensed core. It has no membership requirement, community-only runtime dependency, personal chat history, account credentials, or preconfigured hosting account. A separate community workspace can build on this repository with its own documentation, templates and features. The installed personal edition is independent.

## License and reuse

This project's own source is released under the standard [MIT license](LICENSE). You may use, modify, redistribute, sublicense and sell copies, including in commercial projects, while retaining the required copyright and license notice. There is no added noncommercial clause, membership requirement or restriction on competing products.

Dependencies keep their own licenses. Provider subscriptions and third-party services have separate terms. [Third-party notices](THIRD_PARTY_NOTICES.md) explain included assets and dependencies. The [installation notice](DISCLAIMER.md) is risk guidance, not an extra source-code license. A repository license does not grant rights to another product's trademarks, private code, artwork or data.

## Status

This is a source release, not a signed or notarized installer. Automated checks cover the core runtime; the documented desktop smoke test uses synthetic data. Please report reproducible issues without tokens, private messages or real account traces. See [Contributing](CONTRIBUTING.md) and [Security](SECURITY.md).

Independent project. No affiliation with or endorsement by GrokBot’s creators, xAI, OpenAI, Anthropic or other referenced services. See [the full notice](DISCLAIMER.md).
