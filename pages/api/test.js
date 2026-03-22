// pages/api/test.js
export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "No key" });

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Balas dengan: OK" }] }],
          generationConfig: { maxOutputTokens: 10 }
        })
      }
    );
    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    res.status(200).json({ ok: true, geminiReply: text, status: r.status });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
