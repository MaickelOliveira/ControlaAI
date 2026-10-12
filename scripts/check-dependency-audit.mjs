import {spawnSync} from 'node:child_process';
const reviewedUntil='2026-10-17';
// Limited, time-bounded exceptions. No blanket severity suppression or forced downgrade.
const accepted=new Set(['GHSA-vfj7-8cjw-p6xm','GHSA-86w9-cpqp-85rv','GHSA-w5hq-g745-h8pq']);
const result=spawnSync('npm',['audit','--json'],{encoding:'utf8',maxBuffer:8*1024*1024});
let audit;try{audit=JSON.parse(result.stdout);}catch{console.error('Dependency audit unavailable; release check blocked.');process.exit(1);}
if(audit.error||result.error){console.error('Dependency audit unavailable; release check blocked.');process.exit(1);}
const issues=Object.entries(audit.vulnerabilities??{});const blocked=[];const today=new Date().toISOString().slice(0,10);
for(const [name,item] of issues){
 if(!['moderate','high','critical'].includes(item.severity))continue;
 if(item.severity==='critical'||!Array.isArray(item.via)||!item.via.length){blocked.push({package:name,advisory:'unreviewed',severity:item.severity});continue;}
 for(const via of item.via??[]){
  if(typeof via==='string'){if(!audit.vulnerabilities?.[via])blocked.push({package:name,advisory:'unknown',severity:item.severity});continue;} // its root advisory is checked separately
  const id=typeof via.url==='string'?via.url.match(/GHSA-[a-z0-9-]+/)?.[0]:undefined;
  if(item.severity==='critical'||!id||!accepted.has(id)||today>reviewedUntil)blocked.push({package:name,advisory:id??'unknown',severity:item.severity});
 }
}
if(blocked.length){console.error(JSON.stringify({blocked_dependency_advisories:blocked}));process.exitCode=1;}
else console.log(JSON.stringify({known_audit_counts:audit.metadata?.vulnerabilities,reviewed_until:reviewedUntil,remaining_findings_are_not_claimed_fixed:true}));
