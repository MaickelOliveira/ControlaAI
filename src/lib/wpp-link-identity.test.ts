import {describe,expect,it} from "vitest";
import {initialLinkIdentity,nextLinkRelation} from "./wpp-link-identity";

describe("registered name when linking WhatsApp",()=>{
  it("uses the platform name for the first number without asking it again",()=>{
    expect(initialLinkIdentity("Ana Silva",0)).toEqual({step:"access",name:"Ana Silva",relation:"Titular"});
  });
  it("identifies an additional number's relationship before assigning somebody's name",()=>{
    expect(initialLinkIdentity("Ana Silva",1)).toEqual({step:"relation"});
    expect(nextLinkRelation({step:"relation"},"Ana Silva","titular")).toEqual({step:"access",name:"Ana Silva",relation:"Titular"});
    expect(nextLinkRelation({step:"relation"},"Ana Silva","marido")).toEqual({step:"name",relation:"Marido"});
  });
  it("keeps identities already collected by an older link flow",()=>{
    expect(nextLinkRelation({step:"relation",name:"Bruno"},"Ana Silva","marido")).toEqual({step:"access",name:"Bruno",relation:"Marido"});
  });
});
