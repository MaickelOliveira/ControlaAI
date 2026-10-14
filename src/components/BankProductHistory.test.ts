import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it,vi} from "vitest";
import OpenFinanceResources from "./OpenFinanceResources";
import OpenFinanceConnection from "./OpenFinanceConnection";
import OpenFinanceAccounts from "./OpenFinanceAccounts";
import type {BankConnection,BankOverview,BankResource} from "@/lib/open-finance-display";
const remote=vi.hoisted(()=>({overview:null as BankOverview|null}));
vi.mock("./useBankUpdates",()=>({useBankUpdates:()=>({data:remote.overview,setData:()=>{},error:null})}));

const canceled:BankConnection={id:"old-business-consent",institution_name:"Banco PJ fictício",status:"revoked",provider_status:"REVOKED",scopes:["ACCOUNT","CREDIT_CARD_ACCOUNT"],consent_expires_at:null,revoked_at:"2026-10-11",archived_at:"2026-10-11",has_imported_data:true,last_successful_sync_at:"2026-10-10",created_at:"2026-10-09"};
const account:BankResource={id:"saved-account",connection_id:canceled.id,resource_type:"account",name:"Conta histórica da empresa",subtype:"accounts",card_network:null,identification_last4:null,currency:"BRL",available_amount:"123.45",gross_amount:null,net_amount:null,valuation_date:null,synced_at:"2026-10-10"};
const data:BankOverview={connections:[canceled],resources:[account,{...account,id:"saved-card",resource_type:"card",name:"Cartão histórico da empresa"}],limits:[],bills:[],credit:[],sync:[]};

it("offers an action on an inactive bank card and moves archived products into accessible history",()=>{
  const inactive={...canceled,archived_at:null};
  const visible=renderToStaticMarkup(React.createElement(OpenFinanceResources,{data:{...data,connections:[inactive]},mode:"business",onRemove:()=>{}}));
  expect(visible).toContain("Remover da lista");
  expect(visible).toContain("Conta histórica da empresa");
  expect(visible).not.toContain("Desconectar banco");

  const archived=renderToStaticMarkup(React.createElement(OpenFinanceResources,{data,mode:"business",onRemove:()=>{}}));
  expect(archived).toContain("Bancos anteriores");
  expect(archived).toContain("Conta histórica da empresa");
  expect(archived).toContain("Cartão histórico da empresa");
  expect(archived).not.toContain("Remover da lista");
});

it("labels retained products as historical/cancelled after the only bank authorization was revoked and archived",()=>{
  const html=renderToStaticMarkup(React.createElement(OpenFinanceResources,{data,mode:"business",onDisconnect:()=>{}}));
  expect(html).toContain("Conta histórica da empresa");expect(html).toContain("Cartão histórico da empresa");
  // Ignore fixture product names: a status must explain why the bank card remains.
  const visible=html.replace(/Conta histórica da empresa|Cartão histórico da empresa/g,"");
  expect(visible.toLowerCase()).toMatch(/históric|cancelad|desconectad/);
  expect(html).not.toContain("Desconectar banco");
});

it("does not invent an active disconnect action for a cancelled authorization or let restoring visibility reconnect it",()=>{
  const html=renderToStaticMarkup(React.createElement(OpenFinanceConnection,{connection:canceled,busy:false,connectAvailable:true,onAction:()=>{}}));
  expect(html).toContain("Cancelado");expect(html).toContain("Restaurar na lista");
  expect(html).toContain("mantém o compartilhamento cancelado");
  expect(html).not.toContain("Desconectar banco");expect(html).not.toContain("Gerar novo link");
});

it("still offers a new bank connection when every old authorization is cancelled and archived",()=>{
  remote.overview={...data,connectAvailable:true};
  const html=renderToStaticMarkup(React.createElement(OpenFinanceAccounts,{mode:"business"}));
  expect(html).toContain("Conectar banco");expect(html).toContain("0 ativa(s)");
  expect(html).toContain("Conexões removidas");expect(html).toContain("Cancelado");
  expect(html).not.toContain("Desconectar banco");expect(html).not.toContain("Verificar agora");
});
