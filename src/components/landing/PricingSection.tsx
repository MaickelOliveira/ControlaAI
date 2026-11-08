"use client";

import UiIcon from "@/components/UiIcon";
import { BRAZIL_CHECKOUT, checkoutUrlWithLandingParams } from "@/lib/checkout-markets";
import s from "./pricing-section.module.css";

const PLANS = [
  { id: "monthly", name: "Mensal", installments: 1, installmentCents: 4700, cashPrice: 47 },
  { id: "semiannual", name: "Semestral", installments: 6, installmentCents: 3696, cashPrice: 197 },
  { id: "annual", name: "Anual", installments: 12, installmentCents: 3072, cashPrice: 297 },
] as const;

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function PricingSection() {
  return (
    <section className={s.section} id="planos" aria-labelledby="titulo-planos">
      <div className={s.wrap}>
        <header className={s.intro}>
          <h2 id="titulo-planos">Escolha seu plano</h2>
          <p>Escolha por quanto tempo quer assinar. Os três planos incluem a equipe de IA no WhatsApp e o painel da Zelo.</p>
        </header>

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
