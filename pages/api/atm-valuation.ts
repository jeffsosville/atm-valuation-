// pages/api/atm-valuation.ts
//
// Captures every ATM route valuation request:
//   - Anonymous calculations are logged for analytics
//   - When user requests full report, name/email/phone are added
//   - Emails john@atmbrokerage.com on every full-report request
//   - Sends confirmation to the seller
//
// Inputs simplified (2026-05): single surcharge_income + interchange_income
// fields replace transactions × surcharge math.

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const FROM_EMAIL     = 'ATM Brokerage <noreply@atmbrokerage.com>';
const TO_EMAIL       = 'john@atmbrokerage.com';
const CC_EMAIL       = process.env.VALUATION_CC_EMAIL || '';

type Body = {
  // Inputs
  route_type: 'self_load' | 'third_party_load' | 'processing_only';

  monthly_surcharge_income?: number | null;
  monthly_interchange_income?: number | null;

  monthly_merchant_payments?: number | null;
  monthly_wireless_fees?: number | null;
  monthly_loading_fees?: number | null;
  monthly_maintenance?: number | null;

  num_atms?: number | null;
  contract_coverage_pct?: number | null;
  avg_equipment_age_years?: number | null;

  // Computed
  computed_gross_revenue: number;
  computed_monthly_net: number;
  computed_multiple: number;
  computed_value: number;

  // Lead (only present on full-report request)
  name?: string;
  email?: string;
  phone?: string;
  wants_full_report?: boolean;

  // Meta
  referrer?: string;
};

