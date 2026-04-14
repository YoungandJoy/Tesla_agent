// tsla-agent/app/api/portfolio/route.js
const SHARES    = 88.502134;
const AVG_KRW   = 564519;
const AVG_USD   = 377.64;
const AVG_RATE  = 1494.85;
const TOTAL_INV = 50086393;
const STOP_KRW  = 525003;

const YF_H = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/"
};

async function yf(sym) {
  const e = encodeURIComponent(sym);
  try {
    const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/"+e+"?interval=1d&range=5d",
      {headers:YF_H,signal:AbortSignal.timeout(8000),cache:"no-store"});
    if(r.ok) return r.json();
    const r2 = await fetch("https://query2.finance.yahoo.com/v8/finance/chart/"+e+"?interval=1d&range=5d",
      {headers:YF_H,signal:AbortSignal.timeout(8000),cache:"no-store"});
    return r2.ok ? r2.json() : null;
  } catch { return null; }
}

function ex(d) {
  const m = d?.chart?.result?.[0]?.meta;
  if(!m) return null;
  const price = m.regularMarketPrice ?? m.previousClose ?? null;
  const prev  = m.chartPreviousClose ?? m.previousClose ?? null;
  const chg   = (price&&prev&&prev!==0) ? ((price-prev)/prev*100) : 0;
  return {
    price, chg,
    postPrice:   m.postMarketPrice ?? null,
    postChg:     m.postMarketPrice&&price ? ((m.postMarketPrice-price)/price*100) : null,
    marketState: m.marketState ?? "CLOSED",
    week52High:  m.fiftyTwoWeekHigh ?? null,
    week52Low:   m.fiftyTwoWeekLow  ?? null,
  };
}

