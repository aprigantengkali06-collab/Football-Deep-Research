// pages/api/ai.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "No API key" });
  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: "No prompt" });

  const models = ["gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-2.5-flash"];
  for (const model of models) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 800 }
          })
        }
      );
      const data = await r.json();
      if (r.status === 429 || data?.error?.code === 429) continue;
      if (!r.ok) return res.status(500).json({ error: data?.error?.message });

      const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
      if (!text) continue;

      // Kirim raw text supaya bisa debug
      return res.status(200).json({ text, model, debug: text.slice(0, 300) });
    } catch(e) { continue; }
  }
  return res.status(429).json({ error: "Rate limited." });
}
