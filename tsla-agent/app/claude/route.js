export async function POST(req) {
  try {
    const { systemPrompt, userMessage } = await req.json();

    // API 키 확인
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return Response.json({ error: JSON.stringify(data) }, { status: 500 });
    }

    const text = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return Response.json({ error: "JSON not found", raw: text.slice(0, 500) }, { status: 500 });
    }

    return Response.json(JSON.parse(match[0]));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
