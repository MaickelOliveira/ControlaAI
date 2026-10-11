import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {identifyFinanceAuthors} from "./finance-attribution";

const owner={id:"owner-uuid",name:"Ana Silva"};
const links=[
  {phone:"5511987654321",userId:owner.id,name:"Juliana",relation:"Filha"},
  {phone:"5511987654322",userId:owner.id,name:"Carlos",relation:"Marido"},
  {phone:"5511987654323",userId:"other-account",name:"Outra pessoa",relation:"Titular"},
];
describe("finance author identification",()=>{
  it("identifies each family's income and expense without changing totals or descriptions",()=>{
    const records=[
      {id:"expense",source:"whatsapp",registeredBy:"11987654321",amount:50,type:"expense",description:"Farmácia"},
      {id:"income",source:"whatsapp",registeredBy:"5511987654322",amount:200,type:"income",description:"Recebimento"},
    ];
    const named=identifyFinanceAuthors(records,owner,links);
    expect(named[0]).toMatchObject({...records[0],registeredByName:"Juliana"});
    expect(named[1]).toMatchObject({...records[1],registeredByName:"Carlos"});
    expect(records[0]).not.toHaveProperty("registeredByName");
  });
  it("identifies a platform record from its authenticated creator",()=>{
    expect(identifyFinanceAuthors([{source:"web",registeredBy:owner.id}],owner,links)[0].registeredByName).toBe("Ana Silva");
  });
  it("does not guess an author for bank, anonymous history or another account's phone",()=>{
    const result=identifyFinanceAuthors([
      {source:"bank",registeredBy:owner.id},{source:"web"},{source:"whatsapp",registeredBy:"5511987654323"},
    ],owner,links);
    expect(result.every(record=>record.registeredByName===undefined)).toBe(true);
  });
});
