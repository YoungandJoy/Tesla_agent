// tsla-agent/app/api/cron/morning/route.js
// Vercel Cron: 01:00 UTC = 10:00 KST
const TG_TOKEN = "8750913612:AAH3FLdPBv9uD0SEVqifiOhtU7lKkISFVQM";
const TG_CHAT_ID = "8494338776";
const NOTION_DB_ID = "329aca75a4cc43f3ab5884bd5b799870";

// ── 포트폴리오 상수 ──────────────────────────────────────────
// 1차: 3/20 70.355084주 @ ₩568,544 환율 1,491.29
// 2차: 4/3 18.147050주 @ ₩548,848 환율 1,509.32
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

// ── Yahoo Finance 시세 ──────────────────────────────────────
async function yf(sym) {
  const e = encodeURIComponent(sym);
  for (const h of ["query1", "query2"]) {
    try {
      const r = await fetch(
        `https://${h}.finance.yahoo.com/v8/finance/chart/${e}?interval=1d&range=5d`,
        { headers: YF_H, signal: AbortSignal.timeout(8000) }
      );
      if (r.ok) return r.json();
    } catch {}
  }
  return null;
}

// ── Yahoo Finance 실시간 뉴스 (링크 포함) ──────────────────
async function fetchNews() {
  try {
    const r = await fetch(
      "https://query1.finance.yahoo.com/v1/finance/search?q=TSLA+Tesla&newsCount=8&enableFuzzyQuery=false&enableCb=false",
      { headers: YF_H, signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return [];
    const data = await r.json();
    return (data?.news || []).slice(0, 6).map(n => ({
      title: n.title || "",
      url: n.link || "",
      publisher: n.publisher || "",
      date: n.providerPublishTime
        ? new Date(n.providerPublishTime * 1000).toLocaleDateString("ko-KR", {
            timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit"
          })
        : ""
    }));
  } catch { return []; }
}

function ex(d) {
  const m = d?.chart?.result?.[0]?.meta;
  if (!m) return null;
  const price = m.regularMarketPrice ?? m.previousClose ?? null;
  const prev = m.chartPreviousClose ?? m.previousClose ?? null;
  const chg = price && prev && prev !== 0
    ? Math.round(((price - prev) / prev) * 10000) / 100 : 0;
  const postPrice = m.postMarketPrice ?? null;
  const postChg = postPrice && price
    ? Math.round(((postPrice - price) / price) * 10000) / 100 : null;
  return {
    price, chg,
    week52High: m.fiftyTwoWeekHigh ?? null,
    week52Low: m.fiftyTwoWeekLow ?? null,
    postPrice, postChg,
    marketState: m.marketState ?? "CLOSED"
  };
}

const W = "\u20a9";
const fp = (n, d = 2) => n != null ? Number(n).toFixed(d) : "-";
const fw = n => n != null ? W + Math.round(n).toLocaleString("ko-KR") : "-";
const fc = n => n != null ? (n >= 0 ? "+" : "") + Number(n).toFixed(2) + "%" : "-";

// ── Notion 일일 로그 업로드 ──────────────────────────────────
async function postToNotion({ today, curUSD, curKRW, curRate, sp500, nasdaq, signal, totalPLPct, stockPL_KRW, fxPL, evalAmt, strategy, newsSummaries }) {
  const token = process.env.NOTION_TOKEN;
  if (!token) return { ok: false, error: "NOTION_TOKEN not set" };
  try {
    const body = {
      parent: { database_id: NOTION_DB_ID },
      properties: {
        "날짜":         { title: [{ text: { content: today } }] },
        "날짜_DATE":    { date: { start: new Date().toISOString().split("T")[0] } },
        "TSLA_USD":     { number: curUSD ?? null },
        "TSLA_KRW":     { number: curKRW ? Math.round(curKRW) : null },
        "USD_KRW":      { number: curRate ? Math.round(curRate) : null },
        "SP500":        { number: sp500 ? Math.round(sp500) : null },
        "NASDAQ":       { number: nasdaq ? Math.round(nasdaq) : null },
        "신호":         { select: { name: signal || "HOLD" } },
        "총손익_PCT":   { number: totalPLPct != null ? totalPLPct / 100 : null },
        "주식손익_KRW": { number: stockPL_KRW ? Math.round(stockPL_KRW) : null },
        "환차손익_KRW": { number: fxPL ? Math.round(fxPL) : null },
        "평가금액_KRW": { number: evalAmt ? Math.round(evalAmt) : null },
        "전략_요약":    { rich_text: [{ text: { content: strategy || "" } }] },
        "뉴스1": { rich_text: [{ text: { content: newsSummaries?.[0] || "" } }] },
        "뉴스2": { rich_text: [{ text: { content: newsSummaries?.[1] || "" } }] },
        "뉴스3": { rich_text: [{ text: { content: newsSummaries?.[2] || "" } }] },
        "뉴스4": { rich_text: [{ text: { content: newsSummaries?.[3] || "" } }] },
        "뉴스5": { rich_text: [{ text: { content: newsSummaries?.[4] || "" } }] },
      }
    };
    const r = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
        "Notion-Version": "2022-06-28"
      },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    return { ok: r.ok, id: j.id };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

export async function GET() {
  try {
    const [priceRes, news] = await Promise.all([
      Promise.allSettled([yf("TSLA"), yf("^GSPC"), yf("^IXIC"), yf("USDKRW=X")]),
      fetchNews()
    ]);

    const [tr, sr, nr, fr] = priceRes;
    const g = r => r.status === "fulfilled" && r.value ? ex(r.value) : null;
    const t = g(tr), s = g(sr), n = g(nr), f = g(fr);

    const curUSD  = t?.price ?? null;
    const curRate = f?.price ? Math.round(f.price) : null;
    const curKRW  = curUSD && curRate ? Math.round(curUSD * curRate) : null;

    // ── 손익 계산 ────────────────────────────────────────────
    const evalAmt    = curKRW ? Math.round(SHARES * curKRW) : null;
    const totalPL    = evalAmt ? evalAmt - TOTAL_INV : null;
    const totalPLPct = totalPL ? Math.round((totalPL / TOTAL_INV) * 10000) / 100 : null;

    const stockPL_USD = curUSD ? (curUSD - AVG_USD) * SHARES : null;
    const stockPL_KRW = stockPL_USD && curRate ? Math.round(stockPL_USD * curRate) : null;

    const totalUSD_inv = TOTAL_INV / AVG_RATE;
    const fxPL = curRate ? Math.round((curRate - AVG_RATE) * totalUSD_inv) : null;

    const today = new Date().toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
    }).replace(/\. /g, "-").replace(".", "");

    let extStr = "";
    if (t?.postPrice && t?.postChg != null) {
      const label = t.marketState === "PRE" ? "프리마켓" : "애프터마켓";
      extStr = `\n  ${label}: $${fp(t.postPrice)} (${fc(t.postChg)})`;
    }

    const headlineText = news.length > 0
      ? news.map((x, i) => `${i + 1}. [${x.publisher}] ${x.title}`).join("\n")
      : "No news available";

    const prompt = `You are a TSLA investment AI for Young Oh (Korean retail investor).

REAL-TIME DATA:
- TSLA: ${curUSD ? "$" + fp(curUSD) + " (" + fc(t?.chg) + ")" : "N/A"} = ${fw(curKRW)}
- USD/KRW: ${curRate ? curRate.toLocaleString() : "N/A"}
- S&P500: ${s?.price ? Math.round(s.price).toLocaleString() + " (" + fc(s?.chg) + ")" : "N/A"}
- NASDAQ: ${n?.price ? Math.round(n.price).toLocaleString() + " (" + fc(n?.chg) + ")" : "N/A"}
- 52W High/Low: ${t?.week52High ? "$" + fp(t.week52High) : "N/A"} / ${t?.week52Low ? "$" + fp(t.week52Low) : "N/A"}

PORTFOLIO:
- ${SHARES}주 | 평균단가 ₩${AVG_KRW.toLocaleString("ko-KR")} ($${AVG_USD})
- 총투자 ₩${TOTAL_INV.toLocaleString("ko-KR")} (평균환율 ${AVG_RATE})
- 평가손익: ${totalPL != null ? (totalPL >= 0 ? "+" : "") + totalPL.toLocaleString("ko-KR") + "원 (" + totalPLPct + "%)" : "N/A"}

TODAY'S ACTUAL NEWS (translate & summarize ONLY these - do NOT invent news):
${headlineText}

Return ONLY valid JSON:
{
  "signal": "BUY" or "SELL" or "HOLD",
  "signal_reason": "1-2 sentences in Korean",
  "target_price": number,
  "stop_price": number,
  "economic_events": [{"event":"name","impact":"H/M/L","expected":"value"}],
  "news_summaries": ["Korean 1-line summary 1","summary 2","summary 3","summary 4","summary 5","summary 6"],
  "strategy": "2-3 sentences in Korean"
}`;

    const cr = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }]
      })
    });

    let ai = {
      signal: "HOLD", signal_reason: "분석 중...",
      target_price: null, stop_price: null,
      economic_events: [], news_summaries: [], strategy: "분석 중..."
    };
    if (cr.ok) {
      const cj = await cr.json();
      const tx = (cj.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      const m2 = tx.match(/\{[\s\S]*\}/);
      if (m2) try { ai = JSON.parse(m2[0]); } catch {}
    }

    const sigEmoji = ai.signal === "BUY" ? "🟢 매수" : ai.signal === "SELL" ? "🔴 매도" : "🟡 홀드";
    const plEmoji  = totalPL != null ? (totalPL >= 0 ? "📈" : "📉") : "";
    const safeEmoji = curKRW && curKRW < STOP_KRW ? "⚠️ 손절선 하회!" : "✅ 안전";

    const ev = (ai.economic_events || []).slice(0, 3)
      .map(e => "  • " + e.event + " [" + e.impact + "] " + e.expected).join("\n") || "  • 주요 일정 없음";

    const newsLines = news.slice(0, 5).map((item, i) => {
      const summary = (ai.news_summaries || [])[i] || item.title;
      return "  • " + item.date + " " + summary + "\n    🔗 " + item.url;
    }).join("\n") || "  • 뉴스 없음";

    const msg =
`📊 [TSLA 아침 브리핑] ${today}

━━━ 실시간 시세 ━━━
TSLA $${fp(curUSD)} (${fc(t?.chg)})${extStr}
     = ${fw(curKRW)}
USD/KRW ${curRate ? curRate.toLocaleString() + "₩" : "-"}
S&P500  ${s?.price ? Math.round(s.price).toLocaleString() + " (" + fc(s?.chg) + ")" : "-"}
NASDAQ  ${n?.price ? Math.round(n.price).toLocaleString() + " (" + fc(n?.chg) + ")" : "-"}

━━━ ${sigEmoji} 신호 ━━━
${ai.signal_reason || "-"}
목표가: ${ai.target_price ? "$" + fp(ai.target_price) : "-"} | 손절가: ${ai.stop_price ? "$" + fp(ai.stop_price) : "-"}

━━━ 내 포트폴리오 ━━━
보유 ${SHARES}주 (1차 70.355 + 2차 18.147)
평균 ₩${AVG_KRW.toLocaleString("ko-KR")} ($${AVG_USD}) @ ${AVG_RATE}₩
현재 ${fw(curKRW)} ${plEmoji}

평가금액 ${evalAmt != null ? "₩" + evalAmt.toLocaleString("ko-KR") : "-"}
총투자금 ₩${TOTAL_INV.toLocaleString("ko-KR")}
─────────────────
평가손익 ${totalPL != null ? (totalPL >= 0 ? "+" : "") + "₩" + Math.abs(Math.round(totalPL)).toLocaleString("ko-KR") + " (" + (totalPLPct >= 0 ? "+" : "") + totalPLPct + "%)" : "-"}
 주식손익 ${stockPL_KRW != null ? (stockPL_KRW >= 0 ? "+" : "") + "₩" + Math.abs(Math.round(stockPL_KRW)).toLocaleString("ko-KR") : "-"}
 환차손익  ${fxPL != null ? (fxPL >= 0 ? "+" : "") + "₩" + Math.abs(Math.round(fxPL)).toLocaleString("ko-KR") + " (환율 " + (curRate - AVG_RATE >= 0 ? "+" : "") + Math.round(curRate - AVG_RATE) + "₩)" : "-"}

손절선 ₩${STOP_KRW.toLocaleString("ko-KR")} ${safeEmoji}

━━━ 경제 일정 ━━━
${ev}

━━━ 테슬라 최신 뉴스 ━━━
${newsLines}

━━━ 투자 전략 ━━━
${ai.strategy}`;

    const tg = await fetch("https://api.telegram.org/bot" + TG_TOKEN + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text: msg, disable_web_page_preview: false })
    });
    const tj = await tg.json();

    // ── Notion 일일 로그 업로드 ──────────────────────────────
    const notionResult = await postToNotion({
      today, curUSD, curKRW, curRate,
      sp500: s?.price,
      nasdaq: n?.price,
      signal: ai.signal,
      totalPLPct,
      stockPL_KRW,
      fxPL,
      evalAmt,
      strategy: ai.strategy,
      newsSummaries: ai.news_summaries
    });

    return Response.json({
      ok: true, telegram_ok: tj.ok, notion_ok: notionResult.ok,
      signal: ai.signal,
      tsla_usd: curUSD, tsla_krw: curKRW,
      eval_amt: evalAmt, total_pl: totalPL, total_pl_pct: totalPLPct,
      stock_pl_krw: stockPL_KRW, fx_pl: fxPL,
      news_count: news.length, today
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
