# Using Gratis

## Assistants and groups

Each bot has instructions, a model choice, tool capabilities, a file workspace and its own conversation context. A group's first bot is the coordinator. It answers simple requests itself, assigns useful subtasks, and adds a short synthesis after a teammate's findings. Direct mentions reach their recipients without an extra coordinator reply.

Use the bot menu to edit, pin, duplicate or delete a bot. A group menu manages its name and participants. Deleting a group removes its local chat; it does not delete an independent T3 task. Stop remote work separately.

## Memory

Memory has three scopes: your profile across permitted bots, one bot across its chats, and one conversation. Open Memory to inspect, correct, confirm or forget entries. Permanent facts should come from what you actually said; uncertain inferences remain proposals. Retrieved memories are context, not authorization for external actions.

To bring over what another assistant remembered about you, ask it to list those memories one per line, open Memory and choose Import. Paste the list and choose Review. Every line starts ticked and can be edited, so untick anything you do not want. Save adds the kept lines to your profile as memories you confirmed. Lines you already have are skipped, so importing the same list twice adds nothing, and lines that look private, such as a password, a key or a health detail, are left out. Add one of those yourself with Add a memory if you want it kept. Import does not use an AI model and needs Memory to be turned on.

## Files and responses

Attach files from the + menu. Generated files appear in Files. Markdown responses support headings, lists, tables, links and code blocks. Copy the full reply or an individual code block. PDF extraction additionally requires Poppler's `pdftotext` on PATH.

## Scheduled tasks

Use an explicit instruction with a frequency, time and timezone. Daily, weekdays, a selected weekly day and intervals from 15 minutes are supported. A task runs through the same bot and tool permissions, and posts in the originating chat.

The app must be running and the computer awake. Closing its window leaves enabled schedules running; quitting does not. Missed intervals coalesce into one fresh run. Busy chats defer scheduled work. Failed or interrupted runs pause for review rather than blindly repeating an uncertain action. A timer cannot authorize unrelated purchases, messages or deletions.

## Connected apps

**Your apps** (Settings → Connections) signs in to an app’s own MCP server directly, with no broker account. Granola needs only your Granola sign-in. Gmail and Google Calendar use Google’s MCP servers, which are a Developer Preview: join the Google Workspace Developer Preview Program, create a Google Cloud project with the Gmail API, Google Calendar API, `gmailmcp.googleapis.com` and `calendarmcp.googleapis.com` enabled, create a **Web application** OAuth client with **Use this client for an AI-powered agent** ticked and the redirect URI shown in Gratis (`http://127.0.0.1:47823/oauth/callback`), then paste its ID and secret under **Google setup**. Gmail asks only to read mail and create drafts. You can also add any other app’s remote MCP address that supports OAuth sign-in. Tools the app’s server marks read-only run without asking; everything else asks first. If an app’s sign-in expires, scheduled runs skip it and its row shows **Retry**.

Composio sign-in and per-service authorization are optional. You can disconnect or change credentials in Settings. Review the permissions requested by each service. A bot can only use integrations exposed by its enabled runtime.

Each bot chooses which connected apps it may use. Open the bot’s settings and look under **Connected apps**: every app you have connected is listed, with Composio first when you are signed in. New bots, and bots you have not changed, may use all of them, including apps you connect later. Untick an app and that bot cannot use it at all. From then on the bot uses only the apps you tick, so tick a newly connected app here before that bot can use it. Turning **Connected apps** off hides the list and blocks every app. If nothing is connected, the list points you to Settings → Connections. Slack conversations without tool access never use connected apps.

A connected-app action runs without asking only when Composio labels every step in it as read-only, such as listing calendar events or fetching emails. Anything that creates, changes, sends or deletes still asks you first. So does anything Composio has not labeled, or whose labels Gratis could not check.

## Computer and takeover

With your own cloud backend configured, the Computer pane shows the bot's browser. Drag the divider to resize it, or expand it. Take control to use its mouse and keyboard; Give control back resumes unfinished work from a fresh view of the page. Save important files before stopping the computer. This computer is separate from the Mac running Gratis.

## T3 project tasks

Connect an existing T3 MCP environment by address in Tasks. Gratis does not replace or install a system T3 service in this edition. Authorize access in T3, choose a project and model, and start a bounded task. Follow-up messages reuse the saved thread. The execution host must remain available; project credentials and permissions belong to that environment. T3 does not automatically inherit Composio connections from Gratis.

## What to verify

Check sources, files and final outcomes. A tool error is not a completed action. Neither provider access nor automation makes every website or workflow reliable. Use a small reversible task first when setting up a new connection.

## Custom schedules and finding files

In Scheduled tasks, choose **Custom cron** for a five-field expression: minute, hour, day of month, month and weekday. `0 9 1 * *` runs at 9 AM on the first day of each month; `0 9 * * 1-5` runs on weekdays. Set the IANA timezone explicitly. The saved card shows the next actual run. Invalid expressions cannot replace a saved schedule.

Cron schedules use the same pause, resume, run-now and missed-run coalescing as other scheduled tasks. They run only while Gratis is running and the computer is awake. Repeated clock times during the autumn daylight-saving change are not replayed. A cron time that falls in the spring clock gap runs at the next valid instant; weekly schedules retain their existing skip-the-gap behavior.

In **Files**, filter by filename or folder path, and sort by recent changes, name or size. Filtering stays inside the selected bot's files and resets when switching to another bot. Files stay where they are; filtering and sorting do not move or rename them.
