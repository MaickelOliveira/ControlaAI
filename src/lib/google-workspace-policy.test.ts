import { describe, expect, it } from "vitest";
import type { CompanyScope } from "./company-scope-policy";
import { googleWorkspaceFromContext, googleWorkspaceKey, assertGoogleWorkspaceMatch } from "./google-workspace-policy";

const ownerA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ownerB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const companyA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const companyB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
type Workspace = {userId: string; mode: "personal" | "business"; companyId: string | null};

function context(patch: Partial<CompanyScope> = {}): CompanyScope {
  return {
    userId: ownerA, mode: "business", companyId: companyA, allowBusiness: true, allowPersonal: true,
    companyName: "Empresa de nome fictício", archivedCompanyIds: [], ...patch,
  };
}

const personal: Workspace = {userId: ownerA, mode: "personal", companyId: null};
const enterpriseA: Workspace = {userId: ownerA, mode: "business", companyId: companyA};
const enterpriseB: Workspace = {userId: ownerA, mode: "business", companyId: companyB};
const workspaces: Workspace[] = [
  personal, enterpriseA, enterpriseB,
  {userId: ownerB, mode: "personal", companyId: null},
  {userId: ownerB, mode: "business", companyId: companyA},
  {userId: ownerB, mode: "business", companyId: companyB},
];

