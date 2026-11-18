# F.O.C.U.S.© Options & Stocks Trade Summary

Import a Schwab / thinkorswim **Account Statement CSV** and get a trade-by-trade P/L report for options and stocks. Static page - no login, no server, nothing uploaded. Your data stays in your browser.

## How to use
1. thinkorswim: **Monitor -> Account Statement**, pick the dates, then **Export to CSV** (menu at the top right).
2. Open the page, click **Import Schwab CSV**. A new account is made from the statement's account number (or click **New** first to name one).
3. Import newer statements any time - trades that are already in are skipped, so overlapping dates are fine.
4. Pick an account or **All accounts**, and a period (All, YTD, this month, last month, last 30 days, custom).
   **View: All / Options only / Stocks only.** Options only shows just your options P/L (no stock, dividend, fee or net account figures). Stocks only shows stocks & ETFs P/L (realized + open) and the same total with dividends & interest. The PDF and CSV follow the view.
5. **Export CSV**, **PDF report**, **Backup** (JSON of all accounts) / **Restore** on another computer.

## What it shows
- Big **Options P/L** (realized + open) with win rate, and tiles for options realized/open, stocks realized/open, dividends & interest, fees and net account P/L - each with its worked math.
- Running-total chart of realized option P/L, statistics (profit factor, avg win/loss, expectancy, best/worst, days held).
- Cash-secured puts: CSP value = strike x 100 x contracts; each closed short put shows the premium kept after close / CSP value and the premium received / CSP value, plus the totals for all CSPs, and the annualized return by days held (simple: kept / CSP value x 365 / days, same-day = 1 day; the total is weighted by dollar-days) - table, statistics, PDF, CSV.
- Closed option trades (FIFO, sortable, math on every row), open positions, by underlying (with a check against Schwab's own P/L YTD), by strategy, by month, dividends, stock/ETF sales, import history.

## Notes
- Options that pass expiry without a closing trade and are no longer in the positions list are counted as expired worthless (tagged "expired") - check the account if one was assigned.
- A stock sold whose buy is older than your imported statements has no cost in the file; its realized P/L is Schwab's own "P/L YTD" for that symbol.

Jachbit 2026 · For personal record keeping only, not financial or tax advice.
