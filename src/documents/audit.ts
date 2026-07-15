// Detect Merit transactions that are missing their source-document attachment.
//
// Merit exposes a boolean `FileExists` on every invoice header — true when a file
// (the supplier PDF / receipt) is attached. This module lists invoices over a
// period and returns the ones with no attachment. Purchase invoices are the
// primary target (an expense with no receipt is the real accounting gap); sales
// invoices are opt-in (we usually issue those, and Merit generates the PDF).
//
// The list endpoints cap the window at three months, so we page by quarter.

import type { MeritClient } from "../client/merit-client.js";
import type { MissingDoc } from "./types.js";

const MAX_WINDOW_DAYS = 90;

/** yyyymmdd for the Merit list body. */
function ymd(date: Date): string {
	return date.toISOString().slice(0, 10).replace(/-/g, "");
}

/** ISO yyyy-mm-dd from a Merit date string (handles "2026-06-01T00:00:00"). */
function isoDate(value: unknown): string | null {
	if (typeof value !== "string" || value.length < 10) return null;
	return value.slice(0, 10);
}

function truthy(value: unknown): boolean {
	return value === true || value === "True" || value === "true";
}

function toNumber(value: unknown): number {
	const n = typeof value === "string" ? Number.parseFloat(value) : (value as number);
	return Number.isFinite(n) ? n : 0;
}

/** Split [from, to] into ≤3-month windows (Merit's list cap). */
export function quarterWindows(from: Date, to: Date): Array<{ from: string; to: string }> {
	const windows: Array<{ from: string; to: string }> = [];
	let cursor = new Date(from);
	while (cursor <= to) {
		const end = new Date(cursor);
		end.setUTCDate(end.getUTCDate() + MAX_WINDOW_DAYS - 1);
		const windowEnd = end < to ? end : to;
		windows.push({ from: ymd(cursor), to: ymd(windowEnd) });
		cursor = new Date(windowEnd);
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return windows;
}

interface PurchaseHeader {
	PIHId?: string;
	BillNo?: string | null;
	VendorName?: string | null;
	VendorRegNo?: string | null;
	DocumentDate?: string | null;
	TotalSum?: number | string;
	TotalAmount?: number | string;
	CurrencyCode?: string;
	Paid?: boolean | string;
	FileExists?: boolean | string;
}

interface SalesHeader {
	SIHId?: string;
	InvoiceNo?: string | null;
	DocNo?: string | null;
	CustomerName?: string | null;
	CustomerRegNo?: string | null;
	DocDate?: string | null;
	TotalSum?: number | string;
	CurrencyCode?: string;
	Paid?: boolean | string;
	FileExists?: boolean | string;
}

function unwrapList(res: unknown): Record<string, unknown>[] {
	if (Array.isArray(res)) return res as Record<string, unknown>[];
	if (res && typeof res === "object" && Array.isArray((res as { items?: unknown }).items)) {
		return (res as { items: Record<string, unknown>[] }).items;
	}
	return [];
}

/** List purchase invoices missing an attachment across [from, to]. */
export async function auditPurchaseInvoices(client: MeritClient, from: Date, to: Date): Promise<MissingDoc[]> {
	const out: MissingDoc[] = [];
	const seen = new Set<string>();
	for (const win of quarterWindows(from, to)) {
		const res = await client.call("getpurchorders", {
			version: "v1",
			body: { PeriodStart: win.from, PeriodEnd: win.to },
		});
		for (const raw of unwrapList(res)) {
			const h = raw as PurchaseHeader;
			if (!h.PIHId || seen.has(h.PIHId) || truthy(h.FileExists)) continue;
			seen.add(h.PIHId);
			out.push({
				kind: "purchase-invoice",
				id: h.PIHId,
				billNo: h.BillNo ?? null,
				partyName: h.VendorName ?? null,
				partyRegNo: h.VendorRegNo ?? null,
				docDate: isoDate(h.DocumentDate),
				grossTotal: toNumber(h.TotalSum ?? h.TotalAmount),
				currency: h.CurrencyCode ?? "EUR",
				paid: truthy(h.Paid),
			});
		}
	}
	return out;
}

/** List sales invoices missing an attachment across [from, to] (opt-in). */
export async function auditSalesInvoices(client: MeritClient, from: Date, to: Date): Promise<MissingDoc[]> {
	const out: MissingDoc[] = [];
	const seen = new Set<string>();
	for (const win of quarterWindows(from, to)) {
		const res = await client.call("getinvoices", {
			version: "v1",
			body: { PeriodStart: win.from, PeriodEnd: win.to },
		});
		for (const raw of unwrapList(res)) {
			const h = raw as SalesHeader;
			if (!h.SIHId || seen.has(h.SIHId) || truthy(h.FileExists)) continue;
			seen.add(h.SIHId);
			out.push({
				kind: "sales-invoice",
				id: h.SIHId,
				billNo: h.InvoiceNo ?? h.DocNo ?? null,
				partyName: h.CustomerName ?? null,
				partyRegNo: h.CustomerRegNo ?? null,
				docDate: isoDate(h.DocDate),
				grossTotal: toNumber(h.TotalSum),
				currency: h.CurrencyCode ?? "EUR",
				paid: truthy(h.Paid),
			});
		}
	}
	return out;
}
