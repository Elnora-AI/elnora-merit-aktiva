# Reverse-charge VAT in Merit Aktiva — full recipe

Reference for [SKILL.md](../SKILL.md). How to book a reverse-charge (pöördkäibemaks)
purchase invoice via the `elnora-merit` CLI so it self-assesses correctly on the KMD.

Authoritative source: Merit's own guide
[Kauba või teenuse ühendusesisene soetamine](https://www.merit.ee/juhend/aktiva/kaubaviteenusehendusesisene.htm)
and support article
[Ühendusesisene kauba või teenuse ostuarve sisestus](https://support.merit.ee/et/articles/361548-uhendusesisene-kauba-voi-teenuse-ostuarve-sisestus).

## How Merit decides reverse charge

Merit reads the **vendor card's country** (`Firma → Riigid` flags each country as EU
or non-EU). When the vendor's country is an EU member state other than Estonia **and**
the invoice lines carry a non-zero VAT rate, Merit:

- forces the invoice's payable VAT amount to **zero** (the vendor charged none), and
- self-assesses the reverse charge onto the KMD: net value on lines **1, 6, 6.1**,
  the VAT as both output (line **4**) and input (line **5**).

It also posts a **real GL entry** for the reverse charge: the invoice debits the
reverse-charge VAT account and credits the sales-VAT account for the self-assessed amount,
and the monthly KMD closing entry clears the pair. The account codes are whatever your own
chart of accounts uses — read them from `accounts list` rather than assuming. There is no
reverse-charge tax code in Merit; the lever is solely the vendor country.

## Decision table

| Case | `CountryCode` | `VatAccountable` | Line `TaxId` | KMD landing |
|---|---|---|---|---|
| EU goods, supplier VAT-reg | EU, ≠ `EE` | `true` | 24% | value → 1, 6, 6.1; VAT → 4, 5 |
| EU services, supplier VAT-reg | EU, ≠ `EE` | `true` | 24% | value → 1, 6; VAT → 4, 5 |
| Non-EU service, place of supply EE | non-EU | `true` | 24% | value → 1, 7; VAT → 4, 5 |
| EU supplier, NOT VAT-reg | EU | `false` | 0% | none (no reverse charge) |
| Non-EU goods (customs) | non-EU | — | 0% | import VAT handled at customs (toll), not here |

`6.1` is a subset of `6` ("of which intra-community acquisition of goods") — goods hit
both 6 and 6.1; services hit 6 only.

## Step 1 — Get the standard-rate TaxId

The row needs the **standard-rate** guid, not a 0% one. Reverse charge keeps the normal
rate on the line; Merit zeroes the payable VAT itself.

```sh
elnora-merit taxes list --output table
```

Pick the plain standard-rate row (e.g. `24%` → `Value Added Tax 24%`) and take its `Id`.
**Read it from `taxes list` every time** — do not hard-code; guids are per-company and the
rate changes over time.

## Step 2 — Vendor with the right country

The vendor card must carry the correct `CountryCode` and `VatAccountable`. If the vendor
already exists with the right country, skip to step 3. To create:

```sh
elnora-merit vendors create --data '{
  "Name": "Example EU SaaS Ltd",
  "CountryCode": "IE",
  "VatAccountable": true,
  "VatRegNo": "IE1234567X"
}'
```

`CountryCode` and `VatAccountable` are required and `VatAccountable` must be lowercase
`true`/`false`. For non-EU service suppliers use their country (e.g. `"US"`).

## Step 3 — Create the purchase invoice

Net example: a €100 EU SaaS bill. `TotalAmount` is the amount **without** VAT and equals
what the vendor is owed (no VAT is added). The row `TaxId` is the standard rate so Merit
knows the rate to self-assess; the vendor charged €0 VAT, so the payable `TaxAmount` is 0.

```sh
elnora-merit purchase-invoices create --data '{
  "Vendor": { "Name": "Example EU SaaS Ltd", "CountryCode": "IE", "VatAccountable": true, "VatRegNo": "IE1234567X" },
  "DocDate": "20260606",
  "DueDate": "20260620",
  "BillNo": "INV-12345",
  "CurrencyCode": "EUR",
  "InvoiceRow": [
    { "Item": { "Code": "SAAS", "Description": "SaaS subscription", "Type": 2 },
      "Quantity": 1, "Price": 100.00,
      "TaxId": "<standard-rate TaxId from taxes list>",
      "GLAccountCode": "<expense account>" }
  ],
  "TaxAmount": [ { "TaxId": "<standard-rate TaxId from taxes list>", "Amount": 0 } ],
  "TotalAmount": 100.00
}'
```

Notes:
- `TotalAmount` = net (without VAT). For a reverse-charge foreign vendor, payable = net.
- `TaxAmount.Amount` = `0` — the foreign vendor charged no VAT, so nothing is credited to
  the VAT payable account. Merit derives the reverse-charge figures from the vendor country
  + the row's `TaxId` rate, and posts them to the GL as the self-assessed VAT pair described
  above. A `0` here means "the vendor charged no VAT", not "no reverse charge was applied".
- `Type` in `Item`: `2` = service, `1` = stock, `3` = item. Use the right one for goods vs
  services so line 6.1 populates correctly for goods.
- `Item.Code` and `GLAccountCode` must already exist in the company.
- Use `--v2` if you need `TransactionDate`, header dimensions, or a receiver.

## Step 4 — Verify on the KMD (do not skip on a new supplier country)

After posting, confirm the reverse charge actually landed before relying on it:

1. **Read the posted GL batch** (`gl list` for the period, then `gl get <GLBId>`). A correct
   reverse charge shows the self-assessed VAT as a debit to the reverse-charge VAT account
   and a matching credit to the sales-VAT account, alongside the expense debit and the
   payable credit. **This is the definitive test** — do not judge it from the invoice header,
   which reports `TaxAmount = 0` by design.
2. Pull the VAT report / KMD for the period (`reports`, or the Merit UI VAT return).
3. Check the value appears on **line 1** plus **6 / 6.1** (EU) or **7** (non-EU service),
   and the VAT mirrors on **lines 4 and 5** (net €0 when fully deductible).
4. Check the **vendor balance** equals the net (no VAT added).

If the GL pair is absent or line 4/5 stayed empty, the vendor country is wrong (set to `EE`,
or flagged non-EU) or the line was booked at 0% — fix the vendor card / row `TaxId` and
re-post.

## Common mistakes

- **Using a 0% / "(erijuht)" code** on an EU VAT-registered supplier to zero the VAT →
  suppresses the reverse charge; KMD under-declares. Leave the standard rate; let the
  country flag do the work.
- **Vendor country left as `EE`** → no reverse charge; the bill is treated as domestic.
- **Bare GL journal** instead of a purchase invoice → reverse charge never computes.
- **Zeroing a non-EU service line** that is reverse-charged (place of supply EE) → it must
  carry 24%. Only non-EU **goods** (customs) and non-VAT EU suppliers get a zeroed line.
- **Hard-coding the TaxId** → guids are per-company; always read `taxes list`.
