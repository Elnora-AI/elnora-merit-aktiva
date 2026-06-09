# Stripe → Merit Aktiva — full recipe

Reference for [SKILL.md](../SKILL.md). First-time Stripe setup and a worked payout, booked
via the `elnora-merit reconcile` command.

Authoritative sources:
- Booking model (clearing account, gross revenue, fee as expense): Stripe is the merchant of
  record's *processor*, so revenue is principal-basis (ASC 606 / IFRS 15) — fees are an
  expense, not a revenue reduction.
- Stripe fee VAT-exemption: EMTA VAT-department position that a payment service under the
  Payment Institutions and E-Money Institutions Act §3 is exempt under KMS §16(2¹)(4) and is
  therefore **not** reverse-charged when received from a foreign provider.

## How the tool books a payout

`reconcile run` anchors on Stripe **payouts**. For each payout it pulls the charges, fees,
and refunds in that settlement batch and posts ONE summary `sendglbatch`:

```
Dr  clearing      gross
Cr  revenue       net      (TaxId = standard-rate guid, VatAmount = vat)   ← Merit posts the VAT
Dr  stripeFees    stripeFee
Dr  platformFees  platformFee
Cr  clearing      stripeFee + platformFee
[Dr refunds / Cr clearing   refund]   (only if the payout has refunds)
```

Σdebit − Σcredit equals the VAT amount; Merit supplies that credit implicitly from the
revenue line's tag, so the posted batch balances. The clearing account is then left holding
the payout net.

## Step 1 — Configure the map

```sh
elnora-merit reconcile init        # writes a placeholder stripe-map.json + prints candidates
```

`init` prints your chart of accounts, banks, and VAT codes so you can fill in real values.
Edit `~/.config/elnora-merit/stripe-map.json`:

```json
{
  "currency": "EUR",
  "stripeAccount": "acct_…",
  "cutoffDate": "2026-01-01",
  "accounts": {
    "revenue": "<gl code>",
    "vatPayable": "<gl code>",
    "stripeFees": "<gl code>",
    "platformFees": "<gl code>",
    "refunds": "<gl code>",
    "clearing": "<gl code>"
  },
  "vat": { "rate": 0.24, "code": "<standard-rate TaxId from `taxes list`>" },
  "vatTimezone": "Europe/Tallinn",
  "revenueMemo": "Card sales (net of VAT)"
}
```

- `clearing` = a 10xx clearing/vahekonto account. Confirm it exists: `accounts list --fields Code,Name`.
- `vat.code` is per-company — read it, don't copy: `elnora-merit taxes list --output table` (pick the plain standard-rate row).
- `cutoffDate` — payouts before this are ignored (e.g. anything already booked by hand).
- `stripeAccount` — your Stripe `acct_…` so the tool refuses to run against the wrong account.
- `vatTimezone` (optional) — the VAT jurisdiction's timezone for month boundaries (default `Europe/Tallinn`; `Europe/Warsaw` for PL).
- `revenueMemo` (optional) — the memo written on the revenue GL line (default `Card sales (net of VAT)`).

## Step 2 — Set the Stripe key

The restricted/secret key, in the environment or `~/.config/elnora-merit/.env`:

```sh
export STRIPE_API_KEY=rk_live_…    # or sk_live_…
```

Never commit it; never print it.

## Step 3 — Preview (read-only)

```sh
elnora-merit reconcile preview --output table
```

Render per payout: id, arrival date, payout net, gross, revenue net, VAT, Stripe fees,
platform fees, bookable. **Surface every warning** — especially:
- *VAT mismatch* — a charge's Stripe-tax line ≠ the map rate; the tool uses the Stripe tax line.
- *does not balance* — the payout will be skipped by `run`; investigate the Stripe data.
- *contains refunds* — booked as a lump contra to the refunds account; review.

## Step 4 — Book (gated write)

```sh
elnora-merit reconcile run --yes
```

- Skips payouts already in the idempotency ledger and any that don't balance.
- Hand this off to the `merit-bookkeeper` agent; never `--yes` without explicit approval.
- After posting, `reconcile status` shows booked vs outstanding.

## Step 5 — Clear the bank row (manual, in Merit UI)

When the bank statement imports, each Stripe payout deposit appears in the bank account. Match
it against the **clearing** account — that empties the clearing balance for the cycle and is
the final reconciliation proof. This match stays manual in the Merit UI.

## Verify

- The **clearing** balance returns to ~0 after each payout + its bank match. A standing
  non-zero balance = an in-flight payout (not yet deposited) or a missing/duplicated entry.
- **Revenue at gross, VAT on gross:** revenue line + tagged VAT = the gross card sales; the
  fee never reduces revenue or the VAT base.
- **KMD:** the tagged output VAT appears on the domestic sales lines. The Stripe fee creates
  **no** reverse-charge lines (it is exempt) — if you see pöördkäibemaks lines for Stripe
  fees, the fee was mis-booked as a reverse-charged service.

## Common mistakes

- **Clearing set to a shared settlement account** instead of a dedicated Stripe clearing
  account — both net to zero, but a dedicated account isolates Stripe at a glance. Set it in
  the map going forward; do not re-route posted batches in a filed/pending KMD period.
- **Explicit VAT row added to the batch** → double-posts, Merit rejects (`PR kanne ei ole
  tasakaalus`). Tag the revenue line only.
- **Stripe fee booked as a reverse-charged foreign service** → wrongly creates KMD lines and
  treats an exempt payment service as taxable. Book it to 4340 with no TaxId.
- **Hard-coded VAT guid / account codes** → per-company and they change; read `taxes list`
  and `accounts list`.
- **Revenue account name says "22%"** while the rate applied is 24% — cosmetic only (the VAT
  is driven by the TaxId, not the account name), but rename the account in the Merit UI to
  avoid confusion. There is no `accounts` write verb in the CLI; this is a UI-only edit.
