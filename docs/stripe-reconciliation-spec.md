# Stripe → Merit Aktiva reconciliation — design spec

Status: implemented
Scope: a universal, publishable connector that books Stripe activity (card payments,
refunds, processing fees, platform/application fees, payouts) into Merit Aktiva.
Ships inside this repo as the `reconcile` command group, wrapped by the
`merit-aktiva-workspace` plugin. Built for any Merit Aktiva company —
**nothing company-specific is hardcoded** — same universal contract as the rest of the CLI.

---

## 1. Why Stripe is the anchor (not Luma)

A tempting framing for event ticketing is Luma → Stripe → Merit. The money flow is simpler than that:

- Luma is **not** the merchant of record. Paid Luma events connect the organizer's
  **own Stripe account** (Stripe Connect). Ticket charges land **directly in the
  organizer's Stripe balance**; Luma takes a 5% platform fee (0% on Luma Plus);
  Stripe takes its processing fee; **Stripe pays out to the bank directly**.
- Luma's API/webhooks expose `amount` / `is_captured` but **no Stripe charge or
  payment_intent ID** — you cannot key-join a Luma ticket to a Stripe charge.

Therefore the canonical source of truth for the books is **Stripe**, which carries
every amount and ID needed (charges, fees, refunds, balance transactions, payouts).
Luma is just one sales channel feeding that Stripe account. This connector reads
Stripe and writes Merit. Luma is out of the data path.

This makes the tool genuinely general: it reconciles **any** Stripe account into
**any** Merit Aktiva company, whether the charges originate from Luma, a checkout,
subscriptions, or payment links.

---

## 2. Accounting model: one balanced GL summary batch per payout

A Stripe payout is one bank deposit. Its balance transactions (charges, refunds,
fees) net **exactly** to the payout amount. Booking per payout is how mature
Stripe→accounting integrations work (A2X-style) and it reconciles to the cent
against the bank statement.

**Each payout is booked as ONE balanced summary GL batch** (Merit `sendglbatch`, v1)
— not per-charge invoices or receipts. High-volume B2C card sales are aggregated:
there are **no per-buyer customers, no sales invoices, and no receipts/`sendpayment`
calls**. That is the canonical, best-practice treatment for card-sale volume.
Genuine company sales invoices that need a Merit A/R record are booked **separately,
outside this tool**.

Revenue is recognised **GROSS** (the full card sale), with Stripe and platform fees
booked as a **separate expense** — the ASC 606 / IFRS 15 principal treatment (the
merchant is principal; fees are a cost of sale, not a reduction of revenue).

