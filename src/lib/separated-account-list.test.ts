import {describe,expect,it} from "vitest";
import {asksForManualAndBankAccounts,separatedAccountList} from "./separated-account-list";

describe("contas manuais separadas dos bancos",()=>{
 it("identifica o pedido sem confundir uma listagem simples",()=>{
  expect(asksForManualAndBankAccounts("Mostre minhas contas registradas manualmente separadas dos bancos")).toBe(true);
  expect(asksForManualAndBankAccounts("Liste minhas contas")).toBe(false);
 });
 it("mostra cada banco ativo uma vez e não esconde as contas manuais",()=>{
  const reply=separatedAccountList([{name:"Dinheiro",isDefault:true}],{connections:[
   {institution_name:"Sicredi",status:"active",archived_at:null},
   {institution_name:"Sicredi",status:"active",archived_at:null},
   {institution_name:"Inter",status:"revoked",archived_at:null},
  ] as never},"personal");
  expect(reply).toContain("*Contas cadastradas manualmente*\n1. Dinheiro ⭐");
  expect(reply).toContain("*Bancos conectados*\n1. Sicredi");
  expect(reply.match(/Sicredi/g)).toHaveLength(1);
  expect(reply).not.toContain("Inter");
 });
 it("não inventa bancos quando a consulta está indisponível",()=>{
  expect(separatedAccountList([],null,"business")).toContain("não está disponível");
  expect(separatedAccountList([],null,"business",true)).toContain("Não consegui consultar");
 });
});
