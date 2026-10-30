import type { NightDigest } from '../digest/types.js';

const missing = '—';

export function DigestPage({ night, digest }: { night: string; digest: NightDigest }) {
  return (
    <>
      <h1>digest · {night}</h1>
      {digest.badLines > 0 && (
        <p class="warn">{digest.badLines} malformed {digest.badLines === 1 ? 'line' : 'lines'}</p>
      )}
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th><th>owner</th><th>runs</th><th>retries</th>
              <th>last status</th><th>last error</th><th>first</th><th>last</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => {
              const warn = row.retries >= 3 || row.lastStatus === 'fail';
              return (
                <tr>
                  <td>{row.job}</td>
                  <td>{row.owner ?? missing}</td>
                  <td>{row.runs}</td>
                  <td class={row.retries >= 3 ? 'warn' : undefined}>{row.retries}</td>
                  <td class={row.lastStatus === 'fail' ? 'warn' : undefined}>{row.lastStatus}</td>
                  <td class={warn ? 'warn' : undefined}>{row.lastError ?? missing}</td>
                  <td>{row.firstAt || missing}</td>
                  <td>{row.lastAt || missing}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
