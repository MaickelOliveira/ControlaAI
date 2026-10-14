import "server-only";
import {getSupabase} from "./supabase";

/** The owner must come from authenticated server context. False is permission
 * to consider legacy compatibility only when private storage actually says so. */
export async function loadGoogleOwnerActivation(userId:string):Promise<boolean>{
 if(typeof userId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(userId))throw Error("GOOGLE_ACTIVATION_STORAGE_INVALID");
 const owner=userId.toLowerCase();let value:unknown;
 try{
  const {data,error}=await getSupabase().rpc("zelo_google_owner_activated",{p_user_id:owner});
  if(error)throw Error();value=data;
 }catch{throw Error("GOOGLE_ACTIVATION_STORAGE_UNAVAILABLE");}
 if(typeof value!=="boolean")throw Error("GOOGLE_ACTIVATION_STORAGE_INVALID");return value;
}
