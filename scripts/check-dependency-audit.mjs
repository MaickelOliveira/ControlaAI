import {spawnSync} from 'node:child_process';
import {reviewedLegacyMinimatch,reviewedUntil,reviewedBuildPicomatch,buildReviewUntil} from './dependency-audit-policy.mjs';
// Previous node-forge/uuid exceptions were removed after installing fixes.
// Assessments verify exact sources and the reviewed build-only dependency scope; see
// tasks/dependency-audit-followup.md. New versions/advisories still block.
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
  if(item.severity==='critical'||!id||!(reviewedLegacyMinimatch(name,item,id,today)||reviewedBuildPicomatch(name,item,id,today)))blocked.push({package:name,advisory:id??'unknown',severity:item.severity});
 }
}
if(blocked.length){console.error(JSON.stringify({blocked_dependency_advisories:blocked}));process.exitCode=1;}
else console.log(JSON.stringify({known_audit_counts:audit.metadata?.vulnerabilities,reviewed_until:reviewedUntil,build_review_until:buildReviewUntil,remaining_findings_are_not_claimed_fixed:true}));
