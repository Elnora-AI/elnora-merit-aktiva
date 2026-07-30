---
name: merit-tsd
version: 1.0.0
description: >
  The Estonian TSD (tulu- ja sotsiaalmaksu deklaratsioon) annexes that are NOT payroll:
  lisa 5 (gifts, donations, entertainment/vastuvõtukulud) and lisa 6 (expenses unrelated
  to business — fines, sunniraha, tax-authority interest). Covers what makes a TSD
  mandatory for a month, the 22/78 gross-up, the exact e-MTA form codes, and the
  cumulative annual allowance that is the single most common mistake. Merit Palk's
  "Saada TSD" sends the payroll annexes only — it cannot file these.
  Use when: tax-authority interest or a fine was paid, a partner meal / gift / donation
  was booked, or the question is "do we owe a TSD this month".
  TRIGGERS: "TSD", "lisa 5", "lisa 6", "ettevõtlusega mitteseotud kulud", "non-business
  expenses", "maksuintress", "tax authority interest", "late payment interest", "trahv",
  "fine", "sunniraha", "vastuvõtukulud", "representation costs", "entertainment costs",
  "kingitused", "annetused", "gifts", "donations", "22/78", "do we need a TSD",
  "tulumaksu deklaratsioon", "esinduskulud".
---

# Merit — TSD lisa 5 & lisa 6 (the non-payroll annexes)

An Estonian company files **one TSD per calendar month**, due the **10th of the following
month**. Payroll is only part of it. Two annexes come from the *accounting* side and are
routinely missed:

- **lisa 5** — kingitused, annetused, vastuvõtukulud (gifts, donations, entertainment)
- **lisa 6** — ettevõtlusega mitteseotud kulud (expenses unrelated to business)

**Merit does not file either.** Merit Palk's "Saada TSD" submits the payroll annexes
(lisa 1 / lisa 2) and knows nothing about lisa 5 or lisa 6; Merit Aktiva files no TSD at
all. If a month has a lisa 5 or lisa 6 item, complete the return in **e-MTA → Maksud →
Tulu- ja sotsiaalmaksu deklaratsioon (TSD)** — and if payroll was already sent from Palk,
add the missing annex there *before the 10th* rather than leaving it off.

## Is a TSD mandatory this month?

**TuMS § 54 lg 2** — a resident legal person must declare the costs and payments named in
**§§ 49–53** for the previous calendar month. So a single entertainment cost or one euro of
tax-authority interest makes the return mandatory, **even when the tax works out to zero**.
There is no de-minimis threshold and no "not worth it" exemption.

Practical check each month: any payroll (lisa 1/2), any fringe benefit (lisa 4), any gift,
donation or partner hospitality (lisa 5), any fine / sunniraha / tax-interest / undocumented
payment (lisa 6), any distribution (lisa 7)? Any one of them → file.

## Rate — always 22/78

**TuMS § 4 lg 1** sets 22%, and **§ 4 lg 1¹** divides the taxable amount by **0,78** before
applying it. So the tax on a base amount is `base ÷ 0,78 × 22%`, i.e. **22/78 ≈ 28,205 %**
of the base. Compute it that way, never as 22% of the base.

Pay to the tax authority by the same **10th** (§ 54 lg 4).

## lisa 6 — ettevõtlusega mitteseotud kulud

**TuMS § 51 lg 1** taxes a resident company on expenses unrelated to business. **§ 51 lg 2**
defines them:

| § 51 lg 2 | What |
|---|---|
| p 1 | the costs in **§ 34 punktid 3–6, 11 ja 13** |
| p 2 | joining/membership fees to non-profits where participation is not directly business-related |
| p 3 | payments with **no source document** meeting the Accounting Act's requirements |
| p 4 | buying services unrelated to the company's business |
| p 5 | discharging obligations unrelated to the company's business |

**§ 34 p 3** is the one that bites most often:

> *"seaduse alusel määratud trahve ja sunniraha ning **maksukorralduse seaduse alusel tasutud
> intresse**, välja arvatud maksukorralduse seaduse § 111 alusel **ajatatud** maksuvõlalt
> tasutud intresse, kui maks ei ole määratud maksuotsusega"*

Ordinary late-payment interest on a self-declared return is **always taxable** — the tax
authority's own guidance is explicit that fines, sunniraha and MKS interest need no
business-purpose test, they are taxable by definition. The only carve-out is interest on a
debt formally **rescheduled** (ajatatud) where the tax was not assessed by a maksuotsus.

### lisa 6 codes

