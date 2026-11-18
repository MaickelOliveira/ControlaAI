import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';

// These upstream legacy sources have no firstPhasePreProcess/optimizationLevel.
// Do not extend this assessment to modern minimatch, other advisories or bytes.
const reviewedSources=new Map([
 ['3.1.5','746849f267c4868a53729225bd85c7dccd387712136fb305fcc0a3eadd4a3d9d'],
 ['5.1.9','1339bca8b70e33847860daa8fc3ccfa62487e143670da01a3b718d40d5fd424f'],
]);
export const reviewedUntil='2026-11-09';
function installedPackage(node,source='minimatch.js'){
 const root=resolve('node_modules')+sep,directory=resolve(node);
 if(!directory.startsWith(root)||node.split('/').includes('..'))throw Error('Invalid audit path');
 const metadata=JSON.parse(readFileSync(resolve(directory,'package.json'),'utf8'));
 const lock=JSON.parse(readFileSync(resolve('package-lock.json'),'utf8'));
 return {name:metadata.name,version:metadata.version,dev:lock.packages?.[node]?.dev===true,hash:createHash('sha256').update(readFileSync(resolve(directory,source))).digest('hex')};
}

// No runtime dependency or untrusted glob input; revisit when upstream ships a fix.
const reviewedBuildSources=new Map([
 ['2.3.2','3a91656f440069aa8f8e15c9d695b9f6b2209df1eab2be8127c72cbcca45ff5f'],
 ['4.0.5','73211a8ba85ce257b827abd8960e52c9750385b3fd18e8ef1080b114d774eb23'],
 ['4.0.7','4e1e05447668aa1e94366c5516a2bcd8f5fff800cc92b1d0cd7d77703b8618c4'],
]);
export const buildReviewUntil='2026-11-25';
export function reviewedBuildPicomatch(name,item,advisory,today,read=node=>installedPackage(node,'lib/parse.js')){
 if(name!=='picomatch'||item.severity!=='high'||advisory!=='GHSA-fc5q-39xc-vjpf'||today>buildReviewUntil||!Array.isArray(item.nodes)||!item.nodes.length)return false;
 try{return item.nodes.every(node=>{
  if(typeof node!=='string'||!node.startsWith('node_modules/')||node.split('/').includes('..'))return false;
  const installed=read(node);
  return installed.name==='picomatch'&&installed.dev===true&&typeof installed.hash==='string'&&reviewedBuildSources.get(installed.version)===installed.hash;
 });}catch{return false;}
}
export function reviewedLegacyMinimatch(name,item,advisory,today,read=installedPackage){
 if(name!=='minimatch'||item.severity!=='moderate'||advisory!=='GHSA-g3hv-75wg-m249'||today>reviewedUntil||!Array.isArray(item.nodes)||!item.nodes.length)return false;
 try{return item.nodes.every(node=>{
  if(typeof node!=='string'||!node.startsWith('node_modules/')||node.split('/').includes('..'))return false;
  const installed=read(node);
  return installed.name==='minimatch'&&reviewedSources.get(installed.version)===installed.hash&&typeof installed.hash==='string';
 });}catch{return false;}
}
