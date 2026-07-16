# Changing or deleting a paid invoice

A paid invoice is locked. Merit blocks the two things you are most likely to reach for,
and the API and the UI have **different** capabilities — knowing which is which saves a
lot of wasted, and potentially destructive, work.

## What Merit actually refuses

| Attempt | Result |
|---|---|
| `sales-invoices delete <id>` on a paid invoice | `400` — "Tasutud arvet ei saa kustutada. Enne kustutage makse." |
| UI: change Klient / Valuuta / Valuutakurss on a paid invoice, or reduce the amount | "Arve on juba tasutud. Ei saa muuta klienti, valuutat ja valuutakurssi ega vähendada summat." |
| API: change anything on any invoice | No update endpoint exists at all. |

**The UI's edit fields lie.** Open a paid invoice, click **Muuda**, and the Klient
combobox is fully enabled — it looks editable. Validation only fires on **Salvesta**.
An enabled field is not permission. Never conclude "the UI allows this" from the field
being editable; the only proof is a successful save.

## The fix: take the payment off first

The API's "delete and re-create" advice is a poor fit for a field-level correction (a
wrong customer, a typo): it destroys the invoice number, the dates and the payment link
to fix one field. Prefer this UI procedure, which preserves all of them.

1. **Delete the payment.** Maksed → Maksed → *(the bank, e.g. `Stripe vahekonto`)* →
   **Maksete nimekiri** → select the payment row → **Kustuta** (ALT+X).
   Record the row's details first — you re-enter them by hand in step 3: document date,
   document number, customer, amount, viitenumber, and which invoice it settles.
2. **Edit the invoice.** Müük → Müügiarved → open the invoice → **Muuda** (ALT+O) →
   change **Klient** *and* the separate **Maksja** (payer) field, which is easy to miss
   and defaults to the old customer → **Salvesta** (ALT+S). This now succeeds: the block
   was "arve on juba tasutud" and it no longer is.
3. **Re-add the payment.** Maksed → *(the bank)* → **Uus makse** → Tehingu liik
   "Tehingud klientidega" → customer → document date → document number → tick the
   invoice row → amount → viitenumber → save.
4. **Verify.** Re-fetch and confirm `Paid`, `PaidAmount`, `TotalSum`, the line, and the
   customer's `RegNo` / `VatRegNo` — do not trust the screen:
   `elnora-merit sales-invoices get <SIHId>`.

Between steps 1 and 3 the invoice is unpaid and the bank balance is short by the payment
amount. Expected, and it closes at step 3 — but do the three steps in one sitting rather
than leaving the books half-done.

### Side effect: the due date moves

Re-saving recalculates **Maksetähtpäev** from the *new* customer's `PaymentDeadLine`.
A customer created with `PaymentDeadLine: 7` shifts a 04.06 invoice's due date to 11.06.
`DocumentDate` and `TransactionDate` are untouched, so the **VAT period is unaffected** —
but the due date on the PDF the customer receives does change. Mention it rather than
letting them find it.

### API vs UI on deleting the payment

`payments delete` is documented as high-risk and unsupported over the API (payments have
complex GL relations with their invoices). Deleting a payment **in the UI** is a normal,
supported operation. This is one of several places where the UI is the right tool and the
API is not — so route the user there rather than forcing an API path.

## When to use a credit note instead

`create-credit` / the UI's **Koosta kreeditarve** never touches the payment or the GL.
Prefer it when:

- the invoice is in a **filed** VAT period (a credit note is then the only correct route);
- the customer has already booked the invoice on their side;
- unwinding the payment looks messy — a foreign-currency payment, a partial payment, one
  payment settling several invoices, or a bank-statement-imported row.

The cost is that the credit note lands in the period you issue it, not the original's, and
the settlement has to be netted (`payments send-settlement`).

## Rules

- State **which** layer can't do the thing. "Merit can't change this" is wrong when you
  mean the API.
- Never guess whether a save will pass. Try it, or say you haven't verified it.
- Deleting a payment and deleting an invoice are both irreversible and both need the
  user's explicit go-ahead on that specific record.
