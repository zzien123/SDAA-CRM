import ExcelJS from "exceljs";
import Papa from "papaparse";

export type ParsedFile = { headers: string[]; rows: Record<string, unknown>[] };

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return (v as ExcelJS.CellFormulaValue).result ?? null;
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    if ("text" in v) return (v as ExcelJS.CellHyperlinkValue).text;
    if ("error" in v) return null;
  }
  return v;
}

export async function parseFile(buf: ArrayBuffer | Buffer, filename: string): Promise<ParsedFile> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const text = Buffer.from(buf as ArrayBuffer).toString("utf8");
    const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
    return { headers: (res.meta.fields ?? []).filter(Boolean), rows: res.data };
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return { headers: [], rows: [] };
    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    const colIdx: number[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      const h = String(cellValue(cell.value) ?? "").trim();
      if (h) { headers.push(h); colIdx.push(col); }
    });
    const rows: Record<string, unknown>[] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const rec: Record<string, unknown> = {};
      let any = false;
      headers.forEach((h, i) => {
        const v = cellValue(row.getCell(colIdx[i]).value);
        rec[h] = v;
        if (v !== null && v !== "") any = true;
      });
      // capture overflow cells beyond the header width (sign of a shifted row)
      const extra = row.cellCount > Math.max(...colIdx) ? cellValue(row.getCell(Math.max(...colIdx) + 1).value) : null;
      if (extra !== null && extra !== undefined && extra !== "") rec.__overflow = extra;
      if (any) rows.push(rec);
    });
    return { headers, rows };
  }
  throw new Error("Unsupported file type. Upload .xlsx or .csv");
}
