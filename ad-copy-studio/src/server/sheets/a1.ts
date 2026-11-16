// A1 helpers. Tab names are always quoted so names with spaces/apostrophes are safe.
import { colLetter } from '../workbook/parse';

export function quoteTab(tab: string): string {
  return `'${tab.replace(/'/g, "''")}'`;
}
export function a1(tab: string, colIndex: number, row: number): string {
  return `${quoteTab(tab)}!${colLetter(colIndex)}${row}`;
}
export function parseA1(ref: string): { tab: string; col: number; row: number } {
  const m = /^'((?:[^']|'')+)'!([A-Z]+)(\d+)$/.exec(ref) ?? /^([^!]+)!([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`Unsupported cell reference: ${ref}`);
  const tab = m[1].replace(/''/g, "'");
  let col = 0;
  for (const ch of m[2]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { tab, col: col - 1, row: Number(m[3]) };
}
