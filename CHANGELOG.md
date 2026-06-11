# Changelog

## 0.1.0

Initial release.

- HMAC-SHA256 request signing for the Merit Aktiva API (verified against Merit's published test vector).
- Full CLI coverage of the Merit Aktiva REST API across all resource groups: sales invoices, sales offers, recurring invoices, purchase invoices, inventory movements, payments, general ledger, fixed assets, taxes, customers, vendors, accounts, projects, cost centers, dimensions, departments, prices & discounts, units of measure, banks, financial years, items, and reports.
- Merit Palk (payroll) API support under the `palk` command group (Estonia, separate `MERIT_PALK_*` credentials): employees & contracts, base-salary agreements, salaries & withholdings, absences, GL batch, vacation obligation, and the salary/hours report.
- `reconcile` — book Stripe payouts into Merit one payout at a time as a balanced clearing-account GL batch (revenue gross + output VAT, fees as expense, refunds as contra). Preview-first, `--yes`-gated, idempotency ledger, §11 charge-month dating with cross-month payouts held back, VAT-period boundaries computed in a configurable jurisdiction timezone. Config via `reconcile init` → `stripe-map.json` (gitignored placeholder; no secrets).
- Estonian (`aktiva.merit.ee`) and Polish (`program.360ksiegowosc.pl`) localizations; v1/v2 endpoints.
- Automatic retry on HTTP 429 (honouring numeric or HTTP-date `Retry-After`) and transient 5xx, with a fresh timestamp per attempt.
- JSON / table / CSV output (CSV is formula-injection-safe), field filtering, machine-readable error envelopes with dedicated exit codes, credential/signature redaction.
- `merit-aktiva-workspace` Claude Code plugin: accounting and payroll how-to skills, slash commands, and agents.
