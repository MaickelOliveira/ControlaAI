"use client";

import UiIcon, { type UiIconName } from "@/components/UiIcon";
import { BRAZIL_CHECKOUT, checkoutUrlWithLandingParams } from "@/lib/checkout-markets";
import s from "./pricing-section.module.css";

const PLANS = [
  { id: "monthly", name: "Mensal", installments: 1, installmentCents: 4700, cashPrice: 47 },
  { id: "semiannual", name: "Semestral", installments: 6, installmentCents: 3696, cashPrice: 197 },
  { id: "annual", name: "Anual", installments: 12, installmentCents: 3072, cashPrice: 297 },
] as const;

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const FEATURES: {
  title: string;
  icon: UiIconName;
  items: string[];
  note?: string;
}[] = [
  {
    title: "Finanças e planejamento",
    icon: "finance",
    items: [
      "Registrar receitas e despesas por conta e categoria.",
      "Consultar resumos do mês e gastos por período.",
      "Acompanhar parcelas e cobranças recorrentes.",
      "Importar faturas em PDF ou foto e planilhas para revisão.",
    ],
  },
  {
    title: "Contas e cartões pelo Open Finance",
    icon: "wallet",
    items: [
      "Consultar saldos e movimentações das contas conectadas.",
      "Acompanhar cartões, faturas e parcelas identificadas.",
      "Consultar investimentos, empréstimos e saldos devedores recebidos.",
      "Perguntar à IA pelo WhatsApp sobre os dados disponíveis.",
    ],
    note: "Os dados disponíveis variam por instituição. A conexão permite consultas.",
  },
  {
    title: "Agenda, tarefas, lembretes e metas",
    icon: "calendar",
    items: [
      "Criar, consultar e reagendar compromissos.",
      "Usar a integração Google e criar links do Meet com autorização.",
      "Organizar tarefas por prazo e prioridade.",
      "Programar lembretes únicos ou recorrentes no WhatsApp.",
      "Definir metas e acompanhar o progresso registrado.",
    ],
  },
  {
    title: "Arquivos e documentos",
    icon: "folder",
    items: [
      "Enviar fotos, PDFs e documentos para guardar.",
      "Organizar arquivos por nome e pasta.",
      "Encontrar documentos pelo assunto na conversa.",
      "Receber no WhatsApp o arquivo localizado.",
    ],
  },
  {
    title: "Compras, veículos e contatos",
    icon: "home",
    items: [
      "Montar listas de compras e marcar o que já comprou.",
      "Consultar compras e preços do seu histórico.",
      "Registrar abastecimento, manutenção e seguro do veículo.",
      "Guardar e atualizar contatos importantes.",
    ],
  },
  {
    title: "Clientes e equipe no modo Empresa",
    icon: "business",
    items: [
      "Manter registros pessoais e de empresas separados.",
      "Organizar clientes, contatos e cadastros de funcionários.",
      "Usar a conexão Google do espaço escolhido.",
      "Preparar dados fiscais, serviços e rascunhos de NFS-e.",
    ],
    note: "Esses recursos exigem acesso Empresa. A emissão de notas e o envio do PDF oficial ainda estão em preparação.",
  },
];

export default function PricingSection() {
  return (
    <section className={s.section} id="planos" aria-labelledby="titulo-planos">
      <div className={s.wrap}>
        <header className={s.intro}>
          <h2 id="titulo-planos">Escolha seu plano</h2>
          <p>Os três períodos incluem o painel e o atendimento da Zelo pelo WhatsApp.</p>
        </header>

        <div className={s.terms}>
          <div className={s.access}>
            <p>
              <strong>Pessoal e Empresa.</strong> No Pessoal, você organiza sua rotina. Para gerir
              uma ou mais empresas em espaços separados, sua conta precisa de acesso Empresa.
            </p>
            <p>
              <strong>Open Finance.</strong> Com uma assinatura ativa, você pode conectar contas
              brasileiras elegíveis com autorização do titular. Para contas PJ, é preciso ter acesso Empresa.
            </p>
          </div>
          <a className={s.help} href="mailto:contato@zelogestaointeligente.com.br">
            Consultar acesso e limites para minha empresa <UiIcon name="arrow" />
          </a>
        </div>

        <div className={s.grid}>
          {PLANS.map((plan) => (
            <article
              key={plan.id}
              className={plan.id === "annual" ? `${s.plan} ${s.featured}` : s.plan}
              aria-labelledby={`plano-${plan.id}`}
            >
              <h3 id={`plano-${plan.id}`}>{plan.name}</h3>
              <p className={s.price}>
                {plan.installments > 1 && <span>{plan.installments} × </span>}
                <strong>{reais.format(plan.installmentCents / 100)}</strong>
                {plan.installments === 1 && <span> / mês</span>}
              </p>
              <p className={s.total}>
                {plan.installments === 1 ? (
                  "Cobrança mensal"
                ) : (
                  <>
                    Total parcelado de {reais.format(plan.installments * plan.installmentCents / 100)}
                    <br />ou {reais.format(plan.cashPrice)} à vista
                  </>
                )}
              </p>
              <a
                href={BRAZIL_CHECKOUT.checkoutUrls[plan.id]}
                onClick={(event) => {
                  event.currentTarget.href = checkoutUrlWithLandingParams(
                    BRAZIL_CHECKOUT.checkoutUrls[plan.id],
                    window.location.search,
                  );
                }}
                data-meta-plan={plan.id}
                data-meta-value={plan.cashPrice}
                className={s.cta}
                aria-label={`Assinar plano ${plan.name.toLowerCase()} na Hotmart`}
              >
                Assinar {plan.name.toLowerCase()} <UiIcon name="arrow" />
              </a>
            </article>
          ))}
        </div>

        <div className={s.guarantee} id="garantia-zelo">
          <strong>7 dias de garantia</strong>
          <p>Na primeira compra, você pode solicitar o reembolso pela Hotmart dentro desse prazo.</p>
        </div>

        <div className={s.catalog} id="funcoes-planos">
          <h3>O que você pode fazer com a Zelo</h3>
          <div className={s.featureGrid}>
            {FEATURES.map((feature) => (
              <details key={feature.title} className={s.feature}>
                <summary>
                  <UiIcon name={feature.icon} />
                  <strong>{feature.title}</strong>
                  <span aria-hidden="true">+</span>
                </summary>
                <div className={s.featureContent}>
                  <ul>
                    {feature.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                  {feature.note && <p>{feature.note}</p>}
                </div>
              </details>
            ))}
          </div>
        </div>

        <div className={s.onboarding}>
          <h3>Como começar depois da compra</h3>
          <ol>
            <li>
              <strong>Abra o e-mail de primeiro acesso.</strong> Na primeira compra aprovada,
              o link chega ao e-mail que você informou na Hotmart.
            </li>
            <li>
              <strong>Crie sua senha.</strong> Confirme o código enviado ao seu e-mail,
              escolha uma senha e entre no painel com o e-mail da compra.
            </li>
            <li>
              <strong>Comece pelo WhatsApp.</strong> Em Configurações, vincule o número que vai usar.
              Para trazer seus dados bancários, abra Contas e selecione Conectar banco.
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}
