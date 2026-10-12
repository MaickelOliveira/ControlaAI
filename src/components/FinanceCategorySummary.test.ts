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
