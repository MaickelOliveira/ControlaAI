import {describe,expect,it} from "vitest";
import {modeSwitchDestination,isDashboardPageAvailable} from "./dashboard-mode-navigation";

describe("navigation after changing dashboard mode",()=>{
  it.each(["funcionarios","clientes"])("returns from %s to the dashboard in personal mode",page=>{
    expect(modeSwitchDestination(`/dashboard/${page}`,"personal")).toBe("/dashboard");
  });
  it.each(["supermercado","contatos"])("returns from %s to the dashboard in business mode",page=>{
    expect(modeSwitchDestination(`/dashboard/${page}`,"business")).toBe("/dashboard");
  });
  it.each(["/pt/dashboard/clientes","/es/dashboard/clientes"])("preserves the locale when leaving %s",pathname=>{
    expect(modeSwitchDestination(pathname,"personal")).toBe(pathname.slice(0,pathname.lastIndexOf("/")));
  });
  it.each(["financas","contas","tarefas","metas","veiculos","lembretes","drive","agenda","configuracoes","recorrentes"])("keeps the shared page %s in either mode",page=>{
    expect(modeSwitchDestination(`/dashboard/${page}`,"personal")).toBeNull();
    expect(modeSwitchDestination(`/dashboard/${page}`,"business")).toBeNull();
  });
  it("keeps pages that belong to the newly selected mode",()=>{
    expect(modeSwitchDestination("/dashboard/clientes","business")).toBeNull();
    expect(modeSwitchDestination("/dashboard/contatos","personal")).toBeNull();
    expect(isDashboardPageAvailable("clientes","personal")).toBe(false);
    expect(isDashboardPageAvailable("contatos","business")).toBe(false);
  });
});
