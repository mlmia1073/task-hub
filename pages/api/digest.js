export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { overdue, dueToday, upcoming, pending } = req.body;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        system: `You are a sharp executive assistant for Mickey, who works in business development and partner/customer success at Simpro (field service management software). Write a concise, warm but direct daily briefing in plain text — no bullet symbols, no markdown. Clean short paragraphs. Tone: trusted chief of staff. Lead with urgency. Flag blockers. End with one encouraging sentence. Under 200 words.`,
        messages: [{
          role: "user",
          content: `Today: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}. Overdue: ${JSON.stringify(overdue.map(t => t.text))}. Due today: ${JSON.stringify(dueToday.map(t => t.text))}. Upcoming: ${JSON.stringify(upcoming.map(t => t.text))}. Pending from others: ${JSON.stringify(pending.map(t => ({ task: t.text, who: t.assignee, status: t.status })))}`
        }]
      })
    });
    const data = await response.json();
    const text = data.content?.find(b => b.type === "text")?.text || "Could not generate.";
    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
