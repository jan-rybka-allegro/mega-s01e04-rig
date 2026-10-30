import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};

const tempDirs: string[] = [];

function makeRunsDir() {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('digest routes', () => {
  it('renders the lane banner and sorted digest rows, with warnings and missing owners', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(
      join(runsDir, '2026-10-28.jsonl'),
      [
        JSON.stringify({ at: '2026-10-28T08:02:00+01:00', job: 'zeta', status: 'fail', owner: 'Zoe', error: 'timeout' }),
        JSON.stringify({ at: '2026-10-28T08:00:00+01:00', job: 'alpha', status: 'ok', owner: null }),
        JSON.stringify({ at: '2026-10-28T08:01:00+01:00', job: 'retrying', status: 'retry', owner: 'Rae', error: 'busy' }),
        JSON.stringify({ at: '2026-10-28T08:03:00+01:00', job: 'retrying', status: 'retry', owner: 'Rae', error: 'busy' }),
        JSON.stringify({ at: '2026-10-28T08:04:00+01:00', job: 'retrying', status: 'retry', owner: 'Rae', error: 'busy' }),
      ].join('\n'),
    );
    process.env.LANE_MARKER = 'DIGEST-TEST-MARKER';

    const response = await createApp({ ...config, runsDir }).request('/digest/2026-10-28');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('DIGEST-TEST-MARKER');
    expect(html).toContain('2026-10-28');
    expect(html).toContain('alpha');
    expect(html).toContain('—');
    expect(html).toContain('1');
    expect(html).toContain('3');
    expect(html).toContain('retry');
    expect(html).toContain('fail');
    expect(html).toContain('timeout');
    expect(html).toContain('2026-10-28T08:00:00+01:00');
    expect(html).toContain('2026-10-28T08:04:00+01:00');
    expect(html).toContain('class="warn"');
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('retrying'));
    expect(html.indexOf('retrying')).toBeLessThan(html.indexOf('zeta'));
  });

  it('returns the full sorted digest as JSON with the same job order as the page', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(
      join(runsDir, '2026-10-28.jsonl'),
      [
        JSON.stringify({ at: '2026-10-28T08:01:00+01:00', job: 'zeta', status: 'ok', owner: 'Zoe' }),
        JSON.stringify({ at: '2026-10-28T08:00:00+01:00', job: 'alpha', status: 'ok', owner: 'Ari' }),
      ].join('\n'),
    );
    const app = createApp({ ...config, runsDir });

    const [pageResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    const html = await pageResponse.text();
    const digest = await jsonResponse.json();

    expect(pageResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(digest).toMatchObject({
      rows: [
        {
          job: 'alpha', owner: 'Ari', runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T08:00:00+01:00', lastAt: '2026-10-28T08:00:00+01:00',
        },
        {
          job: 'zeta', owner: 'Zoe', runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T08:01:00+01:00', lastAt: '2026-10-28T08:01:00+01:00',
        },
      ],
      badLines: 0,
      counts: { ok: 2, retry: 0, fail: 0 },
    });
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
    expect(digest.rows.map((row: { job: string }) => row.job)).toEqual(['alpha', 'zeta']);
  });

  it('renders an empty file as nothing ran and exposes malformed lines in both routes', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(join(runsDir, '2026-10-27.jsonl'), '');
    writeFileSync(join(runsDir, '2026-10-26.jsonl'), 'not-json\n');
    const app = createApp({ ...config, runsDir });

    const emptyResponse = await app.request('/digest/2026-10-27');
    const emptyHtml = await emptyResponse.text();
    const badPageResponse = await app.request('/digest/2026-10-26');
    const badHtml = await badPageResponse.text();
    const badJsonResponse = await app.request('/api/digest/2026-10-26');
    const badDigest = await badJsonResponse.json();

    expect(emptyResponse.status).toBe(200);
    expect(emptyHtml).toContain('nothing ran');
    expect(badPageResponse.status).toBe(200);
    expect(badHtml).toContain('1 malformed line');
    expect(badHtml).toContain('1');
    expect(badJsonResponse.status).toBe(200);
    expect(badDigest).toMatchObject({ rows: [], badLines: 1, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('returns 404 for a night with no run file on both routes', async () => {
    const app = createApp({ ...config, runsDir: makeRunsDir() });

    const [pageResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2099-01-01'),
      app.request('/api/digest/2099-01-01'),
    ]);

    expect(pageResponse.status).toBe(404);
    expect(jsonResponse.status).toBe(404);
  });
});
