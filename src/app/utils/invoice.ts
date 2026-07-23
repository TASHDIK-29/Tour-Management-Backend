/* eslint-disable @typescript-eslint/no-explicit-any */
import PDFDocument from "pdfkit";
import AppError from "../error/AppError";

export interface IInvoiceData {
    transactionId: string;
    bookingDate: Date;
    userName: string;
    tourTitle: string;
    guestCount: number;
    totalAmount: number;
}

const BRAND = "TourLink";

const COLORS = {
    primary: "#E11D48",
    dark: "#111827",
    gray: "#6B7280",
    light: "#9CA3AF",
    line: "#E5E7EB",
    bg: "#F9FAFB",
    green: "#059669",
};

// Helvetica (pdfkit's default) has no Taka glyph, so the currency is spelled out.
const money = (n: number) =>
    "BDT " +
    n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

const fmtDate = (d: Date) =>
    new Date(d).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });

/**
 * Renders a clean, professional A4 invoice: branded header, billing/meta blocks,
 * a line-item table and a totals row.
 */
export const generatePdf = async (
    invoiceData: IInvoiceData
): Promise<Buffer<ArrayBufferLike>> => {
    try {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ size: "A4", margin: 50 });
            const buffer: Uint8Array[] = [];

            doc.on("data", (chunk) => buffer.push(chunk));
            doc.on("end", () => resolve(Buffer.concat(buffer)));
            doc.on("error", (err) => reject(err));

            const left = doc.page.margins.left;
            const right = doc.page.width - doc.page.margins.right;
            const contentW = right - left;

            /* ---------------- Header ---------------- */
            doc
                .fillColor(COLORS.primary)
                .font("Helvetica-Bold")
                .fontSize(24)
                .text(BRAND, left, 55);
            doc
                .fillColor(COLORS.gray)
                .font("Helvetica")
                .fontSize(9)
                .text("Tour Management System", left, 84);

            doc
                .fillColor(COLORS.dark)
                .font("Helvetica-Bold")
                .fontSize(22)
                .text("INVOICE", left, 55, { align: "right", width: contentW });
            doc
                .fillColor(COLORS.gray)
                .font("Helvetica")
                .fontSize(9)
                .text(`#${invoiceData.transactionId}`, left, 84, {
                    align: "right",
                    width: contentW,
                });

            doc
                .moveTo(left, 110)
                .lineTo(right, 110)
                .strokeColor(COLORS.line)
                .lineWidth(1)
                .stroke();

            /* ---------------- Billing / meta ---------------- */
            const metaY = 132;

            doc
                .fillColor(COLORS.light)
                .font("Helvetica-Bold")
                .fontSize(8)
                .text("BILLED TO", left, metaY);
            doc
                .fillColor(COLORS.dark)
                .font("Helvetica-Bold")
                .fontSize(13)
                .text(invoiceData.userName, left, metaY + 13);

            const metaRows: [string, string, string?][] = [
                ["Invoice Date", fmtDate(invoiceData.bookingDate)],
                ["Transaction ID", invoiceData.transactionId],
                ["Status", "PAID", COLORS.green],
            ];
            let ry = metaY;
            for (const [label, value, color] of metaRows) {
                doc
                    .fillColor(COLORS.gray)
                    .font("Helvetica")
                    .fontSize(9)
                    .text(label, left + contentW - 260, ry, {
                        width: 120,
                        align: "left",
                    });
                doc
                    .fillColor(color ?? COLORS.dark)
                    .font("Helvetica-Bold")
                    .fontSize(9)
                    .text(value, left + contentW - 140, ry, {
                        width: 140,
                        align: "right",
                    });
                ry += 16;
            }

            /* ---------------- Line-item table ---------------- */
            const tableTop = 215;
            const amountW = 110;
            const guestsW = 70;
            const amountX = right - amountW;
            const guestsX = amountX - guestsW;

            doc.rect(left, tableTop, contentW, 26).fill(COLORS.bg);
            doc
                .fillColor(COLORS.gray)
                .font("Helvetica-Bold")
                .fontSize(9)
                .text("DESCRIPTION", left + 12, tableTop + 9)
                .text("GUESTS", guestsX, tableTop + 9, {
                    width: guestsW,
                    align: "center",
                })
                .text("AMOUNT", amountX, tableTop + 9, {
                    width: amountW - 12,
                    align: "right",
                });

            const rowY = tableTop + 26 + 12;
            doc
                .fillColor(COLORS.dark)
                .font("Helvetica")
                .fontSize(11)
                .text(invoiceData.tourTitle, left + 12, rowY, {
                    width: guestsX - left - 24,
                })
                .text(String(invoiceData.guestCount), guestsX, rowY, {
                    width: guestsW,
                    align: "center",
                })
                .text(money(invoiceData.totalAmount), amountX, rowY, {
                    width: amountW - 12,
                    align: "right",
                });

            const lineY = rowY + 28;
            doc
                .moveTo(left, lineY)
                .lineTo(right, lineY)
                .strokeColor(COLORS.line)
                .lineWidth(1)
                .stroke();

            /* ---------------- Total ---------------- */
            const totalY = lineY + 16;
            doc
                .fillColor(COLORS.gray)
                .font("Helvetica-Bold")
                .fontSize(11)
                .text("Total", right - 330, totalY + 3, {
                    width: 120,
                    align: "right",
                });
            doc
                .fillColor(COLORS.primary)
                .font("Helvetica-Bold")
                .fontSize(15)
                .text(money(invoiceData.totalAmount), right - 200, totalY, {
                    width: 200,
                    align: "right",
                });

            /* ---------------- Footer ---------------- */
            const footerY = 730;
            doc
                .moveTo(left, footerY)
                .lineTo(right, footerY)
                .strokeColor(COLORS.line)
                .lineWidth(1)
                .stroke();
            doc
                .fillColor(COLORS.dark)
                .font("Helvetica-Bold")
                .fontSize(11)
                .text(`Thank you for booking with ${BRAND}!`, left, footerY + 16, {
                    align: "center",
                    width: contentW,
                });
            doc
                .fillColor(COLORS.light)
                .font("Helvetica")
                .fontSize(8)
                .text(
                    "This is a computer-generated invoice and does not require a signature.",
                    left,
                    footerY + 34,
                    { align: "center", width: contentW }
                );

            doc.end();
        });
    } catch (error: any) {
        console.log(error);
        throw new AppError(401, `Pdf creation error ${error.message}`);
    }
};
