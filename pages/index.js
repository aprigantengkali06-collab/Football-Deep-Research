// pages/index.js
import { useState, useEffect, useRef, useCallback } from "react";

// ─── Liga & ID API-Football ───────────────────────────────────────────────────
const LEAGUES = [
  { id: 39,  name: "Premier League", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", lcc: 0.88, season: 2024 },
  { id: 140, name: "La Liga",        flag: "🇪🇸", lcc: 0.90, season: 2024 },
  { id: 78,  name: "Bundesliga",     flag: "🇩🇪", lcc: 0.87, season: 2024 },
  { id: 135, name: "Serie A",        flag: "🇮🇹", lcc: 0.85, season: 2024 },
  { id: 61,  name: "Ligue 1",        flag: "🇫🇷", lcc: 0.70, season: 2024 },
  { id: 2,   name: "Champions League",flag: "🏆", lcc: 0.80, season: 2024 },
  { id: 88,  name: "Eredivisie",     flag: "🇳🇱", lcc: 0.82, season: 2024 },
  { id: 94,  name: "Primeira Liga",  flag: "🇵🇹", lcc: 0.83, season: 2024 },
  { id: 128, name: "Liga Argentina", flag: "🇦🇷", lcc: 0.72, season: 2024 },
];

// ─── Status fixture dari API-Football ────────────────────────────────────────
const LIVE_STATUSES   = ["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT"];
const DONE_STATUSES   = ["FT", "AET", "PEN", "AWD", "WO"];
const SCHED_STATUSES  = ["NS", "TBD", "PST", "CANC", "ABD", "SUP"];

// ─── FDRM logic ──────────────────────────────────────────────────────────────
function calcFDRM(fixture, standings) {
  const lcc = LEAGUES.find(l => l.id === fixture.league.id)?.lcc || 0.75;

  const hTeamId = fixture.teams.home.id;
  const aTeamId = fixture.teams.away.id;

  // Cari standing
  const allStandings = standings?.flat() || [];
  const hStand = allStandings.find(s => s.team.id === hTeamId);
  const aStand = allStandings.find(s => s.team.id === aTeamId);

  const hRk  = hStand?.rank  || 10;
  const aRk  = aStand?.rank  || 10;
  const hPts = hStand?.points || 30;
  const aPts = aStand?.points || 30;
  const gw   = hStand?.description ? (hStand.all?.played || 25) : 25;

  // Gate 1: SMI — skip early gameweeks
  const smi = gw >= 10;

  // Gate 2: Derby — skip if same city (rough estimate by name similarity)
  const hCity = fixture.teams.home.name.split(" ")[0];
  const aCity = fixture.teams.away.name.split(" ")[0];
  const derby = hCity === aCity;

  // Gate 3: SWP — home win probability based on rank & pts diff
  const rankDiff = aRk - hRk; // positive = home is higher ranked
  const ptsDiff  = hPts - aPts;
  const rawSWP   = 50 + rankDiff * 1.5 + ptsDiff * 0.3;
  const swp      = Math.min(85, Math.max(20, rawSWP));
  const swpPass  = swp >= 65 ? true : swp >= 62 ? null : false;

  // Gate 4: UPV — upvote (simplified: home not on 3-match losing streak)
  // We don't have full form from API, so estimate from standing
  const hForm = hStand?.form || "WWDLL";
  const last3 = hForm.slice(-3);
  const upv   = last3.includes("W");

  // Gate 6: MSF — market stability (always true for top leagues)
  const msf = true;

  // Skip conditions
  if (!smi || derby) {
    return { skip: true, derby, smi, swp, swpPass, upv, msf, lcc, fr: 0, ff: 0, verdict: "SKIP", o25: 45, confidence: "RENDAH" };
  }
  if (swpPass === false || !upv) {
    return { skip: true, derby, smi, swp, swpPass, upv, msf, lcc, fr: 0, ff: 0, verdict: "STOP", o25: 45, confidence: "RENDAH" };
  }

  // Raw FDRM score
  const fr = Math.min(95, Math.max(50,
    swp * 0.5 +
    (upv  ? 10 : 0) +
    (msf  ? 5  : 0) +
    (swpPass === true ? 10 : 5) +
    20
  ));

  const ff = Math.round(fr * lcc);

  let verdict, confidence;
  if (ff >= 80)       { verdict = "CONFIRMED"; confidence = "TINGGI"; }
  else if (ff >= 62)  { verdict = "BORDERLINE"; confidence = "SEDANG"; }
  else                { verdict = "STOP"; confidence = "RENDAH"; }

  // Over 2.5 probability (Poisson-based estimate)
  const lambda = 2.5 + (rankDiff * 0.05) + (ptsDiff * 0.01);
  const o25 = Math.round((1 - Math.exp(-lambda) * (1 + lambda + lambda * lambda / 2)) * 100);

  return { skip: false, derby, smi, swp: Math.round(swp), swpPass, upv, msf, lcc, fr: Math.round(fr), ff, verdict, o25: Math.min(90, Math.max(30, o25)), confidence };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toWIB(utcDateStr) {
  if (!utcDateStr) return "--:--";
  const d = new Date(utcDateStr);
  d.setHours(d.getHours() + 7);
  return d.toISOString().slice(11, 16);
}

function todayWIB() {
  const d = new Date(Date.now() + 7 * 3600000);
  return d.toISOString().slice(0, 10);
}

function getStatus(s) {
  if (LIVE_STATUSES.includes(s?.short)) return "live";
  if (DONE_STATUSES.includes(s?.short)) return "done";
  return "upcoming";
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function Badge({ label, color, bg, border }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
      color, background: bg, border: `1px solid ${border}`
    }}>{label}</span>
  );
}

