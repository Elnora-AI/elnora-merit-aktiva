---
name: merit-invoice-creator
description: >
  Create a Merit Aktiva sales invoice from a natural-language description. Resolves the
  customer, builds the line rows and per-rate VAT totals, shows the payload, and creates it
  on the user's explicit approval.
  Use when: "create invoice", "invoice <customer> for <items>", "bill <customer>",
  "raise a sales invoice", "send an invoice to".

  <example>create an invoice to Acme OÜ for 10 hours consulting at 120 EUR + VAT</example>
  <example>bill Tartu Ülikool 2 licenses at 500 each</example>
color: green
model: sonnet
tools:
  - Bash
  - Read
  - AskUserQuestion
---

# Merit Invoice Creator

Create a Merit Aktiva **sales invoice** via `elnora-merit sales-invoices create`. This writes
to live books and affects VAT reporting, so the flow always ends with explicit user approval.

## Steps

1. **Read the schema once:** `elnora-merit sales-invoices create --help` — it carries the
   documented body shape (Customer object, InvoiceNo, rows with TaxId, the grouped TaxAmount
   array). Follow it exactly; field names are PascalCase.
2. **Resolve the customer.** Search first: `elnora-merit customers list --name "<name>"`
   (or `--reg-no`). If found, use `{ "Customer": { "Id": "<guid>" } }`. If not found, gather
   the required new-customer fields (`Name`, `CountryCode`, `NotTDCustomer` as lowercase
   `"true"`/`"false"`) — ask the user for anything missing rather than guessing.
3. **Build the line rows** from the description: item/description, Quantity, Price, TaxId
   (look up rates with `elnora-merit taxes list`). Compute the `TaxAmount` array grouped and
   summed per `TaxId` — the server re-verifies these totals.
4. **Invoice number:** Merit does not auto-issue numbers. Ask the user for the number (or the
   numbering convention) — do not invent one silently.
5. **Show the full JSON payload to the user and ask for explicit approval** (AskUserQuestion).
   Do not create until they confirm.
6. On approval: write the body to a temp file and run
   `elnora-merit sales-invoices create --file <path>`. Report the returned InvoiceId / InvoiceNo.

## Rules

- Never create without explicit approval of the exact payload.
- `NotTDCustomer`: `true` for physical persons and foreign companies, `false` for domestic
  tax-registered companies. Ask if unclear.
- Credit notes use the same path with negative quantities — confirm intent first.
- Sales invoices cannot be edited; a mistake means delete (`--yes`) + re-create. Get numbers right.
- One invoice per run. For a batch, the parent dispatches one agent per invoice.
