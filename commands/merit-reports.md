---
name: merit-reports
description: Pull Merit Aktiva financial reports (P&L, balance sheet, debts, sales/purchase)
argument-hint: "[report type and period]"
allowed-tools: Bash, Read
---

# Merit Reports

Produce a Merit Aktiva financial report for: **{{args}}**

## Run

Dates are `YYYYMMDD` in the body (the CLI also accepts `YYYY-MM-DD` for flag-based dates):

```bash
# Income statement (profit & loss): period END date + how many periods back
elnora-merit reports income-statement --end-date <YYYYMMDD> --per-count <n>

# Balance sheet (financial position): as-of END date + how many periods back
elnora-merit reports balance-sheet --end-date <YYYYMMDD> --per-count <n>

# Customer debts / receivables (a name/id field is required; "" = all customers)
elnora-merit reports customer-debts --cust-name ""

# Sales / purchase reports over a period (--report-type 2 = by customers/vendors)
elnora-merit reports sales --start-date <YYYYMMDD> --end-date <YYYYMMDD> --report-type 2
elnora-merit reports purchase --start-date <YYYYMMDD> --end-date <YYYYMMDD> --report-type 2
```

Run `elnora-merit reports <type> --help` for the exact body fields of each report.

## Present

Summarize the figures the user asked for in plain prose with the key totals. Offer the raw JSON if they want detail. State the period and currency.

## Don't

- Don't fabricate line items — report only what the API returns.
- These are read-only; they never modify the books.
