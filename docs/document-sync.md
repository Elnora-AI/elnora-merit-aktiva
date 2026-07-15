# Document sync — never lose a receipt

Every accounting transaction needs its source document (the supplier's invoice or
receipt). `documents` audits Merit for transactions whose document is missing,
searches the places your receipts actually live, stages or attaches what it finds,
and reports what it cannot — so nothing quietly ends up on the books with no proof.

It is generic by design: no account, vendor, or organisation specifics are baked
in. Everything site-specific comes from config and environment variables.

## Commands

```bash
# Audit only — list invoices with no attached document (READ-ONLY).
elnora-merit documents list-missing --from 2026-01-01 --to 2026-07-31

# Full pass: audit → search sources → match → report (READ-ONLY without --apply).
elnora-merit documents run

# Do the work: stage matched PDFs for a one-click UI upload, then send the digest.
elnora-merit documents run --apply

# Advanced: attach in place by delete+recreate (changes the invoice id).
elnora-merit documents run --apply --rebook          # unpaid invoices
elnora-merit documents run --apply --rebook --force  # also paid — re-book the payment after

# Run it on a schedule (see "Scheduling" below).
elnora-merit documents install-schedule
```

## How matching works

Each configured source yields candidate documents (PDFs and image receipts —
`.jpg`, `.png`, `.heic`, `.webp`, …). Every candidate is scored against every
missing invoice on three independent signals:

| Signal | Weight | Matches when |
|---|---|---|
| Amount | 0.5 | a parsed amount equals the gross total within `amountTolerance` |
| Date | 0.3 | a parsed date is within `dateWindowDays` of the document date |
| Party | 0.2 | the vendor's name tokens appear in the file name / text |

A candidate at or above `acceptThreshold` (default 0.9) is auto-resolved; between
`reviewThreshold` (0.6) and accept it is reported as a suggestion to confirm by
hand; below that it is ignored. Amount + date alone clears the bar, so a correct
match never depends on fuzzy name matching.

## The Merit attachment limit (important)

Merit's API can attach a file **only when an invoice is created** — there is no
"attach to an existing invoice" endpoint. So there are two honest ways to resolve
a transaction that already exists without its document:

1. **Stage (default, safe).** The matched PDF is copied to a staging folder,
   named by the invoice, ready to drag into the Merit UI (a two-second upload).
   Nothing on the books changes. This is the recommended path for a backlog.
2. **Rebook (`--rebook`, opt-in).** The invoice is deleted and recreated,
   identical, *with* the attachment. This changes the invoice id, and for a paid
   invoice drops the payment link (`--force` required, and you must re-book the
   payment). Reconstruction is faithful for the common single-line receipt.

The cleanest long-term pattern is to attach at the source: when you enter a new
purchase invoice, pass the receipt in the same `purchase-invoices create` call
(or let your intake tool do so), so `FileExists` is true from birth.

## Sources — including Gmail, Drive, and anything else

Two source types, both generic. Configure them in `docsync.json`:

```jsonc
{
  "sources": [
    { "type": "dir", "path": "~/Downloads" },
    { "type": "dir", "path": "~/Documents/receipts", "recursive": true },
    { "type": "command", "label": "gmail", "command": "my-gmail-fetcher --since 30d --out /tmp/rcpt" }
  ]
}
```

A `command` source is how you plug in Gmail, Google Drive, a scanner inbox, or any
other provider **without this package depending on that provider or holding its
credentials**. Your command authenticates however it likes (your own tooling,
outside this repo), writes each candidate file locally, and prints one JSON object
per line:

```
{"path":"/tmp/rcpt/receipt.pdf","fileName":"receipt.pdf","text":"Acme Taxi 42.50 2026-03-15","amounts":[42.50],"dates":["2026-03-15"]}
```

Only `path` is required; the rest sharpen matching.

### Gmail + Drive out of the box

A ready-made adapter ships at [`adapters/gmail-drive-gw.mjs`](../adapters/gmail-drive-gw.mjs).
It pulls receipt/invoice PDFs straight from your Gmail and (optionally) a Drive
folder, so most receipts are found automatically. It uses the **[elnora-google-workspace](https://github.com/Elnora-AI/elnora-google-workspace)**
`gw` CLI for auth — install that plugin and run `gw auth` once; the adapter itself
holds no credentials. Then add it as a source:

```jsonc
{ "type": "command", "label": "gmail-drive", "command": "node ./adapters/gmail-drive-gw.mjs" }
```

Tune it with env vars: `DOCSYNC_GMAIL_QUERY` (default: PDF receipts/invoices in the
last 120 days), `DOCSYNC_DRIVE_FOLDER` (a Drive folder id to also scan), `GW_ACCOUNT`.
We recommend installing the elnora-google-workspace plugin alongside this one — the
two connect so your receipts flow from email/Drive into Merit with no manual export.

## Reporting

The run produces a digest and delivers it to whichever you configure:

- `MERIT_DOCSYNC_WEBHOOK` (or `webhookUrl` in the config) — a Slack-compatible
  incoming webhook (`{ "text": … }`; Slack / Mattermost / Discord all accept it).
- `notifyCommand` — a shell command that receives the digest text on stdin.
- neither — the digest is printed (also available in the JSON output as `digest`).

## Scheduling

`documents install-schedule` sets up an unattended run. On macOS it installs a
launchd agent that runs **on an interval** (default every 6 h) **while the machine
is awake, plus once at login** — deliberately *not* a fixed wall-clock time:

- a laptop that is closed at any given minute still catches up on its next wake;
- it follows the machine's **local timezone**, so it does the right thing wherever
  you are (no hardcoded zone).

```bash
elnora-merit documents install-schedule --interval-hours 6
launchctl load ~/Library/LaunchAgents/com.merit-aktiva.docsync.plist
```

On Linux/Windows the command prints a cron / Task Scheduler snippet instead. For
truly unattended runs (laptop closed for days) run it from a server or CI, where
you host the Merit credentials yourself.

## Configuration reference

`docsync.json` (in the references dir — default `~/.config/elnora-merit/`, honors
`MERIT_REFERENCES_DIR`; gitignored because it may hold the webhook URL). All fields
optional; with no config at all the tool scans `~/Downloads`.

| Field | Default | Meaning |
|---|---|---|
| `sources` | `[{dir: ~/Downloads}]` | where to look for candidate documents (PDFs + image receipts) |
| `acceptThreshold` | 0.9 | auto-resolve at/above this score |
| `reviewThreshold` | 0.6 | report as a suggestion at/above this score |
| `amountTolerance` | 0.02 | currency-unit slack for an amount match |
| `dateWindowDays` | 5 | max day gap for a date match |
| `webhookUrl` | — | digest webhook (prefer the env var) |
| `notifyCommand` | — | alternative digest sink (stdin) |
