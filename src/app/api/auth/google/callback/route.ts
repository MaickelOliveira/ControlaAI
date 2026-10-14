import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, resolveState } from "@/lib/google-oauth";
import { getGoogleSettingsReturnUrl } from "@/lib/google-return-url";
import { getSession } from "@/lib/auth";
import {cookies} from "next/headers";
import {finishGoogleWorkspaceAuthorization} from "@/lib/google-workspace-oauth";

const OPAQUE=/^[A-Za-z0-9_-]{43}$/;
const LEGACY=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const redirect=(locale?:"pt-BR"|"pt-PT"|"es")=>NextResponse.redirect(getGoogleSettingsReturnUrl(locale),{headers:{"Cache-Control":"private, no-store"}});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if(searchParams.getAll("state").length!==1||searchParams.getAll("code").length>1||searchParams.getAll("error").length>1)return redirect();
  const opaque=searchParams.get("state")!;
  const code=searchParams.has("error")?null:searchParams.get("code");
  if(OPAQUE.test(opaque)){
    try{
      const session=await getSession();if(!session||session.role!=="client")return redirect();
      const sessionId=(await cookies()).get("ca_session")?.value;if(!sessionId)return redirect();
      // The persistent state supplies the original workspace even when another
      // tab changed the active mode/company. It never falls through to legacy.
      const result=await finishGoogleWorkspaceAuthorization(session.sub,sessionId,opaque,code);
      return redirect(result.locale);
    }catch{return redirect();}
  }
  if(!LEGACY.test(opaque))return redirect();
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
