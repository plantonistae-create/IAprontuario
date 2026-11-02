// Synthetic macOS speech fixtures only. No clinical recordings or API requests.
import {readFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const corpus=JSON.parse(await readFile(path.join(root,'tests/medication-audio-corpus.json'),'utf8'));
const target=process.env.NEXA_AUDIO_FIXTURE_DIR||'/private/tmp/nexa-medication-audio';
await mkdir(target,{recursive:true});
for(const scenario of corpus){
 const output=path.join(target,scenario.id+'.aiff');
 await new Promise((resolve,reject)=>{
  const child=spawn('say',['-v',scenario.voice,'-o',output,scenario.text],{stdio:'ignore'});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Synthetic speech failed: '+scenario.id)));
 });
 console.log(scenario.id+'.aiff');
}
