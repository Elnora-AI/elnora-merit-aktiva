---
name: merit-company-lookup
version: 1.0.0
description: >
  Look up Estonian companies in the Business Register (äriregister) using the two FREE
  live services via `elnora-merit ariregister`: invoicing requisites (legal name, VAT
  number, status, address) by registry code, and e-invoice capability. Use to fill or
  verify customer/invoice details from the authoritative source, or to check whether a
  company can receive e-invoices before sending one.
  Use when: looking up a company's registry data, getting a VAT number or address by
  registry code, verifying customer details before invoicing, or checking e-invoice
  capability.
  TRIGGERS: "äriregister lookup", "business register", "registrikood", "look up company",
  "company requisites", "VAT number for", "registry data", "verify customer", "e-invoice
  check", "can they receive e-invoices", "e-arve check", "kmkr number".
---

# Merit Company Lookup — äriregister free services

Two FREE (tasuta), read-only services from the Estonian Business Register, exposed via
`elnora-merit ariregister`. Nothing here writes to the books or costs money.

## When to use

- **Before creating a customer/invoice** — pull the authoritative legal name, VAT number,
  and address instead of typing them by hand or trusting a stale value.
- **Before sending an e-invoice** — confirm the recipient actually has an active e-invoice
  channel, so you don't send into a void.

## Commands

### Requisites (needs credentials)
```
elnora-merit ariregister requisites <regCode> [--include-deleted] [--lang eng]
```
Returns JSON: `regCode, name, vatNo, status, statusText, address {street, ehakCode, ehakText,
postalIndex}, registryLink`. `status` `R` = registered/active; `K` = deleted.

Example:
```
$ elnora-merit ariregister requisites 16818352
{"regCode":"16818352","name":"Elnora AI OÜ","vatNo":"EE102672514","status":"R", ...}
```

### E-invoice capability (no credentials)
```
elnora-merit ariregister e-invoice-check <regCode> [<regCode> ...]
```
One row per code: `status` `OK` = active e-invoice relationship (`canReceiveEInvoice: true`),
`MR` = none/invalid; plus `name` and `provider` (operator).

## Mapping requisites to a Merit customer

| äriregister field | Merit customer field |
|---|---|
| `name` | `Name` |
| `vatNo` | `VatRegNo` |
| `regCode` | `RegNo` |
| `address.street` | `Address` |
| `address.ehakText` | `City` / `County` |
| `address.postalIndex` | `PostalCode` |

## Setup & limits

- Requisites needs `ARIREG_XML_USER` / `ARIREG_XML_PASSWORD` in the environment or
  `~/.config/elnora-merit/.env`. Create an XML-authorised user in the e-äriregister portal
  (Haldus → Kasutajate haldamine) and use that account's credentials. A "credential rejected"
  error means they are missing or wrong.
- E-invoice-check needs no credentials at all.
- Only these two free services are wired. Detailed company data, beneficial owners, and
  representation rights are **billable** in the register and are intentionally not exposed.
- Endpoint defaults to production; set `ARIREG_XML_ENV=test` to hit the demo endpoint.

See also: `merit-sales-invoices` (issuing the invoice once requisites are confirmed) and the
`merit-company-lookup` agent for a guided flow.
