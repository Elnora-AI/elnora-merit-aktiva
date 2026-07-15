# elnora-merit-aktiva

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@elnora-ai/merit-aktiva.svg)](https://www.npmjs.com/package/@elnora-ai/merit-aktiva)
[![CI](https://github.com/Elnora-AI/elnora-merit-aktiva/actions/workflows/ci.yml/badge.svg)](https://github.com/Elnora-AI/elnora-merit-aktiva/actions/workflows/ci.yml)

Do your [Merit Aktiva](https://www.merit.ee/) accounting from the command line — or let Claude Code do it for you.

Merit Aktiva is Estonia's cloud accounting platform. This repo gives you two ways to drive its API:

- **`elnora-merit` — a CLI** that covers the entire Merit Aktiva API (invoices, payments, VAT/KMD, ledger, reports, and more) plus Merit Palk payroll. JSON in, JSON out.
- **A Claude Code plugin** that wraps the CLI in skills, agents, and slash commands, so you can ask in plain English ("book this purchase invoice", "file my KMD") and Claude runs the right commands the right way.

Everything is universal — nothing about any one company is hardcoded. Point it at your own Merit credentials and it works.

> Requires a Merit Aktiva **Pro** or **Premium** license — the API is not available on lower tiers.

---

## Install

### As a CLI

```bash
npm install -g @elnora-ai/merit-aktiva
```

This puts the `elnora-merit` command on your PATH. Node.js ≥ 20 required.

### As a Claude Code plugin

Paste these two slash commands into Claude Code one at a time — wait for the first to finish before the second:

```
/plugin marketplace add Elnora-AI/elnora-merit-aktiva
```

```
/plugin install merit-aktiva-workspace@elnora-merit-aktiva
```

The plugin uses the `elnora-merit` CLI under the hood, so install that first.

---

## Authenticate

Generate an **API ID** and **API Key** in Merit Aktiva:
**Settings → Company data → API settings → "Koosta võti" (Generate key)**.

The CLI reads them from environment variables. On first run it also prompts and saves them to `~/.config/elnora-merit/.env` (mode `0600`):

```bash
export MERIT_API_ID=your-api-id
export MERIT_API_KEY=your-api-key
```

Or copy [`.env.template`](.env.template) to `.env` and fill it in (`.env` is gitignored — never commit it).

| Variable | Required | Notes |
|---|---|---|
| `MERIT_API_ID` | yes | GUID from API settings |
| `MERIT_API_KEY` | yes | base64 secret; the HMAC signing key |
| `MERIT_API_VERSION` | no | `v1` (default) or `v2` for dual-version endpoints |
| `MERIT_PALK_API_ID` | for `palk` | Merit Palk API ID (separate payroll product) |
| `MERIT_PALK_API_KEY` | for `palk` | Merit Palk API key (base64 secret) |
| `MERIT_REFERENCES_DIR` | no | Base dir for config + reference files (stripe map, ledger, overrides, `company-profile.json`). Default `~/.config/elnora-merit`. |

### Company profile (optional)

Snapshot your account's own chart of accounts, banks, VAT codes, and financial years so
an agent (or you) can look up the real codes without transcribing them by hand:

```bash
elnora-merit profile sync                  # → company-profile.json (in MERIT_REFERENCES_DIR)
elnora-merit profile show --section taxes  # the VAT TaxId guids, etc.
```

`company-profile.json` holds no secrets but is company-specific, so it is gitignored.
Re-run `profile sync` whenever the chart of accounts changes.

### Estonian Business Register lookups (optional)

**This step is entirely optional.** Everything else in the CLI and the Merit agent works
without it. Setting it up just adds one extra capability: the `elnora-merit ariregister`
commands, which pull company data straight from the Estonian Business Register (äriregister)
using RIK's **free** ("tasuta") API services — so an agent can fill a new customer's legal
name, VAT number, and address, and check e-invoice capability, from the authoritative source
instead of asking you.

One of the two lookups needs no setup at all:

```bash
# e-invoice capability — works with NO credentials:
elnora-merit ariregister e-invoice-check 16818352
```

The requisite lookup needs a free äriregister contract + login. To enable it:

1. **Register for the free API tier.** Go to [rik.ee → e-äriregister → XML teenus](https://www.rik.ee/et/e-ariregister/xml-teenus)
   and conclude a contract for the **"Ainult e-äriregistri tasuta API-teenused"** (free API
   services only) tier at the [e-äriregister portal](https://ariregister.rik.ee/). You log in
   with an Estonian ID-card / Mobiil-ID / Smart-ID. The free tier has no per-query cost. See
   RIK's [contractual-client admin guide](https://abiinfo.rik.ee/e-ariregistri-paringud/juhised-lepingulise-kliendi-administraatorkasutajale).
2. **Create an XML-authorised user.** In the portal: **Haldus → Kasutajate haldamine → Lisa
   kasutaja**, and enable XML/API access for it. (Optionally set the credit limit to `0` so
   only free services can ever run.)
3. **Get the username + password.** The username is shown in the users table; generate the
   password with the **"Uus parool"** button (note: this XML-service password is separate from
   your portal login, and a freshly generated one can take ~10 minutes to activate).
4. **Save them to `~/.config/elnora-merit/.env`** (mode `0600`, gitignored — never commit):

   ```bash
   ARIREG_XML_USER=YOURUSERNAME
   ARIREG_XML_PASSWORD=your-xml-service-password
   ```

Then both lookups work:

```bash
elnora-merit ariregister requisites 16818352      # → name, VAT, status, address
elnora-merit ariregister e-invoice-check 16818352 # → OK/MR + e-invoice operator
```

Only the free services are exposed; billable queries (detailed data, beneficial owners,
representation rights) are intentionally excluded. See the `merit-company-lookup` skill/agent.

---

## Quickstart

```bash
elnora-merit accounts list                              # chart of accounts
elnora-merit banks list                                 # bank accounts
elnora-merit taxes list                                 # VAT rates
elnora-merit customers list --name "Acme"               # find a customer
elnora-merit sales-invoices list --period-start 2026-01-01 --period-end 2026-03-31
elnora-merit reports income-statement --end-date 20260331 --per-count 3

# Output controls (work on any command)
elnora-merit accounts list --output table --fields Code,Name
elnora-merit accounts list --pretty                     # pretty JSON
```

**Creating documents.** Create/send commands take the Merit JSON body via `--data` (inline) or `--file` (path). Each command's `--help` lists the required fields:

```bash
elnora-merit sales-invoices create --file invoice.json
```

See the [official Merit reference manual](https://api.merit.ee/connecting-robots/reference-manual/) for field details.

---

## What you can do

Full coverage of the Merit Aktiva REST API — **22 resource groups** — plus three local helpers: `profile` (snapshot your account's codes), `reconcile` (book Stripe payouts), and `ariregister` (free Estonian Business Register lookups). Run `elnora-merit <group> --help` for per-command options and payload schemas.

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
| `vendors` | list, create, update, update-v1, create-group, list-groups |
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
| `profile` | sync, show — snapshot the account's chart / banks / VAT codes / financial years for lookups |
| `reconcile` | init, preview, run, status — book Stripe payouts into Merit (see below) |
| `ariregister` | requisites, e-invoice-check — free live Business Register lookups (company name/VAT/address; e-invoice capability) |

### Payroll (Merit Palk)

`palk` is Merit's separate payroll product. It uses its own credentials (`MERIT_PALK_API_ID` / `MERIT_PALK_API_KEY`) and needs a Merit Palk **PRO** license.

```bash
elnora-merit palk employees list
elnora-merit palk base-salary list --start-month 202601 --end-month 202612
elnora-merit palk gl get --month 202606                   # GL batch for a month
elnora-merit palk salary-report --start-date 2026-06-01 --end-date 2026-06-30
```

| Group | Commands |
|---|---|
| `palk employees` | list, create |
| `palk contacts` | add |
| `palk base-salary` | list, create |
| `palk salary` | create |
| `palk absences` | create |
| `palk gl` | get |
| `palk vacation` | balance, set-liability |
| `palk salary-report` | _(leaf command)_ |
| `palk dimensions` | set |
| `palk tax-free` | set |
| `palk reduced-capacity` | set |

> Palk dates are `YYYY-MM-DD` and months are `YYYYMM`. See the [Palk reference manual](https://api.merit.ee/merit-palk-api/palk-reference-manual/).

### Reconcile Stripe payouts

Book Stripe card sales, fees, and refunds into Merit, one **payout** at a time (a payout = one bank deposit). Works for any Stripe account → any Merit company.

```bash
elnora-merit reconcile init                 # write a config template to ~/.config/elnora-merit/stripe-map.json
# ...edit that file: account codes + VAT (see stripe-map.example.json)

export STRIPE_API_KEY=sk_live_...           # a read-only restricted key is enough

elnora-merit reconcile preview --output table   # read-only: shows exactly what would be booked
elnora-merit reconcile run --yes                # book it (idempotent — never books a payout twice)
elnora-merit reconcile status                   # booked vs outstanding
```

Each payout becomes one balanced summary GL batch: card sales debit a clearing account, revenue is credited net of VAT (the VAT posts implicitly from the revenue line's tax tag, which auto-populates the KMD), and fees are booked as a separate expense. Your real bank-import row then clears the payout net in Merit — no double posting. The connector refuses to book a payout whose figures don't balance. See [docs/stripe-reconciliation-spec.md](docs/stripe-reconciliation-spec.md) for the full design.

---

## What's in this repo

```
elnora-merit-aktiva/
├── src/                    # the elnora-merit CLI (TypeScript)
├── skills/                 # Claude Code how-to skills (the right Merit procedure for each task)
├── agents/                 # plugin agents
├── commands/               # plugin slash commands
├── docs/                   # Stripe reconciliation spec and design notes
├── .claude-plugin/         # plugin + marketplace manifest
├── AGENTS.md               # agent usage conventions
└── INSTALL_FOR_AGENTS.md   # step-by-step agent setup walkthrough
```

The plugin ships how-to skills for both products so Claude follows the correct Merit procedure, not just the raw API:

- **Accounting** — `merit-aktiva-workspace` (router), `merit-sales-invoices`, `merit-purchase-invoices`, `merit-payments-bank`, `merit-vat-kmd`, `merit-reports`, `merit-reverse-charge`, `merit-stripe`.
- **Payroll** — `merit-palk-workspace` (router), `merit-palk-employees`, `merit-palk-payroll`, `merit-palk-reports`, `merit-palk-settings`.

---

## Design

- **Universal & open** — no account-specific values baked in. Configure with env vars; works for any Merit company.
- **Correct by construction** — HMAC-SHA256 request signing, verified against Merit's published test vector.
- **Agent-friendly** — JSON by default, machine-readable error envelopes with dedicated exit codes, `--data`/`--file` for complex payloads.
- **Safe** — destructive operations require an explicit `--yes`; credentials and signatures are redacted from all output.

### Output & errors

- **Formats:** `--output json` (default, compact), `table`, or `csv`. `--pretty` for indented JSON. `--fields a,b` to pick columns.
- **Errors** are JSON on stderr with a message, a suggestion, and structured data.
- **Exit codes:** `0` success · `1` general · `2` validation · `3` auth · `5` rate limited · `6` API error.

### Notes & gotchas

- Merit endpoints are **POST with a JSON body**, even read/query operations.
- **Dates:** query fields use `YYYYMMDD` (the CLI also accepts `YYYY-MM-DD` and normalizes). Some payload fields use `YYYYMMDDHHMMSS` — see each command's help.
- **Period limits:** invoice list queries span at most 3 months.
- **Batch limit:** at most 500 rows per document.
- **Sales invoices cannot be updated** — delete and re-create. Merit does not issue invoice numbers; manage your own.
- **Rate limit:** 100 requests/minute. The CLI auto-retries HTTP 429 honouring `Retry-After`.

---

## Part of the Elnora family

This tool is one of a family of universal, config-driven Claude Code tools published by [Elnora AI](https://github.com/Elnora-AI). Each works 100% standalone; install several and they chain into an end-to-end workflow — here, a full invoice-to-books loop:

- **[elnora-google-workspace](https://github.com/Elnora-AI/elnora-google-workspace)** — Gmail, Drive, Docs, Sheets, and Calendar CLI + plugin. Chain: generate an invoice PDF with `elnora-merit sales-invoices get-pdf`, then email it to the customer with `gw gmail send` (or use `send-email` / `send-einvoice` directly and file the confirmation from your inbox).
- **[knowledge-vault](https://github.com/Elnora-AI/knowledge-vault)** — a plain-Markdown Obsidian knowledge base with agent-friendly conventions. Chain: file the invoices, VAT/KMD summaries, and reconciliation reports this CLI produces into your vault's finance folders, so every booking has a paper trail your agents can search later.
- **elnora-stripe** *(publishing soon)* — Stripe operations CLI + plugin. Chain: pull payout, fee, and refund data from Stripe, then book each payout into Merit with `elnora-merit reconcile` — one balanced GL batch per bank deposit. (The `reconcile` command already works today with any Stripe API key.)

Browse the full family on the [Elnora AI org profile](https://github.com/Elnora-AI).

## Development

```bash
pnpm install
pnpm dev -- accounts list      # run from source
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

See [CONTRIBUTING](.github/CONTRIBUTING.md) and [SAFETY](SAFETY.md).

## License

[Apache-2.0](LICENSE) © Elnora AI. Not affiliated with or endorsed by Merit Tarkvara AS.
</content>
</invoke>
