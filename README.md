# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER for the review copy
pnpm install
pnpm dev               # serves http://localhost:8787
```

To save the digest page for review, keep the rig running and write the HTML outside this repo:

```sh
node scripts/export-digest.mjs http://localhost:8787/digest/2026-10-28 /tmp/digest-2026-10-28.html
```

The export command preserves the server response as one HTML file. Keep preview files out of git.
After review, and only after human approval of the cleanup/publish step, set `LANE_MARKER=` in
`.env`, restart the rig, and export the same page again to upload over the same public URL. Do not
publish the marker-free copy until that approval is given.

Working on it with an agent: start at [AGENTS.md](AGENTS.md).
