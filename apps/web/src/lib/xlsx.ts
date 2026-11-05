import { Capacitor } from '@capacitor/core';

/* =========================================================================
   Minimal XLSX writer
   -------------------------------------------------------------------------
   Spreadsheet exports used to be CSV and JSON. Excel is what the people who
   read these files actually open, and a stray comma in a comment or a mode
   string is enough to shift every column in a CSV.

   This writes a real .xlsx workbook without adding a spreadsheet library. The
   format is a ZIP of XML parts; the ZIP is written with the "stored" method
   (no compression) so it stays small, dependency-free, and testable. Excel,
   LibreOffice and Google Sheets all open it.

   Strings are written as inline strings (`t="inlineStr"`), which avoids the
   shared-string table entirely. Numbers are written as numbers so they can be
   summed, charted and sorted in the spreadsheet rather than sorted as text.
   ========================================================================= */

export type XlsxCell = string | number | boolean | null | undefined;
export type XlsxSheet = { name: string; rows: XlsxCell[][] };

const encoder = new TextEncoder();

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

/** Standard CRC-32, as the ZIP central directory expects it. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let name = '';
  let value = index;
  while (value >= 0) {
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26) - 1;
  }
  return name;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cellXml(value: XlsxCell, reference: string): string {
  if (value === null || value === undefined || value === '') {
    return `<c r="${reference}"/>`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}"><v>${value}</v></c>`;
  }
  const text = typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : xmlEscape(String(value));
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet): string {
  const rows = sheet.rows
    .map((cells, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const contents = cells
        .map((value, columnIndex) => cellXml(value, `${columnName(columnIndex)}${rowNumber}`))
        .join('');
      return `<row r="${rowNumber}">${contents}</row>`;
    })
    .join('');
  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}

/** Excel rules: 31 characters, no []:*?/\, unique within the workbook. */
function safeSheetNames(sheets: XlsxSheet[]): string[] {
  const used = new Set<string>();
  return sheets.map((sheet, index) => {
    let base = sheet.name
      .replace(/[[\]:*?/\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!base) base = `Sheet${index + 1}`;
    base = base.slice(0, 31);
    let name = base;
    let suffix = 2;
    while (used.has(name.toLowerCase())) {
      const suffixText = ` (${suffix})`;
      name = `${base.slice(0, 31 - suffixText.length)}${suffixText}`;
      suffix += 1;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

function contentTypesXml(sheetCount: number): string {
  const overrides = Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');
  return (
    `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    `${overrides}</Types>`
  );
}

function rootRelsXml(): string {
  return (
    `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>'
  );
}

function workbookXml(names: string[]): string {
  const sheets = names
    .map(
      (name, index) =>
        `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join('');
  return (
    `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>${sheets}</sheets></workbook>`
  );
}

function workbookRelsXml(sheetCount: number): string {
  const relationships = Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join('');
  return (
    `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `${relationships}</Relationships>`
  );
}

type ZipEntry = { name: string; data: Uint8Array };

/** A stored-method ZIP container. Enough for the OOXML parts above. */
function zip(entries: ZipEntry[], now = new Date()): Uint8Array {
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date =
    (((now.getFullYear() - 1980) & 0x7f) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true); // UTF-8 names
    localView.setUint16(8, 0, true); // stored, no compression
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);
    localParts.push(local, entry.data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true); // extra length
    centralView.setUint16(32, 0, true); // comment length
    centralView.setUint16(34, 0, true); // disk number
    centralView.setUint16(36, 0, true); // internal attributes
    centralView.setUint32(38, 0, true); // external attributes
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);

    offset += local.length + entry.data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const total = offset + centralSize + end.length;
  const output = new Uint8Array(total);
  let position = 0;
  for (const part of [...localParts, ...centralParts, end]) {
    output.set(part, position);
    position += part.length;
  }
  return output;
}

/** Build the workbook bytes. Exposed for tests without a Blob. */
export function buildXlsxBytes(sheets: XlsxSheet[]): Uint8Array {
  if (sheets.length === 0) {
    throw new Error('An Excel workbook needs at least one sheet.');
  }
  const names = safeSheetNames(sheets);
  const files: ZipEntry[] = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml(sheets.length)) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml()) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml(names)) },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: encoder.encode(workbookRelsXml(sheets.length)),
    },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: encoder.encode(sheetXml(sheet)),
    })),
  ];
  return zip(files);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/** The MIME type Excel, LibreOffice and Google Sheets all accept. */
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function shareXlsx(filename: string, bytes: Uint8Array): Promise<void> {
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    await Filesystem.writeFile({
      path: filename,
      data: bytesToBase64(bytes),
      directory: Directory.Cache,
    });
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    await Share.share({ title: filename, url: uri });
  } catch (error) {
    console.error('Excel export failed:', error);
    throw new Error(
      'Could not export the spreadsheet. The file could not be written on this device.',
    );
  }
}

/**
 * Trigger an .xlsx download, or the native share sheet inside the APK.
 *
 * Mirrors `downloadCsv` in `lib/csv.ts`: `URL.createObjectURL` plus an anchor
 * click is silently ignored by the Android WebView, so native platforms write
 * the file and open the system share sheet instead.
 */
export async function downloadXlsx(filename: string, sheets: XlsxSheet[]): Promise<void> {
  const bytes = buildXlsxBytes(sheets);
  const name = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;

  if (Capacitor.isNativePlatform()) {
    await shareXlsx(name, bytes);
    return;
  }

  if (typeof document === 'undefined') return;

  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();

  // Revoking while the browser is still reading the blob cancels the
  // download. A workbook is larger than a CSV, and automated download clients
  // read it lazily, so hold the URL long enough that nothing is mid-read when
  // it is released. The page is not long-lived enough for the holding cost to
  // matter.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
