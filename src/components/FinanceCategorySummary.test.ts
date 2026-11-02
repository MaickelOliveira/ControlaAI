import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import FinanceCategorySummary from "./FinanceCategorySummary";
it("shows income and expense categories in their own clearly labelled summaries",()=>{
 const income=renderToStaticMarkup(React.createElement(FinanceCategorySummary,{type:"income",groups:[{name:"Serviços",value:123.45}],onAdd:()=>{}}));
 const expense=renderToStaticMarkup(React.createElement(FinanceCategorySummary,{type:"expense",groups:[{name:"Alimentação",value:40}],onAdd:()=>{}}));
 expect(income).toContain("Receitas por categoria");expect(income).toContain("Serviços");expect(income).toContain("123,45");expect(income).not.toContain("Despesas por categoria");
 expect(expense).toContain("Despesas por categoria");expect(expense).not.toContain("Receitas por categoria");
});
it("shows a different circular expense chart and labels monthly loan forecasts",()=>{
 const html=renderToStaticMarkup(React.createElement(FinanceCategorySummary,{type:"expense",groups:[{name:"Empréstimos",value:350.25,forecast:200},{name:"Parcelas do veículo",value:500,forecast:500}],onAdd:()=>{}}));
 expect(html).toContain("<circle");expect(html).toContain("Distribuição das despesas");expect(html).toContain("350,25");expect(html).toContain("200,00");expect(html).toContain("parcelas previstas");expect(html).toContain("saldo realizado");expect(html).not.toContain("Saldo devedor");
});

it("deducts refunds from the total while keeping signed category labels",()=>{
 const html=renderToStaticMarkup(React.createElement(FinanceCategorySummary,{type:"expense",groups:[{name:"Compras",value:100},{name:"Estornos",value:-20}],onAdd:()=>{}}));
 expect(html).toContain("80,00");expect(html).toContain("-R$");expect(html).toContain("20,00");
});
