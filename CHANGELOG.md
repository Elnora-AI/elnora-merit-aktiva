# Changelog

## [0.1.2](https://github.com/Elnora-AI/elnora-merit-aktiva/compare/v0.1.1...v0.1.2) (2026-06-20)


### Features

* MERIT_REFERENCES_DIR + auto-populated company profile ([#12](https://github.com/Elnora-AI/elnora-merit-aktiva/issues/12)) ([b734799](https://github.com/Elnora-AI/elnora-merit-aktiva/commit/b73479994d3abc421499ca4c6b1724ca82df0d41))
* **reconcile:** add read-only buyer-identity resolver (äriregister + VIES) ([#9](https://github.com/Elnora-AI/elnora-merit-aktiva/issues/9)) ([f123c0b](https://github.com/Elnora-AI/elnora-merit-aktiva/commit/f123c0b4a8d58e361cda09063cb610375de91674))

## [0.1.1](https://github.com/Elnora-AI/elnora-merit-aktiva/compare/v0.1.0...v0.1.1) (2026-06-11)


### Bug Fixes

* close TOCTOU file races flagged by CodeQL (js/file-system-race) ([#4](https://github.com/Elnora-AI/elnora-merit-aktiva/issues/4)) ([33d948d](https://github.com/Elnora-AI/elnora-merit-aktiva/commit/33d948db60d7ce62dc805663346f22dbee11456b))

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
