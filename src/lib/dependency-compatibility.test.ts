import {mkdtempSync,mkdirSync,existsSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRequire} from "node:module";
import ExcelJS from "exceljs";
import {expect,it} from "vitest";

it("round-trips spreadsheet data bars through ExcelJS with the patched UUID dependency",async()=>{
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet("Parcelas");
 sheet.getCell("A1").value=850;sheet.getCell("A2").value=950;
 sheet.addConditionalFormatting({ref:"A1:A2",rules:[{type:"dataBar",priority:1,gradient:false,border:true,cfvo:[{type:"min"},{type:"max"}]}]});
 const bytes=await workbook.xlsx.writeBuffer(),loaded=new ExcelJS.Workbook();
 await loaded.xlsx.load(bytes);
 expect(loaded.getWorksheet("Parcelas")?.getCell("A1").value).toBe(850);
 expect(loaded.getWorksheet("Parcelas")?.getCell("A2").value).toBe(950);
});

it("preserves rimraf's async glob API with the patched glob dependency",async()=>{
 const root=mkdtempSync(join(tmpdir(),"zelo-dependency-compat-"));
 try{
  for(const name of ["remove-one","remove-two","keep"])mkdirSync(join(root,name));
  const require=createRequire(import.meta.url),{rimraf}=require("rimraf");
  await rimraf(join(root,"remove-*"),{glob:{dot:true}});
  expect(existsSync(join(root,"remove-one"))).toBe(false);
  expect(existsSync(join(root,"remove-two"))).toBe(false);
  expect(existsSync(join(root,"keep"))).toBe(true);
 }finally{rmSync(root,{recursive:true,force:true});}
});
