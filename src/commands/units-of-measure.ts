import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { readJsonBody, resolveBody } from "../utils/index.js";

export function setupUnitsOfMeasureCommand(program: Command): void {
	const grp = program.command("units").description("Units of measure (UOM) resource group (Merit Aktiva)");

	// QUERY endpoint (v1): empty JSON query payload. Returns an array of { Code (Str 20), Name (Str 64) }.
	grp
		.command("list")
		.description(
			"List units of measure. Endpoint: POST /api/v1/getunits. Empty JSON query payload { }. Returns an array of { Code (Str 20), Name (Str 64) }. Estonia and Poland share this contract on different hosts.",
		)
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: false });
				const result = await client.call("getunits", { version: "v1", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);

	// CREATE endpoint (v2): flat scalar payload of multilingual singular/plural names. Returns the new unit Id,
	// or error api-uomexsist if a matching unit already exists.
	grp
		.command("create")
		.description(
			"Create a unit of measure. Endpoint: POST /api/v2/senduom. JSON body (--data/--file) or flags: { Name, NamePlural (default/Estonian), NameEN, NamePluralEN, NameSE, NamePluralSE, NameFI, NamePluralFI, NameRU, NamePluralRU } — all Str, none marked required. Returns the created unit Id; returns error api-uomexsist if the unit already exists.",
		)
		.option("--name <text>", "Singular name (default/Estonian)")
		.option("--name-plural <text>", "Plural name (default/Estonian)")
		.option("--name-en <text>", "Singular name in English")
		.option("--name-plural-en <text>", "Plural name in English")
		.option("--name-se <text>", "Singular name in Swedish")
		.option("--name-plural-se <text>", "Plural name in Swedish")
		.option("--name-fi <text>", "Singular name in Finnish")
		.option("--name-plural-fi <text>", "Plural name in Finnish")
		.option("--name-ru <text>", "Singular name in Russian")
		.option("--name-plural-ru <text>", "Plural name in Russian")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					name?: string;
					namePlural?: string;
					nameEn?: string;
					namePluralEn?: string;
					nameSe?: string;
					namePluralSe?: string;
					nameFi?: string;
					namePluralFi?: string;
					nameRu?: string;
					namePluralRu?: string;
					data?: string;
					file?: string;
				}) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							Name: opts.name,
							NamePlural: opts.namePlural,
							NameEN: opts.nameEn,
							NamePluralEN: opts.namePluralEn,
							NameSE: opts.nameSe,
							NamePluralSE: opts.namePluralSe,
							NameFI: opts.nameFi,
							NamePluralFI: opts.namePluralFi,
							NameRU: opts.nameRu,
							NamePluralRU: opts.namePluralRu,
						},
						{ required: true },
					);
					const result = await client.call("senduom", { version: "v2", body });
					outputSuccess(result);
				},
			),
		);
}
