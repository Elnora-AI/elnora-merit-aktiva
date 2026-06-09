import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { parseDecimal, parsePositiveInt, readJsonBody, resolveBody } from "../utils/index.js";

export function setupItemsCommand(program: Command): void {
	const grp = program
		.command("items")
		.description("Items resource group (Merit Aktiva): stock items, services, and item groups");

	// QUERY endpoint: scalar filters become typed flags. Polymorphic response (empty / single object / list).
	grp
		.command("list")
		.description(
			"List items. Endpoint: POST /api/v1/getitems. Id => single item (other filters ignored); Code/Description are broad match. --location-code drives per-stock InventoryQty/InventoryCost. Usage: 1-sales, 2-purchases, 3-sales and purchases. Type: 1-stock item, 2-service, 3-item.",
		)
		.option("--id <guid>", "Item id (if filled, other filters are ignored)")
		.option("--code <code>", "Item code (broad match)")
		.option("--description <text>", "Description (broad match)")
		.option("--location-code <code>", "Stock code for goods-on-hand report (populates InventoryQty/InventoryCost)")
		.option("--usage <int>", "Usage filter (1-sales, 2-purchases, 3-sales and purchases)")
		.option("--type <int>", "Type filter (1-stock item, 2-service, 3-item)")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					id?: string;
					code?: string;
					description?: string;
					locationCode?: string;
					usage?: string;
					type?: string;
					data?: string;
					file?: string;
				}) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							Id: opts.id,
							Code: opts.code,
							Description: opts.description,
							LocationCode: opts.locationCode,
							Usage: parsePositiveInt(opts.usage, "--usage"),
							Type: parsePositiveInt(opts.type, "--type"),
						},
						{ required: false },
					);
					const result = await client.call("getitems", { version: "v1", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// QUERY endpoint with empty payload: returns all item groups.
	grp
		.command("list-groups")
		.description(
			"List item groups. Endpoint: POST /api/v2/getitemgroups. Empty JSON body { }; returns all groups (Code, Name, Id).",
		)
		.option("--data <json>", "Raw JSON request body (overrides the default empty body)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: false }) ?? {};
				const result = await client.call("getitemgroups", { version: "v2", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);

	// BODY-DRIVEN endpoint (array of nested item objects): primary input is --data/--file.
	grp
		.command("create")
		.description(
			"Bulk-create items. Endpoint: POST /api/v2/senditems. JSON body (--data/--file): { Items: [{ Type: Int (required, 1-stock item/2-service/3-item), Usage: Int (required, 1-sales/2-purchases/3-sales and purchases), Code: Str 20 (required), Description: Str 100 (required), UOMName: Str 64 (required for stock item), DefLocationCode: Str 20 (required if multiple stocks), EANCode: Str, GTUCode: Int (Poland only, sales, 1..13), DescriptionEN/RU/FI: Str 100, TaxId: Guid, ItemGrCode: Str (must exist), SalesAccCode/PurchaseAccCode/InventoryAccCode/CostAccCode: Str 10 }] }.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("senditems", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// BODY-DRIVEN endpoint (array of group objects): primary input is --data/--file.
	grp
		.command("create-group")
		.description(
			"Bulk-create item groups. Endpoint: POST /api/v2/senditemgroups. JSON body (--data/--file): { ItemGroups: [{ Code: Str, Name: Str }] }. Returns an array of { Code, Id }.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("senditemgroups", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// UPDATE endpoint: single item, Id required, scalar fields update in place.
	grp
		.command("update <id>")
		.description(
			"Update a single item by id. Endpoint: POST /api/v1/updateitem. Only Id is required; all other fields are optional and update in place. ItemGrCode and account codes must already exist in the company database. EANCode max Str 13. GTUCode is Poland-only (sales, 1..13).",
		)
		.option("--code <code>", "Item code (Str 20)")
		.option("--description <text>", "Description (Str 100)")
		.option("--sales-price <decimal>", "Sales price (Decimal 18.2)")
		.option("--item-gr-code <code>", "Item group code (must exist in the company database)")
		.option("--discount-pct <decimal>", "Discount percentage (Decimal 18.2)")
		.option("--ean-code <code>", "EAN/barcode (Str 13)")
		.option("--name-en <text>", "English name (Str 100)")
		.option("--last-purchase-price <decimal>", "Last purchase price (Decimal 18.2)")
		.option("--sales-account-code <code>", "Sales account code (Str 10, must exist)")
		.option("--inventory-account-code <code>", "Inventory account code (Str 10, must exist)")
		.option("--item-cost-account-code <code>", "Item cost account code (Str 10, must exist)")
		.option("--tax-id <guid>", "Tax id (Guid)")
		.option("--gtu-code <int>", "GTU code (Poland only, sales, 1..13)")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (
					id: string,
					opts: {
						code?: string;
						description?: string;
						salesPrice?: string;
						itemGrCode?: string;
						discountPct?: string;
						eanCode?: string;
						nameEn?: string;
						lastPurchasePrice?: string;
						salesAccountCode?: string;
						inventoryAccountCode?: string;
						itemCostAccountCode?: string;
						taxId?: string;
						gtuCode?: string;
						data?: string;
						file?: string;
					},
				) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							Id: id,
							Code: opts.code,
							Description: opts.description,
							SalesPrice: parseDecimal(opts.salesPrice, "--sales-price"),
							ItemGrCode: opts.itemGrCode,
							DiscountPct: parseDecimal(opts.discountPct, "--discount-pct"),
							EANCode: opts.eanCode,
							NameEN: opts.nameEn,
							LastPurchasePrice: parseDecimal(opts.lastPurchasePrice, "--last-purchase-price"),
							SalesAccountCode: opts.salesAccountCode,
							InventoryAccountCode: opts.inventoryAccountCode,
							ItemCostAccountCode: opts.itemCostAccountCode,
							TaxId: opts.taxId,
							GTUCode: parsePositiveInt(opts.gtuCode, "--gtu-code"),
						},
						{ required: true, mergeFlags: true },
					);
					const result = await client.call("updateitem", { version: "v1", body });
					outputSuccess(result ?? { updated: id });
				},
			),
		);
}
