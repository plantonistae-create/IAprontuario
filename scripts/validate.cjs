const fs=require('fs'),path=require('path'),vm=require('vm'),cp=require('child_process');
const html=fs.readFileSync('index.html','utf8');
for(const [i,m]of [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].entries())new vm.Script(m[1],{filename:'index-inline-'+i});
for(const file of fs.readdirSync('.').filter(f=>f.endsWith('.js')))cp.execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
for(const m of html.matchAll(/(?:src|href)="\.\/([^"?]+)(?:\?[^" ]*)?"/g)){if(!fs.existsSync(m[1]))throw Error('Missing asset '+m[1]);}
console.log('All JavaScript, inline scripts and local references: PASS');
if(process.argv.includes('--build')){fs.mkdirSync('dist',{recursive:true});for(const f of fs.readdirSync('.').filter(f=>/\.(?:html|js|css|png|webmanifest)$/.test(f)))fs.copyFileSync(f,path.join('dist',f));console.log('Static distribution built: dist/');}
