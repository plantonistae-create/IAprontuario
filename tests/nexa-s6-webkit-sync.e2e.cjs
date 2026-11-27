'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { createServer } = require('node:http');
const path = require('node:path');
const { webkit } = require('playwright');
const root = path.resolve(__dirname, '..');
const owner = '11111111-1111-4111-8111-111111111111';
const encounter = '00000000-0000-4000-8000-000000000201';
const fixture = '/tests/fixtures/nexa-conflict-browser.html';
const assets = new Map([
  [fixture, 'text/html'],
  ['/nexa-encounter-autosave-v18.10.1.js', 'application/javascript'],
  ['/nexa-encounter-conflicts-v18.10.2.js', 'application/javascript'],
]);

function installTransport() {
  window.nexaClinicalSupabase18101 = {
    from(name) {
      if (name !== 'consultation_history') throw Error('Unexpected table');
      const request = { filters: {} };
      const execute = () => fetch('/synthetic-sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
      }).then(r => r.json());
      const builder = {
        select() { request.operation ||= 'select'; return builder; },
        insert(payload) { Object.assign(request, { operation: 'insert', payload }); return builder; },
        update(payload) { Object.assign(request, { operation: 'update', payload }); return builder; },
        eq(key, value) { request.filters[key] = value; return builder; },
        single: execute,
        maybeSingle: execute,
      };
      return builder;
    },
  };
}

async function check() {
  let drop = false, transportDrops = 0, inserts = 0, updates = 0;
  const rows = new Map();
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/synthetic-sync' && req.method === 'POST') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const { operation, filters, payload } = JSON.parse(Buffer.concat(chunks));
        if (drop) {
          transportDrops++;
          req.socket.destroy();
          return;
        }
        const id = payload?.id ?? filters.id;
        const row = rows.get(id);
        const matches = row && Object.entries(filters).every(([key, value]) => row[key] === value);
        const response = { data: null, error: null };
        if (operation === 'select' && matches) response.data = row;
        if (operation === 'insert' && row) response.error = { code: '23505' };
        if ((operation === 'insert' && !row) || (operation === 'update' && matches)) {
          const revision = row ? row.sync_version + 1 : 0;
          response.data = { ...payload, sync_version: revision, updated_at: new Date().toISOString() };
          rows.set(id, response.data);
          if (row) updates++;
          else inserts++;
        }
        return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(response));
      }
      const type = assets.get(req.url);
      if (req.method !== 'GET' || !type) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': type }).end(await fs.readFile(path.join(root, '.' + req.url)));
    } catch {
      res.destroy();
    }
  });

  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await webkit.launch({ headless: true });
    const page = async () => {
      const context = await browser.newContext({ serviceWorkers: 'block',
        proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1' } });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin
        ? route.continue() : route.abort('blockedbyclient'));
      const tab = await context.newPage();
      tab.setDefaultTimeout(12000);
      await tab.goto(origin + fixture);
      await tab.evaluate(installTransport);
      return tab;
    };
    const a = await page();
    const draft = {
      encounter_id: encounter, owner_user_id: owner, fields: { hda: 'Sintético inicial para reconexão' },
      encounter_state: 'draft', legacy_status: 'draft', sync_state: 'pending', sync_version: 0,
      local_revision: 1, last_client_saved_at: new Date().toISOString(),
    };
    drop = true;
    const lost = await a.evaluate(async rec => {
      const api = window.nexaEncounterAutosave18101;
      await api.put(rec);
      return api.syncOne(rec);
    }, draft);
    assert.equal(lost.sent, false);
    assert.equal(lost.item.sync_state, 'pending');
    assert(lost.item.next_attempt_at);
    assert.equal(lost.item.fields.hda, draft.fields.hda);
    assert(transportDrops > 0);
    assert.equal(rows.size, 0);
    console.log('PASS WebKit transport drop keeps the draft pending in IndexedDB');

    drop = false;
    await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(lost.item.next_attempt_at) - Date.now()) + 100));
    const reconnected = await a.evaluate(async id => {
      const api = window.nexaEncounterAutosave18101;
      window.dispatchEvent(new Event('online'));
      const pair = await Promise.all([api.flush('s6-reconnect'), api.flush('s6-duplicate')]);
      return { pair, local: await api.get(id) };
    }, encounter);
    assert.equal(inserts, 1);
    assert.equal(reconnected.local.sync_state, 'synced');
    assert.equal(rows.get(encounter).fields.hda, draft.fields.hda);
    console.log('PASS WebKit reconnect and concurrent flush create one durable row');

    const a2 = await page();
    const save = (tab, fields) => tab.evaluate(async rec => {
      const api = window.nexaEncounterAutosave18101;
      await api.put(rec);
      return api.syncOne(rec);
    }, { ...reconnected.local, ...fields, local_revision: 2, sync_state: 'pending' });
    const changes = [{ fields: { hda: 'Revisão sintética A1' } }, { fields: { hda: 'Revisão sintética A2' } }];
    const results = await Promise.all([save(a, changes[0]), save(a2, changes[1])]);
    assert.equal(results.filter(result => result.sent).length, 1);
    assert.equal(results.filter(result => result.conflict).length, 1);
    const winning = results.findIndex(result => result.sent), losing = 1 - winning;
    assert.equal(updates, 1);
    assert.equal(rows.get(encounter).sync_version, 1);
    assert.deepEqual(rows.get(encounter).fields, changes[winning].fields);
    const conflict = await [a, a2][losing].evaluate(id => window.nexaEncounterAutosave18101.get(id), encounter);
    assert.equal(conflict.sync_state, 'conflict');
    assert.deepEqual(conflict.fields, changes[losing].fields);
    console.log('PASS WebKit separate contexts enforce CAS and preserve the losing draft');
  } finally {
    try { await browser?.close(); } finally { await new Promise(resolve => server.close(resolve)); }
  }
}

check().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
