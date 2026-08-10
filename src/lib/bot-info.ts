import { getConfig, saveConfig } from "./whatsapp-config";
import { getInstancePhone } from "./evolution";

export async function detectBotNumber(): Promise<string> {
  const cfg = await getConfig();

  // WABA: não tem endpoint de "meu número" sem permissões extras — o admin
  // informa o Phone Number ID e o número diretamente na tela de config.
  if (cfg.provider === "waba") return cfg.wppBotNumber ?? "";

  const phone = await getInstancePhone();
  if (phone) {
    await saveConfig({ ...cfg, wppBotNumber: phone });
    return phone;
  }
  return "";
}
