// Verifies the manifest hashes against the files in this checkout (no network, no hosted effects).
import { readFileSync } from 'node:fs'; import { createHash } from 'node:crypto';
const m = JSON.parse(readFileSync(new URL('./MANIFEST.V533.json', import.meta.url)));
const f = { M1: '../../proposals/V515/assist_authority.CANDIDATE.sql', M2: '../../proposals/V523/capture.CANDIDATE.sql', M3: '../../proposals/V523/audio_backup.CANDIDATE.sql', M4: '../../proposals/V525/admin_preservation.CANDIDATE.sql', reenable: '../../proposals/V525/reenable.sql', rollback: '../../proposals/V525/rollback.NON-DESTRUCTIVE.sql', verify: './sql/post-apply-verify.V527.READ-ONLY.sql' };
let bad = 0; for (const [k, p] of Object.entries(f)) { const h = createHash('sha256').update(readFileSync(new URL(p, import.meta.url))).digest('hex'); if (h !== m.sql[k]) { bad++; console.error('MISMATCH', k); } }
if (bad) process.exit(1); console.log('manifest OK', Object.keys(f).length, 'files');
