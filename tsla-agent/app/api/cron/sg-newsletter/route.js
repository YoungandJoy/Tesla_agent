export const dynamic = 'force-dynamic';
// Singapore Finance Weekly Newsletter Cron - every Monday 08:00 SGT (00:00 UTC)
const TG_TOKEN = "8696429110:AAF7udUotTwnB2yQ-eSK9ED8KCFbK6A93o4";
const TG_CHAT_ID = "8494338776";

export async function GET() {
  try {
    const today = new Date().toLocaleDateString('ko-KR',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'});
    const prompt = "You are a Singapore M&A/IB/PE weekly newsletter writer for Young Oh (KPMG Singapore Deal Advisory, Big4 to IB/PE transition). Today is "+today+" SGT. Write a comprehensive weekly newsletter in KOREAN covering: 1) Top 3 Asia M&A/PE deals this week (use general knowledge of typical deals in this space), 2) Key market trends in Singapore/Asia IB/PE, 3) Career transition tips: Big4 Deal Advisory to IB/PE (specific actionable advice), 4) 5 key M&A/IB/PE terms this week with Korean translations and examples, 5) Interview prep: 2 technical questions with model answers, 6) Young's action items for this week. Keep under 3800 chars total. Use emojis for sections.";
    
    const cr = await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:2000,messages:[{role:"user",content:prompt}]})
    });
    
    let body = "뉴스레터 생성 실패";
    if(cr.ok){
      const cj = await cr.json();
      body = (cj.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("") || body;
    }
    
    const msg = "📰 주간 M&A/IB/PE 뉴스레터 ("+today+")\n\n"+body+"\n\n🔄 다음 뉴스레터: 다음 주 월요일 오전 8시";
    const tg = await fetch("https://api.telegram.org/bot"+TG_TOKEN+"/sendMessage",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({chat_id:TG_CHAT_ID,text:msg.substring(0,4096),disable_web_page_preview:true})
    });
    const tj = await tg.json();
    return Response.json({ok:true,telegram_ok:tj.ok,date:today});
  } catch(e) {
    return Response.json({ok:false,error:e.message},{status:500});
  }
}
