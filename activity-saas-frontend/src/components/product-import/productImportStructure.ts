import * as XLSX from 'xlsx';
import type { ImportIssue } from './productImport';

function distance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[right.length];
}

export function inspectImportHeaders(sheet: string, columns: string[], allowed: readonly string[], required: readonly string[], headerRow: number): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const used = new Set<string>();
  columns.forEach((field, index) => {
    const cell = XLSX.utils.encode_cell({ r: headerRow - 1, c: index });
    if (used.has(field)) issues.push({ sheet, row: headerRow, cell, field, message: `Duplicate column header: ${field}.`, correction: 'Keep one column with this name. Remove or rename the duplicate column.', fatal: true });
    used.add(field);
    if (allowed.includes(field)) return;
    const nearest = [...allowed].sort((a, b) => distance(field.toLowerCase(), a.toLowerCase()) - distance(field.toLowerCase(), b.toLowerCase()))[0];
    const suggestion = nearest && distance(field.toLowerCase(), nearest.toLowerCase()) <= 3 ? nearest : undefined;
    issues.push({ sheet, row: headerRow, cell, field, value: field, message: field ? `Unknown column header: ${field}.` : 'A column header is blank.', correction: suggestion ? `Rename this column to ${suggestion}. Use the exact template header.` : 'Restore the column headers from a fresh template. Remove extra columns rather than leaving a blank header.', fatal: true });
  });
  for (const field of required) {
    if (!columns.includes(field)) issues.push({ sheet, row: headerRow, field, message: `Missing required column: ${field}.`, correction: `Add ${field} to header row ${headerRow}, or download a fresh template and copy your data into it.`, fatal: true });
  }
  return issues;
}

export function importSheetHeaders(workbook: XLSX.WorkBook, sheet: string, headerRow: number): string[] {
  const ws = workbook.Sheets[sheet];
  if (!ws) return [];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const fields = Array.from({ length: range.e.c + 1 }, (_, column) => String(ws[XLSX.utils.encode_cell({ r: headerRow - 1, c: column })]?.v ?? ''));
  let last = -1;
  fields.forEach((field, index) => { if (field !== '') last = index; });
  for (const [address, cell] of Object.entries(ws)) {
    if (!/^[A-Z]+\d+$/.test(address) || cell?.v === undefined || cell?.v === null || cell?.v === '') continue;
    const position = XLSX.utils.decode_cell(address);
    if (position.r >= headerRow) last = Math.max(last, position.c);
  }
  return fields.slice(0, last + 1);
}
