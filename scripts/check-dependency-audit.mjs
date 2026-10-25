import {spawnSync} from 'node:child_process';
// Rechecked 2026-10-25 UTC (2026-10-24 in Sao Paulo), with evidence in
// tasks/dependency-audit-followup.md. The current audit no longer flags braces.
// node-forge is used to parse PKCS#12, while certificate checks use Node;
// ExcelJS calls uuid v4, outside the vulnerable v3/v5/v6 buffer paths.
// The published advisories have no compatible patched releases for these paths.
// Keep the exceptions short-lived; do not suppress new or critical advisories.
const reviewedUntil='2026-10-31';
const accepted=new Set(['GHSA-86w9-cpqp-85rv','GHSA-w5hq-g745-h8pq']);
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
