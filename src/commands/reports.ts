import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { parseBool, parseDateYmd, parsePositiveInt, readJsonBody, resolveBody } from "../utils/index.js";

export function setupReportsCommand(program: Command): void {
	const grp = program
		.command("reports")
		.description(
			"Read-only financial reports (Merit Aktiva): income statement, balance sheet, inventory, sales, purchase, customer debts, and customer payments. All endpoints are POST with a JSON query body even though they are read operations. Dates are YYYYMMDD strings.",
		);

	// QUERY: income statement. v1. EndDate + PerCount required, optional DepFilter.
	grp
		.command("income-statement")
		.description(
			"Statement of Profit or Loss (income statement). Endpoint: POST /api/v1/getprofitrep. Returns ErrorMsg + Data (ReportDataLine[]): each line has RowType (1-row description, 3-account turnover, 4-formula), Balance (totals from period enddate descending; null when RowType=1), and Details (ReportDetailLine[] with TypeId 3-revenue / 4-expenses). EndDate + PerCount required.",
		)
		.option("--end-date <date>", "Period end date (YYYY-MM-DD or YYYYMMDD)")
		.option("--per-count <n>", "Number of periods (months)")
		.option("--dep-filter <department>", "Department, if used")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: { endDate?: string; perCount?: string; depFilter?: string; data?: string; file?: string }) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							EndDate: parseDateYmd(opts.endDate, "--end-date"),
							PerCount: parsePositiveInt(opts.perCount, "--per-count"),
							DepFilter: opts.depFilter,
						},
						{ required: false },
					);
					const result = await client.call("getprofitrep", { version: "v1", body });
					outputSuccess(result);
				},
			),
		);

	// QUERY: balance sheet. v1. EndDate + PerCount required.
	grp
		.command("balance-sheet")
		.description(
			"Statement of Financial Position (balance sheet). Endpoint: POST /api/v1/getbalancerep. Returns ErrorMsg + Data (ReportDataLine[]): each line has RowType (1-row description, 2-balance of account, 4-formula), Balance (totals from period enddate descending; null when RowType=1), and Details (ReportDetailLine[] with TypeId 1-assets / 2-liabilities). EndDate + PerCount required.",
		)
		.option("--end-date <date>", "Balance date (YYYY-MM-DD or YYYYMMDD)")
		.option("--per-count <n>", "Number of periods (months)")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { endDate?: string; perCount?: string; data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(
					readJsonBody(opts),
					{
						EndDate: parseDateYmd(opts.endDate, "--end-date"),
						PerCount: parsePositiveInt(opts.perCount, "--per-count"),
					},
					{ required: false },
				);
				const result = await client.call("getbalancerep", { version: "v1", body });
				outputSuccess(result);
			}),
		);

	// QUERY: inventory report. v2. ArticleGroups is an array — pass via --data for that field.
	grp
		.command("inventory")
		.description(
			'Inventory report. Endpoint: POST /api/v2/getinventoryreport. Successful result is a bare array of article objects (ItemCode, EANCode, ItemName, LocName, Quantity, ReservedQuantity, UnitCode, Amount, Price). For ArticleGroups (array of group codes) pass --data, e.g. { ArticleGroups: [..], Location: Str, RepDate: "YYYYMMDD", ShowZero: bool, WithReservations: bool }.',
		)
		.option("--location <code>", "Stock code or name")
		.option("--rep-date <date>", "Report date (YYYY-MM-DD or YYYYMMDD)")
		.option("--show-zero", "Include zero-quantity articles")
		.option("--with-reservations", "Include reservations")
		.option("--data <json>", "Raw JSON request body (overrides flags); use this for ArticleGroups")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					location?: string;
					repDate?: string;
					showZero?: boolean;
					withReservations?: boolean;
					data?: string;
					file?: string;
				}) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							Location: opts.location,
							RepDate: parseDateYmd(opts.repDate, "--rep-date"),
							ShowZero: parseBool(opts.showZero, "--show-zero"),
							WithReservations: parseBool(opts.withReservations, "--with-reservations"),
						},
						{ required: false },
					);
					const result = await client.call("getinventoryreport", { version: "v2", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// QUERY: sales report. v2. Result row shape branches on ReportType. Array filters via --data.
	grp
		.command("sales")
		.description(
			"Sales report. Endpoint: POST /api/v2/getsalesrep. Result row shape branches on --report-type: 1/5/6-By Invoices (invoice rows), 2-By Customers (entity rows: CustomerName), 3-By Articles (article rows), 4-By Countries (fixed-asset rows). Consumers must branch on ReportType. Filter fields that take arrays (ItemGrFilter, ItemFilter, DepartFilter) should be passed via --data, e.g. { ReportType: 3, ItemFilter: [..] }.",
		)
		.option("--start-date <date>", "Period start (YYYY-MM-DD or YYYYMMDD)")
		.option("--end-date <date>", "Period end (YYYY-MM-DD or YYYYMMDD)")
		.option("--report-type <n>", "1-By Invoices, 2-By Customers, 3-By Articles, 4-By Countries, 5-By Countries general")
		.option("--user-filter <value>", "User filter")
		.option("--cust-grp-filter <value>", "Customer group filter")
		.option("--cust-filter <value>", "Customer filter")
		.option("--fix-asset-filter <value>", "Fixed asset filter")
		.option("--data <json>", "Raw JSON request body (overrides flags); use this for array filters")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					startDate?: string;
					endDate?: string;
					reportType?: string;
					userFilter?: string;
					custGrpFilter?: string;
					custFilter?: string;
					fixAssetFilter?: string;
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
							UserFilter: opts.userFilter,
							CustGrpFilter: opts.custGrpFilter,
							CustFilter: opts.custFilter,
							FixAssetFilter: opts.fixAssetFilter,
						},
						{ required: false },
					);
					const result = await client.call("getsalesrep", { version: "v2", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// QUERY: purchase report. v2. Result row shape branches on ReportType. Array filters via --data.
	grp
		.command("purchase")
		.description(
			"Purchase report. Endpoint: POST /api/v2/getpurchrep. Result row shape branches on --report-type: 1-By Invoices (invoice rows with VendorId/VendorName), 2-By Vendors (entity rows: VendorName), 3-By Articles (article rows), 4-By Fixed assets (fixed-asset rows). VendChoice: 1-Vendor and Reporting entry, 2-Vendor, 3-Reporting entry. Array filters (VendGrpFilter, VendFilter, ItemGrFilter, ItemFilter, DepartFilter, FixAssetFilter) should be passed via --data.",
		)
		.option("--start-date <date>", "Period start (YYYY-MM-DD or YYYYMMDD)")
		.option("--end-date <date>", "Period end (YYYY-MM-DD or YYYYMMDD)")
		.option("--report-type <n>", "1-By Invoices, 2-By Vendors, 3-By Articles, 4-By Fixed assets")
		.option("--vend-choice <n>", "1-Vendor and Reporting entry, 2-Vendor, 3-Reporting entry")
		.option("--by-entry-no", "Group by entry number")
		.option("--data <json>", "Raw JSON request body (overrides flags); use this for array filters")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					startDate?: string;
					endDate?: string;
					reportType?: string;
					vendChoice?: string;
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
							ByEntryNo: parseBool(opts.byEntryNo, "--by-entry-no"),
						},
						{ required: false },
					);
					const result = await client.call("getpurchrep", { version: "v2", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// QUERY: customer debts report. v1. Either CustName or CustId required (CustName "" = all customers).
	grp
		.command("customer-debts")
		.description(
			'Customer debts report. Endpoint: POST /api/v1/getcustdebtrep. Either --cust-name or --cust-id is required (CustName "" selects all customers). --debt-date defaults to the current date. Returns debt rows (PartnerName, PartnerId, DocType, DocDate, DocNo, RefNo, DueDate, TotalAmount, PaidAmount, UnPaidAmount, CurrencyCode, CurrencyRate). DocType codes: SO=offer, MA=invoice, SBx()=initial balance, PR/BA=from program.',
		)
		.option("--cust-name <name>", 'Customer name (max 150); "" selects all customers')
		.option("--cust-id <guid>", "Customer id (Guid)")
		.option("--overdue-days <n>", "Overdue threshold in days")
		.option("--debt-date <date>", "Debt date (YYYY-MM-DD or YYYYMMDD); defaults to current date")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					custName?: string;
					custId?: string;
					overdueDays?: string;
					debtDate?: string;
					data?: string;
					file?: string;
				}) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							CustName: opts.custName,
							CustId: opts.custId,
							OverDueDays: parsePositiveInt(opts.overdueDays, "--overdue-days"),
							DebtDate: parseDateYmd(opts.debtDate, "--debt-date"),
						},
						{ required: false },
					);
					const result = await client.call("getcustdebtrep", { version: "v1", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// QUERY: customer payment report. v2. Cursor pagination via `more-data` when HasMore is true.
	grp
		.command("customer-payments")
		.description(
			"Customer payment report. Endpoint: POST /api/v2/getcustpaymrep. Returns Data (payment rows: CustName, CustId, DocDate, DocNo, TotalAmount, DueDate, UnPaidAmount, OverDue), HasMore, and Id4More. Cursor pagination: when HasMore is true, pass Id4More to `reports more-data` and repeat until HasMore is false. Note: the currency flag maps to the doc field CurrncyCode (verbatim spelling).",
		)
		.option("--cust-name <name>", "Customer name (max 150)")
		.option("--cust-id <guid>", "Customer id (Guid)")
		.option("--period-start <date>", "Period start (YYYY-MM-DD or YYYYMMDD)")
		.option("--period-end <date>", "Period end (YYYY-MM-DD or YYYYMMDD)")
		.option("--currency-code <code>", "Currency code (max 4); maps to CurrncyCode")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					custName?: string;
					custId?: string;
					periodStart?: string;
					periodEnd?: string;
					currencyCode?: string;
					data?: string;
					file?: string;
				}) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							CustName: opts.custName,
							CustId: opts.custId,
							PeriodStart: parseDateYmd(opts.periodStart, "--period-start"),
							PeriodEnd: parseDateYmd(opts.periodEnd, "--period-end"),
							CurrncyCode: opts.currencyCode,
						},
						{ required: false },
					);
					const result = await client.call("getcustpaymrep", { version: "v2", body });
					outputSuccess(result);
				},
			),
		);

	// PAGINATION: continuation of customer-payments (altPath getmoredata). Distinct verb.
	grp
		.command("more-data <id4More>")
		.description(
			"Fetch the next page of a Customer payment report. Endpoint: POST /api/v2/getmoredata. Pass the Id4More token from the previous `customer-payments` (or `more-data`) response. Repeat while HasMore is true.",
		)
		.option("--data <json>", "Raw JSON request body (overrides the Id4More argument)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (id4More: string, opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), { Id4More: id4More }, { required: true });
				const result = await client.call("getmoredata", { version: "v2", body });
				outputSuccess(result);
			}),
		);
}
