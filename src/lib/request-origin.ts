/** Use a configured public origin behind a reverse proxy, never forwarded headers. */
export function isSameOrigin(request:Request,expectedOrigin?:string):boolean {
 const expected=expectedOrigin||new URL(request.url).origin;
 return request.headers.get("origin")===expected&&request.headers.get("sec-fetch-site")!=="cross-site";
}
