// pages/api/ai.js
export const config = { maxDuration: 60 };

const MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY belum dikonfigurasi" });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt required" });

  // Coba tiap model, skip kalau 429
  for (const model of MODELS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55000);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 1500 }
          })
        }
      );
      clearTimeout(timeout);

      if (response.status === 429) continue; // coba model berikutnya

      const data = await response.json();
      if (data.error) {
        if (data.error.code === 429) continue;
        return res.status(500).json({ error: `${model}: ${data.error.message}` });
      }

      const text = data.candidates?.[0]?.content?.parts
        ?.filter(p => p.text)?.map(p => p.text)?.join("") || "";

      if (!text) continue;

      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ text, model });

    } catch (err) {
      if (err.name === "AbortError") continue;
      continue;
    }
  }

  return res.status(429).json({ error: "Semua model Gemini sedang rate limited. Tunggu 1 menit lalu coba lagi." });
}
