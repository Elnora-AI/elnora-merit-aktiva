---
name: merit-profile
description: Sync or show the company profile — this account's real chart of accounts, banks, VAT codes, and financial years
argument-hint: "[sync | show | show taxes|accounts|banks|years]"
allowed-tools: Bash, Read
---

# Merit Company Profile

Manage the **company profile** for: **{{args}}**

The profile is a local snapshot of this Merit account's own reference data (chart of
accounts, banks, VAT TaxId guids, financial years), pulled live from the account. It is the
machine-readable half of a company books reference — load it before posting so an agent uses
the right codes instead of guessing or hand-transcribing.

It lives at `company-profile.json` in the references directory (`MERIT_REFERENCES_DIR`,
default `~/.config/elnora-merit`). It holds no secrets but is company-specific, so it is
gitignored and never committed.

## Run

```bash
# Pull accounts/banks/VAT/years from the live account → company-profile.json:
elnora-merit profile sync

# Re-pull after the chart of accounts changes (overwrites):
elnora-merit profile sync --force

# Read it back (whole profile, or one section):
elnora-merit profile show
elnora-merit profile show --section taxes      # VAT TaxId guids + rates
elnora-merit profile show --section accounts   # chart of accounts (code, name, guid)
elnora-merit profile show --section banks       # bank ids + account codes
elnora-merit profile show --section years        # financial years
```

## Present

For `sync`, confirm what was written: the path and the counts per section. For `show`,
render the requested section as a compact table (e.g. for `taxes`: code, name, rate, guid).

## Notes

- Requires Merit credentials (`MERIT_API_ID` / `MERIT_API_KEY`) and a Pro/Premium license,
  same as any read command.
- `sync` refuses to overwrite an existing profile without `--force`.
- Aktiva reference data only — Merit Palk import IDs are not included.
