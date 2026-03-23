// pages/api/test.js
export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "No key" });

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    const data = await r.json();
    // Ambil nama model saja
    const models = data.models?.map(m => m.name) || data;
    res.status(200).json({ status: r.status, models });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
