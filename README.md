# Zelo

## Rastreamento Meta Ads

O site suporta Meta Pixel no navegador e Conversions API no servidor, com consentimento e deduplicação do evento de cadastro. Configure no ambiente de produção:

```bash
NEXT_PUBLIC_META_PIXEL_ID=seu_dataset_id
META_PIXEL_ID=seu_dataset_id
META_CONVERSIONS_API_TOKEN=seu_token_secreto
META_GRAPH_API_VERSION=v25.0
```

Para validar eventos sem contaminar os dados reais, adicione temporariamente `META_TEST_EVENT_CODE`, copie o código mostrado em **Gerenciador de Eventos > Testar eventos** e remova a variável depois do teste.

O token da Conversions API é secreto: configure-o somente no servidor/EasyPanel e nunca use o prefixo `NEXT_PUBLIC_` nele.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