describe("Google workspace resolution from an authorized owner context", () => {
  it("returns a business tuple with stable IDs rather than the displayed company name", () => {
    expect(googleWorkspaceFromContext(ownerA, context())).toEqual(enterpriseA);
    expect(googleWorkspaceFromContext(ownerA, context({companyName: "Empresa renomeada fictícia"}))).toEqual(enterpriseA);
    expect(googleWorkspaceFromContext(ownerA, context({companyId: companyB}))).toEqual(enterpriseB);
  });

  it("keeps Personal independent of a remembered or archived company even when Business access is denied", () => {
    for (const remembered of [companyA, companyB]) {
      const selected = context({
        mode: "personal", companyId: remembered, archivedCompanyIds: [remembered], allowBusiness: false,
        companyName: "Empresa arquivada lembrada fictícia",
      });
      expect(googleWorkspaceFromContext(ownerA, selected)).toEqual(personal);
    }
  });

  it("denies Personal explicitly without allowing Business permission to override it", () => {
    expect(() => googleWorkspaceFromContext(ownerA, context({mode: "personal", allowPersonal: false}))).toThrow();
  });

  it("allows Business independently of denied Personal access", () => {
    expect(googleWorkspaceFromContext(ownerA, context({allowPersonal: false}))).toEqual(enterpriseA);
  });

  it("keeps the existing optional-permission contract when access flags are absent", () => {
    const selected = context();
    delete selected.allowBusiness;
    delete selected.allowPersonal;
    expect(googleWorkspaceFromContext(ownerA, selected)).toEqual(enterpriseA);
    expect(googleWorkspaceFromContext(ownerA, {...selected, mode: "personal"})).toEqual(personal);
  });

  it("denies a selected archived company even if Business access was previously allowed", () => {
    expect(() => googleWorkspaceFromContext(ownerA, context({archivedCompanyIds: [companyB, companyA]}))).toThrow();
    expect(() => googleWorkspaceFromContext(ownerA, context({archivedCompanyIds: [companyA.toUpperCase()]}))).toThrow();
  });

  it("denies Business access without falling back to Personal or another company", () => {
    expect(() => googleWorkspaceFromContext(ownerA, context({allowBusiness: false}))).toThrow();
  });

  it("rejects another owner's context even when clients have identical displayed company names", () => {
    const foreign = context({userId: ownerB, companyName: "Empresa de nome fictício"});
    expect(() => googleWorkspaceFromContext(ownerA, foreign)).toThrow();
    const authorizedForeign = googleWorkspaceFromContext(ownerB, foreign);
    expect(authorizedForeign).toEqual({userId: ownerB, mode: "business", companyId: companyA});
    expect(googleWorkspaceKey(authorizedForeign)).not.toBe(googleWorkspaceKey(enterpriseA));
  });

  it("normalizes matching uppercase UUIDs without mutating the context or its archived list", () => {
    const selected = context({userId: ownerA.toUpperCase(), companyId: companyA.toUpperCase(), archivedCompanyIds: [companyB.toUpperCase()]});
    const before = structuredClone(selected);
    Object.freeze(selected.archivedCompanyIds);
    Object.freeze(selected);
    expect(googleWorkspaceFromContext(ownerA, selected)).toEqual(enterpriseA);
    expect(googleWorkspaceFromContext(ownerA.toUpperCase(), selected)).toEqual(enterpriseA);
    expect(selected).toEqual(before);
  });

  it.each(["personal","business"] as const)("rejects missing archived identities in a sparse array for %s", mode => {
    expect(() => googleWorkspaceFromContext(ownerA, context({mode,archivedCompanyIds:new Array<string>(1)}))).toThrow();
  });

  it.each(["personal","business"] as const)("returns an immutable fresh authority tuple for %s", mode => {
    const selected=context({mode});
    const workspace=googleWorkspaceFromContext(ownerA,selected);
    expect(Object.isFrozen(workspace)).toBe(true);
    expect(workspace).not.toBe(selected);
    expect(Object.isFrozen(selected)).toBe(false);
  });

  it.each([
    {label: "missing context", input: undefined},
    {label: "null context", input: null},
    {label: "array context", input: []},
    {label: "array with scope properties", input: Object.assign([], context())},
    {label: "string context", input: "business"},
    {label: "boolean context", input: true},
    {label: "empty object", input: {}},
    {label: "missing owner", input: {mode: "business", companyId: companyA, allowBusiness: true}},
    {label: "missing mode", input: {userId: ownerA, companyId: companyA, allowBusiness: true}},
    {label: "missing business company", input: {userId: ownerA, mode: "business", allowBusiness: true}},
    {label: "trusted context without owner", input: {trusted: true}},
    {label: "trusted Personal context without owner", input: {trusted: true, mode: "personal", companyId: companyA}},
    {label: "invalid context owner UUID", input: context({userId: "not-a-uuid"})},
    {label: "invalid business company UUID", input: context({companyId: "not-a-uuid"})},
    {label: "missing business company value", input: {...context(), companyId: null}},
    {label: "empty business company value", input: context({companyId: ""})},
    {label: "invalid mode", input: {...context(), mode: "shared"}},
    {label: "uppercase mode", input: {...context(), mode: "BUSINESS"}},
    {label: "non-string mode", input: {...context(), mode: 1}},
    {label: "non-string owner", input: {...context(), userId: 1}},
    {label: "non-string business company", input: {...context(), companyId: []}},
    {label: "non-array archived companies", input: {...context(), archivedCompanyIds: companyB}},
    {label: "invalid archived company UUID", input: context({archivedCompanyIds: ["not-a-uuid"]})},
  ])("denies an invalid runtime context: $label", ({input}) => {
    expect(() => googleWorkspaceFromContext(ownerA, input as CompanyScope)).toThrow();
  });

  it.each([
    "", "not-a-uuid", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa", "gaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", null, undefined, 42, [], {},
  ])("denies an invalid authenticated owner rather than coercing it: %j", owner => {
    expect(() => googleWorkspaceFromContext(owner as string, context())).toThrow();
  });

  it.each([null, "true", 0, [], {}])("denies a malformed runtime permission flag: %j", flag => {
    const business: unknown = {...context(), allowBusiness: flag};
    const personal: unknown = {...context({mode: "personal"}), allowPersonal: flag};
    expect(() => googleWorkspaceFromContext(ownerA, business as CompanyScope)).toThrow();
    expect(() => googleWorkspaceFromContext(ownerA, personal as CompanyScope)).toThrow();
  });
});

describe("Google workspace keys depend only on the canonical authorization tuple", () => {
  it("keeps Personal and each business workspace distinct across different owners", () => {
    const keys = workspaces.map(workspace => googleWorkspaceKey(workspace));
    for (const key of keys) {
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    }
    expect(new Set(keys).size).toBe(workspaces.length);
  });

  it.each(workspaces)("produces a stable canonical key for $userId/$mode/$companyId", workspace => {
    const upper = {...workspace, userId: workspace.userId.toUpperCase(), companyId: workspace.companyId?.toUpperCase() ?? null};
    const reordered: Workspace = {companyId: workspace.companyId, mode: workspace.mode, userId: workspace.userId};
    const before = structuredClone(upper);
    Object.freeze(upper);
    const key = googleWorkspaceKey(workspace);
    expect(googleWorkspaceKey(upper)).toBe(key);
    expect(googleWorkspaceKey(reordered)).toBe(key);
    expect(googleWorkspaceKey({...workspace})).toBe(key);
    expect(upper).toEqual(before);
  });

  it("does not use or include a company name, even if a caller attaches extra display fields", () => {
    const original = {...enterpriseA, companyName: "Empresa fictícia nome original", ownerName: "Titular fictício"};
    const renamed = {...enterpriseA, companyName: "Empresa fictícia renomeada", ownerName: "Titular com nome alterado"};
    const key = googleWorkspaceKey(original);
    expect(key).toBe(googleWorkspaceKey(renamed));
    expect(key).toBe(googleWorkspaceKey(enterpriseA));
    expect(key).not.toContain(original.companyName);
    expect(key).not.toContain(original.ownerName);
    expect(key).not.toBe(googleWorkspaceKey({...original, companyId: companyB}));
    expect(key).not.toBe(googleWorkspaceKey({...original, userId: ownerB}));
  });
});

