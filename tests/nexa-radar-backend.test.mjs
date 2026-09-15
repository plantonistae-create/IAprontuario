import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {schema,validate,authorized} from '../supabase/functions/realtime-radar/contract.mjs';
import E from '../nexa-radar-engine.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../supabase/functions/realtime-radar/concepts.json',import.meta.url)));
test('backend catalogue matches clinical engine',()=>assert.deepEqual(catalog.map(c=>c.id),Object.keys(E.concepts)));
test('structured schema rejects arbitrary fields',()=>assert.equal(schema(['trauma']).properties.items.items.additionalProperties,false));
test('backend rejects unsupported model evidence',()=>assert.deepEqual(validate({items:[{concept:'trauma',priority:'high',category:'history',contextEvidence:'Inventado'}]},['trauma'],'Dor no tornozelo'),[]));
test('clinical access is fail closed for every role/status combination',()=>{for(const status of ['pending','disabled',undefined])for(const role of ['is_admin','is_reviewer'])assert.equal(authorized({access_status:status,clinical_access:true,[role]:true}),false);assert.equal(authorized({access_status:'active',clinical_access:false,is_admin:true}),false);assert.equal(authorized({access_status:'active',clinical_access:true}),true);});
