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

// 시세 가져오기 (5일치로 52주 고저가 포함)
async function yf(sym) {
  const e = encodeURIComponent(sym);
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${e}?interval=1d&range=5d`,
        { headers: YF_H, signal: AbortSignal.timeout(8000) }
      );
      if (r.ok) return r.json();
    } catch {}
  }
  return null;
}

// Yahoo Finance 실시간 뉴스 (링크 포함)
async function fetchNews() {
  try {
    const url = "https://query1.finance.yahoo.com/v1/finance/search?q=TSLA+Tesla&newsCount=8&enableFuzzyQuery=false&enableCb=false";
    const r = await fetch(url, { headers: YF_H, signal: AbortSignal.timeout(8000) });
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
  const postChg = postPrice && price && price !== 0
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

export async function GET() {
  try {
    const [priceRes, news] = await Promise.all([
      Promise.allSettled([yf("TSLA"), yf("^GSPC"), yf("^IXIC"), yf("USDKRW=X")]),
      fetchNews()
    ]);

    const [tr, sr, nr, fr] = priceRes;
    const g = r => r.status === "fulfilled" && r.value ? ex(r.value) : null;
    const t = g(tr), s = g(sr), n = g(nr), f = g(fr);

    const tu = t?.price ?? null;
    const uk = f?.price ? Math.round(f.price) : null;
    const tk = tu && uk ? Math.round(tu * uk) : null;
    const AVG = 568544, STOP = 528746;
    const plPct = tk ? Math.round(((tk - AVG) / AVG) * 10000) / 100 : null;
    const today = new Date().toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
    }).replace(/\. /g, "-").replace(".", "");

    // 애프터/프리마켓 표시
    let extStr = "";
    if (t?.postPrice && t?.postChg != null) {
      const label = t.marketState === "PRE" ? "프리마켓" : "애프터";
      extStr = `\n       ${label}: $${fp(t.postPrice)} (${fc(t.postChg)})`;
    }

    // 실제 뉴스 헤드라인 → Claude에게 번역+요약만 요청
    const headlineText = news.length > 0
      ? news.map((x, i) => `${i + 1}. [${x.publisher}] ${x.title}`).join("\n")
      : "No news available";

    const prompt = `You are a TSLA investment AI for Young Oh (Korean retail investor).

REAL-TIME DATA (today):
- TSLA: ${tu ? "$" + fp(tu) + " (" + fc(t?.chg) + ")" : "N/A"} = ${fw(tk)}
- USD/KRW: ${fw(uk)}
- S&P500: ${s?.price ? Math.round(s.price) + " (" + fc(s?.chg) + ")" : "N/A"}
- NASDAQ: ${n?.price ? Math.round(n.price) + " (" + fc(n?.chg) + ")" : "N/A"}
- TSLA 52W: High ${t?.week52High ? "$" + fp(t.week52High) : "N/A"} / Low ${t?.week52Low ? "$" + fp(t.week52Low) : "N/A"}
PORTFOLIO: 70.355 shares | avg ${W}568,544 | stop ${W}528,746 | P&L: ${plPct != null ? (plPct >= 0 ? "+" : "") + plPct + "%" : "N/A"}

TODAY'S ACTUAL NEWS (translate & summarize ONLY these, do NOT invent news):
${headlineText}

Return ONLY valid JSON:
{
  "signal": "BUY" or "SELL" or "HOLD",
  "signal_reason": "1-2 sentences in Korean",
  "target_price": number,
  "stop_price": number,
  "economic_events": [{"event":"name","impact":"H/M/L","expected":"value or desc"}],
  "news_summaries": ["Korean 1-line summary of headline 1","summary 2","summary 3","summary 4","summary 5","summary 6"],
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

    const sigEmoji = ai.signal === "BUY" ? "\uD83D\uDFE2 매수" : ai.signal === "SELL" ? "\uD83D\uDD34 매도" : "\uD83D\uDFE1 홀드";
    const plEmoji = plPct != null ? (plPct >= 0 ? "\uD83D\uDCC8" : "\uD83D\uDCC9") : "";
    const ev = (ai.economic_events || []).slice(0, 3)
      .map(e => "  • " + e.event + " [" + e.impact + "] " + e.expected).join("\n") || "  • 주요 일정 없음";

    // 뉴스: AI 한국어 요약 + 실제 링크
    const newsLines = news.slice(0, 5).map((item, i) => {
      const summary = (ai.news_summaries || [])[i] || item.title;
      return "  • " + item.date + " " + summary + "\n    \uD83D\uDD17 " + item.url;
    }).join("\n") || "  • 뉴스 없음";

    const msg = `\uD83D\uDCCA [TSLA 아침 브리핑] ${today}

\u2501\u2501\u2501 실시간 시세 \u2501\u2501\u2501
TSLA  $${fp(tu)} (${fc(t?.chg)})${extStr}
       = ${fw(tk)}
USD/KRW  ${fw(uk)}
S&P500   ${s?.price ? Math.round(s.price).toLocaleString() + " (" + fc(s?.chg) + ")" : "-"}
NASDAQ   ${n?.price ? Math.round(n.price).toLocaleString() + " (" + fc(n?.chg) + ")" : "-"}

\u2501\u2501\u2501 ${sigEmoji} 신호 \u2501\u2501\u2501
${ai.signal_reason || "-"}
목표가: ${ai.target_price ? "$" + fp(ai.target_price) : "-"} | 손절가: ${ai.stop_price ? "$" + fp(ai.stop_price) : "-"}

\u2501\u2501\u2501 내 포트폴리오 \u2501\u2501\u2501
70.355주 | 평균 ${W}568,544
현재 ${fw(tk)} ${plEmoji} ${plPct != null ? (plPct >= 0 ? "+" : "") + plPct + "%" : ""}
손절선 ${W}528,746 ${tk && tk < STOP ? "\u26A0\uFE0F 손절선 하회!" : "\u2705 안전"}

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
      ok: true, telegram_ok: tj.ok,
      signal: ai.signal, tsla_usd: tu, tsla_krw: tk,
      pl_pct: plPct, news_count: news.length, today
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
