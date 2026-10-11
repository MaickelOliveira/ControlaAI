import {describe,expect,it} from "vitest";
import {agentForIntent,agentForPendingAction,isVirtualTeamQuestion,registeredFirstName,replyVirtualTeam} from "./virtual-team";

describe("virtual team presentation",()=>{
  it.each([
    ["finance_register","Rita"],["balance_query","Rita"],["recurring_create","Rita"],
    ["agenda_create","Lucas"],["meet_create","Lucas"],["task_create","Theo"],
    ["goal_query","Nina"],["vehicle_expense","Caio"],["reminder_set","Bia"],
    ["drive_search","Dora"],["grocery_purchase","Lia"],["customer_create","Clara"],
    ["contact_query","Clara"],["employee_list","Hugo"],["help","Zoe"],
  ])("identifies the responsible agent for %s",(intent,name)=>{
    expect(agentForIntent(intent).name).toBe(name);
  });
  it("keeps Lucas when a short answer resumes an appointment",()=>{
    expect(agentForPendingAction({type:"slot_fill",intent:"agenda_create"}).name).toBe("Lucas");
    expect(agentForPendingAction({type:"account_selection",ai:{intent:"finance_register"}}).name).toBe("Rita");
  });
  it("uses the registered name safely without creating WhatsApp formatting",()=>{
    expect(registeredFirstName("  *Ana*\nMaria  ")).toBe("Ana");
    expect(registeredFirstName("João-Pedro Silva")).toBe("João-Pedro");
  });
  it("explains the fictitious team without claiming separate permissions or execution",()=>{
    const team=replyVirtualTeam("pt-BR");
    expect(team).toContain("equipe virtual");
    expect(team).toContain("Rita");
    expect(team).toContain("Lucas");
    expect(team).not.toMatch(/já (?:anotei|agendei|registrei)/);
  });
  it("recognizes team questions without swallowing tasks that mention an agent's name",()=>{
    expect(isVirtualTeamQuestion("quem são os agentes da Zelo?")).toBe(true);
    expect(isVirtualTeamQuestion("equipe")).toBe(true);
    expect(isVirtualTeamQuestion("criar tarefa: ligar para Rita")).toBe(false);
  });
});
