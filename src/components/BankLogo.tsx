"use client";
import {useState} from "react";
import Image from "next/image";
import {bankLogoUrl} from "@/lib/bank-logos";
import OpenFinanceIcon from "./OpenFinanceIcon";

export default function BankLogo({institutionId,logoUrl,size=40}:{institutionId?:string|null;logoUrl?:string|null;size?:number}) {
  const url=bankLogoUrl(institutionId,logoUrl),[failedUrl,setFailedUrl]=useState<string|null>(null);
  return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white text-slate-500" style={{width:size,height:size,padding:size<=28?3:6}}>
    {url&&failedUrl!==url?<Image src={url} alt="" width={size} height={size} unoptimized referrerPolicy="no-referrer" className="h-full w-full object-contain" onError={()=>setFailedUrl(url)}/>:<OpenFinanceIcon name="bank" className="h-2/3 w-2/3"/>}
  </span>;
}
