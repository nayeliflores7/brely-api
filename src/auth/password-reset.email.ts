import { escapeHtml } from '../mail/escape-html.js';

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;padding:16px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#334155">
<div style="max-width:520px;margin:0 auto;padding:24px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
<div style="font-size:13px;font-weight:600;color:#1e40af">Brely</div>
<h1 style="margin:4px 0 16px;font-size:20px;font-weight:700;color:#0f172a">${escapeHtml(title)}</h1>
${body}
</div></body></html>`;
}

const paragraph = (text: string) => `<p style="margin:0 0 16px;font-size:14px;line-height:1.5">${escapeHtml(text)}</p>`;

export function renderPasswordResetEmail(fullName: string, url: string, minutes: number) {
  const subject = 'Restablece tu contraseña de Brely';
  const ignore = 'Si no lo pediste, ignora este correo: tu contraseña no cambiará.';
  const html = layout(
    subject,
    `${paragraph(`Hola, ${fullName}. Recibimos una solicitud para restablecer tu contraseña.`)}
<p style="margin:0 0 16px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:#1e40af;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px">Restablecer contraseña</a></p>
${paragraph(`El enlace funciona una sola vez y vence en ${minutes} minutos.`)}
${paragraph(ignore)}
<p style="margin:0;font-size:12px;color:#64748b;word-break:break-all">Si el botón no funciona, abre este enlace: ${escapeHtml(url)}</p>`,
  );
  const text = [
    `Hola, ${fullName}. Recibimos una solicitud para restablecer tu contraseña de Brely.`,
    '',
    url,
    '',
    `El enlace funciona una sola vez y vence en ${minutes} minutos.`,
    ignore,
  ].join('\n');
  return { subject, html, text };
}

export function renderPasswordChangedEmail(fullName: string) {
  const subject = 'Tu contraseña de Brely cambió';
  const warning = 'Si no fuiste tú, avisa de inmediato a quien administra tu negocio.';
  const intro = `Hola, ${fullName}. Tu contraseña se restableció y se cerraron las sesiones abiertas.`;
  return {
    subject,
    html: layout(subject, `${paragraph(intro)}${paragraph(warning)}`),
    text: `${intro}\n${warning}`,
  };
}
