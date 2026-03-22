import { useState, useCallback } from "react";

const LEAGUES = [
  { id: 39,  name: "Premier League",   flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", lcc: 0.88 },
  { id: 140, name: "La Liga",          flag: "🇪🇸", lcc: 0.90 },
  { id: 78,  name: "Bundesliga",       flag: "🇩🇪", lcc: 0.87 },
  { id: 135, name: "Serie A",          flag: "🇮🇹", lcc: 0.85 },
  { id: 61,  name: "Ligue 1",          flag: "🇫🇷", lcc: 0.70 },
  { id: 2,   name: "Champions League", flag: "🏆", lcc: 0.80 },
  { id: 3,   name: "Europa League",    flag: "🌍", lcc: 0.78 },
  { id: 88,  name: "Eredivisie",       flag: "🇳🇱", lcc: 0.82 },
  { id: 94,  name: "Primeira Liga",    flag: "🇵🇹", lcc: 0.83 },
  { id: 128, name: "Liga Argentina",   flag: "🇦🇷", lcc: 0.72 },
];

// ─── Fetch jadwal via Claude AI + Web Search ──────────────────────────────────
async function fetchScheduleAI(leagueName) {
  const today = new Date().toLocaleDateString("id-ID", { day:"numeric", month:"long", year:"numeric" });
  const prompt = `Cari jadwal pertandingan ${leagueName} yang SEDANG BERLANGSUNG atau AKAN BERLANGSUNG hari ini dan beberapa hari ke depan (${today}).

Kembalikan HANYA JSON array berikut, tanpa teks lain:
[
  {
    "home": "Nama Tim Kandang",
    "away": "Nama Tim Tandang",
    "time": "HH:MM",
    "date": "DD Mon YYYY",
    "status": "live" | "upcoming" | "done",
    "score": "1-0" | null,
    "elapsed": 45 | null
  }
]

Aturan:
- Urutkan: live dulu, lalu upcoming terdekat
- Waktu dalam zona waktu lokal pertandingan
- Maksimal 10 pertandingan
- Jika tidak ada pertandingan hari ini, ambil yang paling dekat
- Jika status live, isi score dan elapsed
- Jangan tambah teks apapun di luar JSON`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await response.json();
  const fullText = data.content.filter(b => b.type === "text").map(b => b.text).join("");
  const jsonMatch = fullText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Tidak ada jadwal ditemukan");
  return JSON.parse(jsonMatch[0]);
}

// ─── Deep Research untuk 1 pertandingan ──────────────────────────────────────
async function fetchAnalysisAI(home, away, leagueName, lcc) {
  const prompt = `Analisis FDRM untuk pertandingan: ${home} vs ${away} (${leagueName}).

Cari:
1. Form 5 match terakhir masing-masing tim
2. Posisi & poin klasemen terkini
3. Head-to-head terbaru
4. Pemain cedera/absen penting
5. Konteks pertandingan

Kembalikan HANYA JSON ini, tanpa teks lain:
{
  "homeForm": "WWDLW",
  "awayForm": "LWDWL",
  "homeRank": 2,
  "awayRank": 5,
  "homePts": 58,
  "awayPts": 42,
  "gwPlayed": 28,
  "headToHead": "keterangan singkat",
  "injuries": "info cedera penting",
  "context": "konteks pertandingan",
  "swp": 72,
  "fr": 81,
  "ff": ${Math.round(81 * lcc)},
  "verdict": "CONFIRMED",
  "o25": 68,
  "stake": "2u",
  "summary": "Ringkasan analisis 2-3 kalimat dalam Bahasa Indonesia"
}`;

  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  const jsonMatch = data.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Format response tidak valid");
  const result = JSON.parse(jsonMatch[0]);
  // Hitung ff yang benar pakai lcc
  result.ff = Math.round((result.fr || result.swp * 0.8) * lcc);
  result.verdict = result.ff >= 80 ? "CONFIRMED" : result.ff >= 62 ? "BORDERLINE" : "STOP";
  result.stake = result.ff >= 80 ? "2u" : result.ff >= 62 ? "1u" : "Skip";
  return result;
}

// ─── Analysis Panel ───────────────────────────────────────────────────────────
function AnalysisPanel({ home, away, leagueName, lcc }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const doAnalysis = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetchAnalysisAI(home, away, leagueName, lcc);
      setResult(res);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (!result && !loading && !error) {
    return (
      <div style={{padding:"14px",borderTop:"1px solid #1e293b",background:"#07111c",textAlign:"center"}}>
        <button onClick={doAnalysis} style={{background:"linear-gradient(135deg,#1e3a8a,#2563eb)",border:"none",borderRadius:8,color:"#fff",padding:"10px 24px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
          🤖 Analisis FDRM dengan AI
        </button>
        <div style={{fontSize:9,color:"#374151",marginTop:6}}>Gemini AI + Google Search · ~10 detik</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{padding:"20px",borderTop:"1px solid #1e293b",background:"#07111c",textAlign:"center"}}>
        <div style={{fontSize:20,marginBottom:8}}>🔍</div>
        <div style={{fontSize:11,color:"#60a5fa",marginBottom:4}}>AI sedang riset pertandingan...</div>
        <div style={{fontSize:9,color:"#374151",marginBottom:12}}>Form · Klasemen · H2H · Cedera</div>
        <div style={{display:"flex",gap:5,justifyContent:"center"}}>
          {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:"#2563eb",animation:`pulse 1.2s ${i*0.25}s infinite`}}/>)}
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:0.2;transform:scale(0.7)}50%{opacity:1;transform:scale(1.3)}}`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{padding:"12px 14px",borderTop:"1px solid #dc2626",background:"#07111c"}}>
        <div style={{color:"#f87171",fontSize:11,marginBottom:8}}>❌ {error}</div>
        <button onClick={doAnalysis} style={{background:"#0a1628",border:"1px solid #374151",borderRadius:6,color:"#94a3b8",padding:"6px 14px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Coba lagi</button>
      </div>
    );
  }

  const vc = result.verdict==="CONFIRMED"?"#4ade80":result.verdict==="BORDERLINE"?"#fbbf24":"#f87171";
  const vb = result.verdict==="CONFIRMED"?"#052e16":result.verdict==="BORDERLINE"?"#1a1200":"#1c0606";

  return (
    <div style={{padding:"12px 14px",borderTop:"1px solid #1e293b",background:"#07111c"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
        <span style={{fontSize:9,background:"#1e3a8a",color:"#93c5fd",padding:"2px 8px",borderRadius:6,fontWeight:700}}>🤖 AI DEEP RESEARCH</span>
      </div>

      {/* Verdict */}
      <div style={{textAlign:"center",marginBottom:14}}>
        <div style={{display:"inline-block",background:vb,border:`2px solid ${vc}`,borderRadius:12,padding:"8px 24px"}}>
          <div style={{fontSize:9,color:"#64748b",marginBottom:2}}>FDRM VERDICT</div>
          <div style={{fontSize:22,fontWeight:900,color:vc}}>{result.verdict}</div>
          <div style={{fontSize:10,color:vc,marginTop:2}}>Stake {result.stake}</div>
        </div>
      </div>

      {/* Scores */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
        {[{l:"FDRM Raw",v:(result.fr||0)+"%",c:"#94a3b8"},{l:"FDRM Final",v:result.ff+"%",c:vc},{l:"O2.5 Est",v:(result.o25||0)+"%",c:"#60a5fa"}].map(x=>(
          <div key={x.l} style={{background:"#0a1628",borderRadius:6,padding:8,textAlign:"center"}}>
            <div style={{fontSize:8,color:"#475569",marginBottom:2}}>{x.l}</div>
            <div style={{fontSize:18,fontWeight:800,color:x.c}}>{x.v}</div>
          </div>
        ))}
      </div>

      {/* Form */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
        {[{label:home,form:result.homeForm},{label:away,form:result.awayForm}].map(t=>(
          <div key={t.label} style={{background:"#0a1628",borderRadius:6,padding:8}}>
            <div style={{fontSize:8,color:"#475569",marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.label}</div>
            <div style={{display:"flex",gap:3}}>
              {(t.form||"").split("").map((c,i)=>(
                <span key={i} style={{fontSize:10,fontWeight:700,color:c==="W"?"#4ade80":c==="L"?"#f87171":"#fbbf24",background:c==="W"?"#052e16":c==="L"?"#1c0606":"#1a1200",padding:"2px 5px",borderRadius:3}}>{c}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Info */}
      {[{ic:"📊",label:"H2H",val:result.headToHead},{ic:"🏥",label:"Cedera",val:result.injuries},{ic:"🎯",label:"Konteks",val:result.context}].map(item=>(
        item.val&&<div key={item.label} style={{background:"#0a1628",borderRadius:6,padding:"7px 10px",marginBottom:6,display:"flex",gap:8,alignItems:"flex-start"}}>
          <span style={{fontSize:12}}>{item.ic}</span>
          <div><span style={{fontSize:9,color:"#475569"}}>{item.label}: </span><span style={{fontSize:10,color:"#94a3b8"}}>{item.val}</span></div>
        </div>
      ))}

      {/* Summary */}
      {result.summary&&(
        <div style={{background:"#0d1f38",border:"1px solid #1e3a5f",borderRadius:8,padding:"10px 12px",marginTop:8}}>
          <div style={{fontSize:9,color:"#60a5fa",fontWeight:700,marginBottom:4}}>📝 RINGKASAN</div>
          <div style={{fontSize:11,color:"#cbd5e1",lineHeight:1.7}}>{result.summary}</div>
        </div>
      )}
      <div style={{marginTop:10,fontSize:9,color:"#374151",textAlign:"center"}}>LCC {lcc} · Gemini AI + Google Search</div>
    </div>
  );
}

// ─── Match Card ───────────────────────────────────────────────────────────────
function MatchCard({ match, leagueName, lcc }) {
  const [open, setOpen] = useState(false);
  const isLive = match.status === "live";
  const isDone = match.status === "done";
  const bc = isLive ? "#ef4444" : isDone ? "#1e293b" : "#1e3a5f";

  return (
    <div style={{background:"#0d1b2a",borderRadius:10,marginBottom:8,border:`1px solid ${bc}`,overflow:"hidden"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{cursor:"pointer",padding:"12px 14px",background:isLive?"#200a0a":"#0d1b2a"}}>
        <div style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
          {isLive&&<span style={{fontSize:10,background:"#dc2626",color:"#fff",padding:"2px 8px",borderRadius:8,fontWeight:700}}>🔴 LIVE {match.elapsed?match.elapsed+"'":""}</span>}
          {isDone&&<span style={{fontSize:10,background:"#1e293b",color:"#64748b",padding:"2px 8px",borderRadius:8}}>✔ Selesai</span>}
          {!isLive&&!isDone&&<span style={{fontSize:10,background:"#0a1628",color:"#60a5fa",padding:"2px 8px",borderRadius:8}}>🕐 {match.time} · {match.date}</span>}
          <span style={{marginLeft:"auto",fontSize:10,color:"#60a5fa"}}>{open?"▲":"▼"} 🤖</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 70px 1fr",alignItems:"center",gap:8}}>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#e2e8f0"}}>{match.home}</div>
          </div>
          <div style={{textAlign:"center"}}>
            {(isLive||isDone)&&match.score
              ? <div style={{fontSize:20,fontWeight:900,color:"#f1f5f9"}}>{match.score}</div>
              : <div style={{fontSize:12,color:"#475569",fontWeight:700}}>vs</div>}
          </div>
          <div style={{textAlign:"left"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#e2e8f0"}}>{match.away}</div>
          </div>
        </div>
      </div>
      {open && <AnalysisPanel home={match.home} away={match.away} leagueName={leagueName} lcc={lcc} />}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [matches, setMatches]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchLeague = useCallback(async (league) => {
    setSelectedLeague(league);
    setLoading(true);
    setError(null);
    setMatches([]);
    try {
      const result = await fetchScheduleAI(league.name);
      setMatches(result);
      setLastUpdate(new Date());
    } catch(e) {
      setError("Gagal cari jadwal: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const liveCount = matches.filter(m => m.status === "live").length;

  return (
    <div style={{fontFamily:"system-ui,Arial,sans-serif",background:"#050d17",minHeight:"100vh",color:"#e2e8f0"}}>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#0a1628,#0d1f38)",borderBottom:"2px solid #ca8a04",padding:"12px 14px",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:600,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <span style={{fontSize:18,fontWeight:800,color:"#f1f5f9"}}>⚽ FDRM </span>
            <span style={{fontSize:18,fontWeight:800,color:"#ca8a04"}}>v5.0</span>
            <div style={{fontSize:10,color:"#475569"}}>Gemini AI · Real-time · Vercel</div>
          </div>
          {liveCount>0&&<span style={{fontSize:10,background:"#dc2626",color:"#fff",padding:"4px 12px",borderRadius:16,fontWeight:700}}>🔴 {liveCount} LIVE</span>}
        </div>
      </div>

      <div style={{maxWidth:600,margin:"0 auto",padding:"12px 14px"}}>
        {/* Liga Selector */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:700,color:"#ca8a04",letterSpacing:1.5,marginBottom:10}}>🌍 PILIH LIGA</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {LEAGUES.map(l => {
              const isActive = selectedLeague?.id === l.id;
              return (
                <button key={l.id} onClick={()=>fetchLeague(l)} disabled={loading} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,cursor:loading?"not-allowed":"pointer",fontFamily:"inherit",border:isActive?"2px solid #ca8a04":"1px solid #1e293b",background:isActive?"#1a1200":"#0d1b2a",color:isActive?"#fbbf24":"#94a3b8"}}>
                  <span style={{fontSize:20}}>{l.flag}</span>
                  <div style={{textAlign:"left"}}>
                    <div style={{fontWeight:isActive?700:500,fontSize:12}}>{l.name}</div>
                    <div style={{fontSize:9,opacity:0.5}}>LCC {l.lcc}</div>
                  </div>
                  {isActive&&!loading&&<span style={{marginLeft:"auto",fontSize:10,color:"#ca8a04"}}>✓</span>}
                  {isActive&&loading&&<span style={{marginLeft:"auto"}}>⏳</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {error&&<div style={{background:"#1c0606",border:"1px solid #dc2626",borderRadius:8,padding:12,marginBottom:12,color:"#fca5a5",fontSize:12}}>❌ {error}</div>}

        {/* Loading */}
        {loading&&(
          <div style={{textAlign:"center",padding:"40px 0"}}>
            <div style={{fontSize:28,marginBottom:8}}>🔍</div>
            <div style={{fontSize:13,color:"#60a5fa",marginBottom:4}}>AI mencari jadwal {selectedLeague?.name}...</div>
            <div style={{fontSize:10,color:"#374151",marginBottom:16}}>Realtime via web search</div>
            <div style={{display:"flex",gap:5,justifyContent:"center"}}>
              {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:"#2563eb",animation:`pulse 1.2s ${i*0.25}s infinite`}}/>)}
            </div>
            <style>{`@keyframes pulse{0%,100%{opacity:0.2;transform:scale(0.7)}50%{opacity:1;transform:scale(1.3)}}`}</style>
          </div>
        )}

        {/* Matches */}
        {!loading&&matches.length>0&&(
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#ca8a04",letterSpacing:1.5,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>📋 {selectedLeague?.name} · {matches.length} Pertandingan</span>
              {lastUpdate&&<span style={{color:"#374151",fontWeight:400,fontSize:9}}>🤖 {lastUpdate.toLocaleTimeString("id-ID")}</span>}
            </div>
            {matches.map((m,i)=><MatchCard key={i} match={m} leagueName={selectedLeague?.name||""} lcc={selectedLeague?.lcc||0.80}/>)}
          </div>
        )}

        {/* Empty */}
        {!loading&&!error&&selectedLeague&&matches.length===0&&(
          <div style={{textAlign:"center",padding:"40px 0",color:"#374151"}}>
            <div style={{fontSize:32,marginBottom:8}}>📭</div>
            <div style={{fontSize:13}}>Tidak ada pertandingan ditemukan untuk {selectedLeague.name}</div>
          </div>
        )}

        {/* Initial */}
        {!loading&&!selectedLeague&&(
          <div style={{textAlign:"center",padding:"40px 0",color:"#374151"}}>
            <div style={{fontSize:32,marginBottom:8}}>👆</div>
            <div style={{fontSize:13}}>Pilih liga untuk melihat pertandingan</div>
            <div style={{fontSize:10,marginTop:4}}>AI akan cari jadwal live & upcoming secara realtime</div>
          </div>
        )}

        <div style={{background:"#07111c",border:"1px solid #1e293b",borderRadius:8,padding:10,fontSize:9,color:"#374151",marginTop:12,textAlign:"center"}}>
          ⚠️ FDRM v5.0 alat bantu analisis. Bukan jaminan. · Powered by Gemini AI
        </div>
      </div>
    </div>
  );
}
