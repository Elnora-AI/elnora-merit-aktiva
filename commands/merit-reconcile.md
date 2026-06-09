---
name: merit-reconcile
description: Preview or check the status of Stripe → Merit payout reconciliation (read-only)
argument-hint: "[payout id, or a date, or 'status']"
allowed-tools: Bash, Read
---

# Merit Reconcile (Stripe → Merit)

Preview or report Stripe-payout reconciliation into Merit Aktiva for: **{{args}}**

This command is **read-only**. Booking to the books is the `merit-bookkeeper` agent
(`elnora-merit reconcile run`), which requires explicit `--yes`.

## Prerequisites

- `STRIPE_API_KEY` set (live secret/restricted key) in the environment or `~/.config/elnora-merit/.env`.
- A populated `stripe-map.json` (run `elnora-merit reconcile init` once to generate a template
  and list candidate account/bank/VAT values, then fill it in).

## Run

```bash
# What WOULD be booked for each payout since the map cutoff (no writes):
elnora-merit reconcile preview --output json

# A single payout:
elnora-merit reconcile preview --payout <po_...>

# From a date:
elnora-merit reconcile preview --since <YYYY-MM-DD>

# Booked vs outstanding payouts:
elnora-merit reconcile status
```

## Present

Render a table per payout: payout id, arrival date, payout net, charges, invoices to
create / matched, gross, revenue net, VAT, Stripe fees, platform fees, bookable.
**Surface every `warnings` entry** — especially VAT mismatches and any "does not balance"
payout (those will be skipped by `run`). For `status`, show booked vs outstanding counts.

## Don't

- Don't write anything — this is preview/status only. To book, hand off to `merit-bookkeeper`.
- Don't proceed if a payout reports "does not balance" — investigate the Stripe data first.
