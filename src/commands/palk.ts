// Merit Palk (payroll) command group.
//
// Palk is a separate Merit product from Aktiva: its own host (palk.merit.ee),
// its own credentials (MERIT_PALK_API_ID / MERIT_PALK_API_KEY), and a v1-only
// API. Every endpoint is POST + JSON with the same HMAC signing as Aktiva, so
// requests go through getPalkClient() (which targets the Palk base URL).
//
// Read endpoints expose the documented query fields as typed flags; write
// (send*) endpoints take rich nested bodies, so they accept the documented JSON
// directly via --data/--file, mirroring the Aktiva create commands.

import type { Command } from "commander";
import { getPalkClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { ValidationError } from "../utils/errors.js";
import { parseDateIso, parsePositiveInt, parseYearMonth, readJsonBody, resolveBody } from "../utils/index.js";

const DOC_BASE = "https://api.merit.ee/merit-palk-api/palk-reference-manual";

// Register a write (send*) subcommand: required JSON body via --data/--file.
function registerSend(parent: Command, name: string, apiPath: string, summary: string, docPath: string): void {
	parent
		.command(name)
		.description(
			`${summary} Endpoint: POST /api/v1/${apiPath}. Pass the documented JSON payload via --data '<json>' or --file <path.json>. Field reference: ${DOC_BASE}/${docPath}.`,
		)
		.option("--data <json>", "Raw JSON request body")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getPalkClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call(apiPath, { version: "v1", body });
				outputSuccess(result ?? { ok: true });
			}),
		);
}

