import { it, expect } from "vitest";
import { findPublicProductImage } from "./web-image-search";

it("downloads the official Alma BB image through the production path", async () => {
  const found = await findPublicProductImage({ subject: "Alma BB Louis Vuitton", context: "" });
  console.log("LIVE_IMAGE_DIAGNOSTIC", found.result?.mimeType, found.result?.image.length, found.pageUrl);
  expect(found.result?.image.length).toBeGreaterThan(1000);
}, 45_000);
