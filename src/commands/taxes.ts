import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { parseDecimal, parsePositiveInt, readJsonBody, resolveBody } from "../utils/index.js";

export function setupTaxesCommand(program: Command): void {
	const grp = program.command("taxes").description("Tax (VAT) rate management (Merit Aktiva)");

	// QUERY endpoint: no documented request fields. Body defaults to an empty
	// JSON object ('{ }'); --data/--file remain as a raw-body escape hatch.
	grp
		.command("list")
		.description(
			"List every tax/VAT rate (mirrors Settings >> VAT settings). Endpoint: POST /api/v1/gettaxes. Empty JSON body ('{ }'); returns an array of tax-rate objects (Id: Guid, Code, Name, NameEN, NameRU, TaxPct: Decimal 2.2). v1 list response has NO Swedish (SE) fields and NO localized Code* variants (unlike v2 sendtax). PL tenant uses the same path on host program.360ksiegowosc.pl.",
		)
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: false }) ?? {};
				const result = await client.call("gettaxes", { version: "v1", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);

	// CREATE endpoint (v2, unlike the v1 list). Small flat field set, so the
	// documented scalars are exposed as typed flags; --data/--file override.
	grp
		.command("create")
		.description(
			"Create a tax (VAT) rate. Endpoint: POST /api/v2/sendtax (v2, unlike the v1 list). Required fields: --tax-type (Int; only documented value is 12 = OSS sale to the EU) and --country-code (ISO 2-letter). Optional: --code/--code-en/--code-se/--code-ru (Str 16), --name (Str 40), --name-en/--name-se/--name-ru (Str 150), --tax-pct (Dec 18.2). JSON body (--data/--file) overrides flags: { Code, CodeEN, CodeSE, CodeRU, Name, NameEN, NameSE, NameRU, TaxPct, TaxType (required), CountryCode (required) }. Result is documented as a plain line 'CreatedTaxId= taxid' (guid of the created tax). PL tenant uses the same path on host program.360ksiegowosc.pl.",
		)
		.option("--code <str>", "Tax code (Str 16)")
		.option("--code-en <str>", "Tax code in English (Str 16)")
		.option("--code-se <str>", "Tax code in Swedish (Str 16)")
		.option("--code-ru <str>", "Tax code in Russian (Str 16)")
		.option("--name <str>", "Tax name (Str 40)")
		.option("--name-en <str>", "Tax name in English (Str 150)")
		.option("--name-se <str>", "Tax name in Swedish (Str 150)")
		.option("--name-ru <str>", "Tax name in Russian (Str 150)")
		.option("--tax-pct <decimal>", "Tax percentage (Dec 18.2)")
		.option("--tax-type <int>", "Required. Tax type Int; only documented value is 12 (OSS sale to the EU)")
		.option("--country-code <str>", "Required. ISO 2-letter country code (Str 2)")
		.option("--data <json>", "JSON request body matching the documented schema (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					code?: string;
					codeEn?: string;
					codeSe?: string;
					codeRu?: string;
					name?: string;
					nameEn?: string;
					nameSe?: string;
					nameRu?: string;
					taxPct?: string;
					taxType?: string;
					countryCode?: string;
					data?: string;
					file?: string;
				}) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							Code: opts.code,
							CodeEN: opts.codeEn,
							CodeSE: opts.codeSe,
							CodeRU: opts.codeRu,
							Name: opts.name,
							NameEN: opts.nameEn,
							NameSE: opts.nameSe,
							NameRU: opts.nameRu,
							TaxPct: parseDecimal(opts.taxPct, "--tax-pct"),
							TaxType: parsePositiveInt(opts.taxType, "--tax-type"),
							CountryCode: opts.countryCode,
						},
						{ required: true },
					);
					const result = await client.call("sendtax", { version: "v2", body });
					outputSuccess(result);
				},
			),
		);
}
