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
  jobTitle: "Job Title",
  weekStart: "Week Start",
  weekEnd: "Week End",
  weekEnding: "Week Ending",
  billableHours: "Billable Hours",
  nonBillableHours: "Non-Billable Hours",
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

// ---------- Weekly Summary by Employee ----------
// A client-billing format (see RELEASE_NOTES.md) that doesn't fit the
// generic table above: it's grouped under a title band per employee, with a
// bold subtotal row inserted after each month's weeks rather than being one
// flat table.

interface WeeklySummaryWeek {
  weekStart: string;
  weekEnd: string;
  billableHours: number;
  remarks: string;
}
interface WeeklySummaryMonth {
  month: string;
  weeks: WeeklySummaryWeek[];
  monthTotal: number;
}
interface WeeklySummaryEmployee {
  employeeId: string;
  name: string;
  jobTitle: string;
  months: WeeklySummaryMonth[];
  grandTotal: number;
}

function formatIsoDateShort(iso: string): string {
  // "2026-08-03" -> "3-Aug-26", matching the original hand-built Excel format.
  const [y, m, d] = iso.split("-").map(Number);
  const abbr = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d}-${abbr[m - 1]}-${String(y).slice(-2)}`;
}

function formatHoursCell(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function renderWeeklySummaryPdf(doc: PDFKit.PDFDocument, employees: WeeklySummaryEmployee[]) {
  if (employees.length === 0) {
    doc.fontSize(11).fillColor("#000").text("No data for the selected filters.");
    return;
  }

  const pageLeft = doc.page.margins.left;
  const pageRight = doc.page.width - doc.page.margins.right;
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  const tableWidth = pageRight - pageLeft;
  const colWidths = [tableWidth * 0.17, tableWidth * 0.17, tableWidth * 0.18, tableWidth * 0.48];
  const fontSize = 9;
  const rowHeight = 18;
  const headerLabels = ["Week Start", "Week End", "Billable Hours", "Remarks"];

  function colX(i: number): number {
    return pageLeft + colWidths.slice(0, i).reduce((s, w) => s + w, 0);
  }

  // Returns the y to draw at, starting a fresh page (with the column header
  // repeated) first if `needed` doesn't fit on the current one.
  function ensureSpace(y: number, needed: number, redrawHeaderAfterBreak: boolean): number {
    if (y + needed <= pageBottom) return y;
    doc.addPage();
    let freshY = doc.page.margins.top;
    if (redrawHeaderAfterBreak) freshY = drawTableHeader(freshY);
    return freshY;
  }

  function drawTableHeader(y: number): number {
    doc.rect(pageLeft, y, tableWidth, rowHeight).fill("#1B4298");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(fontSize);
    headerLabels.forEach((label, i) => {
      doc.text(label, colX(i) + 4, y + 4, { width: colWidths[i] - 8, lineBreak: false, ellipsis: true });
    });
    doc.fillColor("#1F2937").font("Helvetica");
    return y + rowHeight;
  }

  function drawRow(y: number, cells: string[], opts: { bold?: boolean; bg?: string } = {}): number {
    if (opts.bg) doc.rect(pageLeft, y, tableWidth, rowHeight).fill(opts.bg);
    doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize).fillColor("#1F2937");
    cells.forEach((text, i) => {
      doc.text(text, colX(i) + 4, y + 4, { width: colWidths[i] - 8, lineBreak: false, ellipsis: true });
    });
    doc.font("Helvetica");
    return y + rowHeight;
  }

  employees.forEach((emp, empIndex) => {
    let y = ensureSpace(doc.y, rowHeight * 3, false);
    if (empIndex > 0) y += 10;

    // Title band: name | job title, split roughly where the original
    // Excel's two-column employee header was.
    const bandHeight = rowHeight + 4;
    y = ensureSpace(y, bandHeight + rowHeight * 2, false);
    const nameWidth = tableWidth * 0.54;
    doc.rect(pageLeft, y, nameWidth, bandHeight).fill("#1B4298");
    doc.rect(pageLeft + nameWidth, y, tableWidth - nameWidth, bandHeight).fill("#E5E7EB");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(fontSize + 1);
    doc.text(emp.name, pageLeft + 6, y + 5, { width: nameWidth - 12, lineBreak: false, ellipsis: true });
    doc.fillColor("#374151");
    doc.text(emp.jobTitle, pageLeft + nameWidth + 6, y + 5, { width: tableWidth - nameWidth - 12, lineBreak: false, ellipsis: true });
    doc.fillColor("#1F2937").font("Helvetica");
    y += bandHeight;

    y = drawTableHeader(y);

    emp.months.forEach((month) => {
      month.weeks.forEach((w, i) => {
        y = ensureSpace(y, rowHeight, true);
        y = drawRow(y, [formatIsoDateShort(w.weekStart), formatIsoDateShort(w.weekEnd), formatHoursCell(w.billableHours), w.remarks], {
          bg: i % 2 === 1 ? "#F3F5FA" : undefined,
        });
      });
      y = ensureSpace(y, rowHeight, true);
      y = drawRow(y, ["", "", formatHoursCell(month.monthTotal), month.month], { bold: true, bg: "#EEF1F6" });
    });

    doc.y = y;
    doc.x = pageLeft;
  });
}

// ---------- Daily Timesheet (one printable, client-signable sheet per employee per week) ----------

interface DailyTimesheetDay {
  date: string;
  projectName: string;
  task: string;
  billableHours: number;
  nonBillableHours: number;
}
interface DailyTimesheetSheet {
  employeeName: string;
  employeeEmail: string;
  manager: string;
  weekStart: string;
  weekEnd: string;
  days: DailyTimesheetDay[];
  totalBillable: number;
  totalNonBillable: number;
  totalHours: number;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatIsoDateSlash(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

/**
 * One literal page per sheet — reproduces the exact manual Excel timesheet
 * format (logo, employee/manager info block, Mon-Sun day grid split into
 * billable/non-billable hours, signature lines) a PM has been hand-building
 * per client per week for approval (see RELEASE_NOTES.md). There's no
 * `phone` field on User yet, so that row always reads "—" rather than
 * guessing at a value.
 */
export function renderDailyTimesheetPdf(
  doc: PDFKit.PDFDocument,
  sheets: DailyTimesheetSheet[],
  logo: { path: string; aspectRatio: number },
  truncated: boolean
) {
  if (sheets.length === 0) {
    doc.fontSize(11).fillColor("#000").text("No data for the selected filters.");
    return;
  }

  sheets.forEach((sheet, sheetIndex) => {
    if (sheetIndex > 0) doc.addPage();
    const pageLeft = doc.page.margins.left;
    const pageRight = doc.page.width - doc.page.margins.right;
    const tableWidth = pageRight - pageLeft;

    const logoWidth = 130;
    try {
      doc.image(logo.path, pageLeft, doc.page.margins.top, { width: logoWidth });
    } catch {
      // Missing/unreadable asset shouldn't block generation.
    }
    doc.y = doc.page.margins.top + logoWidth * logo.aspectRatio + 16;
    doc.x = pageLeft;

    function infoRow(label: string, value: string) {
      const y = doc.y;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#1F2937").text(label, pageLeft, y, { width: 110, lineBreak: false });
      doc.font("Helvetica").text(value || "—", pageLeft + 110, y, { width: tableWidth - 110, lineBreak: false, ellipsis: true });
      doc.y = y + 16;
    }

    infoRow("Employee:", sheet.employeeName);
    infoRow("Manager:", sheet.manager);
    infoRow("Employee phone:", "—");
    infoRow("Employee e-mail:", sheet.employeeEmail);
    doc.moveDown(0.5);
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor("#1F2937")
      .text("Week ending:", pageLeft, doc.y, { continued: true })
      .font("Helvetica")
      .text(`  ${formatIsoDateSlash(sheet.weekEnd)}`);
    doc.moveDown(0.6);

    const colWidths = [0.1, 0.1, 0.22, 0.22, 0.12, 0.14, 0.1].map((p) => p * tableWidth);
    // "Non Billable Hrs." doesn't fit a ~10%-wide column at this font size —
    // pdfkit's lineBreak:false stops word-wrap but doesn't shrink/ellipsize
    // reliably once the string is this much wider than the box, so the fix
    // is a shorter label plus a bit more width, not just one or the other.
    const labels = ["Day", "Date", "Project Name", "Task", "Billable Hrs.", "Non-Bill. Hrs.", "Total"];
    const fontSize = 8;
    const rowHeight = 22;

    function colX(idx: number): number {
      return pageLeft + colWidths.slice(0, idx).reduce((s, w) => s + w, 0);
    }

    let y = doc.y;
    doc.rect(pageLeft, y, tableWidth, rowHeight).fill("#1B4298");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(fontSize);
    labels.forEach((label, idx) => {
      doc.text(label, colX(idx) + 3, y + 7, { width: colWidths[idx] - 6, lineBreak: false, ellipsis: true });
    });
    y += rowHeight;

    sheet.days.forEach((d, idx) => {
      if (idx % 2 === 1) doc.rect(pageLeft, y, tableWidth, rowHeight).fill("#F3F5FA");
      doc.fillColor("#1F2937").font("Helvetica").fontSize(fontSize);
      const total = d.billableHours + d.nonBillableHours;
      const cells = [
        DAY_NAMES[idx],
        formatIsoDateSlash(d.date),
        d.projectName,
        d.task,
        d.billableHours ? formatHoursCell(d.billableHours) : "",
        d.nonBillableHours ? formatHoursCell(d.nonBillableHours) : "",
        total ? formatHoursCell(total) : "",
      ];
      cells.forEach((text, i) => {
        doc.text(text, colX(i) + 3, y + 7, { width: colWidths[i] - 6, lineBreak: false, ellipsis: true });
      });
      y += rowHeight;
    });

    doc.rect(pageLeft, y, tableWidth, rowHeight).fill("#1B4298");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(fontSize);
    doc.text("Total hours:", colX(0) + 3, y + 7, {
      width: colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] - 6,
      lineBreak: false,
    });
    doc.text(formatHoursCell(sheet.totalBillable), colX(4) + 3, y + 7, { width: colWidths[4] - 6, lineBreak: false });
    doc.text(formatHoursCell(sheet.totalNonBillable), colX(5) + 3, y + 7, { width: colWidths[5] - 6, lineBreak: false });
    doc.text(formatHoursCell(sheet.totalHours), colX(6) + 3, y + 7, { width: colWidths[6] - 6, lineBreak: false });
    y += rowHeight;

    doc.fillColor("#1F2937").font("Helvetica");
    doc.y = y + 40;
    doc.x = pageLeft;

    const sigLineWidth = tableWidth * 0.55;
    function signatureLine(label: string) {
      const ly = doc.y;
      doc.moveTo(pageLeft, ly).lineTo(pageLeft + sigLineWidth, ly).strokeColor("#9CA3AF").lineWidth(0.75).stroke();
      doc
        .moveTo(pageLeft + sigLineWidth + 20, ly)
        .lineTo(pageRight, ly)
        .strokeColor("#9CA3AF")
        .stroke();
      doc.fontSize(8).fillColor("#6B7280");
      doc.text(label, pageLeft, ly + 3, { width: sigLineWidth, lineBreak: false });
      doc.text("Date", pageLeft + sigLineWidth + 20, ly + 3, { width: tableWidth - sigLineWidth - 20, lineBreak: false });
      doc.y = ly + 28;
    }
    signatureLine("Employee signature");
    signatureLine("Manager signature");

    if (truncated && sheetIndex === sheets.length - 1) {
      doc.moveDown(1);
      doc
        .fontSize(8)
        .fillColor("#888888")
        .text("Showing a limited number of employee/week sheets for this filter — narrow the date range or client/project to see the rest.");
    }
  });
}
