import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {google} from "googleapis";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({activation:vi.fn(),from:vi.fn(),write:vi.fn(),read:vi.fn(),effect:vi.fn()}));
vi.mock("./google-owner-activation",()=>({loadGoogleOwnerActivation:m.activation}));
vi.mock("./whatsapp-config",()=>({getConfig:async()=>({googleClientId:"fixture.apps.googleusercontent.com",googleClientSecret:"fictitious-only",appBaseUrl:"https://example.test"})}));
vi.mock("./crypto-store",()=>({encryptField:(v:string)=>"fictitious:"+v,decryptField:(v:string)=>v}));
vi.mock("./supabase",()=>({getSupabase:()=>({from:m.from})}));
import {exchangeCode,getAuthUrl,getSelectedCalendar,getValidClient,isConnected,revokeTokens,getLegacyAuthClient} from "./google-oauth";
import {addMeetToGoogleCalendarEvent,createGoogleCalendarEvent,deleteGoogleCalendarEvent,updateGoogleCalendarEvent} from "./google-calendar";
const owner="90000000-0000-4000-8000-000000000001",input={userId:owner,title:"Fixture",startAt:"2026-10-20T12:00:00Z",endAt:"2026-10-20T13:00:00Z",calendarEventId:"fictitious",googleCalendarId:"original"};
let activated=false;
beforeEach(()=>{
 vi.resetAllMocks();activated=false;m.activation.mockImplementation(async()=>activated);
 const query={select:vi.fn(()=>query),eq:vi.fn(()=>query),maybeSingle:m.read,upsert:m.write,delete:vi.fn(()=>query)};
 m.from.mockReturnValue(query);m.read.mockResolvedValue({data:{user_id:owner,access_token:'{"token":"fictitious-access","selectedCalendarId":"original"}',refresh_token:"fictitious-refresh",expires_at:new Date(Date.now()+3600_000).toISOString()},error:null});m.write.mockResolvedValue({error:null});
 vi.spyOn(google,"calendar").mockReturnValue({events:{insert:m.effect,patch:m.effect,delete:m.effect}} as never);
 m.effect.mockResolvedValue({data:{id:"fictitious",conferenceData:{entryPoints:[{entryPointType:"video",uri:"https://meet.google.com/abc-defg-hij"}]}}});
 vi.spyOn(google.auth.OAuth2.prototype,"getToken").mockResolvedValue({tokens:{access_token:"fictitious-exchanged",refresh_token:"fictitious-refresh",expiry_date:Date.now()+3600_000},res:null as never} as never);
 vi.spyOn(google.auth.OAuth2.prototype,"revokeCredentials").mockResolvedValue({} as never);
 vi.spyOn(google.auth.OAuth2.prototype,"refreshAccessToken").mockResolvedValue({credentials:{access_token:"fictitious-renewed",refresh_token:"fictitious-refresh",expiry_date:Date.now()+3600_000},res:null as never} as never);
});
afterEach(()=>vi.restoreAllMocks());
it.each([()=>isConnected(owner),()=>getSelectedCalendar(owner),()=>getValidClient(owner),()=>getAuthUrl(owner),()=>exchangeCode("fictitious-code",owner),()=>revokeTokens(owner)])("denies every old credential entry point for an activated owner",async action=>{
 activated=true;await expect(action()).rejects.toThrow("GOOGLE_GLOBAL_DISABLED");expect(m.from).not.toHaveBeenCalled();expect(m.effect).not.toHaveBeenCalled();
});
it("fails closed when activation storage is unavailable without leaking its diagnostic",async()=>{
 m.activation.mockRejectedValue(Error("fictitious internal storage diagnostic"));
 await expect(getValidClient(owner)).rejects.toThrow("GOOGLE_GLOBAL_CHECK_UNAVAILABLE");expect(m.from).not.toHaveBeenCalled();
});
it.each([null,undefined,0,"false"])("does not interpret malformed activation %s as permission",async value=>{
 m.activation.mockResolvedValue(value);await expect(isConnected(owner)).rejects.toThrow("GOOGLE_GLOBAL_CHECK_UNAVAILABLE");expect(m.from).not.toHaveBeenCalled();
});
it("keeps compatible old clients unable to renew automatically after they leave the guard",async()=>{
 const client=await getValidClient(owner);
 expect(client.credentials.access_token).toBe("fictitious-access");expect(client.credentials.refresh_token).toBeUndefined();expect(client.refreshHandler).toBeUndefined();expect(client.eagerRefreshThresholdMillis).toBe(0);expect(client.forceRefreshOnFailure).toBe(false);
});
it.each([()=>createGoogleCalendarEvent(input),()=>updateGoogleCalendarEvent(input),()=>deleteGoogleCalendarEvent(owner,"fictitious","original"),()=>addMeetToGoogleCalendarEvent(input)])("rechecks cutover immediately before old Calendar effects",async action=>{
 // Simulate activation after the old client has acquired its access credential.
 vi.spyOn(google.auth.OAuth2.prototype,"setCredentials").mockImplementation(function(this:InstanceType<typeof google.auth.OAuth2>,credentials){this.credentials=credentials;if(credentials.access_token)activated=true;});
 await expect(action()).rejects.toThrow("GOOGLE_GLOBAL_DISABLED");expect(m.effect).not.toHaveBeenCalled();
});
it("does not save a legacy refresh that arrives after scoped activation",async()=>{
 m.read.mockResolvedValue({data:{user_id:owner,access_token:"fictitious-access",refresh_token:"fictitious-refresh",expires_at:"2000-01-01T00:00:00Z"},error:null});
 vi.spyOn(google.auth.OAuth2.prototype,"refreshAccessToken").mockImplementation(async()=>{activated=true;return {credentials:{access_token:"fictitious-delayed",expiry_date:Date.now()+3600_000},res:null as never};});
 await expect(getValidClient(owner)).rejects.toThrow("GOOGLE_GLOBAL_DISABLED");expect(m.write).not.toHaveBeenCalled();
});
it.each(["exchange","refresh","revoke"] as const)("prevents SDK retries of %s after cutover with a real OAuth transport",async operation=>{
 vi.mocked(google.auth.OAuth2.prototype.getToken).mockRestore();vi.mocked(google.auth.OAuth2.prototype.refreshAccessToken).mockRestore();vi.mocked(google.auth.OAuth2.prototype.revokeCredentials).mockRestore();
 const client=await getLegacyAuthClient(owner);client.setCredentials({access_token:"fictitious-access",refresh_token:"fictitious-refresh"});
 const transport=vi.fn();
 client.transporter.defaults.adapter=async(options)=>{
  transport(options);
  activated=true;
  return Object.assign(new Response('{"error":"fictitious temporary failure"}',{status:503,statusText:"Unavailable"}),{config:options,data:{error:"fictitious temporary failure"}}) as never;
 };
 const action=operation==="exchange"?client.getToken("fictitious-code"):operation==="refresh"?client.refreshAccessToken():client.revokeCredentials();
 await expect(action).rejects.toMatchObject({response:{status:503}});expect(transport).toHaveBeenCalledOnce();
 const options=transport.mock.calls[0][0];expect(options.retry).toBe(false);expect(options.retryConfig.retry).toBe(0);expect(options.timeout).toBe(15000);expect(options.signal).toBeInstanceOf(AbortSignal);
});
