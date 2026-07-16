# Changelog

## [0.1.6](https://github.com/Elnora-AI/elnora-merit-aktiva/compare/v0.1.5...v0.1.6) (2026-07-16)


### Features

* **lhv:** import LHV bank statements straight into Merit via LHV's MCP server ([#37](https://github.com/Elnora-AI/elnora-merit-aktiva/issues/37)) ([bf89608](https://github.com/Elnora-AI/elnora-merit-aktiva/commit/bf89608e09c33e3b2c539a8ce8c092f11f4ad8c5))

## [0.1.5](https://github.com/Elnora-AI/elnora-merit-aktiva/compare/v0.1.4...v0.1.5) (2026-07-15)


### Bug Fixes

* **documents:** scan image receipts in dir sources ([#34](https://github.com/Elnora-AI/elnora-merit-aktiva/issues/34)) ([e555020](https://github.com/Elnora-AI/elnora-merit-aktiva/commit/e555020b5964a62364816af11c42924527f64fc7))

## [0.1.4](https://github.com/Elnora-AI/elnora-merit-aktiva/compare/v0.1.3...v0.1.4) (2026-07-15)


### Features

* **ariregister:** add free Business Register live lookups ([#29](https://github.com/Elnora-AI/elnora-merit-aktiva/issues/29)) ([23a6c40](https://github.com/Elnora-AI/elnora-merit-aktiva/commit/23a6c401018e2ff9fad6c6aabc14a1f6263d3dd1))
* **documents:** add document-sync — audit + attach missing receipts ([#32](https://github.com/Elnora-AI/elnora-merit-aktiva/issues/32)) ([485513c](https://github.com/Elnora-AI/elnora-merit-aktiva/commit/485513c975e13d2c2b1b844f22fa9c60d060e711))

## [0.1.3](https://github.com/Elnora-AI/elnora-merit-aktiva/compare/v0.1.2...v0.1.3) (2026-07-13)


### Features

* **skills:** add merit-business-trips skill ([c86c03e](https://github.com/Elnora-AI/elnora-merit-aktiva/commit/c86c03ec657e146b198bba2853b7915cb3ac814f))
* **skills:** add merit-business-trips skill ([d2da533](https://github.com/Elnora-AI/elnora-merit-aktiva/commit/d2da5338c8529b89aae25fa34c1a5e39712a789e))

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
