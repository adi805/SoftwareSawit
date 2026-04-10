declare module 'xlsx' {
  export interface WorkBook {
    SheetNames: string[];
    Sheets: { [sheet: string]: WorkSheet };
  }

  export interface WorkSheet {
    [cell: string]: CellObject | Range | undefined;
    '!cols'?: ColInfo[];
    '!rows'?: RowInfo[];
    '!merges'?: Range[];
  }

  export interface CellObject {
    t: string;
    v: string | number | boolean | Date;
    w?: string;
    f?: string;
  }

  export interface Range {
    s: { c: number; r: number };
    e: { c: number; r: number };
  }

  export interface ColInfo {
    wch?: number;
    width?: number;
  }

  export interface RowInfo {
    hpt?: number;
    height?: number;
  }

  export interface ParsedCell {
    v: string | number | boolean | Date;
    t: string;
    w?: string;
  }

  export interface Sheet2JSONOpts {
    header?: number | string | string[];
    defval?: any;
    blankrows?: boolean;
  }

  export const utils: {
    json_to_sheet: (data: any[], opts?: any) => WorkSheet;
    sheet_to_json: <T = any>(sheet: WorkSheet, opts?: Sheet2JSONOpts) => T[];
    book_new: () => WorkBook;
    book_append_sheet: (workbook: WorkBook, worksheet: WorkSheet, name: string) => void;
  };

  export function read(data: Uint8Array | ArrayBuffer, opts?: any): WorkBook;
  export function writeFile(workbook: WorkBook, filename: string, options?: any): void;
}
