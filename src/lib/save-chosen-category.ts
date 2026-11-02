import "server-only";
import {workspaceCategoryUser,saveWorkspaceCategories} from "./workspace-categories";
import {getUserById} from "./users";
import {invalidateUserAuthCache} from "./auth";
import {CATEGORIES_EXPENSE,CATEGORIES_INCOME} from "./finances";
import {validCategoryName} from "./category-choice";
export async function saveChosenCategory(userId:string,name:string,types:readonly ("expense"|"income")[]){
 if(!validCategoryName(name))throw Error("CATEGORY_NAME_INVALID");
 const owner=await getUserById(userId);if(!owner)throw Error("CATEGORY_OWNER_UNAVAILABLE");
 const user=await workspaceCategoryUser(owner),trimmed=name.trim();
 const patch:{customCategoriesExpense?:string[];customCategoriesIncome?:string[]}={};
 let canonical=trimmed;
 for(const type of new Set(types)){
  const existing=type==="expense"?user.customCategoriesExpense??[]:user.customCategoriesIncome??[],defaults=type==="expense"?CATEGORIES_EXPENSE:CATEGORIES_INCOME;
  const match=[...defaults,...existing].find(value=>value.toLocaleLowerCase()===trimmed.toLocaleLowerCase());
  if(match){canonical=match;continue;}
  if(type==="expense")patch.customCategoriesExpense=[...existing,trimmed];else patch.customCategoriesIncome=[...existing,trimmed];
 }
 if(Object.keys(patch).length)await saveWorkspaceCategories(userId,patch);
 invalidateUserAuthCache(userId);return canonical;
}
