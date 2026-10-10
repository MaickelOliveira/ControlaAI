import "server-only";
import {normalizePhoneInput} from "./phone";
/** Linked relatives/employees are not the private preview owner. Channel defaults closed. */
export function canReadBanksFromPhone(ownerPhone:string,sender:string):boolean {
  if(process.env.OPEN_FINANCE_WHATSAPP_ENABLED!=="true")return false;
  const owner=normalizePhoneInput(ownerPhone,"pt-BR"),from=normalizePhoneInput(sender,"pt-BR");
  return /^55\d{10,11}$/.test(owner)&&owner===from;
}
