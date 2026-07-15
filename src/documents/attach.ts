// Get a found document onto a Merit transaction.
//
// Merit's API has NO "attach a file to an existing invoice" endpoint — a file can
// only be set when the invoice is CREATED (sendpurchinvoice/sendpurchorder carry
// an Attachment). So there are two honest paths for a transaction that already
// exists without its document:
//
//   stageForUpload (default, safe): copy the matched PDF into a staging folder,
//     named by the invoice, ready to drag into the Merit UI (a 2-second upload).
//     Nothing in the books changes.
//
//   rebookPurchaseInvoiceWithAttachment (opt-in, --rebook): delete the invoice and
//     recreate it, identical, WITH the attachment. Changes the invoice id and, for
//     a paid invoice, must re-book the payment — so it is guarded and never the
//     default. Reconstruction is faithful only for simple single-currency invoices.

import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { MeritClient } from "../client/merit-client.js";
import { ValidationError } from "../utils/errors.js";
import type { MissingDoc } from "./types.js";

/** Read a local PDF as base64 (Merit validates the base64 server-side). */
export function readPdfBase64(path: string): { fileName: string; base64: string } {
	const buf = readFileSync(path);
	if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
		throw new ValidationError(`${path} is not a PDF (Merit only attaches PDF documents).`);
	}
	return { fileName: basename(path), base64: buf.toString("base64") };
}

/** Safe path: copy the matched file into a staging folder for a manual UI upload. */
export function stageForUpload(missing: MissingDoc, docPath: string, outDir: string): string {
	mkdirSync(outDir, { recursive: true });
	const safeBill = (missing.billNo ?? missing.id).replace(/[^\w.-]+/g, "_");
	// Keep the source extension — a receipt may be a PDF or a phone photo (.jpg/.png/…).
	const ext = extname(docPath).toLowerCase() || ".pdf";
	const dest = join(outDir, `${safeBill}__${missing.id.slice(0, 8)}${ext}`);
	copyFileSync(docPath, dest);
	return dest;
}

interface PurchaseDetail {
	Header?: Record<string, unknown>;
	Lines?: Array<Record<string, unknown>>;
	Payments?: Array<Record<string, unknown>>;
}

/**
 * Opt-in: delete a purchase invoice and recreate it with the attachment.
 * Guards: purchase invoices only; refuses a paid or multi-payment invoice unless
 * `force` (recreating drops the payment link — the caller must re-book it).
 * Reconstructs the create body from the v2 detail; faithful for the common
 * single-line, single-currency travel/SaaS receipt, which is exactly the backlog.
 */
export async function rebookPurchaseInvoiceWithAttachment(
	client: MeritClient,
	missing: MissingDoc,
	pdf: { fileName: string; base64: string },
	opts: { force?: boolean } = {},
): Promise<{ oldId: string; newId: string }> {
	if (missing.kind !== "purchase-invoice") {
		throw new ValidationError("rebook is supported for purchase invoices only.");
	}
	const detail = (await client.call("getpurchorder", {
		version: "v2",
		body: { Id: missing.id },
	})) as PurchaseDetail;
	const header = detail.Header ?? {};
	const lines = detail.Lines ?? [];
	const payments = detail.Payments ?? [];
	if (payments.length > 0 && !opts.force) {
		throw new ValidationError(
			`Invoice ${missing.billNo ?? missing.id} is paid — rebooking drops the payment link.`,
			"Re-run with --force and re-book the payment after, or stage the file for a UI upload instead.",
		);
	}
	if (lines.length === 0) {
		throw new ValidationError(
			`Invoice ${missing.billNo ?? missing.id} has no lines to reconstruct — upload the file in the UI.`,
		);
	}

	const body: Record<string, unknown> = {
		Vendor: { Id: header.VendorId },
		DocDate: String(header.DocumentDate ?? "")
			.slice(0, 10)
			.replace(/-/g, ""),
		DueDate:
			String(header.DueDate ?? "")
				.slice(0, 10)
				.replace(/-/g, "") || undefined,
		BillNo: header.BillNo,
		CurrencyCode: header.CurrencyCode ?? "EUR",
		InvoiceRow: lines.map((l) => ({
			Item: { Code: l.ItemCode, Description: l.Description, Type: l.Type ?? 3 },
			Quantity: l.Quantity ?? 1,
			Price: l.Price,
			TaxId: l.TaxId,
			GLAccountCode: l.GLAccountCode,
		})),
		TaxAmount: (header.TaxAmountRows as unknown[]) ?? [
			{ TaxId: (lines[0] as Record<string, unknown>).TaxId, Amount: header.TaxAmount },
		],
		TotalAmount: header.TotalAmount,
		Attachment: { FileName: pdf.fileName, FileContent: pdf.base64 },
	};

	await client.call("deletepurchinvoice", { version: "v1", body: { Id: missing.id } });
	const created = (await client.call("sendpurchinvoice", { version: "v1", body })) as { PIHId?: string };
	return { oldId: missing.id, newId: created.PIHId ?? "" };
}
