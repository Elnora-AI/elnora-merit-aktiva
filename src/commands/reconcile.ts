// `reconcile` — book Stripe payouts into Merit Aktiva.
//
// Anchors on Stripe payouts (one payout = one bank deposit). Each payout is booked as
// ONE summary GL batch: card sales recognised GROSS as revenue + output VAT, fees
// as an expense, all through a clearing account. The real bank-import row then
// clears that clearing account in the Merit UI. High-volume B2C card sales are booked
// in aggregate (no per-buyer invoices); genuine company invoices are booked separately.
// Preview is read-only; run is gated by --yes and an idempotency ledger.
//
// See docs/stripe-reconciliation-spec.md for the full design.

import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { getStripeClient, type StripeClient } from "../client/stripe-client.js";
import { loadStripeMap, PLACEHOLDER_MAP, resolveMapPath } from "../config/stripe-map.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { fetchPayoutBatch, fetchPayouts } from "../reconcile/fetch.js";
import {
	DEFAULT_LEDGER_PATH,
	isBooked,
	type LedgerFile,
	loadLedger,
	recordEntry,
	saveLedger,
} from "../reconcile/ledger.js";
import { formatMinor } from "../reconcile/money.js";
import { type PayoutPlan, planPayout } from "../reconcile/plan.js";
import { executePlan } from "../reconcile/post.js";
import type { StripeMap, StripePayout } from "../reconcile/types.js";
import { requireYes, ValidationError } from "../utils/index.js";

/** Refuse to run against the wrong Stripe account when the map pins one. */
async function assertAccount(stripe: StripeClient, map: StripeMap): Promise<void> {
	if (!map.stripeAccount) return;
	const account = await stripe.get<{ id: string }>("account");
	if (account.id !== map.stripeAccount) {
		throw new ValidationError(
			`Stripe key is for account ${account.id} but the map pins ${map.stripeAccount}.`,
			"Use the key for the mapped account, or update `stripeAccount` in the map.",
		);
	}
}

/** Resolve the set of payouts to act on: a single --payout, or all since the cutoff. */
async function resolvePayouts(
	stripe: StripeClient,
	map: StripeMap,
	payoutId?: string,
	since?: string,
): Promise<StripePayout[]> {
	if (payoutId) {
		const payout = await stripe.get<StripePayout>(`payouts/${encodeURIComponent(payoutId)}`);
		// fetchPayouts filters status=paid server-side; mirror that here — a pending,
		// failed, or canceled payout must never be booked (failed payouts return the
		// funds to the Stripe balance).
		if (payout.status !== "paid") {
			throw new ValidationError(
				`Payout ${payout.id} has status "${payout.status}" — only paid payouts can be reconciled.`,
				"Wait until the payout is paid, or check the payout id.",
			);
		}
		return [payout];
	}
	return fetchPayouts(stripe, since || map.cutoffDate);
}

/** One-line-per-field summary of a plan for JSON/table output. */
function summarize(plan: PayoutPlan, booked: boolean): Record<string, unknown> {
	return {
		payoutId: plan.payoutId,
		arrivalDate: new Date(plan.arrivalDate * 1000).toISOString().slice(0, 10),
		currency: plan.currency.toUpperCase(),
		payoutNet: formatMinor(plan.payoutNetMinor),
		charges: plan.charges.length,
		grossTotal: formatMinor(plan.grossMinor),
		revenueNet: formatMinor(plan.netMinor),
		vat: formatMinor(plan.vatMinor),
		stripeFees: formatMinor(plan.fees.stripeFeeMinor),
		platformFees: formatMinor(plan.fees.platformFeeMinor),
		refunds: formatMinor(plan.fees.refundMinor),
		bookable: plan.bookable,
		alreadyBooked: booked,
		warnings: plan.warnings,
	};
}

