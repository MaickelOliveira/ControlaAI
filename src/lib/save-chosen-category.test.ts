import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({scope:vi.fn(),company:vi.fn(),owner:vi.fn(),update:vi.fn(),invalidate:vi.fn()}));
vi.mock("./company-context",()=>({companyScopeFor:m.scope}));
vi.mock("./companies",()=>({updateCompanyCategories:m.company}));
vi.mock("./users",()=>({getUserById:m.owner,updateUser:m.update}));
vi.mock("./auth",()=>({invalidateUserAuthCache:m.invalidate}));
import {saveChosenCategory} from "./save-chosen-category";
beforeEach(()=>{vi.resetAllMocks();m.scope.mockResolvedValue(undefined);m.update.mockResolvedValue({id:"owner"});m.owner.mockResolvedValue({id:"owner",customCategoriesExpense:["Pessoal"],customCategoriesIncome:[]});});
it("persists a personal choice for reuse and immediately invalidates auth validation",async()=>{
 expect(await saveChosenCategory("owner","  Café 2026  ",["expense"])).toBe("Café 2026");
 expect(m.update).toHaveBeenCalledExactlyOnceWith("owner",{customCategoriesExpense:["Pessoal","Café 2026"]});
 expect(m.invalidate).toHaveBeenCalledWith("owner");expect(m.company).not.toHaveBeenCalled();
});
it("uses only the selected company's categories without copying personal data",async()=>{
 m.scope.mockResolvedValue({userId:"owner",mode:"business",companyId:"company-b",customCategoriesExpense:["Empresa"],customCategoriesIncome:[]});
 await saveChosenCategory("owner","Nova",["expense"]);
 expect(m.company).toHaveBeenCalledExactlyOnceWith("owner","company-b",{customCategoriesExpense:["Empresa","Nova"]});expect(m.update).not.toHaveBeenCalled();
});
it("reuses existing defaults including Outros without renaming or duplicating them",async()=>{
 expect(await saveChosenCategory("owner","outros",["expense"])).toBe("Outros");
 expect(await saveChosenCategory("owner","pessoal",["expense"])).toBe("Pessoal");
 expect(m.update).not.toHaveBeenCalled();expect(m.company).not.toHaveBeenCalled();
});
it("can create a general category for both income and expenses in one write",async()=>{
 await saveChosenCategory("owner","Aulas",["expense","income"]);
 expect(m.update).toHaveBeenCalledExactlyOnceWith("owner",{customCategoriesExpense:["Pessoal","Aulas"],customCategoriesIncome:["Aulas"]});
});
it("rejects invalid names before storage and never invalidates after a failed write",async()=>{
 await expect(saveChosenCategory("owner","\nBad",["expense"])).rejects.toThrow("CATEGORY_NAME_INVALID");expect(m.owner).not.toHaveBeenCalled();
 m.update.mockRejectedValueOnce(Error("fixture write failure"));
 await expect(saveChosenCategory("owner","Nova",["expense"])).rejects.toThrow();expect(m.invalidate).not.toHaveBeenCalled();
});
