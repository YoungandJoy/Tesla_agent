// tsla-agent/app/api/cron/morning/route.js
// Vercel Cron: 01:00 UTC = 10:00 KST 자동 실행
const TG_TOKEN = "8750913612:AAH3FLdPBv9uD0SEVqifi0htU7lKkISFVQM";
const TG_CHAT_ID = "8494338776";
const YF_H = {'User-Agent':'Mozilla/5.0','Accept':'application/json','Referer':'https://finance.yahoo.com/'};
async function yf(sym) {
  const e = encodeURIComponent(sym);
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${e}?interval=1d&range=1d`,{headers:YF_H,signal:AbortSignal.timeout(8000)});
    if(r.ok) return r.json();
    const r2 = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${e}?interval=1d&range=1d`,{headers:YF_H,signal:AbortSignal.timeout(8000)});
    return r2.ok?r2.json():null;
  }catch{return null;}
}
function ex(d){
  const m=d?.chart?.result?.[0]?.meta;
  if(!m)return null;
  const price=m.regularMarketPrice??m.previousClose??null;
  const prev=m.chartPreviousClose??m.previousClose??null;
  const chg=(price&&prev&&prev!==0)?Math.round(((price-prev)/prev)*10000)/100:0;
  return{price,chg};
}
const W='₩';
const fp=(n,d=2)=>n!=null?Number(n).toFixed(d):'-';
const fw=n=>n!=null?W+Math.round(n).toLocaleString('ko-KR'):'-';
const fc=n=>n!=null?(n>=0?'+':'')+Number(n).toFixed(2)+'%':'-';
export async function GET(){
  try{
    const[tr,sr,nr,fr]=await Promise.allSettled([yf('TSLA'),yf('^GSPC'),yf('^IXIC'),yf('USDKRW=X')]);
    const g=r=>r.status==='fulfilled'&&r.value?ex(r.value):null;
    const t=g(tr),s=g(sr),n=g(nr),f=g(fr);
    const tu=t?.price??null,uk=f?.price?Math.round(f.price):null,tk=tu&&uk?Math.round(tu*uk):null;
    const today=new Date().toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).replace(/\. /g,'-').replace('.','');
    const uMsg='You are a TSLA investment AI for Young Oh.\nREAL-TIME: TSLA '+(tu?'$'+fp(tu)+' ('+fc(t?.chg)+')':'N/A')+' = '+fw(tk)+', USD/KRW '+fw(uk)+', S&P '+(s?.price?Math.round(s.price)+' ('+fc(s?.chg)+')':'N/A')+', NASDAQ '+(n?.price?Math.round(n.price)+' ('+fc(n?.chg)+')':'N/A')+'\nPortfolio: 70.355 shares avg '+W+'568,544 stop '+W+'528,746\nReturn ONLY JSON:{"economic_events":[{"event":"x","impact":"H/M/L","expected":"x"}],"tesla_news":["n1","n2","n3"],"strategy":"Korean 2-3 sentences"}';
    const cr=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:800,messages:[{role:'user',content:uMsg}]})});
    let ai={economic_events:[],tesla_news:[],strategy:'분석 중...'};
    if(cr.ok){const cj=await cr.json();const tx=(cj.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');const m=tx.match(/{[\s\S]*}/);if(m)try{ai=JSON.parse(m[0]);}catch{}}
    const ev=(ai.economic_events||[]).map(e=>'- '+e.event+' ['+e.impact+'] '+e.expected).join('\n')||'- 주요 일정 없음';
    const nw=(ai.tesla_news||[]).map(x=>'- '+x).join('\n')||'- 뉴스 없음';
    const msg='[TSLA 아침 브리핑] '+today+' 오전 10:00\n\n[실시간 시세]\nTSLA: '+(tu?'$'+fp(tu)+' ('+fc(t?.chg)+')':'-')+' = '+fw(tk)+'\nUSD/KRW: '+fw(uk)+'\nS&P500: '+(s?.price?Math.round(s.price).toLocaleString()+' ('+fc(s?.chg)+')':'-')+'\nNASDAQ: '+(n?.price?Math.round(n.price).toLocaleString()+' ('+fc(n?.chg)+')':'-')+'\n\n[경제 일정]\n'+ev+'\n\n[테슬라 뉴스]\n'+nw+'\n\n[투자 전략]\n'+ai.strategy+'\n\n포트폴리오: 70.355주 | 평균 '+W+'568,544 | 손절 '+W+'528,746';
    const tg=await fetch('https://api.telegram.org/bot'+TG_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:TG_CHAT_ID,text:msg})});
    const tj=await tg.json();
    return Response.json({ok:true,telegram_ok:tj.ok,tsla_usd:tu,tsla_krw:tk,today});
  }catch(e){return Response.json({ok:false,error:e.message},{status:500});}
}
