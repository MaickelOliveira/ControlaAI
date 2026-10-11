import {describe,expect,it} from "vitest";
import {decorateVirtualAgentReply,runWithVirtualAgentReply,setVirtualAgentIdentity,setVirtualAgentIntent} from "./virtual-agent-replies";

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