function VerdictBadge({ verdict }) {
  if (verdict === "CONFIRMED")  return <Badge label="✅ CONFIRMED" color="#4ade80" bg="#052e16" border="#16a34a" />;
  if (verdict === "BORDERLINE") return <Badge label="⚠️ BORDERLINE" color="#fbbf24" bg="#1a1200" border="#ca8a04" />;
  if (verdict === "SKIP")       return <Badge label="⛔ SKIP" color="#f87171" bg="#1c0606" border="#dc2626" />;
  return <Badge label="🚫 STOP" color="#f87171" bg="#1c0606" border="#dc2626" />;
}

function MatchCard({ fixture, standings, leagueName }) {
  const [open, setOpen] = useState(false);
  const status = getStatus(fixture.fixture.status);
  const fdrm   = calcFDRM(fixture, standings);
  const elapsed = fixture.fixture.status.elapsed;
  const score  = fixture.goals;
  const lcc    = LEAGUES.find(l => l.id === fixture.league.id)?.lcc || 0.75;

  const borderColor = status === "live" ? "#ef4444"
    : fdrm.verdict === "CONFIRMED" ? "#16a34a"
    : fdrm.verdict === "BORDERLINE" ? "#ca8a04"
    : "#1e293b";

  return (
    <div style={{
      background: "#0d1b2a", borderRadius: 10, marginBottom: 10,
      border: `1px solid ${borderColor}`, overflow: "hidden"
    }}>
      {/* Header */}
      <div onClick={() => setOpen(o => !o)} style={{
        padding: "9px 12px", cursor: "pointer",
        background: status === "live" ? "#200a0a" : fdrm.verdict === "CONFIRMED" ? "#071a0e" : "#0d1b2a",
        display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: "#94a3b8", background: "#07111c", padding: "1px 7px", borderRadius: 8 }}>
            {toWIB(fixture.fixture.date)} WIB
          </span>
          <span style={{ fontSize: 10, color: "#64748b" }}>{leagueName}</span>
          {status === "live" && (
            <span style={{ fontSize: 10, color: "#fff", background: "#dc2626", padding: "1px 8px", borderRadius: 8, fontWeight: 700 }}>
              🔴 LIVE {elapsed ? elapsed + "'" : ""}
            </span>
          )}
          {status === "done" && (
            <span style={{ fontSize: 10, color: "#94a3b8", background: "#1e293b", padding: "1px 7px", borderRadius: 8 }}>
              ✔ FT
            </span>
          )}
          {!fdrm.skip && status !== "done" && <VerdictBadge verdict={fdrm.verdict} />}
          {fdrm.derby && <Badge label="⚠️ DERBY" color="#fca5a5" bg="#2d0a0a" border="#dc2626" />}
        </div>
        <span style={{ color: "#475569", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </div>

      {/* Scoreboard */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 80px 1fr",
        padding: "10px 12px", background: "#07111c", alignItems: "center"
      }}>
        <div style={{ textAlign: "right" }}>
          <img src={fixture.teams.home.logo} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginTop: 4 }}>{fixture.teams.home.name}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          {(status === "live" || status === "done") ? (
            <div style={{ fontSize: 22, fontWeight: 900, color: "#f1f5f9", letterSpacing: 2 }}>
              {score.home ?? 0} – {score.away ?? 0}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#475569", fontWeight: 700 }}>vs</div>
          )}
          <div style={{ fontSize: 9, color: "#ca8a04", marginTop: 2 }}>LCC {lcc}</div>
        </div>
        <div style={{ textAlign: "left" }}>
          <img src={fixture.teams.away.logo} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginTop: 4 }}>{fixture.teams.away.name}</div>
        </div>
      </div>

      {/* Detail FDRM */}
      {open && !fdrm.skip && status !== "done" && (
        <div style={{ padding: "10px 12px", borderTop: "1px solid #1e293b" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            {[
              { label: "FDRM Raw", val: fdrm.fr + "%", color: "#94a3b8" },
              { label: "FDRM Final", val: fdrm.ff + "%", color: fdrm.ff >= 80 ? "#4ade80" : fdrm.ff >= 62 ? "#fbbf24" : "#f87171" },
              { label: "O2.5 Est", val: fdrm.o25 + "%", color: "#60a5fa" },
            ].map(item => (
              <div key={item.label} style={{ background: "#0a1628", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 8, color: "#475569", marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: item.color }}>{item.val}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {[
              { gate: "G1 SMI",   pass: fdrm.smi,     val: "GW OK" },
              { gate: "G2 Derby", pass: !fdrm.derby,   val: fdrm.derby ? "Derby!" : "No" },
              { gate: "G3 SWP",   pass: fdrm.swpPass,  val: fdrm.swp + "%" },
              { gate: "G4 UPV",   pass: fdrm.upv,      val: fdrm.upv ? "OK" : "Losing" },
              { gate: "G6 MSF",   pass: fdrm.msf,      val: "Stable" },
            ].map(g => {
              const col = g.pass === true ? { bg:"#052e16",br:"#16a34a",ic:"✅",tx:"#4ade80" }
                        : g.pass === false ? { bg:"#1c0606",br:"#dc2626",ic:"❌",tx:"#f87171" }
                        : { bg:"#1a1200",br:"#ca8a04",ic:"⚠️",tx:"#fbbf24" };
              return (
                <div key={g.gate} style={{ background: col.bg, border: `1px solid ${col.br}`, borderRadius: 6, padding: "5px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: col.tx }}>{col.ic} {g.gate}</span>
                  <span style={{ fontSize: 9, color: col.tx, fontWeight: 700 }}>{g.val}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PickCard({ fixture, standings, rank, leagueName }) {
  const fdrm = calcFDRM(fixture, standings);
  const status = getStatus(fixture.fixture.status);
  if (fdrm.skip || fdrm.verdict === "STOP" || status === "done") return null;

  const stake = fdrm.ff >= 80 ? "2u" : "1u";
  const borderColor = fdrm.ff >= 80 ? "#16a34a" : "#ca8a04";
  const confColor   = fdrm.ff >= 80 ? "#4ade80" : "#fbbf24";

  return (
    <div style={{ background: "#0d1b2a", borderRadius: 10, marginBottom: 10, border: `2px solid ${borderColor}`, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: borderColor }}>#{rank}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>
              {fixture.teams.home.name} vs {fixture.teams.away.name}
            </span>
          </div>
          <div style={{ fontSize: 10, color: "#64748b" }}>{toWIB(fixture.fixture.date)} WIB · {leagueName}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: confColor, background: confColor + "22", padding: "2px 10px", borderRadius: 8 }}>
            {fdrm.confidence}
          </div>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 3 }}>FDRM {fdrm.ff}%</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
        {[
          { label: "1X2", val: "Home", sub: "Win" },
          { label: "O/U", val: "O2.5", sub: fdrm.o25 + "% prob" },
          { label: "STAKE", val: stake, sub: fdrm.ff >= 80 ? "STRONG" : "NORMAL" },
        ].map(item => (
          <div key={item.label} style={{ background: "#07111c", borderRadius: 8, padding: "8px", textAlign: "center" }}>
            <div style={{ fontSize: 8, color: "#475569", marginBottom: 3 }}>{item.label}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: item.label === "STAKE" ? "#fbbf24" : item.label === "O/U" ? "#4ade80" : "#60a5fa" }}>{item.val}</div>
            <div style={{ fontSize: 8, color: "#475569", marginTop: 2 }}>{item.sub}</div>
          </div>
        ))}
      </div>

      {status === "live" && (
        <div style={{ marginTop: 8, background: "#200a0a", border: "1px solid #dc2626", borderRadius: 6, padding: "5px 10px", fontSize: 10, color: "#fca5a5" }}>
          🔴 SEDANG BERLANGSUNG · Menit {fixture.fixture.status.elapsed || "?"}
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [date, setDate]         = useState(todayWIB);
  const [selLeagues, setSelLeagues] = useState([39, 140, 135]); // EPL, La Liga, Serie A default
  const [fixtures, setFixtures] = useState([]);
  const [standings, setStandings] = useState({});
  const [loading, setLoading]   = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError]       = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef(null);

  // Fetch fixtures untuk semua liga yang dipilih
  const fetchData = useCallback(async () => {
    if (!selLeagues.length) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch fixtures semua liga paralel
      const fixturePromises = selLeagues.map(leagueId => {
        const league = LEAGUES.find(l => l.id === leagueId);
        return fetch(`/api/football?endpoint=fixtures&league=${leagueId}&season=${league.season}&date=${date}`)
          .then(r => r.json())
          .then(d => d.response || []);
      });

      // Fetch standings semua liga paralel
      const standingPromises = selLeagues.map(leagueId => {
        const league = LEAGUES.find(l => l.id === leagueId);
        return fetch(`/api/football?endpoint=standings&league=${leagueId}&season=${league.season}`)
          .then(r => r.json())
          .then(d => {
            const raw = d.response?.[0]?.league?.standings || [];
            return { leagueId, standings: raw };
          });
      });

      const [allFixtures, allStandings] = await Promise.all([
        Promise.all(fixturePromises),
        Promise.all(standingPromises),
      ]);

      // Gabung semua fixtures, sort by time
      const merged = allFixtures.flat().sort((a, b) =>
        new Date(a.fixture.date) - new Date(b.fixture.date)
      );

      // Map standings per leagueId
      const standingsMap = {};
      allStandings.forEach(({ leagueId, standings }) => {
        standingsMap[leagueId] = standings;
      });

      setFixtures(merged);
      setStandings(standingsMap);
      setLastUpdate(new Date());
    } catch (err) {
      setError("Gagal mengambil data: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [date, selLeagues]);

  // Initial fetch
  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh tiap 60 detik
  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(fetchData, 60000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, fetchData]);

  function toggleLeague(id) {
    setSelLeagues(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  // Filter fixtures: tampilkan live + upcoming, buang yang sudah FT
  const nowWIB = new Date(Date.now() + 7 * 3600000);
  const visibleFixtures = fixtures.filter(f => {
    const status = getStatus(f.fixture.status);
    return status !== "done";
  });

  // Picks = fixture yang lolos FDRM
  const picks = visibleFixtures.filter(f => {
    const fdrm = calcFDRM(f, standings[f.league.id]);
    return !fdrm.skip && fdrm.verdict !== "STOP";
  });

  const hasLive = visibleFixtures.some(f => getStatus(f.fixture.status) === "live");

  return (
    <div style={{ fontFamily: "system-ui, Arial, sans-serif", background: "#050d17", minHeight: "100vh", color: "#e2e8f0" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#0a1628,#0d1f38)", borderBottom: "2px solid #ca8a04", padding: "12px 14px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>⚽ FDRM </span>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#ca8a04" }}>v5.0</span>
            <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>Real-time · API-Football · Vercel</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {hasLive && (
              <span style={{ fontSize: 10, color: "#fff", background: "#dc2626", padding: "3px 10px", borderRadius: 16, fontWeight: 700 }}>
                🔴 LIVE
              </span>
            )}
            <span style={{ fontSize: 10, color: "#94a3b8", background: "#0d1b2a", border: "1px solid #1e293b", padding: "3px 10px", borderRadius: 16 }}>
              {loading ? "🔄 Updating..." : picks.length + " Pick"}
            </span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "12px 14px" }}>
        {/* Konfigurasi */}
        <div style={{ background: "#0d1b2a", borderRadius: 10, padding: 14, border: "1px solid #1e293b", marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#ca8a04", letterSpacing: 1.5, marginBottom: 12 }}>⚙️ KONFIGURASI</div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 9, color: "#475569", display: "block", marginBottom: 4, fontWeight: 700 }}>📅 TANGGAL</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ background: "#07111c", border: "1px solid #1e293b", borderRadius: 6, padding: "8px 10px", color: "#e2e8f0", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          </div>

          <label style={{ fontSize: 9, color: "#475569", display: "block", marginBottom: 6, fontWeight: 700 }}>🌍 PILIH LIGA</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {LEAGUES.map(l => {
              const on = selLeagues.includes(l.id);
              return (
                <button key={l.id} onClick={() => toggleLeague(l.id)} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8,
                  cursor: "pointer", fontFamily: "inherit",
                  border: on ? "2px solid #ca8a04" : "1px solid #1f2d3d",
                  background: on ? "#1a1200" : "#0a1220",
                  color: on ? "#fbbf24" : "#64748b",
                }}>
                  <span style={{ fontSize: 13 }}>{l.flag}</span>
                  <div>
                    <div style={{ fontWeight: on ? 700 : 400, fontSize: 11 }}>{l.name}</div>
                    <div style={{ fontSize: 8, opacity: 0.5 }}>LCC {l.lcc}</div>
                  </div>
                  {on && <span style={{ fontSize: 8, color: "#ca8a04" }}>✓</span>}
                </button>
              );
            })}
          </div>

          {/* Auto-refresh & manual refresh */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={fetchData} disabled={loading} style={{
              flex: 1, padding: "10px", borderRadius: 8, border: "none", color: "white", fontSize: 13,
              fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
              background: loading ? "#0d1b2a" : "linear-gradient(135deg,#1e3a8a,#2563eb)"
            }}>
              {loading ? "🔄 Memuat..." : "🔄 Refresh Sekarang"}
            </button>
            <button onClick={() => setAutoRefresh(a => !a)} style={{
              padding: "10px 14px", borderRadius: 8, border: `1px solid ${autoRefresh ? "#16a34a" : "#374151"}`,
              color: autoRefresh ? "#4ade80" : "#64748b", background: autoRefresh ? "#052e16" : "#0d1b2a",
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap"
            }}>
              {autoRefresh ? "⏱ Auto ON" : "⏱ Auto OFF"}
            </button>
          </div>

          {lastUpdate && (
            <div style={{ fontSize: 9, color: "#374151", marginTop: 8, textAlign: "center" }}>
              Last update: {lastUpdate.toLocaleTimeString("id-ID")} WIB
              {autoRefresh && " · Auto-refresh tiap 60 detik"}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "#1c0606", border: "1px solid #dc2626", borderRadius: 8, padding: 12, marginBottom: 12, color: "#fca5a5", fontSize: 12 }}>
            ❌ <strong>Error:</strong> {error}
          </div>
        )}

        {/* Picks */}
        {picks.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#ca8a04", letterSpacing: 1.5, marginBottom: 10 }}>🏆 FINAL PICKS ({picks.length})</div>
            {picks.map((f, i) => (
              <PickCard
                key={f.fixture.id}
                fixture={f}
                standings={standings[f.league.id]}
                rank={i + 1}
                leagueName={f.league.name}
              />
            ))}
          </div>
        )}

        {/* Semua Match */}
        {visibleFixtures.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#ca8a04", letterSpacing: 1.5, marginBottom: 10 }}>
              📋 SEMUA MATCH ({visibleFixtures.length})
              {fixtures.length > visibleFixtures.length && (
                <span style={{ color: "#374151", marginLeft: 8 }}>
                  · {fixtures.length - visibleFixtures.length} sudah selesai disembunyikan
                </span>
              )}
            </div>
            {visibleFixtures.map(f => (
              <MatchCard
                key={f.fixture.id}
                fixture={f}
                standings={standings[f.league.id]}
                leagueName={f.league.name}
              />
            ))}
          </div>
        )}

        {!loading && visibleFixtures.length === 0 && !error && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#374151" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
            <div style={{ fontSize: 13 }}>Tidak ada pertandingan untuk tanggal ini</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Coba pilih tanggal lain atau tambah liga</div>
          </div>
        )}

        <div style={{ background: "#07111c", border: "1px solid #1e293b", borderRadius: 8, padding: 12, fontSize: 10, color: "#374151", lineHeight: 1.7, marginTop: 12 }}>
          ⚠️ <strong style={{ color: "#ef4444" }}>DISCLAIMER:</strong> FDRM v5.0 alat bantu analisis. Bukan jaminan. Verifikasi odds di bookmaker.
          <br />📡 Data: API-Football · Refresh otomatis tiap 60 detik
        </div>
      </div>
    </div>
  );
}
