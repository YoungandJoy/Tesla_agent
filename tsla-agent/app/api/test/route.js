export async function GET() {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  const keyPrefix = hasKey ? process.env.ANTHROPIC_API_KEY.substring(0, 10) + "..." : "NOT SET";
  return Response.json({ hasKey, keyPrefix, status: "ok" });
}
