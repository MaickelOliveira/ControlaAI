import "server-only";
import {createGoogleWhatsAppConsumer} from "./google-whatsapp-consumer";

/** Lazy server-only wiring; the factory's dependencies remain injectable in
 * effect-free handler/slot tests. No shared mutable workspace is cached. */
export async function loadGoogleWhatsAppConsumer(){
 return createGoogleWhatsAppConsumer(await import("./google-event-service"));
}
