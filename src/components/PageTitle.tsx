import type {ReactNode} from "react";
import UiIcon,{UiIconName} from "./UiIcon";
export default function PageTitle({icon,children}:{icon:UiIconName;children:ReactNode}){
  return <h1 className="z-page-title"><span className="z-page-icon"><UiIcon name={icon}/></span>{children}</h1>;
}
