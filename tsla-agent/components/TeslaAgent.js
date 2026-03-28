"use client";
import { useState, useEffect, useRef, useCallback } from "react";

// ── 설정값 (Young Oh 계좌) ─────────────────────────────────────
const TG_TOKEN = "8750913612:AAH3FLdPBv9uD0SEVqifi0htU7lKkISFVQM";
const TG_CHAT_ID = "8494338776";

const PORTFOLIO = {
  shares: 70.355084,
  avg_price_krw: 568544,
  eval_amount: 38342676,
  unrealized_pct: -4.14,
};

const STOP_LOSS_KRW = Math.round(PORTFOLIO.avg_price_krw * 0.93); // -7%
const ALERT_KRW     = Math.round(PORTFOLIO.avg_price_krw * 0.95); // -5% 경보

// ── 프롬프트 ──────────────────────────────────────────────────
const SIGNAL_PROMPT = `당신은 테슬라(TSLA) 전문 퀀트 트레이더 AI입니다.

【실제 보유 현황 - 한국투자증권 Young Oh】
- 보유수량: 70.355084주 / 평균구매가: ₩568,544
- 평가금액: ₩38,342,676 / 손절라인: ₩528,746 (-7%)
- 경보라인: ₩540,117 (-5%)

웹 검색으로 ① TSLA 현재가 ② 최신 테슬라 뉴스 ③ 미국 경제지표 ④ 지정학 리스크를 수집 후,
반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 금지):

{
  "action": "BUY"|"SELL"|"HOLD"|"PARTIAL_SELL",
  "confidence": 0~100,
  "urgency": "LOW"|"MEDIUM"|"HIGH",
  "current_price_krw": 숫자,
  "target_price_krw": 숫자,
  "stop_loss_krw": 숫자,
  "position_change": "설명",
  "signal_breakdown": {
    "geopolitics": {"score": -10~10, "summary": "한국어"},
    "tesla_news":  {"score": -10~10, "summary": "한국어"},
    "technical":   {"score": -10~10, "summary": "한국어"},
    "macro":       {"score": -10~10, "summary": "한국어"}
  },
  "key_risks": ["리스크1","리스크2","리스크3"],
  "reasoning": "한국어 250자 이내 종합 판단",
  "telegram_message": "3줄 이내 알림 메시지 (이모지 포함)",
  "next_trigger": "다음 주목 이벤트"
}`;

const WEEKLY_PROMPT = `당신은 테슬라(TSLA) 전문 애널리스트입니다.

웹 검색으로 이번 주 다음 항목들을 종합 조사하세요:
1. 테슬라 주요 뉴스 (어닝콜, 생산/인도량, 신모델, CEO 발언)
2. 전기차 시장 동향 (BYD, Rivian 경쟁)
3. 미국 거시경제 (금리, 인플레이션, 고용, 관세)
4. 세계 지정학 (미중 무역전쟁, 에너지, 전쟁)
5. TSLA 기술적 분석 (주간 지지/저항선)

반드시 아래 JSON으로만 응답하세요:
{
  "week": "YYYY-MM-DD 주간",
  "tsla_summary": "테슬라 주요 이슈 3~5줄",
  "market_summary": "거시경제/지정학 3~5줄",
  "ev_competition": "EV 경쟁 현황 2~3줄",
  "technical_outlook": "기술적 전망 2~3줄",
  "weekly_action": "BUY"|"SELL"|"HOLD",
  "weekly_confidence": 0~100,
  "price_range": {"support": 숫자, "resistance": 숫자},
  "key_events_next_week": ["이벤트1","이벤트2","이벤트3"],
  "telegram_weekly": "텔레그램 주간 리포트 요약 (5줄 이내, 이모지 포함)"
}`;

// ── 유틸 ──────────────────────────────────────────────────────
const fmt = (n) => n ? `₩${Number(n).toLocaleString()}` : "-";

