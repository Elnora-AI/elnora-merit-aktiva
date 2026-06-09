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
# Income statement (profit & loss)
elnora-merit reports income-statement --data '{"PeriodStart":"<YYYYMMDD>","PeriodEnd":"<YYYYMMDD>"}'

# Balance sheet (financial position) as of a date
elnora-merit reports balance-sheet --data '{"Date":"<YYYYMMDD>"}'

# Customer debts / receivables
elnora-merit reports customer-debts --data '{}'

# Sales / purchase reports over a period
elnora-merit reports sales --data '{"PeriodStart":"<YYYYMMDD>","PeriodEnd":"<YYYYMMDD>"}'
elnora-merit reports purchase --data '{"PeriodStart":"<YYYYMMDD>","PeriodEnd":"<YYYYMMDD>"}'
```

Run `elnora-merit reports <type> --help` for the exact body fields of each report.

## Present

Summarize the figures the user asked for in plain prose with the key totals. Offer the raw JSON if they want detail. State the period and currency.

## Don't

- Don't fabricate line items — report only what the API returns.
- These are read-only; they never modify the books.
