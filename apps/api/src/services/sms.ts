import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Hubtel SMS integration (outbound).
 * Point of integration for ONYX POS invoice & broadcast SMS.
 * 
 * Required env vars (Render → Environment):
 *   HUBTEL_API_KEY   - Hubtel API key
 *   HUBTEL_SENDER_ID - registered sender ID / shortcode (e.g. "ONYXPOS")
 *   HUBTEL_BASE_URL  - Hubtel API base (default: https://api.hubtel.com/v1)
 *   SMS_ENABLED      - "true" to activate live sending (default "false")
 *
 * When SMS_ENABLED != "true" the send functions log and return success without
 * contacting Hubtel — safe for dev/testing without credentials.
 */

const HUBTEL_API_KEY = process.env.HUBTEL_API_KEY || '';
const HUBTEL_SENDER_ID = process.env.HUBTEL_SENDER_ID || '';
const HUBTEL_BASE_URL = process.env.HUBTEL_BASE_URL || 'https://api.hubtel.com/v1';
const SMS_ENABLED = process.env.SMS_ENABLED === 'true';

function log(msg: string, payload?: Record<string, unknown>) {
  console.log(`[ONYX SMS] ${msg}`, payload ? JSON.stringify(payload) : '');
}

interface HubtelMessage {
  MessageId?: string;
}

interface HubtelSendResponse {
  MessageId?: string;
  Message?: HubtelMessage[];
}

async function postJson(path: string, body: Record<string, unknown>): Promise<HubtelSendResponse> {
  const url = `${HUBTEL_BASE_URL}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${HUBTEL_API_KEY}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Hubtel SMS error ${res.status}: ${text}`);
  }
  return res.json() as Promise<HubtelSendResponse>;
}

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a single SMS via Hubtel.
 * Returns success=true when SMS_ENABLED is false (dry-run mode).
 */
export async function sendSms(to: string, text: string): Promise<SmsSendResult> {
  if (!to || !to.trim()) {
    return { success: false, error: 'No recipient phone' };
  }
  if (!SMS_ENABLED) {
    log('SMS dry-run (SMS_ENABLED=false)', { to, preview: text.slice(0, 160) });
    return { success: true, messageId: 'dry-run' };
  }
  if (!HUBTEL_API_KEY || !HUBTEL_SENDER_ID) {
    log('SMS skipped: missing credentials', { to });
    return { success: false, error: 'SMS credentials not configured' };
  }
  try {
    const body = {
      To: to.trim(),
      From: HUBTEL_SENDER_ID,
      Text: text,
    };
    const json = await postJson('/messages/send', body);
    const messageId = json.MessageId || json.Message?.[0]?.MessageId;
    log('SMS sent', { to, messageId, response: json });
    return { success: true, messageId: String(messageId ?? 'unknown') };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log('SMS failed', { to, error });
    return { success: false, error };
  }
}

/**
 * Build an SMS invoice message from sale data.
 */
export function buildSmsInvoice(sale: {
  receiptNumber: string;
  customerName?: string | null;
  customerPhone?: string | null;
  total: number;
  items: Array<{ name: string; quantity: number; total: number }>;
  businessName?: string;
}, options?: { includeItems?: boolean }): string {
  const lines: string[] = [];
  const bName = options?.includeItems ? sale.businessName : undefined;
  if (bName) lines.push(`${bName} Invoice`);
  lines.push(`Receipt: ${sale.receiptNumber}`);
  if (sale.customerName) lines.push(`Customer: ${sale.customerName}`);
  lines.push(`Total: GHS ${sale.total.toFixed(2)}`);
  if (options?.includeItems !== false && sale.items && sale.items.length) {
    for (const it of sale.items.slice(0, 5)) {
      lines.push(`- ${it.name} x${it.quantity}: GHS ${it.total.toFixed(2)}`);
    }
    if (sale.items.length > 5) lines.push(`... +${sale.items.length - 5} more items`);
  }
  return lines.join('\n');
}

/**
 * Queue / send an SMS invoice for a completed sale.
 * Creates an audit-log entry for the SMS attempt.
 */
export async function sendInvoiceSms(saleId: string, overridePhone?: string): Promise<SmsSendResult> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { items: { orderBy: { productId: 'asc' } }, customer: { select: { name: true } } },
  });
  if (!sale) throw new AppError('Sale not found', 404);
  if (sale.status !== 'COMPLETED') throw new AppError('Only completed sales can receive SMS invoices', 400);

  let phone = overridePhone || sale.customerPhone;
  if (!phone && sale.customerId) {
    // Try customer.phone if sale.customerPhone is absent
    const cust = await prisma.customer.findUnique({ where: { id: sale.customerId } });
    phone = cust?.phone || '';
    if (phone) {
      // update sale.customerPhone for future reference
      await prisma.sale.update({ where: { id: saleId }, data: { customerPhone: phone } });
    }
  }
  if (!phone) return { success: false, error: 'No phone number on sale or customer' };

  const smsText = buildSmsInvoice({
    receiptNumber: sale.receiptNumber,
    customerName: sale.customer?.name ?? undefined,
    customerPhone: sale.customerPhone,
    total: sale.total,
    items: sale.items,
  }, { includeItems: true });

  const result = await sendSms(phone, smsText);

  await prisma.auditLog.create({
    data: {
      userId: 'system',
      action: result.success ? 'SMS_INVOICE_SENT' : 'SMS_INVOICE_FAILED',
      entity: 'sale',
      entityId: saleId,
      details: {
        receiptNumber: sale.receiptNumber,
        phone,
        message: result.messageId || result.error,
        success: result.success,
      },
    },
  });

  return result;
}