export async function GET() {
  const [tr,fr] = await Promise.allSettled([yf("TSLA"),yf("USDKRW=X")]);
  const g = r => r.status==="fulfilled"&&r.value ? ex(r.value) : null;
  const t=g(tr), f=g(fr);

  const curUSD  = t?.price ?? null;
  const curRate = f?.price ?? null;
  const curKRW  = curUSD&&curRate ? curUSD*curRate : null;
  const evalAmt = curKRW ? SHARES*curKRW : null;
  const totalPL = evalAmt ? evalAmt-TOTAL_INV : null;
  const totalPct= totalPL ? (totalPL/TOTAL_INV*100) : null;
  const stockPL = (curUSD&&curRate) ? (curUSD-AVG_USD)*SHARES*curRate : null;
  const fxPL    = curRate ? (curRate-AVG_RATE)*(TOTAL_INV/AVG_RATE) : null;

  // 환율 비교
  const rateDiff    = curRate ? curRate - AVG_RATE : null;
  const rateDiffPct = curRate ? ((curRate - AVG_RATE) / AVG_RATE * 100) : null;
  const rateUp      = rateDiff != null && rateDiff >= 0;

  const isProfit   = totalPct!=null && totalPct>=0;
  const isStopLoss = curKRW!=null && curKRW<STOP_KRW;
  const stopPct    = curKRW ? Math.max(0,Math.min(100,(curKRW-STOP_KRW)/(AVG_KRW-STOP_KRW)*100)) : 50;

  const now  = new Date().toLocaleString("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit"});
  const fp   = (n,d=2) => n!=null ? Number(n).toFixed(d) : "-";
  const fw   = n => n!=null ? "\u20a9"+Math.round(n).toLocaleString("ko-KR") : "-";
  const fc   = n => n!=null ? (n>=0?"+":"")+Number(n).toFixed(2)+"%" : "-";
  const sign = n => n!=null ? (n>=0?"+":"-") : "";

  const barColor = isStopLoss?"#ef4444":stopPct>60?"#22c55e":"#f59e0b";
  const plColor  = isProfit?"#22c55e":"#ef4444";
  const plBg     = isProfit
    ? "linear-gradient(135deg,#0a1f13 0%,#0d2a1a 100%)"
    : "linear-gradient(135deg,#1f0a0a 0%,#2a0d0d 100%)";
  const plBorder = isProfit?"#1a4a2a":"#4a1a1a";
  const rateColor = rateUp ? "#ef4444" : "#22c55e"; // 환율 오르면 빨강(원화 약세), 내리면 초록(원화 강세)

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="refresh" content="60">
<title>TSLA Portfolio</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f14;color:#e8e8f0;min-height:100vh;padding:20px}
.wrap{max-width:680px;margin:0 auto}
.hdr{display:flex;align-items:center;gap:10px;margin-bottom:20px}
.badge{background:#cc0000;color:#fff;font-weight:700;font-size:12px;padding:3px 10px;border-radius:6px;letter-spacing:1px}
.hdr-sub{font-size:13px;color:#666}
.ts{margin-left:auto;font-size:11px;color:#444}
.card{background:#15152a;border:1px solid #252545;border-radius:16px;padding:22px;margin-bottom:14px}
.price-row{display:flex;align-items:baseline;gap:12px;margin-bottom:6px}
.price-big{font-size:44px;font-weight:700;letter-spacing:-1px}
.chg-badge{font-size:17px;font-weight:600;padding:3px 10px;border-radius:8px}
.up{background:rgba(34,197,94,.15);color:#22c55e}
.dn{background:rgba(239,68,68,.15);color:#ef4444}
.price-krw{font-size:22px;color:#aaa;font-weight:300;margin-bottom:8px}
.mkt{font-size:12px;color:#555}
.pl-card{border:1px solid ${plBorder};border-radius:16px;padding:22px;margin-bottom:14px;background:${plBg}}
.pl-lbl{font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.pl-pct{font-size:40px;font-weight:700;color:${plColor};margin-bottom:2px}
.eval{font-size:19px;color:#ccc;margin-bottom:14px}
.pl-row{display:flex;gap:20px;flex-wrap:wrap}
.pl-item{font-size:13px;color:#666}
.pl-item b{color:#bbb;font-weight:500}
.bar-wrap{background:#15152a;border:1px solid ${isStopLoss?"#4a1a1a":"#252545"};border-radius:14px;padding:18px;margin-bottom:14px}
.bar-hdr{display:flex;justify-content:space-between;font-size:12px;color:#555;margin-bottom:10px}
.bar-status{font-weight:600;color:${isStopLoss?"#ef4444":"#22c55e"}}
.track{background:#1e1e38;border-radius:8px;height:9px;overflow:hidden;margin-bottom:8px}
.fill{height:100%;border-radius:8px;background:${barColor};width:${stopPct.toFixed(1)}%}
.bar-labs{display:flex;justify-content:space-between;font-size:11px;color:#444}
.fx-card{background:#15152a;border:1px solid #252545;border-radius:16px;padding:20px;margin-bottom:14px}
.fx-title{font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px}
.fx-row{display:flex;align-items:center;gap:0;margin-bottom:10px}
.fx-col{flex:1;text-align:center}
.fx-col-label{font-size:11px;color:#444;margin-bottom:4px}
.fx-col-val{font-size:22px;font-weight:700;color:#e8e8f0}
.fx-col-sub{font-size:11px;color:#555;margin-top:2px}
.fx-arrow{font-size:20px;color:#333;padding:0 8px}
.fx-diff{text-align:center;padding:10px;background:#1e1e38;border-radius:10px}
.fx-diff-val{font-size:18px;font-weight:700;color:${rateColor}}
.fx-diff-sub{font-size:11px;color:#555;margin-top:2px}
.fx-note{font-size:11px;color:#444;margin-top:8px;text-align:center}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
.mc{background:#15152a;border:1px solid #252545;border-radius:12px;padding:16px}
.ml{font-size:11px;color:#444;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px}
.mv{font-size:19px;font-weight:600}
.ms{font-size:11px;color:#444;margin-top:3px}
.foot{text-align:center;font-size:11px;color:#333;padding-top:4px}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <span class="badge">TSLA</span>
    <span class="hdr-sub">\uc2e4\uc2dc\uac04 \ud3ec\ud2b8\ud3f4\ub9ac\uc624</span>
    <span class="ts">\u29c9 ${now} KST &middot; 60\ucd08 \uc790\ub3d9\uac31\uc2e0</span>
  </div>

  <div class="card">
    <div class="price-row">
      <span class="price-big">$${fp(curUSD)}</span>
      <span class="chg-badge ${(t?.chg??0)>=0?"up":"dn"}">${fc(t?.chg)}</span>
    </div>
    <div class="price-krw">${fw(curKRW)} <small style="font-size:14px;color:#444">&sol; \uc8fc</small></div>
    <div class="mkt">\uc2dc\uc7a5\uc0c1\ud0dc: ${t?.marketState??"CLOSED"}${t?.postPrice?" &middot; \uc2dc\uac04\uc678 $"+fp(t.postPrice)+" ("+fc(t.postChg)+")" : ""}</div>
  </div>

  <div class="pl-card">
    <div class="pl-lbl">\uc5f4 \ud3c9\uac00 \uc190\uc775</div>
    <div class="pl-pct">${totalPct!=null?(totalPct>=0?"+":"")+totalPct.toFixed(2)+"%":"-"}</div>
    <div class="eval">\ud3c9\uac00\uae08\uc561 ${fw(evalAmt)}</div>
    <div class="pl-row">
      <div class="pl-item">\uc785\uc758\uc190\uc775 <b>${totalPL!=null?sign(totalPL)+fw(Math.abs(totalPL)):"-"}</b></div>
      <div class="pl-item">\uc8fc\uc2dd\uc190\uc775 <b>${stockPL!=null?sign(stockPL)+fw(Math.abs(stockPL)):"-"}</b></div>
      <div class="pl-item">\ud658\ucc28\uc190\uc775 <b>${fxPL!=null?sign(fxPL)+fw(Math.abs(fxPL)):"-"}</b></div>
    </div>
  </div>

  <div class="bar-wrap">
    <div class="bar-hdr">
      <span>\uc190\uc808\uc120\uae4c\uc9c0\uc758 \uc5ec\uc720</span>
      <span class="bar-status">${isStopLoss?"\u26a0\ufe0f \uc190\uc808\uc120 \ud558\ud68c!":"\u2705 \uc548\uc804 \uad6c\uac04"}</span>
    </div>
    <div class="track"><div class="fill"></div></div>
    <div class="bar-labs">
      <span>\uc190\uc808 ${fw(STOP_KRW)}</span>
      <span>\ud604\uc7ac ${fw(curKRW)}</span>
      <span>\ud3c9\uade0 ${fw(AVG_KRW)}</span>
    </div>
  </div>

  <div class="fx-card">
    <div class="fx-title">\ud658\uc728 \ube44\uad50 (USD/KRW)</div>
    <div class="fx-row">
      <div class="fx-col">
        <div class="fx-col-label">\ub9e4\uc785 \ud658\uc728</div>
        <div class="fx-col-val">1,${AVG_RATE.toFixed(0).slice(1)}</div>
        <div class="fx-col-sub">\ub0b4 \ud3c9\uade0 \ud658\uc728</div>
      </div>
      <div class="fx-arrow">\u2192</div>
      <div class="fx-col">
        <div class="fx-col-label">\ud604\uc7ac \ud658\uc728</div>
        <div class="fx-col-val" style="color:${rateColor}">${curRate?Math.round(curRate).toLocaleString("ko-KR"):"-"}</div>
        <div class="fx-col-sub">\uc2e4\uc2dc\uac04 \uc2dc\uc138</div>
      </div>
    </div>
    <div class="fx-diff">
      <div class="fx-diff-val">${rateDiff!=null?(rateDiff>=0?"+":"")+Math.round(rateDiff)+"\uc6d0":"-"} (${rateDiffPct!=null?(rateDiffPct>=0?"+":"")+rateDiffPct.toFixed(2)+"%":"-"})</div>
      <div class="fx-diff-sub">${rateUp?"\uc6d0\ud654 \uc57d\uc138 \u2192 \ud658\ucc28\uc190\uc2e4 \ubc1c\uc0dd":"\uc6d0\ud654 \uac15\uc138 \u2192 \ud658\ucc28\uc774\uc775 \ubc1c\uc0dd"}</div>
    </div>
    <div class="fx-note">\ud658\ucc28\uc190\uc775: ${fxPL!=null?sign(fxPL)+fw(Math.abs(fxPL))+" (\ud658\uc728 \ubcc0\ub3d9\uc73c\ub85c \uc778\ud55c \uc190\uc775)":"-"}</div>
  </div>

  <div class="grid">
    <div class="mc">
      <div class="ml">\ubcf4\uc720 \uc8fc\uc2dd</div>
      <div class="mv">${SHARES}\uc8fc</div>
      <div class="ms">\uc5f4\ud22c\uc790 ${fw(TOTAL_INV)}</div>
    </div>
    <div class="mc">
      <div class="ml">\ud3c9\uade0 \ub9e4\uc785\uac00</div>
      <div class="mv">$${AVG_USD}</div>
      <div class="ms">${fw(AVG_KRW)} &middot; \ud658\uc728 ${AVG_RATE}</div>
    </div>
    <div class="mc">
      <div class="ml">52\uc8fc \ucd5c\uace0</div>
      <div class="mv">$${fp(t?.week52High)}</div>
      <div class="ms">\ud604\uc7ac \ub300\ube44 ${t?.week52High&&curUSD?(((curUSD/t.week52High)-1)*100).toFixed(1)+"%":"-"}</div>
    </div>
    <div class="mc">
      <div class="ml">52\uc8fc \ucd5c\uc800</div>
      <div class="mv">$${fp(t?.week52Low)}</div>
      <div class="ms">\ud604\uc7ac \ub300\ube44 ${t?.week52Low&&curUSD?"+"+((curUSD/t.week52Low-1)*100).toFixed(1)+"%":"-"}</div>
    </div>
  </div>

  <div class="foot">Yahoo Finance \uc2e4\uc2dc\uac04 &middot; Vercel \uc790\ub3d9\ud654 &middot; \ub9e4\uc77c 10:00 KST \ub9ac\ud3ec\ud2b8</div>
</div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
