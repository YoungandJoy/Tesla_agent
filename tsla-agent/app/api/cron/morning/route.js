// tsla-agent/app/api/cron/morning/route.js
// Vercel Cron: 01:00 UTC = 10:00 KST
const TG_TOKEN = "8750913612:AAH3FLdPBv9uD0SEVqifiOhtU7lKkISFVQM";
const TG_CHAT_ID = "8494338776";
const YF_H = {"User-Agent":"Mozilla/5.0","Accept":"application/json","Referer":"https://finance.yahoo.com/"};

async function yf(sym) {
  const e = encodeURIComponent(sym);
  try {
    const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/"+e+"?interval=1d&range=5d",{headers:YF_H,signal:AbortSignal.timeout(8000)});
    if(r.ok) return r.json();
    const r2 = await fetch("https://query2.finance.yahoo.com/v8/finance/chart/"+e+"?interval=1d&range=5d",{headers:YF_H,signal:AbortSignal.timeout(8000)});
    return r2.ok ? r2.json() : null;
  } catch { return null; }
}

function ex(d) {
  const m = d?.chart?.result?.[0]?.meta;
  if(!m) return null;
  const price = m.regularMarketPrice ?? m.previousClose ?? null;
  const prev = m.chartPreviousClose ?? m.previousClose ?? null;
  const chg = (price && prev && prev !== 0) ? Math.round(((price-prev)/prev)*10000)/100 : 0;
  const week52High = m.fiftyTwoWeekHigh ?? null;
  const week52Low = m.fiftyTwoWeekLow ?? null;
  return { price, chg, week52High, week52Low };
}

const W = "\u20a9";
const fp = (n,d=2) => n!=null ? Number(n).toFixed(d) : "-";
const fw = n => n!=null ? W+Math.round(n).toLocaleString("ko-KR") : "-";
const fc = n => n!=null ? (n>=0?"+":"")+Number(n).toFixed(2)+"%" : "-";

export async function GET() {
  try {
    const [tr,sr,nr,fr] = await Promise.allSettled([yf("TSLA"),yf("^GSPC"),yf("^IXIC"),yf("USDKRW=X")]);
    const g = r => r.status==="fulfilled" && r.value ? ex(r.value) : null;
    const t=g(tr), s=g(sr), n=g(nr), f=g(fr);
    const tu = t?.price ?? null;
    const uk = f?.price ? Math.round(f.price) : null;
    const tk = tu && uk ? Math.round(tu*uk) : null;
    const avgKrw = 568544;
    const stopKrw = 528746;
    const profitPct = tk ? Math.round(((tk - avgKrw)/avgKrw)*10000)/100 : null;
    const today = new Date().toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).replace(/\. /g,"-").replace(".","");

    const uMsg = `You are a TSLA investment AI for Young Oh (Korean retail investor).
REAL-TIME DATA:
- TSLA: ${tu?"$"+fp(tu)+" ("+fc(t?.chg)+")":"N/A"} = ${fw(tk)}
- USD/KRW: ${fw(uk)}
- S&P500: ${s?.price?Math.round(s.price)+" ("+fc(s?.chg)+")":"N/A"}
- NASDAQ: ${n?.price?Math.round(n.price)+" ("+fc(n?.chg)+")":"N/A"}
- TSLA 52W High: ${t?.week52High?"$"+fp(t.week52High):"N/A"} / Low: ${t?.week52Low?"$"+fp(t.week52Low):"N/A"}
PORTFOLIO:
- Holdings: 70.355 shares, avg cost ${W}568,544 (${W+Math.round(70.355*avgKrw).toLocaleString("ko-KR")} total)
- Stop loss: ${W}528,746
- Current P&L: ${profitPct!=null?(profitPct>=0?"+":"")+profitPct+"%":"N/A"}

Return ONLY valid JSON (no markdown):
{
  "signal": "BUY" or "SELL" or "HOLD",
  "signal_reason": "1-2 sentences in Korean explaining why",
  "target_price": number (USD, short-term 1-2 week target),
  "stop_price": number (USD, recommended stop loss),
  "economic_events": [{"event":"name","impact":"H/M/L","expected":"value or desc"}],
  "tesla_events": [{"date":"MM/DD","event":"description in Korean"}],
  "tesla_news": ["news1 in Korean","news2","news3"],
  "strategy": "2-3 sentences investment strategy in Korean"
}`;

    const cr = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:1200,messages:[{role:"user",content:uMsg}]})});
    let ai = { signal:"HOLD", signal_reason:"분석 중...", target_price:null, stop_price:null, economic_events:[], tesla_events:[], tesla_news:[], strategy:"분석 중..." };
    if(cr.ok) {
      const cj = await cr.json();
      const tx = (cj.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const m2 = tx.match(/\{[\s\S]*\}/);
      if(m2) try { ai = JSON.parse(m2[0]); } catch {}
    }

    const sigEmoji = ai.signal==="BUY" ? "🟢 매수" : ai.signal==="SELL" ? "🔴 매도" : "🟡 홀드";
    const plEmoji = profitPct!=null ? (profitPct>=0 ? "📈" : "📉") : "";
    const ev = (ai.economic_events||[]).slice(0,3).map(e=>"  • "+e.event+" ["+e.impact+"] "+e.expected).join("\n") || "  • 주요 일정 없음";
    const te = (ai.tesla_events||[]).slice(0,4).map(e=>"  • "+e.date+" "+e.event).join("\n") || "  • 예정 이벤트 없음";
    const nw = (ai.tesla_news||[]).slice(0,3).map(x=>"  • "+x).join("\n") || "  • 뉴스 없음";

    const msg = `📊 [TSLA 아침 브리핑] ${today}

━━━ 실시간 시세 ━━━
TSLA  ${tu?"$"+fp(tu)+" ("+fc(t?.chg)+")":"-"}
       = ${fw(tk)}
USD/KRW  ${fw(uk)}
S&P500   ${s?.price?Math.round(s.price).toLocaleString()+" ("+fc(s?.chg)+")":"-"}
NASDAQ   ${n?.price?Math.round(n.price).toLocaleString()+" ("+fc(n?.chg)+")":"-"}

━━━ ${sigEmoji} 신호 ━━━
${ai.signal_reason||"-"}
목표가: ${ai.target_price?"$"+fp(ai.target_price):"-"} | 손절가: ${ai.stop_price?"$"+fp(ai.stop_price):"-"}

━━━ 내 포트폴리오 ━━━
70.355주 | 평균 ${W}568,544
현재 ${fw(tk)} ${plEmoji} ${profitPct!=null?(profitPct>=0?"+":"")+profitPct+"%":""}
손절선 ${W}528,746 ${tk&&tk<stopKrw?"⚠️ 손절선 하회!":"✅ 안전"}

━━━ 경제 일정 ━━━
${ev}

━━━ 테슬라 주요 이벤트 ━━━
${te}

━━━ 테슬라 뉴스 ━━━
${nw}

━━━ 투자 전략 ━━━
${ai.strategy}`;

    const tg = await fetch("https://api.telegram.org/bot"+TG_TOKEN+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:TG_CHAT_ID,text:msg})});
    const tj = await tg.json();
    return Response.json({ok:true, telegram_ok:tj.ok, signal:ai.signal, tsla_usd:tu, tsla_krw:tk, pl_pct:profitPct, today});
  } catch(e) {
    return Response.json({ok:false, error:e.message},{status:500});
  }
}
