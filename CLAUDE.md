# F.O.C.U.S.(c) Options & Stocks Trade Summary - project notes

- Static GitHub Pages page: `index.html` (UI, accounts, chart, CSV/PDF export) + `ts-engine.js` (Schwab CSV parser + FIFO P/L engine, Node-testable). No server, no credentials, no build.
- Input: the Schwab / thinkorswim "Account Statement" CSV export (sections Cash Balance, Account Trade History, Equities, Options, Profits and Losses). Trades come from Account Trade History; multi-leg rows carry the Exec Time forward.
- P/L rules: options matched FIFO per contract (symbol + expiry + strike + type), x100. An option lot still open after expiry and not in the Options positions list = expired worthless (tagged). Open P/L = (mark - trade price) x qty x mult from the latest statement. Stock sells whose buy is older than the imported files use Schwab's "P/L YTD" for that symbol. Dividends/interest = Cash Balance DOI rows. Fees = Misc Fees + Commissions columns of Cash Balance.
- Re-imports never double-count: trades keyed by time|symbol|exp|strike|type|side|qty|price|effect (+ occurrence #), cash rows by REF #.
- Accounts are matched by the statement's masked account number; data lives in localStorage (`focus_trade_summary_v1`); Backup / Restore = JSON.
- Test: `node -e "const T=require('./ts-engine.js');..."` with a statement path (keep real statements OUT of this folder's repo). Check: per-underlying realized + open option P/L must equal the statement's own "P/L YTD" column (the page's By underlying table shows this as Schwab check).
- NEVER commit statements, exports or backups (.gitignore blocks *.csv, *.json, *.pdf) - they are personal account data.
- Rules: every number shows its math; min 12px, no dim text; jsPDF text Latin-1 only (`L1()`); CSV export name `FOCUS_TradeSummary_<Account>_Trades_<stamp>.csv`; PDF subtitle = account + period.
- Before edits: run `backup_all.bat`. Local preview: `start.bat` (port 8137, PORT_REGISTRY.md).
