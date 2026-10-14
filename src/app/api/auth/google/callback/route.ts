import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, resolveState } from "@/lib/google-oauth";
import { getGoogleSettingsReturnUrl } from "@/lib/google-return-url";
import { getSession } from "@/lib/auth";
import {cookies} from "next/headers";
import {finishGoogleWorkspaceAuthorization} from "@/lib/google-workspace-oauth";

const OPAQUE=/^[A-Za-z0-9_-]{43}$/;
const LEGACY=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PUBLIC_ORIGIN=getGoogleSettingsReturnUrl().origin;
const HEADERS={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"};
const redirect=(locale?:"pt-BR"|"pt-PT"|"es",result?:"failed"|"cancelled")=>{
  const url=getGoogleSettingsReturnUrl(locale);
  if(result)url.searchParams.set("google",result);
  return NextResponse.redirect(url,{headers:HEADERS});
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if(searchParams.getAll("state").length!==1||searchParams.getAll("code").length>1||searchParams.getAll("error").length>1)return redirect(undefined,"failed");
  const opaque=searchParams.get("state")!;
  const code=searchParams.has("error")?null:searchParams.get("code");
  if(OPAQUE.test(opaque)){
    // Google still returns to the registered EasyPanel host. The user's Zelo
    // session cookie belongs to the public host, so finish the same single-use
    // state there. Never pass provider descriptions or an arbitrary destination.
    if(new URL(req.url).origin!==PUBLIC_ORIGIN&&searchParams.get("_zelo_public")!=="1"){
      if(code!==null&&(code.length>16384||/[\s\p{Cc}]/u.test(code)))return redirect(undefined,"failed");
      const url=new URL("/api/auth/google/callback",PUBLIC_ORIGIN);
      url.searchParams.set("state",opaque);
      if(code!==null)url.searchParams.set("code",code);
      else if(searchParams.has("error"))url.searchParams.set("error",searchParams.get("error")==="access_denied"?"access_denied":"authorization_failed");
      url.searchParams.set("_zelo_public","1");
      return NextResponse.redirect(url,{headers:HEADERS});
    }
    try{
      const session=await getSession();if(!session||session.role!=="client")return redirect(undefined,"failed");
      const sessionId=(await cookies()).get("ca_session")?.value;if(!sessionId)return redirect(undefined,"failed");
      // The persistent state supplies the original workspace even when another
      // tab changed the active mode/company. It never falls through to legacy.
      const result=await finishGoogleWorkspaceAuthorization(session.sub,sessionId,opaque,code);
      return redirect(result.locale,result.cancelled?(searchParams.get("error")==="authorization_failed"?"failed":"cancelled"):undefined);
    }catch{return redirect(undefined,"failed");}
  }
  if(!LEGACY.test(opaque))return redirect(undefined,"failed");
  // Only already-issued old UUID states use this temporary compatibility path.
  // exchangeCode independently denies every legacy transport after activation.
  const state=resolveState(opaque);if(!code||!state)return redirect();
  try {
    // A nonce identifies who started OAuth; the callback browser must still
    // belong to that active client before another account's Google grant is saved.
    const session = await getSession();
    if (!session || session.role !== "client" || session.sub !== state.userId) {
      return redirect(state.locale);
    }
    await exchangeCode(code, state.userId);
    return redirect(state.locale);
  } catch {
    return redirect(state.locale);
  }
}
