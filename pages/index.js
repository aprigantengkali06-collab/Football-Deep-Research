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

const LIVE_STATUSES = ["1H","2H","HT","ET","BT","P","LIVE","INT"];
const DONE_STATUSES = ["FT","AET","PEN","AWD","WO"];
function getStatus(s) {
  if (LIVE_STATUSES.includes(s?.short)) return "live";
  if (DONE_STATUSES.includes(s?.short)) return "done";
  return "upcoming";
}
function toLocalTime(u) {
  return u ? new Date(u).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}) : "--:--";
}
function toLocalDate(u) {
  return u ? new Date(u).toLocaleDateString("id-ID",{day:"numeric",month:"short"}) : "";
}

// ─── Gemini Analysis ──────────────────────────────────────────────────────────
async function fetchAnalysis(home, away, leagueName, lcc) {
  const prompt = `Kamu analis bola. Analisis: ${home} vs ${away} di ${leagueName}.
Cari form terkini, klasemen, H2H, cedera. Lalu isi JSON ini dengan data NYATA (bukan contoh):
{"hF":"[form 5 match home W/D/L]","aF":"[form 5 match away]","hR":[rank home],"aR":[rank away],"hP":[poin home],"aP":[poin away],"h2h":"[hasil H2H terkini]","inj":"[info cedera atau Tidak ada]","ctx":"[konteks match]","swp":[peluang home menang 0-100],"fr":[skor raw 50-95],"ff":[fr dikali ${lcc}],"v":"[CONFIRMED/BORDERLINE/STOP]","o25":[prob over 2.5 gol],"stk":"[2u/1u/Skip]","sum":"[analisis 1-2 kalimat]","ah":"[rekomendasi AH misal -0.5 atau +0.5]","ahConf":"[TINGGI/SEDANG/RENDAH]","ftOU":"[Over/Under X.X]","ftOUConf":"[TINGGI/SEDANG/RENDAH]","htOU":"[Over/Under X.X HT]","htOUConf":"[TINGGI/SEDANG/RENDAH]","ftBTTS":"[Yes/No]","htBTTS":"[Yes/No]","ftResult":"[Home Win/Draw/Away Win]","htResult":"[Home Win/Draw/Away Win]"}
Balas JSON saja, tanpa teks lain.`;

  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error);

  // Bersihkan response dari markdown
  let cleanText = data.text
    .replace(/```json/gi, "").replace(/```/g, "").trim();

  // Coba beberapa cara parse JSON
  let result = null;

  // Cara 1: langsung parse seluruh cleanText
  try { result = JSON.parse(cleanText); } catch(e) {}

  // Cara 2: cari { ... } dengan regex greedy
  if (!result) {
    const m = cleanText.match(/\{[\s\S]+\}/);
    if (m) try { result = JSON.parse(m[0]); } catch(e) {}
  }

  // Cara 3: cari dari { pertama sampai } terakhir
  if (!result) {
    const s = cleanText.indexOf("{");
    const e = cleanText.lastIndexOf("}");
    if (s !== -1 && e !== -1 && e > s) {
      try { result = JSON.parse(cleanText.slice(s, e + 1)); } catch(e2) {}
    }
  }

  if (!result) throw new Error("RAW[" + cleanText + "]RAW");
  // Normalize field names (short -> long)
  result.homeForm = result.homeForm || result.hF || "NNNNN";
  result.awayForm = result.awayForm || result.aF || "NNNNN";
  result.homeRank = result.homeRank || result.hR || 5;
  result.awayRank = result.awayRank || result.aR || 5;
  result.homePts  = result.homePts  || result.hP || 30;
  result.awayPts  = result.awayPts  || result.aP || 30;
  result.headToHead = result.headToHead || result.h2h || "-";
  result.injuries   = result.injuries   || result.inj || "-";
  result.context    = result.context    || result.ctx || "-";
  result.o25    = result.o25  || 55;
  result.fr     = result.fr   || result.swp || 75;
  result.ff     = Math.round(result.fr * lcc);
  result.verdict = result.ff >= 80 ? "CONFIRMED" : result.ff >= 62 ? "BORDERLINE" : "STOP";
  result.stake   = result.ff >= 80 ? "2u" : result.ff >= 62 ? "1u" : "Skip";
  result.summary = result.summary || result.sum || "-";
  result.ah       = result.ah || "-0.5";
  result.ahConf   = result.ahConf || "SEDANG";
  result.ftOU     = result.ftOU || "Over 2.5";
  result.ftOUConf = result.ftOUConf || "SEDANG";
  result.htOU     = result.htOU || "Under 1.5";
  result.htOUConf = result.htOUConf || "SEDANG";
  result.ftBTTS   = result.ftBTTS || "-";
  result.htBTTS   = result.htBTTS || "-";
  result.ftResult = result.ftResult || "-";
  result.htResult = result.htResult || "-";
  return result;
}

