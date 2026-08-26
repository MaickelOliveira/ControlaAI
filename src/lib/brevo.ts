function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] || char);
}

function htmlLang(locale?: string): string {
  if (locale === "es") return "es";
  if (locale === "pt-PT") return "pt-PT";
  return "pt-BR";
}

export async function sendPasswordResetEmail(input: { email: string; name: string; code: string; resetId: string; welcome?: boolean; locale?: string }): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) throw new Error("BREVO_API_KEY / BREVO_SENDER_EMAIL não configurados");

  const texts: Record<string, { title: string; welcomeIntro: string; resetIntro: string; greeting: string; button: string; expiry: string; ignore: string }> = {
    "pt-BR": {
      title: input.welcome ? "Seu acesso ao Zelo está liberado" : "Redefinição de senha",
      welcomeIntro: "Seu pagamento foi confirmado. Use este código para criar sua senha e acessar o Zelo:",
      resetIntro: "Use este código para criar uma nova senha:",
      greeting: "Olá",
      button: "Criar minha senha",
      expiry: "O código expira em 10 minutos e só pode ser usado uma vez.",
      ignore: "Se você não solicitou essa ação, ignore este e-mail.",
    },
    "pt-PT": {
      title: input.welcome ? "O teu acesso ao Zelo está liberado" : "Redefinição de senha",
      welcomeIntro: "O teu pagamento foi confirmado. Usa este código para criares a tua senha e acederes ao Zelo:",
      resetIntro: "Usa este código para criares uma nova senha:",
      greeting: "Olá",
      button: "Criar a minha senha",
      expiry: "O código expira em 10 minutos e só pode ser usado uma vez.",
      ignore: "Se não solicitaste esta ação, ignora este e-mail.",
    },
    es: {
      title: input.welcome ? "Tu acceso a Zelo está habilitado" : "Restablecimiento de contraseña",
      welcomeIntro: "Tu pago fue confirmado. Usa este código para crear tu contraseña y acceder a Zelo:",
      resetIntro: "Usa este código para crear una nueva contraseña:",
      greeting: "Hola",
      button: "Crear mi contraseña",
      expiry: "El código vence en 10 minutos y solo puede usarse una vez.",
      ignore: "Si no solicitaste esta acción, ignora este correo.",
    },
  };
  const t = texts[input.locale ?? "pt-BR"] ?? texts["pt-BR"];

  // Domínio real configurado no EasyPanel (confirmado direto no painel —
  // "controlaai.app" não está cadastrado lá, é resquício de antes do
  // rebranding pra Zelo) — nunca a URL crua do EasyPanel: um e-mail com esse
  // link manda o usuário criar a senha/redefinir nela, e a sessão criada ali
  // gruda nesse domínio pro resto da navegação dentro do app (é exatamente
  // isso que já aconteceu na prática).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://zelogestaointeligente.com.br";
  const recoveryUrl = `${appUrl.replace(/\/$/, "")}/esqueci-senha?rid=${encodeURIComponent(input.resetId)}&email=${encodeURIComponent(input.email)}`;
  const intro = input.welcome ? t.welcomeIntro : t.resetIntro;
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      sender: { name: process.env.BREVO_SENDER_NAME || "Zelo", email: senderEmail },
      to: [{ name: input.name, email: input.email }],
      subject: t.title,
      tags: [input.welcome ? "paid-account-access" : "password-reset"],
      htmlContent: `<!doctype html><html lang="${htmlLang(input.locale)}"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:32px"><p style="color:#d97706;font-size:18px;font-weight:700;margin:0 0 24px">Zelo</p><h1 style="font-size:24px;margin:0 0 12px">${t.title}</h1><p style="line-height:1.6">${t.greeting}, ${escapeHtml(input.name || "cliente")}. ${intro}</p><div style="margin:24px 0;padding:18px;text-align:center;background:#fffbeb;border:1px solid #fde68a;border-radius:14px;font-size:32px;font-weight:800;letter-spacing:8px">${input.code}</div><p style="text-align:center"><a href="${escapeHtml(recoveryUrl)}" style="display:inline-block;background:#d97706;color:#fff;text-decoration:none;padding:13px 20px;border-radius:12px;font-weight:700">${t.button}</a></p><p>${t.expiry}</p><p style="font-size:13px;color:#64748b;margin-top:28px">${t.ignore}</p></div></body></html>`,
    }),
  });
  if (!response.ok) throw new Error(`[brevo] envio falhou (${response.status}): ${(await response.text()).slice(0, 300)}`);
}

async function sendBrevoEmail(input: { email: string; name: string; subject: string; tag: string; htmlContent: string }): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) throw new Error("BREVO_API_KEY / BREVO_SENDER_EMAIL não configurados");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      sender: { name: process.env.BREVO_SENDER_NAME || "Zelo", email: senderEmail },
      to: [{ name: input.name, email: input.email }],
      subject: input.subject,
      tags: [input.tag],
      htmlContent: input.htmlContent,
    }),
  });
  if (!response.ok) throw new Error(`[brevo] envio falhou (${response.status}): ${(await response.text()).slice(0, 300)}`);
}

