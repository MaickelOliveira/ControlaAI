import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewedLegacyMinimatch} from './dependency-audit-policy.mjs';
const id='GHSA-g3hv-75wg-m249',today='2026-11-02';
const item={severity:'moderate',nodes:['node_modules/minimatch','node_modules/readdir-glob/node_modules/minimatch']};
const packages={
 'node_modules/minimatch':{name:'minimatch',version:'3.1.5',hash:'746849f267c4868a53729225bd85c7dccd387712136fb305fcc0a3eadd4a3d9d'},
 'node_modules/readdir-glob/node_modules/minimatch':{name:'minimatch',version:'5.1.9',hash:'1339bca8b70e33847860daa8fc3ccfa62487e143670da01a3b718d40d5fd424f'},
};
test('assesses only the two verified upstream legacy sources',()=>{
 assert.equal(reviewedLegacyMinimatch('minimatch',item,id,today,path=>packages[path]),true);
 assert.equal(reviewedLegacyMinimatch('minimatch',item,id,today),true);
});
test('blocks modern, changed, missing and mixed package sources',()=>{
 for(const patch of [{version:'10.2.6'},{version:'3.1.4'},{hash:'changed'},{name:'other'}]){
  assert.equal(reviewedLegacyMinimatch('minimatch',item,id,today,path=>({...packages[path],...patch})),false);
 }
 assert.equal(reviewedLegacyMinimatch('minimatch',item,id,today,()=>{throw Error('Missing');}),false);
 assert.equal(reviewedLegacyMinimatch('minimatch',{...item,nodes:[...item.nodes,'node_modules/new/minimatch']},id,today,path=>packages[path]),false);
});
test('blocks other advisories, elevated severity, expiry and malformed paths',()=>{
 for(const severity of ['high','critical'])assert.equal(reviewedLegacyMinimatch('minimatch',{...item,severity},id,today,path=>packages[path]),false);
 assert.equal(reviewedLegacyMinimatch('other',item,id,today,path=>packages[path]),false);
 assert.equal(reviewedLegacyMinimatch('minimatch',item,'GHSA-new-advisory',today,path=>packages[path]),false);
 assert.equal(reviewedLegacyMinimatch('minimatch',item,id,'2026-11-10',path=>packages[path]),false);
 for(const nodes of [[],['../minimatch'],['node_modules/../minimatch'],null])assert.equal(reviewedLegacyMinimatch('minimatch',{...item,nodes},id,today,path=>packages[path]),false);
});
