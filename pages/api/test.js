// pages/api/test.js
// Endpoint test - hapus setelah debugging selesai
export default async function handler(req, res) {
  const geminiKey = process.env.GEMINI_API_KEY;
  res.status(200).json({
    ok: true,
    hasGeminiKey: !!geminiKey,
    keyPrefix: geminiKey ? geminiKey.slice(0, 8) + "..." : "NOT SET",
    timestamp: new Date().toISOString()
  });
}
