import {runInNewContext} from "node:vm";
import {describe,expect,it} from "vitest";
import {themeInitScript,THEME_STORAGE_KEY} from "./theme";

describe("appearance preference at first paint",()=>{
  function firstPaint(value: string|null,blocked=false){
    const document={documentElement:{dataset:{} as Record<string,string>}};
    runInNewContext(themeInitScript,{document,localStorage:{getItem:(key:string)=>{expect(key).toBe(THEME_STORAGE_KEY);if(blocked)throw Error("blocked");return value;}}});
    return document.documentElement.dataset.theme;
  }
  it("restores dark before the application renders",()=>expect(firstPaint("dark")).toBe("dark"));
  it("keeps the requested light appearance",()=>expect(firstPaint("light")).toBe("light"));
  it("uses light for a missing or invalid preference",()=>{expect(firstPaint(null)).toBe("light");expect(firstPaint("anything")).toBe("light");});
  it("renders even when the browser blocks storage",()=>expect(firstPaint(null,true)).toBe("light"));
});
