# elnora-merit-aktiva

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@elnora-ai/merit-aktiva.svg)](https://www.npmjs.com/package/@elnora-ai/merit-aktiva)
[![CI](https://github.com/Elnora-AI/elnora-merit-aktiva/actions/workflows/ci.yml/badge.svg)](https://github.com/Elnora-AI/elnora-merit-aktiva/actions/workflows/ci.yml)

A complete command-line client and Claude Code plugin for the [Merit Aktiva](https://www.merit.ee/) accounting API — the Estonian (`aktiva.merit.ee`) and Polish (`program.360ksiegowosc.pl`) cloud accounting platform.

Full coverage of the Merit Aktiva REST API across **22 accounting resource groups** — sales & purchase invoices, sales offers, recurring invoices, payments, general ledger, fixed assets, taxes, customers, vendors, accounts, projects, cost centers, dimensions, departments, prices & discounts, units of measure, banks, financial years, items, and reports.

It also covers the [**Merit Palk**](https://api.merit.ee/merit-palk-api/palk-reference-manual/) payroll API (Estonia, `palk.merit.ee`) under the `palk` command group — employees, contracts, base salary agreements, salaries & withholdings, absences, GL, vacation obligation, and the salary/hours report. Palk uses its own credentials and a PRO license (see [Merit Palk (payroll)](#merit-palk-payroll)).

- **Universal & open** — no account-specific values are baked in. Configure with environment variables; works for any Merit Aktiva company.
- **Correct by construction** — HMAC-SHA256 request signing verified against Merit's published test vector.
- **Agent-friendly** — JSON by default, machine-readable error envelopes with dedicated exit codes, `--data/--file` JSON input for complex payloads.
- **Safe** — destructive operations require an explicit `--yes`; credentials and signatures are redacted from all output.

> Requires a Merit Aktiva **Pro** or **Premium** license (the API is not available on lower tiers).

## Install

```bash
npm install -g @elnora-ai/merit-aktiva
```

This puts the `elnora-merit` CLI on your PATH. Node.js ≥ 20 required.

## Authenticate

Generate an **API ID** and **API Key** in Merit Aktiva:
**Settings → Company data → API settings → "Koosta võti" (Generate key)**.

Provide them via environment variables, an env file, or an interactive prompt (the CLI prompts and saves to `~/.config/elnora-merit/.env` with mode `0600` on first use):

```bash
export MERIT_API_ID=your-api-id
export MERIT_API_KEY=your-api-key
export MERIT_LOCALIZATION=ee   # ee (Estonia, default) or pl (Poland)
export MERIT_API_VERSION=v1    # default for dual-version endpoints
```

Or copy [`.env.template`](.env.template) to `.env` and fill it in (the `.env` is gitignored — never commit it).

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MERIT_API_ID` | yes | — | GUID from API settings |
| `MERIT_API_KEY` | yes | — | base64 secret; HMAC shared key |
| `MERIT_LOCALIZATION` | no | `ee` | `ee` or `pl` |
| `MERIT_API_VERSION` | no | `v1` | `v1` or `v2` default |
| `MERIT_BASE_URL` | no | derived | override the API base (testing/mocking) |
| `MERIT_PALK_API_ID` | for `palk` | — | Merit Palk API ID (separate product; generated in Palk → Settings → API Settings) |
| `MERIT_PALK_API_KEY` | for `palk` | — | Merit Palk API key (base64 secret) |
| `MERIT_PALK_BASE_URL` | no | derived | override the Palk API base (testing/mocking) |

## Quickstart

```bash
elnora-merit accounts list                              # chart of accounts
elnora-merit banks list                                 # bank accounts
elnora-merit taxes list                                 # VAT rates
elnora-merit sales-invoices list --period-start 2026-01-01 --period-end 2026-03-31
elnora-merit reports income-statement --end-date 20260331 --per-count 3
elnora-merit customers list --name "Acme"               # find a customer

# Output controls (global)
elnora-merit accounts list --output table --fields Code,Name
elnora-merit accounts list --pretty                     # pretty JSON
```

### Creating documents

Create/send endpoints take the documented Merit JSON body via `--data` (inline) or `--file` (path). Each command's `--help` summarizes the required fields:

```bash
elnora-merit sales-invoices create --file invoice.json
elnora-merit sales-invoices create --data '{ "Customer": { "Name": "Acme OÜ", "CountryCode": "EE", "NotTDCustomer": "false" }, "InvoiceNo": "2026-001", ... }'
```

See `elnora-merit sales-invoices create --help` for the full payload schema, and the [official reference manual](https://api.merit.ee/connecting-robots/reference-manual/) for field details.

## Output & errors

- **Formats:** `--output json` (default, compact), `table`, or `csv`. `--pretty` for indented JSON. `--fields a,b` to project columns.
- **Errors** are JSON on stderr with a message, a suggestion, and structured data:

```json
{ "error": "Merit API error 401 on getinvoices.", "suggestion": "...", "status": 401 }
```

- **Exit codes:** `0` success · `1` general · `2` validation · `3` auth · `5` rate limited · `6` API error.

## Command reference

Every Merit Aktiva endpoint is available. Run `elnora-merit <group> --help` for the per-command options and payload schemas.

| Group | Commands |
|---|---|
| `sales-invoices` | list, find, get, create, create-v2, create-credit, create-multi-payment, create-from-xml, get-pdf, send-email, send-einvoice, delete |
| `sales-offers` | list, get, create, create-v1, update, set-status, create-invoice |
| `recurring-invoices` | create, list, get, list-client-addresses, send-indication-values |
| `purchase-invoices` | create, create-pending, create-pending-xml, list, find, list-pending, get, delete, pay, report |
| `inventory` | list, list-locations, send, send-v1 |
| `payments` | list, find, list-types, create, create-purchase, create-offer, delete, list-income, list-expense, send-income, send-expense, send-prepayment, send-prepayment-vendor, send-settlement, import-statement, list-imports |
| `gl` | create, list, get, list-full |
| `fixed-assets` | list, list-locations, list-responsible-persons, send |
| `taxes` | list, create |
| `customers` | list, create, update, create-group, list-groups |
| `vendors` | list, create, update, update-v1, create-group, list-groups, list-groups-pl |
| `accounts` | list |
| `projects` | list |
| `cost-centers` | list |
| `dimensions` | list, create, create-values |
| `departments` | list |
| `prices` | list, get, send, list-discounts, send-discounts |
| `units` | list, create |
| `banks` | list |
| `financial-years` | list |
| `items` | list, list-groups, create, create-group, update |
| `reports` | income-statement, balance-sheet, inventory, sales, purchase, customer-debts, customer-payments, more-data |
| `reconcile` | init, preview, run, status — book Stripe payouts into Merit (see below) |

### Merit Palk (payroll)

`palk` is a separate Merit product (payroll) with its own credentials (`MERIT_PALK_API_ID` / `MERIT_PALK_API_KEY`), its own host (`palk.merit.ee`, Estonia-only), and a v1-only API. It requires a Merit Palk **PRO** license. Read commands expose the documented query fields as flags; write commands (`create`/`add`/`set`) take the documented JSON body via `--data`/`--file`.

```bash
elnora-merit palk employees list                         # all employees
elnora-merit palk employees list --personal-code 4910...  --output table
elnora-merit palk base-salary list --start-month 202601 --end-month 202612
elnora-merit palk gl get --month 202606                   # GL batch for a month
elnora-merit palk vacation balance --contract-code 4910... --date 2026-06-30
elnora-merit palk salary-report --start-date 2026-06-01 --end-date 2026-06-30
```

| Group | Commands | Endpoint |
|---|---|---|
| `palk employees` | list, create | getemployees, sendemployees |
| `palk contacts` | add | sendcontacts |
| `palk base-salary` | list, create | getpayterms, sendpayterms |
| `palk salary` | create | sendsalary |
| `palk absences` | create | sendabsence |
| `palk gl` | get | getglbatch |
| `palk vacation` | balance, set-liability | getvacoblig, sendvacoblig |
| `palk salary-report` | _(leaf)_ | getsalaryreport |
| `palk dimensions` | set | senddimensions |
| `palk tax-free` | set | sendtaxfree |
| `palk reduced-capacity` | set | sendincapacitypension |

> Palk dates are `YYYY-MM-DD` and months are `YYYYMM` — see the [Palk reference manual](https://api.merit.ee/merit-palk-api/palk-reference-manual/).

## Notes & gotchas

- Merit endpoints are **POST with a JSON body**, even read/query operations.
- **Dates:** query fields use `YYYYMMDD` (the CLI also accepts `YYYY-MM-DD` and normalizes). Some payload date fields use `YYYYMMDDHHMMSS` — see each command's help.
- **Period limits:** invoice list queries span at most 3 months.
- **Batch limit:** at most 500 rows per document (split larger payloads).
- **Sales invoices cannot be updated** — delete and re-create. Merit does not issue invoice numbers; manage your own.
- **Rate limit:** 100 requests/minute. The CLI auto-retries HTTP 429 honouring `Retry-After`, with a fresh timestamp per attempt.

## Reconcile Stripe payouts

Book Stripe card sales, processing fees, platform fees, and refunds into Merit, one
**payout** at a time (a payout = one bank deposit). Works for any Stripe account → any
Merit company; nothing account-specific is hardcoded.

```bash
# 1. One-time: write a config template and list candidate account/VAT values
elnora-merit reconcile init                 # creates ~/.config/elnora-merit/stripe-map.json
# ...edit that file: account codes (incl. clearing), vat.code (see stripe-map.example.json)

# 2. Set the Stripe key (live, read-only restricted key is enough)
export STRIPE_API_KEY=sk_live_...           # or put it in ~/.config/elnora-merit/.env

# 3. Preview — read-only, shows exactly what would be booked
elnora-merit reconcile preview --output table
elnora-merit reconcile preview --payout po_123

# 4. Book it (writes; requires --yes; idempotent — skips already-booked payouts)
elnora-merit reconcile run --yes
elnora-merit reconcile status               # booked vs outstanding
```

**How it books** (per payout): each payout becomes **one balanced summary GL batch**
(`sendglbatch`) — no per-charge invoices or receipts. It debits the **clearing account**
(`accounts.clearing`) with the gross card sales and credits **revenue** (net of VAT — e.g.
24% for EE). The output VAT is **not** an explicit row: the revenue line carries the VAT
TaxId + amount, and Merit posts the VAT credit implicitly from that tag (which is also what
auto-populates the KMD; an explicit VAT row would double-post). Stripe and platform fees are
debited as a separate expense and credited back to clearing (revenue is booked GROSS with
fees as a cost — ASC 606 / IFRS 15 principal treatment). The clearing account is left holding exactly the payout net, which your real
bank-import row then clears in the Merit UI (one match per payout) — so there is no double
bank posting. Genuine company sales invoices are
booked separately, outside this tool. The connector refuses to book a payout whose Stripe
figures don't balance, and records every booked payout in a local ledger so it is never
booked twice.

> Notes: payout-driven and forward-only (set `cutoffDate` in the map). VAT-period
> boundaries are computed in the map's `vatTimezone` (default `Europe/Tallinn`; set
> `Europe/Warsaw` for Poland), so a month-end charge lands in the correct KMD period. A
> payout whose charges span two VAT months is held back rather than mis-dated — book each
> charge month by hand (the connector does not auto-split). Refunds are booked as a gross
> contra without output-VAT reversal — adjust the VAT on refunds manually. Optional map
> fields: `revenueMemo` (label on the revenue line), `vatTimezone`. Merit has no inbound
> webhooks, so this is run on demand (or scheduled) rather than real-time. See
> [docs/stripe-reconciliation-spec.md](docs/stripe-reconciliation-spec.md) for the full design.

## Claude Code plugin

This repo is also a Claude Code plugin (`merit-aktiva-workspace`): routing skills, slash commands, and agents that wrap the CLI. See [AGENTS.md](AGENTS.md) for agent usage conventions, [INSTALL_FOR_AGENTS.md](INSTALL_FOR_AGENTS.md) for a step-by-step agent setup walkthrough, and [the plugin skill](skills/merit-aktiva-workspace/SKILL.md).

It ships how-to skills for both products. **Accounting:** `merit-aktiva-workspace` (router), `merit-sales-invoices`, `merit-purchase-invoices`, `merit-payments-bank`, `merit-vat-kmd`, `merit-reports`, `merit-reverse-charge`, `merit-stripe`. **Payroll:** `merit-palk-workspace` (router), `merit-palk-employees`, `merit-palk-payroll`, `merit-palk-reports`, `merit-palk-settings`.

Run these as two separate slash commands — paste the first, wait for it to finish, then paste the second:

```
/plugin marketplace add Elnora-AI/elnora-merit-aktiva
```

```
/plugin install merit-aktiva-workspace@elnora-merit-aktiva
```

## Development

```bash
pnpm install
pnpm dev -- accounts list      # run from source
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

See [CONTRIBUTING](.github/CONTRIBUTING.md) and [SAFETY](SAFETY.md).

## License

[Apache-2.0](LICENSE) © Elnora AI. Not affiliated with or endorsed by Merit Tarkvara AS.
