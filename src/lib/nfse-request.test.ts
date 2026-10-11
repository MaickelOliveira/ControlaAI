import { expect, it } from "vitest";
import { boundedFiscalRequest } from "./nfse-request";
it("bounds streamed requests even without Content-Length", async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(6)); controller.enqueue(new Uint8Array(6)); controller.close(); } });
  const request = new Request("https://zelo.test/api/nfse", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  await expect(boundedFiscalRequest(request, 10)).rejects.toThrow("tamanho permitido");
});
it("preserves a bounded JSON or multipart body for parsing", async () => {
  const request = new Request("https://zelo.test/api/nfse", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"action":"draft"}' });
  expect(await (await boundedFiscalRequest(request, 100)).json()).toEqual({ action: "draft" });
  const form = new FormData(); form.set("certificate", new File(["test-only"], "fixture.pfx"));
  const result = await boundedFiscalRequest(new Request("https://zelo.test/api/nfse/certificate", { method: "POST", body: form }), 1000);
  expect((await result.formData()).get("certificate")).toBeInstanceOf(File);
});
