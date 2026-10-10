import {expect,it,vi,afterEach} from "vitest";
vi.mock("server-only",()=>({}));
import {canReadBanksFromPhone} from "./open-finance-phone";
afterEach(()=>vi.unstubAllEnvs());
it("keeps the channel closed and never shares bank data with a linked number",()=>{
  expect(canReadBanksFromPhone("5511998765432","5511998765432")).toBe(false);
  vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED","true");
  expect(canReadBanksFromPhone("+55 (11) 99876-5432","5511998765432")).toBe(true);
  expect(canReadBanksFromPhone("5511998765432","5511987654321")).toBe(false);
  expect(canReadBanksFromPhone("","")).toBe(false);
});