export function setupReconcileCommand(program: Command): void {
	const grp = program
		.command("reconcile")
		.description(
			"Book Stripe payouts into Merit Aktiva (card sales, fees, refunds). Anchors on Stripe payouts; preview is read-only; run is gated by --yes + an idempotency ledger. Configure via stripe-map.json (see `reconcile init`) and STRIPE_API_KEY.",
		);

	// init — write the placeholder map and print candidate account/bank/VAT values.
	grp
		.command("init")
		.description(
			"Write a placeholder stripe-map.json and print candidate values (chart of accounts, VAT codes) from Merit so you can fill it in. Does not overwrite an existing map without --force.",
		)
		.option("--map <path>", "Path to the stripe map (default ~/.config/elnora-merit/stripe-map.json)")
		.option("--force", "Overwrite an existing map file")
		.action(
			handleAsyncCommand(async (opts: { map?: string; force?: boolean }) => {
				const path = resolveMapPath(opts.map);
				if (existsSync(path) && !opts.force) {
					throw new ValidationError(
						`A map already exists at ${path}.`,
						"Edit it directly, or pass --force to overwrite with a fresh template.",
					);
				}
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, `${JSON.stringify(PLACEHOLDER_MAP, null, 2)}\n`, { mode: 0o600 });
				chmodSync(path, 0o600);

				// Best-effort: print candidates so the user can fill the map. Skip silently if Merit auth is absent.
				let accounts: unknown;
				let taxes: unknown;
				try {
					const client = await getClient();
					accounts = await client.call("getaccounts", { version: "v1", body: {} });
					taxes = await client.call("gettaxes", { version: "v1", body: {} });
				} catch (err) {
					outputSuccess({
						mapPath: path,
						written: true,
						note: "Wrote the placeholder. Could not fetch Merit candidates (check MERIT_API_ID/MERIT_API_KEY). Run `elnora-merit accounts list` and `taxes list` manually.",
						error: (err as Error).message,
					});
					return;
				}
				outputSuccess({
					mapPath: path,
					written: true,
					next: "accounts.* codes from `accounts` (clearing = the Stripe clearing GL, e.g. 1080). vat.code = a TaxId from `taxes`.",
					accounts,
					taxes,
				});
			}),
		);

	// preview — read-only: show the planned booking for each payout.
	grp
		.command("preview")
		.description(
			"Show what would be booked for each payout — READ-ONLY, no writes. Use --payout for one payout, or --since (defaults to the map cutoff). Surfaces VAT-mismatch and balance warnings.",
		)
		.option("--map <path>", "Path to the stripe map")
		.option("--payout <id>", "Preview a single payout (po_...)")
		.option("--since <date>", "Only payouts on/after this date (YYYY-MM-DD); defaults to the map cutoff")
		.option("--ledger <path>", "Path to the idempotency ledger (default ~/.config/elnora-merit/reconcile-ledger.json)")
		.action(
			handleAsyncCommand(async (opts: { map?: string; payout?: string; since?: string; ledger?: string }) => {
				const map = loadStripeMap(opts.map);
				const stripe = getStripeClient();
				await assertAccount(stripe, map);
				const ledger = loadLedger(opts.ledger?.trim() || DEFAULT_LEDGER_PATH);

				const payouts = await resolvePayouts(stripe, map, opts.payout, opts.since);
				const summaries: Record<string, unknown>[] = [];
				for (const payout of payouts) {
					const batch = await fetchPayoutBatch(stripe, payout);
					const plan = planPayout(batch, map);
					summaries.push(summarize(plan, isBooked(ledger, payout.id)));
				}
				outputSuccess({ mode: "preview", count: summaries.length, payouts: summaries });
			}),
		);

	// run — write to Merit. Gated by --yes and the idempotency ledger.
	grp
		.command("run")
		.description(
			"Book payouts into Merit. Requires --yes. Skips payouts already in the ledger (unless --force) and skips payouts that don't balance. Use --payout for one payout, or --since (defaults to the map cutoff).",
		)
		.option("--map <path>", "Path to the stripe map")
		.option("--payout <id>", "Book a single payout (po_...)")
		.option("--since <date>", "Only payouts on/after this date (YYYY-MM-DD); defaults to the map cutoff")
		.option("--ledger <path>", "Path to the idempotency ledger (default ~/.config/elnora-merit/reconcile-ledger.json)")
		.option("--force", "Re-book payouts already recorded in the ledger")
		.option("--yes", "Confirm writing to the books")
		.action(
			handleAsyncCommand(
				async (opts: {
					map?: string;
					payout?: string;
					since?: string;
					ledger?: string;
					force?: boolean;
					yes?: boolean;
				}) => {
					requireYes(opts, "book Stripe payouts into Merit");
					const map = loadStripeMap(opts.map);
					const stripe = getStripeClient();
					await assertAccount(stripe, map);
					const merit = await getClient();
					const ledgerPath = opts.ledger?.trim() || DEFAULT_LEDGER_PATH;
					const ledger: LedgerFile = loadLedger(ledgerPath);

					const payouts = await resolvePayouts(stripe, map, opts.payout, opts.since);
					const booked: Record<string, unknown>[] = [];
					const skipped: Record<string, unknown>[] = [];

					for (const payout of payouts) {
						if (isBooked(ledger, payout.id) && !opts.force) {
							skipped.push({ payoutId: payout.id, reason: "already booked (use --force to re-book)" });
							continue;
						}
						const batch = await fetchPayoutBatch(stripe, payout);
						const plan = planPayout(batch, map);
						if (!plan.bookable) {
							const reason = plan.imbalanceMinor !== 0 ? "does not balance" : (plan.warnings[0] ?? "not bookable");
							skipped.push({ payoutId: payout.id, reason, warnings: plan.warnings });
							continue;
						}
						const result = await executePlan(merit, plan, map);
						recordEntry(ledger, {
							payoutId: payout.id,
							amountMinor: payout.amount,
							currency: payout.currency,
							postedAt: new Date().toISOString(),
							chargeCount: plan.charges.length,
							glPosted: result.glPosted,
						});
						saveLedger(ledger, ledgerPath);
						booked.push({
							payoutId: payout.id,
							charges: plan.charges.length,
							glPosted: result.glPosted,
							glResult: result.glResult,
							warnings: plan.warnings,
						});
					}
					outputSuccess({ mode: "run", bookedCount: booked.length, skippedCount: skipped.length, booked, skipped });
				},
			),
		);

	// status — booked vs outstanding payouts since the cutoff.
	grp
		.command("status")
		.description("Show booked vs outstanding payouts since the cutoff, from the idempotency ledger. Read-only.")
		.option("--map <path>", "Path to the stripe map")
		.option("--since <date>", "Only payouts on/after this date (YYYY-MM-DD); defaults to the map cutoff")
		.option("--ledger <path>", "Path to the idempotency ledger")
		.action(
			handleAsyncCommand(async (opts: { map?: string; since?: string; ledger?: string }) => {
				const map = loadStripeMap(opts.map);
				const stripe = getStripeClient();
				await assertAccount(stripe, map);
				const ledger = loadLedger(opts.ledger?.trim() || DEFAULT_LEDGER_PATH);
				const payouts = await fetchPayouts(stripe, opts.since || map.cutoffDate);
				const rows = payouts.map((p) => ({
					payoutId: p.id,
					arrivalDate: new Date(p.arrival_date * 1000).toISOString().slice(0, 10),
					amount: formatMinor(p.amount),
					currency: p.currency.toUpperCase(),
					booked: isBooked(ledger, p.id),
				}));
				outputSuccess({
					count: rows.length,
					bookedCount: rows.filter((r) => r.booked).length,
					outstandingCount: rows.filter((r) => !r.booked).length,
					payouts: rows,
				});
			}),
		);
}
