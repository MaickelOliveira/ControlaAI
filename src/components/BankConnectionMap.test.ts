import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import BankConnectionMap from "./BankConnectionMap";
import type {BankConnection} from "@/lib/open-finance-display";
it("shows one bank node, green for a live authorization and red for disconnected/expired without any product balances",()=>{
 const connection=(id:string,name:string,status:string,patch:Partial<BankConnection>={})=>({id,institution_name:name,status,...patch}) as BankConnection;
 const html=renderToStaticMarkup(React.createElement(BankConnectionMap,{now:"2026-11-02T12:00:00Z",connections:[connection("old","Banco A","revoked"),connection("new","Banco A","active"),connection("b","Banco B","error"),connection("c","Banco C","active",{consent_expires_at:"2026-10-01T00:00:00Z"}),connection("hidden","Archived","active",{archived_at:"2026-10-01"})]}));
 expect(html.match(/Banco A/g)).toHaveLength(1);expect(html).toContain("Conectado");expect(html.match(/>Desconectado</g)).toHaveLength(2);expect(html).toContain("bg-emerald-500");expect(html).toContain("bg-red-500");expect(html).not.toContain("Archived");expect(html).not.toContain("R$");
});
