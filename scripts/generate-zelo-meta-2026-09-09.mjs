import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const packageDir = path.join(projectDir, "public/ads/zelo-meta-2026-09-09");
const logoPath = path.join(projectDir, "public/brand/zelo-wordmark-light.png");

const concepts = [
  {
    id: "01-dia-organizado",
    image: "01-dia-organizado.png",
    pt: {
      headline: ["SEU DIA COMEÇA", "EM ORDEM."],
      highlightLine: 1,
      support: ["Finanças, tarefas e agenda", "resumidas no WhatsApp."],
      cta: "CONHEÇA O ZELO",
    },
    es: {
      headline: ["EMPIEZA TU DÍA", "CON TODO EN ORDEN."],
      highlightLine: 1,
      support: ["Finanzas, tareas y agenda", "resumidas por WhatsApp."],
      cta: "CONOCE ZELO",
    },
  },
  {
    id: "02-cabeca-leve",
    image: "02-cabeca-leve.png",
    pt: {
      headline: ["SUA CABEÇA NÃO PRECISA", "LEMBRAR DE TUDO."],
      highlightLine: 1,
      support: ["Mande uma mensagem.", "O Zelo organiza."],
      cta: "QUERO ME ORGANIZAR",
    },
    es: {
      headline: ["NO TIENES QUE", "RECORDARLO TODO."],
      highlightLine: 1,
      support: ["Envía un mensaje.", "Zelo lo organiza."],
      cta: "QUIERO ORGANIZARME",
    },
  },
  {
    id: "03-pergunte-organiza",
    image: "03-tudo-organizado.png",
    pt: {
      headline: ["PERGUNTE.", "O ZELO ORGANIZA."],
      highlightLine: 1,
      support: ["Finanças, agenda, tarefas, compras", "e arquivos em uma conversa."],
      cta: "CONHEÇA O ZELO",
    },
    es: {
      headline: ["PREGUNTA.", "ZELO LO ORGANIZA."],
      highlightLine: 1,
      support: ["Finanzas, agenda, tareas, compras", "y archivos en una conversación."],
      cta: "CONOCE ZELO",
    },
  },
];

const formats = {
  feed: { width: 1080, height: 1350, logoWidth: 172, logoTop: 54, headlineTop: 210, headlineSize: 68, lineHeight: 78, supportSize: 31, ctaBottom: 70, ctaWidth: 650, ctaHeight: 96 },
  stories: { width: 1080, height: 1920, logoWidth: 220, logoTop: 150, headlineTop: 370, headlineSize: 70, lineHeight: 84, supportSize: 35, ctaBottom: 250, ctaWidth: 720, ctaHeight: 108 },
};

function escapeXml(value) {
  return value.replace(/[<>&'\"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  }[character]));
}

function overlaySvg(copy, format) {
  const { width, height, headlineTop, headlineSize, lineHeight, supportSize, ctaBottom, ctaWidth, ctaHeight } = format;
  const centerX = width / 2;
  const supportTop = headlineTop + copy.headline.length * lineHeight + 35;
  const supportLineHeight = supportSize + 13;
  const ctaX = (width - ctaWidth) / 2;
  const ctaY = height - ctaBottom - ctaHeight;

  const headline = copy.headline.map((line, index) => {
    const fill = index === copy.highlightLine ? "#FFBF00" : "#FFFFFF";
    return `<text x="${centerX}" y="${headlineTop + index * lineHeight}" text-anchor="middle" fill="${fill}" font-family="Arial, Helvetica, sans-serif" font-size="${headlineSize}" font-weight="900" letter-spacing="-1.5">${escapeXml(line)}</text>`;
  }).join("");

  const support = copy.support.map((line, index) => (
    `<text x="${centerX}" y="${supportTop + index * supportLineHeight}" text-anchor="middle" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="${supportSize}" font-weight="600">${escapeXml(line)}</text>`
  )).join("");

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#00142B" stop-opacity="0.98" />
          <stop offset="62%" stop-color="#00142B" stop-opacity="0.72" />
          <stop offset="100%" stop-color="#00142B" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#00142B" stop-opacity="0" />
          <stop offset="100%" stop-color="#00142B" stop-opacity="0.82" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000814" flood-opacity="0.5" />
        </filter>
      </defs>
      <rect width="${width}" height="${Math.round(height * 0.48)}" fill="url(#topFade)" />
      <rect y="${Math.round(height * 0.66)}" width="${width}" height="${Math.round(height * 0.34)}" fill="url(#bottomFade)" />
      ${headline}
      ${support}
      <g filter="url(#shadow)">
        <rect x="${ctaX}" y="${ctaY}" width="${ctaWidth}" height="${ctaHeight}" rx="${ctaHeight / 2}" fill="#FFBF00" />
        <text x="${centerX}" y="${ctaY + ctaHeight * 0.65}" text-anchor="middle" fill="#00142B" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(ctaHeight * 0.38)}" font-weight="900">${escapeXml(copy.cta)}</text>
      </g>
    </svg>
  `);
}

for (const concept of concepts) {
  for (const [formatName, format] of Object.entries(formats)) {
    const sourcePath = path.join(packageDir, "source", concept.image);
    const logo = await sharp(logoPath)
      .resize({ width: format.logoWidth })
      .png()
      .toBuffer();

    for (const [language, copy] of [["pt-BR", concept.pt], ["es-419", concept.es]]) {
      const outputPath = path.join(packageDir, language, `${concept.id}-${formatName}.png`);
      await sharp(sourcePath)
        .resize({ width: format.width, height: format.height, fit: "cover", position: sharp.strategy.attention })
        .composite([
          { input: overlaySvg(copy, format), left: 0, top: 0 },
          { input: logo, left: Math.round((format.width - format.logoWidth) / 2), top: format.logoTop },
        ])
        .png({ compressionLevel: 9, palette: false })
        .toFile(outputPath);
      console.log(path.relative(projectDir, outputPath));
    }
  }
}
