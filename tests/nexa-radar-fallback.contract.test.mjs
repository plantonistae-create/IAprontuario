import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=source.indexOf('function startRadarChunkFallback(');
const end=source.indexOf('function stopRealtimeRadar(',start);
assert.ok(start>=0&&end>start,'chunk fallback implementation must exist');
const fallback=source.slice(start,end);
assert.doesNotMatch(fallback,/radarFallbackActive=true;[^\n]*radarTransportStatus\('stale'\)/,
 'Switching to chunk mode with no lost speech must not permanently report an incomplete transcript');
assert.match(fallback,/radarTransportStatus\('stale'\)/,
 'A truly overflowing speech chunk queue must continue to signal lost evidence');
assert.match(fallback,/radarTransportStatus\('unavailable'\)/,
 'Failed chunk transcription must continue to signal incomplete evidence');
assert.match(fallback,/radarTransportStatus\(sessionPaused\?'paused':'connecting'\)/,
 'Fallback must communicate reconnection without guessing speech was lost');
console.log('Radar WebRTC→chunk fallback: no false stale state, real loss remains explicit: PASS');
