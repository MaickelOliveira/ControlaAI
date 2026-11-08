import UiIcon, { type UiIconName } from "@/components/UiIcon";
import type { AgentExample } from "./agent-examples";
import { AgentExampleControls } from "./AgentExampleControls";
import s from "./agent-example-preview.module.css";

const resultIcons = {
  finance: "wallet", agenda: "calendar", task: "task", reminder: "bell",
  drive: "folder", goal: "target", grocery: "cart", vehicle: "car",
  people: "person", employee: "users", nfse: "document", support: "search",
} satisfies Record<AgentExample["key"], UiIconName>;

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function readCents(value: string) {
  const match = /^R\$\s*([\d.]+,\d{2})$/.exec(value);
  return match ? Number(match[1].replace(/[.,]/g, "")) : NaN;
}

function ExpenseBreakdown({ rows }: Pick<AgentExample, "rows">) {
  const amounts = rows.map(row => readCents(row.value));
  if (!amounts.every(Number.isFinite) || !amounts.some(amount => amount > 0)) return null;

  return (
    <div className={s.breakdown} aria-hidden="true">
      {rows.map((row, index) => (
        <span key={row.label} style={{ flexGrow: amounts[index] }} />
      ))}
    </div>
  );
}

type Conversation = Pick<AgentExample, "key" | "request" | "resultTitle" | "rows" | "progress">;
type Choice = { label: string; answer: Conversation };

function goalChoices(example: AgentExample, name: string): Choice[] {
  const [target, saved, remaining] = example.rows;
  if (!target || !saved || !remaining) return [];
  const targetCents = readCents(target.value);
  const savedCents = readCents(saved.value);
  if (!(targetCents > 0) || !Number.isFinite(savedCents)) return [];

  const extraCents = 30_000;
  const newSaved = savedCents + extraCents;
  const percent = Math.round(100 * newSaved / targetCents);
  return [
    { label: "Reserva inicial", answer: example },
    {
      label: "Guardar mais R$ 300",
      answer: {
        ...example,
        request: `${name}, guardei mais R$ 300 para a viagem. Quanto já tenho e quanto falta agora?`,
        rows: [
          target,
          { ...saved, value: reais.format(newSaved / 100) },
          { ...remaining, value: reais.format(Math.max(0, targetCents - newSaved) / 100) },
        ],
        progress: { value: Math.min(percent, 100), label: `${percent}% da meta` },
      },
    },
  ];
}

function employeeChoices(example: AgentExample, name: string): Choice[] {
  const choices: Choice[] = [{ label: "Equipe", answer: example }];
  for (const row of example.rows) {
    const [person, role] = row.label.split(" · ");
    if (!role) continue;
    choices.push({
      label: person,
      answer: {
        ...example,
        request: `${name}, me mostre o cargo e o salário de ${person}.`,
        resultTitle: `Ficha de ${person}`,
        rows: [{ label: "Cargo", value: role }, { label: "Salário cadastrado", value: row.value }],
      },
    });
  }
  return choices;
}

function ExampleConversation({ example, agentName }: { example: Conversation; agentName: string }) {
  const { key, request, resultTitle, rows, progress } = example;
  return (
    <>
      <blockquote className={s.request}>{request}</blockquote>
      <div className={s.reply}>
        <span className={s.sender}>{agentName}</span>
        <div className={s.result} data-kind={key}>
          <div className={s.heading}>
            <span className={s.symbol}><UiIcon name={resultIcons[key]} /></span>
            <h4>{resultTitle}</h4>
          </div>
          {key === "finance" && <ExpenseBreakdown rows={rows} />}
          <dl className={s.rows}>
            {rows.map(({ label, value, href }) => (
              <div key={label} className={s.row}>
                <dt>
                  {key === "employee" && label.includes(" · ") && (
                    <span aria-hidden="true" className={s.initial}>{label.charAt(0)}</span>
                  )}
                  {href ? (
                    <a className={s.storeLink} href={href} target="_blank" rel="noopener noreferrer"
                      aria-label={`Conferir a TV na loja ${label} (abre em nova aba)`}>
                      {label} <span aria-hidden="true">↗</span>
                    </a>
                  ) : label}
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {key === "support" && <p className={s.priceNote}>Preços de exemplo no Pix, sem frete.</p>}
          {progress && (
            <div className={s.progress}>
              <span aria-hidden="true">{progress.label}</span>
              <progress value={progress.value} max={100} aria-label={progress.label}>
                {progress.label}
              </progress>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function AgentExamplePreview({ example, agentName }: { example: AgentExample; agentName: string }) {
  let choices: Choice[] = [];
  let legend = "";
  if (example.key === "goal") {
    choices = goalChoices(example, agentName);
    legend = "Simule sua reserva";
  } else if (example.key === "employee") {
    choices = employeeChoices(example, agentName);
    legend = "Simule uma consulta à equipe";
  }

  return (
    <figure className={s.preview}>
      <figcaption className={s.caption}>
        <span className={s.bubbles} aria-hidden="true" />
        Exemplo no WhatsApp
      </figcaption>
      {choices.length > 1 ? (
        <AgentExampleControls
          legend={legend}
          choices={choices.map(({ label, answer }) => ({
            label,
            conversation: <ExampleConversation example={answer} agentName={agentName} />,
          }))}
        />
      ) : (
        <ExampleConversation example={example} agentName={agentName} />
      )}
    </figure>
  );
}