// ─── Analysis Panel ───────────────────────────────────────────────────────────
function AnalysisPanel({ home, away, leagueName, lcc, status }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const doAnalysis = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetchAnalysis(home, away, leagueName, lcc);
      setResult(r);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (!result && !loading && !error) return (
    <div style={{padding:"14px",borderTop:"1px solid #1e293b",background:"#07111c",textAlign:"center"}}>
      {status === "done" && <div style={{fontSize:10,color:"#475569",marginBottom:8}}>Match selesai — analisis pra-pertandingan</div>}
      <button onClick={doAnalysis} style={{background:"linear-gradient(135deg,#1e3a8a,#2563eb)",border:"none",borderRadius:8,color:"#fff",padding:"10px 24px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
        🤖 Analisis FDRM dengan AI
      </button>
      <div style={{fontSize:9,color:"#374151",marginTop:6}}>Gemini AI · ~15 detik</div>
    </div>
  );

  if (loading) return (
    <div style={{padding:"20px",borderTop:"1px solid #1e293b",background:"#07111c",textAlign:"center"}}>
      <div style={{fontSize:11,color:"#60a5fa",marginBottom:4}}>🔍 AI sedang analisis pertandingan...</div>
      <div style={{fontSize:9,color:"#374151",marginBottom:12}}>Form · Klasemen · H2H · Cedera</div>
      <div style={{display:"flex",gap:5,justifyContent:"center"}}>
        {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:"#2563eb",animation:`pulse 1.2s ${i*0.25}s infinite`}}/>)}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:0.2;transform:scale(0.7)}50%{opacity:1;transform:scale(1.3)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{padding:"12px 14px",borderTop:"1px solid #dc2626",background:"#07111c"}}>
      <div style={{color:"#f87171",fontSize:11,marginBottom:8}}>❌ {error}</div>
      <button onClick={doAnalysis} style={{background:"#0a1628",border:"1px solid #374151",borderRadius:6,color:"#94a3b8",padding:"6px 14px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Coba lagi</button>
    </div>
  );

  const vc = result.verdict==="CONFIRMED"?"#4ade80":result.verdict==="BORDERLINE"?"#fbbf24":"#f87171";
  const vb = result.verdict==="CONFIRMED"?"#052e16":result.verdict==="BORDERLINE"?"#1a1200":"#1c0606";

  return (
    <div style={{padding:"12px 14px",borderTop:"1px solid #1e293b",background:"#07111c"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
        <span style={{fontSize:9,background:"#1e3a8a",color:"#93c5fd",padding:"2px 8px",borderRadius:6,fontWeight:700}}>🤖 AI ANALYSIS</span>
        <span style={{fontSize:9,color:"#374151"}}>Gemini · LCC {lcc}</span>
      </div>

      <div style={{textAlign:"center",marginBottom:14}}>
        <div style={{display:"inline-block",background:vb,border:`2px solid ${vc}`,borderRadius:12,padding:"8px 24px"}}>
          <div style={{fontSize:9,color:"#64748b",marginBottom:2}}>FDRM VERDICT</div>
          <div style={{fontSize:22,fontWeight:900,color:vc}}>{result.verdict}</div>
          <div style={{fontSize:10,color:vc,marginTop:2}}>Stake {result.stake}</div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
        {[{l:"FDRM Raw",v:(result.fr||0)+"%",c:"#94a3b8"},{l:"FDRM Final",v:result.ff+"%",c:vc},{l:"O2.5 Est",v:(result.o25||0)+"%",c:"#60a5fa"}].map(x=>(
          <div key={x.l} style={{background:"#0a1628",borderRadius:6,padding:8,textAlign:"center"}}>
            <div style={{fontSize:8,color:"#475569",marginBottom:2}}>{x.l}</div>
            <div style={{fontSize:18,fontWeight:800,color:x.c}}>{x.v}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
        {[{label:home,form:result.homeForm,rank:result.homeRank,pts:result.homePts},{label:away,form:result.awayForm,rank:result.awayRank,pts:result.awayPts}].map(t=>(
          <div key={t.label} style={{background:"#0a1628",borderRadius:6,padding:8}}>
            <div style={{fontSize:8,color:"#475569",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.label}</div>
            <div style={{fontSize:9,color:"#64748b",marginBottom:4}}>#{t.rank} · {t.pts} pts</div>
            <div style={{display:"flex",gap:2}}>
              {(t.form||"").split("").map((c,i)=>(
                <span key={i} style={{fontSize:9,fontWeight:700,color:c==="W"?"#4ade80":c==="L"?"#f87171":"#fbbf24",background:c==="W"?"#052e16":c==="L"?"#1c0606":"#1a1200",padding:"2px 4px",borderRadius:3}}>{c}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {[{ic:"📊",l:"H2H",v:result.headToHead},{ic:"🏥",l:"Cedera",v:result.injuries},{ic:"🎯",l:"Konteks",v:result.context}].map(item=>(
        item.v&&<div key={item.l} style={{background:"#0a1628",borderRadius:6,padding:"7px 10px",marginBottom:6,display:"flex",gap:8}}>
          <span>{item.ic}</span>
          <div><span style={{fontSize:9,color:"#475569"}}>{item.l}: </span><span style={{fontSize:10,color:"#94a3b8"}}>{item.v}</span></div>
        </div>
      ))}

      {result.summary&&(
        <div style={{background:"#0d1f38",border:"1px solid #1e3a5f",borderRadius:8,padding:"10px 12px",marginTop:8}}>
          <div style={{fontSize:9,color:"#60a5fa",fontWeight:700,marginBottom:4}}>📝 RINGKASAN</div>
          <div style={{fontSize:11,color:"#cbd5e1",lineHeight:1.7}}>{result.summary}</div>
        </div>
      )}

      {/* Betting Markets */}
      <div style={{marginTop:10}}>
        <div style={{fontSize:9,fontWeight:700,color:"#ca8a04",letterSpacing:1.5,marginBottom:6}}>🎯 REKOMENDASI TARUHAN</div>

        {/* FT */}
        <div style={{fontSize:9,color:"#475569",fontWeight:700,marginBottom:4}}>FULL TIME</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
          {[
            {label:"1X2 FT",val:result.ftResult,conf:null,c:"#60a5fa"},
            {label:"AH FT",val:result.ah,conf:result.ahConf,c:"#a78bfa"},
            {label:"O/U FT",val:result.ftOU,conf:result.ftOUConf,c:"#4ade80"},
            {label:"BTTS FT",val:result.ftBTTS,conf:null,c:"#fb923c"},
          ].map(x=>(
            <div key={x.label} style={{background:"#0a1628",borderRadius:6,padding:"7px 8px"}}>
              <div style={{fontSize:8,color:"#475569",marginBottom:2}}>{x.label}</div>
              <div style={{fontSize:12,fontWeight:700,color:x.c}}>{x.val}</div>
              {x.conf&&<div style={{fontSize:8,color:"#374151",marginTop:1}}>{x.conf}</div>}
            </div>
          ))}
        </div>

        {/* HT */}
        <div style={{fontSize:9,color:"#475569",fontWeight:700,marginBottom:4}}>HALF TIME</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {[
            {label:"1X2 HT",val:result.htResult,conf:null,c:"#60a5fa"},
            {label:"O/U HT",val:result.htOU,conf:result.htOUConf,c:"#4ade80"},
            {label:"BTTS HT",val:result.htBTTS,conf:null,c:"#fb923c"},
            {label:"FDRM",val:result.verdict,conf:"LCC "+lcc,c:result.verdict==="CONFIRMED"?"#4ade80":result.verdict==="BORDERLINE"?"#fbbf24":"#f87171"},
          ].map(x=>(
            <div key={x.label} style={{background:"#0a1628",borderRadius:6,padding:"7px 8px"}}>
              <div style={{fontSize:8,color:"#475569",marginBottom:2}}>{x.label}</div>
              <div style={{fontSize:12,fontWeight:700,color:x.c}}>{x.val}</div>
              {x.conf&&<div style={{fontSize:8,color:"#374151",marginTop:1}}>{x.conf}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Match Card ───────────────────────────────────────────────────────────────
function MatchCard({ fixture, leagueName, lcc }) {
  const [open, setOpen] = useState(false);
  const status = getStatus(fixture.fixture.status);
  const score = fixture.goals;
  const elapsed = fixture.fixture.status.elapsed;
  const bc = status==="live"?"#ef4444":status==="done"?"#1e293b":"#1e3a5f";

  return (
    <div style={{background:"#0d1b2a",borderRadius:10,marginBottom:8,border:`1px solid ${bc}`,overflow:"hidden"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{cursor:"pointer",padding:"12px 14px",background:status==="live"?"#200a0a":"#0d1b2a"}}>
        <div style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
          {status==="live"&&<span style={{fontSize:10,background:"#dc2626",color:"#fff",padding:"2px 8px",borderRadius:8,fontWeight:700}}>🔴 LIVE {elapsed?elapsed+"'":""}</span>}
          {status==="done"&&<span style={{fontSize:10,background:"#1e293b",color:"#64748b",padding:"2px 8px",borderRadius:8}}>✔ Selesai</span>}
          {status==="upcoming"&&<span style={{fontSize:10,background:"#0a1628",color:"#60a5fa",padding:"2px 8px",borderRadius:8}}>🕐 {toLocalTime(fixture.fixture.date)} · {toLocalDate(fixture.fixture.date)}</span>}
          <span style={{marginLeft:"auto",fontSize:10,color:"#475569"}}>{open?"▲":"▼"} 🤖</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 60px 1fr",alignItems:"center",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"flex-end"}}>
            <span style={{fontSize:12,fontWeight:700,color:"#e2e8f0",textAlign:"right"}}>{fixture.teams.home.name}</span>
            <img src={fixture.teams.home.logo} alt="" style={{width:28,height:28,objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
          </div>
          <div style={{textAlign:"center"}}>
            {(status==="live"||status==="done")
              ?<div style={{fontSize:20,fontWeight:900,color:"#f1f5f9"}}>{score.home??0}–{score.away??0}</div>
              :<div style={{fontSize:12,color:"#475569",fontWeight:700}}>vs</div>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <img src={fixture.teams.away.logo} alt="" style={{width:28,height:28,objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
            <span style={{fontSize:12,fontWeight:700,color:"#e2e8f0"}}>{fixture.teams.away.name}</span>
          </div>
        </div>
      </div>
      {open&&<AnalysisPanel home={fixture.teams.home.name} away={fixture.teams.away.name} leagueName={leagueName} lcc={lcc} status={status}/>}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [fixtures, setFixtures]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchLeague = useCallback(async (league) => {
    setSelectedLeague(league);
    setLoading(true);
    setError(null);
    setFixtures([]);
    try {
      const now = Date.now();
      const in12h = now + 12 * 3600000;
      const d1 = new Date(now).toISOString().slice(0,10);
      const d2 = new Date(in12h).toISOString().slice(0,10);
      const dates = d1 === d2 ? [d1] : [d1, d2];

      const [liveRes, ...dateResults] = await Promise.all([
        fetch(`/api/football?endpoint=fixtures&live=all&league=${league.id}`).then(r=>r.json()),
        ...dates.map(d => fetch(`/api/football?endpoint=fixtures&league=${league.id}&date=${d}`).then(r=>r.json()))
      ]);

      const liveF = liveRes.response || [];
      const dateF = dateResults.flatMap(r => r.response || []);

      const seen = new Set();
      const merged = [...liveF, ...dateF]
        .filter(f => {
          if (seen.has(f.fixture.id)) return false;
          seen.add(f.fixture.id);
          // Tampilkan: live, atau kickoff dalam 12 jam ke depan, atau baru selesai
          const t = new Date(f.fixture.date).getTime();
          const status = f.fixture.status?.short;
          const isLive = ["1H","2H","HT","ET","BT","P","LIVE","INT"].includes(status);
          const isDone = ["FT","AET","PEN"].includes(status);
          return isLive || isDone || (t >= now && t <= in12h);
        })
        .sort((a,b) => new Date(a.fixture.date) - new Date(b.fixture.date));

      if (merged.length === 0 && liveRes.errors?.requests) {
        setError("Quota API-Football habis. Reset jam 07:00 WIB.");
      } else {
        setFixtures(merged);
        setLastUpdate(new Date());
      }
    } catch(e) {
      setError("Gagal: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const liveCount = fixtures.filter(f=>getStatus(f.fixture.status)==="live").length;

  return (
    <div style={{fontFamily:"system-ui,Arial,sans-serif",background:"#050d17",minHeight:"100vh",color:"#e2e8f0"}}>
      <div style={{background:"linear-gradient(135deg,#0a1628,#0d1f38)",borderBottom:"2px solid #ca8a04",padding:"12px 14px",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:600,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <span style={{fontSize:18,fontWeight:800,color:"#f1f5f9"}}>⚽ FDRM </span>
            <span style={{fontSize:18,fontWeight:800,color:"#ca8a04"}}>v5.0</span>
            <div style={{fontSize:10,color:"#475569"}}>API-Football + Gemini AI · Vercel</div>
          </div>
          {liveCount>0&&<span style={{fontSize:10,background:"#dc2626",color:"#fff",padding:"4px 12px",borderRadius:16,fontWeight:700}}>🔴 {liveCount} LIVE</span>}
        </div>
      </div>

      <div style={{maxWidth:600,margin:"0 auto",padding:"12px 14px"}}>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:700,color:"#ca8a04",letterSpacing:1.5,marginBottom:10}}>🌍 PILIH LIGA</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {LEAGUES.map(l=>{
              const isActive=selectedLeague?.id===l.id;
              return(
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

        {error&&<div style={{background:"#1c0606",border:"1px solid #dc2626",borderRadius:8,padding:12,marginBottom:12,color:"#fca5a5",fontSize:12}}>⚠️ {error}</div>}
        {loading&&<div style={{textAlign:"center",padding:"30px 0",color:"#475569"}}><div style={{fontSize:28,marginBottom:8}}>⚽</div><div style={{fontSize:13}}>Mengambil jadwal {selectedLeague?.name}...</div></div>}

        {!loading&&fixtures.length>0&&(
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#ca8a04",letterSpacing:1.5,marginBottom:10,display:"flex",justifyContent:"space-between"}}>
              <span>📋 {selectedLeague?.name} · {fixtures.length} Match</span>
              {lastUpdate&&<span style={{color:"#374151",fontWeight:400}}>Update {lastUpdate.toLocaleTimeString("id-ID")}</span>}
            </div>
            {fixtures.map(f=><MatchCard key={f.fixture.id} fixture={f} leagueName={selectedLeague?.name||""} lcc={selectedLeague?.lcc||0.80}/>)}
          </div>
        )}

        {!loading&&!error&&selectedLeague&&fixtures.length===0&&(
          <div style={{textAlign:"center",padding:"40px 0",color:"#374151"}}>
            <div style={{fontSize:32,marginBottom:8}}>📭</div>
            <div style={{fontSize:13}}>Tidak ada pertandingan mendatang untuk {selectedLeague.name}</div>
          </div>
        )}

        {!loading&&!selectedLeague&&(
          <div style={{textAlign:"center",padding:"40px 0",color:"#374151"}}>
            <div style={{fontSize:32,marginBottom:8}}>👆</div>
            <div style={{fontSize:13}}>Pilih liga untuk melihat pertandingan</div>
            <div style={{fontSize:10,marginTop:4}}>Klik pertandingan → analisis FDRM oleh Gemini AI</div>
          </div>
        )}

        <div style={{background:"#07111c",border:"1px solid #1e293b",borderRadius:8,padding:10,fontSize:9,color:"#374151",marginTop:12,textAlign:"center"}}>
          ⚠️ FDRM v5.0 alat bantu analisis. Bukan jaminan. · API-Football + Gemini AI
        </div>
      </div>
    </div>
  );
}
