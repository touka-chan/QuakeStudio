import { describe, expect, it } from 'vitest';

import { buildXlsxBytes, columnName, crc32 } from '@/lib/xlsx';

/*
 * The XLSX writer is hand-rolled, so the container itself is the risk. These
 * tests check the parts Excel is strict about: the ZIP signatures, the central
 * directory offsets, XML escaping, and numbers staying numbers.
 */

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function findSignature(bytes: Uint8Array, signature: number): number {
  for (let offset = 0; offset + 4 <= bytes.length; offset += 1) {
    if (view(bytes).getUint32(offset, true) === signature) return offset;
  }
  return -1;
}

function decoder(): TextDecoder {
  return new TextDecoder();
}

describe('xlsx writer', () => {
  it('matches the published CRC-32 check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('names columns the way Excel does', () => {
    expect(columnName(0)).toBe('A');
    expect(columnName(25)).toBe('Z');
    expect(columnName(26)).toBe('AA');
    expect(columnName(51)).toBe('AZ');
    expect(columnName(52)).toBe('BA');
  });

  it('builds a stored ZIP with the OOXML parts and valid central directory', () => {
    const bytes = buildXlsxBytes([
      {
        name: 'Responses',
        rows: [
          ['Name', 'Score'],
          ['Ada', 50],
        ],
      },
    ]);

    expect(view(bytes).getUint32(0, true)).toBe(0x04034b50);

    const end = findSignature(bytes, 0x06054b50);
    expect(end, 'end of central directory should exist').toBeGreaterThan(-1);
    const entries = view(bytes).getUint16(end + 10, true);
    expect(entries).toBe(5); // content types, root rels, workbook, workbook rels, sheet

    const centralOffset = view(bytes).getUint32(end + 16, true);
    expect(view(bytes).getUint32(centralOffset, true)).toBe(0x02014b50);

    const nameLength = view(bytes).getUint16(centralOffset + 28, true);
    const name = decoder().decode(
      bytes.subarray(centralOffset + 46, centralOffset + 46 + nameLength),
    );
    expect(name).toBe('[Content_Types].xml');

    const localOffset = view(bytes).getUint32(centralOffset + 42, true);
    expect(view(bytes).getUint32(localOffset, true)).toBe(0x04034b50);

    const xml = decoder().decode(bytes);
    expect(xml).toContain('/xl/worksheets/sheet1.xml');
    expect(xml).toContain('<t xml:space="preserve">Ada</t>');
    expect(xml).toContain('<v>50</v>');
  });

  it('escapes XML characters in text and keeps numbers numeric', () => {
    const bytes = buildXlsxBytes([
      { name: 'A&B <sheet>', rows: [['<tag>', '&', '"quoted"', 12.5]] },
    ]);
    const xml = decoder().decode(bytes);
    expect(xml).toContain('&lt;tag&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;quoted&quot;');
    expect(xml).toContain('<v>12.5</v>');
  });

  it('makes sheet names unique and strips characters Excel rejects', () => {
    const bytes = buildXlsxBytes([
      { name: 'Report/2026', rows: [[1]] },
      { name: 'Report/2026', rows: [[2]] },
    ]);
    const xml = decoder().decode(bytes);
    expect(xml).toContain('name="Report 2026"');
    expect(xml).toContain('name="Report 2026 (2)"');
    expect(xml).not.toContain('Report/2026');
  });
});
