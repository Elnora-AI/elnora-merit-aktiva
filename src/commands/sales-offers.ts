import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { parseDateYmd, parseNonNegativeInt, parsePositiveInt, readJsonBody, resolveBody } from "../utils/index.js";

export function setupSalesOffersCommand(program: Command): void {
	const grp = program
		.command("sales-offers")
		.description("Sales offers — quotes, sales orders, prepayment invoices (Merit Aktiva)");

	// QUERY endpoint (v2). Scalar filters → typed flags. Period span capped at 3 months.
	grp
		.command("list")
		.description(
			"List sales offers over a period. Endpoint: POST /api/v2/getoffers. Period (--period-start..--period-end) capped at max 3 months. --date-type 0=document date, 1=changed date. Returns an array of offer summaries (DocType 1=quote/2=sales order/3=prepayment invoice; DocStatus 1=created/2=sent/3=approved/4=rejected/5=comment received/6=invoice created/7=canceled).",
		)
		.option("--period-start <date>", "Period start (YYYY-MM-DD or YYYYMMDD)")
		.option("--period-end <date>", "Period end (YYYY-MM-DD or YYYYMMDD); period max 3 months")
		.option("--date-type <int>", "Date basis: 0=document date, 1=changed date")
		.option("--unpaid", "Only unpaid offers")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					periodStart?: string;
					periodEnd?: string;
					dateType?: string;
					unpaid?: boolean;
					data?: string;
					file?: string;
				}) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							PeriodStart: parseDateYmd(opts.periodStart, "--period-start"),
							PeriodEnd: parseDateYmd(opts.periodEnd, "--period-end"),
							DateType: parseNonNegativeInt(opts.dateType, "--date-type"),
							UnPaid: opts.unpaid ? true : undefined,
						},
						{ required: false },
					);
					const result = await client.call("getoffers", { version: "v2", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// QUERY a single offer's full detail by Id (v2).
	grp
		.command("get <id>")
		.description(
			"Get one sales offer's full detail by id. Endpoint: POST /api/v2/getoffer. Returns header fields plus OfferRow[] (each with its own row-level Dimensions: DimId/Code/AllocPct/AllocAmount) and header-level Dimensions (DimId/DimValueId/DimCode).",
		)
		.action(
			handleAsyncCommand(async (id: string) => {
				const client = await getClient();
				const result = await client.call("getoffer", { version: "v2", body: { Id: id } });
				outputSuccess(result);
			}),
		);

	// BODY-DRIVEN create (v2). Complex nested payload (Customer/Payer + OfferRow[] + TaxAmount[]).
	grp
		.command("create")
		.description(
			'Create a sales offer (v2 payload). Endpoint: POST /api/v2/sendoffer. JSON body (--data/--file): { OfferNo: Str35 (required), TaxAmount: [{ TaxId: Guid (required, use gettaxes), Amount: Decimal }] (required, grouped/summed by TaxId), Customer: { Id: Guid OR (Name + CountryCode + NotTDCustomer required when adding; NotTDCustomer lowercase "true"/"false"), RegNo, VatRegNo, CurrencyCode, PaymentDeadLine: Int, OverDueCharge: Decimal, Address, City, County, PostalCode, PhoneNo, Email, SalesInvLang, GLNCode, PartyCode, RefNoBase, EInvOperator: Int, EInvPaymId, BankAccount, ShowBalance: Bool }, Payer: { same shape as Customer plus Contact, Dimensions, CustGrCode }, DocDate, ExpireDate (=DueDate when DocType 2 or 3), DeliveryDate (all Date YYYYmmdd), DocType: Int (1=quote/2=sales order/3=prepayment invoice), DocStatus: Int (1=created..7=canceled), ContactInfo, RefNo (validate via pangaliit 7-3-1), CurrencyCode, DepartmentCode, Dimensions: [{ DimId: Int, DimValueId: Guid, DimCode: Str }], OfferRow: [{ Item: { Code (required), Description (required), Type: Int (1=stock/2=service/3=item, required when adding), UOMName, DefLocationCode, EANCode }, Quantity: Decimal, Price: Decimal, DiscountPct: Decimal, DiscountAmount: Decimal (=Amount*Price*DiscountPct/100, unrounded), TaxId: Guid, LocationCode, DepartmentCode, GLAccountCode, Dimensions, ItemCostAmount, SalesAccCode, PurchaseAccCode, InventoryAccCode, CostAccCode }], TotalAmount: Decimal (amount without VAT), RoundingAmount: Decimal (adjusts total sum, not TotalAmount), Payment: { PaymentMethod, PaidAmount: Decimal, PaymDate: YYYYmmddHHii }, Hcomment, Fcomment, ReserveItems: Bool, PrepaymPct: Decimal }. Items with different VAT rates and goods-vs-services must use different item codes. Returns { CustomerId, InvoiceId, InvoiceNo, RefNo, NewCustomer }.',
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("sendoffer", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// BODY-DRIVEN create, v1 payload variant (altPath: same apiPath, different version/schema).
	grp
		.command("create-v1")
		.description(
			"Create a sales offer (v1 payload). Endpoint: POST /api/v1/sendoffer. Differs from v2 create: NO Dimensions/ReserveItems/PrepaymPct/Payer, the Customer object has no ShowBalance, and adds header-level ProjectCode (Str20), row-level ProjectCode/CostCenterCode, plus Poland-only ProcCodes (Array of Str: SW, EE, TP, TT_WNT, TT_D, MR_T, MR_UZ, I_42, I_63, B_SPV, B_SPV_DOSTAWA, BMRW_PROWIZJA, MPP) and PolDocType (Int: 1=RO/2=WEW/3=FP/4=OJPK). JSON body (--data/--file): { OfferNo: Str35 (required), TaxAmount: [{ TaxId: Guid (required), Amount: Decimal }] (required), Customer: { Id OR Name + CountryCode + NotTDCustomer (lowercase) when adding, ... }, DocDate, ExpireDate, DeliveryDate, DocType: Int, DocStatus: Int, ContactInfo, RefNo, CurrencyCode, DepartmentCode, ProjectCode: Str20, OfferRow: [{ Item, Quantity, Price, DiscountPct, DiscountAmount, TaxId, LocationCode, DepartmentCode, ItemCostAmount, GLAccountCode, ProjectCode, CostCenterCode }], TotalAmount, RoundingAmount, Payment, Hcomment, Fcomment, ProcCodes, PolDocType }. Returns { CustomerId, InvoiceId, InvoiceNo, RefNo, NewCustomer }.",
		)
		.option("--data <json>", "JSON request body matching the documented v1 schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("sendoffer", { version: "v1", body });
				outputSuccess(result);
			}),
		);

	// UPDATE (v2). Only four scalar fields are updatable → typed flags.
	grp
		.command("update")
		.description(
			'Update limited fields of a sales offer. Endpoint: POST /api/v2/updateoffer. Only OfferNo, delivery date, HComment and FComment are updatable. NOTE: the delivery-date field is spelled "DeriveryDate" verbatim in Merit\'s doc; --delivery-date maps to that field name. No response payload is documented.',
		)
		.option("--offer-no <no>", "Offer number")
		.option("--delivery-date <date>", 'Delivery date (YYYY-MM-DD or YYYYMMDD); sent as the doc\'s "DeriveryDate" field')
		.option("--h-comment <text>", "Header comment")
		.option("--f-comment <text>", "Footer comment")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					offerNo?: string;
					deliveryDate?: string;
					hComment?: string;
					fComment?: string;
					data?: string;
					file?: string;
				}) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							OfferNo: opts.offerNo,
							DeriveryDate: parseDateYmd(opts.deliveryDate, "--delivery-date"),
							HComment: opts.hComment,
							FComment: opts.fComment,
						},
						{ required: true },
					);
					const result = await client.call("updateoffer", { version: "v2", body });
					outputSuccess(result ?? { updated: true });
				},
			),
		);

	// SET STATUS (v2). Scalar fields → typed flags. Comment required when NewStatus=5.
	grp
		.command("set-status <id>")
		.description(
			"Change a sales offer's status. Endpoint: POST /api/v2/setofferstatus. --new-status: 1=unsent, 2=sent, 3=confirmed, 4=rejected, 5=commented, 7=canceled (no value 6; wording differs from the DocStatus enum on list/create). --comment is required when --new-status 5. No response payload is documented.",
		)
		.option("--new-status <int>", "New status: 1=unsent, 2=sent, 3=confirmed, 4=rejected, 5=commented, 7=canceled")
		.option("--comment <text>", "Comment (required when --new-status 5)")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (id: string, opts: { newStatus?: string; comment?: string; data?: string; file?: string }) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							Id: id,
							NewStatus: parsePositiveInt(opts.newStatus, "--new-status"),
							Comment: opts.comment,
						},
						{ required: true, mergeFlags: true },
					);
					const result = await client.call("setofferstatus", { version: "v2", body });
					outputSuccess(result ?? { updated: id });
				},
			),
		);

	// Convert an offer into an invoice (v2).
	grp
		.command("create-invoice <id>")
		.description(
			"Convert an existing sales offer into an invoice. Endpoint: POST /api/v2/offer2inv. Returns { CustomerId, InvoiceId, InvoiceNo, RefNo, NewCustomer }.",
		)
		.action(
			handleAsyncCommand(async (id: string) => {
				const client = await getClient();
				const result = await client.call("offer2inv", { version: "v2", body: { Id: id } });
				outputSuccess(result);
			}),
		);
}
