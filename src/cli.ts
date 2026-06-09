#!/usr/bin/env node
// elnora-merit CLI entrypoint.
//
// Commander-based subcommand dispatcher. Each resource group registers itself
// via setup<Group>Command(program); the heavy lifting (signing, HTTP, output)
// happens in src/client and src/output. Global --output/--pretty/--fields are
// applied in a preAction hook before any command runs.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { loadEnvFile } from "./client/auth.js";
import { setupAccountsCommand } from "./commands/accounts.js";
import { setupBanksCommand } from "./commands/banks.js";
import { setupCostCentersCommand } from "./commands/cost-centers.js";
import { setupCustomersCommand } from "./commands/customers.js";
import { setupDepartmentsCommand } from "./commands/departments.js";
import { setupDimensionsCommand } from "./commands/dimensions.js";
import { setupFinancialYearsCommand } from "./commands/financial-years.js";
import { setupFixedAssetsCommand } from "./commands/fixed-assets.js";
import { setupGeneralLedgerCommand } from "./commands/general-ledger.js";
import { setupInventoryMovementsCommand } from "./commands/inventory-movements.js";
import { setupItemsCommand } from "./commands/items.js";
import { setupPalkCommand } from "./commands/palk.js";
import { setupPaymentsCommand } from "./commands/payments.js";
import { setupProjectsCommand } from "./commands/projects.js";
import { setupPurchaseInvoicesCommand } from "./commands/purchase-invoices.js";
import { setupReconcileCommand } from "./commands/reconcile.js";
import { setupRecurringInvoicesCommand } from "./commands/recurring-invoices.js";
import { setupReportsCommand } from "./commands/reports.js";
import { setupSalesInvoicesCommand } from "./commands/sales-invoices.js";
import { setupSalesOffersCommand } from "./commands/sales-offers.js";
import { setupSalesPricesDiscountsCommand } from "./commands/sales-prices-discounts.js";
import { setupTaxesCommand } from "./commands/taxes.js";
import { setupUnitsOfMeasureCommand } from "./commands/units-of-measure.js";
import { setupVendorsCommand } from "./commands/vendors.js";
import { setFields, setOutputFormat, setPrettyMode } from "./output/cli.js";

// Hydrate process.env from ~/.config/elnora-merit/.env and ./.env before any
// command reads credentials. Real env vars always win.
loadEnvFile();

const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")) as {
	version: string;
};

const program = new Command()
	.name("elnora-merit")
	.description(
		"Merit API CLI — Aktiva accounting (sales/purchase invoices, payments, GL, customers, vendors, reports) and Palk payroll (the `palk` command group; uses separate MERIT_PALK_* credentials).",
	)
	.version(pkg.version, "-v, --version", "Print version")
	.helpOption("-h, --help", "Show this help")
	.option("-o, --output <mode>", "Output format: json (default), table, or csv", "json")
	.option("--pretty", "Pretty-print JSON output", false)
	.option("--fields <list>", "Comma-separated fields to keep in output");

// Apply global output options before each command's action runs.
program.hook("preAction", (thisCommand) => {
	const opts = thisCommand.opts<{ output?: string; pretty?: boolean; fields?: string }>();
	if (opts.output) setOutputFormat(opts.output);
	if (opts.pretty) setPrettyMode(true);
	if (opts.fields) setFields(opts.fields);
});

setupSalesInvoicesCommand(program);
setupSalesOffersCommand(program);
setupRecurringInvoicesCommand(program);
setupPurchaseInvoicesCommand(program);
setupInventoryMovementsCommand(program);
setupPaymentsCommand(program);
setupGeneralLedgerCommand(program);
setupFixedAssetsCommand(program);
setupTaxesCommand(program);
setupCustomersCommand(program);
setupVendorsCommand(program);
setupAccountsCommand(program);
setupProjectsCommand(program);
setupCostCentersCommand(program);
setupDimensionsCommand(program);
setupDepartmentsCommand(program);
setupSalesPricesDiscountsCommand(program);
setupUnitsOfMeasureCommand(program);
setupBanksCommand(program);
setupFinancialYearsCommand(program);
setupItemsCommand(program);
setupReportsCommand(program);
setupReconcileCommand(program);
setupPalkCommand(program);

try {
	await program.parseAsync(process.argv);
} catch (err) {
	const message = err instanceof Error ? err.message : String(err);
	process.stderr.write(`${message}\n`);
	process.exit(1);
}
