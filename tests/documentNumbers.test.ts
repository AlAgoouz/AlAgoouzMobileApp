import { expect, it } from 'vitest';
import {
  documentNumberPrefix,
  nextSequentialNumber,
} from '../src/lib/documentNumbers';

it('builds production and stocktaking prefixes from the business year', () => {
  expect(documentNumberPrefix('production', '2027-01-02')).toBe('PRD-2027');
  expect(documentNumberPrefix('stocktaking', '2030-12-31')).toBe('AUD-2030');
  expect(() => documentNumberPrefix('production', '2026-1-2')).toThrow(
    'تاريخ العمل غير صالح',
  );
});

it('continues after the highest existing serial even across a year change', () => {
  expect(
    nextSequentialNumber(
      ['PRD-2026-15', 'PRD-2025-8', 'PRD-2026-16'],
      'PRD-2027',
      15,
    ),
  ).toBe('PRD-2027-17');
  expect(nextSequentialNumber([], 'AUD-2027', 2)).toBe('AUD-2027-3');
  expect(
    nextSequentialNumber(['AUD-2026-3', 'AUD-2026-2'], 'AUD-2026', 2),
  ).toBe('AUD-2026-4');
});
