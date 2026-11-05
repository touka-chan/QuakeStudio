import { describe, expect, it } from 'vitest';

import { DEFAULT_BUILDING_CONFIG } from '@/config/templates';
import { buildResultSheets, xlsxFilename } from '@/lib/csv';
import { buildFeedbackSheets } from '@/lib/feedbackExport';
import type { GroundMotionConfig, SimulationResult } from '@/types';

function resultFixture(): SimulationResult {
  return {
    time: [0, 0.1],
    floorDisp: [
      [0, 0.001],
      [0, 0.002],
    ],
    peakDisp: [0.001, 0.002],
    maxDisp: 0.002,
    driftRatio: [
      [0, 0.001],
      [0, 0.001],
    ],
    maxDriftRatio: 0.001,
    periodsS: [0.5, 0.2],
    groundAccel: [0, 1],
    floorWeightsKN: [100, 100],
    floorDeadKN: [80, 80],
    floorLiveCountedKN: [20, 20],
    totalWeightKN: 200,
    floorMassesKg: [10, 10],
  };
}

const motion: GroundMotionConfig = {
  preset: 'custom',
  pgaG: 0.3,
  durationS: 20,
  dt: 0.01,
};

describe('feedback workbook', () => {
  it('writes responses as numbers plus a scale legend', () => {
    const sheets = buildFeedbackSheets({
      exportedAt: '2026-01-01T00:00:00.000Z',
      responses: [
        {
          submittedAt: '2026-01-01T00:00:00.000Z',
          participantId: 'P01',
          answers: Object.fromEntries(
            Array.from({ length: 10 }, (_, index) => [String(index + 1), 4]),
          ),
          score: 50,
          comments: 'Clear controls',
        },
      ],
    });

    expect(sheets.map((sheet) => sheet.name)).toEqual(['Summary', 'Responses', 'Scale']);
    const responses = sheets[1]!.rows;
    expect(responses[0]![0]).toBe('Submitted at');
    expect(responses[0]!.at(-1)).toBe('Q10');
    const row = responses[1]!;
    expect(row[1]).toBe('P01');
    expect(row[2]).toBe(50);
    expect(row[3]).toBe('Awful');
    expect(row.at(-1)).toBe(4);
    expect(sheets[2]!.rows[1]).toEqual([1, 'Strongly disagree']);
    expect(sheets[2]!.rows[5]).toEqual([5, 'Strongly agree']);
  });

  it('writes a blank answer as blank, not as a zero', () => {
    const sheets = buildFeedbackSheets({
      responses: [
        {
          submittedAt: '2026-01-01T00:00:00.000Z',
          answers: { '1': 4 },
          score: 50,
        },
      ],
    });
    const row = sheets[1]!.rows[1]!;
    expect(row.at(-1)).toBeNull();
  });
});

describe('simulation workbook', () => {
  it('separates metadata from the numeric time series', () => {
    const sheets = buildResultSheets(DEFAULT_BUILDING_CONFIG, motion, resultFixture());
    expect(sheets.map((sheet) => sheet.name)).toEqual(['Metadata', 'Response']);

    const metadata = sheets[0]!.rows.flat();
    expect(metadata).toContain('Peak displacement (mm)');
    expect(metadata).toContain(2);

    const response = sheets[1]!.rows;
    const floorCount = DEFAULT_BUILDING_CONFIG.floors;
    expect(response[0]).toHaveLength(1 + floorCount * 2 + 1);
    expect(response[0]![0]).toBe('time_s');
    expect(response[1]![0]).toBe(0);
    expect(typeof response[2]![0]).toBe('number');
  });

  it('names the file with the spreadsheet extension', () => {
    const filename = xlsxFilename(DEFAULT_BUILDING_CONFIG);
    expect(filename.endsWith('.xlsx')).toBe(true);
    expect(filename).not.toContain('.csv');
  });
});
