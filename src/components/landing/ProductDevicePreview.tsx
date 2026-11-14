import Image from "next/image";
import s from "./product-device-preview.module.css";

const screens = [
  {
    device: "desktop",
    label: "Computador",
    src: "/brand/product/dashboard-demo.webp",
    width: 1687,
    height: 932,
    alt: "Painel da Zelo no computador, com saldo de R$ 18.450, entradas e saídas do mês, gráfico e cartões.",
    sizes: "(max-width: 900px) 86vw, (max-width: 1960px) 70vw, 1360px",
  },
  {
    device: "mobile",
    label: "Celular",
    src: "/brand/product/mobile-demo.webp",
    width: 853,
    height: 1844,
    alt: "Painel da Zelo no celular, com o mesmo saldo de R$ 18.450 e o gráfico de entradas e saídas em uma coluna.",
    sizes: "(max-width: 900px) min(22vw, 160px), (max-width: 1960px) 13vw, 240px",
  },
] as const;

export default function ProductDevicePreview() {
  return (
    <figure className={s.preview}>
      <div className={s.devices}>
        {screens.map((screen) => (
          <a
            key={screen.device}
            className={s.device}
            data-device={screen.device}
            href={screen.src}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Ampliar painel no ${screen.label.toLowerCase()} em nova aba`}
          >
            <div className={s.display}>
              <div className={s.screen}>
                {screen.device === "mobile" && (
                  <div className={s.statusBar} aria-hidden="true">
                    <span>9:41</span>
                    <i className={s.island} />
                    <span className={s.indicators}><i className={s.signal} /><i className={s.battery} /></span>
                  </div>
                )}
                <Image
                  src={screen.src}
                  width={screen.width}
                  height={screen.height}
                  sizes={screen.sizes}
                  alt={screen.alt}
                />
                {screen.device === "mobile" && <div className={s.homeBar} aria-hidden="true" />}
              </div>
            </div>
            <div className={s.caption}>
              <strong>{screen.label}</strong>
              <span>Ampliar <span aria-hidden="true">↗</span></span>
            </div>
          </a>
        ))}
      </div>
      <figcaption>As duas telas mostram o mesmo mês, com dados de demonstração.</figcaption>
    </figure>
  );
}