const money = (n?: number | null) =>
  n == null ? '—' : n.toLocaleString('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  });

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const routeTypeLabel = (t: string) => ({
  self_load:        'Self-load',
  third_party_load: '3rd-party load',
  processing_only:  'Processing only',
}[t] || t);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const body = req.body as Body;

    if (!body.route_type) {
      return res.status(400).json({ error: 'route_type required' });
    }

    if (body.wants_full_report) {
      if (!body.name || !body.email) {
        return res.status(400).json({ error: 'Name and email required for full report' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
        return res.status(400).json({ error: 'Invalid email' });
      }
    }

    const userAgent = req.headers['user-agent'] || '';
    const fwd = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0]?.trim()) || '';

    // 1. Save to Supabase
    const { data: row, error: dbError } = await supabase
      .from('atm_valuations')
      .insert({
        route_type:                 body.route_type,
        monthly_surcharge_income:   body.monthly_surcharge_income ?? null,
        monthly_interchange_income: body.monthly_interchange_income ?? null,
        monthly_merchant_payments:  body.monthly_merchant_payments ?? null,
        monthly_wireless_fees:      body.monthly_wireless_fees ?? null,
        monthly_loading_fees:       body.monthly_loading_fees ?? null,
        monthly_maintenance:        body.monthly_maintenance ?? null,
        num_atms:                   body.num_atms ?? null,
        contract_coverage_pct:      body.contract_coverage_pct ?? null,
        avg_equipment_age_years:    body.avg_equipment_age_years ?? null,
        computed_gross_revenue:     body.computed_gross_revenue,
        computed_monthly_net:       body.computed_monthly_net,
        computed_multiple:          body.computed_multiple,
        computed_value:             body.computed_value,
        name:                       body.name || null,
        email:                      body.email || null,
        phone:                      body.phone || null,
        wants_full_report:          body.wants_full_report || false,
        user_agent:                 userAgent,
        ip_address:                 ip,
        referrer:                   body.referrer || null,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Supabase insert error:', dbError);
      return res.status(500).json({ error: 'Failed to save' });
    }

    // 2. Only fire emails when full report requested
    if (body.wants_full_report && body.email) {

      const subject = `ATM Valuation — ${body.name} · ${money(body.computed_value)} (${routeTypeLabel(body.route_type)})`;

      const internalHtml = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f5f0;font-family:Georgia,serif;color:#1a1612;">
  <div style="max-width:620px;margin:0 auto;padding:32px 24px;">
    <div style="border-bottom:3px double #1a1612;padding-bottom:12px;margin-bottom:24px;">
      <div style="font-family:Menlo,monospace;font-size:11px;letter-spacing:0.12em;color:#1a1612;">
        ATM BROKERAGE
      </div>
      <div style="font-family:Menlo,monospace;font-size:10px;letter-spacing:0.1em;color:#b7361a;margin-top:4px;">
        VALUATION REQUEST · ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })}
      </div>
    </div>

    <h1 style="font-family:Georgia,serif;font-size:28px;font-weight:700;margin:0 0 8px;line-height:1.2;">
      ${money(body.computed_value)}
    </h1>
    <div style="font-family:Menlo,monospace;font-size:11px;letter-spacing:0.08em;color:#8a7e6e;margin-bottom:24px;">
      ${routeTypeLabel(body.route_type)} · ${body.computed_multiple}× monthly net of ${money(body.computed_monthly_net)}
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
      <tr><td style="padding:10px 0;border-top:1px solid #d8d0c0;font-family:Menlo,monospace;font-size:10px;letter-spacing:0.1em;color:#8a7e6e;width:160px;vertical-align:top;">SELLER</td>
          <td style="padding:10px 0;border-top:1px solid #d8d0c0;"><strong>${escapeHtml(body.name || '')}</strong></td></tr>
      <tr><td style="padding:10px 0;border-top:1px solid #d8d0c0;font-family:Menlo,monospace;font-size:10px;letter-spacing:0.1em;color:#8a7e6e;vertical-align:top;">EMAIL</td>
          <td style="padding:10px 0;border-top:1px solid #d8d0c0;"><a href="mailto:${escapeHtml(body.email || '')}" style="color:#b7361a;text-decoration:none;">${escapeHtml(body.email || '')}</a></td></tr>
      ${body.phone ? `
      <tr><td style="padding:10px 0;border-top:1px solid #d8d0c0;font-family:Menlo,monospace;font-size:10px;letter-spacing:0.1em;color:#8a7e6e;vertical-align:top;">PHONE</td>
          <td style="padding:10px 0;border-top:1px solid #d8d0c0;">${escapeHtml(body.phone)}</td></tr>` : ''}
    </table>

    <div style="font-family:Menlo,monospace;font-size:10px;letter-spacing:0.14em;color:#b7361a;margin-bottom:8px;">— ROUTE INPUTS</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
      <tr><td style="padding:8px 0;border-top:1px solid #d8d0c0;color:#8a7e6e;width:200px;">Monthly surcharge income</td>
          <td style="padding:8px 0;border-top:1px solid #d8d0c0;font-family:Menlo,monospace;">${money(body.monthly_surcharge_income)}</td></tr>
      <tr><td style="padding:8px 0;border-top:1px solid #d8d0c0;color:#8a7e6e;">Monthly interchange income</td>
          <td style="padding:8px 0;border-top:1px solid #d8d0c0;font-family:Menlo,monospace;">${money(body.monthly_interchange_income)}</td></tr>
      <tr><td style="padding:8px 0;border-top:1px solid #d8d0c0;color:#8a7e6e;"><strong>Gross monthly revenue</strong></td>
          <td style="padding:8px 0;border-top:1px solid #d8d0c0;font-family:Menlo,monospace;"><strong>${money(body.computed_gross_revenue)}</strong></td></tr>
      ${body.route_type !== 'processing_only' ? `
      <tr><td style="padding:8px 0;border-top:1px solid #d8d0c0;color:#8a7e6e;">Merchant payments</td>
          <td style="padding:8px 0;border-top:1px solid #d8d0c0;font-family:Menlo,monospace;">${money(body.monthly_merchant_payments)}</td></tr>
      <tr><td style="padding:8px 0;border-top:1px solid #d8d0c0;color:#8a7e6e;">Wireless fees</td>
          <td style="padding:8px 0;border-top:1px solid #d8d0c0;font-family:Menlo,monospace;">${money(body.monthly_wireless_fees)}</td></tr>` : ''}
      ${body.route_type === 'third_party_load' ? `
      <tr><td style="padding:8px 0;border-top:1px solid #d8d0c0;color:#8a7e6e;">Loading fees</td>
          <td style="padding:8px 0;border-top:1px solid #d8d0c0;font-family:Menlo,monospace;">${money(body.monthly_loading_fees)}</td></tr>
      <tr><td style="padding:8px 0;border-top:1px solid #d8d0c0;color:#8a7e6e;">Maintenance</td>
          <td style="padding:8px 0;border-top:1px solid #d8d0c0;font-family:Menlo,monospace;">${money(body.monthly_maintenance)}</td></tr>` : ''}
      <tr><td style="padding:8px 0;border-top:1px solid #d8d0c0;color:#8a7e6e;"># of ATMs</td>
          <td style="padding:8px 0;border-top:1px solid #d8d0c0;font-family:Menlo,monospace;">${body.num_atms ?? '—'}</td></tr>
      <tr><td style="padding:8px 0;border-top:1px solid #d8d0c0;color:#8a7e6e;">Contract coverage</td>
          <td style="padding:8px 0;border-top:1px solid #d8d0c0;font-family:Menlo,monospace;">${body.contract_coverage_pct != null ? body.contract_coverage_pct + '%' : '—'}</td></tr>
      <tr><td style="padding:8px 0;border-top:1px solid #d8d0c0;border-bottom:1px solid #d8d0c0;color:#8a7e6e;">Avg equipment age</td>
          <td style="padding:8px 0;border-top:1px solid #d8d0c0;border-bottom:1px solid #d8d0c0;font-family:Menlo,monospace;">${body.avg_equipment_age_years != null ? body.avg_equipment_age_years + ' yrs' : '—'}</td></tr>
    </table>

    <div style="margin-top:32px;padding-top:16px;border-top:3px double #1a1612;font-family:Menlo,monospace;font-size:10px;letter-spacing:0.1em;color:#8a7e6e;">
      Source: ${escapeHtml(body.referrer || 'direct')} · Reply to this email to respond to seller<br/>
      Valuation ID: ${row.id}
    </div>
  </div>
