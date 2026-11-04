// Synthetic macOS speech fixtures only. No clinical recordings or API requests.
import {readFile,mkdir,unlink} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const corpus=JSON.parse(await readFile(path.join(root,'tests/medication-audio-corpus.json'),'utf8'));
const target=process.env.NEXA_AUDIO_FIXTURE_DIR||'/private/tmp/nexa-medication-audio';
await mkdir(target,{recursive:true});
for(const scenario of corpus){
 const temporary=path.join(target,scenario.id+'.aiff');
 const output=path.join(target,scenario.id+'.wav');
 await new Promise((resolve,reject)=>{
  const child=spawn('say',['-v',scenario.voice,'-o',temporary,scenario.text],{stdio:'ignore'});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Synthetic speech failed: '+scenario.id)));
 });
 const converted=spawnSync('afconvert',['-f','WAVE','-d','LEI16',temporary,output],{stdio:'ignore'});
 if(converted.status!==0)throw new Error(`Synthetic WAV conversion failed: ${scenario.id}`);
 const info=spawnSync('afinfo',[output],{encoding:'utf8'});
 const duration=Number(info.stdout.match(/estimated duration:\s*([0-9.]+) sec/)?.[1]||0);
 const audioBytes=Number(info.stdout.match(/audio bytes:\s*(\d+)/)?.[1]||0);
 if(info.status!==0||duration<0.5||audioBytes<1000)
  throw new Error(`Synthetic speech is empty or invalid: ${scenario.id}`);
 await unlink(temporary);
 console.log(`${scenario.id}.wav (${duration.toFixed(2)}s)`);
}
