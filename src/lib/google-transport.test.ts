import {google} from "googleapis";
import {expect,it,vi} from "vitest";
import {boundGoogleTransport} from "./google-transport";
it.each(["exchange","refresh","revoke","certificates"] as const)("bounds real SDK %s requests without retrying",async operation=>{
 const client=boundGoogleTransport(new google.auth.OAuth2({clientId:"fixture.apps.googleusercontent.com",clientSecret:"fictitious-secret",redirectUri:"https://fixture.invalid/callback"}));
 client.setCredentials({access_token:"fictitious-access",refresh_token:"fictitious-refresh"});const observed=vi.fn();
 client.transporter.defaults.adapter=async options=>{observed(options);return Object.assign(new Response('{"error":"fictitious failure"}',{status:503,statusText:"Unavailable"}),{config:options,data:{error:"fictitious failure"}}) as never;};
 const call=operation==="exchange"?client.getToken("fictitious-code"):operation==="refresh"?client.refreshAccessToken():operation==="revoke"?client.revokeCredentials():client.getFederatedSignonCertsAsync();
 await expect(call).rejects.toMatchObject({response:{status:503}});expect(observed).toHaveBeenCalledOnce();
 const options=observed.mock.calls[0][0];expect(options.timeout).toBe(15000);expect(options.signal).toBeInstanceOf(AbortSignal);expect(options.retry).toBe(false);expect(options.retryConfig.retry).toBe(0);
});
it("preserves caller credentials and headers while enforcing fixed transport bounds",async()=>{
 const client=boundGoogleTransport(new google.auth.OAuth2({clientId:"fixture.apps.googleusercontent.com"}));const observed=vi.fn();
 client.transporter.defaults.adapter=async options=>{observed(options);return Object.assign(new Response('{"scope":"openid"}',{status:200}),{config:options,data:{scope:"openid"}}) as never;};
 await client.getTokenInfo("fictitious-access");const options=observed.mock.calls[0][0];expect(options.headers.get("authorization")).toBe("Bearer fictitious-access");expect(options.timeout).toBe(15000);expect(options.retry).toBe(false);
});
