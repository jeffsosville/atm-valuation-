# atm-valuation-
atm-valuation 
# ATM Route Valuation Calculator — Setup Guide

A standalone Vercel-hosted calculator that embeds via iframe on **atmbrokerage.com** (WordPress) and **atmexits.com** (React/HTML). One codebase, two embeds.

## Files

| File | Where it goes |
|---|---|
| `01_atm_valuations_migration.sql` | Run in Supabase SQL Editor (ATM Brokerage project) |
| `02_pages_api_atm-valuation.ts`   | `pages/api/atm-valuation.ts` |
| `03_pages_calculator.tsx`         | `pages/calculator.tsx` |

## Valuation logic (locked in)

| Route type | Multiple | Net income formula |
|---|---|---|
| Self-load          | 25× monthly net | gross − merchant payments − wireless |
| 3rd-party load     | 42× monthly net | gross − merchant payments − wireless − loading − maintenance |
| Processing only    | 45× monthly net | direct entry (e.g., $1,000/mo × 45 = $45,000) |

Where `gross = monthly_transactions × avg_surcharge`.

Contract coverage % and equipment age are captured (per John) but do not currently affect the multiple in v1. They show up in the email to John for context.

---

## Deploy steps

### 1. Create new Vercel project

```bash
# locally
mkdir atm-calculator && cd atm-calculator
npx create-next-app@latest . --typescript --no-tailwind --no-src-dir --no-app
# answer no to most prompts; we just need pages router

mkdir -p pages/api
# drop in the three files
```

Or just create a new repo on GitHub → push → import to Vercel.

### 2. Run the SQL migration
Supabase → ATM Brokerage project → SQL Editor → paste `01_atm_valuations_migration.sql` → Run.

### 3. Vercel env vars

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ATM Brokerage project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ATM Brokerage service role key |
| `RESEND_API_KEY` | Use existing Resend key (the one that works for atmbrokerage_wordpress, or create a new one called `atm-calculator`) |
| `VALUATION_CC_EMAIL` | (optional) `jasosville@gmail.com` as backup notification |

### 4. (Optional) Custom subdomain
- Vercel → project → Settings → Domains → add `valuation.atmbrokerage.com`
- atmbrokerage.com DNS (wherever it lives) → add CNAME `valuation` → `cname.vercel-dns.com`
- Wait ~5 min for SSL

### 5. Test
Visit your Vercel URL → fill out the form → request the full report → confirm:
- Row appears in `atm_valuations` Supabase table
- John gets an email at `john@atmbrokerage.com`
- The seller gets a confirmation email

---

## Embed on parent sites

### ATMBrokerage.com (WordPress)

1. Create a new page: "ATM Route Valuation Calculator" (slug: `/calculator` or `/valuation`)
2. Add a Custom HTML block (or use the page builder's HTML widget):

```html
<iframe
  id="atm-calc"
  src="https://valuation.atmbrokerage.com/calculator"
  width="100%"
  style="border:none; min-height:1000px; display:block;"
  title="ATM Route Valuation Calculator">
</iframe>

<script>
  // Auto-resize iframe to match content height
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'atm-calc-height') {
      document.getElementById('atm-calc').style.height = e.data.height + 'px';
    }
  });
</script>
```

That's it — the calculator now lives inside ATMBrokerage's branded chrome (header, footer, nav).

### ATMExits (React/HTML)

Same iframe approach works — drop the snippet above into any HTML page or React component.

If/when ATMExits is on Next.js or React and you want a tighter integration later (no iframe), the `Calculator` component can be lifted out and imported directly. For v1, iframe is fine.

---

## What John sees

When a seller requests the full report, John gets an email like:

> **Subject:** ATM Valuation — Jeff Sosville · $487,000 (3rd-party load)
>
> $487,000
> 3rd-party load · 42× monthly net of $11,595
>
> SELLER: Jeff Sosville
> EMAIL: seller@example.com
> PHONE: 315-430-8845
>
> — ROUTE INPUTS
> Monthly transactions: 8,000
> Avg surcharge / txn: $3.00
> Gross monthly revenue: $24,000
> Merchant payments: $6,000
> Wireless fees: $480
> Loading fees: $4,200
> Maintenance: $1,725
> # of ATMs: 12
> Contract coverage: 100%
> Avg equipment age: 3 yrs
>
> Source: atmbrokerage.com · Reply to this email to respond to seller

Reply-to is set to the seller's email so John can reply directly.

---

## Future enhancements (defer)

- **Use closed-deal data**: once you and John pull the comparable sales data, swap the fixed multiples (25/42/45) for ranges informed by your actual deals. The methodology becomes "Based on 247 closed transactions, routes like yours sold for X–Y" rather than industry-standard multiples. This is the killer feature.
- **Tier modifiers**: contract coverage and equipment age could nudge the multiple ±5% in v2
- **PDF report generation**: the email confirmation could include a styled PDF with the valuation breakdown
- **Anonymous analytics**: track non-converting calculations (where users compute but don't request report) to understand what range of routes are using the tool
- **Salesforce/HubSpot push**: forward leads to ATM Brokerage CRM in addition to email
