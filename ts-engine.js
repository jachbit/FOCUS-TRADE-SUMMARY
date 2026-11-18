/* F.O.C.U.S.(c) Trade Summary - parser + P/L engine (browser + Node). Jachbit 2026.
   Reads the Schwab / thinkorswim "Account Statement" CSV export. No credentials, no network. */
(function (root) {
  'use strict';

  // ---------- small helpers ----------
  function csvLine(line) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim().replace(/^="(.*)"$/, '$1'));
  }
  function num(s) {
    if (s == null) return NaN;
    let t = String(s).trim();
    if (!t || t === '--' || t === '~') return NaN;
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    t = t.replace(/[$,%+\s]/g, '');
    if (t.startsWith('-')) { neg = !neg; t = t.slice(1); }
    const v = parseFloat(t);
    return Number.isFinite(v) ? (neg ? -v : v) : NaN;
  }
  const MON = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  const pad = n => String(n).padStart(2, '0');
  function yr(y) { y = +y; return y < 100 ? 2000 + y : y; }
  // "11/17/26" or "11/17/26 12:57:50" -> "2026-11-17" / "2026-11-17 12:57:50"
  function mdyIso(s) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?/.exec(String(s || '').trim());
    if (!m) return '';
    const d = yr(m[3]) + '-' + pad(m[1]) + '-' + pad(m[2]);
    return m[4] ? d + ' ' + (m[4].length === 5 ? m[4] + ':00' : m[4]).padStart(8, '0') : d;
  }
  // "15 JAN 27" -> "2027-01-15"
  function expIso(s) {
    const m = /^(\d{1,2})\s+([A-Z]{3})\s+(\d{2,4})/i.exec(String(s || '').trim());
    if (!m || MON[m[2].toUpperCase()] == null) return '';
    return yr(m[3]) + '-' + pad(MON[m[2].toUpperCase()] + 1) + '-' + pad(m[1]);
  }
  function isoMdy(iso) { if (!iso) return ''; const p = iso.slice(0, 10).split('-'); return +p[1] + '/' + +p[2] + '/' + p[0].slice(2); }
  function daysBetween(a, b) { return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000); }
  const r2 = x => Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
  function usd(x, sign) {
    if (!Number.isFinite(x)) return '-';
    const a = Math.abs(r2(x)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (x < -0.004 ? '-' : (sign && x > 0.004 ? '+' : '')) + '$' + a;
  }
  function px(x) {
    if (!Number.isFinite(x)) return '-';
    const s = String(+x.toFixed(4)), d = s.includes('.') ? s.split('.')[1].length : 0;
    return d >= 2 ? s : x.toFixed(2);
  }

  // ---------- parse one statement ----------
  const SECTIONS = ['Cash Balance', 'Futures Statements', 'Forex Statements', 'Account Order History', 'Account Trade History',
    'Equities', 'Options', 'Futures', 'Futures Options', 'Profits and Losses', 'Account Summary', 'Forex Account Summary', 'Crypto'];

  function parseStatement(text) {
    const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
    const st = { acctId: '', nickname: '', from: '', through: '', trades: [], cash: [], equities: [], options: [], pl: [], warnings: [] };
    const h = /Account Statement for\s+(\S+)(?:\s+\(([^)]*)\))?\s+since\s+(\S+)\s+through\s+(\S+)/i.exec(lines[0] || '');
    if (h) { st.acctId = h[1]; st.nickname = (h[2] || '').trim(); st.from = mdyIso(h[3]); st.through = mdyIso(h[4]); }
    let sec = null, head = null, lastTime = '', lastSpread = '';
    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i];
      const t = raw.trim();
      if (!t) { sec = null; head = null; continue; }
      if (SECTIONS.includes(t)) { sec = t; head = null; continue; }
      if (!sec) continue;
      const c = csvLine(raw);
      if (!head) { head = c; continue; }
      if (sec === 'Account Trade History') {
        // multi-leg orders: later legs leave Exec Time / Spread blank
        const time = c[1] ? mdyIso(c[1]) : lastTime;
        const spread = c[1] ? c[2] : lastSpread;
        lastTime = time; lastSpread = spread;
        const type = (c[9] || '').toUpperCase();
        const qty = num(c[4]);
        if (!time || !Number.isFinite(qty)) continue;
        const isOpt = type === 'CALL' || type === 'PUT';
        st.trades.push({
          time: time, spread: spread, side: (c[3] || '').toUpperCase(), qty: qty, effect: (c[5] || '').toUpperCase(),
          symbol: (c[6] || '').toUpperCase(), exp: isOpt ? expIso(c[7]) : '', strike: isOpt ? num(c[8]) : NaN, type: type,
          price: num(c[10]), net: num(c[11]), orderType: c[12] || '', isOpt: isOpt,
          mult: isOpt ? 100 : 1, futures: (c[6] || '').startsWith('/')
        });
      } else if (sec === 'Cash Balance') {
        if (!c[0] || /TOTAL/i.test(c[4] || '')) continue;
        st.cash.push({ date: mdyIso(c[0]), time: c[1] || '', type: (c[2] || '').toUpperCase(), ref: c[3] || '', desc: c[4] || '',
          misc: num(c[5]) || 0, comm: num(c[6]) || 0, amount: num(c[7]) || 0 });
      } else if (sec === 'Equities') {
        if (!c[0] || /OVERALL/i.test(c[1] || '')) continue;
        st.equities.push({ symbol: c[0].toUpperCase(), desc: c[1], qty: num(c[2]), price: num(c[3]), mark: num(c[4]), value: num(c[5]) });
      } else if (sec === 'Options') {
        if (!c[0] || /OVERALL/i.test(c[1] || '')) continue;
        st.options.push({ symbol: c[0].toUpperCase(), code: c[1], exp: expIso(c[2]), strike: num(c[3]), type: (c[4] || '').toUpperCase(),
          qty: num(c[5]), price: num(c[6]), mark: num(c[7]), value: num(c[8]) });
      } else if (sec === 'Profits and Losses') {
        if (!c[0] || /OVERALL/i.test(c[1] || '')) continue;
        st.pl.push({ symbol: c[0].toUpperCase(), desc: c[1], plOpen: num(c[2]) || 0, plPct: c[3], plDay: num(c[4]) || 0, plYtd: num(c[5]) || 0, close: num(c[7]) || 0 });
      }
    }
    if (!h) st.warnings.push('The first line is not a Schwab "Account Statement for ..." header - is this the right export?');
    if (!st.trades.length && !st.cash.length) st.warnings.push('No trades and no cash rows were found in this file.');
    if (st.trades.some(t => t.futures)) st.warnings.push('Futures / futures-option trades were found and are skipped (multiplier unknown).');
    return st;
  }

  // ---------- keys (so re-importing an overlapping statement never double-counts) ----------
  function tradeKey(t) { return [t.time, t.symbol, t.exp, t.strike, t.type, t.side, t.qty, t.price, t.effect].join('|'); }
  function cashKey(c) { return c.ref ? 'ref:' + c.ref : [c.date, c.time, c.type, c.desc, c.amount].join('|'); }

  function newAccount(name) {
    return { name: name, acctId: '', statements: [], trades: [], cash: [], positions: { asOf: '', equities: [], options: [] }, pl: { asOf: '', rows: [] } };
  }

  // merge a parsed statement into an account; returns counts
  function mergeStatement(acct, st, fileName) {
    const have = new Map();
    acct.trades.forEach(t => { const k = t.key.replace(/#\d+$/, ''); have.set(k, (have.get(k) || 0) + 1); });
    const seenInFile = new Map();
    let added = 0, dup = 0;
    st.trades.forEach(t => {
      if (t.futures) return;
      const base = tradeKey(t);
      const n = (seenInFile.get(base) || 0) + 1; seenInFile.set(base, n);
      if (n <= (have.get(base) || 0)) { dup++; return; }   // identical fill already stored
      acct.trades.push(Object.assign({}, t, { key: base + '#' + n }));
      added++;
    });
    const cashHave = new Set(acct.cash.map(c => c.key));
    let cAdded = 0;
    st.cash.forEach(c => { const k = cashKey(c); if (cashHave.has(k)) return; cashHave.add(k); acct.cash.push(Object.assign({}, c, { key: k })); cAdded++; });
    const asOf = st.through || '';
    if (!acct.positions.asOf || asOf >= acct.positions.asOf) acct.positions = { asOf: asOf, equities: st.equities, options: st.options };
    if (!acct.pl.asOf || asOf >= acct.pl.asOf) acct.pl = { asOf: asOf, rows: st.pl };
    if (!acct.acctId && st.acctId) acct.acctId = st.acctId;
    acct.trades.sort((a, b) => a.time < b.time ? -1 : a.time > b.time ? 1 : 0);
    acct.cash.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    acct.statements.push({ file: fileName || '', from: st.from, through: st.through, imported: new Date().toISOString(), trades: added, dupTrades: dup, cash: cAdded });
    return { added: added, dup: dup, cash: cAdded };
  }

  // ---------- FIFO matching ----------
  function contractId(t) { return t.isOpt ? t.symbol + ' ' + t.exp + ' ' + t.strike + ' ' + t.type : t.symbol; }
  function kx(k) { return Number.isInteger(k) ? String(k) : px(k); }
  function contractLabel(t) { return t.isOpt ? t.symbol + ' ' + isoMdy(t.exp) + ' ' + kx(t.strike) + (t.type === 'PUT' ? 'P' : 'C') : t.symbol; }
  function stratName(isOpt, type, dir) {
    if (!isOpt) return dir > 0 ? 'Long Stock' : 'Short Stock';
    return (dir > 0 ? 'Long ' : 'Short ') + (type === 'PUT' ? 'Put' : 'Call');
  }

  // accts: array of account objects; today: 'YYYY-MM-DD'
  function analyze(accts, today) {
    const closed = [], open = [], unmatched = [], notes = [];
    const income = [], fees = [];
    let posEq = [], posOpt = [], plRows = [];
    accts.forEach(acct => {
      const lots = new Map();       // contractId -> [{dir, qty, price, time, t}]
      acct.trades.forEach(t => {
        const id = contractId(t);
        const dir = t.qty > 0 ? 1 : -1;
        let q = Math.abs(t.qty);
        const L = lots.get(id) || [];
        while (q > 1e-9 && L.length && L[0].dir !== dir) {
          const lot = L[0];
          const m = Math.min(q, lot.qty);
          // long lot closed by a sell: (sell - buy); short lot closed by a buy: (sell - buy) with sell = open price
          const pl = lot.dir > 0 ? (t.price - lot.price) * m * t.mult : (lot.price - t.price) * m * t.mult;
          const math = lot.dir > 0
            ? '(' + px(t.price) + ' sold - ' + px(lot.price) + ' paid) x ' + m + (t.isOpt ? ' x 100' : ' sh') + ' = ' + usd(pl, true)
            : '(' + px(lot.price) + ' sold - ' + px(t.price) + ' bought back) x ' + m + (t.isOpt ? ' x 100' : ' sh') + ' = ' + usd(pl, true);
          closed.push({ acct: acct.name, isOpt: t.isOpt, symbol: t.symbol, label: contractLabel(t), type: t.type, exp: t.exp, strike: t.strike,
            strat: stratName(t.isOpt, t.type, lot.dir), dir: lot.dir, qty: m, openTime: lot.time, closeTime: t.time,
            openPrice: lot.price, closePrice: t.price, days: daysBetween(lot.time, t.time), pl: pl, math: math, how: 'closed',
            cost: lot.price * m * t.mult });
          lot.qty -= m; q -= m;
          if (lot.qty <= 1e-9) L.shift();
        }
        if (q > 1e-9) {
          if (t.effect === 'TO CLOSE') {
            unmatched.push({ acct: acct.name, isOpt: t.isOpt, symbol: t.symbol, label: contractLabel(t), side: t.side, qty: q, price: t.price, time: t.time, mult: t.mult,
              proceeds: (t.qty < 0 ? 1 : -1) * t.price * q * t.mult });
          } else {
            L.push({ dir: dir, qty: q, price: t.price, time: t.time, t: t });
          }
        }
        lots.set(id, L);
      });
      // positions from this account's latest statement
      const pos = acct.positions || { equities: [], options: [] };
      const posOptMap = new Map();
      (pos.options || []).forEach(p => posOptMap.set(p.symbol + ' ' + p.exp + ' ' + p.strike + ' ' + p.type, p));
      // what is left in the lots
      lots.forEach((L, id) => {
        L.forEach(lot => {
          const t = lot.t;
          if (t.isOpt && posOptMap.has(id)) return;                 // still open: the positions list covers it
          if (t.isOpt && t.exp && t.exp < today) {
            const pl = lot.dir > 0 ? -lot.price * lot.qty * 100 : lot.price * lot.qty * 100;
            closed.push({ acct: acct.name, isOpt: true, symbol: t.symbol, label: contractLabel(t), type: t.type, exp: t.exp, strike: t.strike,
              strat: stratName(true, t.type, lot.dir), dir: lot.dir, qty: lot.qty, openTime: lot.time, closeTime: t.exp + ' 16:00:00',
              openPrice: lot.price, closePrice: 0, days: daysBetween(lot.time, t.exp), pl: pl, how: 'expired',
              math: (lot.dir > 0 ? '(0.00 at expiry - ' + px(lot.price) + ' paid)' : '(' + px(lot.price) + ' sold - 0.00 at expiry)') + ' x ' + lot.qty + ' x 100 = ' + usd(pl, true) +
                ' (not in the positions list after ' + isoMdy(t.exp) + ' - expired worthless, or assigned: check the account)',
              cost: lot.price * lot.qty * 100 });
            return;
          }
          if (!t.isOpt && (pos.equities || []).some(e => e.symbol === t.symbol)) return;
          notes.push(acct.name + ': ' + contractLabel(t) + ' ' + (lot.dir > 0 ? 'bought' : 'sold') + ' ' + lot.qty + ' @ ' + px(lot.price) + ' on ' + isoMdy(lot.time) +
            ' is not closed in the trades and not in the latest positions list - import a newer statement.');
        });
      });
      (pos.options || []).forEach(p => {
        const pl = (p.mark - p.price) * p.qty * 100;
        open.push({ acct: acct.name, isOpt: true, symbol: p.symbol, label: p.symbol + ' ' + isoMdy(p.exp) + ' ' + kx(p.strike) + (p.type === 'PUT' ? 'P' : 'C'),
          strat: stratName(true, p.type, p.qty > 0 ? 1 : -1), qty: p.qty, price: p.price, mark: p.mark, value: p.value, exp: p.exp, pl: pl,
          dte: p.exp ? daysBetween(today, p.exp) : NaN,
          math: '(' + px(p.mark) + ' mark - ' + px(p.price) + ' trade price) x ' + p.qty + ' x 100 = ' + usd(pl, true), asOf: pos.asOf });
      });
      (pos.equities || []).forEach(p => {
        const pl = (p.mark - p.price) * p.qty;
        open.push({ acct: acct.name, isOpt: false, symbol: p.symbol, label: p.symbol, strat: stratName(false, '', p.qty > 0 ? 1 : -1), qty: p.qty, price: p.price,
          mark: p.mark, value: p.value, pl: pl, math: '(' + px(p.mark) + ' mark - ' + px(p.price) + ' trade price) x ' + p.qty + ' sh = ' + usd(pl, true), asOf: pos.asOf });
      });
      (acct.pl.rows || []).forEach(r => plRows.push(Object.assign({ acct: acct.name, asOf: acct.pl.asOf }, r)));
      acct.cash.forEach(c => {
        if (c.type === 'DOI') income.push(Object.assign({ acct: acct.name }, c, { symbol: incomeSymbol(c.desc), kind: /\bINT\b|INTEREST/i.test(c.desc) ? 'Interest' : 'Dividend' }));
        const f = (c.misc || 0) + (c.comm || 0);
        if (f) fees.push(Object.assign({ acct: acct.name }, c, { fee: f }));
      });
    });
    closed.forEach(addCsp);
    closed.sort((a, b) => a.closeTime < b.closeTime ? -1 : a.closeTime > b.closeTime ? 1 : 0);
    return { closed: closed, open: open, unmatched: unmatched, notes: notes, income: income, fees: fees, plRows: plRows };
  }

  // Cash-secured put: the cash set aside = strike x 100 x contracts
  function addCsp(c) {
    if (!(c.isOpt && c.type === 'PUT' && c.dir < 0 && c.strike > 0)) return;
    c.csp = c.strike * 100 * c.qty;
    c.cspRecv = c.openPrice * c.qty * 100;
    c.cspPct = c.pl / c.csp;
    c.cspRecvPct = c.cspRecv / c.csp;
    c.cspMath = 'CSP value ' + (Number.isInteger(c.strike) ? c.strike : px(c.strike)) + ' x 100 x ' + c.qty + ' = ' + usd(c.csp) +
      '; kept ' + usd(c.pl, true) + ' / ' + usd(c.csp) + ' = ' + (c.cspPct * 100).toFixed(2) + '%' +
      '; received ' + px(c.openPrice) + ' x ' + c.qty + ' x 100 = ' + usd(c.cspRecv) + ' / ' + usd(c.csp) + ' = ' + (c.cspRecvPct * 100).toFixed(2) + '%';
  }

  function incomeSymbol(desc) {
    const d = String(desc).toUpperCase();
    const m = /YIELDMAX\s+(.+?)\s+OPTION INCOME/.exec(d);
    if (m) { const map = { 'ULTRA': 'ULTY', 'UNIVERSE FUND OF': 'YMAX', 'TSLA': 'TSLY', 'AI': 'AIYY', 'MSTR': 'MSTY', 'COIN': 'CONY', 'NVDA': 'NVDY', 'BITCOIN': 'YBIT' }; if (map[m[1]]) return map[m[1]]; }
    if (/\bINT\b|INTEREST/.test(d)) return 'Interest';
    return d.replace(/\s+[\d.]+\s+US\$.*$/, '').slice(0, 40);
  }

  // ---------- summary for a date range [from, to] (by close date) ----------
  function summarize(a, from, to) {
    const inR = iso => (!from || iso.slice(0, 10) >= from) && (!to || iso.slice(0, 10) <= to);
    const C = a.closed.filter(c => inR(c.closeTime));
    const opt = C.filter(c => c.isOpt), stk = C.filter(c => !c.isOpt);
    const sum = arr => arr.reduce((s, x) => s + x.pl, 0);
    const stat = arr => {
      const w = arr.filter(c => c.pl > 0.004), l = arr.filter(c => c.pl < -0.004);
      const gw = sum(w), gl = sum(l);
      return { n: arr.length, wins: w.length, losses: l.length, flat: arr.length - w.length - l.length, total: gw + gl, grossWin: gw, grossLoss: gl,
        winRate: arr.length ? w.length / arr.length : NaN, avgWin: w.length ? gw / w.length : NaN, avgLoss: l.length ? gl / l.length : NaN,
        pf: gl < 0 ? gw / -gl : NaN, best: arr.reduce((b, c) => !b || c.pl > b.pl ? c : b, null), worst: arr.reduce((b, c) => !b || c.pl < b.pl ? c : b, null),
        avgDays: arr.length ? arr.reduce((s, c) => s + c.days, 0) / arr.length : NaN,
        expectancy: arr.length ? (gw + gl) / arr.length : NaN };
    };
    const group = (arr, keyFn) => {
      const m = new Map();
      arr.forEach(c => { const k = keyFn(c); if (!m.has(k)) m.set(k, []); m.get(k).push(c); });
      return [...m.entries()].map(([k, v]) => Object.assign({ key: k }, stat(v)));
    };
    const openOpt = a.open.filter(o => o.isOpt), openStk = a.open.filter(o => !o.isOpt);
    const inc = a.income.filter(i => inR(i.date));
    const fee = a.fees.filter(f => inR(f.date));
    // stocks/ETFs whose buys are older than the imported files: Schwab's own P/L YTD for that symbol
    const stkSymbolsMatched = new Set(stk.map(c => c.acct + '|' + c.symbol));
    const unStk = a.unmatched.filter(u => !u.isOpt && inR(u.time));
    const schwabYtd = [];
    const seen = new Set();
    unStk.forEach(u => {
      const k = u.acct + '|' + u.symbol;
      if (seen.has(k) || stkSymbolsMatched.has(k)) return; seen.add(k);
      const r = a.plRows.find(p => p.acct === u.acct && p.symbol === u.symbol);
      const sells = unStk.filter(x => x.acct === u.acct && x.symbol === u.symbol);
      schwabYtd.push({ acct: u.acct, symbol: u.symbol, ytd: r ? r.plYtd : NaN, asOf: r ? r.asOf : '', qty: sells.reduce((s, x) => s + x.qty, 0),
        proceeds: sells.reduce((s, x) => s + x.proceeds, 0), lastTime: sells[sells.length - 1].time, trades: sells });
    });
    const unOpt = a.unmatched.filter(u => u.isOpt && inR(u.time));
    const months = group(opt, c => c.closeTime.slice(0, 7)).sort((x, y) => x.key < y.key ? -1 : 1);
    const curve = []; let run = 0;
    opt.forEach(c => { run += c.pl; curve.push({ t: c.closeTime, v: run, c: c }); });
    const o = {
      from: from, to: to,
      opt: stat(opt), stk: stat(stk), optTrades: opt, stkTrades: stk,
      byUnderlying: group(opt, c => c.symbol).sort((x, y) => y.total - x.total),
      byStrat: group(opt, c => c.strat).sort((x, y) => y.total - x.total),
      byMonth: months, curve: curve,
      openOpt: openOpt, openStk: openStk,
      openOptPl: openOpt.reduce((s, x) => s + x.pl, 0), openStkPl: openStk.reduce((s, x) => s + x.pl, 0),
      income: inc, incomeTotal: inc.reduce((s, x) => s + x.amount, 0),
      fees: fee, feesTotal: fee.reduce((s, x) => s + x.fee, 0),
      schwabYtd: schwabYtd, schwabYtdTotal: schwabYtd.reduce((s, x) => s + (Number.isFinite(x.ytd) ? x.ytd : 0), 0),
      unmatchedOpt: unOpt, notes: a.notes, plRows: a.plRows
    };
    o.optTotal = o.opt.total + o.openOptPl;
    const csp = opt.filter(c => c.csp > 0);
    o.csp = { n: csp.length, value: csp.reduce((t, c) => t + c.csp, 0), received: csp.reduce((t, c) => t + c.cspRecv, 0), kept: csp.reduce((t, c) => t + c.pl, 0) };
    o.csp.pctKept = o.csp.value > 0 ? o.csp.kept / o.csp.value : NaN;
    o.csp.pctRecv = o.csp.value > 0 ? o.csp.received / o.csp.value : NaN;
    o.stockRealized = o.stk.total + o.schwabYtdTotal;
    o.net = o.opt.total + o.openOptPl + o.stockRealized + o.openStkPl + o.incomeTotal + o.feesTotal;
    o.premSold = opt.filter(c => c.dir < 0).reduce((s, c) => s + c.openPrice * c.qty * 100, 0);
    o.premPaid = opt.filter(c => c.dir > 0).reduce((s, c) => s + c.openPrice * c.qty * 100, 0);
    // cross-check against Schwab's own "P/L YTD" column for option underlyings
    o.check = o.byUnderlying.map(g => {
      const mine = g.total + openOpt.filter(x => x.symbol === g.key).reduce((s, x) => s + x.pl, 0);
      const rows = a.plRows.filter(p => p.symbol === g.key);
      const schwab = rows.length ? rows.reduce((s, r) => s + r.plYtd, 0) : NaN;
      return { symbol: g.key, mine: mine, schwab: schwab, ok: Number.isFinite(schwab) ? Math.abs(mine - schwab) < 0.02 : null };
    });
    return o;
  }

  const API = { csvLine, num, mdyIso, expIso, isoMdy, usd, px, r2, parseStatement, newAccount, mergeStatement, analyze, summarize, daysBetween };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.TS = API;
})(typeof self !== 'undefined' ? self : this);
