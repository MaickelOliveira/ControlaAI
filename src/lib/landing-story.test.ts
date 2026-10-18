import { describe, expect, it } from "vitest";
import { AGENT_SCENES, STORY_SCENES, storyFrame, storyScrollTarget } from "./landing-story";
import { VIRTUAL_TEAM } from "./virtual-team";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const geometry = { top: 0, height: 15000, viewport: 900 };

describe("apresentação da equipe controlada pela rolagem", () => {
  it("apresenta todos os agentes reais uma única vez entre abertura e conclusão", () => {
    expect(STORY_SCENES).toHaveLength(14);
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
    expect(storyFrame(20000, geometry).position).toBe(13);
  });

  it("visita as 14 cenas e retorna às mesmas transições ao subir", () => {
    const points = Array.from({ length: 14 }, (_, i) => storyScrollTarget(i, geometry));
    const forward = points.map(y => storyFrame(y, geometry));
    const backward = [...points].reverse().map(y => storyFrame(y, geometry)).reverse();
    expect(backward).toEqual(forward);
    expect(forward.map(frame => frame.active)).toEqual(Array.from({ length: 14 }, (_, i) => i));
    for (let y = 0; y <= 14100; y += 37) {
      const frame = storyFrame(y, geometry);
      expect(frame.weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
      expect(frame.weights.filter(weight => weight > 0).length).toBeLessThanOrEqual(2);
      expect(frame.active).toBeGreaterThanOrEqual(0);
      expect(frame.active).toBeLessThan(14);
    }
  });

  it("mantém o mesmo destino ao redimensionar e limita geometria degenerada", () => {
    expect(storyFrame(100, { top: 0, height: 0, viewport: 0 }).position).toBe(13);
    const phone = { top: 0, height: 10500, viewport: 772 };
    expect(storyFrame(storyScrollTarget(8, phone), phone).active).toBe(8);
  });
});
