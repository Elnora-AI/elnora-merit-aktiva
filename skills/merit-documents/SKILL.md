---
name: merit-documents
version: 1.0.0
description: >
  Keep every Merit Aktiva transaction backed by its source document (receipt / supplier
  invoice). Audits Merit for invoices missing an attachment, searches configured sources
  (local folders, or Gmail/Drive/etc. via a command adapter) for the matching PDF, stages
  or attaches it, and reports what it cannot find to a Slack-compatible webhook. Runs on a
  schedule. Use when: "missing receipts", "which invoices have no document", "attach
  receipts", "receipt audit", "documents without invoices", "find missing invoices",
  "auto-attach receipts", "receipt reminder", "document compliance".
  TRIGGERS: "missing receipt", "missing invoice", "no attachment", "receipt audit",
  "document sync", "attach receipt", "which transactions lack a receipt", "unattached
  invoice", "receipt reminder", "merit documents".
---

# Merit document sync

Every transaction needs its original receipt/invoice for accounting. This skill finds
the ones that don't have it, tries to locate the file, and flags the rest.

Full design + config: `docs/document-sync.md`.

## Audit (read-only)

List invoices with no attached document. Purchases by default (an expense with no
receipt is the real gap); `--sales` also checks issued invoices.

```bash
elnora-merit documents list-missing --from 2026-01-01 --to 2026-07-31
elnora-merit documents list-missing --sales
```

Output: `{ count, missing: [{ kind, id, billNo, partyName, docDate, grossTotal, currency, paid }] }`.
The signal is Merit's own `FileExists` flag on each invoice header.

## Find + resolve

```bash
elnora-merit documents run                 # audit → search → match → digest (READ-ONLY)
elnora-merit documents run --apply         # also stage matched PDFs for a UI upload
elnora-merit documents run --apply --rebook        # attach in place (delete+recreate; unpaid)
elnora-merit documents run --apply --rebook --force  # also paid (drops payment link — re-book it)
```

**Matching** scores each candidate PDF on amount (0.5) + date (0.3) + party name (0.2);
≥0.9 auto-resolves, 0.6–0.9 is reported to confirm by hand.

**Attach limit:** Merit's API only accepts a file at invoice *creation* time — there is
no attach-to-existing endpoint. So `run --apply` defaults to **staging** (copy the PDF to
a folder, named by invoice, for a 2-second drag into the Merit UI). `--rebook`
delete+recreates instead; avoid it on paid invoices unless you will re-book the payment.
Best practice: attach the receipt in the same `purchase-invoices create` call for new bills.

## Sources (local + Gmail/Drive/anything)

Configure in `~/.config/elnora-merit/docsync.json` (see `docsync.example.json`):
- `{ "type": "dir", "path": "~/Downloads" }` — scan a local folder.
- `{ "type": "command", "command": "…" }` — run your own fetcher for Gmail/Drive/scanner;
  it writes files locally and prints one JSON line per candidate
  (`{"path":"…","amounts":[…],"dates":[…],"text":"…"}`). No provider SDK or secret lives
  in this package.

## Reporting

Digest goes to `MERIT_DOCSYNC_WEBHOOK` (Slack-compatible incoming webhook), or a
`notifyCommand` (stdin), or is printed. Never commit the webhook URL.

## Schedule

```bash
elnora-merit documents install-schedule --interval-hours 6
launchctl load ~/Library/LaunchAgents/com.merit-aktiva.docsync.plist
```

Interval-based (not a fixed clock time), plus at-login, so a laptop that is closed at any
given moment still catches up on next wake, and it follows the machine's timezone. Remove
with `documents uninstall-schedule`. Non-macOS: the command prints a cron snippet.