</body></html>
      `;

      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from:     FROM_EMAIL,
            to:       [TO_EMAIL],
            ...(CC_EMAIL ? { cc: [CC_EMAIL] } : {}),
            reply_to: body.email,
            subject,
            html: internalHtml,
          }),
        });
      } catch (e) {
        console.error('Resend internal email failed:', e);
      }

      const sellerHtml = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f5f0;font-family:Georgia,serif;color:#1a1612;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="border-bottom:3px double #1a1612;padding-bottom:12px;margin-bottom:32px;">
      <div style="font-family:Menlo,monospace;font-size:11px;letter-spacing:0.12em;color:#1a1612;">
        ATM BROKERAGE
      </div>
    </div>

    <h1 style="font-family:Georgia,serif;font-size:26px;font-weight:700;margin:0 0 16px;line-height:1.3;">
      Thanks, ${escapeHtml((body.name || '').split(' ')[0])}.
    </h1>

    <div style="background:#fff;border:1px solid #d8d0c0;padding:20px;margin-bottom:24px;">
      <div style="font-family:Menlo,monospace;font-size:10px;letter-spacing:0.1em;color:#8a7e6e;margin-bottom:6px;">
        ESTIMATED ROUTE VALUE
      </div>
      <div style="font-family:Georgia,serif;font-size:32px;font-weight:700;color:#1a1612;line-height:1;">
        ${money(body.computed_value)}
      </div>
      <div style="font-family:Menlo,monospace;font-size:11px;color:#8a7e6e;margin-top:8px;">
        ${routeTypeLabel(body.route_type)} · ${body.computed_multiple}× monthly net
      </div>
    </div>

    <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">
      We'll review your inputs and reach out within one business day with a full route analysis. We'll factor in contract coverage, equipment age, location concentration, and recent comparable sales from our 200+ closed transactions.
    </p>

    <p style="font-size:15px;line-height:1.7;margin:0 0 32px;">
      In the meantime, if you have questions or want to discuss the route, reply to this email.
    </p>

    <div style="border-top:1px solid #d8d0c0;padding-top:16px;font-family:Menlo,monospace;font-size:11px;color:#8a7e6e;line-height:1.7;">
      ATM Brokerage · The largest ATM route brokerage in the US.<br/>
      <a href="https://atmbrokerage.com" style="color:#b7361a;text-decoration:none;">atmbrokerage.com</a> · 888-430-5535
    </div>
  </div>
</body></html>
      `;

      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from:    FROM_EMAIL,
            to:      [body.email],
            subject: `Your ATM route valuation — ${money(body.computed_value)}`,
            html:    sellerHtml,
          }),
        });
      } catch (e) {
        console.error('Resend seller confirmation failed:', e);
      }
    }

    return res.status(200).json({ success: true, id: row.id });
  } catch (err) {
    console.error('ATM valuation error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
