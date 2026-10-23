// Regenerates USER_MANUAL.pdf from USER_MANUAL.md — a minimal markdown ->
// pdfkit renderer purpose-built for this one file's structure (#/##/###
// headings, bullet/numbered lists, pipe tables, **bold**/`code` spans), not
// a general markdown-to-PDF tool. Run after any USER_MANUAL.md edit:
//
//   cd backend && npm run build && node scripts/generate-user-manual-pdf.js
//
// (needs dist/services/pdfTable.js built fresh so table styling — and any
// future header/formatting changes made there for report exports — stays
// in sync with this document's tables).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const PDFDocument = require(path.join(ROOT, "backend/node_modules/pdfkit/js/pdfkit.js"));
const { renderPdfTable } = require(path.join(ROOT, "backend/dist/services/pdfTable.js"));

const MANUAL_PATH = path.join(ROOT, "USER_MANUAL.md");
const LOGO_PATH = path.join(ROOT, "backend/assets/vivid-edge-logo.png");
const OUT_PATH = path.join(ROOT, "USER_MANUAL.pdf");

const NAVY = "#1B4298";
const CYAN = "#00AEEF";
const TEXT = "#1F2937";
const MUTED = "#6B7280";
const LOGO_ASPECT_RATIO = 576 / 2000;

// ---------- markdown -> blocks ----------

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    // pdfkit's standard Helvetica/Courier fonts have no emoji glyphs — an
    // unsupported codepoint renders as a stray fallback mark (looked like a
    // loose apostrophe in the "Who can do what" table), not a blank or an
    // error, so it has to be swapped for plain text before it ever reaches
    // pdfkit rather than caught by any width/height calculation.
    .replace(/✅/g, "Yes");
}

function parseBlocks(md) {
  const lines = md.split("\n");
  const blocks = [];
  let i = 0;

  function isBlank(l) {
    return l.trim() === "";
  }

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i++;
      continue;
    }

    if (line.trim() === "---") {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      blocks.push({ type: "h" + h[1].length, text: decodeEntities(h[2].trim()) });
      i++;
      continue;
    }

    if (line.trim().startsWith("|")) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const rows = tableLines
        .filter((l) => !/^\|[\s:|-]+\|$/.test(l))
        .map((l) =>
          l
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((c) => decodeEntities(c.trim()))
        );
      blocks.push({ type: "table", header: rows[0], rows: rows.slice(1) });
      continue;
    }

    const bulletMatch = line.match(/^-\s+(.*)$/);
    const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (bulletMatch || orderedMatch) {
      const ordered = !!orderedMatch;
      const items = [];
      let itemText = ordered ? orderedMatch[2] : bulletMatch[1];
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (isBlank(l)) break;
        if (/^-\s+/.test(l) || /^\d+\.\s+/.test(l)) {
          items.push(decodeEntities(itemText));
          const m2 = l.match(/^-\s+(.*)$/) || l.match(/^\d+\.\s+(.*)$/);
          itemText = m2[1];
          i++;
          continue;
        }
        if (/^\s{2,}\S/.test(l)) {
          // indented continuation line — part of the current item
          itemText += " " + l.trim();
          i++;
          continue;
        }
        break;
      }
      items.push(decodeEntities(itemText));
      blocks.push({ type: ordered ? "olist" : "ulist", items });
      continue;
    }

    // paragraph: consecutive non-blank, non-special lines
    const paraLines = [line];
    i++;
    while (i < lines.length && !isBlank(lines[i]) && lines[i].trim() !== "---" && !/^#{1,3}\s/.test(lines[i]) && !lines[i].trim().startsWith("|") && !/^-\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", text: decodeEntities(paraLines.join(" ").trim()) });
  }

  return blocks;
}

// ---------- inline (bold / code) rendering ----------

function splitInline(text) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    const token = m[0];
    if (token.startsWith("**")) parts.push({ text: token.slice(2, -2), bold: true });
    else parts.push({ text: token.slice(1, -1), code: true });
    last = m.index + token.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

