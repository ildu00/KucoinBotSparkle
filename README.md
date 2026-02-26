# KuCoin Bot Dashboard 🤖

A real-time monitoring dashboard for KuCoin trading bot sub-accounts. Track spot and futures balances, profit/loss per robot, and overall portfolio performance — all from a single interface.

---

## Features

- **Multi-account support** — Add multiple KuCoin API accounts and switch between them
- **Bot sub-account monitoring** — Automatically detects all `robot*` sub-accounts
- **Spot + Futures balances** — Fetches spot balances via `/api/v2/sub-accounts` and futures equity via `/api/v1/account-overview-all` (KuCoin Futures API)
- **Profit tracking** — On first load, the current balance is stored as a baseline. Subsequent refreshes calculate profit relative to that snapshot
- **Reset baseline** — Per-bot reset button to set a new starting point (e.g. after adding capital)
- **Master account overview** — Displays master spot + futures balance separately
- **Summary stats** — Total portfolio value, total profit, number of active bots
- **Charts** — Visualize balance distribution and profit history
- **Debug panel** — Raw API response inspector for troubleshooting

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + shadcn/ui |
| State / Data | TanStack Query v5 |
| Backend | Edge Function (Deno) |
| Database | PostgreSQL (via cloud) |
| Charts | Recharts |

---

## Architecture

```
Browser (React)
    │
    ▼
Edge Function: kucoin-proxy
    │
    ├── KuCoin Spot API (api.kucoin.com)
    │       ├── GET /api/v2/sub-accounts?pageSize=100   — spot balances per sub
    │       └── GET /api/v1/accounts                    — master spot balance
    │
    └── KuCoin Futures API (api-futures.kucoin.com)
            └── GET /api/v1/account-overview-all?currency=USDT  — all sub futures equity
```

All three API calls are made in **parallel** inside the edge function.

---

## Database

```sql
CREATE TABLE public.bot_baselines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_label text NOT NULL,
  bot_name      text NOT NULL,
  baseline_balance numeric NOT NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now()
);
```

---

## Setup

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
bun install
bun run dev
```

---

## KuCoin API Key Requirements

- **General** — required for master account balance
- **Sub-account read** — required to list sub-accounts and their balances
- **Futures read** — required for `/api/v1/account-overview-all`

Read-only keys only. No trading permissions needed.

---

## Profit Calculation

```
profit = currentBalance - baselineBalance
profitPct = (profit / baselineBalance) × 100
```

---

## License

MIT
