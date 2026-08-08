/**
 * Regressão manual do classificador de intents do bot (ai-processor.ts).
 *
 * Roda cada mensagem de scripts/fixtures/intent-regression.json contra o
 * Gemini de verdade (precisa de GEMINI_API_KEY configurada — em
 * data/whatsapp-config.json ou na env var) e confere se os campos
 * esperados batem com o que a IA devolveu.
 *
 * Uso: npx tsx scripts/prompt-regression.ts
 *
 * Rode isso ANTES de editar o prompt em ai-processor.ts pra ter um baseline
 * (redirecione a saída pra um arquivo), edite o prompt, rode de novo e
 * compare — garante que uma mudança não regrediu classificações que já
 * funcionavam.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { processMessage } from "../src/lib/ai-processor";

type Fixture = { message: string; expect: Record<string, unknown> };

function deepMatches(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== "object") return actual === expected;
  if (typeof actual !== "object" || actual === null) return false;
  return Object.entries(expected as Record<string, unknown>).every(([k, v]) =>
    deepMatches((actual as Record<string, unknown>)[k], v)
  );
}

async function main() {
  const fixturesPath = join(__dirname, "fixtures", "intent-regression.json");
  const fixtures: Fixture[] = JSON.parse(readFileSync(fixturesPath, "utf-8"));

  let pass = 0;
  let fail = 0;

  for (const fx of fixtures) {
    const result = await processMessage(fx.message);
    const ok = deepMatches(result, fx.expect);
    if (ok) {
      pass++;
      console.log(`✅ "${fx.message}"`);
    } else {
      fail++;
      console.log(`❌ "${fx.message}"`);
      console.log(`   esperado: ${JSON.stringify(fx.expect)}`);
      console.log(`   recebido: ${JSON.stringify(result)}`);
    }
  }

  console.log(`\n${pass}/${fixtures.length} passaram (${fail} falharam)`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
