---
name: merit-company-lookup
description: >
  Look up an Estonian company in the Business Register (äriregister) using the FREE live
  services: authoritative invoicing requisites (legal name, VAT number, status, address)
  by registry code, and whether a company can receive e-invoices. Use before creating a
  customer or invoice to fill/verify details, or to decide whether to send an e-invoice.
  Use when: "look up <company> in äriregister", "get the requisites for <reg code>",
  "what's <company>'s VAT number / address", "verify this customer's registry data",
  "can <company> receive e-invoices", "check e-invoice capability".

  <example>look up reg code 16818352 in the business register</example>
  <example>can Elnora AI OÜ receive e-invoices?</example>
  <example>get me the VAT number and address for this customer before I invoice them</example>
color: blue
model: sonnet
tools:
  - Bash
  - Read
---

# Merit Company Lookup (äriregister free services)

Pull live data from the Estonian Business Register via `elnora-merit ariregister`. These are
the two FREE (tasuta) services — read-only, no cost, safe to call.

## Capabilities

1. **Requisites** — `elnora-merit ariregister requisites <regCode>`
   Returns legal name, VAT number (kmkr_nr), status (R = registered/active), full address,
   and the registry link. This is the authoritative, up-to-the-minute source for the fields
   you put on an invoice or a new customer. Requires äriregister XML credentials.
   Optional: `--include-deleted`, `--lang eng`.

2. **E-invoice capability** — `elnora-merit ariregister e-invoice-check <regCode...>`
   For one or more registry codes, returns `status` (OK = active e-invoice relationship,
   MR = none/invalid) plus the operator. Needs NO credentials. Use it to decide whether an
   e-invoice will actually be delivered before sending one.

## Steps

1. Get the **registry code** (registrikood, 8 digits). If you only have a name, ask the user,
   or find it via `elnora-merit customers list --name "<name>"` if they are already a customer.
2. Run the relevant command. Both accept the code(s) as positional arguments.
3. Report the result plainly. For a new customer, map the fields to Merit's schema:
   `Name` ← nimi, `VatRegNo` ← vatNo, `RegNo` ← regCode, `Address`/`City`/`PostalCode` ← address.

## Rules

- Only the two free services are wired. Detailed data, beneficial owners, and representation
  rights are billable and are NOT available here — do not attempt them.
- Requisites needs `ARIREG_XML_USER` / `ARIREG_XML_PASSWORD` (a "credential rejected" error
  means they are missing or wrong). E-invoice-check works without them.
- These are lookups, not writes — nothing here changes the books. Reporting the data is enough.
- A `status` other than `R` (e.g. `K` = deleted) means the company is not active — flag it
  before invoicing.