describe("Google event and grant references must match the authorized workspace", () => {
  it.each(workspaces)("accepts an exact matching reference for $userId/$mode/$companyId", workspace => {
    expect(() => assertGoogleWorkspaceMatch(workspace, {...workspace})).not.toThrow();
  });

  it("compares canonical UUIDs and ignores displayed names without mutating either reference", () => {
    const expected = {...enterpriseA, companyName: "Nome anterior fictício"};
    const stored = {...enterpriseA, userId: ownerA.toUpperCase(), companyId: companyA.toUpperCase(), companyName: "Nome atual fictício"};
    const beforeExpected = structuredClone(expected), beforeStored = structuredClone(stored);
    Object.freeze(expected);
    Object.freeze(stored);
    expect(() => assertGoogleWorkspaceMatch(expected, stored)).not.toThrow();
    expect(expected).toEqual(beforeExpected);
    expect(stored).toEqual(beforeStored);
  });

  it.each(workspaces)("rejects every different owner/mode/company reference for $userId/$mode/$companyId", expected => {
    for (const stored of workspaces.filter(workspace => workspace.userId !== expected.userId || workspace.mode !== expected.mode || workspace.companyId !== expected.companyId)) {
      expect(() => assertGoogleWorkspaceMatch(expected, stored)).toThrow();
    }
  });

  it("does not silently rewrite an event's business provenance to the owner's current Personal workspace", () => {
    expect(() => assertGoogleWorkspaceMatch(personal, enterpriseA)).toThrow();
    expect(() => assertGoogleWorkspaceMatch(enterpriseB, enterpriseA)).toThrow();
    expect(() => assertGoogleWorkspaceMatch(enterpriseA, personal)).toThrow();
  });
});

describe("keys and comparisons validate runtime tuples rather than relying on TypeScript", () => {
  it.each([
    {label: "null workspace", input: null},
    {label: "missing workspace", input: undefined},
    {label: "array workspace", input: []},
    {label: "array with identity fields", input: Object.assign([], enterpriseA)},
    {label: "string workspace", input: "personal"},
    {label: "empty workspace", input: {}},
    {label: "missing owner", input: {mode: "personal", companyId: null}},
    {label: "missing mode", input: {userId: ownerA, companyId: companyA}},
    {label: "missing Personal company field", input: {userId: ownerA, mode: "personal"}},
    {label: "missing Business company field", input: {userId: ownerA, mode: "business"}},
    {label: "invalid owner UUID", input: {...personal, userId: "not-a-uuid"}},
    {label: "non-string owner", input: {...personal, userId: 42}},
    {label: "Personal with a remembered company", input: {...personal, companyId: companyA}},
    {label: "Personal with an empty company string", input: {...personal, companyId: ""}},
    {label: "Business with null company", input: {...enterpriseA, companyId: null}},
    {label: "Business with invalid company UUID", input: {...enterpriseA, companyId: "not-a-uuid"}},
    {label: "Business with non-string company", input: {...enterpriseA, companyId: {id: companyA}}},
    {label: "invalid mode", input: {...enterpriseA, mode: "shared"}},
    {label: "null mode", input: {...enterpriseA, mode: null}},
    {label: "trusted context without identity", input: {trusted: true}},
  ])("rejects $label in keys and on either side of a reference comparison", ({input}) => {
    const invalid = input as Workspace;
    expect(() => googleWorkspaceKey(invalid)).toThrow();
    expect(() => assertGoogleWorkspaceMatch(personal, invalid)).toThrow();
    expect(() => assertGoogleWorkspaceMatch(invalid, personal)).toThrow();
  });
});
