import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('readNight', () => {
  let runsDir: string;

  beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-reader-')); });
  afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

  const event = (overrides: Record<string, unknown> = {}) => ({
    at: '2026-10-29T01:00:00+01:00', job: 'test/job', status: 'ok', owner: 'rook', ...overrides,
  });
  function writeEvents(events: unknown[]) {
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), events.map((value) => JSON.stringify(value)).join('\n'));
  }

  it('reads the real night as five sorted jobs and one bad line', () => {
    const fixtureDir = fileURLToPath(new URL('../runs/', import.meta.url));
    const digest = readNight(fixtureDir, '2026-10-28');
    expect(digest?.badLines).toBe(1);
    expect(digest?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows[0]).toEqual({
      job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
      firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
    });
    expect(digest?.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(digest?.rows[2]).toMatchObject({ runs: 8, retries: 1, lastError: 'lock held', lastStatus: 'ok' });
    expect(digest?.rows[3]).toMatchObject({ runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('distinguishes missing files from empty nights', () => {
    expect(readNight(runsDir, '2026-10-28')).toBeNull();
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), ' \n\r\n');
    expect(readNight(runsDir, '2026-10-28')).toEqual({ rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('counts malformed and schema-invalid lines while retaining valid rows', () => {
    const invalid = [null, [], 7, {}, event({ at: 'yesterday' }), event({ at: '2026-10-29' }),
      event({ job: '' }), event({ job: 5 }), event({ status: 'unknown' }), event({ owner: 7 }),
      event({ owner: undefined }), event({ error: null })];
    const path = join(runsDir, '2026-10-28.jsonl');
    writeFileSync(path, '\r\n{broken\r\n' + [...invalid, event({ owner: null })].map((value) => JSON.stringify(value)).join('\r\n') + '\r\n');
    const digest = readNight(runsDir, '2026-10-28');
    expect(digest?.badLines).toBe(invalid.length + 1);
    expect(digest?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
    expect(digest?.rows).toHaveLength(1);
    expect(digest?.rows[0].owner).toBeNull();
  });

  it('uses chronological events across offsets and preserves the latest nonempty error', () => {
    writeEvents([
      event({ at: '2026-10-29T04:00:00+02:00', owner: null }),
      event({ at: '2026-10-29T02:30:00+01:00', status: 'retry', error: 'latest error' }),
      event({ at: '2026-10-29T03:45:00+02:00', status: 'retry', error: '   ' }),
      event({ at: '2026-10-29T02:00:00+01:00', status: 'fail', error: 'earlier error' }),
    ]);
    expect(readNight(runsDir, '2026-10-28')?.rows[0]).toEqual({
      job: 'test/job', owner: null, runs: 4, retries: 2, lastStatus: 'ok', lastError: 'latest error',
      firstAt: '2026-10-29T02:00:00+01:00', lastAt: '2026-10-29T04:00:00+02:00',
    });
  });

  it('uses line order to break timestamp ties and retains errors after recovery', () => {
    writeEvents([event({ status: 'fail', error: 'first' }), event({ status: 'retry', error: 'second' }), event({ error: '' })]);
    expect(readNight(runsDir, '2026-10-28')?.rows[0]).toMatchObject({ runs: 3, retries: 1, lastStatus: 'ok', lastError: 'second' });
  });

  it('rejects path-like night parameters and propagates other I/O failures', () => {
    for (const night of ['../2026-10-28', '/2026-10-28', '2026-10-28.jsonl', '2026-10-28\0']) {
      expect(readNight(runsDir, night)).toBeNull();
    }
    mkdirSync(join(runsDir, '2026-10-28.jsonl'));
    expect(() => readNight(runsDir, '2026-10-28')).toThrow();
  });
});
