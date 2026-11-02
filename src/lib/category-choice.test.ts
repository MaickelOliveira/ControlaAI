import {describe,expect,it} from "vitest";
import {asksCategoryChoices,categoryChoicesMessage,categoryCreateRequest,selectedCategory,validCategoryName} from "./category-choice";
describe("category selection and creation",()=>{
 it.each([
  ["cadastrar nova categoria",{name:""}],
  ["cadastrar categoria Viagens",{name:"Viagens"}],
  ["crie uma categoria de despesa: Café",{name:"Café",type:"expense"}],
  ["quero criar categoria de receita chamada Aulas",{name:"Aulas",type:"income"}],
  ["crear nueva categoría Viajes",{name:"Viajes"}],
 ])("parses the explicit creation request %s",(text,expected)=>expect(categoryCreateRequest(text)).toEqual(expected));
 it.each(["criar categorias A e B","gastei 40 no cartão em Outros","quanto gastei por categoria","cadastrar categorialazer"])("leaves unrelated or plural commands intact: %s",text=>expect(categoryCreateRequest(text)).toBeNull());
 it.each(["quais categorias?","quais são minhas categorias","escolher categoria","trocar categoria","cuáles son mis categorías"])("offers creation alongside existing choices: %s",text=>expect(asksCategoryChoices(text)).toBe(true));
 it("keeps detailed spending queries outside category selection",()=>expect(asksCategoryChoices("quanto gastei por categoria")).toBe(false));
 it("accepts only an exact existing custom category and keeps Outros available",()=>{
  expect(selectedCategory("categoria Café 2026",["Café 2026","Outros"])).toBe("Café 2026");
  expect(selectedCategory("Outros",["Café 2026","Outros"])).toBe("Outros");
  expect(selectedCategory("categoria Café",["Café 2026"])).toBeUndefined();
  expect(categoryChoicesMessage(["Outros","Café 2026"])).toContain("Cadastrar nova categoria");
 });
 it.each([null,17,"","  ","x".repeat(101),"Categoria\nNova"])("rejects invalid category names",name=>expect(validCategoryName(name)).toBe(false));
});
