// pages/calculator.tsx
//
// ATM Route Valuation Calculator
// Embedded as iframe on atmbrokerage.com (WordPress) and atmexits.com.
//
// SIMPLIFIED INPUTS (2026-05):
// - "Total monthly surcharge income" (one $ field) replaces txns × surcharge
// - "Total monthly interchange income" (one $ field) — new, on all route types
// - Expense fields branch by route type as before
// - Processing-only no longer has separate "monthly net" field — same revenue/expense pattern as others

import Head from 'next/head';
import { useState, useEffect, useMemo, useRef } from 'react';

type RouteType = 'self_load' | 'third_party_load' | 'processing_only';

const MULTIPLES: Record<RouteType, number> = {
  self_load:        25,
  third_party_load: 42,
  processing_only:  45,
};

const ROUTE_LABELS: Record<RouteType, string> = {
  self_load:        'Self-load',
  third_party_load: '3rd-party load',
  processing_only:  'Processing only',
};

const money = (n: number | null | undefined) =>
  n == null || isNaN(n) ? '—' : n.toLocaleString('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  });

const num = (s: string): number => {
  const v = parseFloat(s.replace(/[,$\s]/g, ''));
  return isNaN(v) ? 0 : v;
};

export default function Calculator() {
  // ── Step 1: route type ─────────────────────────────────
  const [routeType, setRouteType] = useState<RouteType | ''>('');

  // ── Step 2: revenue (simplified — direct $ entry) ──────
  const [surchargeIncome,   setSurchargeIncome]   = useState('');
  const [interchangeIncome, setInterchangeIncome] = useState('');

  // ── Step 3: expenses (vary by route type) ──────────────
  const [merchantPay, setMerchantPay] = useState('');
  const [wireless,    setWireless]    = useState('');
  const [loadingFees, setLoadingFees] = useState('');
  const [maintenance, setMaintenance] = useState('');

  // ── Step 4: optional details ───────────────────────────
  const [numAtms,     setNumAtms]     = useState('');
  const [contractPct, setContractPct] = useState('');
  const [equipAge,    setEquipAge]    = useState('');

  // ── Lead capture ───────────────────────────────────────
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [name,  setName]  = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitStatus, setSubmitStatus] = useState<'idle'|'loading'|'success'|'error'>('idle');
  const [submitError, setSubmitError] = useState('');

  // ── Compute valuation in real time ─────────────────────
  const computed = useMemo(() => {
    if (!routeType) return null;

    const grossRevenue = num(surchargeIncome) + num(interchangeIncome);
    let monthlyNet = grossRevenue;

    if (routeType === 'self_load') {
      monthlyNet = grossRevenue - num(merchantPay) - num(wireless);
    } else if (routeType === 'third_party_load') {
      monthlyNet = grossRevenue - num(merchantPay) - num(wireless) - num(loadingFees) - num(maintenance);
    }
    // processing_only: net = gross (no expense subtraction in calculator)

    const multiple = MULTIPLES[routeType];
    const value = monthlyNet * multiple;

    return { grossRevenue, monthlyNet, multiple, value };
  }, [
    routeType, surchargeIncome, interchangeIncome,
    merchantPay, wireless, loadingFees, maintenance,
  ]);

  const minInputsFilled = useMemo(() => {
    if (!routeType) return false;
    return num(surchargeIncome) > 0 || num(interchangeIncome) > 0;
  }, [routeType, surchargeIncome, interchangeIncome]);

  const showResult = !!computed && minInputsFilled;

  // ── iframe auto-resize ─────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sendHeight = () => {
      const h = containerRef.current?.scrollHeight ?? 0;
      try {
        window.parent.postMessage({ type: 'atm-calc-height', height: h }, '*');
      } catch {}
    };
    sendHeight();
    const obs = new ResizeObserver(sendHeight);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [routeType, showResult, showLeadForm, submitStatus]);

  // ── Submit lead capture ────────────────────────────────
  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!computed || !name || !email) return;

    setSubmitStatus('loading');
    setSubmitError('');

    try {
      const res = await fetch('/api/atm-valuation', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route_type: routeType,
          monthly_surcharge_income:   num(surchargeIncome),
          monthly_interchange_income: num(interchangeIncome),
          monthly_merchant_payments:  routeType !== 'processing_only' ? num(merchantPay) : null,
          monthly_wireless_fees:      routeType !== 'processing_only' ? num(wireless)    : null,
          monthly_loading_fees:       routeType === 'third_party_load' ? num(loadingFees) : null,
          monthly_maintenance:        routeType === 'third_party_load' ? num(maintenance) : null,
          num_atms:                   numAtms     ? num(numAtms)     : null,
          contract_coverage_pct:      contractPct ? num(contractPct) : null,
          avg_equipment_age_years:    equipAge    ? num(equipAge)    : null,
          computed_gross_revenue:     computed.grossRevenue,
          computed_monthly_net:       computed.monthlyNet,
          computed_multiple:          computed.multiple,
          computed_value:             computed.value,
          name, email, phone,
          wants_full_report: true,
          referrer: typeof document !== 'undefined' ? document.referrer : '',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Submission failed');
      }
      setSubmitStatus('success');
    } catch (err: any) {
      setSubmitStatus('error');
      setSubmitError(err.message || 'Something went wrong');
    }
  };

  return (
    <>
      <Head>
        <title>ATM Route Valuation Calculator — ATM Brokerage</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Estimate the value of your ATM route in 60 seconds. Backed by 200+ closed transactions." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </Head>

      <style jsx global>{`
        * { box-sizing: border-box; }
        html, body {
          margin: 0; padding: 0;
          background: transparent;
          color: #0f172a;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 15px;
          line-height: 1.5;
          -webkit-font-smoothing: antialiased;
        }
      `}</style>

      <div ref={containerRef} className="wrap">

        {/* ── HEADER ─────────────────────────────────────── */}
        <div className="head">
          <div className="kicker">ATM ROUTE VALUATION</div>
          <h1>What's your ATM route worth?</h1>
          <p className="sub">
            Get an instant estimate based on industry-standard multiples.
            Backed by 200+ closed transactions at ATM Brokerage.
          </p>
        </div>

        {/* ── STEP 1: ROUTE TYPE ─────────────────────────── */}
        <Section step="1" title="Route type">
          <div className="route-grid">
            {(['self_load','third_party_load','processing_only'] as RouteType[]).map(t => (
              <button
                key={t}
                type="button"
                className={`route-card ${routeType === t ? 'active' : ''}`}
                onClick={() => setRouteType(t)}
              >
                <div className="route-label">{ROUTE_LABELS[t]}</div>
                <div className="route-desc">
                  {t === 'self_load'        && 'Own equipment, fund own vault cash'}
                  {t === 'third_party_load' && 'Own equipment, third party funds cash'}
                  {t === 'processing_only'  && 'Interchange only, no equipment ownership'}
                </div>
                <div className="route-mult">{MULTIPLES[t]}× monthly net</div>
              </button>
            ))}
          </div>
        </Section>

        {/* ── STEP 2: REVENUE (simplified, all route types) ─ */}
        {routeType && (
          <Section step="2" title="Monthly revenue">
            <div className="row two">
              <Field label="Total monthly surcharge income" hint="Across the whole route">
                <div className="dollar-input">
                  <span>$</span>
                  <input type="text" inputMode="numeric" placeholder="e.g. 12,000"
                    value={surchargeIncome} onChange={e => setSurchargeIncome(e.target.value)} />
                </div>
              </Field>
              <Field label="Total monthly interchange income" hint="Across the whole route">
                <div className="dollar-input">
                  <span>$</span>
                  <input type="text" inputMode="numeric" placeholder="e.g. 1,200"
                    value={interchangeIncome} onChange={e => setInterchangeIncome(e.target.value)} />
                </div>
              </Field>
            </div>
            {(num(surchargeIncome) > 0 || num(interchangeIncome) > 0) && (
              <div className="callout">
                Gross monthly revenue: <strong>{money(num(surchargeIncome) + num(interchangeIncome))}</strong>
              </div>
            )}
          </Section>
        )}

        {/* ── STEP 3: EXPENSES (vary by route type) ─────────── */}
        {routeType && routeType !== 'processing_only' && (
          <Section step="3" title="Monthly expenses">
            <div className="row two">
              <Field label="Total merchant payments" hint="What you pay locations">
                <div className="dollar-input">
                  <span>$</span>
                  <input type="text" inputMode="numeric" placeholder="0"
                    value={merchantPay} onChange={e => setMerchantPay(e.target.value)} />
                </div>
              </Field>
              <Field label="Total wireless fees">
                <div className="dollar-input">
                  <span>$</span>
                  <input type="text" inputMode="numeric" placeholder="0"
                    value={wireless} onChange={e => setWireless(e.target.value)} />
                </div>
              </Field>
            </div>

            {routeType === 'third_party_load' && (
              <div className="row two">
                <Field label="Total loading fees" hint="Cash provider fees">
                  <div className="dollar-input">
                    <span>$</span>
                    <input type="text" inputMode="numeric" placeholder="0"
                      value={loadingFees} onChange={e => setLoadingFees(e.target.value)} />
                  </div>
                </Field>
                <Field label="Total maintenance costs">
                  <div className="dollar-input">
                    <span>$</span>
                    <input type="text" inputMode="numeric" placeholder="0"
                      value={maintenance} onChange={e => setMaintenance(e.target.value)} />
                  </div>
                </Field>
              </div>
            )}
          </Section>
        )}

        {/* ── STEP 4: OPTIONAL DETAILS ──────────────────────── */}
        {routeType && (
          <Section step={routeType === 'processing_only' ? '3' : '4'}
                   title="Route details" subtitle="Optional — these affect final valuation">
            <div className="row three">
              <Field label="# of ATMs">
                <input type="text" inputMode="numeric" placeholder="e.g. 12"
                  value={numAtms} onChange={e => setNumAtms(e.target.value)} />
              </Field>
              <Field label="Contract coverage" hint="% of locations under contract">
                <div className="pct-input">
                  <input type="text" inputMode="numeric" placeholder="e.g. 100"
                    value={contractPct} onChange={e => setContractPct(e.target.value)} />
                  <span>%</span>
                </div>
              </Field>
              <Field label="Avg equipment age" hint="In years">
                <input type="text" inputMode="decimal" placeholder="e.g. 3"
                  value={equipAge} onChange={e => setEquipAge(e.target.value)} />
              </Field>
            </div>
          </Section>
        )}

        {/* ── RESULT ─────────────────────────────────────── */}
        {showResult && computed && (
          <div className="result">
            <div className="result-kicker">ESTIMATED ROUTE VALUE</div>
            <div className="result-value">{money(computed.value)}</div>
            <div className="result-meta">
              {ROUTE_LABELS[routeType as RouteType]} · {computed.multiple}× monthly net of {money(computed.monthlyNet)}
            </div>

            <div className="result-breakdown">
              <div className="bd-row">
                <span>Surcharge income</span>
                <strong>{money(num(surchargeIncome))}</strong>
              </div>
              <div className="bd-row">
                <span>Interchange income</span>
                <strong>{money(num(interchangeIncome))}</strong>
              </div>
              <div className="bd-row total">
                <span>Gross monthly revenue</span>
                <strong>{money(computed.grossRevenue)}</strong>
              </div>
              {routeType !== 'processing_only' && (
                <div className="bd-row">
                  <span>Monthly expenses</span>
                  <strong>−{money(computed.grossRevenue - computed.monthlyNet)}</strong>
                </div>
              )}
              <div className="bd-row total">
                <span>Monthly net</span>
                <strong>{money(computed.monthlyNet)}</strong>
              </div>
              <div className="bd-row">
                <span>× Multiple ({ROUTE_LABELS[routeType as RouteType]})</span>
                <strong>{computed.multiple}</strong>
              </div>
              <div className="bd-row total">
                <span>Estimated value</span>
                <strong>{money(computed.value)}</strong>
              </div>
            </div>

            <div className="result-note">
              This is a baseline estimate using market multiples.
              Final valuation factors include contract coverage{contractPct && ` (you entered ${contractPct}%)`},
              equipment age{equipAge && ` (${equipAge} yrs)`}, location concentration, and recent comparable sales.
              Have a mixed route (multiple types)? Request a full analysis for accurate valuation across each portion.
            </div>

            {!showLeadForm && submitStatus !== 'success' && (
              <button className="cta" onClick={() => setShowLeadForm(true)}>
                Get a full route analysis (free) →
              </button>
            )}

            {showLeadForm && submitStatus !== 'success' && (
              <form onSubmit={handleLeadSubmit} className="lead-form">
                <div className="lead-kicker">REQUEST FULL ANALYSIS</div>
                <p className="lead-sub">
                  We'll review contract details, equipment, and pull comparable sales from our 200+ closed deals.
                  No cost. Response within one business day.
                </p>
                <div className="row two">
                  <Field label="Name *">
                    <input type="text" required value={name} onChange={e => setName(e.target.value)} />
                  </Field>
                  <Field label="Email *">
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)} />
                  </Field>
                </div>
                <Field label="Phone (optional)">
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
                </Field>
                <button type="submit" disabled={submitStatus === 'loading'} className="cta">
                  {submitStatus === 'loading' ? 'Sending…' : 'Request analysis →'}
                </button>
                {submitStatus === 'error' && <p className="form-error">{submitError}</p>}
              </form>
            )}

            {submitStatus === 'success' && (
              <div className="success">
                <div className="success-kicker">REQUEST RECEIVED</div>
                <h3>We'll be in touch within one business day.</h3>
                <p>Confirmation sent to your email. Check your inbox.</p>
              </div>
            )}
          </div>
        )}

        <div className="footer">
          ATM Brokerage · 200+ closed transactions · $100M+ in volume since 2012<br/>
          <a href="https://atmbrokerage.com" target="_blank" rel="noopener">atmbrokerage.com</a> · 888-430-5535
        </div>
      </div>

      <style jsx>{`
        .wrap {
          max-width: 720px;
          margin: 0 auto;
          padding: 24px 20px 48px;
        }

        .head { margin-bottom: 32px; }
        .kicker {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.12em;
          color: #b7361a;
          margin-bottom: 12px;
        }
        h1 {
          font-size: 32px;
          font-weight: 700;
          letter-spacing: -0.02em;
          line-height: 1.15;
          margin: 0 0 12px;
          color: #0f172a;
        }
        .sub {
          font-size: 16px;
          color: #475569;
          margin: 0;
          max-width: 56ch;
        }

        .route-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        @media (min-width: 600px) {
          .route-grid { grid-template-columns: repeat(3, 1fr); }
        }
        .route-card {
          padding: 16px;
          background: #fff;
          border: 1.5px solid #e2e8f0;
          border-radius: 8px;
          cursor: pointer;
          text-align: left;
          font-family: inherit;
          transition: all 0.15s ease;
        }
        .route-card:hover {
          border-color: #94a3b8;
        }
        .route-card.active {
          border-color: #b7361a;
          background: #fef7f5;
          box-shadow: 0 0 0 3px rgba(183, 54, 26, 0.1);
        }
        .route-label {
          font-weight: 600;
          font-size: 15px;
          color: #0f172a;
          margin-bottom: 6px;
        }
        .route-desc {
          font-size: 12px;
          color: #64748b;
          line-height: 1.4;
          margin-bottom: 10px;
          min-height: 32px;
        }
        .route-mult {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: #b7361a;
          letter-spacing: 0.05em;
        }

        .row {
          display: grid;
          gap: 14px;
          margin-bottom: 14px;
        }
        .row.two   { grid-template-columns: 1fr; }
        .row.three { grid-template-columns: 1fr; }
        @media (min-width: 600px) {
          .row.two   { grid-template-columns: 1fr 1fr; }
          .row.three { grid-template-columns: 1fr 1fr 1fr; }
        }

        .callout {
          margin-top: 14px;
          padding: 10px 14px;
          background: #f8fafc;
          border-left: 3px solid #b7361a;
          font-size: 14px;
          color: #475569;
        }
        .callout strong { color: #0f172a; }

        .result {
          margin-top: 32px;
          padding: 28px 24px;
          background: #fff;
          border: 1.5px solid #0f172a;
          border-radius: 10px;
        }
        .result-kicker {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.12em;
          color: #b7361a;
          margin-bottom: 8px;
        }
        .result-value {
          font-size: 48px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #0f172a;
          line-height: 1;
          margin-bottom: 8px;
        }
        .result-meta {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          color: #64748b;
          margin-bottom: 24px;
        }
        .result-breakdown {
          background: #f8fafc;
          padding: 16px;
          border-radius: 6px;
          margin-bottom: 20px;
        }
        .bd-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          font-size: 14px;
          color: #475569;
        }
        .bd-row strong { color: #0f172a; font-weight: 600; }
        .bd-row.total {
          border-top: 1px solid #cbd5e1;
          margin-top: 6px;
          padding-top: 10px;
          color: #0f172a;
          font-weight: 600;
        }
        .bd-row.total:last-child {
          font-size: 17px;
        }
        .result-note {
          font-size: 13px;
          line-height: 1.6;
          color: #64748b;
          margin-bottom: 20px;
        }

        .cta {
          display: block;
          width: 100%;
          padding: 14px 18px;
          background: #0f172a;
          color: #fff;
          border: none;
          border-radius: 6px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s ease;
        }
        .cta:hover:not(:disabled) { background: #b7361a; }
        .cta:disabled { opacity: 0.5; cursor: not-allowed; }

        .lead-form {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid #e2e8f0;
        }
        .lead-kicker {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.12em;
          color: #b7361a;
          margin-bottom: 8px;
        }
        .lead-sub {
          font-size: 14px;
          color: #475569;
          margin: 0 0 16px;
          line-height: 1.6;
        }
        .form-error {
          margin-top: 10px;
          font-size: 13px;
          color: #b7361a;
        }

        .success {
          padding-top: 24px;
          border-top: 1px solid #e2e8f0;
          margin-top: 24px;
        }
        .success-kicker {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.12em;
          color: #16a34a;
          margin-bottom: 8px;
        }
        .success h3 {
          font-size: 20px;
          font-weight: 700;
          margin: 0 0 8px;
          color: #0f172a;
        }
        .success p {
          font-size: 14px;
          color: #475569;
          margin: 0;
        }

        .footer {
          margin-top: 48px;
          padding-top: 24px;
          border-top: 1px solid #e2e8f0;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          line-height: 1.7;
          color: #64748b;
          text-align: center;
        }
        .footer a {
          color: #b7361a;
          text-decoration: none;
        }
      `}</style>
    </>
  );
}

