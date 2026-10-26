import { OCCUPANCY_COLORS, OCCUPANCY_IDS } from '@/config/engineeringAssumptions';
import { DRIFT_BANDS } from '@/lib/driftScale';

export function contentThemeCss(): string {
  const light: string[] = [];
  const dark: string[] = [];

  for (const id of OCCUPANCY_IDS) {
    light.push(`--load-${id}: ${escape(OCCUPANCY_COLORS[id].colorLight)};`);
    dark.push(`--load-${id}: ${escape(OCCUPANCY_COLORS[id].colorDark)};`);
  }

  DRIFT_BANDS.forEach((band, index) => {
    light.push(`--drift-${index + 1}: ${escape(band.colorLight)};`);
    dark.push(`--drift-${index + 1}: ${escape(band.colorDark)};`);
  });

  return `:root {\n  ${light.join('\n  ')}\n}\n.dark {\n  ${dark.join('\n  ')}\n}\n`;
}

function escape(value: string): string {
  return value.replace(/[<>&]/g, '');
}
