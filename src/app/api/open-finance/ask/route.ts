import {NextResponse} from "next/server";
import {getSessionWithUser} from "@/lib/auth";
import {openFinanceRequestScope,OF_HEADERS} from "@/lib/open-finance-http";
import {readBankBody} from "@/lib/open-finance-body";
import {answerBankQuestion} from "@/lib/open-finance-question";
import {todayStrBR} from "@/lib/date-br";
export async function POST(request:Request) {
  const scope=await openFinanceRequestScope(request,true);if(scope instanceof Response)return scope;
  const auth=await getSessionWithUser();if(!auth)return NextResponse.json({error:"Não autorizado"},{status:401,headers:OF_HEADERS});
  let question;
  try{question=JSON.parse((await readBankBody(request,2048)).toString("utf8")).question;if(typeof question!=="string"||!question.trim()||question.length>500)throw new Error();}catch{return NextResponse.json({error:"Escreva uma pergunta de até 500 caracteres."},{status:400,headers:OF_HEADERS});}
  const answer=await answerBankQuestion(auth.user,scope.mode,question,todayStrBR());
  return NextResponse.json({answer:answer??"Na prévia posso consultar saldos bancários, limites, investimentos, faturas e compras de todos os cartões neste mês ou no mês passado. Para um banco específico, veja os dados em Contas. Outras perguntas financeiras continuam disponíveis na conversa habitual da Zelo."},{headers:OF_HEADERS});
}
