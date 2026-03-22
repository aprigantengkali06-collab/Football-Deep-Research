// pages/api/football.js
// Proxy ke API-Football — API key TIDAK terekspos ke browser

export default async function handler(req, res) {
  const { endpoint, ...params } = req.query;

  if (!endpoint) {
    return res.status(400).json({ error: "endpoint required" });
  }

  // Whitelist endpoint yang boleh diakses
  const allowed = ["fixtures", "standings", "leagues", "teams/statistics"];
  if (!allowed.includes(endpoint)) {
    return res.status(403).json({ error: "endpoint tidak diizinkan" });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key belum dikonfigurasi" });
  }

  // Build query string dari params
  const qs = new URLSearchParams(params).toString();
  const url = `https://v3.football.api-sports.io/${endpoint}${qs ? "?" + qs : ""}`;

  try {
    const response = await fetch(url, {
      headers: {
        "x-apisports-key": apiKey,
      },
    });

    const data = await response.json();

    // Cache selama 60 detik untuk hemat kuota
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Gagal fetch API-Football: " + err.message });
  }
}