| Code | Line |
|---|---|
| 6000 | Difference vs market value on related-party transactions; hybrid-mismatch amounts |
| **6010** | Fines and sunniraha imposed under law |
| 6011 | *of which paid to the tax authority* — **pre-filled by the tax authority** |
| **6020** | **Interest paid under the Taxation Act (MKS)** |
| 6021 | *of which paid to the tax authority* — **pre-filled by the tax authority** |
| 6030 | Value of property specially confiscated from the taxpayer |
| 6040 | Environmental charge at the increased rate / damage compensation |
| 6041 | *of which paid to the tax authority* — pre-filled |
| 6050 | Bribes and kickbacks |
| 6060 | Non-profit joining and membership fees (§ 51 lg 2 p 2) |
| 6070 | Payments made on a missing or non-conforming source document (§ 51 lg 2 p 3) |
| 6080 | Discharging non-business obligations (§ 51 lg 2 p 5) — **also where interest imposed under *foreign* law goes** |
| 6140 | Taxable amount = sum of 6000–6130 **excluding 6011, 6021 and 6041** |

**The `x1` codes are memo lines, not additions.** 6011 / 6021 / 6041 are pre-filled by the
tax authority from its own records and are explicitly excluded from the base at 6140. Enter
the full amount on 6010 / 6020 / 6040; do not also add the pre-filled figure, and do not
subtract it.

## lisa 5 — vastuvõtukulud, kingitused, annetused

**Entertainment (vastuvõtukulud) — TuMS § 49 lg 4.** Hosting guests or business partners
(food, accommodation, transport, entertainment) is tax-free up to **50 € per calendar month**
(the figure from 01.01.2025 — older "32 €" is stale) **plus 2 % of that period's payments
charged with personalised social tax**.

**The allowance is cumulative across the calendar year — this is the mistake to avoid.**
**TuMS § 49 lg 5** allows a summed recalculation, and lisa 5 implements it directly:

```
5100  entertainment costs — this calendar MONTH
5110  entertainment costs — calendar YEAR to date
5120  allowance = [lisa 1 (1200 + 1201 − 1500) + lisa 2 (2200 + 2201 − 2500)] ≥ 0 × 2 %
                 + (50 × calendar-month number)
```

Taxable = `5110 − 5120`, floored at zero. In July the fixed part of the pool is already
`7 × 50 = 350 €`, not 50 €. **Never judge a single month against 50 €** — a company that
spent nothing January–June can spend the whole accumulated pool in July tax-free. The
allowance resets on 1 January; a new year starts the count from scratch.

**Gifts and donations** use the parallel pair: **5000** (fully taxable gifts/donations),
**5010** month / **5020** year for gifts and donations to listed (nimekirja kantud)
associations, whose own annual cap is 3 % of payroll or 10 % of last year's profit (**§ 49
lg 2–3**, taxpayer picks one).

**Declare even when fully exempt.** Codes 5100 / 5010 are filled in the month the cost was
made, with the running year total alongside — that is what drives the summed calculation.
An exempt month with no entry breaks the accumulation. Entering `0` (or "Arvuta ümber")
confirms a nil month and triggers a refund of any earlier overpayment via **5170** → TSD
code 114.

## Booking side in Merit

- Entertainment goes to the company's **Vastuvõtukulud** account with **no deductible input
  VAT** (representation VAT is not deductible). Keep the receipt plus guest names, company
  and business purpose.
- Tax-authority interest goes to the company's **tax-interest expense** account, no VAT.
- Confirm the actual account codes in the company's own chart with `accounts list` — do not
  assume them.
- The source document for tax-authority interest is the **prepayment-account statement line**
  (e-MTA → Arvestus → Ettemaksukontod → Ettemaksukontode väljavõtted → "Tulemus PDF-failina").
  The tax authority issues no invoice for interest, so that statement is the document —
  export it and attach it to the purchase entry.

## Don't

- Don't compute the tax as 22 % of the base — it is 22/78 (`base ÷ 0,78 × 22 %`).
- Don't skip the return because the tax is small or zero; § 54 lg 2 has no threshold.
- Don't re-send a TSD that was already submitted — check whether the month is settled first;
  a second send is a correction return, not a no-op.
- Don't assume Merit Palk's TSD is the whole return when the month also has lisa 5 or lisa 6.
- Don't treat foreign-law interest as code 6020 — it belongs on 6080.
- Don't cite § 34 p 2 for any of this; that clause has been repealed since 01.01.2000.

Verify current amounts against Riigi Teataja and the tax authority's annex guidance before
relying on them — the 2025 reform moved several figures and pre-2025 write-ups are stale.
