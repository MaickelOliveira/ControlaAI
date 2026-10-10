import "server-only";
import {verifyToken} from "./auth";
import {getUserById,hasAccess} from "./users";
export function previewRoutePolicy(path:string,method:string):"owner"|"public"|"signed"|"login"|"redirect"|"deny" {
  if((path==="/"||path==="/dashboard")&&method==="GET")return "redirect";
  if(path==="/login"&&method==="GET")return "public";
  if(path==="/api/auth/login"&&method==="POST")return "login";
  if(path==="/api/open-finance/login"&&method==="POST")return "public";
  if(method==="POST"&&["/api/webhook/open-finance","/api/cron/open-finance"].includes(path))return "signed";
  if(method==="GET"&&["/dashboard/contas","/dashboard/financas","/api/me","/api/admin/accounts","/api/finances","/api/categories","/api/recurring","/api/open-finance","/api/open-finance/institutions","/api/open-finance/report"].includes(path))return "owner";
  if(method==="POST"&&(["/api/open-finance/connect","/api/open-finance/ask","/api/auth/logout"].includes(path)||/^\/api\/open-finance\/connections\/[0-9a-f-]{36}\/(refresh|revoke)$/.test(path)))return "owner";
  return "deny";
}
export async function previewSessionOwner(token:string|undefined) {
  if(!token)return null;
  const session=await verifyToken(token),owner=process.env.OPEN_FINANCE_OWNER_EMAIL?.trim().toLowerCase();
  if(!session||session.role!=="client"||!owner)return null;
  const user=await getUserById(session.sub);
  if(!user||!hasAccess(user)||user.email.trim().toLowerCase()!==owner)return null;
  if(user.passwordChangedAt&&(!session.iat||session.iat*1000<new Date(user.passwordChangedAt).getTime()))return null;
  return user;
}
