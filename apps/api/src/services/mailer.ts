import crypto from 'node:crypto';

export interface OutboundEmailRequest {
  to: string;
  from?: string;
  subject: string;
  body: string;
  idempotencyKey?: string;
}

export interface OutboundEmailResult {
  delivered: boolean;
  provider: 'RESEND' | 'SENDGRID' | 'WEBHOOK' | 'MAIL_CLIENT_READY';
  provider_message_id: string;
  mailto_url: string;
  gmail_compose_url: string;
  note: string;
}

export function buildMailClientLinks(to: string, subject: string, body: string): {
  mailto_url: string;
  gmail_compose_url: string;
} {
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  const encodedTo = encodeURIComponent(to);

  return {
    mailto_url: `mailto:${encodedTo}?subject=${encodedSubject}&body=${encodedBody}`,
    gmail_compose_url: `https://mail.google.com/mail/?view=cm&fs=1&to=${encodedTo}&su=${encodedSubject}&body=${encodedBody}`,
  };
}

/**
 * Dispatches an approved outreach email via configured provider (Resend, SendGrid, or Webhook)
 * and always returns verified mailto / Gmail Web Compose links for direct client dispatch.
 */
export async function dispatchApprovedEmail(req: OutboundEmailRequest): Promise<OutboundEmailResult> {
  const { mailto_url, gmail_compose_url } = buildMailClientLinks(req.to, req.subject, req.body);
  const fromEmail = req.from || process.env.OUTREACH_FROM_EMAIL || '';

  // 1. Live Resend API Provider (if RESEND_API_KEY is configured in .env)
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && resendKey.trim().length > 5) {
    if (!fromEmail) {
      throw new Error('CONFIG_ERROR: OUTREACH_FROM_EMAIL must be configured to send via Resend');
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey.trim()}`,
        'Content-Type': 'application/json',
        ...(req.idempotencyKey ? { 'Idempotency-Key': req.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [req.to],
        subject: req.subject,
        text: req.body,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`PROVIDER_FAILURE (Resend HTTP ${res.status}): ${errText}`);
    }

    const data = (await res.json()) as any;
    return {
      delivered: true,
      provider: 'RESEND',
      provider_message_id: data.id || `resend_${crypto.randomBytes(6).toString('hex')}`,
      mailto_url,
      gmail_compose_url,
      note: 'Dispatched live via Resend API.',
    };
  }

  // 2. Live SendGrid API Provider (if SENDGRID_API_KEY is configured in .env)
  const sendgridKey = process.env.SENDGRID_API_KEY;
  if (sendgridKey && sendgridKey.trim().length > 5) {
    if (!fromEmail) {
      throw new Error('CONFIG_ERROR: OUTREACH_FROM_EMAIL must be configured to send via SendGrid');
    }
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sendgridKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: req.to }] }],
        from: { email: fromEmail },
        subject: req.subject,
        content: [{ type: 'text/plain', value: req.body }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`PROVIDER_FAILURE (SendGrid HTTP ${res.status}): ${errText}`);
    }

    const msgId =
      res.headers.get('x-message-id') || `sg_${crypto.randomBytes(6).toString('hex')}`;
    return {
      delivered: true,
      provider: 'SENDGRID',
      provider_message_id: msgId,
      mailto_url,
      gmail_compose_url,
      note: 'Dispatched live via SendGrid API.',
    };
  }

  // 3. Live Webhook Relay (if SMTP_WEBHOOK_URL is configured in .env)
  const webhookUrl = process.env.SMTP_WEBHOOK_URL;
  if (webhookUrl && webhookUrl.startsWith('http')) {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: req.to,
        from: fromEmail,
        subject: req.subject,
        text: req.body,
        idempotency_key: req.idempotencyKey,
      }),
    });
    if (!res.ok) {
      throw new Error(`PROVIDER_FAILURE (Webhook HTTP ${res.status})`);
    }
    return {
      delivered: true,
      provider: 'WEBHOOK',
      provider_message_id: `webhook_${crypto.randomBytes(6).toString('hex')}`,
      mailto_url,
      gmail_compose_url,
      note: 'Dispatched live via configured SMTP Webhook.',
    };
  }

  // 4. Default when no external SMTP API key is configured yet:
  // Records the approved send in CRM outbox and provides direct Gmail / mailto links.
  // Nothing was actually transmitted here, so `delivered` must be false; the UI
  // surfaces `note` and the compose links for the human to send.
  return {
    delivered: false,
    provider: 'MAIL_CLIENT_READY',
    provider_message_id: `msg_${crypto.randomBytes(6).toString('hex')}@jobhunt-os.outbox`,
    mailto_url,
    gmail_compose_url,
    note: 'Recorded in CRM Outbox (not sent). Add RESEND_API_KEY or SENDGRID_API_KEY in .env for server-side SMTP, or click "Open in Gmail" / "Open Mail App" to send directly from your email client.',
  };
}

/**
 * Dispatches a real Telegram Bot API alert when TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are configured.
 */
export async function dispatchTelegramNotification(
  title: string,
  message: string
): Promise<{ sentLive: boolean; response?: any }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId || token.trim() === '' || chatId.trim() === '') {
    return { sentLive: false };
  }

  try {
    const url = `https://api.telegram.org/bot${token.trim()}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId.trim(),
        text: `*${title}*\n\n${message}`,
        parse_mode: 'Markdown',
      }),
    });
    if (res.ok) {
      const json = await res.json();
      return { sentLive: true, response: json };
    }
    return { sentLive: false };
  } catch {
    return { sentLive: false };
  }
}
