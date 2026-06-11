import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { ValidationError } from "../utils/errors.js";
import {
	parseBool,
	parseDateYmd,
	parseDecimal,
	parseNonNegativeInt,
	parsePositiveInt,
	readJsonBody,
	readRawBody,
	requireYes,
	resolveBody,
} from "../utils/index.js";

/**
 * Build a query string from defined filter params and append it to a bare apiPath.
 * Used by the GET-style endpoints (PaymentImports, IncomePayments/ExpensePayments list)
 * whose filters travel in the URL. The client appends its own auth params
 * (apiId/timestamp/signature) after a "?", so these filters are joined with "&".
 */
function appendQuery(apiPath: string, params: Record<string, string | undefined>): string {
	const parts: string[] = [];
	for (const [k, v] of Object.entries(params)) {
		if (v !== undefined) parts.push(`${k}=${encodeURIComponent(v)}`);
	}
	return parts.length === 0 ? apiPath : `${apiPath}?${parts.join("&")}`;
}

export function setupPaymentsCommand(program: Command): void {
	const grp = program.command("payments").description("Payments resource group (Merit Aktiva)");

	// List of Payments — POST /api/v2/getpayments (v1 via `find`). Period max 3 months.
	grp
		.command("list")
		.description(
			"List payments. Endpoint: POST /api/v2/getpayments. Period span max 3 months. Dates yyyymmdd. v2 adds DocId, PaymAPIDetails, ChangedDate; use `find` for the legacy v1 shape.",
		)
		.option("--period-start <date>", "Period start (YYYY-MM-DD or YYYYMMDD), required")
		.option("--period-end <date>", "Period end (YYYY-MM-DD or YYYYMMDD), required, max 3 months from start")
		.option("--payment-type <n>", "Payment type filter (int)")
		.option("--bank-id <guid>", "Bank / payment-method id")
		.option("--date-type <n>", "0 = document date, 1 = changed date")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					periodStart?: string;
					periodEnd?: string;
					paymentType?: string;
					bankId?: string;
					dateType?: string;
					data?: string;
					file?: string;
				}) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							PeriodStart: parseDateYmd(opts.periodStart, "--period-start"),
							PeriodEnd: parseDateYmd(opts.periodEnd, "--period-end"),
							PaymentType: parsePositiveInt(opts.paymentType, "--payment-type"),
							BankId: opts.bankId,
							DateType: parseNonNegativeInt(opts.dateType, "--date-type"),
						},
						{ required: false },
					);
					const result = await client.call("getpayments", { version: "v2", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// Alt path: v1 getpayments (legacy shape, no DocId/PaymAPIDetails/ChangedDate).
	grp
		.command("find")
		.description(
			"List payments via the legacy v1 shape. Endpoint: POST /api/v1/getpayments. Same filters as `list` but the response omits DocId, PaymAPIDetails and ChangedDate. Period span max 3 months.",
		)
		.option("--period-start <date>", "Period start (YYYY-MM-DD or YYYYMMDD), required")
		.option("--period-end <date>", "Period end (YYYY-MM-DD or YYYYMMDD), required, max 3 months from start")
		.option("--payment-type <n>", "Payment type filter (int)")
		.option("--bank-id <guid>", "Bank / payment-method id")
		.option("--date-type <n>", "0 = document date, 1 = changed date")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					periodStart?: string;
					periodEnd?: string;
					paymentType?: string;
					bankId?: string;
					dateType?: string;
					data?: string;
					file?: string;
				}) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							PeriodStart: parseDateYmd(opts.periodStart, "--period-start"),
							PeriodEnd: parseDateYmd(opts.periodEnd, "--period-end"),
							PaymentType: parsePositiveInt(opts.paymentType, "--payment-type"),
							BankId: opts.bankId,
							DateType: parseNonNegativeInt(opts.dateType, "--date-type"),
						},
						{ required: false },
					);
					const result = await client.call("getpayments", { version: "v1", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// List of Payment Types — POST /api/v2/getpaymenttypes. Returned Id is the BankId used elsewhere.
	grp
		.command("list-types")
		.description(
			"List payment types. Endpoint: POST /api/v2/getpaymenttypes. The returned Id is the BankId used by create/send/list endpoints. --type: 1 = purchases, 2 = expense reports, 3 = sales.",
		)
		.option("--type <n>", "Filter by type: 1 = purchases, 2 = expense reports, 3 = sales")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { type?: string; data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(
					readJsonBody(opts),
					{ Type: parsePositiveInt(opts.type, "--type") },
					{ required: false },
				);
				const result = await client.call("getpaymenttypes", { version: "v2", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);

	// Create Payment of sales invoice — POST /api/v2/sendpayment. Small scalar body → typed flags.
	grp
		.command("create")
		.description(
			"Register a payment against a sales invoice. Endpoint: POST /api/v2/sendpayment. Use v2 when the payment is not in local currency (CurrencyCode/CurrencyRate); omit CurrencyRate to use the ECB rate for the date. Subsequent payments are cash or bank — for bank an IBAN matching a stored payment method is required; without an IBAN the payment lands in the cash register. A sales-invoice payment may be sent in several parts.",
		)
		.option("--bank-id <guid>", "Bank / payment-method id")
		.option("--iban <iban>", "IBAN (must match a stored payment method)")
		.option("--customer-name <name>", "Customer name")
		.option("--invoice-no <no>", "Sales invoice number")
		.option("--ref-no <ref>", "Reference number")
		.option("--payment-date <date>", "Payment date (YYYY-MM-DD or YYYYMMDD)")
		.option("--amount <decimal>", "Payment amount")
		.option("--currency-code <code>", "Currency code (v2 only; required if not local currency)")
		.option("--currency-rate <decimal>", "Currency rate (v2 only; omit to use the ECB rate for the date)")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					bankId?: string;
					iban?: string;
					customerName?: string;
					invoiceNo?: string;
					refNo?: string;
					paymentDate?: string;
					amount?: string;
					currencyCode?: string;
					currencyRate?: string;
					data?: string;
					file?: string;
				}) => {
					// Merit matches the payment to the invoice by customer name; --invoice-no
					// alone fails cryptically ("Puudub klient nimega ." = "No customer named .").
					if (!opts.data && !opts.file && opts.invoiceNo && !opts.customerName) {
						throw new ValidationError(
							"`--customer-name` is required to match the sales invoice.",
							"Merit looks up the invoice by customer; pass --customer-name with --invoice-no (or supply a full body via --data/--file).",
						);
					}
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							BankId: opts.bankId,
							IBAN: opts.iban,
							CustomerName: opts.customerName,
							InvoiceNo: opts.invoiceNo,
							RefNo: opts.refNo,
							PaymentDate: parseDateYmd(opts.paymentDate, "--payment-date"),
							Amount: parseDecimal(opts.amount, "--amount"),
							CurrencyCode: opts.currencyCode,
							CurrencyRate: parseDecimal(opts.currencyRate, "--currency-rate"),
						},
						{ required: true },
					);
					const result = await client.call("sendpayment", { version: "v2", body });
					outputSuccess(result ?? { ok: true });
				},
			),
		);

	// Create Payment of purchase invoice — POST /api/v2/sendPaymentV.
	grp
		.command("create-purchase")
		.description(
			"Register a payment against a purchase invoice (vendor bill). Endpoint: POST /api/v2/sendPaymentV. The --payment-date flag takes YYYY-MM-DD or YYYYMMDD; pass minute precision (YYYYmmddHHii) via --data. Use v2 when not in local currency (CurrencyCode required; omit CurrencyRate for the ECB rate).",
		)
		.option("--bank-id <guid>", "Bank / payment-method id")
		.option("--iban <iban>", "IBAN")
		.option("--vendor-name <name>", "Vendor name")
		.option("--bill-no <no>", "Purchase invoice / bill number")
		.option("--ref-no <ref>", "Reference number")
		.option("--payment-date <date>", "Payment date (YYYY-MM-DD or YYYYMMDD)")
		.option("--amount <decimal>", "Payment amount")
		.option("--currency-code <code>", "Currency code (v2 only; required if not local currency)")
		.option("--currency-rate <decimal>", "Currency rate (v2 only; omit to use the ECB rate for the date)")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					bankId?: string;
					iban?: string;
					vendorName?: string;
					billNo?: string;
					refNo?: string;
					paymentDate?: string;
					amount?: string;
					currencyCode?: string;
					currencyRate?: string;
					data?: string;
					file?: string;
				}) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							BankId: opts.bankId,
							IBAN: opts.iban,
							VendorName: opts.vendorName,
							BillNo: opts.billNo,
							RefNo: opts.refNo,
							PaymentDate: parseDateYmd(opts.paymentDate, "--payment-date"),
							Amount: parseDecimal(opts.amount, "--amount"),
							CurrencyCode: opts.currencyCode,
							CurrencyRate: parseDecimal(opts.currencyRate, "--currency-rate"),
						},
						{ required: true },
					);
					const result = await client.call("sendPaymentV", { version: "v2", body });
					outputSuccess(result ?? { ok: true });
				},
			),
		);

	// Create Payment of sales offer — POST /api/v2/sendPaymentO.
	grp
		.command("create-offer")
		.description(
			"Register a (pre)payment against a sales offer. Endpoint: POST /api/v2/sendPaymentO. The --payment-date flag takes YYYY-MM-DD or YYYYMMDD; pass minute precision (YYYYmmddHHii) via --data. Use v2 when not in local currency (CurrencyCode required; omit CurrencyRate for the ECB rate).",
		)
		.option("--bank-id <guid>", "Bank / payment-method id")
		.option("--iban <iban>", "IBAN")
		.option("--customer-name <name>", "Customer name")
		.option("--offer-no <no>", "Sales offer number")
		.option("--ref-no <ref>", "Reference number")
		.option("--payment-date <date>", "Payment date (YYYY-MM-DD or YYYYMMDD)")
		.option("--amount <decimal>", "Payment amount")
		.option("--currency-code <code>", "Currency code (v2 only; required if not local currency)")
		.option("--currency-rate <decimal>", "Currency rate (v2 only; omit to use the ECB rate for the date)")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					bankId?: string;
					iban?: string;
					customerName?: string;
					offerNo?: string;
					refNo?: string;
					paymentDate?: string;
					amount?: string;
					currencyCode?: string;
					currencyRate?: string;
					data?: string;
					file?: string;
				}) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							BankId: opts.bankId,
							IBAN: opts.iban,
							CustomerName: opts.customerName,
							OfferNo: opts.offerNo,
							RefNo: opts.refNo,
							PaymentDate: parseDateYmd(opts.paymentDate, "--payment-date"),
							Amount: parseDecimal(opts.amount, "--amount"),
							CurrencyCode: opts.currencyCode,
							CurrencyRate: parseDecimal(opts.currencyRate, "--currency-rate"),
						},
						{ required: true },
					);
					const result = await client.call("sendPaymentO", { version: "v2", body });
					outputSuccess(result ?? { ok: true });
				},
			),
		);

	// Delete Payment — POST /api/v1/deletepayment. Destructive: guarded by --yes.
	grp
		.command("delete <id>")
		.description(
			"Delete a payment by id. Endpoint: POST /api/v1/deletepayment. High-risk: the Payments overview warns deletion is unsupported because a payment has complex GL relations with its invoices. Use with caution.",
		)
		.option("--yes", "Confirm the deletion")
		.action(
			handleAsyncCommand(async (id: string, opts: { yes?: boolean }) => {
				requireYes(opts, `delete payment ${id}`);
				const client = await getClient();
				const result = await client.call("deletepayment", { version: "v1", body: { Id: id } });
				outputSuccess(result ?? { deleted: id });
			}),
		);

	// List of IncomePayments — GET /api/v2/Banks/{bankId}/IncomePayments. Filters in the query string.
	grp
		.command("list-income <bankId>")
		.description(
			"List income payments for a bank. Endpoint: GET /api/v2/Banks/{bankId}/IncomePayments. Dates yyyy-MM-dd. Supply --doc-date-from (or --created-from); window max 3 months. Each row has a Lines array (DocumentId/DocumentNumber/DocumentAmount/PaidAmount).",
		)
		.option(
			"--doc-date-from <date>",
			"Document date from (YYYY-MM-DD or YYYYMMDD); required unless --created-from is set",
		)
		.option("--doc-date-to <date>", "Document date to (YYYY-MM-DD or YYYYMMDD); max 3 months from start")
		.option("--created-from <date>", "Created-on from (YYYY-MM-DD or YYYYMMDD); required if --doc-date-from is omitted")
		.option("--created-to <date>", "Created-on to (YYYY-MM-DD or YYYYMMDD); max 3 months from start")
		.action(
			handleAsyncCommand(
				async (
					bankId: string,
					opts: { docDateFrom?: string; docDateTo?: string; createdFrom?: string; createdTo?: string },
				) => {
					assertWindowWithin3Months(opts.docDateFrom, opts.docDateTo, "--doc-date-from", "--doc-date-to");
					assertWindowWithin3Months(opts.createdFrom, opts.createdTo, "--created-from", "--created-to");
					const client = await getClient();
					const path = appendQuery(`Banks/${encodeURIComponent(bankId)}/IncomePayments`, {
						docDateFrom: toYmdDash(opts.docDateFrom, "--doc-date-from"),
						docDateTo: toYmdDash(opts.docDateTo, "--doc-date-to"),
						createdFrom: toYmdDash(opts.createdFrom, "--created-from"),
						createdTo: toYmdDash(opts.createdTo, "--created-to"),
					});
					const result = await client.call(path, { version: "v2", method: "GET" });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// List of ExpensePayments — GET /api/v2/Banks/{bankId}/ExpensePayments (same path is POST for send-expense).
	grp
		.command("list-expense <bankId>")
		.description(
			"List expense payments for a bank. Endpoint: GET /api/v2/Banks/{bankId}/ExpensePayments (same path is POST for send-expense — distinguished by method). Dates yyyy-MM-dd. Supply --doc-date-from (or --created-from); window max 3 months.",
		)
		.option(
			"--doc-date-from <date>",
			"Document date from (YYYY-MM-DD or YYYYMMDD); required unless --created-from is set",
		)
		.option("--doc-date-to <date>", "Document date to (YYYY-MM-DD or YYYYMMDD); max 3 months from start")
		.option("--created-from <date>", "Created-on from (YYYY-MM-DD or YYYYMMDD); required if --doc-date-from is omitted")
		.option("--created-to <date>", "Created-on to (YYYY-MM-DD or YYYYMMDD); max 3 months from start")
		.action(
			handleAsyncCommand(
				async (
					bankId: string,
					opts: { docDateFrom?: string; docDateTo?: string; createdFrom?: string; createdTo?: string },
				) => {
					assertWindowWithin3Months(opts.docDateFrom, opts.docDateTo, "--doc-date-from", "--doc-date-to");
					assertWindowWithin3Months(opts.createdFrom, opts.createdTo, "--created-from", "--created-to");
					const client = await getClient();
					const path = appendQuery(`Banks/${encodeURIComponent(bankId)}/ExpensePayments`, {
						docDateFrom: toYmdDash(opts.docDateFrom, "--doc-date-from"),
						docDateTo: toYmdDash(opts.docDateTo, "--doc-date-to"),
						createdFrom: toYmdDash(opts.createdFrom, "--created-from"),
						createdTo: toYmdDash(opts.createdTo, "--created-to"),
					});
					const result = await client.call(path, { version: "v2", method: "GET" });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// Send IncomePayments — POST /api/v2/Banks/{bankId}/IncomePayments. Nested Lines body → --data/--file.
	grp
		.command("send-income <bankId>")
		.description(
			"Create income payment(s) under a bank. Endpoint: POST /api/v2/Banks/{bankId}/IncomePayments. JSON body (--data/--file): { DocumentDate: Date (yyyy-MM-dd), CurrencyCode: Str, DocumentNumber: Str, Description: Str, Lines: [{ AccountCode: Str, Quantity: Decimal, Price: Decimal, Amount: Decimal, Description: Str, DeclarationDate: Date, TaxId: Guid, Dimensions: [{ Dimension: Int, ValueCode: Guid }] }] }. Returns SendBatchResult { BatchInfo, BatchId }. Income lines omit DepartmentCode; Dimensions[].ValueCode is a Guid here.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (bankId: string, opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call(`Banks/${encodeURIComponent(bankId)}/IncomePayments`, { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// Send ExpensePayments — POST /api/v2/Banks/{bankId}/ExpensePayments. Nested Lines body → --data/--file.
	grp
		.command("send-expense <bankId>")
		.description(
			"Create expense payment(s) under a bank. Endpoint: POST /api/v2/Banks/{bankId}/ExpensePayments. JSON body (--data/--file): { DocumentDate: Date (yyyy-MM-dd), CurrencyCode: Str, DocumentNumber: Str, Description: Str, Lines: [{ AccountCode: Str, Quantity: Decimal, Price: Decimal, Amount: Decimal, Description: Str, DepartmentCode: Str, DeclarationDate: Date (yyyy-MM-dd), TaxId: Guid, Dimensions: [{ Dimension: Int, ValueCode: Str }] }] }. Returns SendBatchResult { BatchInfo, BatchId }. Expense lines include DepartmentCode; Dimensions[].ValueCode is a String here.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (bankId: string, opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call(`Banks/${encodeURIComponent(bankId)}/ExpensePayments`, {
					version: "v2",
					body,
				});
				outputSuccess(result);
			}),
		);

	// Send PrePayments — POST /api/v2/Banks/{bankId}/PrePayments/ForCustomer/{customerId} (vendor variant via `send-prepayment-vendor`).
	grp
		.command("send-prepayment <bankId> <customerId>")
		.description(
			"Record a customer prepayment under a bank. Endpoint: POST /api/v2/Banks/{bankId}/PrePayments/ForCustomer/{customerId}. JSON body (--data/--file): { Description: Str, DocumentNumber: Str, CurrencyCode: Str, DocumentDate: Date (yyyy-MM-dd), Amount: Decimal }. Returns SendBatchResult { BatchInfo, BatchId }. For a vendor prepayment use `send-prepayment-vendor`.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (bankId: string, customerId: string, opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call(
					`Banks/${encodeURIComponent(bankId)}/PrePayments/ForCustomer/${encodeURIComponent(customerId)}`,
					{ version: "v2", body },
				);
				outputSuccess(result);
			}),
		);

	// Alt path: vendor prepayment — POST /api/v2/Banks/{bankId}/PrePayments/ForVendor/{vendorId}.
	grp
		.command("send-prepayment-vendor <bankId> <vendorId>")
		.description(
			"Record a vendor prepayment under a bank. Endpoint: POST /api/v2/Banks/{bankId}/PrePayments/ForVendor/{vendorId}. JSON body (--data/--file): { Description: Str, DocumentNumber: Str, CurrencyCode: Str, DocumentDate: Date (yyyy-MM-dd), Amount: Decimal }. Returns SendBatchResult { BatchInfo, BatchId }. For a customer prepayment use `send-prepayment`.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (bankId: string, vendorId: string, opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call(
					`Banks/${encodeURIComponent(bankId)}/PrePayments/ForVendor/${encodeURIComponent(vendorId)}`,
					{ version: "v2", body },
				);
				outputSuccess(result);
			}),
		);

	// Send Settlement — POST /api/v2/sendsettlement. Nets customer vs vendor docs → --data/--file.
	grp
		.command("send-settlement")
		.description(
			"Net customer documents against vendor documents. Endpoint: POST /api/v2/sendsettlement. JSON body (--data/--file): { DocDate: DateTime (e.g. 20240201), CurrencyCode: Str (empty = local currency), CustLines: [{ CustVendName: Str, CustVendId: Guid, CustVendRegNo: Str, DocNo: Str, Amount: Decimal }], VendLines: [ ...same shape ] }. Amount sign: SalesInvoice +, PurchaseInvoice +, CreditInvoice -, Prepayment -. The total of all CustLines + VendLines amounts must equal zero. Returns { DocumentId, DocumentNo }.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("sendsettlement", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// Bank statement import — POST /api/v2/sendcamt53. Raw camt.053 XML body, NOT JSON.
	grp
		.command("import-statement")
		.description(
			"Import a bank statement from a camt.053 XML file. Endpoint: POST /api/v2/sendcamt53. The body is RAW camt.053 XML (NOT JSON); supply it via --file <path.xml> or --data '<xml>'. Supported formats: camt.053.001.02 and camt.053.001.10. Success message is Estonian: 'Imporditi X makserida (ridu kokku X ).'.",
		)
		.option("--data <xml>", "Raw camt.053 XML body")
		.option("--file <path>", "Path to a camt.053 XML file")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const xml = readRawBody(opts, "camt.053 XML");
				const client = await getClient();
				const result = await client.call("sendcamt53", { version: "v2", body: xml });
				outputSuccess(result ?? { ok: true });
			}),
		);

	// Get Payment Imports — GET /api/v2/PaymentImports. Filters in the query string.
	grp
		.command("list-imports <bankId>")
		.description(
			"List imported bank-statement payment rows for a bank. Endpoint: GET /api/v2/PaymentImports. Dates yyyy-MM-dd. --booking-date-from is required; --booking-date-to defaults to today; window max 3 months. --with-lines toggles line detail.",
		)
		.option("--booking-date-from <date>", "Booking date from (YYYY-MM-DD or YYYYMMDD), required")
		.option(
			"--booking-date-to <date>",
			"Booking date to (YYYY-MM-DD or YYYYMMDD); defaults to today, max 3 months from start",
		)
		.option("--with-lines [bool]", "Include line detail (true/false)")
		.action(
			handleAsyncCommand(
				async (
					bankId: string,
					opts: { bookingDateFrom?: string; bookingDateTo?: string; withLines?: string | boolean },
				) => {
					assertWindowWithin3Months(
						opts.bookingDateFrom,
						opts.bookingDateTo,
						"--booking-date-from",
						"--booking-date-to",
					);
					const client = await getClient();
					const withLines = parseBool(opts.withLines, "--with-lines");
					const path = appendQuery("PaymentImports", {
						bankId,
						bookingDateFrom: toYmdDash(opts.bookingDateFrom, "--booking-date-from"),
						bookingDateTo: toYmdDash(opts.bookingDateTo, "--booking-date-to"),
						withLines: withLines === undefined ? undefined : String(withLines),
					});
					const result = await client.call(path, { version: "v2", method: "GET" });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);
}

/**
 * Validate a date flag and return it in Merit's query-string format `yyyy-MM-dd`
 * (the GET list endpoints use dashed dates, unlike the body endpoints which use
 * compact `yyyymmdd`). Accepts `YYYY-MM-DD` or `YYYYMMDD`; returns undefined when unset.
 */
function toYmdDash(value: string | undefined, flagName: string): string | undefined {
	const compact = parseDateYmd(value, flagName);
	if (compact === undefined) return undefined;
	return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

/** Parse a `YYYYMMDD` string (the wire format from parseDateYmd) into a UTC Date. */
function ymdToUtc(compact: string): Date {
	return new Date(Date.UTC(Number(compact.slice(0, 4)), Number(compact.slice(4, 6)) - 1, Number(compact.slice(6, 8))));
}

/**
 * Client-side guard for the GET list endpoints (PaymentImports, Income/ExpensePayments):
 * Merit caps the query window at ~3 months and returns a raw 400 when exceeded. When both
 * a `from` and `to` flag are set, fail early with a clear message instead. Dates are accepted
 * in either `YYYY-MM-DD` or `YYYYMMDD` form via parseDateYmd; only validates when both ends
 * are present (an open-ended `to` is left to the server).
 */
function assertWindowWithin3Months(
	from: string | undefined,
	to: string | undefined,
	fromFlag: string,
	toFlag: string,
): void {
	const fromYmd = parseDateYmd(from, fromFlag);
	const toYmd = parseDateYmd(to, toFlag);
	if (fromYmd === undefined || toYmd === undefined) return;
	const fromDate = ymdToUtc(fromYmd);
	const maxTo = new Date(fromDate);
	maxTo.setUTCMonth(maxTo.getUTCMonth() + 3);
	if (ymdToUtc(toYmd).getTime() > maxTo.getTime()) {
		throw new ValidationError(
			`Date window ${fromFlag} → ${toFlag} exceeds 3 months. Merit caps this window at 3 months — query in ≤3-month chunks.`,
			"Narrow the range, or split the query into ≤3-month windows.",
		);
	}
}
