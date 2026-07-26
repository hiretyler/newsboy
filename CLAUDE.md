# newsboy - The Inbox Herald

Google Apps Script web app that renders a Gmail inbox as a vintage broadsheet
newspaper. See README.md for what it does and how to deploy it.

## PUBLIC REPO - data hygiene rules (non-negotiable)

This repo is public on GitHub (`hiretyler/newsboy`). Never commit:

- Real email addresses of people (senders, recipients, the proprietor's own)
- Anything revealing the contents of a specific inbox: sender names of niche
  personal subscriptions, snippets, subjects, message/thread IDs
- Apps Script deployment IDs, script IDs, `.clasp.json` (gitignored)
- `/Users/...` paths, credentials, tokens

The classifier regexes in `index.html` may reference broadly-known bulk
senders (linkedin.com, indeed.com, oracle.com, etc.) but not individuals.
Before any commit that touches the classifier, re-run the audit:
`grep -rn "hiretyler\|@gmail\|/Users/" Code.gs index.html README.md`

## Architecture

Three deployable files, no build step required to edit them:

- `Code.gs` - server. Gmail Advanced Service (`Gmail.Users.*`) for fast
  metadata listing; `GmailApp` for body fetch + read marks + the
  `Newsboy/Saved` label. Preferences (dim/removed/blocked/clips) live in
  `PropertiesService.getUserProperties()`. Issue results cached 10 min in
  `CacheService` (key rounded to 10-min buckets; `fresh` bypasses).
- `index.html` - the entire client: CSS (newspaper design), four embedded
  fonts as woff2 data URIs (UnifrakturMaguntia masthead, Old Standard TT
  text), and one IIFE script. Server calls go through the `gs()` promise
  wrapper around `google.script.run`.
- `appsscript.json` - manifest. Scopes are gmail.modify + gmail.labels +
  userinfo.email. Do not widen. Web app is USER_DEPLOYING / MYSELF.

Client data flow: `loadIssue()` -> server `getIssue(start,end)` returns flat
message items -> `dedupe()` collapses repeated sender+subject blasts ->
`classify()` routes each item to a section (wire / columns / moto / jobs /
ads) or excludes it (personal, group, notification) -> `derive()` splits
main-window vs week-past -> string-built HTML via `render()`. Article bodies
are fetched lazily (`getBody`), which also marks the message read.

## Conventions

- Single-file client; no frameworks, no external requests (fonts and all
  assets are inline). Keep it that way - it must run in Apps Script's
  HtmlService sandbox with zero network dependencies.
- The classifier config (NOTIFY_*/JOB_*/MOTO/AD_*/WIRE_*/NAME_MAP regexes)
  sits at the top of the script block in `index.html` and is the intended
  edit surface for per-account tuning. Deployers customize locally; only
  generic, broadly-useful senders belong upstream.
- All rendered strings pass through `esc()`; message ids are the only values
  interpolated into inline handlers (they are Gmail hex ids - keep it so).
- Era-appropriate newspaper voice in UI copy ("Retractions", "Situations
  Vacant", "Ring the Newsroom"). Typographic em dashes are part of the
  design and allowed inside UI strings; use hyphens in docs and comments.

## Testing

No test framework. Smoke-test the client in Node by stubbing the DOM and
`google.script.run` (see the session pattern: extract the script block,
provide a Proxy-based runner stub, assert on rendered HTML). `node --check`
both `Code.gs` (it is V8-compatible JS) and the extracted client script
before committing.

## Origin

Ported from a claude.ai artifact version (private, MCP-based, read-only
Gmail). This standalone version has strictly more capability: real read
marks, a real `Newsboy/Saved` Gmail label, server-side preference storage.
