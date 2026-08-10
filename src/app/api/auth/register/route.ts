import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "O cadastro é liberado somente após a confirmação do pagamento." },
    { status: 403 },
  );
}
