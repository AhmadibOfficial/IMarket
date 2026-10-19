'use strict';
// Explicit local invocation only. Each correction is followed by the complete gate.
const {spawnSync}=require('node:child_process');
const {readFileSync,mkdtempSync}=require('node:fs');
const {join}=require('node:path');
const {createHash}=require('node:crypto');
const {readdirSync}=require('node:fs');
const protectedFiles=['AGENTS.md','docs/RELEASE_GATES.md','.github/workflows/build.yml','scripts/validate-milestone.cjs','scripts/repair-milestone.cjs','scripts/verify_project.py',...readdirSync('apps/api/test').map(x=>'apps/api/test/'+x),...readdirSync('packages/commerce-domain').filter(x=>x.endsWith('.test.cjs')).map(x=>'packages/commerce-domain/'+x)];
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const baseline=new Map(protectedFiles.map(path=>[path,digest(path)]));
const report=join(mkdtempSync(join(require('node:os').tmpdir(),'imarket-repair-')),'report.json');
for(let iteration=0;iteration<=2;iteration++){
 const gate=spawnSync(process.execPath,['scripts/validate-milestone.cjs'],{stdio:'inherit',env:{...process.env,IMARKET_VALIDATION_REPORT:report}});
 if(gate.status===0)process.exit(0);
 let result;try{result=JSON.parse(readFileSync(report));}catch{console.error('Validation infrastructure failed to produce a report.');process.exit(1);}
 if(result.infrastructure){console.error('Infrastructure failure: stopping without automatic corrections. Inspect',report);process.exit(1);}
 if(iteration===2){console.error('Two correction iterations exhausted. Inspect',report);process.exit(1);}
 const prompt=`Read AGENTS.md and release gates. Correct only IMK-003 defects shown in ${report} and its log directory. Preserve assertions, required test coverage, authorization and security controls. No commits, merges, pushes, deployment, secrets, live payments or unrelated changes. Do not edit validation or repair scripts or CI gates to make failures pass. Leave changes for review.`;
 const repair=spawnSync('codex',['exec','--sandbox','workspace-write','--cd',process.cwd(),prompt],{stdio:'inherit',timeout:600000});
 if(protectedFiles.some(path=>{try{return digest(path)!==baseline.get(path);}catch{return true;}})){console.error('Correction changed protected tests or gates. Stop for manual review; no success is accepted.');process.exit(1);}
 if(repair.error||repair.status!==0){console.error('Correction runner failed; stopping.');process.exit(1);}
}
