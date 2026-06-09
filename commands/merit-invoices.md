---
name: merit-invoices
description: List, find, or inspect Merit Aktiva sales/purchase invoices
argument-hint: "[period or invoice no or customer]"
allowed-tools: Bash, Read
---

# Merit Invoices

Look up invoices in Merit Aktiva for: **{{args}}**

## Run

Pick the query that matches the request (all output JSON for parsing):

```bash
# Sales invoices over a period (max 3 months). Add --unpaid for open items.
elnora-merit sales-invoices list --period-start <YYYY-MM-DD> --period-end <YYYY-MM-DD> --output json

# Find a sales invoice by number or customer (no period needed)
elnora-merit sales-invoices find --inv-no "<no>"
elnora-merit sales-invoices find --cust-name "<name>"

# Full detail of one invoice (by SIHId)
elnora-merit sales-invoices get <SIHId>

# Purchase invoices
elnora-merit purchase-invoices list --period-start <YYYY-MM-DD> --period-end <YYYY-MM-DD>
```

Use `elnora-merit sales-invoices --help` / `purchase-invoices --help` for all flags.

## Present

Render as a table: invoice no, date, customer/vendor, total, paid status. Total any amounts the user asked about. Flag unpaid/overdue items.

## Don't

- Don't span more than 3 months in one `list` (Merit rejects it) — page by quarter.
- Don't mutate anything — creating/sending is `merit-invoice-creator`; deleting needs explicit `--yes`.
