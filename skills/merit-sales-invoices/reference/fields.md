# Sales invoice body schema (`sendinvoice` / `sendinvoice2`)

Full field reference for `elnora-merit sales-invoices create` (POST `/api/v1/sendinvoice`).
`create-v2` (POST `/api/v2/sendinvoice`) takes the same body plus the v2-only fields noted
below. Authoritative source is always `elnora-merit sales-invoices create --help`.

## Header

| Field | Type | Notes |
|---|---|---|
| `Customer` | object | Either `{ "Id": Guid }` (existing) or `{ "CustomerId": Guid }`, OR new-customer fields: `Name` + `CountryCode` + `NotTDCustomer` (lowercase `"true"`/`"false"`). Optional on new: `RegNo`, `VatRegNo`, `CurrencyCode`, `PaymentDeadLine` (Int), `Address`, `City`, `County`, `PostalCode`, `Email`. |
| `InvoiceNo` | Str35 | **Required.** You manage it; must be unique. |
| `DocDate` | Date | `YYYYMMDDHHMMSS`. Invoice date. |
| `DueDate` | Date | `YYYYMMDDHHMMSS`. |
| `TransactionDate` | Date | `YYYYMMDDHHMMSS`. Posting/ledger date. |
| `RefNo` | Str36 | Reference number; auto-derived from `InvoiceNo` if omitted. |
| `CurrencyCode` | Str | Defaults to local currency (EUR). |
| `DepartmentCode` / `ProjectCode` | Str | Optional dimensions (v1). |
| `TotalAmount` | Decimal | Net total **without** VAT. |
| `RoundingAmount` | Decimal | Rounds `TotalSum` (gross), not `TotalAmount`. |
| `Hcomment` / `Fcomment` | Str | Header / footer comment. |
| `ContractNo` | Str | Contract number — required by some state e-invoice recipients. |
| `PDF` | Base64 | Optional attached PDF. |

## `InvoiceRow[]` (line items)

| Field | Type | Notes |
|---|---|---|
| `Item.Code` | Str20 | **Required.** |
| `Item.Description` | Str150 | **Required.** (Str100 on `create-multi-payment`.) |
| `Item.Type` | Int | `1` stock, `2` service, `3` item. |
| `Item.UOMName` | Str | Unit of measure name. |
| `Quantity` | Decimal | Negative on credit notes. |
| `Price` | Decimal | Net per unit; pulled from the price list if omitted. |
| `DiscountPct` / `DiscountAmount` | Decimal | Optional. |
| `TaxId` | Guid | **Required.** From `elnora-merit taxes list`. |
| `GLAccountCode` | Str | Override the revenue account for this line. |
| `LocationCode`, `DepartmentCode`, `ProjectCode`, `CostCenterCode` | Str | Dimensions (v1 rows). |
| `ItemCostAmount` | Decimal | Required when crediting stock items. |
| `VatDate` | YYYYMMDD | VAT declaration date for the line. |

## `TaxAmount[]` (required)

Array of `{ "TaxId": Guid, "Amount": Decimal }`, **grouped and summed per `TaxId`**. The
API recalculates and verifies. On credit notes the `Amount` stays **positive** even
though row quantities are negative.

## `Payment` (optional — invoice paid on issue)

`{ "PaymentMethod": Str, "PaidAmount": Decimal (≤ gross), "PaymDate": "YYYYmmddHHii" }`.
Leave it out to record the receipt later via the payments group.

## v2-only fields (`create-v2`)

- `CurrencyRate` (Decimal) — ECB rate for the date if omitted.
- `Dimensions: [{ DimId: Int, DimValueId: Guid, DimCode: Str }]` — header and per-row.
- `ReserveItems` (Bool), `FileName` (Str), `Payer` (object), `DeliveryType` (Bool).
- v2 rows **drop** the v1-only `LocationCode` / `ProjectCode` / `CostCenterCode` (use
  `Dimensions` instead). Use v2 whenever dimensions are involved.

## Variants

| Command | Endpoint | Use |
|---|---|---|
| `create` | `/api/v1/sendinvoice` | Standard invoice. |
| `create-v2` | `/api/v2/sendinvoice` | Dimensions / currency rate. |
| `create-credit` | `/api/v1/sendinvoice` | Credit note (negative quantities). |
| `create-multi-payment` | `/api/v1/sendinvoice2` | `Payments` array instead of single `Payment`. |
| `create-from-xml` | `/api/v2/sendinvoicexml` | Body is RAW e-invoice XML (standard 1.2); each article needs EAN or SellerProductID. |

Returns `{ CustomerId, InvoiceId, InvoiceNo, RefNo, NewCustomer }` (XML variant returns
`ErrMsg` instead of `NewCustomer`).
