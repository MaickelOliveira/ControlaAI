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
function installedPackage(node){
 const root=resolve('node_modules')+sep,directory=resolve(node);
 if(!directory.startsWith(root)||node.split('/').includes('..'))throw Error('Invalid audit path');
 const metadata=JSON.parse(readFileSync(resolve(directory,'package.json'),'utf8'));
 return {name:metadata.name,version:metadata.version,hash:createHash('sha256').update(readFileSync(resolve(directory,'minimatch.js'))).digest('hex')};
}
export function reviewedLegacyMinimatch(name,item,advisory,today,read=installedPackage){
 if(name!=='minimatch'||item.severity!=='moderate'||advisory!=='GHSA-g3hv-75wg-m249'||today>reviewedUntil||!Array.isArray(item.nodes)||!item.nodes.length)return false;
 try{return item.nodes.every(node=>{
  if(typeof node!=='string'||!node.startsWith('node_modules/')||node.split('/').includes('..'))return false;
  const installed=read(node);
  return installed.name==='minimatch'&&reviewedSources.get(installed.version)===installed.hash&&typeof installed.hash==='string';
 });}catch{return false;}
}
