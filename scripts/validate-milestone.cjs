'use strict';
const {spawnSync}=require('node:child_process');
const {writeFileSync,mkdtempSync,openSync,closeSync,readFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const directory=mkdtempSync(join(tmpdir(),'imarket-validation-'));
const steps=[['offline','npm',['run','check:offline']],['backend','npm',['run','build','-w','@imarket/api']],['required-tests','node',['--test','--test-reporter=tap','--experimental-test-isolation=none',...require('node:fs').readdirSync('packages/commerce-domain').filter(x=>x.endsWith('.test.cjs')).map(x=>'packages/commerce-domain/'+x),...require('node:fs').readdirSync('apps/api/test').filter(x=>x.endsWith('.test.cjs')).map(x=>'apps/api/test/'+x)]],['web','npm',['run','build','-w','@imarket/web']]];
const report={passed:false,infrastructure:false,steps:[],directory};
if(!process.env.IMARKET_TEST_DATABASE_URL){console.error('Required isolated PostgreSQL target is unset.');report.infrastructure=true;}
for(const [name,command,args] of steps){
 const fd=openSync(join(directory,name+'.log'),'w');
 const r=spawnSync(command,args,{stdio:['ignore',fd,fd],timeout:180000,env:process.env});
 closeSync(fd);
 const output=readFileSync(join(directory,name+'.log'),'utf8');process.stdout.write(output);
 const required=name==='required-tests';
 const counts=required?{failed:Number(output.match(/^# fail (\d+)$/m)?.[1]??-1),skipped:Number(output.match(/^# skipped (\d+)$/m)?.[1]??-1),cancelled:Number(output.match(/^# cancelled (\d+)$/m)?.[1]??-1),todo:Number(output.match(/^# todo (\d+)$/m)?.[1]??-1),tests:Number(output.match(/^# tests (\d+)$/m)?.[1]??0)}:undefined;
 const passed=!r.error&&r.status===0&&(!required||(counts.failed===0&&counts.skipped===0&&counts.tests>0&&counts.cancelled===0&&counts.todo===0));
 const infrastructure=!!r.error||/EPERM|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ENOSPC|out of memory|database .* does not exist|password authentication failed/i.test(output);
 report.infrastructure ||= infrastructure;report.steps.push({name,passed,counts,infrastructure,status:r.status,error:r.error?.code});
}
report.passed=!report.infrastructure&&report.steps.every(s=>s.passed);
writeFileSync(join(directory,'report.json'),JSON.stringify(report,null,2));
if(process.env.IMARKET_VALIDATION_REPORT)writeFileSync(process.env.IMARKET_VALIDATION_REPORT,JSON.stringify(report,null,2));
console.log('Validation report:',join(directory,'report.json'));process.exitCode=report.passed?0:1;
