import "server-only";
/** Limit actual bytes while streaming, not after an unbounded body allocation. */
export async function readBankBody(message:Request|Response,maxBytes:number):Promise<Buffer> {
  const declared=Number(message.headers.get("content-length"));
  if(Number.isFinite(declared)&&declared>maxBytes)throw new Error("BODY_TOO_LARGE");
  if(!message.body)return Buffer.alloc(0);
  const reader=message.body.getReader(), chunks:Uint8Array[]=[];
  let size=0;
  try {
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new Error("BODY_TOO_LARGE");}chunks.push(value);}
  }finally{reader.releaseLock();}
  return Buffer.concat(chunks,size);
}
