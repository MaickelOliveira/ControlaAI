"use client";

import { useRef } from "react";
import UiIcon, { type UiIconName } from "@/components/UiIcon";
import {
  BRAZIL_CHECKOUT,
  checkoutUrlWithLandingParams,
} from "@/lib/checkout-markets";
import { usePresentationMotion, useVisible } from "./PresentationMotion";
import s from "./pricing-section.module.css";

const PLANS = [
  {
    id: "monthly",
    name: "Mensal",
    months: "1 mês",
    prefix: "",
    price: "47",
    cents: ",00",
    suffix: "/mês",
    total: "Pagamento mensal",
    value: 47,
    tagline: "Comece no seu ritmo.",
    description: "Para dar o primeiro passo na sua organização.",
  },
  {
    id: "semiannual",
    name: "Semestral",
    months: "6 meses",
    prefix: "6x",
    price: "36",
    cents: ",96",
    suffix: "",
    total: "ou R$ 197,00 à vista",
    value: 197,
    tagline: "Construa uma nova rotina.",
    description: "Seis meses para organizar o que importa.",
  },
  {
    id: "annual",
    name: "Anual",
    months: "12 meses",
    prefix: "12x",
    price: "30",
    cents: ",72",
    suffix: "",
    total: "ou R$ 297,00 à vista",
    value: 297,
    tagline: "Seu ano com mais Zelo.",
    description: "Um ano para acompanhar seus planos de perto.",
  },
] as const;

const BENEFITS = [
  {
    title: "IA no seu WhatsApp",
    detail: "Peça por mensagem de texto ou áudio.",
  },
  {
    title: "Open Finance na conversa",
    detail: "Conexão bancária conforme acesso contratado.",
  },
  {
    title: "Finanças organizadas",
    detail: "Receitas, despesas, categorias e resumos.",
  },
  {
    title: "Parcelas e recorrências",
    detail: "Acompanhe os próximos compromissos.",
  },
  {
    title: "Faturas e planilhas",
    detail: "Importe e revise seus lançamentos.",
  },
  {
    title: "Agenda, tarefas e lembretes",
    detail: "Organize o dia e programe seus avisos.",
  },
  {
    title: "Arquivos sempre à mão",
    detail: "Guarde e encontre pela conversa.",
  },
  {
    title: "Metas, compras e veículos",
    detail: "Reúna mais partes da sua rotina.",
  },
  {
    title: "Painel no celular e computador",
    detail: "Veja e confira tudo com mais clareza.",
  },
];

const FEATURES: {
  title: string;
  subtitle: string;
  icon: UiIconName;
  items: string[];
  note?: string;
}[] = [
  {
    title: "Seu dinheiro, com mais clareza",
    subtitle: "Finanças e planejamento",
    icon: "finance",
    items: [
      "Registrar receitas e despesas por conta e categoria.",
      "Consultar resumos do mês e gastos por período.",
      "Acompanhar parcelas e cobranças recorrentes.",
      "Importar faturas em PDF ou foto e planilhas para revisão.",
    ],
  },
  {
    title: "Seus bancos na conversa",
    subtitle: "Open Finance + IA",
    icon: "wallet",
    items: [
      "Consultar saldos e movimentações das contas conectadas.",
      "Acompanhar cartões, faturas e parcelas identificadas.",
      "Consultar investimentos, empréstimos e saldos devedores recebidos.",
      "Perguntar à IA pelo WhatsApp sobre os dados disponíveis.",
    ],
    note: "Para contas brasileiras elegíveis, conforme acesso contratado, autorização e dados enviados pelo banco. Não inclui movimentar dinheiro.",
  },
  {
    title: "Uma rotina que cabe no dia",
    subtitle: "Agenda, tarefas, lembretes e metas",
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
    title: "Encontrou. Guardou. Resolveu.",
    subtitle: "Arquivos e documentos",
    icon: "folder",
    items: [
      "Enviar fotos, PDFs e documentos para guardar.",
      "Organizar arquivos por nome e pasta.",
      "Encontrar documentos pelo assunto na conversa.",
      "Receber no WhatsApp o arquivo localizado.",
    ],
  },
  {
    title: "Mais partes da vida em ordem",
    subtitle: "Compras, veículos e contatos",
    icon: "home",
    items: [
      "Montar listas de compras e marcar o que já comprou.",
      "Consultar compras e preços do seu histórico.",
      "Registrar abastecimento, manutenção e seguro do veículo.",
      "Guardar e atualizar contatos importantes.",
    ],
  },
  {
    title: "O seu negócio também tem espaço",
    subtitle: "Recursos do modo Empresa",
    icon: "business",
    items: [
      "Manter registros pessoais e de empresas separados.",
      "Organizar clientes, contatos e cadastros de funcionários.",
      "Usar a conexão Google do espaço escolhido.",
      "Preparar dados fiscais, serviços e rascunhos de NFS-e.",
    ],
    note: "Disponível conforme acesso empresarial contratado. A emissão de notas e o envio do PDF oficial ainda estão em preparação.",
  },
];

function Shield({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  );
}

