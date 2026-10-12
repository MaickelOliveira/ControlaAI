export type CreditPixAnswer={questionId:string;confirmed:boolean};
export function parseCreditPixAnswer(payload:unknown):CreditPixAnswer|undefined {
 if(typeof payload!=="string")return;
 const match=payload.match(/^zelo-credit-pix:([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}):(yes|no)$/);
 return match?{questionId:match[1],confirmed:match[2].toLowerCase()==="yes"}:undefined;
}
