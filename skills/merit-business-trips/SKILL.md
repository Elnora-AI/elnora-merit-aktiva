---
name: merit-business-trips
version: 1.0.0
description: >
  How to record Estonian foreign business trips (välislähetus) in Merit Aktiva
  correctly: tax-free daily allowance (välislähetuse päevaraha), the VAT treatment
  of flights and hotels (which is NOT reverse charge), paying a non-employee's
  travel via a käsundusleping, and client/partner meals (vastuvõtukulud). All
  figures are the current statutory limits — verify against Riigi Teataja, since
  the 2025 reform raised several of them and older blog figures are stale.
  Use when: booking per diem, a trip expense report, a foreign flight/hotel
  invoice, a contractor's covered travel, or a business-partner dinner.
  TRIGGERS: "lähetus", "välislähetus", "päevaraha", "daily allowance", "per diem",
  "business trip", "trip expenses", "kuluaruanne", "aruandev isik", "reporting
  person expense", "vastuvõtukulud", "representation costs", "client dinner",
  "äripartnerite toitlustamine", "TÖR", "töötamise register", "tasuta töötamine",
  "käsundusleping travel".
---

# Merit — Business trips, per diem, travel VAT & representation

Four separate streams that all show up around a business trip. Keep them apart — each has its own
rule. **The 2025 tax reform raised the päevaraha and representation limits; do not trust pre-2025
figures.** Account codes below are referenced by their standard Estonian name — confirm the exact
code in the company's chart with `accounts list`.

## 1. Välislähetuse päevaraha (tax-free daily allowance)

**Rates — Tulumaksuseadus § 13 lg 3 p 1** (in force from 01.01.2025): tax-free **75 € / day for the
first 15 days per calendar month**, **40 € / day** thereafter. **Mandatory minimum — VV määrus nr
110 § 3** (from 05.07.2025): **40 € / day** (the employer must pay at least this; may pay up to 75 €
tax-free; above 75 € is a taxable fringe benefit on the excess).

**Who qualifies (TuMS § 13 lg 3 p 1):** an employee, official, or **member of the management/control
body** (juhatuse/nõukogu liige) of the payer. A **non-resident** board member or employee is **also
exempt** on the same terms — **TuMS § 31 lg 1 p 7** (their fee/salary is still taxed under § 29, but
the päevaraha is separately tax-free). A plain VÕS contractor does **not** get päevaraha (see §3).

**Which days count — VV määrus 110 § 4:**
- Destination must be **≥ 50 km** from the settlement of the workplace (§ 4(1)).
- **Departure day** counts if the vehicle leaves the country **at or before 21:00**; **return day**
  counts only if it **arrives after 03:00** (§ 4(2)). A red-eye landing at e.g. 00:40 means the
  arrival day does **not** count.
- The employer **may** reduce päevaraha by **up to 70 %** if free meals are provided (§ 4(4)) —
  optional.

**Required document — VV määrus 110 § 2(3):** a written decision (otsustus/käskkiri) stating
**sihtkoht, kestus, ülesanne, and the rates**. Make it before the trip.

**Recording in Merit:** päevaraha is **not** payroll — do NOT run it through Merit Palk. Pay it as a
reporting-person expense: **Ost → Aruandvate isikute kuluaruanded → + Uus kuluaruanne**, pick the
**aruandev isik**, add the päevaraha on a line to the **travel-expenses account (Töölähetuse kulud)**
with **no VAT** (override the account's default rate — päevaraha is not a VATable purchase). Save →
Merit posts the GL entry and a liability to the person; settle it from the bank under **Pangamaksed /
Võlgnevused**. **Within-limit päevaraha is not reported on the TSD** (only the excess over the limit
is a fringe benefit on TSD lisa 4).

## 2. VAT on flights & hotels — NOT reverse charge

This is the common mistake. Travel has special place-of-supply rules, so the general reverse-charge
logic (for SaaS/consulting) does **not** apply.
- **Flights — international air passenger transport:** **zero-rated**, no domestic VAT, **not**
  reverse-charged, **not** on the KMD as an acquisition. Book gross to the travel-expenses account.
- **Hotels — accommodation:** place of supply is **where the property is** (KMS), so the foreign
  hotel charges its **local** VAT. Book **gross**, no domestic input VAT, **not** reverse-charged.
  (EU foreign VAT may be reclaimable via cross-border refund; usually not worth it for small sums.)

Do **not** route flight/hotel invoices through the reverse-charge skill.

## 3. Paying a non-employee's travel (contractor / käsundusleping)

Someone who is not an employee or board member **cannot** receive tax-free päevaraha. But the company
can still pay their **travel + accommodation** cleanly if there is a real business basis:
- Engage them under a written **käsundusleping / töövõtuleping** — it may be **tasuta (unpaid)** for
  the work itself — stating the company **bears the necessary travel/accommodation costs**. The legal
  basis is **VÕS § 628** (the mandator reimburses the mandatee's necessary costs). The documented
  costs are then the company's **deductible expense** and **not the person's taxable income**. Book
  flights/hotels to the travel-expenses account (VAT per §2). **No päevaraha.**
- **Register the person in TÖR (töötamise register) before their first work day — even if unpaid**
  (MKS § 25¹). For unpaid work the **töötamise liik is "Tasuta töötamine"**; **töökoha aadress = the
  employer's domestic address** for a short trip abroad (do not mark välisriik); no social tax arises.
- Skipping the contract/registration risks the travel being a **taxable erisoodustus** to the related
  board member/employee under **TuMS § 48** (income tax 22/78 + 33 % social tax) — and an unregistered
  worker risks a penalty.

## 4. Client / partner meals — vastuvõtukulud (TuMS § 49)

A genuine **business-partner** meal/reception (food, accommodation, transport, entertainment for
guests/partners) is **representation**, a different stream from travel and from päevaraha.
- **Tax-free up to 50 € per calendar month + 2 % of that month's social-tax-charged payroll** —
  **TuMS § 49 lg 4** (the 50 € figure applies from 01.01.2025; older "32 €" is stale). Unused
  allowance carries forward within the calendar year (§ 49 lg 5). Excess is taxed **22/78** and
  declared on **TSD lisa 5**.
- **The host's own meal counts** when the company's people are at the event **on work duties (hosting
  partners)** — EMTA treats that portion as vastuvõtukulud, not a fringe benefit. This explicitly
  covers representation costs incurred **on a foreign business trip**. The opposite case — an event
  really *for* the staff with a few guests — is split, and the staff portion is erisoodustus.
- Book to the **Vastuvõtukulud** account, **no deductible VAT** (representation input VAT is
  non-deductible). Keep the receipt + **guest names + company + business purpose + date**.

## Quick map

| Cost | Stream | Account | VAT | Reported |
|---|---|---|---|---|
| Per diem to employee/board (incl. non-resident) | päevaraha | Töölähetuse kulud | none | not on TSD if within limit |
| Flights | travel | Töölähetuse kulud | zero-rated, gross | not reverse charge |
| Foreign hotel | travel | Töölähetuse kulud | foreign VAT, gross | not reverse charge |
| Non-employee's covered travel | VÕS § 628 + käsundusleping + TÖR | Töölähetuse kulud | as above | TÖR registration; no päevaraha |
| Business-partner meal | vastuvõtukulud | Vastuvõtukulud | non-deductible | TSD lisa 5 on excess over 50 € + 2 % |
