import "server-only";
import type {google} from "googleapis";

/** Bound every OAuth/identity transport before Gaxios prepares its AbortSignal.
 * SDK methods may explicitly enable retry, so the interceptor also denies it. */
export function boundGoogleTransport<T extends InstanceType<typeof google.auth.OAuth2>>(client:T):T{
 client.transporter.defaults.timeout=15000;
 client.transporter.interceptors.request.add({resolved:async options=>{
  options.retry=false;options.retryConfig={retry:0};options.timeout=15000;return options;
 }});
 return client;
}
