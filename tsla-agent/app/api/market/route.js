// 파일 위치: tsla-agent/app/api/market/route.js
// Yahoo Finance에서 TSLA, S&P500, 나스닥, 환율 실시간 데이터 수집
 
export async function GET() {
  const YF_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
  };
 
  async function fetchYahoo(symbol) {
    const encoded = encodeURIComponent(symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1d&includePrePost=false`;
    const res = await fetch(url, {
      headers: YF_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      // query2 폴백 시도
      const url2 = `https://query2.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1d`;
      const res2 = await fetch(url2, { headers: YF_HEADERS, signal: AbortSignal.timeout(8000) });
      if (!res2.ok) throw new Error(`Yahoo ${symbol}: ${res2.status}`);
      return res2.json();
    }
    return res.json();
  }
 
  function extractMeta(data) {
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice ?? meta.previousClose ?? null;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
    const chg_pct = (price && prev && prev !== 0)
      ? Math.round(((price - prev) / prev) * 10000) / 100
      : 0;
    return { price, prev, chg_pct };
  }
 
  try {
    const [tslaRes, sp500Res, nasdaqRes, fxRes] = await Promise.allSettled([
      fetchYahoo('TSLA'),
      fetchYahoo('^GSPC'),
      fetchYahoo('^IXIC'),
      fetchYahoo('USDKRW=X'),
    ]);
 
    const get = (r) => r.status === 'fulfilled' ? extractMeta(r.value) : null;
    const t = get(tslaRes);
    const s = get(sp500Res);
    const n = get(nasdaqRes);
    const f = get(fxRes);
 
    const tsla_usd = t?.price ? Math.round(t.price * 100) / 100 : null;
    const usd_krw = f?.price ? Math.round(f.price) : null;
 
    return Response.json({
      ok: true,
      fetched_at: new Date().toISOString(),
      tsla_usd,
      tsla_chg_pct: t?.chg_pct ?? null,
      tsla_krw: (tsla_usd && usd_krw) ? Math.round(tsla_usd * usd_krw) : null,
      usd_krw,
      usd_krw_chg_pct: f?.chg_pct ?? null,
      sp500: s?.price ? Math.round(s.price) : null,
      sp500_chg_pct: s?.chg_pct ?? null,
      nasdaq: n?.price ? Math.round(n.price) : null,
      nasdaq_chg_pct: n?.chg_pct ?? null,
      sources: {
        tsla: t ? 'yahoo' : 'unavailable',
        sp500: s ? 'yahoo' : 'unavailable',
        nasdaq: n ? 'yahoo' : 'unavailable',
        forex: f ? 'yahoo' : 'unavailable',
      }
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
 
