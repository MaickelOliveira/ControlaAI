import {NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {validatePassword,hasAccess} from "@/lib/users";
import {signToken,setSessionCookie} from "@/lib/auth";
import {requireOpenFinanceOrigin} from "@/lib/open-finance-access";
import {readBankBody} from "@/lib/open-finance-body";
import {OF_HEADERS} from "@/lib/open-finance-http";
// Isolated single-process login limiter; no writes to production's rate_limits.
const attempts=new Map<string,{count:number;expires:number}>();
let overall={count:0,expires:0};
export async function POST(request:Request) {
  if(process.env.OPEN_FINANCE_PREVIEW_ONLY!=="true")return NextResponse.json({error:"Não disponível"},{status:404,headers:OF_HEADERS});
  try{requireOpenFinanceOrigin(request);}catch{return NextResponse.json({error:"Origem não autorizada"},{status:403,headers:OF_HEADERS});}
  const now=Date.now();for(const [key,value]of attempts)if(value.expires<now)attempts.delete(key);
  if(overall.expires<now)overall={count:0,expires:now+900000};
  if(++overall.count>30)return NextResponse.json({error:"Muitas tentativas. Aguarde 15 minutos."},{status:429,headers:OF_HEADERS});
  const source=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown",key=createHash("sha256").update(source).digest("hex");
  if(!attempts.has(key)&&attempts.size>=1000)return NextResponse.json({error:"Tente novamente mais tarde."},{status:429,headers:OF_HEADERS});
  const bucket=attempts.get(key)||{count:0,expires:now+900000};bucket.count++;attempts.set(key,bucket);
  if(bucket.count>10)return NextResponse.json({error:"Muitas tentativas. Aguarde 15 minutos."},{status:429,headers:OF_HEADERS});
  let email,password;
  try{const body=JSON.parse((await readBankBody(request,4096)).toString("utf8"));email=body.email;password=body.password;if(typeof email!=="string"||typeof password!=="string"||password.length>500)throw new Error();}catch{return NextResponse.json({error:"Dados de acesso inválidos"},{status:400,headers:OF_HEADERS});}
  const expected=process.env.OPEN_FINANCE_OWNER_EMAIL?.trim().toLowerCase();
  if(!expected||email.trim().toLowerCase()!==expected)return NextResponse.json({error:"Email ou senha incorretos"},{status:401,headers:OF_HEADERS});
  const user=await validatePassword(expected,password);
  if(!user||!hasAccess(user)||user.email.trim().toLowerCase()!==expected)return NextResponse.json({error:"Email ou senha incorretos"},{status:401,headers:OF_HEADERS});
  await setSessionCookie(await signToken({sub:user.id,name:user.name,email:user.email,plan:user.plan,role:"client"}));
  return NextResponse.json({ok:true},{headers:OF_HEADERS});
}
