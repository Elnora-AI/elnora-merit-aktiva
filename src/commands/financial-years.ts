import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { readJsonBody, resolveBody } from "../utils/index.js";

export function setupFinancialYearsCommand(program: Command): void {
	const grp = program.command("financial-years").description("Financial years / accounting periods (Merit Aktiva)");

	// QUERY endpoint: no documented request fields (empty {} payload). Returns SaveFrom/SaveTo
	// plus AccPeriods (each: AccPeriodId Guid, StartDate, EndDate, Active Bool).
	grp
		.command("list")
		.description(
			"List financial accounting periods and the open save range. Endpoint: POST /api/v2/getaccperiods. Empty {} query payload (no request fields). Returns SaveFrom, SaveTo and AccPeriods[] (each: AccPeriodId, StartDate, EndDate, Active). Poland tenant uses host program-360ksiegowosc.pl; same path/version.",
		)
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: false });
				const result = await client.call("getaccperiods", { version: "v2", body });
				outputSuccess(result);
			}),
		);
}