// Renders one logical line/paragraph of text with inline bold/code spans,
// as a single pdfkit "continued" chain so wrapped lines stay aligned to the
// box established by the first segment (x/width), giving a correct hanging
// indent for bullets without needing pdfkit's nonexistent list API.
function renderInline(doc, text, { x, width, size = 10.5, color = TEXT, lineGap = 2 } = {}) {
  // Emphasis is carried by COLOR, not font weight: pdfkit's "continued" text
  // mode (needed here to keep mixed-style runs on one wrapped line) only
  // honors the font() in effect at the start of a continued chain — a
  // font() call between segments is silently ignored for the rest of the
  // line, confirmed empirically (switching Helvetica -> Helvetica-Bold
  // mid-chain renders the whole line in whichever font came last, never
  // bold). fillColor() has no such issue; it applies per-segment correctly
  // even across a width-based first call, so bold markdown spans render in
  // navy instead of heavier weight.
  const segments = splitInline(text);
  doc.font("Helvetica").fontSize(size);
  segments.forEach((seg, idx) => {
    const fillColor = seg.bold || seg.code ? NAVY : color;
    doc.fillColor(fillColor);
    const isFirst = idx === 0;
    const isLast = idx === segments.length - 1;
    if (isFirst && x !== undefined) {
      doc.text(seg.text, x, doc.y, { width, continued: !isLast, lineGap });
    } else {
      doc.text(seg.text, { continued: !isLast, lineGap });
    }
  });
  doc.fillColor(TEXT);
}

// ---------- layout primitives ----------