export default function PricingSection() {
  const root = useRef<HTMLElement>(null);
  const { running } = usePresentationMotion();
  const visible = useVisible(root);
  return (
    <section
      ref={root}
      className={s.section}
      id="planos"
      data-animate={running && visible}
    >
      <div className={s.wrap}>
        <div className={s.intro}>
          <p className={s.eyebrow}>
            <span>05</span> AGORA É COM VOCÊ
          </p>
          <h2>
            Um time inteiro.
            <br />
            <em>Um plano para você.</em>
          </h2>
          <p>
            Finanças, compromissos, arquivos e muito mais.
            <br className={s.desktopBreak} /> Comece uma nova rotina com a IA no
            seu WhatsApp.
          </p>
        </div>

        <div className={s.guarantee} aria-labelledby="garantia-titulo">
          <div className={s.seal} aria-hidden="true">
            <span>7</span>
            <b>DIAS</b>
            <i />
          </div>
          <div className={s.guaranteeCopy}>
            <p>
              <Shield /> SUA PRIMEIRA COMPRA TEM
            </p>
            <h3 id="garantia-titulo">7 dias de garantia.</h3>
            <p>
              Conheça a Zelo na sua rotina.
              <br />
              Você tem tempo para decidir se ela faz sentido para você.
            </p>
          </div>
          <a href="#garantia-zelo" className={s.guaranteeLink}>
            Como funciona a garantia <span aria-hidden="true">↗</span>
          </a>
        </div>

        <div className={s.choiceHeading}>
          <span>ESCOLHA SEU PERÍODO</span>
          <p>Três formas de começar. Qual combina com você?</p>
        </div>
        <div className={s.grid} data-scroll-scene="pricing">
          {PLANS.map((plan) => (
            <article
              key={plan.id}
              className={`${s.plan} ${plan.id === "annual" ? s.featured : ""}`}
              aria-labelledby={`plano-${plan.id}`}
            >
              {plan.id === "annual" && (
                <div className={s.ribbon}>
                  <UiIcon name="spark" /> MENOR VALOR POR MÊS
                </div>
              )}
              <div className={s.planTop}>
                <span className={s.duration}>{plan.months}</span>
                <span className={s.planIndex}>0{PLANS.indexOf(plan) + 1}</span>
              </div>
              <h3 id={`plano-${plan.id}`}>{plan.name}</h3>
              <p className={s.tagline}>{plan.tagline}</p>
              <div className={s.price}>
                {plan.prefix && (
                  <span className={s.installments}>{plan.prefix}</span>
                )}
                <span>R$</span>
                <strong>{plan.price}</strong>
                <span>
                  {plan.cents}
                  <small>{plan.suffix}</small>
                </span>
              </div>
              <p className={s.total}>{plan.total}</p>
              <p className={s.description}>{plan.description}</p>
              <a
                href={BRAZIL_CHECKOUT.checkoutUrls[plan.id]}
                onClick={(event) => {
                  event.currentTarget.href = checkoutUrlWithLandingParams(
                    BRAZIL_CHECKOUT.checkoutUrls[plan.id],
                    window.location.search,
                  );
                }}
                data-meta-plan={plan.id}
                data-meta-value={plan.value}
                className={s.cta}
                aria-label={`Quero o ${plan.name.toLowerCase()} — comprar na Hotmart`}
              >
                Quero o {plan.name.toLowerCase()}
                <UiIcon name="arrow" />
              </a>
              <p className={s.cardGuarantee}>
                <Shield />7 dias de garantia na primeira compra
              </p>
              <p className={s.listTitle}>MAIS ORGANIZAÇÃO PARA A SUA VIDA</p>
              <ul className={s.benefits}>
                {BENEFITS.map((benefit) => (
                  <li key={benefit.title}>
                    <span aria-hidden="true">✓</span>
                    <div>
                      <strong>{benefit.title}</strong>
                      <p>{benefit.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <a className={s.exploreLink} href="#funcoes-planos">
                Explore mais funções abaixo <span aria-hidden="true">↓</span>
              </a>
            </article>
          ))}
        </div>
        <p className={s.conditions}>
          Funções empresariais e conexões bancárias dependem do acesso
          contratado. Confira os recursos e as condições de pagamento na Hotmart
          antes de concluir.
        </p>

        <div className={s.catalog} id="funcoes-planos">
          <div className={s.catalogHeader}>
            <div>
              <p className={s.eyebrow}>MAIS FUNÇÕES PARA A SUA ROTINA</p>
              <h3>
                Olha quanta coisa
                <br />
                você pode organizar.
              </h3>
            </div>
            <p>Abra cada área e veja exemplos do que a Zelo faz por você.</p>
          </div>
          <div className={s.featureGrid}>
            {FEATURES.map((feature) => (
              <details key={feature.title} className={s.feature}>
                <summary>
                  <span className={s.featureIcon}>
                    <UiIcon name={feature.icon} />
                  </span>
                  <span>
                    <small>{feature.subtitle}</small>
                    <strong>{feature.title}</strong>
                  </span>
                  <b aria-hidden="true">+</b>
                </summary>
                <div className={s.featureContent}>
                  <ul>
                    {feature.items.map((item) => (
                      <li key={item}>
                        <span aria-hidden="true">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  {feature.note && (
                    <p className={s.featureNote}>{feature.note}</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>

        <div className={s.decisionFooter} id="garantia-zelo">
          <div className={s.footerIcon}>
            <Shield />
          </div>
          <div>
            <h3>Comece com informação. Decida com tranquilidade.</h3>
            <p>
              A assinatura é paga e a primeira compra tem{" "}
              <strong>7 dias de garantia</strong>. As condições e o atendimento
              da compra ficam disponíveis na Hotmart.
            </p>
          </div>
          <div className={s.payment}>
            <span>PAGAMENTO PELA</span>
            <strong>
              Hotmart <UiIcon name="arrow" />
            </strong>
            <a href="#planos">Escolher meu plano ↑</a>
          </div>
        </div>
      </div>
    </section>
  );
}
