// The only interface the rest of the app uses to talk to "the Sheet". Implementations:
//   google   — the live workbook through the Sheets API (server-side credentials)
//   snapshot — a read-only, dated copy of real workbook values (seed/workbook-snapshot.json)
//   sandbox  — a local, writable practice copy that emulates the workbook's formulas
import type { RawWorkbook } from '../workbook/types';

export type GatewayMode = 'google' | 'snapshot' | 'sandbox';

export interface CellRead {
  ref: string; // quoted A1, e.g. 'Source copy'!E9
  value: string; // displayed value
  formula: string | null; // user-entered formula if the cell holds one
}

export interface CellWrite {
  ref: string;
  value: string; // written RAW (never interpreted as a formula)
}

export interface SheetGateway {
  readonly mode: GatewayMode;
  readonly canWrite: boolean;
  describe(): string;
  readWorkbook(): Promise<RawWorkbook>;
  readCells(refs: string[]): Promise<CellRead[]>;
  writeCells(writes: CellWrite[]): Promise<void>;
}

export type SheetErrorKind =
  | 'not_configured' | 'auth_required' | 'auth_expired' | 'permission' | 'not_found'
  | 'rate_limited' | 'network' | 'read_only' | 'invalid' | 'server' | 'unknown';

export class SheetError extends Error {
  constructor(public kind: SheetErrorKind, message: string, public retryable = false) {
    super(message);
    this.name = 'SheetError';
  }
}

export function describeError(e: unknown): { kind: SheetErrorKind; message: string; retryable: boolean } {
  if (e instanceof SheetError) return { kind: e.kind, message: e.message, retryable: e.retryable };
  const msg = e instanceof Error ? e.message : String(e);
  return { kind: 'unknown', message: msg, retryable: false };
}
