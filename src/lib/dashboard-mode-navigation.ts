const onlyPersonal = ["supermercado", "contatos"];
const onlyBusiness = ["funcionarios", "clientes", "notas-fiscais"];

export function isDashboardPageAvailable(page: string, mode: "personal" | "business") {
  return !(mode === "business" ? onlyPersonal : onlyBusiness).includes(page);
}

export function modeSwitchDestination(pathname: string, mode: "personal" | "business"): string | null {
  const match = pathname.match(/^(\/(?:pt\/|es\/)?dashboard)(?:\/([^/]+))?(?:\/|$)/);
  return match && !isDashboardPageAvailable(match[2] ?? "", mode) ? match[1] : null;
}