export async function sendFirstAccessLinkEmail(input: { email: string; name: string; setupId: string; locale?: string }): Promise<void> {
  // Domínio real configurado no EasyPanel (confirmado direto no painel —
  // "controlaai.app" não está cadastrado lá, é resquício de antes do
  // rebranding pra Zelo) — nunca a URL crua do EasyPanel: um e-mail com esse
  // link manda o usuário criar a senha/redefinir nela, e a sessão criada ali
  // gruda nesse domínio pro resto da navegação dentro do app (é exatamente
  // isso que já aconteceu na prática).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://zelogestaointeligente.com.br";
  const setupUrl = `${appUrl.replace(/\/$/, "")}/primeiro-acesso?token=${encodeURIComponent(input.setupId)}`;

  const texts: Record<string, { subject: string; title: string; intro: string; button: string; security: string; footer: string }> = {
    "pt-BR": {
      subject: "Crie sua senha de acesso ao Zelo",
      title: "Seu pagamento foi confirmado",
      intro: "Seu acesso está liberado. Clique abaixo para confirmar seu e-mail e criar a senha que você quiser.",
      button: "Criar minha senha",
      security: "Por segurança, o link funciona até você concluir o cadastro da senha e ainda exige um código enviado separadamente ao seu e-mail. Depois disso, ele é invalidado.",
      footer: "Não encaminhe este e-mail. Se você não realizou a compra, fale com o suporte.",
    },
    "pt-PT": {
      subject: "Cria a tua senha de acesso ao Zelo",
      title: "O teu pagamento foi confirmado",
      intro: "O teu acesso está liberado. Clica abaixo para confirmares o teu e-mail e criares a senha que quiseres.",
      button: "Criar a minha senha",
      security: "Por segurança, o link funciona até concluíres o registo da senha e ainda exige um código enviado separadamente para o teu e-mail. Depois disso, é invalidado.",
      footer: "Não reencaminhes este e-mail. Se não realizaste a compra, fala com o suporte.",
    },
    es: {
      subject: "Crea tu contraseña de acceso a Zelo",
      title: "Tu pago fue confirmado",
      intro: "Tu acceso está habilitado. Haz clic abajo para confirmar tu correo y crear la contraseña que quieras.",
      button: "Crear mi contraseña",
      security: "Por seguridad, el link funciona hasta que completes la creación de la contraseña y además exige un código enviado por separado a tu correo. Después de eso, se invalida.",
      footer: "No reenvíes este correo. Si no realizaste la compra, contacta al soporte.",
    },
  };
  const t = texts[input.locale ?? "pt-BR"] ?? texts["pt-BR"];

  await sendBrevoEmail({
    email: input.email,
    name: input.name,
    subject: t.subject,
    tag: "paid-account-first-access",
    htmlContent: `<!doctype html><html lang="${htmlLang(input.locale)}"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:32px"><p style="color:#d97706;font-size:18px;font-weight:700;margin:0 0 24px">Zelo</p><h1 style="font-size:24px;margin:0 0 12px">${t.title}</h1><p style="line-height:1.6">${input.locale === "es" ? "Hola" : "Olá"}, ${escapeHtml(input.name || "cliente")}. ${t.intro}</p><p style="text-align:center;margin:28px 0"><a href="${escapeHtml(setupUrl)}" style="display:inline-block;background:#d97706;color:#fff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:700">${t.button}</a></p><p style="font-size:14px;color:#475569">${t.security}</p><p style="font-size:13px;color:#64748b;margin-top:28px">${t.footer}</p></div></body></html>`,
  });
}

export async function sendFirstAccessCodeEmail(input: { email: string; name: string; code: string; locale?: string }): Promise<void> {
  const texts: Record<string, { subject: string; title: string; intro: string; expiry: string; footer: string }> = {
    "pt-BR": {
      subject: "Código de confirmação do primeiro acesso",
      title: "Confirme seu primeiro acesso",
      intro: "Digite este código na página que você abriu:",
      expiry: "O código expira em 10 minutos e só pode ser usado uma vez.",
      footer: "Não compartilhe este código. O suporte do Zelo nunca pedirá esse número.",
    },
    "pt-PT": {
      subject: "Código de confirmação do primeiro acesso",
      title: "Confirma o teu primeiro acesso",
      intro: "Escreve este código na página que abriste:",
      expiry: "O código expira em 10 minutos e só pode ser usado uma vez.",
      footer: "Não partilhes este código. O suporte do Zelo nunca vai pedir-te esse número.",
    },
    es: {
      subject: "Código de confirmación del primer acceso",
      title: "Confirma tu primer acceso",
      intro: "Ingresa este código en la página que abriste:",
      expiry: "El código vence en 10 minutos y solo puede usarse una vez.",
      footer: "No compartas este código. El soporte de Zelo nunca te lo va a pedir.",
    },
  };
  const t = texts[input.locale ?? "pt-BR"] ?? texts["pt-BR"];
  await sendBrevoEmail({
    email: input.email,
    name: input.name,
    subject: t.subject,
    tag: "paid-account-first-access-code",
    htmlContent: `<!doctype html><html lang="${htmlLang(input.locale)}"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:32px"><p style="color:#d97706;font-size:18px;font-weight:700;margin:0 0 24px">Zelo</p><h1 style="font-size:24px;margin:0 0 12px">${t.title}</h1><p style="line-height:1.6">${input.locale === "es" ? "Hola" : "Olá"}, ${escapeHtml(input.name || "cliente")}. ${t.intro}</p><div style="margin:24px 0;padding:18px;text-align:center;background:#fffbeb;border:1px solid #fde68a;border-radius:14px;font-size:32px;font-weight:800;letter-spacing:8px">${input.code}</div><p>${t.expiry}</p><p style="font-size:13px;color:#64748b;margin-top:28px">${t.footer}</p></div></body></html>`,
  });
}
