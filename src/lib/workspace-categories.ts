import "server-only";
import {companyScopeFor} from "./company-context";
import {updateCompanyCategories} from "./companies";
import {updateUser,type User} from "./users";
export async function workspaceCategoryUser<T extends Pick<User,"id"|"customCategoriesExpense"|"customCategoriesIncome">>(user:T):Promise<T>{
 const scope=await companyScopeFor(user.id);
 return scope?.mode==="business"?{...user,customCategoriesExpense:scope.customCategoriesExpense??[],customCategoriesIncome:scope.customCategoriesIncome??[]}:user;
}
export async function saveWorkspaceCategories(userId:string,patch:{customCategoriesExpense?:string[];customCategoriesIncome?:string[]}):Promise<void>{
 const scope=await companyScopeFor(userId);
 if(scope?.mode==="business")await updateCompanyCategories(userId,scope.companyId,patch);
 else await updateUser(userId,patch);
}
