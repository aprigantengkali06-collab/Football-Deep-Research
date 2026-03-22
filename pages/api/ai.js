// pages/api/ai.js
export const config = { maxDuration: 60 }; // extend timeout ke 60 detik

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY belum dikonfigurasi di Vercel" });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt required" });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1000 }
        })
      }
    );
    clearTimeout(timeout);

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: `Gemini error ${response.status}: ${data.error?.message || JSON.stringify(data)}` });
    }

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const text = data.candidates?.[0]?.content?.parts
      ?.filter(p => p.text)
      ?.map(p => p.text)
      ?.join("") || "";

    if (!text) {
      return res.status(500).json({ error: "Gemini tidak mengembalikan teks. Response: " + JSON.stringify(data).slice(0, 200) });
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ text });
  } catch (err) {
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "Timeout — Gemini terlalu lama merespons" });
    }
    res.status(500).json({ error: "Gagal: " + err.message });
  }
}
