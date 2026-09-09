# Newsboy - The Inbox Herald (standalone edition)

A Google Apps Script web app that typesets a Gmail inbox as a turn-of-the-century
broadsheet newspaper: newsletters and digests as columns, job alerts as
"Situations Vacant" classifieds, promos as period display ads, plus a scrapbook
of saved clippings and browsable 24-hour back issues.

Runs entirely inside one Google account. No Claude, no third-party services -
the only thing it talks to is the Gmail of the account that deploys it.

## Files

- `appsscript.json` - manifest: scopes, Gmail advanced service, web app config
- `Code.gs` - server: Gmail search/fetch, read marks, saved label, preferences
- `index.html` - the entire newspaper UI (fonts embedded, no external requests)

## Setup (about 5 minutes)

Do all of this while signed into the Google account whose inbox should feed
the paper (use that account's browser profile, or a private window).

1. Go to https://script.new - this creates a new Apps Script project.
2. Name the project (gear-free: click "Untitled project"), e.g. `Inbox Herald`.
3. Project Settings (gear icon) -> check **"Show 'appsscript.json' manifest
   file in editor"**.
4. Back in the editor, replace the contents of each file:
   - `appsscript.json` -> paste this repo's `appsscript.json`
   - `Code.gs` -> paste this repo's `Code.gs`
   - Click **+** next to Files -> **HTML** -> name it exactly `index` ->
     paste this repo's `index.html`
5. **Deploy -> New deployment -> Web app**:
   - Execute as: **Me**
   - Who has access: **Only myself**
6. Click Deploy, then **Authorize access**. Google will warn that the app is
   unverified (it is your own script): Advanced -> "Go to Inbox Herald
   (unsafe)" -> Allow.
7. Open the **web app URL** it gives you and bookmark it. That URL is your
   newsstand.

Alternative for iterating from this repo: `clasp` (`npm i -g @google/clasp`,
`clasp login` as the target account, `clasp create --type webapp`,
`clasp push`, `clasp deploy`).

## What it does with the account

- **Read** state is real: opening an article marks the message read in Gmail;
  the "unread" control marks it unread again.
- **Saved for later** applies a real `Newsboy/Saved` label to the thread
  (visible in Gmail) and pastes a clipping into the scrapbook (snapshots kept
  in the script's user properties, capped at 100).
- **Not interested / not news / barred senders** are stored in the script's
  user properties - nothing in the mailbox changes.
- Nothing is ever sent, deleted, or shared. Scopes are `gmail.modify` (read,
  mark read, label), `gmail.labels`, and `userinfo.email`.

## Troubleshooting the first open

**"Sorry, unable to open the file at this time." (a Google Drive page)**

This is almost always a *multi-login account mismatch*, not a failed
authorization. An Apps Script `/exec` URL runs under the browser profile's
**default** Google session (authuser 0) and offers no account chooser. If the
web app is deployed "Only myself" under account B while account A is the
profile default, Google serves this generic Drive wall before `doGet` ever
runs. Fixes, most reliable first:

1. **Open the URL in a browser profile (or incognito window) where the
   deploying account is the only signed-in Google account.** This is the
   durable fix and makes the bookmark work every time.
2. **Try the `/u/N/` URL form**, where N is the account's index in your Google
   session list (try 1, then 2):
   `https://script.google.com/macros/u/1/s/<DEPLOYMENT_ID>/exec`
   Session-index hints are unreliable for `/exec` on consumer Gmail accounts -
   treat this as a convenience, not a guarantee.
3. `/a/macros/<domain>/s/<ID>/exec` forces the session for a **Workspace**
   account, but does not apply to consumer Gmail.

**Confirm authorization actually completed:** in the Apps Script editor while
signed into the deploying account, pick `boot` in the function dropdown and
Run. If consent never finished, this re-triggers it; if it returns cleanly,
auth is fine and the problem was purely which session opened the URL.

**Check you have the right URL:** it must be the web app URL ending in
`/exec` from the Deploy dialog, not the editor URL (`/d/<SCRIPT_ID>/edit`).

## Notes and knobs

- **Back issues**: the date picker fetches any calendar day as a strict
  24-hour edition. "Latest Edition" covers the last 24 hours, with days 2-7
  condensed under "The Week Past", each entry date-stamped.
- **First load of a full week can take a while** (one Gmail metadata fetch per
  message; a few hundred messages is 20-30 seconds). Results are cached for
  10 minutes; "Ring the Newsroom" forces a fresh fetch.
- **The classifier** lives at the top of the `<script>` block in `index.html`
  (`NOTIFY_*`, `JOB_*`, `MOTO`, `AD_*`, `WIRE_*`, `NAME_MAP`). It excludes
  person-to-person mail, group mail, and transactional notifications; edit the
  regexes to teach it new senders. Anything misjudged can also be struck from
  inside the paper ("not news"), with per-sender bans in the Retractions box.
- **Timezone**: editions are cut at the browser's local midnight. The
  `timeZone` in `appsscript.json` only affects server logs.