function contentX() {
  return doc.page.margins.left;
}
function contentWidth() {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function ensureSpace(doc, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

// ---------- document build ----------

const md = fs.readFileSync(MANUAL_PATH, "utf8");
const blocks = parseBlocks(md);

const doc = new PDFDocument({ size: "A4", layout: "portrait", margins: { top: 60, bottom: 56, left: 56, right: 56 }, bufferPages: true });
const out = fs.createWriteStream(OUT_PATH);
doc.pipe(out);

// ---- cover page ----
const logoWidth = 160;
const pageCenterX = doc.page.width / 2;
doc.image(LOGO_PATH, pageCenterX - logoWidth / 2, 150, { width: logoWidth });
doc.y = 150 + logoWidth * LOGO_ASPECT_RATIO + 50;

doc.font("Helvetica-Bold").fontSize(34).fillColor(NAVY).text("TimeSync", { align: "center" });
doc.moveDown(0.3);
doc.font("Helvetica").fontSize(20).fillColor(MUTED).text("User Manual", { align: "center" });
doc.moveDown(1.2);

doc
  .moveTo(pageCenterX - 60, doc.y)
  .lineTo(pageCenterX + 60, doc.y)
  .lineWidth(2)
  .strokeColor(CYAN)
  .stroke();
doc.moveDown(1.2);

doc
  .font("Helvetica")
  .fontSize(12)
  .fillColor(TEXT)
  .text("Vivid Edge Integration COE — Timesheets, Approvals & Reporting", { align: "center" });
doc.moveDown(0.4);
doc
  .font("Helvetica")
  .fontSize(9.5)
  .fillColor(MUTED)
  .text(`Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, { align: "center" });

// The source's intro paragraphs (before the first ## heading) read as
// front matter for the whole guide — render them here, on the cover, rather
// than letting them flow onto the TOC page with nothing to stop them
// (every ## forces its own page, but these paragraphs precede the first
// one, so without this they'd render directly under the TOC title and
// visually overlap the TOC entries drawn there in the second pass).
const firstH2Index = blocks.findIndex((b) => b.type === "h2");
const preamble = blocks.slice(0, firstH2Index).filter((b) => b.type === "p");
const bodyBlocks = blocks.slice(firstH2Index);
doc.moveDown(2);
for (const block of preamble) {
  renderInline(doc, block.text, { size: 10, color: MUTED });
  doc.moveDown(0.6);
}

// ---- table of contents (reserve a page now, fill in after we know page numbers) ----
doc.addPage();
const tocPageIndex = doc.bufferedPageRange().count - 1;
doc.font("Helvetica-Bold").fontSize(18).fillColor(NAVY).text("Table of Contents");
doc.moveDown(1);

const tocEntries = [];

// ---- body ----
for (const block of bodyBlocks) {
  switch (block.type) {
    case "h1":
      // Title already shown on the cover — skip rendering it again in the body.
      break;

    case "h2": {
      doc.addPage();
      const pageNum = doc.bufferedPageRange().count;
      tocEntries.push({ level: 2, title: block.text, page: pageNum });
      doc.font("Helvetica-Bold").fontSize(17).fillColor(NAVY).text(block.text);
      doc
        .moveTo(contentX(), doc.y + 4)
        .lineTo(contentX() + contentWidth(), doc.y + 4)
        .lineWidth(1)
        .strokeColor(CYAN)
        .stroke();
      doc.moveDown(1);
      break;
    }

    case "h3": {
      ensureSpace(doc, 50);
      const pageNum = doc.bufferedPageRange().count;
      tocEntries.push({ level: 3, title: block.text, page: pageNum });
      doc.moveDown(0.4);
      doc.font("Helvetica-Bold").fontSize(12.5).fillColor(NAVY).text(block.text);
      doc.moveDown(0.5);
      break;
    }

    case "hr":
      // Section separators in the source map onto the forced page break at
      // each ## heading above — nothing extra to draw here.
      break;

    case "p":
      ensureSpace(doc, 20);
      renderInline(doc, block.text, { size: 10.5, color: TEXT });
      doc.moveDown(0.7);
      break;

    case "ulist":
    case "olist": {
      const indent = 16;
      block.items.forEach((item, idx) => {
        ensureSpace(doc, 20);
        const startY = doc.y;
        const marker = block.type === "olist" ? `${idx + 1}.` : "•";
        doc.font("Helvetica-Bold").fontSize(10.5).fillColor(NAVY).text(marker, contentX(), startY, { width: indent });
        doc.y = startY;
        renderInline(doc, item, { x: contentX() + indent, width: contentWidth() - indent, size: 10.5, color: TEXT });
        doc.moveDown(0.45);
      });
      doc.moveDown(0.3);
      break;
    }

    case "table": {
      ensureSpace(doc, 60);
      // renderPdfTable is the shared report-export renderer — it has no
      // concept of markdown, so a **bold** span would otherwise print as
      // literal asterisks in a cell instead of being parsed.
      const stripBold = (s) => s.replace(/\*\*([^*]+)\*\*/g, "$1");
      const rows = block.rows.map((r) => {
        const obj = {};
        block.header.forEach((h, i) => (obj[h] = stripBold(r[i] ?? "")));
        return obj;
      });
      renderPdfTable(doc, rows, 500);
      doc.moveDown(0.8);
      break;
    }
  }
}

// ---- fill in the TOC page now that every heading's page number is known ----
// Appends to the page's existing content stream below the "Table of
// Contents" title drawn in the first pass — doesn't erase it, since pdfkit
// page content is append-only. Row height is advanced manually (not via the
// title/page-number text() calls' own auto-advance) so drawing two text()
// calls on the same row doesn't double the vertical movement.
doc.switchToPage(tocPageIndex);
doc.y = 140;
for (const entry of tocEntries) {
  const indent = entry.level === 3 ? 18 : 0;
  const size = entry.level === 3 ? 10 : 11.5;
  const font = entry.level === 3 ? "Helvetica" : "Helvetica-Bold";
  const color = entry.level === 3 ? MUTED : TEXT;
  const rowHeight = entry.level === 3 ? 16 : 20;
  const y = doc.y;
  doc.font(font).fontSize(size).fillColor(color);
  doc.text(entry.title, contentX() + indent, y, { width: contentWidth() - indent - 50, continued: false, lineBreak: false, ellipsis: true });
  doc.text(String(entry.page), contentX(), y, { width: contentWidth(), align: "right", lineBreak: false });
  doc.y = y + rowHeight;
}

// ---- running footer on every content page (skip the cover) ----
// footerY deliberately sits inside the bottom margin reserve — but pdfkit's
// .text() treats page.margins.bottom as a hard boundary and silently calls
// addPage() whenever the given y is past it, even for an explicit x/y call.
// Shrinking the margin just for this draw (then restoring it) avoids that;
// drawing the separator line isn't affected since line-drawing ops don't go
// through the text-flow/pagination logic at all.
const range = doc.bufferedPageRange();
const realBottomMargin = doc.page.margins.bottom;
for (let i = range.start + 1; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  const footerY = doc.page.height - realBottomMargin + 22;
  doc
    .moveTo(doc.page.margins.left, footerY - 8)
    .lineTo(doc.page.width - doc.page.margins.right, footerY - 8)
    .lineWidth(0.5)
    .strokeColor("#E5E7EB")
    .stroke();
  doc.page.margins.bottom = 4;
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
  doc.text("TimeSync — User Manual", doc.page.margins.left, footerY, { width: contentWidth() / 2, align: "left" });
  doc.text(`Page ${i + 1}`, doc.page.width - doc.page.margins.right - contentWidth() / 2, footerY, {
    width: contentWidth() / 2,
    align: "right",
  });
  doc.page.margins.bottom = realBottomMargin;
}

doc.end();
out.on("finish", () => {
  console.log("Wrote " + OUT_PATH);
  console.log("Pages: " + doc.bufferedPageRange().count);
});
