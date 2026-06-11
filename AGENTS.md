# Using `elnora-merit` from an agent

The `elnora-merit` CLI wraps the Merit Aktiva accounting API. It is built for
programmatic use: JSON output by default, structured error envelopes, and
explicit confirmation gates on destructive actions.

## Setup check

```bash
elnora-merit --version
elnora-merit accounts list --output json   # cheapest read-only call to confirm auth works
```

If you get `{"error": ..., "suggestion": ...}` with exit code 3, credentials are
missing — `MERIT_API_ID` and `MERIT_API_KEY` must be in the environment or
`~/.config/elnora-merit/.env`. Exit code 6 with `status: 401` and a body of
`api-wronglicense` means the account is not on a Pro/Premium plan.

## Conventions

- **Default output is compact JSON** on stdout. Parse it directly. Add `--fields a,b`
  to trim columns, `--output table` for human display, `--pretty` for readability.
- **Errors go to stderr** as `{ "error", "suggestion", ... }`. Check the exit code:
  `0` ok · `1` general · `2` validation · `3` auth · `5` rate limited · `6` API error.
- **Read = query commands** (`list`, `get`, `find`, reports). **Write = create/send/update/delete.**
- **Reports and lists are POST with a JSON body** — that's normal for Merit.

## Reading

```bash
elnora-merit sales-invoices list --period-start 2026-01-01 --period-end 2026-03-31
elnora-merit sales-invoices list --unpaid --period-start 2026-01-01 --period-end 2026-03-31
elnora-merit customers list --name "Acme"          # MUST filter; an unfiltered query errors
elnora-merit reports income-statement --end-date 20260331 --per-count 3
```

## Writing (create/send/update)

Complex documents (invoices, GL batches, payments) take the documented Merit JSON
body via `--data '<json>'` or `--file <path.json>`. Read the command's `--help`
first — it lists the required fields and nested object shapes:

```bash
elnora-merit sales-invoices create --help          # shows the full body schema
elnora-merit sales-invoices create --file ./invoice.json
```

Build the body to match the schema exactly (PascalCase field names). Examples and
field types are in the [reference manual](https://api.merit.ee/connecting-robots/reference-manual/).

Key rules baked into the API:
- Booleans like `NotTDCustomer` must be the lowercase strings `"true"`/`"false"`.
- A sales invoice's `TaxAmount` array is grouped+summed per `TaxId`; the server re-verifies.
- Credit invoices use the same `create` path with negative quantities.
- Sales invoices can't be updated — `delete` (needs `--yes`) and re-create.

## Destructive operations

`delete` commands refuse to run without `--yes`:

```bash
elnora-merit sales-invoices delete <SIHId> --yes
```

Never pass `--yes` unless the user explicitly asked to delete that specific record.

## Rate limits

100 requests/minute. The CLI retries 429s automatically. For bulk work, stay well
under the limit and respect the 500-rows-per-document cap.

## Money safety

This writes to live books and affects VAT reporting. Confirm payloads with the user
before sending in production. Prefer a non-production Merit company for testing.
