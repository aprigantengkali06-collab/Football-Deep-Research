// pages/api/ai.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY belum dikonfigurasi" });
  }

  const { prompt } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: "prompt required" });
  }

  // Tanpa google_search dulu — cukup pakai pengetahuan Gemini
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1500 }
  };

  // Coba 3 model, fallback jika 429
  const models = ["gemini-1.5-flash-8b", "gemini-1.5-flash", "gemini-2.0-flash"];

  for (const model of models) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      );

      const data = await r.json();

      if (r.status === 429 || data?.error?.code === 429) continue;
      if (!r.ok) return res.status(500).json({ error: data?.error?.message || "Gemini error" });

      const text = data.candidates?.[0]?.content?.parts
        ?.map(p => p.text || "").join("") || "";

      if (!text) continue;

      return res.status(200).json({ text });
    } catch (e) {
      continue;
    }
  }

  return res.status(429).json({ error: "Rate limited. Tunggu 1 menit lalu coba lagi." });
}
