import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import {
	parseDateYmd,
	parseDecimal,
	parseNonNegativeInt,
	parsePositiveInt,
	readJsonBody,
	requireYes,
	resolveBody,
} from "../utils/index.js";

export function setupPurchaseInvoicesCommand(program: Command): void {
	const grp = program.command("purchase-invoices").description("Purchase invoices resource group (Merit Aktiva)");

	// CREATE (posts to ledger): complex nested body. Primary input is --data/--file.
	grp
		.command("create")
		.description(
			"Create a purchase invoice that posts directly to the general ledger (no confirmation). Endpoint: POST /api/v1/sendpurchinvoice (use --v2 for dimensions/receiver support). JSON body (--data/--file): { Vendor: VendorObject { Id?: Guid, Name: Str (required when adding), RegNo, VatAccountable: lowercase true/false (required when adding), VatRegNo, CountryCode (required when adding), ... }, ExpenseClaim: bool (true = expense claim), DocDate: yyyymmdd, DueDate, TransactionDate (v2), BillNo, RefNo, BankAccount, CurrencyCode, CurrencyRate, DepartmentCode, ProjectCode (v1), Dimensions: [{ DimId: Int, DimValueId: Guid, DimCode }] (v2), InvoiceRow: [{ Item: { Code (required, must exist), Description, Type: 1=stock|2=service|3=item, UOMName, DefLocationCode }, Quantity, Price, TaxId: Guid (from gettaxes), GLAccountCode, DepartmentCode, ProjectCode, CostCenterCode, LocationCode }], TaxAmount: [{ TaxId: Guid, Amount }] (REQUIRED), RoundingAmount (adjusts TotalSum only, not TotalAmount), TotalAmount (amount WITHOUT VAT), Payment: { PaymentMethod, PaidAmount (with VAT or less), PaymDate: YYYYmmddHHii }, Hcomment, Fcomment, Attachment: { FileName, FileContent: valid Base64 PDF }, Receiver (v2), KsefNumber/PolDocType (Poland) }. Vendor VatAccountable must be lowercase true/false; codes (GL/department/project/cost-center/location/dimension) must already exist in the company database.",
		)
		.option(
			"--v2",
			"Use the v2 endpoint (adds TransactionDate, header Dimensions, Receiver, extended row account codes)",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { v2?: boolean; data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("sendpurchinvoice", { version: opts.v2 ? "v2" : "v1", body });
				outputSuccess(result);
			}),
		);

	// CREATE-PENDING (waiting bookkeeper approval): complex nested body.
	grp
		.command("create-pending")
		.description(
			"Create a purchase invoice / expense claim that waits for bookkeeper approval (does NOT post GL records). Endpoint: POST /api/v1/sendpurchorder (use --v2 for header/row Dimensions and Receiver support). JSON body (--data/--file): same shape as create — { Vendor: VendorObject, ExpenseClaim: bool (true = expense document), DocDate, DueDate, BillNo, RefNo, BankAccount, CurrencyCode, CurrencyRate (v1), DepartmentCode, ProjectCode (v1), Dimensions (v2 header), InvoiceRow: [{ Item, Quantity, Price, TaxId (required), GLAccountCode, Dimensions (v2 row), ... }], TaxAmount: [{ TaxId, Amount }] (REQUIRED), RoundingAmount, TotalAmount (without VAT), Payment, Hcomment, Fcomment, Attachment: { FileName, FileContent: valid Base64 PDF }, Receiver (v2), PolDocType (Poland) }. Attachment PDFs are validated server-side; broken Base64 is a common failure. To post straight to the ledger instead use create (sendpurchinvoice).",
		)
		.option("--v2", "Use the v2 endpoint (adds header and row Dimensions, plus Receiver)")
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { v2?: boolean; data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("sendpurchorder", { version: opts.v2 ? "v2" : "v1", body });
				outputSuccess(result);
			}),
		);

	// CREATE-PENDING-XML: raw Estonian e-invoice XML string as the body (not JSON).
	grp
		.command("create-pending-xml")
		.description(
			"Create a purchase invoice waiting for approval from a raw Estonian e-invoice XML string (standard 1.2). Endpoint: POST /api/v2/sendpurchorderxml (v2 only). The request body is the XML string itself, not a JSON object — pass it via --xml. The --data/--file escape hatch sends raw JSON instead.",
		)
		.option("--xml <string>", "Raw Estonian e-invoice XML string (standard 1.2) sent as the request body")
		.option("--data <json>", "Raw JSON request body (overrides --xml)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { xml?: string; data?: string; file?: string }) => {
				const client = await getClient();
				const jsonBody = readJsonBody(opts);
				const body = jsonBody !== undefined ? jsonBody : opts.xml;
				if (body === undefined) {
					throw new Error("Provide the e-invoice XML via --xml (or a raw body via --data/--file).");
				}
				const result = await client.call("sendpurchorderxml", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// LIST (posted purchase invoices): query scalars. v1 period max 3 months.
	grp
		.command("list")
		.description(
			"List posted purchase invoices (header rows). Endpoint: POST /api/v1/getpurchorders (plural — distinct from get/getpurchorder details and from list-pending/GetPOrders). v1 period span is capped at max 3 months. Dates are yyyymmdd.",
		)
		.option("--period-start <date>", "Period start (YYYY-MM-DD or YYYYMMDD), required")
		.option("--period-end <date>", "Period end (YYYY-MM-DD or YYYYMMDD), required; v1 span max 3 months")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { periodStart?: string; periodEnd?: string; data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(
					readJsonBody(opts),
					{
						PeriodStart: parseDateYmd(opts.periodStart, "--period-start"),
						PeriodEnd: parseDateYmd(opts.periodEnd, "--period-end"),
					},
					{ required: false },
				);
				const result = await client.call("getpurchorders", { version: "v1", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);

	// LIST alt path (v2): same path, v2 adds DateType and a richer result (Dimension1..7Code etc.).
	grp
		.command("find")
		.description(
			"List posted purchase invoices via the v2 endpoint. Endpoint: POST /api/v2/getpurchorders. Like list but adds --date-type and returns richer rows (Dimension1..7Code, FileExists, InboundTime, Operator, Paid, ChangedDate). Dates are yyyymmdd.",
		)
		.option("--period-start <date>", "Period start (YYYY-MM-DD or YYYYMMDD), required")
		.option("--period-end <date>", "Period end (YYYY-MM-DD or YYYYMMDD), required")
		.option("--date-type <int>", "0 = DocumentDate, 1 = ChangedDate")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: { periodStart?: string; periodEnd?: string; dateType?: string; data?: string; file?: string }) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							PeriodStart: parseDateYmd(opts.periodStart, "--period-start"),
							PeriodEnd: parseDateYmd(opts.periodEnd, "--period-end"),
							DateType: parseNonNegativeInt(opts.dateType, "--date-type"),
						},
						{ required: false },
					);
					const result = await client.call("getpurchorders", { version: "v2", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// LIST-PENDING (purchase orders awaiting approval): query scalars. v2 only.
	grp
		.command("list-pending")
		.description(
			"List purchase orders / documents awaiting approval (the create-pending / expense-claim flow). Endpoint: POST /api/v2/GetPOrders (v2 only; distinct from list/getpurchorders posted invoices). Dates are yyyymmdd.",
		)
		.option("--period-start <date>", "Period start (YYYY-MM-DD or YYYYMMDD)")
		.option("--period-end <date>", "Period end (YYYY-MM-DD or YYYYMMDD)")
		.option("--date-filter <int>", "0 = off, 1 = document date, 2 = created date")
		.option("--status-filter <int>", "0 = off")
		.option("--with-attachments", "Include attachment objects in the result")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					periodStart?: string;
					periodEnd?: string;
					dateFilter?: string;
					statusFilter?: string;
					withAttachments?: boolean;
					data?: string;
					file?: string;
				}) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							PeriodStart: parseDateYmd(opts.periodStart, "--period-start"),
							PeriodEnd: parseDateYmd(opts.periodEnd, "--period-end"),
							DateFilter: parseNonNegativeInt(opts.dateFilter, "--date-filter"),
							StatusFilter: parseNonNegativeInt(opts.statusFilter, "--status-filter"),
							WithAttachments: opts.withAttachments ? true : undefined,
						},
						{ required: false },
					);
					const result = await client.call("GetPOrders", { version: "v2", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// GET details by id: positional id + SkipAttachment scalar.
	grp
		.command("get <id>")
		.description(
			"Get full purchase invoice details (Header, Lines, Payments) by id (PIHId). Endpoint: POST /api/v1/getpurchorder (singular — the details fetch; the list is getpurchorders). Use --v2 to also return the Base64 Attachment and dimension data; --skip-attachment omits the file.",
		)
		.option("--v2", "Use the v2 endpoint (returns header Dimensions, row DimAllocation and the Base64 Attachment)")
		.option("--skip-attachment", "Skip returning the Base64 attachment file")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (id: string, opts: { v2?: boolean; skipAttachment?: boolean; data?: string; file?: string }) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							Id: id,
							SkipAttachment: opts.skipAttachment ? true : undefined,
						},
						{ required: false, mergeFlags: true },
					);
					const result = await client.call("getpurchorder", { version: opts.v2 ? "v2" : "v1", body });
					outputSuccess(result);
				},
			),
		);

	// DELETE: destructive, guard with requireYes.
	grp
		.command("delete <id>")
		.description(
			"Delete a purchase invoice by id (PIHId). Endpoint: POST /api/v1/deletepurchinvoice (v1 only). No response body.",
		)
		.option("--yes", "Confirm the deletion")
		.action(
			handleAsyncCommand(async (id: string, opts: { yes?: boolean }) => {
				requireYes(opts, `delete purchase invoice ${id}`);
				const client = await getClient();
				const result = await client.call("deletepurchinvoice", { version: "v1", body: { Id: id } });
				outputSuccess(result ?? { deleted: id });
			}),
		);

	// PAY: payment scalars. Use --v2 for non-local-currency payments.
	grp
		.command("pay")
		.description(
			"Create a payment of a purchase invoice. Endpoint: POST /api/v1/sendPaymentV. Use --v2 when the payment is NOT in local currency (v2 adds CurrencyCode and CurrencyRate; if CurrencyRate is omitted Merit uses the EU central bank rate for the date). The --payment-date flag takes YYYY-MM-DD or YYYYMMDD; pass minute precision (YYYYmmddHHii) via --data. Amount is decimal.",
		)
		.option("--v2", "Use the v2 endpoint (required for non-local-currency payments)")
		.option("--bank-id <guid>", "Bank id (Guid)")
		.option("--iban <iban>", "IBAN")
		.option("--vendor-name <name>", "Vendor name")
		.option("--payment-date <date>", "Payment date (YYYY-MM-DD or YYYYMMDD; minute precision via --data)")
		.option("--bill-no <no>", "Bill number")
		.option("--ref-no <no>", "Reference number")
		.option("--amount <decimal>", "Payment amount")
		.option("--currency-code <code>", "Currency code (v2 only; required if not local currency)")
		.option("--currency-rate <decimal>", "Currency rate (v2 only; omit to use the EU central bank rate)")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					v2?: boolean;
					bankId?: string;
					iban?: string;
					vendorName?: string;
					paymentDate?: string;
					billNo?: string;
					refNo?: string;
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
							PaymentDate: parseDateYmd(opts.paymentDate, "--payment-date"),
							BillNo: opts.billNo,
							RefNo: opts.refNo,
							Amount: parseDecimal(opts.amount, "--amount"),
							CurrencyCode: opts.currencyCode,
							CurrencyRate: parseDecimal(opts.currencyRate, "--currency-rate"),
						},
						{ required: false },
					);
					const result = await client.call("sendPaymentV", { version: opts.v2 ? "v2" : "v1", body });
					outputSuccess(result);
				},
			),
		);

	// REPORT: purchase report query scalars. v2 only. Shape varies by ReportType.
	grp
		.command("report")
		.description(
			"Run the purchase report. Endpoint: POST /api/v2/getpurchrep (v2 only). --report-type selects the result shape: 1 = By Invoices, 2 = By Vendors, 3 = By Articles, 4 = By Fixed assets. --vend-choice: 1 = Vendor and Reporting entry, 2 = Vendor, 3 = Reporting entry. Filter flags (--item-filter, --depart-filter, --fix-asset-filter) take comma-separated arrays. Dates are yyyymmdd.",
		)
		.option("--start-date <date>", "Report start date (YYYY-MM-DD or YYYYMMDD)")
		.option("--end-date <date>", "Report end date (YYYY-MM-DD or YYYYMMDD)")
		.option("--report-type <int>", "1 = By Invoices, 2 = By Vendors, 3 = By Articles, 4 = By Fixed assets")
		.option("--vend-choice <int>", "1 = Vendor and Reporting entry, 2 = Vendor, 3 = Reporting entry")
		.option("--vend-grp-filter <value>", "Vendor group filter")
		.option("--vend-filter <value>", "Vendor filter")
		.option("--item-gr-filter <value>", "Item group filter")
		.option("--item-filter <value>", "Item filter (array of items)")
		.option("--depart-filter <value>", "Department filter (array of departments)")
		.option("--fix-asset-filter <value>", "Fixed asset filter (array of fixed assets)")
		.option("--by-entry-no", "Group by entry number")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					startDate?: string;
					endDate?: string;
					reportType?: string;
					vendChoice?: string;
					vendGrpFilter?: string;
					vendFilter?: string;
					itemGrFilter?: string;
					itemFilter?: string;
					departFilter?: string;
					fixAssetFilter?: string;
					byEntryNo?: boolean;
					data?: string;
					file?: string;
				}) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							StartDate: parseDateYmd(opts.startDate, "--start-date"),
							EndDate: parseDateYmd(opts.endDate, "--end-date"),
							ReportType: parsePositiveInt(opts.reportType, "--report-type"),
							VendChoice: parsePositiveInt(opts.vendChoice, "--vend-choice"),
							VendGrpFilter: opts.vendGrpFilter,
							VendFilter: opts.vendFilter,
							ItemGrFilter: opts.itemGrFilter,
							ItemFilter: opts.itemFilter,
							DepartFilter: opts.departFilter,
							FixAssetFilter: opts.fixAssetFilter,
							ByEntryNo: opts.byEntryNo ? true : undefined,
						},
						{ required: false },
					);
					const result = await client.call("getpurchrep", { version: "v2", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);
}
