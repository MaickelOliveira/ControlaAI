import UiIcon from "./UiIcon";
export default function FinanceAuthor({name}:{name?:string}){
  if(!name)return null;
  return <span className="z-finance-author"><UiIcon name="person"/>Registrado por <strong>{name}</strong></span>;
}
