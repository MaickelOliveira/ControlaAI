function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] || char);
}

export async function sendPasswordResetEmail(input: { email: string; name: string; code: string; welcome?: boolean }): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) throw new Error("BREVO_API_KEY / BREVO_SENDER_EMAIL não configurados");
  const title = input.welcome ? "Seu acesso ao Zelo está liberado" : "Redefinição de senha";
  const intro = input.welcome ? "Seu pagamento foi confirmado. Use este código para criar sua senha e acessar o Zelo:" : "Use este código para criar uma nova senha:";
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      sender: { name: process.env.BREVO_SENDER_NAME || "Zelo", email: senderEmail },
      to: [{ name: input.name, email: input.email }],
      subject: title,
      tags: [input.welcome ? "paid-account-access" : "password-reset"],
      htmlContent: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:32px"><p style="color:#d97706;font-size:18px;font-weight:700;margin:0 0 24px">Zelo</p><h1 style="font-size:24px;margin:0 0 12px">${title}</h1><p style="line-height:1.6">Olá, ${escapeHtml(input.name || "cliente")}. ${intro}</p><div style="margin:24px 0;padding:18px;text-align:center;background:#fffbeb;border:1px solid #fde68a;border-radius:14px;font-size:32px;font-weight:800;letter-spacing:8px">${input.code}</div><p>O código expira em 10 minutos e só pode ser usado uma vez.</p><p style="font-size:13px;color:#64748b;margin-top:28px">Se você não solicitou essa ação, ignore este e-mail.</p></div></body></html>`,
    }),
  });
  if (!response.ok) throw new Error(`[brevo] envio falhou (${response.status}): ${(await response.text()).slice(0, 300)}`);
}
