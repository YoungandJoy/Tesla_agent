// tsla-agent/app/api/cron/morning/route.js
// Vercel Cron: 01:00 UTC = 10:00 KST
const TG_TOKEN = "8750913612:AAH3FLdPBv9uD0SEVqifiOhtU7lKkISFVQM";
const TG_CHAT_ID = "8494338776";
const YF_H = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/"
};

// ── 포트폴리오 상수 ──────────────────────────────────────────
// 1차: 3/20  70.355084주 @ ₩568,544  환율 1,491.29
// 2차: 4/3   18.147050주 @ ₩548,848  환율 1,509.32
const SHARES      = 88.502134;   // 총 보유주수
const AVG_KRW     = 564519;      // 가중평균 원화단가 ₩/주
const AVG_USD     = 377.64;      // 가중평균 달러단가 $/주
const AVG_RATE    = 1494.85;     // 매수 평균 환율 ₩/$
const TOTAL_INV   = 50086393;    // 총 투자금 (수수료 포함) ₩
const STOP_KRW    = 525003;      // 손절선 (-7% from avg) ₩

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
  const prev  = m.chartPreviousClose ?? m.previousClose ?? null;
  const chg   = price && prev && prev !== 0
    ? Math.round(((price - prev) / prev) * 10000) / 100 : 0;
  const postPrice = m.postMarketPrice ?? null;
  const postChg   = postPrice && price
    ? Math.round(((postPrice - price) / price) * 10000) / 100 : null;
  return {
    price, chg,
    week52High: m.fiftyTwoWeekHigh ?? null,
    week52Low:  m.fiftyTwoWeekLow  ?? null,
    postPrice, postChg,
    marketState: m.marketState ?? "CLOSED"
  };
}

const W  = "\u20a9";
const fp = (n, d = 2) => n != null ? Number(n).toFixed(d) : "-";
const fw = n => n != null ? W + Math.round(n).toLocaleString("ko-KR") : "-";
const fc = n => n != null ? (n >= 0 ? "+" : "") + Number(n).toFixed(2) + "%" : "-";
const fa = n => n != null ? (n >= 0 ? "+" : "") + W + Math.abs(Math.round(n)).toLocaleString("ko-KR") : "-";

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
    const evalAmt   = curKRW ? Math.round(SHARES * curKRW) : null;           // 평가금액
    const totalPL   = evalAmt ? evalAmt - TOTAL_INV : null;                  // 총 평가손익
    const totalPLPct= totalPL ? Math.round((totalPL / TOTAL_INV) * 10000) / 100 : null;

    // 주식 손익 (달러 기준 → 원화 환산)
    const stockPL_USD = curUSD ? (curUSD - AVG_USD) * SHARES : null;
    const stockPL_KRW = stockPL_USD && curRate ? Math.round(stockPL_USD * curRate) : null;

    // 환차손익 = (현재환율 - 매수평균환율) × 총투자달러
    const totalUSD_inv = TOTAL_INV / AVG_RATE;                               // 총 투자달러
    const fxPL = curRate ? Math.round((curRate - AVG_RATE) * totalUSD_inv) : null;

    const today = new Date().toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
    }).replace(/\. /g, "-").replace(".", "");

    // 애프터/프리마켓
    let extStr = "";
    if (t?.postPrice && t?.postChg != null) {
      const label = t.marketState === "PRE" ? "프리마켓" : "애프터마켓";
      extStr = `\n       ${label}: $${fp(t.postPrice)} (${fc(t.postChg)})`;
    }

    // ── Claude: 번역 + 분석 ──────────────────────────────────
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
- ${SHARES}주 | 평균단가 ${W}${AVG_KRW.toLocaleString("ko-KR")} ($${AVG_USD})
- 총투자 ${W}${TOTAL_INV.toLocaleString("ko-KR")} (평균환율 ${AVG_RATE})
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

    const sigEmoji  = ai.signal === "BUY" ? "\uD83D\uDFE2 매수" : ai.signal === "SELL" ? "\uD83D\uDD34 매도" : "\uD83D\uDFE1 홀드";
    const plEmoji   = totalPL != null ? (totalPL >= 0 ? "\uD83D\uDCC8" : "\uD83D\uDCC9") : "";
    const safeEmoji = curKRW && curKRW < STOP_KRW ? "\u26A0\uFE0F 손절선 하회!" : "\u2705 안전";

    const ev = (ai.economic_events || []).slice(0, 3)
      .map(e => "  \u2022 " + e.event + " [" + e.impact + "] " + e.expected).join("\n") || "  \u2022 주요 일정 없음";

    const newsLines = news.slice(0, 5).map((item, i) => {
      const summary = (ai.news_summaries || [])[i] || item.title;
      return "  \u2022 " + item.date + " " + summary + "\n    \uD83D\uDD17 " + item.url;
    }).join("\n") || "  \u2022 뉴스 없음";

    const msg =
