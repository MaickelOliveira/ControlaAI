import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
// Report locations only. Never echo matched credential bytes into CI output.
const patterns=[
 ['private_key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['github_token',/\b(?:ghp_|github_pat_)[A-Za-z0-9_]{25,}/],
 ['google_api_key',/\bAIza[A-Za-z0-9_-]{30,}/],
 ['openai_key',/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{35,}/],
 ['aws_access_id',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
 ['jwt_literal',/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);const findings=[];
for(const file of files){
 if(/(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(file)){findings.push({file,kind:'private_file'});continue;}
 if(!/\.(?:[cm]?js|[cm]?ts|tsx|jsx|json|ya?ml|md|sql|toml|sh)$|(?:^|\/)Dockerfile$/.test(file))continue;
 const source=readFileSync(file,'utf8');
 for(const [kind,pattern] of patterns){const match=pattern.exec(source);if(match)findings.push({file,line:source.slice(0,match.index).split('\n').length,kind});}
}
if(findings.length){console.error(JSON.stringify({secret_locations:findings}));process.exitCode=1;}else console.log(`Credential pattern check passed for ${files.length} tracked files. This does not prove absence of every secret format.`);
