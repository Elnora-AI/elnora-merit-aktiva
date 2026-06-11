import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { parseDateYmd, readJsonBody, resolveBody } from "../utils/index.js";

export function setupCustomersCommand(program: Command): void {
	const grp = program
		.command("customers")
		.description("Customers resource group (Merit Aktiva): customers and customer groups");

	// QUERY endpoint (v1). KNOWN LIMITATION: an unfiltered query returns a server stacktrace because the
	// JSON is too large to compile — always filter by Id/RegNo/VatRegNo/Name. If Id is supplied the other
	// filters are ignored. ChangedDate uses YYYYmmDD.
	grp
		.command("list")
		.description(
			"List/find customers. Endpoint: POST /api/v1/getcustomers. ALWAYS filter (Id/RegNo/VatRegNo/Name) — an unfiltered query returns a server stacktrace. Id wins; RegNo/VatRegNo are exact match, Name is broad match. Response may be empty, a single Customer, or an array.",
		)
		.option("--id <guid>", "Customer id (if set, other filters are ignored)")
		.option("--reg-no <regno>", "Registration number (exact match)")
		.option("--vat-reg-no <vat>", "VAT registration number (exact match)")
		.option("--name <name>", "Name (broad match)")
		.option("--with-comments", "Include comments in the response")
		.option("--comments-from <date>", "Only comments later than this date (YYYY-MM-DD or YYYYMMDD)")
		.option("--changed-date <date>", "Date the customer/vendor was changed or created (YYYY-MM-DD or YYYYMMDD)")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					id?: string;
					regNo?: string;
					vatRegNo?: string;
					name?: string;
					withComments?: boolean;
					commentsFrom?: string;
					changedDate?: string;
					data?: string;
					file?: string;
				}) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							Id: opts.id,
							RegNo: opts.regNo,
							VatRegNo: opts.vatRegNo,
							Name: opts.name,
							WithComments: opts.withComments ? true : undefined,
							CommentsFrom: parseDateYmd(opts.commentsFrom, "--comments-from"),
							ChangedDate: parseDateYmd(opts.changedDate, "--changed-date"),
						},
						{ required: false },
					);
					const result = await client.call("getcustomers", { version: "v1", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// CREATE (v2 sendcustomer): complex body with nested Dimensions/Comments arrays. Primary input is --data/--file.
	// Required on add: Name (unique, Str 150), CountryCode (Str 2), NotTDCustomer (Bool, lowercase true/false).
	grp
		.command("create")
		.description(
			"Create a customer. Endpoint: POST /api/v2/sendcustomer. JSON body (--data/--file): { Name: Str 150 (required, unique), CountryCode: Str 2 (required), NotTDCustomer: Bool (required, lowercase true/false; EE true for physical persons + foreign companies, PL true for physical persons), RegNo, VatRegNo, CurrencyCode, PaymentDeadLine: Int, OverDueCharge: Decimal 5.2, RefNoBase, Address, County, City, PostalCode, PhoneNo, PhoneNo2, HomePage, Email, SalesInvLang: Str 2 (EE ET/EN/RU/FI, PL PL/EN/RU), Contact, GLNCode, PartyCode, EInvOperator: Int (1 Not exist, 2 Omniva bank, 3 Bank full, 4 Bank limited), EInvPaymId, BankAccount, PayerReceiverName, CustGrCode, CustGrId: Guid, ShowBalance: Bool, ApixEInv, BankOnSalesInvoice: Guid, GroupInv: Bool, Dimensions: [{ DimId: Int, DimValueId: Guid, DimCode: Str }], Comments: [{ Comment: Str, CommDate: Date }] }. PaymentDeadLine/OverDueCharge default from account settings if omitted. Returns { Id, Name }.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("sendcustomer", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// UPDATE (v1 updatecustomer — note: v1, unlike create which is v2). Only Id is required; send any subset of
	// fields. Complex body with nested Dimensions/Comments arrays, so --data/--file is the primary input.
	grp
		.command("update <id>")
		.description(
			"Update a customer by id. Endpoint: POST /api/v1/updatecustomer (v1, unlike create which is v2). Only Id is required; supply any subset of fields. JSON body (--data/--file) is merged with the positional id: { Name: Str 150, CountryCode: Str 2, Address, City, PostalCode, PhoneNo, PhoneNo2, Email, RegNo, VatRegNo, SalesInvLang: Str 2 (EE ET/FI/EN/RU, PL PL/EN/RU), RefNoBase, EInvPaymId, EInvOperator: Int (1-4), BankAccount, CustGrCode, CustGrId: Guid, Contact, ApixEInv, GroupInv: Bool, PaymentDeadLine: Int, OverDueCharge: Decimal 5.2, NotTDCustomer: Bool, PayerReceiverName, CurrencyCode, County, HomePage, GLNCode, PartyCode, ShowBalance: Bool, BankOnSalesInvoice: Guid, Dimensions: [{ DimId: Int, DimValueId: Guid, DimCode: Str }], Comments: [{ Comment: Str, CommDate: Date }] }. The id flag/positional sets Id; an Id in --data/--file overrides it.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (id: string, opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), { Id: id }, { required: true, mergeFlags: true });
				const result = await client.call("updatecustomer", { version: "v1", body });
				outputSuccess(result ?? { updated: id });
			}),
		);

	// CREATE/UPDATE customer group (v2 sendcustomergroup): small scalar body. Supply Id to update an existing
	// group; omit Id to create a new one.
	grp
		.command("create-group")
		.description(
			"Create or update a customer group. Endpoint: POST /api/v2/sendcustomergroup (v2). Supply --id to update an existing group; omit it to create. Returns { Name, Code, Id }.",
		)
		.option("--id <guid>", "Customer group id (supply to update an existing group; omit to create)")
		.option("--name <name>", "Customer group name (String 64)")
		.option("--code <code>", "Customer group code (String 20)")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { id?: string; name?: string; code?: string; data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(
					readJsonBody(opts),
					{
						Id: opts.id,
						Name: opts.name,
						Code: opts.code,
					},
					{ required: true },
				);
				const result = await client.call("sendcustomergroup", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// QUERY customer groups (v2 getcustomergroups): empty request body { }, returns an array.
	grp
		.command("list-groups")
		.description(
			"List customer groups. Endpoint: POST /api/v2/getcustomergroups (v2). Request body is an empty object. Returns an array of { Name, Code, Id }.",
		)
		.option("--data <json>", "Raw JSON request body (overrides the default empty body)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: false });
				const result = await client.call("getcustomergroups", { version: "v2", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);
}
