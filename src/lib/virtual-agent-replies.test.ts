import {describe,expect,it} from "vitest";
import {decorateVirtualAgentReply,lastIntroducedAgent,runWithVirtualAgentReply,setConversationAgent,setVirtualAgentIdentity,setVirtualAgentIntent} from "./virtual-agent-replies";

describe("apresentação só quando o agente muda",()=>{
  const history=[
    {role:"assistant",content:"Ei, *Ana*! Sou a *Rita*, sua agente virtual de finanças da Zelo. 👋\n\n✅ Registrado."},
    {role:"user",content:"valeu"},
    {role:"assistant",content:"✅ Lançamento atualizado!"},
  ];
  it("descobre no histórico quem falou por último",()=>{
    expect(lastIntroducedAgent(history)).toBe("Rita");
    expect(lastIntroducedAgent([{role:"assistant",content:"¡Hola, *Ana*! Soy *Bia*, tu agente virtual de recordatorios de Zelo. 👋"}])).toBe("Bia");
    expect(lastIntroducedAgent([{role:"user",content:"Sou a *Rita*"}])).toBeUndefined();
    expect(lastIntroducedAgent([])).toBeUndefined();
  });
  it("o mesmo agente responde direto; outro agente se apresenta",()=>{
    runWithVirtualAgentReply("phone-a",()=>{
      setVirtualAgentIdentity("Ana","pt-BR");setConversationAgent(lastIntroducedAgent(history));
      setVirtualAgentIntent("finance_register");
      expect(decorateVirtualAgentReply("phone-a","✅ Registrado.")).toBe("✅ Registrado.");
      setVirtualAgentIntent("reminder_set");
      expect(decorateVirtualAgentReply("phone-a","🔔 Lembrete criado.")).toContain("*Bia*");
      expect(decorateVirtualAgentReply("phone-a","Outro aviso")).toBe("Outro aviso");
    });
  });
  it("ignora nomes que não são de agentes",()=>{
    runWithVirtualAgentReply("phone-a",()=>{
      setVirtualAgentIdentity("Ana","pt-BR");setConversationAgent("Fulano");setVirtualAgentIntent("finance_register");
      expect(decorateVirtualAgentReply("phone-a","✅ Registrado.")).toContain("*Rita*");
    });
  });
});

describe("request-scoped agent replies",()=>{
  it("adds Rita and the registered name while keeping the entire transaction receipt",()=>{
    runWithVirtualAgentReply("phone-a",()=>{
      setVirtualAgentIdentity("Ana Silva","pt-BR");setVirtualAgentIntent("finance_register");
      const receipt="✅ Registrado.\n💸 R$ 50,00\n🏷️ Saúde\n📝 Farmácia\n📊 Saldo: R$ 120,00";
      const reply=decorateVirtualAgentReply("phone-a",receipt);
      expect(reply).toContain("*Ana*");expect(reply).toContain("*Rita*");expect(reply).toContain("agente virtual");
      expect(reply.endsWith(receipt)).toBe(true);
      expect(decorateVirtualAgentReply("phone-a","Segundo item")).toBe("Segundo item");
    });
  });
  it("never turns a missing-information question or error into a success",()=>{
    runWithVirtualAgentReply("phone-a",()=>{
      setVirtualAgentIdentity("João","pt-BR");setVirtualAgentIntent("agenda_create");
      const reply=decorateVirtualAgentReply("phone-a","Qual é o horário? Nada foi agendado ainda.");
      expect(reply).toContain("*Lucas*");expect(reply.endsWith("Qual é o horário? Nada foi agendado ainda.")).toBe(true);
      expect(reply).not.toContain("já agendei");
    });
  });
  it("does not alter unsolicited notices or messages sent to a different recipient",()=>{
    expect(decorateVirtualAgentReply("phone-a","Aviso")).toBe("Aviso");
    runWithVirtualAgentReply("phone-a",()=>{
      setVirtualAgentIdentity("Ana","pt-BR");
      expect(decorateVirtualAgentReply("phone-b","Convite")).toBe("Convite");
    });
  });
  it("isolates simultaneous customers and languages",async()=>{
    const replies=await Promise.all([
      runWithVirtualAgentReply("phone-a",async()=>{setVirtualAgentIdentity("Ana","es");await Promise.resolve();setVirtualAgentIntent("finance_query");return decorateVirtualAgentReply("phone-a","Saldo: 10");}),
      runWithVirtualAgentReply("phone-b",async()=>{setVirtualAgentIdentity("Bruno","pt-BR");await Promise.resolve();setVirtualAgentIntent("agenda_list");return decorateVirtualAgentReply("phone-b","Agenda vazia");}),
    ]);
    expect(replies[0]).toContain("¡Hola, *Ana*!");expect(replies[0]).not.toContain("Bruno");
    expect(replies[1]).toContain("*Bruno*");expect(replies[1]).toContain("*Lucas*");expect(replies[1]).not.toContain("Ana");
  });
});
