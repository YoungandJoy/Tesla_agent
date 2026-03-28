export async function POST(req) {
  const { systemPrompt, userMessage } = await req.json();

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2500,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  const data = await res.json();

  // 모든 텍스트 블록 합치기
  let text = "";
  if (data.content && Array.isArray(data.content)) {
    for (const block of data.content) {
      if (block.type === "text") {
        text += block.text;
      }
    }
  }

  // JSON 추출
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return Response.json({ error: "JSON not found", raw: text.slice(0, 500) }, { status: 500 });
  }

  try {
    const parsed = JSON.parse(match[0]);
    return Response.json(parsed);
  } catch (e) {
    return Response.json({ error: "Parse failed", raw: match[0].slice(0, 500) }, { status: 500 });
  }
}
