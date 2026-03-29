/ 파일 위치: tsla-agent/app/claude/route.js
// 수정: 모델명 claude-3-5-haiku-20241022 → claude-haiku-4-5-20251001
 
export async function POST(req) {
  try {
    const body = await req.json();
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: body.systemPrompt,
        messages: [{ role: "user", content: body.userMessage }],
      }),
    });
    const data = await res.json();
    if (!res.ok) return Response.json({ error: JSON.stringify(data) }, { status: 500 });
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return Response.json({ error: "no json", raw: text.slice(0, 200) }, { status: 500 });
    return Response.json(JSON.parse(match[0]));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
 