async function sendTelegram(message) {
  try {
    await fetch("/api/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: TG_TOKEN, chatId: TG_CHAT_ID, message }),
    });
  } catch (_) {}
}

async function callClaude(systemPrompt, userMsg) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2500,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: systemPrompt,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("JSON 파싱 실패");
  return JSON.parse(match[0]);
}

const ScoreBar = ({ score }) => {
  const pct = ((score + 10) / 20) * 100;
  const c = score > 3 ? "#00e676" : score < -3 ? "#ff5252" : "#ffd740";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: "#1c1c2e", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: c, transition: "width 1s ease", borderRadius: 3 }} />
      </div>
      <span style={{ color: c, fontFamily: "monospace", fontSize: 12, width: 28, textAlign: "right", fontWeight: 700 }}>
        {score > 0 ? `+${score}` : score}
      </span>
    </div>
  );
};

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export default function TeslaAgent() {
  const [analysis, setAnalysis]     = useState(null);
  const [weekly, setWeekly]         = useState(null);
  const [loading, setLoading]       = useState(false);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [log, setLog]               = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoMode, setAutoMode]     = useState(false);
  const [tab, setTab]               = useState("signal");
  const [mainTab, setMainTab]       = useState("signal"); // signal | weekly
  const [autoMin, setAutoMin]       = useState(30);
  const intervalRef = useRef(null);
  const weeklyRef   = useRef(null);
  const logRef      = useRef(null);

  const addLog = useCallback((msg, type = "info") => {
    const time = new Date().toLocaleTimeString("ko-KR");
    setLog(p => [...p.slice(-99), { time, msg, type }]);
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 60);
  }, []);

  // ── 신호 분석 ────────────────────────────────────────────────
  const runSignal = useCallback(async (silent = false) => {
    if (loading) return;
    setLoading(true);
    if (!silent) addLog("⚡ AI 분석 시작...", "info");
    addLog("🌐 웹서치: TSLA 시세 + 뉴스 수집 중...", "info");
    try {
      const result = await callClaude(SIGNAL_PROMPT,
        "지금 즉시 웹 검색으로 TSLA 현재가, 최신 뉴스, 거시경제, 지정학 리스크를 조사하고 JSON으로 응답하세요."
      );
      setAnalysis(result);
      setLastUpdated(new Date());

      const emoji = result.action === "BUY" ? "🟢" : result.action?.includes("SELL") ? "🔴" : "🟡";
      addLog(`${emoji} ${result.action} | 확신도 ${result.confidence}% | 긴급도 ${result.urgency}`, result.action === "BUY" ? "success" : result.action?.includes("SELL") ? "danger" : "warn");

      // 현재가 기반 경보 체크
      const cp = result.current_price_krw;
      if (cp && cp <= STOP_LOSS_KRW) {
        addLog(`🚨 손절라인 도달! ${fmt(cp)} ≤ ${fmt(STOP_LOSS_KRW)}`, "danger");
        await sendTelegram(`🚨 <b>손절라인 도달!</b>\n\n현재가: ${fmt(cp)}\n손절라인: ${fmt(STOP_LOSS_KRW)} (-7%)\n\n즉시 매도 검토 필요!`);
      } else if (cp && cp <= ALERT_KRW) {
        addLog(`⚠️ 경보! 현재가 ${fmt(cp)} — -5% 근접`, "warn");
        await sendTelegram(`⚠️ <b>손절 경보 (-5%)</b>\n현재가: ${fmt(cp)}\n손절라인까지: ${fmt(cp - STOP_LOSS_KRW)} 남음`);
      }

      // BUY/SELL 신호 텔레그램
      if (result.action !== "HOLD" && result.telegram_message) {
        const msg = `🤖 <b>TSLA AI Signal</b>\n${result.telegram_message}\n\n💼 평가: ${fmt(cp ? cp * PORTFOLIO.shares : PORTFOLIO.eval_amount)}\n⏰ ${new Date().toLocaleString("ko-KR")}`;
        await sendTelegram(msg);
        addLog("📨 텔레그램 신호 전송 완료", "success");
      } else if (result.action === "HOLD") {
        // 정기 분석 완료 알림 (30분마다)
        if (silent) {
          await sendTelegram(`🟡 <b>TSLA 정기분석</b>\n${result.telegram_message || "현재 HOLD 유지"}\n\n현재가: ${fmt(cp)}\n⏰ ${new Date().toLocaleString("ko-KR")}`);
          addLog("📨 정기 분석 알림 전송", "success");
        }
      }
    } catch (e) {
      addLog(`❌ 오류: ${e.message}`, "danger");
    } finally {
      setLoading(false);
    }
  }, [loading, addLog]);

  // ── 주간 리포트 ───────────────────────────────────────────────
  const runWeekly = useCallback(async () => {
    setWeeklyLoading(true);
    addLog("📋 주간 리포트 생성 중...", "info");
    try {
      const result = await callClaude(WEEKLY_PROMPT,
        "이번 주 테슬라 & 세계 금융 정세를 종합 분석하고 JSON으로 응답하세요."
      );
      setWeekly(result);
      setMainTab("weekly");
      addLog(`✅ 주간 리포트 완료 — ${result.weekly_action} (${result.weekly_confidence}%)`, "success");

      if (result.telegram_weekly) {
        const msg = `📊 <b>TSLA 주간 리포트</b>\n\n${result.telegram_weekly}\n\n⏰ ${new Date().toLocaleString("ko-KR")}`;
        await sendTelegram(msg);
        addLog("📨 주간 리포트 텔레그램 전송 완료", "success");
      }
    } catch (e) {
      addLog(`❌ 주간 리포트 오류: ${e.message}`, "danger");
    } finally {
      setWeeklyLoading(false);
    }
  }, [addLog]);

  // ── 자동 모드 ─────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (autoMode) {
      addLog(`🤖 자동 분석 ON (${autoMin}분 간격)`, "success");
      sendTelegram(`🤖 <b>TSLA AI Agent 시작</b>\n자동 분석 ${autoMin}분 간격으로 실행됩니다.\n손절라인: ${fmt(STOP_LOSS_KRW)}`);
      intervalRef.current = setInterval(() => runSignal(true), autoMin * 60 * 1000);
    } else if (log.length > 0) {
      addLog("⏸ 자동 모드 OFF", "warn");
    }
    return () => clearInterval(intervalRef.current);
  }, [autoMode, autoMin]);

  // ── 주간 자동 (매주 월요일 오전 9시 체크) ──────────────────────
  useEffect(() => {
    const checkWeekly = () => {
      const now = new Date();
      if (now.getDay() === 1 && now.getHours() === 9 && now.getMinutes() < 31) {
        runWeekly();
      }
    };
    weeklyRef.current = setInterval(checkWeekly, 30 * 60 * 1000);
    return () => clearInterval(weeklyRef.current);
  }, [runWeekly]);

  // ── 계산값 ────────────────────────────────────────────────────
  const cp     = analysis?.current_price_krw;
  const evalNow = cp ? cp * PORTFOLIO.shares : PORTFOLIO.eval_amount;
  const pnlPct  = cp ? ((cp / PORTFOLIO.avg_price_krw - 1) * 100).toFixed(2) : PORTFOLIO.unrealized_pct;
  const pnlKrw  = cp ? (cp - PORTFOLIO.avg_price_krw) * PORTFOLIO.shares : -1657316;
  const pnlColor = parseFloat(pnlPct) >= 0 ? "#00e676" : "#ff5252";
  const acColor  = analysis?.action?.includes("SELL") ? "#ff5252" : analysis?.action === "BUY" ? "#00e676" : "#ffd740";

  return (
    <div style={{ minHeight: "100vh", background: "#08080f", color: "#ccd6f6", fontFamily: "'IBM Plex Mono', monospace", paddingBottom: 60, backgroundImage: "radial-gradient(ellipse at 15% 0%, #0d0d2b, transparent 55%), radial-gradient(ellipse at 85% 90%, #0d1a0d, transparent 55%)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;600;700&display=swap');
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes slide { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        .card  { background:#0e0e1e; border:1px solid #1e2240; border-radius:10px; padding:18px; }
        .mtab  { background:none; border:none; cursor:pointer; font-family:inherit; font-size:12px; letter-spacing:1.5px; padding:10px 18px; border-bottom:2px solid transparent; transition:all .2s; }
        .mtab.on  { color:#00e676; border-bottom-color:#00e676; }
        .mtab:not(.on) { color:#3a4060; }
        .mtab:hover:not(.on) { color:#7788aa; }
        .stab  { background:none; border:none; cursor:pointer; font-family:inherit; font-size:11px; letter-spacing:1px; padding:8px 14px; border-bottom:2px solid transparent; transition:all .2s; }
        .stab.on  { color:#00e676; border-bottom-color:#00e676; }
        .stab:not(.on) { color:#3a4060; }
        .btn   { font-family:inherit; cursor:pointer; border-radius:7px; transition:all .2s; font-size:12px; letter-spacing:1px; font-weight:600; }
        .btn-g { background:#00e676; color:#050510; border:none; padding:10px 22px; }
        .btn-g:hover { background:#00c860; transform:translateY(-1px); }
        .btn-g:disabled { background:#1a3a2a; color:#2a5040; cursor:not-allowed; transform:none; }
        .btn-b { background:transparent; border:1px solid #3a4060; color:#7788aa; padding:10px 16px; }
        .btn-b:hover { border-color:#7788aa; }
        .btn-w { background:transparent; border:1px solid #4a90d9; color:#4a90d9; padding:10px 16px; }
        .btn-w:hover { background:#4a90d922; }
        .log-r { font-size:10px; padding:3px 0; border-bottom:1px solid #0c0c1a; animation:slide .2s ease; line-height:1.5; }
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:#1e2240;border-radius:2px}
      `}</style>

      {/* Header */}
      <div style={{ background:"#0b0b18", borderBottom:"1px solid #1a1a30", padding:"14px 28px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:34, height:34, background:"linear-gradient(135deg,#cc0000,#ff4444)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, color:"#fff", fontSize:15 }}>T</div>
          <div>
            <div style={{ fontWeight:700, fontSize:16, color:"#fff" }}>TSLA AI Agent</div>
            <div style={{ fontSize:10, color:"#3a4060", letterSpacing:"1.5px" }}>Young Oh · 한국투자증권 · 텔레그램 연결됨</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <span style={{ fontSize:10, color:"#00e676", display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:"#00e676", display:"inline-block", animation:"pulse 1.5s infinite" }} />
            텔레그램 활성
          </span>
          {lastUpdated && <span style={{ fontSize:10, color:"#3a4060" }}>{lastUpdated.toLocaleTimeString("ko-KR")}</span>}
        </div>
      </div>

      <div style={{ maxWidth:1080, margin:"0 auto", padding:"20px 20px 0" }}>

        {/* Portfolio */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
          {[
            { label:"평가금액",  value:fmt(evalNow),                          sub:"KIS 해외주식",           color:"#fff" },
            { label:"평가손익",  value:`${parseFloat(pnlPct)>=0?"+":""}${pnlPct}%`, sub:fmt(Math.abs(pnlKrw)),  color:pnlColor },
            { label:"보유주수",  value:`${PORTFOLIO.shares}주`,               sub:`평균 ${fmt(PORTFOLIO.avg_price_krw)}`, color:"#ccd6f6" },
            { label:"손절라인", value:fmt(STOP_LOSS_KRW),                     sub:"평균단가 -7%",            color:"#ff5252" },
          ].map((s,i) => (
            <div key={i} className="card" style={{ textAlign:"center" }}>
              <div style={{ fontSize:9, color:"#3a4060", letterSpacing:"1.5px", marginBottom:5 }}>{s.label}</div>
              <div style={{ fontSize:17, fontWeight:700, color:s.color }}>{s.value}</div>
              <div style={{ fontSize:10, color:"#5566aa", marginTop:3 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
          <button className="btn btn-g" onClick={() => runSignal(false)} disabled={loading} style={{ display:"flex", alignItems:"center", gap:8 }}>
            {loading ? <span style={{ width:13,height:13,border:"2px solid #05051022",borderTop:"2px solid #050510",borderRadius:"50%",animation:"spin .7s linear infinite",display:"inline-block" }} /> : "⚡"}
            {loading ? "분석 중..." : "AI 신호 분석"}
          </button>
          <button className="btn btn-w" onClick={runWeekly} disabled={weeklyLoading} style={{ display:"flex", alignItems:"center", gap:8 }}>
            {weeklyLoading ? <span style={{ width:13,height:13,border:"2px solid #4a90d944",borderTop:"2px solid #4a90d9",borderRadius:"50%",animation:"spin .7s linear infinite",display:"inline-block" }} /> : "📋"}
            {weeklyLoading ? "생성 중..." : "주간 리포트"}
          </button>
          <button className="btn btn-b" onClick={() => setAutoMode(p=>!p)} style={{ borderColor: autoMode?"#00e676":"#3a4060", color:autoMode?"#00e676":"#7788aa", animation:autoMode?"pulse 2s infinite":"none" }}>
            {autoMode ? `⏹ 자동 OFF (${autoMin}분)` : "🤖 자동 ON"}
          </button>
          {autoMode && (
            <select value={autoMin} onChange={e=>setAutoMin(Number(e.target.value))} style={{ background:"#0e0e1e", border:"1px solid #1e2240", borderRadius:6, padding:"9px 10px", color:"#ccd6f6", fontFamily:"inherit", fontSize:11 }}>
              <option value={15}>15분</option>
              <option value={30}>30분</option>
              <option value={60}>1시간</option>
              <option value={240}>4시간</option>
            </select>
          )}
          <span style={{ marginLeft:"auto", fontSize:10, color:"#3a4060" }}>주간 리포트: 매주 월요일 자동 실행</span>
        </div>

        {/* Main Tabs */}
        <div style={{ display:"flex", borderBottom:"1px solid #1a1a30", marginBottom:14 }}>
          {[["signal","📡 실시간 신호"],["weekly","📊 주간 리포트"]].map(([t,l])=>(
            <button key={t} className={`mtab ${mainTab===t?"on":""}`} onClick={()=>setMainTab(t)}>{l}</button>
          ))}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:14 }}>
          <div>
            {/* ── 실시간 신호 탭 ── */}
            {mainTab === "signal" && (
              <>
                {!analysis && !loading && (
                  <div className="card" style={{ textAlign:"center", padding:"50px 20px" }}>
                    <div style={{ fontSize:36, marginBottom:14 }}>📡</div>
                    <div style={{ color:"#3a4060", fontSize:13, lineHeight:1.8 }}>
                      <b style={{color:"#ccd6f6"}}>⚡ AI 신호 분석</b> 버튼으로 실시간 매매 신호<br/>
                      <b style={{color:"#ccd6f6"}}>📋 주간 리포트</b> 버튼으로 심층 분석<br/>
                      <b style={{color:"#ccd6f6"}}>🤖 자동 ON</b> 으로 주기적 자동 알림
                    </div>
                  </div>
                )}
                {loading && (
                  <div className="card" style={{ padding:30 }}>
                    {["🔍 TSLA 현재가 수집...","🌍 지정학 리스크 분석...","📊 기술적 지표 계산...","🧠 Claude AI 종합 판단..."].map((s,i)=>(
                      <div key={i} style={{ display:"flex", gap:12, padding:"10px 0", borderBottom:"1px solid #0c0c1e", animation:`slide .3s ease ${i*.12}s both` }}>
                        <span style={{ width:14,height:14,border:"2px solid #1e2240",borderTop:"2px solid #00e676",borderRadius:"50%",animation:"spin .8s linear infinite",flexShrink:0,marginTop:2 }} />
                        <span style={{ fontSize:12, color:"#7788aa" }}>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
                {analysis && !loading && (
                  <div style={{ animation:"slide .4s ease" }}>
                    <div className="card" style={{ marginBottom:12, background:`${acColor}0d`, borderColor:`${acColor}44` }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:22 }}>
                          <div style={{ fontSize:42, fontWeight:900, color:acColor, letterSpacing:"-2px" }}>{analysis.action}</div>
                          <div><div style={{ fontSize:9,color:"#3a4060" }}>확신도</div><div style={{ fontSize:26,fontWeight:700,color:analysis.confidence>=70?"#00e676":analysis.confidence>=40?"#ffd740":"#ff5252" }}>{analysis.confidence}%</div></div>
                          <div><div style={{ fontSize:9,color:"#3a4060" }}>긴급도</div><div style={{ fontSize:15,fontWeight:700,color:analysis.urgency==="HIGH"?"#ff5252":analysis.urgency==="MEDIUM"?"#ffd740":"#00e676" }}>● {analysis.urgency}</div></div>
                          {analysis.position_change && <div><div style={{ fontSize:9,color:"#3a4060" }}>액션</div><div style={{ fontSize:12,color:"#fff" }}>{analysis.position_change}</div></div>}
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontSize:9,color:"#3a4060" }}>현재가</div>
                          <div style={{ fontSize:17,color:"#fff",fontWeight:700 }}>{fmt(analysis.current_price_krw)}</div>
                          <div style={{ fontSize:9,color:"#3a4060",marginTop:5 }}>목표 / 손절</div>
                          <div style={{ fontSize:13 }}><span style={{color:"#00e676"}}>{fmt(analysis.target_price_krw)}</span><span style={{color:"#3a4060"}}> / </span><span style={{color:"#ff5252"}}>{fmt(analysis.stop_loss_krw)}</span></div>
                        </div>
                      </div>
                    </div>

                    {analysis.telegram_message && (
                      <div className="card" style={{ marginBottom:12, background:"#0a1020", borderColor:"#2255aa44" }}>
                        <div style={{ fontSize:9,color:"#4a90d9",letterSpacing:"2px",marginBottom:6 }}>📨 텔레그램 발송 메시지</div>
                        <div style={{ fontSize:12,color:"#aabbdd",lineHeight:1.7,whiteSpace:"pre-line" }}>{analysis.telegram_message}</div>
                      </div>
                    )}

                    <div className="card" style={{ padding:0 }}>
                      <div style={{ display:"flex", borderBottom:"1px solid #1a1a30", padding:"0 14px" }}>
                        {[["signal","📊 시그널"],["risks","⚠️ 리스크"],["reason","🧠 근거"]].map(([t,l])=>(
                          <button key={t} className={`stab ${tab===t?"on":""}`} onClick={()=>setTab(t)}>{l}</button>
                        ))}
                      </div>
                      <div style={{ padding:18 }}>
                        {tab==="signal" && analysis.signal_breakdown && (
                          <div style={{ display:"grid", gap:14 }}>
                            {Object.entries(analysis.signal_breakdown).map(([k,v])=>(
                              <div key={k}>
                                <div style={{ fontSize:10,color:"#7788aa",marginBottom:5 }}>
                                  {{"geopolitics":"🌍 세계 지정학","tesla_news":"🚗 테슬라 뉴스","technical":"📈 기술적 분석","macro":"💹 거시경제"}[k]}
                                </div>
                                <ScoreBar score={v.score} />
                                <div style={{ fontSize:11,color:"#5566aa",marginTop:4,lineHeight:1.6 }}>{v.summary}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {tab==="risks" && (
                          <div>
                            {analysis.key_risks?.map((r,i)=>(
                              <div key={i} style={{ display:"flex",gap:10,padding:"9px 0",borderBottom:"1px solid #0c0c1e" }}>
                                <span style={{color:"#ff5252"}}>▸</span>
                                <span style={{ fontSize:12,color:"#aabbcc",lineHeight:1.5 }}>{r}</span>
                              </div>
                            ))}
                            {analysis.next_trigger && (
                              <div style={{ marginTop:14,padding:12,background:"#0a1020",borderRadius:7,borderLeft:"3px solid #4a90d9" }}>
                                <div style={{ fontSize:9,color:"#3a4060",marginBottom:4 }}>📅 다음 주목 이벤트</div>
                                <div style={{ fontSize:12,color:"#7aabdd",lineHeight:1.6 }}>{analysis.next_trigger}</div>
                              </div>
                            )}
                          </div>
                        )}
                        {tab==="reason" && (
                          <p style={{ fontSize:13,color:"#aabbcc",lineHeight:1.9,margin:0 }}>{analysis.reasoning}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── 주간 리포트 탭 ── */}
            {mainTab === "weekly" && (
              <>
                {weeklyLoading && (
                  <div className="card" style={{ padding:30 }}>
                    {["🔍 테슬라 주간 뉴스 수집...","🌍 세계 지정학 분석...","💹 거시경제 지표 수집...","📊 EV 경쟁 분석...","🧠 주간 종합 리포트 생성..."].map((s,i)=>(
                      <div key={i} style={{ display:"flex",gap:12,padding:"10px 0",borderBottom:"1px solid #0c0c1e",animation:`slide .3s ease ${i*.1}s both` }}>
                        <span style={{ width:14,height:14,border:"2px solid #1e2240",borderTop:"2px solid #4a90d9",borderRadius:"50%",animation:"spin .8s linear infinite",flexShrink:0,marginTop:2 }} />
                        <span style={{ fontSize:12,color:"#7788aa" }}>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!weekly && !weeklyLoading && (
                  <div className="card" style={{ textAlign:"center", padding:"50px 20px" }}>
                    <div style={{ fontSize:36,marginBottom:14 }}>📊</div>
                    <div style={{ color:"#3a4060",fontSize:13,lineHeight:1.8 }}>
                      <b style={{color:"#ccd6f6"}}>📋 주간 리포트</b> 버튼으로<br/>
                      테슬라 + 세계 금융 심층 분석<br/>
                      <span style={{fontSize:11}}>매주 월요일 자동 실행됩니다</span>
                    </div>
                  </div>
                )}
                {weekly && !weeklyLoading && (
                  <div style={{ animation:"slide .4s ease", display:"grid", gap:12 }}>
                    {/* 헤더 */}
                    <div className="card" style={{ background:weekly.weekly_action==="BUY"?"#00e6760d":weekly.weekly_action?.includes("SELL")?"#ff52520d":"#ffd7400d", borderColor:weekly.weekly_action==="BUY"?"#00e67644":weekly.weekly_action?.includes("SELL")?"#ff525244":"#ffd74044" }}>
                      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                        <div>
                          <div style={{ fontSize:9,color:"#3a4060",marginBottom:4 }}>주간 판단</div>
                          <div style={{ fontSize:36,fontWeight:900,color:weekly.weekly_action==="BUY"?"#00e676":weekly.weekly_action?.includes("SELL")?"#ff5252":"#ffd740",letterSpacing:"-2px" }}>{weekly.weekly_action}</div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontSize:9,color:"#3a4060" }}>주간 확신도</div>
                          <div style={{ fontSize:28,fontWeight:700,color:"#ccd6f6" }}>{weekly.weekly_confidence}%</div>
                          <div style={{ fontSize:10,color:"#5566aa",marginTop:4 }}>{weekly.week}</div>
                        </div>
                        {weekly.price_range && (
                          <div style={{ textAlign:"right" }}>
                            <div style={{ fontSize:9,color:"#3a4060" }}>지지 / 저항</div>
                            <div style={{ fontSize:13 }}><span style={{color:"#00e676"}}>{fmt(weekly.price_range.support)}</span><span style={{color:"#3a4060"}}> / </span><span style={{color:"#ff5252"}}>{fmt(weekly.price_range.resistance)}</span></div>
                          </div>
                        )}
                      </div>
                    </div>

                    {[
                      { key:"tsla_summary",   label:"🚗 테슬라 주요 이슈",   color:"#ff4444" },
                      { key:"market_summary", label:"💹 거시경제 & 지정학",  color:"#4a90d9" },
                      { key:"ev_competition", label:"⚡ EV 경쟁 현황",       color:"#00e676" },
                      { key:"technical_outlook",label:"📈 기술적 전망",      color:"#ffd740" },
                    ].map(({ key, label, color }) => weekly[key] && (
                      <div key={key} className="card" style={{ borderLeft:`3px solid ${color}44` }}>
                        <div style={{ fontSize:10,color:color,letterSpacing:"1px",marginBottom:8 }}>{label}</div>
                        <p style={{ fontSize:12,color:"#aabbcc",lineHeight:1.8,margin:0 }}>{weekly[key]}</p>
                      </div>
                    ))}

                    {weekly.key_events_next_week && (
                      <div className="card">
                        <div style={{ fontSize:10,color:"#ffd740",letterSpacing:"1px",marginBottom:10 }}>📅 다음 주 주목 이벤트</div>
                        {weekly.key_events_next_week.map((e,i)=>(
                          <div key={i} style={{ display:"flex",gap:10,padding:"7px 0",borderBottom:"1px solid #0c0c1e" }}>
                            <span style={{color:"#ffd740"}}>▸</span>
                            <span style={{ fontSize:12,color:"#aabbcc" }}>{e}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 우측: 로그 */}
          <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
            <div className="card" style={{ flex:1 }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:10,paddingBottom:10,borderBottom:"1px solid #1a1a30" }}>
                <span style={{ fontSize:9,letterSpacing:"2px",color:"#3a4060" }}>ACTIVITY LOG</span>
                <button onClick={()=>setLog([])} style={{ background:"none",border:"none",color:"#2a3050",cursor:"pointer",fontSize:10 }}>clear</button>
              </div>
              <div ref={logRef} style={{ overflowY:"auto",maxHeight:380 }}>
                {log.length===0 && <div style={{ textAlign:"center",color:"#2a3050",fontSize:10,padding:20 }}>대기 중...</div>}
                {log.map((l,i)=>(
                  <div key={i} className="log-r" style={{ color:{success:"#00e676",danger:"#ff5252",warn:"#ffd740",info:"#5566aa"}[l.type] }}>
                    <span style={{color:"#2a3050"}}>[{l.time}] </span>{l.msg}
                  </div>
                ))}
              </div>
            </div>

            {/* 알림 현황 */}
            <div className="card">
              <div style={{ fontSize:9,letterSpacing:"2px",color:"#3a4060",marginBottom:10 }}>알림 설정 현황</div>
              {[
                ["📨 텔레그램",        true,  "연결됨"],
                ["🟢 BUY/SELL 신호",  true,  "활성"],
                ["⚠️ 손절 경보 -5%",  true,  `${fmt(ALERT_KRW)}`],
                ["🚨 손절라인 -7%",   true,  `${fmt(STOP_LOSS_KRW)}`],
                ["📋 주간 리포트",    true,  "매주 월요일"],
                ["🔄 정기 분석",      autoMode, autoMode?`${autoMin}분 간격`:"OFF"],
              ].map(([l,ok,s],i)=>(
                <div key={i} style={{ display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #0c0c1e" }}>
                  <span style={{ fontSize:10,color:"#7788aa" }}>{l}</span>
                  <span style={{ fontSize:9,color:ok?"#00e676":"#3a4060" }}>● {s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
