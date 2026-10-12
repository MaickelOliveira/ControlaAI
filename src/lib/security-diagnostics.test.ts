import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

describe("credential-safe diagnostics policy",()=>{
 it("never emits raw errors, provider messages or arbitrary objects through error/warn",()=>{
  const findings:string[]=[];
  for(const file of execFileSync("git",["ls-files","src"],{encoding:"utf8"}).trim().split("\n")){
   if(!/\.tsx?$/.test(file)||/\.test\./.test(file))continue;
   const source=ts.createSourceFile(file,readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true);
   function visit(node:ts.Node){
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(source)==="console"&&["error","warn"].includes(node.expression.name.text)&&node.arguments.some(arg=>!ts.isStringLiteral(arg)&&!ts.isNoSubstitutionTemplateLiteral(arg)))findings.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line+1}`);
    ts.forEachChild(node,visit);
   }
   visit(source);
  }
  expect(findings).toEqual([]);
 });
});
