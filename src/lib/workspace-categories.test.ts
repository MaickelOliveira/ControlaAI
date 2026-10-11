import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({scope:vi.fn(),company:vi.fn(),user:vi.fn()}));
vi.mock("./company-context",()=>({companyScopeFor:m.scope}));
vi.mock("./companies",()=>({updateCompanyCategories:m.company}));
vi.mock("./users",()=>({updateUser:m.user}));
import {saveWorkspaceCategories,workspaceCategoryUser} from "./workspace-categories";
beforeEach(()=>{vi.clearAllMocks();});
it("reads and writes only selected-company categories in business mode",async()=>{
 m.scope.mockResolvedValue({mode:"business",companyId:"second",customCategoriesExpense:["Consultoria"],customCategoriesIncome:[]});
 const user={id:"owner",customCategoriesExpense:["Pessoal"],customCategoriesIncome:[]};
 expect((await workspaceCategoryUser(user)).customCategoriesExpense).toEqual(["Consultoria"]);
 await saveWorkspaceCategories("owner",{customCategoriesExpense:["Nova"]});
 expect(m.company).toHaveBeenCalledWith("owner","second",{customCategoriesExpense:["Nova"]});expect(m.user).not.toHaveBeenCalled();
 expect(user.customCategoriesExpense).toEqual(["Pessoal"]);
});
it("keeps personal and disabled-feature category behavior",async()=>{
 const user={id:"owner",customCategoriesExpense:["Pessoal"],customCategoriesIncome:[]};m.scope.mockResolvedValue(undefined);
 expect(await workspaceCategoryUser(user)).toBe(user);await saveWorkspaceCategories("owner",{customCategoriesIncome:["Presente"]});expect(m.user).toHaveBeenCalled();expect(m.company).not.toHaveBeenCalled();
});
