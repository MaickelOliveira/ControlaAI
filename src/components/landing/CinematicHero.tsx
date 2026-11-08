import Image from "next/image";
import UiIcon from "@/components/UiIcon";
import s from "./cinematic-hero.module.css";

const BANKS = [
  { id: "nubank", name: "Nubank", value: "R$ 3.250,00" },
  { id: "inter", name: "Inter", value: "R$ 2.170,00" },
  { id: "santander", name: "Santander", value: "R$ 3.000,00" },
];

export default function CinematicHero() {
  return (
    <section id="inicio" className={s.hero} aria-labelledby="hero-title">
      <div className={s.backdrop} aria-hidden="true">
        <span className={s.giantWord}>ZELO</span>
        <div className={s.yellowDisc} />
        <div className={s.trackOne} />
        <div className={s.trackTwo} />
      </div>
      <div className={s.sceneGrid}>
        <div className={s.copy}>
          <div className={s.headline}>
            <h1 id="hero-title">
              <span>Sua vida organizada.</span>{" "}
              <span>No seu</span>{" "}
              <span className={s.accent}>WhatsApp.</span>
            </h1>
            <p>Consulte suas finanças, marque compromissos e organize tarefas e documentos em uma conversa com a Zelo.</p>
          </div>
          <div className={s.actions}>
            <a className={s.primary} href="#planos">Ver planos <UiIcon name="arrow" /></a>
            <p>Plano mensal <strong>R$ 47,00</strong></p>
          </div>
          <div className={s.proof}>
            <div>
              {["rita", "lucas", "dora", "theo"].map((name) => (
                <Image key={name} src={`/brand/team/ilustrados/${name}.webp`} width={38} height={38} alt="" />
              ))}
            </div>
            <a href="#equipe"><strong>Conheça os 12 agentes de IA</strong><span>Veja o que você pode pedir a cada um ↓</span></a>
          </div>
        </div>
        <figure className={s.stage} id="como-funciona" aria-label="Exemplo de conversa com a Zelo">
          <div className={s.phoneWrap}>
            <div className={s.phone}>
              <div className={s.deviceTop} aria-hidden="true"><span>9:41</span><b /><span>▮▮▮ ▰</span></div>
              <div className={s.chatHeader}>
                <span className={s.back} aria-hidden="true">‹</span>
                <Image src="/brand/zelo-icon.png" width={40} height={40} alt="" />
                <div><strong>Zelo</strong><small>Seu time de IA</small></div>
              </div>
              <div className={s.chatBody}>
                <p className={s.demoLabel}>Demonstração com valores fictícios</p>
                <div className={s.outgoing}>
                  <p>Rita, quanto tenho nas minhas contas?</p>
                  <small aria-hidden="true">09:41 ✓✓</small>
                </div>
                <div className={s.incoming}>
                  <strong className={s.agentLabel}>Rita <span>· Finanças</span></strong>
                  <p>Você tem <strong>R$ 8.420,00</strong> nas contas conectadas.</p>
                  <div className={s.bankRows}>
                    {BANKS.map((bank) => (
                      <div key={bank.id}>
                        <Image src={`/brand/banks/${bank.id}.svg`} width={20} height={20} alt="" />
                        <span>{bank.name}</span><b>{bank.value}</b>
                      </div>
                    ))}
                  </div>
                  <small className={s.time} aria-hidden="true">09:41</small>
                </div>
              </div>
              <div className={s.composer} aria-hidden="true"><span>+</span><div>Mensagem</div></div>
              <div className={s.homeIndicator} />
            </div>
          </div>
          <div className={s.floatingTop} aria-hidden="true">
            <span className={s.badgeIcon}><UiIcon name="wallet" /></span>
            <div><small>OPEN FINANCE</small><strong>Seus bancos conectados</strong></div>
            <span className={s.check}>✓</span>
          </div>
          <div className={s.bankSatellites} aria-hidden="true">
            {BANKS.map((bank) => (
              <Image key={bank.id} src={`/brand/banks/${bank.id}.svg`} width={45} height={45} alt="" />
            ))}
          </div>
        </figure>
      </div>
    </section>
  );
}
