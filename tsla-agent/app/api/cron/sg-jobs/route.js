export const dynamic = 'force-dynamic';
const TG_TOKEN = "8696429110:AAF7udUotTwnB2yQ-eSK9ED8KCFbK6A93o4";
const TG_CHAT_ID = "8494338776";
export async function GET() {
  try {
    const today = new Date().toLocaleDateString('ko-KR',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'});
    const prompt = "You are a Singapore finance career assistant for Young Oh (KPMG Singapore Deal Advisory). Today is "+today+" SGT. Write a Telegram message in KOREAN about Singapore M&A/IB/PE job opportunities. Include real career page URLs for: Goldman Sachs (goldmansachs.com/worldwide/singapore/careers), Morgan Stanley, JP Morgan, UBS, Lazard (linkedin.com/company/lazard/jobs), Houlihan Lokey (linkedin.com/company/houlihan-lokey/jobs), KKR (linkedin.com/company/kkr/jobs), Temasek (temasek.com.sg/careers), GIC (gic.careers/location/singapore), KPMG (careers.kpmg.com.sg), PwC (pwc.com/sg/careers). Also include LinkedIn search: sg.linkedin.com/jobs/investment-banking-jobs and sg.linkedin.com/jobs/mergers-and-acquisitions-jobs and sg.linkedin.com/jobs/private-equity-jobs. Top 3 picks for Young (KPMG internal move most realistic). Max 3800 chars.";
    const cr = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:1800,messages:[{role:"user",content:prompt}]})});
    let body="채용 정보 조회 실패";
    if(cr.ok){const cj=await cr.json();body=(cj.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("")||body;}
    const msg="💼 싱가포르 금융 채용 공고 ("+today+")\n\n"+body+"\n\n🔄 다음 업데이트: 2일 후 오전 8시";
    const tg=await fetch("https://api.telegram.org/bot"+TG_TOKEN+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:TG_CHAT_ID,text:msg.substring(0,4096),disable_web_page_preview:true})});
    const tj=await tg.json();
    return Response.json({ok:true,telegram_ok:tj.ok,date:today});
  }catch(e){return Response.json({ok:false,error:e.message},{status:500});}
}