export function setupPalkCommand(program: Command): void {
	const palk = program
		.command("palk")
		.description(
			"Merit Palk payroll API (separate product + credentials from Aktiva — set MERIT_PALK_API_ID / MERIT_PALK_API_KEY; requires a Palk PRO license).",
		);

	// --- Employees ------------------------------------------------------------
	const employees = palk.command("employees").description("Employees (Merit Palk)");
	employees
		.command("list")
		.description(
			`List employees. Endpoint: POST /api/v1/getemployees. The request params section is mandatory but its fields are optional filters: --personal-code (PersonalCode, Str11) and --month (Month6, YYYYMM). With no filters, an empty {} is sent and all employees are returned. Returns an array (FirstName, SurName, PersonalCode, BankAccountNo/IBAN, Address, PhoneNo, Email, Language, TypeId, StartDate, EndDate, ContractNo, TorId, Gender, BirthDate, ...). Docs: ${DOC_BASE}/requesting-data-from-merit-palk/getting-employees-list/.`,
		)
		.option("--personal-code <code>", "Filter by employee personal ID code (PersonalCode, Str11)")
		.option("--month <YYYYMM>", "Filter by period (Month6, e.g. 202401)")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { personalCode?: string; month?: string; data?: string; file?: string }) => {
				const client = await getPalkClient();
				const body = resolveBody(
					readJsonBody(opts),
					{ PersonalCode: opts.personalCode, Month6: parseYearMonth(opts.month, "--month") },
					{ required: false },
				);
				const result = await client.call("getemployees", { version: "v1", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);
	registerSend(
		employees,
		"create",
		"sendemployees",
		"Add employees and their first contracts.",
		"creating-data-in-merit-palk/adding-employees-and-their-first-contracts/",
	);

	// --- Employee contacts ----------------------------------------------------
	const contacts = palk.command("contacts").description("Employee contacts (Merit Palk)");
	registerSend(
		contacts,
		"add",
		"sendcontacts",
		"Add employee contacts (email, phone, address).",
		"creating-data-in-merit-palk/adding-employee-contacts/",
	);

	// --- Base salary agreements ----------------------------------------------
	const baseSalary = palk.command("base-salary").description("Base salary agreements (Merit Palk)");
	baseSalary
		.command("list")
		.description(
			`Get base salary agreements. Endpoint: POST /api/v1/getpayterms. Optional filters: --start-month / --end-month (StartMonth/EndMonth, YYYYMM; default to the company calendar's first/last month) and --personal-id (PersonalID, Str11; default all employees with a contract in the period). Returns agreement rows (PersonalCode, Employee Name, ContractType, StartDate, EndDate, Hours, Amount, GLAccountCode, DepartmentCode, ...). Docs: ${DOC_BASE}/requesting-data-from-merit-palk/getting-base-salary-agreements/.`,
		)
		.option("--start-month <YYYYMM>", "Period start (StartMonth, e.g. 202401)")
		.option("--end-month <YYYYMM>", "Period end (EndMonth, e.g. 202412)")
		.option("--personal-id <code>", "Filter by employee personal ID code (PersonalID, Str11)")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: { startMonth?: string; endMonth?: string; personalId?: string; data?: string; file?: string }) => {
					const client = await getPalkClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							StartMonth: parseYearMonth(opts.startMonth, "--start-month"),
							EndMonth: parseYearMonth(opts.endMonth, "--end-month"),
							PersonalID: opts.personalId,
						},
						{ required: false },
					);
					const result = await client.call("getpayterms", { version: "v1", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);
	registerSend(
		baseSalary,
		"create",
		"sendpayterms",
		"Create base salary agreements.",
		"creating-data-in-merit-palk/creating-base-salary-agreements/",
	);

	// --- Salaries & withholdings ---------------------------------------------
	const salary = palk.command("salary").description("Salaries & withholdings (Merit Palk)");
	registerSend(
		salary,
		"create",
		"sendsalary",
		"Create salaries and withholdings, or add amounts for base salaries.",
		"creating-data-in-merit-palk/creating-salaries-and-withholdings-or-adding-amounts-for-base-salaries/",
	);

	// --- Absences -------------------------------------------------------------
	const absences = palk.command("absences").description("Absences (Merit Palk)");
	registerSend(
		absences,
		"create",
		"sendabsence",
		"Create absences (vacation, sick leave, etc.).",
		"creating-data-in-merit-palk/creating-absences/",
	);

	// --- General ledger -------------------------------------------------------
	const gl = palk.command("gl").description("General ledger (Merit Palk)");
	gl.command("get")
		.description(
			`Get general ledger transaction details for a month. Endpoint: POST /api/v1/getglbatch. Required: --month (Month, YYYYMM). Returns GL transactions (AccountCode, DepartmentCode, Debit, Credit, ProjectCode, CostCenterCode, DocNo, BatchDate, EntryRow[]). Docs: ${DOC_BASE}/requesting-data-from-merit-palk/getting-general-ledger-transaction-details/.`,
		)
		.requiredOption("--month <YYYYMM>", "Accounting month (Month, e.g. 202401)")
		.action(
			handleAsyncCommand(async (opts: { month: string }) => {
				const client = await getPalkClient();
				const body = { Month: parseYearMonth(opts.month, "--month") };
				const result = await client.call("getglbatch", { version: "v1", body });
				outputSuccess(result);
			}),
		);

	// --- Vacation obligation --------------------------------------------------
	const vacation = palk.command("vacation").description("Vacation obligation (Merit Palk)");
	vacation
		.command("balance")
		.description(
			`Get vacation obligation balance for an employee at a date. Endpoint: POST /api/v1/getvacoblig. Required: --contract-code (ContractCode — employee contract import code OR personal ID code, Str11) and --date (Date, balance date YYYY-MM-DD). Returns DaysUnused and the breakdown (AdDaysUnused, DaysExpired, DaysAcquired, DaysObligations, ...). Docs: ${DOC_BASE}/requesting-data-from-merit-palk/getting-vacation-obligation-balance/.`,
		)
		.requiredOption("--contract-code <code>", "Employee contract import code or personal ID code (ContractCode, Str11)")
		.requiredOption("--date <YYYY-MM-DD>", "Balance date (Date)")
		.action(
			handleAsyncCommand(async (opts: { contractCode: string; date: string }) => {
				const client = await getPalkClient();
				const body = { ContractCode: opts.contractCode, Date: parseDateIso(opts.date, "--date") };
				const result = await client.call("getvacoblig", { version: "v1", body });
				outputSuccess(result);
			}),
		);
	registerSend(
		vacation,
		"set-liability",
		"sendvacoblig",
		"Create new vacation liability rate settings.",
		"creating-data-in-merit-palk/creating-new-vacation-liability-rate-settings/",
	);

	// --- Salary & hours report ------------------------------------------------
	palk
		.command("salary-report")
		.description(
			`Get the salaries & working-hours report. Endpoint: POST /api/v1/getsalaryreport. Required: --start-date / --end-date (StartDate/EndDate, YYYY-MM-DD). Optional: --language (Language, ET/EN/RU) and --sort-option (SortOption: 1=salary groups, 2=alphabet, 3=accounting month). Returns rows (EmployeeFullName, SalaryTypeName, Month6, Hours, Sum, AccountCode, Department, CostCenter, Project, SocialTax, TotalSum, ...). Docs: ${DOC_BASE}/requesting-data-from-merit-palk/getting-salary-and-hours-report-data/.`,
		)
		.requiredOption("--start-date <YYYY-MM-DD>", "Report period start (StartDate)")
		.requiredOption("--end-date <YYYY-MM-DD>", "Report period end (EndDate)")
		.option("--language <code>", "Report language (Language: ET, EN, or RU)")
		.option("--sort-option <n>", "Sort: 1=salary groups, 2=alphabet, 3=accounting month (SortOption)")
		.action(
			handleAsyncCommand(
				async (opts: { startDate: string; endDate: string; language?: string; sortOption?: string }) => {
					let language: string | undefined;
					if (opts.language !== undefined) {
						language = opts.language.trim().toUpperCase();
						if (!["ET", "EN", "RU"].includes(language)) {
							throw new ValidationError(`Invalid --language value: "${opts.language}". Must be ET, EN, or RU.`);
						}
					}
					const client = await getPalkClient();
					const body = {
						StartDate: parseDateIso(opts.startDate, "--start-date"),
						EndDate: parseDateIso(opts.endDate, "--end-date"),
						Language: language,
						SortOption: parsePositiveInt(opts.sortOption, "--sort-option"),
					};
					const result = await client.call("getsalaryreport", { version: "v1", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// --- Dimensions -----------------------------------------------------------
	const dimensions = palk.command("dimensions").description("Dimensions (Merit Palk)");
	registerSend(
		dimensions,
		"set",
		"senddimensions",
		"Create or edit dimensions.",
		"creating-data-in-merit-palk/creating-or-editing-dimensions/",
	);

	// --- Basic exemption (tax-free income) settings ---------------------------
	const taxFree = palk.command("tax-free").description("Basic exemption (tax-free income) settings (Merit Palk)");
	registerSend(
		taxFree,
		"set",
		"sendtaxfree",
		"Create basic exemption usage settings.",
		"creating-data-in-merit-palk/creating-basic-exemption-usage-settings/",
	);

	// --- Reduced work capacity ------------------------------------------------
	const reducedCapacity = palk.command("reduced-capacity").description("Reduced work capacity settings (Merit Palk)");
	registerSend(
		reducedCapacity,
		"set",
		"sendincapacitypension",
		"Create new reduced work capacity settings.",
		"creating-data-in-merit-palk/creating-new-reduced-work-capacity-settings/",
	);
}
