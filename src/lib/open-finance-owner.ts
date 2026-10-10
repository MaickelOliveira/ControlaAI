import "server-only";
import { getUserByEmail } from "./users";
export async function getOpenFinanceOwner() {
  const email=process.env.OPEN_FINANCE_OWNER_EMAIL?.trim();
  if(process.env.OPEN_FINANCE_ENABLED!=="true" || !email)return null;
  const user=await getUserByEmail(email);
  return user?.email.toLowerCase()===email.toLowerCase()?user:null;
}
