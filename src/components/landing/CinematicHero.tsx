"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import UiIcon from "@/components/UiIcon";
import s from "./cinematic-hero.module.css";

const CHAPTERS = ["Converse", "Organize", "Conecte"];
const BANKS = ["nubank", "inter", "santander", "sicredi"];

export default function CinematicHero() {
  const section = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState(0);
  const [motion, setMotion] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const preference = matchMedia(
      "(prefers-reduced-motion: reduce), (max-width: 750px) and (max-height: 740px)",
    );
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const node = section.current;
    const movie = video.current;
    if (!node) return;
    let frame = 0;
    let targetTime = 0;
    const seek = () => {
      if (!movie || !motion || reduced || failed || document.hidden) return;
      if (
        Number.isFinite(movie.duration) &&
        !movie.seeking &&
        Math.abs(movie.currentTime - targetTime) > 0.08
      ) {
        movie.currentTime = Math.min(
          targetTime,
          Math.max(0, movie.duration - 0.1),
        );
      }
    };
    const paint = () => {
      frame = 0;
      const box = node.getBoundingClientRect();
      const value = Math.min(
        1,
        Math.max(0, -box.top / Math.max(1, box.height - innerHeight)),
      );
      progress.current?.style.setProperty("--progress", String(value));
      setStage(value < 0.34 ? 0 : value < 0.69 ? 1 : 2);
      targetTime =
        value * (Number.isFinite(movie?.duration) ? movie!.duration - 0.15 : 8);
      seek();
    };
    const schedule = () => {
      if (!frame && !document.hidden) frame = requestAnimationFrame(paint);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("visibilitychange", schedule);
    movie?.addEventListener("loadedmetadata", schedule);
    movie?.addEventListener("seeked", seek);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", schedule);
      movie?.removeEventListener("loadedmetadata", schedule);
      movie?.removeEventListener("seeked", seek);
    };
  }, [motion, reduced, failed]);

  const jump = (index: number) => {
    if (!section.current) return;
    const distance = section.current.offsetHeight - innerHeight;
    const top = section.current.getBoundingClientRect().top + scrollY;
    scrollTo({
      top: top + distance * [0, 0.5, 0.85][index],
      behavior: reduced ? "instant" : "smooth",
    });
  };

  return (
    <section
      className={`${s.story} ${reduced ? s.reduced : ""}`}
      ref={section}
      id="inicio"
      aria-label="Conheça a IA da Zelo no WhatsApp"
    >
      <div className={s.sticky} data-stage={stage}>
        <div className={s.film} aria-hidden="true">
          <Image
            src="/brand/cinematic/zelo-gold-poster.webp"
            alt=""
            fill
            priority
            sizes="100vw"
          />
          {!reduced && !failed && (
            <video
              ref={video}
              muted
              playsInline
              preload="metadata"
              poster="/brand/cinematic/zelo-gold-poster.webp"
              onError={() => setFailed(true)}
            >
              <source
                src="/brand/cinematic/zelo-hero-mobile.mp4"
                type="video/mp4"
                media="(max-width: 650px)"
              />
              <source
                src="/brand/cinematic/zelo-hero-4k.mp4"
                type="video/mp4"
              />
            </video>
          )}
        </div>
        <div className={s.shade} />
        <div className={s.frame}>
          <div
            className={s.intro}
            data-visible={stage === 0}
            inert={!reduced && stage !== 0}
          >
            <p className={s.eyebrow}>
              <span />
              INTELIGÊNCIA ARTIFICIAL NO WHATSAPP
            </p>
            <h1>
              Sua vida.
              <br />
              Seu negócio.
              <br />
              <em>Uma conversa.</em>
            </h1>
            <p className={s.lead}>
              <strong>Sua IA no WhatsApp.</strong> Organiza. Executa.
              Simplifica.
              <br className={s.desktopBreak} /> Agora, conectada também aos seus
              bancos.
            </p>
            <div className={s.actions}>
              <a href="#planos" className={s.primary}>
                Conheça os planos
                <UiIcon name="arrow" />
              </a>
              <a href="#open-finance" className={s.secondary}>
                Explore o Open Finance <span>↗</span>
              </a>
            </div>
            <p className={s.micro}>
              Pessoal e empresas. Cada coisa no seu espaço.
            </p>
          </div>

          <div
            className={s.floatingMessage}
            aria-hidden="true"
            data-visible={stage === 0}
          >
            <span className={s.waMark}>↗</span>
            <div>
              <small>VOCÊ MANDA UMA MENSAGEM.</small>
              <p>A Zelo cuida do próximo passo.</p>
            </div>
            <span>✓✓</span>
          </div>

          <div
            className={s.chapter}
            data-visible={stage === 1}
            inert={!reduced && stage !== 1}
          >
            <div className={s.chapterCopy}>
              <p className={s.eyebrow}>01 / DA INTENÇÃO À AÇÃO</p>
              <h2>
                Pediu.
                <br />
                <em>Organizou.</em>
              </h2>
              <p>
                Um gasto, um compromisso, um documento.
                <br />
                Fale naturalmente. A IA pergunta o que falta
                <br className={s.desktopBreak} /> e ajuda você a concluir.
              </p>
              <a href="#recursos" className={s.secondary}>
                Descubra o que pode pedir <span>↗</span>
              </a>
            </div>
            <div className={s.chat}>
              <div className={s.chatHeader}>
                <Image
                  src="/brand/zelo-icon.png"
                  width={38}
                  height={38}
                  alt=""
                />
                <div>
                  <strong>Zelo</strong>
                  <small>Inteligência artificial no WhatsApp</small>
                </div>
                <span>···</span>
              </div>
              <div className={s.bubbles}>
                <span className={s.demoTag}>EXEMPLO ILUSTRATIVO</span>
                <p className={s.sent}>
                  Gastei R$ 85 no mercado, no débito da minha conta pessoal.
                  <small>09:41 ✓✓</small>
                </p>
                <div className={s.reply}>
                  <strong>Rita · Finanças</strong>
                  <p>Pronto! Organizei o seu gasto:</p>
                  <dl>
                    <div>
                      <dt>Supermercado</dt>
                      <dd>R$ 85,00</dd>
                    </div>
                    <div>
                      <dt>Categoria</dt>
                      <dd>Alimentação</dd>
                    </div>
                    <div>
                      <dt>Espaço</dt>
                      <dd>Pessoal</dd>
                    </div>
                  </dl>
                  <span>✓ Disponível no seu painel</span>
                </div>
              </div>
              <div className={s.chatFoot}>
                Você conversa. O painel acompanha.
              </div>
            </div>
          </div>

          <div
            className={s.chapter}
            data-visible={stage === 2}
            inert={!reduced && stage !== 2}
          >
            <div className={s.chapterCopy}>
              <p className={s.eyebrow}>02 / OPEN FINANCE + IA</p>
              <h2>
                Seus bancos.
                <br />
                <em>Na conversa.</em>
              </h2>
              <p>
                Saldo, faturas, investimentos e empréstimos.
                <br />A Zelo consulta o que seus bancos compartilham
                <br className={s.desktopBreak} /> e responde no seu WhatsApp.
              </p>
              <a href="#open-finance" className={s.primary}>
                Conheça o Open Finance
                <UiIcon name="arrow" />
              </a>
            </div>
            <div className={s.financeCard}>
              <div className={s.bankLogos}>
                {BANKS.map((bank) => (
                  <span key={bank}>
                    <Image
                      src={`/brand/banks/${bank}.svg`}
                      alt={
                        bank === "nubank"
                          ? "Nubank"
                          : bank === "inter"
                            ? "Inter"
                            : bank === "santander"
                              ? "Santander"
                              : "Sicredi"
                      }
                      width={34}
                      height={34}
                    />
                  </span>
                ))}
              </div>
              <p className={s.financeQuestion}>
                “Quanto eu tenho
                <br />
                de empréstimo?”
              </p>
              <div className={s.financeAnswer}>
                <span>IA ZELO · DADOS DOS BANCOS</span>
                <strong>Respostas com contexto.</strong>
                <p>
                  Contratos e saldos devedores recebidos,
                  <br />
                  com a informação disponível em cada banco.
                </p>
              </div>
              <p className={s.bankNote}>
                Conexão autorizada por você. Disponibilidade conforme plano,
                instituição e dados recebidos.
              </p>
            </div>
          </div>
        </div>
        <div ref={progress} className={s.scrollBar}>
          <div className={s.scrollLine} />
          <span className={s.scrollHint}>
            ROLE PARA EXPLORAR <span>↓</span>
          </span>
          <nav aria-label="Capítulos da apresentação">
            {CHAPTERS.map((chapter, index) => (
              <button
                key={chapter}
                onClick={() => jump(index)}
                aria-current={stage === index ? "step" : undefined}
              >
                <span>0{index + 1}</span>
                {chapter}
              </button>
            ))}
          </nav>
          <button
            className={s.motionToggle}
            onClick={() => setMotion((value) => !value)}
            aria-pressed={!motion}
            disabled={reduced}
            aria-label={
              motion ? "Pausar movimento do vídeo" : "Ativar movimento do vídeo"
            }
          >
            {motion ? "Ⅱ" : "▷"}
            <span>{motion ? "Pausar vídeo" : "Ativar vídeo"}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
