import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { proxy } from "./proxy";
afterEach(() => vi.unstubAllEnvs());
it("allows the administrator to log in again with a revoked or legacy cookie present", async () => {
  const key = "fixture-proxy-admin-signing-key-only";
  vi.stubEnv("JWT_SECRET", key);
  const token = await new SignJWT({ sub: "admin", role: "admin" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("7d").sign(new TextEncoder().encode(key));
  const response = await proxy(new NextRequest("https://zelo.example/admin/login", { headers: { cookie: `ca_admin=${token}` } }));
  expect(response.status).toBe(200);
  expect(response.headers.get("location")).toBeNull();
});
it("continues requiring client authentication for the dashboard", async () => {
  const response = await proxy(new NextRequest("https://zelo.example/dashboard"));
  expect(response.headers.get("location")).toBe("https://zelo.example/login");
});
it.each([undefined,"https://evil.example","null"])("rejects cookie API mutation from origin %s", async origin=>{
 const response=await proxy(new NextRequest("https://zelo.example/api/me",{method:"PATCH",headers:origin?{origin}:{}}));
 expect(response.status).toBe(403);
});
it("accepts same-origin API mutation and leaves authorization to the route",async()=>{
 const response=await proxy(new NextRequest("https://zelo.example/api/me",{method:"PATCH",headers:{origin:"https://zelo.example","sec-fetch-site":"same-origin"}}));
 expect(response.status).toBe(200);
});
it.each(["/api/webhook/waba","/api/webhook/open-finance","/api/webhook/evolution","/api/webhook/billing/fixture","/api/cron/reminders","/api/cron/open-finance"])("keeps independently authenticated service endpoint %s available",async path=>{
 expect((await proxy(new NextRequest(`https://zelo.example${path}`,{method:"POST"}))).status).toBe(200);
});
it("rejects cross-site fetch metadata even with a matching Origin",async()=>{
 expect((await proxy(new NextRequest("https://zelo.example/api/admin/whatsapp",{method:"PUT",headers:{origin:"https://zelo.example","sec-fetch-site":"cross-site"}}))).status).toBe(403);
});
it("uses the configured website origin behind the container reverse proxy",async()=>{
 vi.stubEnv("NODE_ENV","production");vi.stubEnv("APP_ORIGIN","https://zelo.example");
 expect((await proxy(new NextRequest("http://0.0.0.0:80/api/me",{method:"PATCH",headers:{origin:"https://zelo.example"}}))).status).toBe(200);
});
it("fails closed for production API writes without a configured origin",async()=>{
 vi.stubEnv("NODE_ENV","production");vi.stubEnv("APP_ORIGIN","");vi.stubEnv("OPEN_FINANCE_APP_ORIGIN","");
 expect((await proxy(new NextRequest("https://zelo.example/api/me",{method:"PATCH",headers:{origin:"https://zelo.example"}}))).status).toBe(403);
});
