# Install & setup for agents

A step-by-step guide for an AI agent setting up `@elnora-ai/merit-aktiva` for a user. If
you are a human, the [README](README.md) quickstart is shorter. Follow these steps in
order; do not skip the identity/safety gates.

`elnora-merit` writes to a **live accounting system**. Treat every write as consequential:
confirm intent, prefer `preview`/read-only commands first, and never pass `--yes` unless
the user explicitly asked to perform that specific destructive action.

---

## 0. Identity & safety gate

Before doing anything, confirm with the user:

1. **Which Merit company** these credentials belong to (there is no "test mode" — the API
   acts on the real company books).
2. That they have a **Merit Aktiva Pro or Premium** license (the API is unavailable on
   lower tiers; a non-Pro key returns `401 api-wronglicense`).
3. Whether they also use **Merit Palk** (payroll — separate product, separate keys) and/or
   want the **Stripe → Merit reconcile** connector. Only collect those credentials if so.

Never print a secret value back to the user or into logs. The CLI redacts credentials from
its own error output; you must not defeat that by echoing keys.

---

## 1. Verify the install

```bash
elnora-merit --version
elnora-merit --help
```

If `elnora-merit` is not found, install it: `npm install -g @elnora-ai/merit-aktiva`
(requires Node.js ≥ 20). The `--help` output lists every command group.

---

## 2. Collect & store credentials

The CLI resolves credentials in this order (first wins):

1. `process.env` (`MERIT_API_ID`, `MERIT_API_KEY`, `MERIT_LOCALIZATION`, `MERIT_API_VERSION`)
2. `~/.config/elnora-merit/.env`
3. `./.env` in the current directory (dev convenience)
4. An interactive prompt (only on a TTY)

**Where the user generates the keys:** in Merit Aktiva → **Settings → Company data → API
settings → "Koosta võti" (Generate key)**. This yields an **API ID** (a GUID) and an
**API Key** (a base64 secret used as the HMAC shared key).

Write them to the per-user env file at mode `0600` (do **not** commit this anywhere):

```bash
mkdir -p ~/.config/elnora-merit
umask 077
cat > ~/.config/elnora-merit/.env <<'EOF'
MERIT_API_ID=<the API ID>
MERIT_API_KEY=<the API key>
MERIT_LOCALIZATION=ee   # ee (Estonia, default) or pl (Poland)
EOF
chmod 600 ~/.config/elnora-merit/.env
```

Substitute the real values for the `<...>` placeholders (ask the user to paste them; do not
invent them). Running `elnora-merit accounts list` once on a TTY with no credentials will
also prompt and save them at `0600` for you.

### Optional — Merit Palk (payroll)

A **separate product** with its own keys and host (`palk.merit.ee`, Estonia-only, requires
a Palk PRO license). Generate in **Merit Palk → Settings → API Settings**. Add to the same
env file:

```bash
MERIT_PALK_API_ID=<Palk API ID>
MERIT_PALK_API_KEY=<Palk API key>
```

### Optional — Stripe reconcile

If the user books Stripe payouts into Merit, add a Stripe **secret or restricted** key
(read-only is sufficient — the integration never writes to Stripe):

```bash
STRIPE_API_KEY=<live secret/restricted key for the Stripe account whose payouts you book>
```

---

## 3. Smoke test

The cheapest read-only call that proves auth works:

```bash
elnora-merit accounts list --output table --fields Code,Name
```

- Success → a table of the chart of accounts.
- Exit code `3` with a `suggestion` → credentials missing/invalid (revisit step 2).
- Exit code `6` with `status: 401` and body `api-wronglicense` → the account is not on a
  Pro/Premium plan.

---

## 4. Optional — configure Stripe reconcile

```bash
elnora-merit reconcile init        # writes ~/.config/elnora-merit/stripe-map.json (0600 placeholder)
```

`reconcile init` also prints candidate account codes and VAT codes from the live Merit
company. Edit the map to set: the GL account codes (`revenue`, `vatPayable`, `stripeFees`,
`platformFees`, `refunds`, `clearing`), `vat.code` (a Merit TaxId from `taxes list`),
`cutoffDate`, and optionally `vatTimezone` (default `Europe/Tallinn`; `Europe/Warsaw` for
PL) and `revenueMemo`. See [`stripe-map.example.json`](stripe-map.example.json). The map
holds **no secrets** — the Stripe key stays in the environment — but it is company-specific,
so it is gitignored and must never be committed.

Then always preview before writing:

```bash
elnora-merit reconcile preview --output table   # read-only
elnora-merit reconcile run --yes                # writes; idempotent via a local ledger
```

---

## 5. Conventions you must follow

- **Output is compact JSON on stdout by default.** Parse it. `--output table` for humans,
  `--output csv` for spreadsheets, `--pretty` for indented JSON, `--fields a,b` to project.
- **Errors are JSON on stderr** as `{ "error", "suggestion", ... }`. Check the exit code:
  `0` ok · `1` general · `2` validation · `3` auth · `5` rate limited ·
  `6` API error.
- **Merit endpoints are POST with a JSON body, even queries/reports.** That is normal.
- **Reads** = `list` / `find` / `get` / reports. **Writes** = `create` / `send` / `update`
  / `delete`.
- **Complex documents** (invoices, GL batches, payments) take the documented Merit JSON
  body via `--data '<json>'` or `--file <path>`. Run the command's `--help` first — it
  lists the exact required fields and nested shapes. Field names are PascalCase; booleans
  like `NotTDCustomer` are the lowercase strings `"true"`/`"false"`.
- **Dates:** query fields accept `YYYY-MM-DD` or `YYYYMMDD`; some payload fields use
  `YYYYMMDDHHMMSS`. Palk uses `YYYY-MM-DD` dates and `YYYYMM` months.
- **Destructive commands require `--yes`.** Never add it unless the user asked to delete
  that specific record. Sales invoices cannot be updated — `delete` (with `--yes`) and
  re-create.
- **Limits:** ~100 requests/minute (the CLI auto-retries 429 and transient 5xx); invoice
  list queries span at most 3 months; at most 500 rows per document.

---

## 6. Company-specific bookkeeping

The bundled `merit-*` skills carry the **correct Merit method** but no company's account
numbers. When a task needs real account/VAT codes, look them up live (`accounts list`,
`taxes list`) rather than guessing. If the user keeps a private "company books reference"
(their real account map, VAT TaxId, bank, rules), load it alongside the relevant skill
before posting — but keep that reference in the user's private space, never in this repo.