/* ────────────────────────────────────────────────────────── */
/*  Sub-components                                             */
/* ────────────────────────────────────────────────────────── */

function Section({
  step, title, subtitle, children,
}: {
  step: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section">
      <div className="step-head">
        <span className="step-n">{step}</span>
        <h2>{title}</h2>
      </div>
      {subtitle && <p className="step-sub">{subtitle}</p>}
      <div className="step-body">{children}</div>
      <style jsx>{`
        .section {
          margin-bottom: 28px;
          padding-bottom: 28px;
          border-bottom: 1px solid #e2e8f0;
        }
        .section:last-of-type { border-bottom: none; padding-bottom: 0; }
        .step-head {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 4px;
        }
        .step-n {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px; height: 28px;
          background: #0f172a;
          color: #fff;
          border-radius: 50%;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          font-weight: 600;
        }
        h2 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
          color: #0f172a;
        }
        .step-sub {
          font-size: 13px;
          color: #64748b;
          margin: 0 0 16px 40px;
        }
        .step-body {
          margin-top: 16px;
        }
      `}</style>
    </section>
  );
}

function Field({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="lbl">{label}</span>
      {hint && <span className="hint">{hint}</span>}
      {children}
      <style jsx>{`
        .field { display: block; }
        .lbl {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: #0f172a;
          margin-bottom: 4px;
        }
        .hint {
          display: block;
          font-size: 12px;
          color: #64748b;
          margin-bottom: 6px;
        }
        .field :global(input) {
          width: 100%;
          padding: 10px 12px;
          font-size: 15px;
          border: 1.5px solid #cbd5e1;
          border-radius: 6px;
          background: #fff;
          font-family: inherit;
          color: #0f172a;
          transition: border-color 0.15s ease;
        }
        .field :global(input:focus) {
          outline: none;
          border-color: #b7361a;
          box-shadow: 0 0 0 3px rgba(183, 54, 26, 0.1);
        }
        .field :global(.dollar-input),
        .field :global(.pct-input) {
          position: relative;
          display: flex;
          align-items: center;
        }
        .field :global(.dollar-input span),
        .field :global(.pct-input span) {
          position: absolute;
          font-size: 15px;
          color: #64748b;
          font-family: 'JetBrains Mono', monospace;
          pointer-events: none;
        }
        .field :global(.dollar-input span) { left: 12px; }
        .field :global(.pct-input span)    { right: 12px; }
        .field :global(.dollar-input input) { padding-left: 26px; }
        .field :global(.pct-input input)    { padding-right: 26px; }
      `}</style>
    </label>
  );
}
