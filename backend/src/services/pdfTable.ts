// camelCase report field -> a human label. Anything not listed here falls
// back to a generic camelCase -> "Title Case" split (humanizeHeader below).
const HEADER_OVERRIDES: Record<string, string> = {
  employeeId: "Employee ID",
  weekStartDate: "Week Start",
  submittedAt: "Submitted",
  approvedAt: "Approved",
  daysToDecide: "Decided In (days)",
  pendingDays: "Pending (days)",
  slaBreached: "SLA Breached",
  daysOverdue: "Days Overdue",
  utilizationPct: "Utilization %",
  budgetHours: "Budget Hours",
  loggedHours: "Logged Hours",
  thresholdExceeded: "Threshold Exceeded",
  entityType: "Entity Type",
  entityId: "Entity ID",
  timesheetStatus: "Timesheet Status",
  projectCode: "Project Code",
  clientId: "Client ID",
  projectId: "Project ID",
  userId: "User ID",
  entryCount: "Entries",
  totalHours: "Total Hours",
};

export function humanizeHeader(key: string): string {
  if (HEADER_OVERRIDES[key]) return HEADER_OVERRIDES[key];
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) {
    return value.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

/**
 * Renders `rows` as an actual bordered, column-aligned, word-wrapped table
 * with a repeating header — replaces the previous approach of dumping
 * "header1  |  header2" / "value1  |  value2" as plain unaligned text lines,
 * which is what produced the unreadable PDF exports (long values ran past
 * the page edge with no column alignment at all).
 */
export function renderPdfTable(doc: PDFKit.PDFDocument, rows: Record<string, unknown>[], maxRows = 500) {
  if (rows.length === 0) {
    doc.fontSize(11).fillColor("#000").text("No data for the selected filters.");
    return;
  }

  const headers = Object.keys(rows[0]);
  const labels = headers.map(humanizeHeader);
  const truncated = rows.length > maxRows;
  const dataRows = rows.slice(0, maxRows).map((row) => headers.map((h) => formatCell(row[h])));

  const pageLeft = doc.page.margins.left;
  const pageRight = doc.page.width - doc.page.margins.right;
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  const tableWidth = pageRight - pageLeft;
  const cellPadding = 4;
  const headerHeight = 22;
  const minColWidth = 55;
  const fontSize = 8;

  // Weight each column by the longer of its header label or a sample of its
  // own values (capped, so one unusually long note doesn't swallow the
  // whole row) — short columns like status/flags stay narrow, long ones
  // like employee/notes get proportionally more room.
  const weights = headers.map((h, i) => {
    const headerLen = labels[i].length;
    const sample = dataRows.slice(0, 40).map((r) => r[i].length);
    return Math.min(Math.max(headerLen, ...sample, 1), 45);
  });
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  // A column must never be narrower than its widest single word (e.g.
  // "SUBMITTED", "APPROVED") — otherwise pdfkit hyphenates mid-word, which
  // is what made status/boolean columns unreadable. Measure actual glyph
  // widths (not just character counts) for the header and a value sample.
  doc.font("Helvetica-Bold").fontSize(fontSize);
  const headerWidths = labels.map((label) => doc.widthOfString(label));
  doc.font("Helvetica").fontSize(fontSize);
  const widestWordWidths = headers.map((h, i) => {
    const sample = dataRows.slice(0, 200).map((r) => r[i]);
    let widest = 0;
    for (const cell of sample) {
      for (const word of cell.split(/\s+/)) {
        widest = Math.max(widest, doc.widthOfString(word));
      }
    }
    return widest;
  });
  const perColMin = headers.map((h, i) =>
    Math.max(minColWidth, headerWidths[i] + cellPadding * 2, widestWordWidths[i] + cellPadding * 2)
  );
  const totalMin = perColMin.reduce((s, w) => s + w, 0);

  let colWidths: number[];
  if (totalMin >= tableWidth) {
    // Table can't fit even at minimum widths — scale down uniformly as a
    // last resort (some wrapping becomes unavoidable in this case).
    const scale = tableWidth / totalMin;
    colWidths = perColMin.map((w) => w * scale);
  } else {
    // Distribute the remaining space beyond each column's minimum, in
    // proportion to its content weight, so long columns (notes, employee
    // name) get the extra room instead of it splitting evenly.
    const extra = tableWidth - totalMin;
    colWidths = perColMin.map((w, i) => w + (weights[i] / totalWeight) * extra);
  }

  function colX(i: number): number {
    let x = pageLeft;
    for (let j = 0; j < i; j++) x += colWidths[j];
    return x;
  }

  function drawHeaderRow(y: number): number {
    doc.rect(pageLeft, y, tableWidth, headerHeight).fill("#1B4298");
    doc.fillColor("#ffffff").fontSize(fontSize).font("Helvetica-Bold");
    labels.forEach((label, i) => {
      doc.text(label, colX(i) + cellPadding, y + 7, {
        width: colWidths[i] - cellPadding * 2,
        ellipsis: true,
        lineBreak: false,
      });
    });
    doc.font("Helvetica").fillColor("#000000");
    return y + headerHeight;
  }

  let y = drawHeaderRow(doc.y);

  dataRows.forEach((cells, rowIndex) => {
    doc.fontSize(fontSize);
    const rowHeight = Math.max(
      16,
      ...cells.map((text, i) => doc.heightOfString(text, { width: colWidths[i] - cellPadding * 2 }) + 8)
    );

    if (y + rowHeight > pageBottom) {
      doc.addPage();
      y = drawHeaderRow(doc.page.margins.top);
    }

    if (rowIndex % 2 === 1) {
      doc.rect(pageLeft, y, tableWidth, rowHeight).fill("#F3F5FA");
    }
    doc.fillColor("#1F2937");
    cells.forEach((text, i) => {
      doc.text(text, colX(i) + cellPadding, y + 4, { width: colWidths[i] - cellPadding * 2 });
    });
    doc
      .moveTo(pageLeft, y + rowHeight)
      .lineTo(pageRight, y + rowHeight)
      .strokeColor("#E5E7EB")
      .lineWidth(0.5)
      .stroke();

    y += rowHeight;
  });

  doc.y = y + 12;
  doc.x = pageLeft;
  if (truncated) {
    doc.fontSize(8).fillColor("#888888").text(`Showing the first ${maxRows} of ${rows.length} rows — use the CSV or Excel export for the full data set.`);
  }
}
