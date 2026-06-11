import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { parseDateYmd, readJsonBody, resolveBody } from "../utils/index.js";

export function setupSalesPricesDiscountsCommand(program: Command): void {
	const grp = program
		.command("prices")
		.description(
			"Sales prices and discounts (Merit Aktiva): price lists, discount rules, and effective-price resolution",
		);

	// BODY-DRIVEN endpoint (v2): batch write of sales price-list lines.
	grp
		.command("send")
		.description(
			"Batch-write sales prices. Endpoint: POST /api/v2/sendprices. JSON body (--data/--file): { Prices: [{ TargetGroup: Int (0-campaign, 1-Customer, 2-Customer Group), TargetName: Str, ItemCode: Str, Price: Decimal, CurrencyCode: Str, DiscountAllowed: Bool (true/false), StartDate: Date, EndDate: Date }] }. Note: TargetGroup supports 0/campaign here, unlike send-discounts. Returns the literal string 'OK', not JSON.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("sendprices", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// BODY-DRIVEN endpoint (v2): batch write of discount rules.
	grp
		.command("send-discounts")
		.description(
			"Batch-write discount rules. Endpoint: POST /api/v2/senddiscounts. JSON body (--data/--file): { Discounts: [{ TargetGroup: Int (1-Customer, 2-Customer Group; NO 0/campaign value, unlike send), TargetName: Str, GroupType: Int (1-Item, 2-Item Group), GroupCode: Str, DiscountPrc: Decimal, StartDate: Date, EndDate: Date }] }. Returns the literal string 'OK', not JSON.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("senddiscounts", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// QUERY endpoint (v2): empty body returns the full sales-price list.
	grp
		.command("list")
		.description(
			"List the full sales-price list. Endpoint: POST /api/v2/getprices. Query payload is an empty JSON object { } (no filters). Returns rows: Id, ItemId, ItemName, ItemCode, TGroupType (Str here), TGroupId, TGroupName, CurrencyId, CurrencyCode, StartDate, EndDate, Price0, AllowDisc, UOMId, UOMName, UOMNamePlural. Unset Start/EndDate come back as 01.01.1901.",
		)
		.option("--data <json>", "Raw JSON request body (overrides the default empty payload)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: false });
				const result = await client.call("getprices", { version: "v2", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);

	// QUERY endpoint (v2): empty body returns the full discount list.
	grp
		.command("list-discounts")
		.description(
			"List the full discount list. Endpoint: POST /api/v2/getdiscounts. Query payload is an empty JSON object { } (no filters). Returns rows: Id, GroupType (Int), GroupId, GroupName, GroupCode (item axis), TGgroupType (Int; note doc spelling, lowercase second g), TGroupId, TGroupName (customer axis), StartDate, EndDate, Discount0 (percentage). Unset Start/EndDate come back as 01.01.1901.",
		)
		.option("--data <json>", "Raw JSON request body (overrides the default empty payload)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: false });
				const result = await client.call("getdiscounts", { version: "v2", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);

	// QUERY endpoint (v2): resolve the effective price for one item/customer/date.
	grp
		.command("get")
		.description(
			"Resolve the valid price (with discount) for one item/customer/date. Endpoint: POST /api/v2/getprice. --item-code and --date are required. Identify the customer one of three ways: --customer-id (Guid; takes precedence and suppresses name/reg-no), or --cust-name, or --cust-reg-no (one of name/reg-no is required when --customer-id is absent). --currency-code defaults to local currency if omitted. Returns { ItemCode, Price (Dec), DiscountPct (Dec) }.",
		)
		.option("--item-code <code>", "Item code to price (required)")
		.option("--date <date>", "Date the valid price is evaluated on (required; YYYY-MM-DD or YYYYMMDD)")
		.option("--customer-id <guid>", "Customer id (Guid; if set, --cust-name and --cust-reg-no are ignored)")
		.option("--cust-name <name>", "Customer name (one of name/reg-no required when --customer-id is absent)")
		.option(
			"--cust-reg-no <regno>",
			"Customer registration number (one of name/reg-no required when --customer-id is absent)",
		)
		.option("--currency-code <code>", "Currency code (defaults to local currency if omitted)")
		.option("--uom-name <name>", "Unit-of-measure name")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					itemCode?: string;
					date?: string;
					customerId?: string;
					custName?: string;
					custRegNo?: string;
					currencyCode?: string;
					uomName?: string;
					data?: string;
					file?: string;
				}) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							ItemCode: opts.itemCode,
							DocDate: parseDateYmd(opts.date, "--date"),
							CustomerId: opts.customerId,
							CustName: opts.custName,
							CustRegno: opts.custRegNo,
							CurrencyCode: opts.currencyCode,
							UOMName: opts.uomName,
						},
						{ required: true },
					);
					const result = await client.call("getprice", { version: "v2", body });
					outputSuccess(result);
				},
			),
		);
}
