import { describe, expect, it } from "vitest";
import { storyFrame, storyScrollTarget } from "./landing-story";

const geometry = { top: 72, height: 7200, viewport: 900 };

describe("apresentação controlada pela rolagem", () => {
  it("mantém a abertura antes do palco e a conclusão depois dele", () => {
    expect(storyFrame(-200, geometry).position).toBe(0);
    expect(storyFrame(10000, geometry).position).toBe(5);
  });

  it("retorna exatamente às mesmas cenas e transições ao subir", () => {
    const points = [72, 1500, 2550, 3600, 4650, 5700];
    const forward = points.map(y => storyFrame(y, geometry));
    const backward = [...points].reverse().map(y => storyFrame(y, geometry)).reverse();
    expect(backward).toEqual(forward);
    expect(new Set(forward.map(frame => frame.active)).size).toBe(6);
  });

  it("mantém uma cena visível em toda a transição", () => {
    for (let y = 72; y <= 6372; y += 37) {
      const frame = storyFrame(y, geometry);
      expect(frame.weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
      expect(frame.weights.filter(weight => weight > 0).length).toBeLessThanOrEqual(2);
      expect(frame.active).toBeGreaterThanOrEqual(0);
      expect(frame.active).toBeLessThan(6);
    }
  });

  it("leva cada atalho à cena correspondente sem depender do histórico", () => {
    for (let scene = 0; scene < 6; scene++) {
      const y = storyScrollTarget(scene, geometry);
      expect(storyFrame(y, geometry).position).toBeCloseTo(scene);
      expect(storyFrame(y, geometry).active).toBe(scene);
    }
  });

  it("se mantém finita durante mudanças de tamanho e geometria degenerada", () => {
    expect(storyFrame(100, { top: 0, height: 0, viewport: 0 }).position).toBe(5);
    const phone = { top: 72, height: 6752, viewport: 844 };
    expect(storyFrame(storyScrollTarget(3, phone), phone).active).toBe(3);
  });
});