For one payout `po_X` the batch posts these lines (`DocNo = po_X`; `BatchDate` = the
§11 VAT-period anchor — the charge month, which equals the payout arrival except for a
month-end straddle, computed in the map's `vatTimezone`), using the GL codes from the map:

```
Dr  accounts.clearing      gross           card sales, VAT-inclusive
    Cr  accounts.revenue       net (gross − VAT)   carries the VAT TaxId + VatAmount
   [Cr  output VAT            vat]                 IMPLICIT — posted by Merit from the tag
Dr  accounts.stripeFees    stripeFee       Stripe processing fees (expense)
Dr  accounts.platformFees  platformFee     platform / application fees (expense)
    Cr  accounts.clearing      stripeFee + platformFee   fees offset
Dr  accounts.refunds       refund          contra-revenue (only if the payout has refunds)
    Cr  accounts.clearing      refund                    refunds offset
```

The explicit rows are intentionally short by exactly the VAT amount: Merit supplies the
output-VAT credit implicitly from the revenue line's `TaxId`/`VatAmount` tag, so the
posted batch balances (see "VAT tagging for KMD" below — adding an explicit VAT row
would double-post). A payout whose charges span two VAT months is **blocked**, not
mis-split — book each charge month by hand. The connector asserts the Stripe-side
identity

```
payout.net == Σ charge.net − application_fees − refunds − other_fees
```

holds before it writes; if it doesn't, the payout is **not bookable** and the
connector refuses to post, reporting the discrepancy.

### Why the clearing account

After the batch posts, `accounts.clearing` is left holding **exactly the payout NET**
— gross debited in, fees and refunds credited out. The real **bank-import row**
for that deposit then clears the clearing account to zero in the Merit UI (**one match
per payout**). This keeps the connector out of the bank feed entirely: it never books
a bank line, so there is no double bank posting and no Merit bank/payment-method
configuration to maintain.

### VAT tagging for KMD

The output VAT is **not** posted as an explicit GL row. The **revenue line carries the
VAT `TaxId`** (`vat.code`) and `VatAmount`, and Merit *both* posts the VAT credit to its
configured output-VAT account *and* flows the amount onto the KMD (VAT return) from that
tag. Adding an explicit VAT-account line in addition to the tag double-posts the VAT and
Merit rejects the batch ("PR kanne ei ole tasakaalus"); an untagged VAT line would land
in the GL but never reach the KMD. The `accounts.vatPayable` map field is therefore
**informational/optional** — the connector never writes to it.

---

## 3. Universal design: everything is a config-driven mapping

The only thing that differs per company is **which Merit accounts/codes the Stripe
buckets map to**. That lives in one mapping file — shipped as an empty placeholder,
populated by the user. No GL codes, VAT rates, or account IDs in the source.

`~/.config/elnora-merit/stripe-map.json` (path overridable via `--map` /
`MERIT_STRIPE_MAP`):

```jsonc
{
  "currency": "EUR",                 // payout currency this map applies to
  "stripeAccount": "acct_...",       // optional guard: refuse if the key's account differs
  "cutoffDate": "2026-06-01",        // forward-only start (YYYY-MM-DD)
  "accounts": {
    "revenue": "<gl code>",          // ticket / sales revenue (booked net of VAT)
    "vatPayable": "<gl code>",       // optional, informational — Merit posts VAT implicitly
    "stripeFees": "<gl code>",       // Stripe processing fees (expense)
    "platformFees": "<gl code>",     // Luma 5% / other application fees (expense)
    "refunds": "<gl code>",          // refunds / contra-revenue
    "clearing": "<gl code>"          // Stripe clearing account — the real
                                     //   bank-import row clears this in the Merit UI
  },
  "vat": {
    "code": "<merit TaxId Guid>",    // Merit VAT TaxId (e.g. EE 24%) — also tags revenue for KMD
    "rate": 0.24                     // fallback split rate when Stripe Tax is absent
  }
}
```

`accounts.clearing` is a **GL account code** (a 10xx clearing account), not a bank or payment
method. There is no `bankId` and no clearing payment-method setup — the connector only
posts GL batches, and the real bank line clears the GL account in the UI.

`elnora-merit reconcile init` writes the placeholder and prints the candidate values
(`accounts list`, `taxes list`) so the user fills it from their own chart of accounts.
Multiple maps (e.g. per currency / per Stripe account) are allowed via `--map`.

---

## 4. VAT — the net/VAT split

A Stripe charge is gross (incl. VAT); the books need the net/VAT split.

- **Configured rate** (`vat.rate`): apply the configured rate to card-sale revenue.
  Correct for single-rate channels — e.g. single-rate EE event sales are uniformly 24%.
- **Stripe Tax** (future work): the Stripe Charge object carries no tax amount, so
  reading Stripe Tax authoritatively requires the separate Tax Transactions API. The
  split machinery already accepts an authoritative per-charge VAT figure (and warns on
  a mismatch with the configured rate), but nothing populates it today — the configured
  rate is always what does the split.

The summary batch books the **aggregate** net and VAT across all charges in the
payout; the per-charge split is computed for accuracy and surfaced in `preview` detail
but is never posted as individual lines.

---

## 5. Command surface (the `reconcile` group)

```
elnora-merit reconcile init                          # write placeholder map + print candidates
elnora-merit reconcile preview --payout po_X         # show the batch that WOULD post (read-only)
elnora-merit reconcile preview --since 2026-06-01     # preview all payouts since a date
elnora-merit reconcile run --yes --payout po_X        # post one payout's batch to Merit
elnora-merit reconcile run --yes --since 2026-06-01    # post all payouts since a date
elnora-merit reconcile status                         # what's been booked vs outstanding
```

- **Preview is the default posture.** `preview` never writes — it renders the planned
  summary (gross, net, VAT, fees, refunds) plus VAT-mismatch and balance warnings.
- `run` writes only after the batch balances and is gated by `--yes`; it skips payouts
  already in the idempotency ledger (unless `--force`) and skips payouts that don't
  balance. `--since` defaults to the map's `cutoffDate`.
- Reuses the global `--output json|table|csv`, exit codes, and error envelope.

---

## 6. Stripe access

The connector talks to the Stripe REST API directly with native `fetch` (no SDK
dependency), authenticated with a read-only secret/restricted key. Config:

```
STRIPE_API_KEY      Stripe secret key (read scope is sufficient)
```

Reads used: `payouts.list`, `balanceTransactions.list({payout})`, expanding `source`
to recover charge / refund / fee detail and `application_fee`. No writes to Stripe.
(Multi-account users — e.g. one Stripe account per region — run the connector once per
account with its own key + map.)

---

## 7. Idempotency

Booking the same payout twice would double the books. A local ledger
(`~/.config/elnora-merit/reconcile-ledger.json`) records each posted payout
(`payout_id → {amount, currency, posted_at, chargeCount, glPosted}`). `run` skips
payouts already in the ledger unless `--force`. The GL batch `DocNo` is the payout ID
(`po_X`) so a human can spot duplicates in Merit. Merit has no idempotency key of its
own, so the local ledger is the guard — back it up / treat it as the source of truth
for "what's booked."

---

## 8. Why poll, not webhook

Merit has **no inbound webhooks** — it is request/response only, so it can never call
us; we always push into it. Stripe *does* emit `payout.paid`, but bookkeeping closes
monthly, not in real time. The tool is a **scheduled poll** (launchd/cron) running
`reconcile run --yes --since <last>`.
A Stripe-webhook receiver (real-time) is a possible future addition but needs a hosted
endpoint — not justified for month-end books.

---

## 9. Out of scope

- **Genuine company sales invoices** — A/R records for named customers are booked
  separately, outside this tool. The reconcile path only books the periodic card-sale
  summary.
- **Merit Palk** (payroll) — separate product, separate API/auth. Card payments never
  touch it.
- **Other entities** — books kept in another accounting system are out of scope. The tool
  is account-agnostic, but Merit is the only write target here.
- **Real-time webhooks** — a possible future addition.
- **Luma as a data source** — not needed for the money. Optional later: tag revenue by
  Luma event using charge metadata, *if* Luma stamps an event ref into the connected
  charge.
