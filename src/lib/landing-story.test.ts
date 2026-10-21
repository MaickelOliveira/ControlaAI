import { describe, expect, it } from "vitest";
import { AGENT_SCENES, STORY_SCENES, storyFrame, storyScrollTarget, expenseJourney, routineJourney, ROUTINE_REQUESTS } from "./landing-story";
import { VIRTUAL_TEAM } from "./virtual-team";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const geometry = { top: 0, height: 15000, viewport: 900 };

describe("apresentação da equipe controlada pela rolagem", () => {
  it("apresenta todos os agentes reais uma única vez entre abertura e conclusão", () => {
    expect(STORY_SCENES).toHaveLength(13);
    expect(AGENT_SCENES).toHaveLength(12);
    expect(AGENT_SCENES.map(agent => agent.name).sort()).toEqual(Object.values(VIRTUAL_TEAM).map(agent => agent.name).sort());
    for (const agent of AGENT_SCENES) {
      expect(agent.name).toBe(VIRTUAL_TEAM[agent.key].name);
      expect(agent.role).toBe(VIRTUAL_TEAM[agent.key].role);
    }
  });

  it("usa um arquivo e uma imagem diferente para cada agente", () => {
    expect(new Set(AGENT_SCENES.map(agent => agent.portrait)).size).toBe(12);
    const hashes = AGENT_SCENES.map(agent => createHash("sha256").update(readFileSync(`public${agent.portrait}`)).digest("hex"));
    expect(new Set(hashes).size).toBe(12);
  });

  it("não promete emissão fiscal direta antes da homologação", () => {
    const otto = AGENT_SCENES.find(agent => agent.key === "nfse")!;
    expect(otto.detail).toMatch(/homologação/);
    expect(otto.exampleReply).toMatch(/rascunho/i);
  });

  it("mantém a abertura antes do palco e a conclusão depois dele", () => {
    expect(storyFrame(-200, geometry).position).toBe(0);
    expect(storyFrame(20000, geometry).position).toBe(12);
  });

  it("visita as 13 cenas e retorna às mesmas transições ao subir", () => {
    const points = Array.from({ length: 13 }, (_, i) => storyScrollTarget(i, geometry));
    const forward = points.map(y => storyFrame(y, geometry));
    const backward = [...points].reverse().map(y => storyFrame(y, geometry)).reverse();
    expect(backward).toEqual(forward);
    expect(forward.map(frame => frame.active)).toEqual(Array.from({ length: 13 }, (_, i) => i));
    for (let y = 0; y <= 14100; y += 37) {
      const frame = storyFrame(y, geometry);
      expect(frame.weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
      expect(frame.weights.filter(weight => weight > 0).length).toBeLessThanOrEqual(2);
      expect(frame.active).toBeGreaterThanOrEqual(0);
      expect(frame.active).toBeLessThan(13);
    }
  });

  it("controla a demonstração do produto em três etapas sem depender do histórico", () => {
    expect(storyFrame(20000, geometry, 3).position).toBe(2);
    const points = [0, 1, 2].map(i => storyScrollTarget(i, geometry, 3));
    expect(points.map(y => storyFrame(y, geometry, 3).active)).toEqual([0, 1, 2]);
    expect([...points].reverse().map(y => storyFrame(y, geometry, 3).active)).toEqual([2, 1, 0]);
  });

  it("digita, entra na conversa, transporta o gasto e apresenta o registro", () => {
    expect(expenseJourney(0).typed).toBe("Gastei ");
    expect(expenseJourney(.23).typing).toBe(1);
    expect(expenseJourney(.38).zoom).toBe(1);
    expect(expenseJourney(.57).travel).toBeGreaterThan(0);
    expect(expenseJourney(.57).travel).toBeLessThan(1);
    expect(expenseJourney(.57).reveal).toBe(0);
    expect(expenseJourney(1).reveal).toBe(1);
    const points = [0, .14, .3, .57, .8, 1];
    expect([...points].reverse().map(expenseJourney).reverse()).toEqual(points.map(expenseJourney));
  });

  it("mantém o mesmo destino ao redimensionar e limita geometria degenerada", () => {
    expect(storyFrame(100, { top: 0, height: 0, viewport: 0 }).position).toBe(12);
    const phone = { top: 0, height: 10500, viewport: 772 };
    expect(storyFrame(storyScrollTarget(8, phone), phone).active).toBe(8);
  });
});


describe("pedidos que saem da conversa", () => {
  it("organiza gasto, compromisso e documento nessa ordem", () => {
    expect(routineJourney(0).results).toEqual([0,0,0]);
    expect(routineJourney(.32).results).toEqual([1,0,0]);
    expect(routineJourney(.65).results).toEqual([1,1,0]);
    expect(routineJourney(1).results).toEqual([1,1,1]);
  });
  it("mantém pedido e resultado no mesmo assunto", () => {
    for(const [i,p] of [.32,.65,.99].entries()) {
      const frame=routineJourney(p);
      expect(frame.active).toBe(i);
      expect(frame.typing).toBe(1);
      expect(frame.typed).toBe(ROUTINE_REQUESTS[i]);
    }
  });
  it("volta aos mesmos resultados e à mesma digitação ao subir", () => {
    const points=[0,.08,.2,.32,.4,.55,.65,.75,.88,1];
    expect([...points].reverse().map(routineJourney).reverse()).toEqual(points.map(routineJourney));
    expect(routineJourney(-1)).toEqual(routineJourney(0));
    expect(routineJourney(2)).toEqual(routineJourney(1));
  });
});


it("entrega um resultado grande por vez no mobile e prepara a próxima conversa", () => {
  for(const p of [.305,.638,.99]) expect(routineJourney(p).mobileReveal).toBe(1);
  expect(routineJourney(.332).mobileReveal).toBeLessThan(.1);
  expect(routineJourney(.334).mobileReveal).toBe(0);
  expect(routineJourney(1).mobileReveal).toBe(1);
});
