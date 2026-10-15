import {describe,expect,it} from "vitest";
import {projectBankInstallments,type BankInstallmentAnchor} from "./bank-installment-projections";
import type {BankMovement} from "./open-finance-report";

const anchor:BankInstallmentAnchor={id:"schedule-1",resource_id:"card-1",description:"LOJAS G",resource_name:"Gold",institution_name:"Sicredi",amount:"74.79",currency:"BRL",bill_month:"2026-10-01",observed_installments:2,total_installments:10,synced_at:"2026-10-14T12:00:00Z"};
const period={from:"2026-11-01",to:"2026-11-30",today:"2026-10-15"};

describe("parcelas bancárias previstas no extrato",()=>{
 it("mostra somente a parcela de cada mês futuro até a última, sem inventar o dia",()=>{
  expect(projectBankInstallments([anchor],[],{from:"2026-10-01",to:"2026-10-31",today:"2026-10-15"})).toMatchObject([{month:"2026-10",position:2,total:10,observed:true}]);
  expect(projectBankInstallments([anchor],[],period)).toMatchObject([{month:"2026-11",position:3,total:10,amount:"74.79",currency:"BRL"}]);
  expect(projectBankInstallments([anchor],[],{...period,from:"2027-06-01",to:"2027-06-30"})).toMatchObject([{month:"2027-06",position:10}]);
  expect(projectBankInstallments([anchor],[],{...period,from:"2027-07-01",to:"2027-07-31"})).toEqual([]);
 });
 it("não exibe previsão quando a parcela real já foi recebida do banco",()=>{
  const received={id:"movement-3",resource_id:"card-1",resource_name:"Gold",institution_name:"Sicredi",resource_type:"card",date:"2026-11-03",description:"Lojas G",amount:"74.79",currency:"BRL",direction:"debit",classification:"purchase",kind:"card_purchases",bill_month:"2026-11-01",installment_number:3,installment_count:10} satisfies BankMovement;
  expect(projectBankInstallments([anchor],[received],period)).toEqual([]);
  expect(projectBankInstallments([anchor],[{...received,id:"movement-2",date:"2026-10-03",bill_month:"2026-10-01",installment_number:2}],{from:"2026-10-01",to:"2026-10-31",today:"2026-10-15"})).toEqual([]);
 });
 it("não fabrica parcelas para observações antigas, números inválidos ou moeda desconhecida",()=>{
  expect(projectBankInstallments([{...anchor,bill_month:"2026-06-01"}],[],period)).toEqual([]);
  expect(projectBankInstallments([{...anchor,observed_installments:11}],[],period)).toEqual([]);
  expect(projectBankInstallments([{...anchor,currency:null}],[],period)).toEqual([]);
 });
 it("não transforma mês anterior em dívida nova e mantém moedas distintas",()=>{
  expect(projectBankInstallments([anchor],[],{from:"2026-09-01",to:"2026-09-30",today:"2026-10-15"})).toEqual([]);
  expect(projectBankInstallments([{...anchor,currency:"USD"}],[],period)[0]).toMatchObject({currency:"USD",amount:"74.79"});
 });
 it("não atribui uma cobrança sem dia conhecido a um intervalo parcial de datas",()=>{
  expect(projectBankInstallments([anchor],[],{from:"2026-10-15",to:"2026-10-31",today:"2026-10-15"})).toEqual([]);
  expect(projectBankInstallments([anchor],[],{from:"2026-10-01",to:"2026-10-20",today:"2026-10-15"})).toEqual([]);
 });
});
