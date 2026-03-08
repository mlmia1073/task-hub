const SOURCES = ["Paper", "Email", "Apple Notes", "Slack", "Memory", "Other"];
const CATEGORIES = ["Client", "Team / AM", "Partner", "Admin", "Personal", "Follow-Up"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { text } = req.body;
  const today = new Date().toISOString().split("T")[0];
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
        max_tokens: 1000,
        system: `Extract tasks from messy input. Return ONLY a JSON array, no markdown. Each object: { "text": string, "source": one of [${SOURCES.map(s => `"${s}"`).join(",")}], "category": one of [${CATEGORIES.map(c => `"${c}"`).join(",")}], "priority": "high"|"medium"|"low", "dueDate": "${today}", "notes": "" }`,
        messages: [{ role: "user", content: text }]
      })
    });
    const data = await response.json();
    const raw = data.content?.find(b => b.type === "text")?.text || "[]";
    const tasks = JSON.parse(raw.replace(/```json|```/g, "").trim());
    res.status(200).json({ tasks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
