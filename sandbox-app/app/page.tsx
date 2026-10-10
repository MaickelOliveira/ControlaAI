import { cookies } from "next/headers";
import Preview from "./preview";
import { COOKIE, validSession } from "../access";
import Login from "./login";

export default async function Page() {
  if (!validSession((await cookies()).get(COOKIE)?.value)) return <Login />;
  return <Preview />;
}
