import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isRunEvent(value: unknown): value is RunEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.at === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(event.at) &&
    Number.isFinite(Date.parse(event.at)) &&
    typeof event.job === 'string' &&
    event.job.trim().length > 0 &&
    (event.status === 'ok' || event.status === 'retry' || event.status === 'fail') &&
    (typeof event.owner === 'string' || event.owner === null) &&
    (event.error === undefined || typeof event.error === 'string')
  );
}

export const readNight: ReadNight = (runsDir, night) => {
  // A route parameter must never select a file outside the runs directory.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const digest: NightDigest = { rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
  const jobs = new Map<string, {
    row: DigestRow;
    firstTime: number;
    lastTime: number;
    errorTime: number;
  }>();

  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim()) continue;

    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      digest.badLines++;
      continue;
    }
    if (!isRunEvent(event)) {
      digest.badLines++;
      continue;
    }

    digest.counts[event.status]++;
    const time = Date.parse(event.at);
    let job = jobs.get(event.job);
    if (!job) {
      job = {
        row: {
          job: event.job,
          owner: event.owner,
          runs: 0,
          retries: 0,
          lastStatus: event.status,
          lastError: null,
          firstAt: event.at,
          lastAt: event.at,
        },
        firstTime: time,
        lastTime: time,
        errorTime: -Infinity,
      };
      jobs.set(event.job, job);
    }

    job.row.runs++;
    if (event.status === 'retry') job.row.retries++;
    if (time < job.firstTime) {
      job.firstTime = time;
      job.row.firstAt = event.at;
    }
    // Equal timestamps use the last line as the latest event.
    if (time >= job.lastTime) {
      job.lastTime = time;
      job.row.lastAt = event.at;
      job.row.lastStatus = event.status;
      job.row.owner = event.owner;
    }
    if (event.error?.trim() && time >= job.errorTime) {
      job.errorTime = time;
      job.row.lastError = event.error;
    }
  }

  digest.rows = [...jobs.values()]
    .map(({ row }) => row)
    .sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return digest;
};
