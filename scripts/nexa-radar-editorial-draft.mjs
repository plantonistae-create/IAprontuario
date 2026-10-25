#!/usr/bin/env node
// Offline editorial proposal intake. No network, model calls, patient files or publication.
import fs from 'node:fs';
import path from 'node:path';
import Engine from '../nexa-radar-engine.js';
import {RADAR_SOURCES,RADAR_PLAYBOOKS} from '../supabase/functions/_shared/nexa-radar-evidence-library.mjs';
import {proposeRadarEditorialQuestion} from '../supabase/functions/_shared/nexa-radar-editorial.mjs';

function main(args){
 const [command,input]=args;
 if(command!=='draft'||!input||args.length!==2)throw Error('USAGE: node scripts/nexa-radar-editorial-draft.mjs draft <candidate.json>');
 if(!/\.json$/i.test(input))throw Error('RADAR_EDITORIAL_JSON_REQUIRED');
 const stat=fs.statSync(input);
 if(!stat.isFile()||stat.size>20_000)throw Error('RADAR_EDITORIAL_FILE_INVALID');
 const item=JSON.parse(fs.readFileSync(input,'utf8'));
 const clean=proposeRadarEditorialQuestion(item,{
   sources:RADAR_SOURCES,playbooks:RADAR_PLAYBOOKS,allowedConcepts:Object.keys(Engine.concepts)
 });
 // Don't write to the published catalogue. Explicit human review is mandatory.
 process.stdout.write(JSON.stringify(clean,null,2)+'\n');
}

try{main(process.argv.slice(2))}
catch(error){
 console.error(error?.message?.startsWith('USAGE:')?error.message:'RADAR_EDITORIAL_DRAFT_REJECTED: '+String(error?.message||'invalid'));
 process.exitCode=1;
}
