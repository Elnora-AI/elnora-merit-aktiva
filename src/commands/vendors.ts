import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { parseDateYmd, readJsonBody, resolveBody } from "../utils/index.js";

export function setupVendorsCommand(program: Command): void {
	const grp = program.command("vendors").description("Vendors and vendor groups (Merit Aktiva)");

	// QUERY endpoint: small set of scalar filter fields → typed flags.
	grp
		.command("list")
		.description(
			"List/find vendors. Endpoint: POST /api/v1/getvendors. Always filter (by --id/--reg-no/--vat-reg-no/--name): querying the full list returns a server stacktrace because the JSON is too large. --id wins over other filters; --name is a broad match, --reg-no/--vat-reg-no are exact. --changed-date uses YYYYmmDD.",
		)
		.option("--id <guid>", "Vendor id; if set, other filters are ignored")
		.option("--reg-no <regno>", "Registration number (exact match)")
		.option("--vat-reg-no <vatregno>", "VAT registration number (exact match)")
		.option("--name <name>", "Name (broad match)")
		.option("--with-comments", "Include comments in the response")
		.option("--comments-from <date>", "Only comments later than this date (YYYY-MM-DD or YYYYMMDD)")
		.option("--changed-date <date>", "Vendors changed/created on this date (YYYY-MM-DD or YYYYMMDD)")
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
					const result = await client.call("getvendors", { version: "v1", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// BODY-DRIVEN create (v2). Name + VatAccountable + CountryCode required on add.
	grp
		.command("create")
		.description(
			"Create a vendor. Endpoint: POST /api/v2/sendvendor. JSON body (--data/--file): { Name: Str150 (required, unique), VatAccountable: Bool (required, lowercase true/false), CountryCode: Str2 (required), Id: Guid, RegNo: Str30, VatRegNo: Str30, CurrencyCode: Str4, PaymentDeadLine: Int, OverDueCharge: Decimal, RefNoBase: Str36, Address: Str100, County: Str100, City: Str30, PostalCode: Str15, PhoneNo: Str50, PhoneNo2: Str50, HomePage: Str80, Email: Str80, VendorType: Int (1=vendor, 3=the reporting entity), VendGrCode: Str20, VendGrId: Guid, ReceiverName: Str150, BankAccount: Str50, SWIFT_BIC: Str30, Dimensions: [{ DimId: Int, DimValueId: Guid, DimCode: Str }] }. PaymentDeadLine/OverDueCharge default from account settings if omitted. Returns { Id, Name }.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("sendvendor", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// BODY-DRIVEN update (v2, default). Only Id required. v2 adds Dimensions + PayerReceiverName.
	grp
		.command("update")
		.description(
			"Update a vendor (v2). Endpoint: POST /api/v2/updatevendor. JSON body (--data/--file): { Id: Guid (required), and any subset of: Name: Str150, CountryCode: Str2, Address: Str100, City: Str30, PostalCode: Str15, PhoneNo: Str50, PhoneNo2: Str50, Email, RegNo: Str30, VatRegNo: Str30, SalesInvLang: Str2 (EE/FI/PL), VatAccountable: Bool (lowercase true/false), BankAccount: Str50, ReferenceNo: Str36, VendGrCode: Str20, VendGrId: Guid, PayerReceiverName: Str150 (v2 only), Dimensions: [{ DimId: Int, DimValueId: Guid, DimCode: Str }] (v2 only; values must already exist in the company DB) }. The v2 payload has no SWIFT_BIC field; for SWIFT_BIC use `vendors update-v1`. No response payload is documented.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("updatevendor", { version: "v2", body });
				outputSuccess(result ?? { updated: true });
			}),
		);

	// BODY-DRIVEN update (v1 variant of the same updatevendor path; altPath in spec).
	grp
		.command("update-v1")
		.description(
			"Update a vendor (v1 variant of POST /api/v1/updatevendor). Use this when you need SWIFT_BIC (v1 only). JSON body (--data/--file): { Id: Guid (required), and any subset of: Name: Str150, CountryCode: Str2, Address: Str100, City: Str30, PostalCode: Str15, PhoneNo: Str50, PhoneNo2: Str50, Email, RegNo: Str30, VatRegNo: Str30, SalesInvLang: Str2 (EE/FI/PL), VatAccountable: Bool (lowercase true/false), BankAccount: Str50, ReferenceNo: Str36, VendGrCode: Str20, VendGrId: Guid, SWIFT_BIC: Str30 }. The v1 payload has no Dimensions or PayerReceiverName fields (those are v2 only; see `vendors update`). No response payload is documented.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("updatevendor", { version: "v1", body });
				outputSuccess(result ?? { updated: true });
			}),
		);

	// CREATE/UPDATE vendor group (v2). Scalar fields → typed flags. Supply --id to update.
	grp
		.command("create-group")
		.description(
			"Create (or update) a vendor group. Endpoint: POST /api/v2/sendvendorgroup. Supply --id to update an existing group; omit it to create. Returns { Id, Name, Code }.",
		)
		.option("--id <guid>", "Vendor group id; supply to update, omit to create")
		.option("--name <name>", "Vendor group name (max 64)")
		.option("--code <code>", "Vendor group code (max 20)")
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
				const result = await client.call("sendvendorgroup", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// LIST vendor groups (v2). Request payload is an empty object.
	grp
		.command("list-groups")
		.description(
			"List vendor groups. Endpoint: POST /api/v2/getvendorgroups. Request payload is an empty object; returns an array of { Id, Name, Code }. Note: on the Poland host this endpoint's path is getvendorlist instead — see `vendors list-groups-pl`.",
		)
		.option("--data <json>", "Raw JSON request body (overrides the default empty body)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: false });
				const result = await client.call("getvendorgroups", { version: "v2", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);

	// LIST vendor groups on the Poland host (altPath: getvendorlist, NOT getvendorgroups).
	grp
		.command("list-groups-pl")
		.description(
			"List vendor groups via the Poland-host path. Endpoint: POST /api/v2/getvendorlist (the Poland host uses getvendorlist instead of getvendorgroups; same empty body and { Id, Name, Code } array response). Use this only when configured against the Poland base URL; otherwise use `vendors list-groups`.",
		)
		.option("--data <json>", "Raw JSON request body (overrides the default empty body)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: false });
				const result = await client.call("getvendorlist", { version: "v2", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);
}
