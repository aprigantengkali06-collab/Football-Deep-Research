// pages/api/ai.js - Groq API
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GROQ_API_KEY belum dikonfigurasi" });

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: "No prompt" });

  const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"];

  for (const model of models) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 1000
        })
      });

      const data = await r.json();
      if (r.status === 429) continue;
      if (!r.ok) return res.status(500).json({ error: data?.error?.message || "Groq error" });

      const text = data.choices?.[0]?.message?.content || "";
      if (!text) continue;

      return res.status(200).json({ text });
    } catch(e) { continue; }
  }

  return res.status(429).json({ error: "Rate limited. Coba lagi." });
}
