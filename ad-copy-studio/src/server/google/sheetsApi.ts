// Live Google Sheets gateway (REST v4 over fetch). Reads use FORMATTED_VALUE; writes use RAW so text is
// never interpreted as a formula, and only the exact cells listed are touched (formatting untouched).
import 'server-only';
import { config } from '../config';
import { getAccessToken } from './auth';
import { SheetError, type CellRead, type CellWrite, type SheetGateway } from '../sheets/gateway';
import { quoteTab } from '../sheets/a1';
import type { RawWorkbook } from '../workbook/types';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

async function call(url: string, init?: RequestInit): Promise<any> {
  const token = await getAccessToken();
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  } catch {
    throw new SheetError('network', 'Could not reach the Google Sheets API. Check your internet connection.', true);
  }
  if (res.ok) return res.json();
  let detail = '';
  try { detail = (await res.json())?.error?.message ?? ''; } catch { /* ignore */ }
  if (res.status === 401) throw new SheetError('auth_expired', 'Google rejected the authorization (expired or revoked). Sign in again.');
  if (res.status === 403) throw new SheetError('permission', `No permission for this workbook with the connected account. ${detail}`.trim());
  if (res.status === 404) throw new SheetError('not_found', 'Workbook not found. Check GOOGLE_SHEET_ID and sharing.');
  if (res.status === 429) throw new SheetError('rate_limited', 'Google rate limit reached. Wait a minute and retry.', true);
  if (res.status >= 500) throw new SheetError('server', `Google Sheets returned ${res.status}. Retry shortly.`, true);
  throw new SheetError('invalid', `Google Sheets request failed (${res.status}). ${detail}`.trim());
}

export class GoogleSheetsGateway implements SheetGateway {
  readonly mode = 'google' as const;
  get canWrite() { return config.googleAccess === 'readwrite'; }
  describe() { return 'Live Google Sheet'; }

  async readWorkbook(): Promise<RawWorkbook> {
    const id = encodeURIComponent(config.spreadsheetId);
    const meta = await call(`${BASE}/${id}?fields=properties.title,sheets.properties(sheetId,title)`);
    const sheets: { sheetId: number; title: string }[] = meta.sheets.map((s: any) => s.properties);
    const params = new URLSearchParams({ valueRenderOption: 'FORMATTED_VALUE', majorDimension: 'ROWS' });
    for (const s of sheets) params.append('ranges', `${quoteTab(s.title)}!A1:Z400`);
    const data = await call(`${BASE}/${id}/values:batchGet?${params}`);
    const tabs: RawWorkbook['tabs'] = {};
    sheets.forEach((s, i) => { tabs[s.title] = { sheetId: s.sheetId, values: (data.valueRanges[i]?.values ?? []).map((r: unknown[]) => r.map((c) => String(c ?? ''))) }; });
    return { spreadsheetId: config.spreadsheetId, title: meta.properties.title, tabs, readAt: new Date().toISOString(), origin: 'google' };
  }

  async readCells(refs: string[]): Promise<CellRead[]> {
    if (!refs.length) return [];
    const id = encodeURIComponent(config.spreadsheetId);
    const params = new URLSearchParams({ fields: 'sheets.data(startRow,startColumn,rowData.values(userEnteredValue,formattedValue))' });
    for (const r of refs) params.append('ranges', r);
    const data = await call(`${BASE}/${id}?${params}`);
    // One data block per requested range, in request order (flattened across sheets).
    const blocks: any[] = [];
    for (const s of data.sheets ?? []) for (const d of s.data ?? []) blocks.push(d);
    if (blocks.length !== refs.length) throw new SheetError('invalid', 'Unexpected response shape when reading cells.');
    return refs.map((ref, i) => {
      const v = blocks[i]?.rowData?.[0]?.values?.[0];
      const uev = v?.userEnteredValue ?? {};
      return { ref, value: v?.formattedValue ?? '', formula: typeof uev.formulaValue === 'string' ? uev.formulaValue : null };
    });
  }

  async writeCells(writes: CellWrite[]): Promise<void> {
    if (!this.canWrite) throw new SheetError('read_only', 'The connection is read-only (GOOGLE_ACCESS=readonly).');
    const id = encodeURIComponent(config.spreadsheetId);
    await call(`${BASE}/${id}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data: writes.map((w) => ({ range: w.ref, majorDimension: 'ROWS', values: [[w.value]] })) }),
    });
  }
}
