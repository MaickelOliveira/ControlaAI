import type {CSSProperties} from "react";
const paths={
  person:"M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21v-3a8 8 0 0 1 16 0v3",
  business:"M4 21V3h12v18M16 9h4v12M8 7h4m-4 4h4m-4 4h4M9 21v-3h2v3M2 21h20",
  home:"m3 10 9-7 9 7M5 9v12h5v-6h4v6h5V9",
  finance:"M4 20V10m6 10V4m6 16v-8m5 8H2",
  wallet:"M4 5h14v4H5a2 2 0 0 1 0-4Zm0 0v14h17V9H5m12 4h4",
  task:"M8 4H5v17h14V4h-3M8 2h8v4H8Zm0 12 3 3 5-6",
  target:"M21 12a9 9 0 1 1-9-9m6 9a6 6 0 1 1-6-6m0 6 9-9m-5 0h5v5",
  car:"M4 15v4m16-4v4M3 15V9l3-5h12l3 5v6H3Zm0-6h18M6 12h2m8 0h2",
  bell:"M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3Zm5 3h4",
  folder:"M3 6h6l2 2h10v12H3V6Z",
  calendar:"M4 5h16v16H4V5Zm0 5h16M8 3v4m8-4v4M8 14h2m4 0h2",
  users:"M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-3a6 6 0 0 1 12 0v3m2-10a4 4 0 0 0 0-8m2 12a6 6 0 0 1 4 5v1",
  client:"M4 4h16v16H4V4Zm0 5h16M8 14h3m-3 3h6",
  settings:"m9 3-1 3-3 1-2 3 2 2v3l3 2 2-1 3 1 3-2v-3l2-2-2-3-3-1-1-3H9Zm3 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  cart:"M2 3h3l3 12h11l3-9H6m2 13h1m9 0h1",
  repeat:"M3 8h16l-4-4m4 4-4 4M21 16H5l4 4m-4-4 4-4",
  spark:"m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  arrow:"M4 12h16m-6-6 6 6-6 6",
  search:"M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm6-2 6 6",
} as const;
export type UiIconName=keyof typeof paths;
export default function UiIcon({name,className="h-5 w-5",style}:{name:UiIconName;className?:string;style?:CSSProperties}){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true"><path d={paths[name]}/></svg>;
}