`\uD83D\uDCCA [TSLA 아침 브리핑] ${today}

\u2501\u2501\u2501 실시간 시세 \u2501\u2501\u2501
TSLA    $${fp(curUSD)} (${fc(t?.chg)})${extStr}
         = ${fw(curKRW)}
USD/KRW  ${curRate ? curRate.toLocaleString() + "\u20a9" : "-"}
S&P500   ${s?.price ? Math.round(s.price).toLocaleString() + " (" + fc(s?.chg) + ")" : "-"}
NASDAQ   ${n?.price ? Math.round(n.price).toLocaleString() + " (" + fc(n?.chg) + ")" : "-"}

\u2501\u2501\u2501 ${sigEmoji} 신호 \u2501\u2501\u2501
${ai.signal_reason || "-"}
목표가: ${ai.target_price ? "$" + fp(ai.target_price) : "-"} | 손절가: ${ai.stop_price ? "$" + fp(ai.stop_price) : "-"}

\u2501\u2501\u2501 내 포트폴리오 \u2501\u2501\u2501
보유  ${SHARES}주 (1차 70.355 + 2차 18.147)
평균  ${W}${AVG_KRW.toLocaleString("ko-KR")} ($${AVG_USD}) @ ${AVG_RATE}\u20a9
현재  ${fw(curKRW)} ${plEmoji}

평가금액   ${evalAmt != null ? W + evalAmt.toLocaleString("ko-KR") : "-"}
총투자금   ${W}${TOTAL_INV.toLocaleString("ko-KR")}
─────────────────
평가손익   ${totalPL != null ? (totalPL >= 0 ? "+" : "") + W + Math.abs(Math.round(totalPL)).toLocaleString("ko-KR") + " (" + (totalPLPct >= 0 ? "+" : "") + totalPLPct + "%)" : "-"}
  주식손익  ${stockPL_KRW != null ? (stockPL_KRW >= 0 ? "+" : "") + W + Math.abs(Math.round(stockPL_KRW)).toLocaleString("ko-KR") : "-"}
  환 차손익  ${fxPL != null ? (fxPL >= 0 ? "+" : "") + W + Math.abs(Math.round(fxPL)).toLocaleString("ko-KR") + " (환율 " + (curRate - AVG_RATE >= 0 ? "+" : "") + Math.round(curRate - AVG_RATE) + "\u20a9)" : "-"}

손절선  ${W}${STOP_KRW.toLocaleString("ko-KR")} ${safeEmoji}

\u2501\u2501\u2501 경제 일정 \u2501\u2501\u2501
${ev}

\u2501\u2501\u2501 테슬라 최신 뉴스 \u2501\u2501\u2501
${newsLines}

\u2501\u2501\u2501 투자 전략 \u2501\u2501\u2501
${ai.strategy}`;

    const tg = await fetch("https://api.telegram.org/bot" + TG_TOKEN + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text: msg, disable_web_page_preview: false })
    });
    const tj = await tg.json();

    return Response.json({
      ok: true, telegram_ok: tj.ok, signal: ai.signal,
      tsla_usd: curUSD, tsla_krw: curKRW,
      eval_amt: evalAmt, total_pl: totalPL, total_pl_pct: totalPLPct,
      stock_pl_krw: stockPL_KRW, fx_pl: fxPL,
      news_count: news.length, today
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
