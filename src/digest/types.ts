export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  /** All valid events for this job, including retries and failures. */
  runs: number;
  /** Events whose status is retry. */
  retries: number;
  lastStatus: RunStatus;
  /** Most recent nonempty error, even when a later event succeeds. */
  lastError: string | null;
  /** Earliest/latest event timestamps, preserving their original offsets. */
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  /** One row per job, sorted by job name. */
  rows: DigestRow[];
  /** Malformed JSON or schema-invalid nonempty lines. */
  badLines: number;
  /** Counts of valid events, not counts of jobs' final statuses. */
  counts: Record<RunStatus, number>;
};

/** Missing files and invalid night names return null; other I/O errors propagate. */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
