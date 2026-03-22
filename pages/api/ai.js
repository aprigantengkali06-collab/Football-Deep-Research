// pages/api/ai.js
// Proxy ke Google Gemini API dengan Google Search grounding

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY belum dikonfigurasi di Vercel" });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt required" });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.1 }
        })
      }
    );

    const data = await response.json();

    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.candidates?.[0]?.content?.parts
      ?.filter(p => p.text)
      ?.map(p => p.text)
      ?.join("") || "";

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: "Gagal konek ke Gemini: " + err.message });
  }
}
