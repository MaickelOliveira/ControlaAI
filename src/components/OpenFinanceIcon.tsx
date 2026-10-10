const paths={
  bank:"M3 10h18M4 21h16M6 10v7m4-7v7m4-7v7m4-7v7M3 6l9-4 9 4v4H3V6Z",
  card:"M3 8h18M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm2 11h4",
  shield:"M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6",
  up:"M7 17 17 7M7 7h10v10",
  down:"M7 7 17 17M7 17h10V7",
  chart:"M4 20V10m6 10V4m6 16v-8m5 8H2",
  spark:"m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  plus:"M12 5v14M5 12h14",
  clock:"M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  refresh:"M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 2M4 17l2 2a8 8 0 0 0 13-3",
};
export default function OpenFinanceIcon({name,className="h-5 w-5"}:{name:keyof typeof paths;className?:string}) {
  return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]}/></svg>;
}
