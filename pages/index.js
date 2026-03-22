import { useState, useCallback } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
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
function toLocalTime(u) { return u ? new Date(u).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}) : "--:--"; }
function toLocalDate(u) { return u ? new Date(u).toLocaleDateString("id-ID",{day:"numeric",month:"short"}) : ""; }

// ─── FDRM Logic ───────────────────────────────────────────────────────────────
function calcFDRM(fixture, standings, lcc) {
  const allS = standings?.flat() || [];
  const hS = allS.find(s => s.team.id === fixture.teams.home.id);
  const aS = allS.find(s => s.team.id === fixture.teams.away.id);
  const hRk=hS?.rank||10, aRk=aS?.rank||10;
  const hPts=hS?.points||30, aPts=aS?.points||30;
  const gw=hS?.all?.played||25;
  const smi=gw>=10;
  const derby=fixture.teams.home.name.split(" ")[0]===fixture.teams.away.name.split(" ")[0];
  const rankDiff=aRk-hRk, ptsDiff=hPts-aPts;
  const swp=Math.min(85,Math.max(20,50+rankDiff*1.5+ptsDiff*0.3));
  const swpPass=swp>=65?true:swp>=62?null:false;
  const upv=(hS?.form||"WWDLL").slice(-3).includes("W");
  const msf=true;
  if(!smi||derby||swpPass===false||!upv)
    return{skip:true,derby,smi,swp:Math.round(swp),swpPass,upv,msf,lcc,fr:0,ff:0,verdict:derby?"SKIP":"STOP",o25:45};
  const fr=Math.min(95,Math.max(50,swp*0.5+(upv?10:0)+(msf?5:0)+(swpPass===true?10:5)+20));
  const ff=Math.round(fr*lcc);
  const verdict=ff>=80?"CONFIRMED":ff>=62?"BORDERLINE":"STOP";
  const lambda=2.5+rankDiff*0.05+ptsDiff*0.01;
  const o25=Math.min(90,Math.max(30,Math.round((1-Math.exp(-lambda)*(1+lambda+lambda*lambda/2))*100)));
  return{skip:false,derby,smi,swp:Math.round(swp),swpPass,upv,msf,lcc,fr:Math.round(fr),ff,verdict,o25};
}

// ─── Deep Research via Claude AI ─────────────────────────────────────────────
async function runDeepResearch(homeTeam, awayTeam, leagueName, lcc) {
  const prompt = `Kamu adalah analis sepak bola FDRM. Lakukan deep research untuk pertandingan:
${homeTeam} vs ${awayTeam} (${leagueName})

Cari informasi terkini:
1. Form 5 pertandingan terakhir masing-masing tim
2. Posisi klasemen terkini
3. Head-to-head terbaru
4. Kondisi pemain (cedera/absen)
5. Motivasi & konteks pertandingan

Lalu hitung FDRM dengan format JSON TEPAT ini (tanpa teks lain):
{
  "homeForm": "WWDLW",
  "awayForm": "LWDWL",
  "homeRank": 2,
  "awayRank": 5,
  "homePts": 58,
  "awayPts": 42,
  "gwPlayed": 28,
  "headToHead": "Home unbeaten 3 games",
  "injuries": "Away missing key striker",
  "context": "Derby kota, home butuh poin",
  "swp": 72,
  "fr": 81,
  "ff": ${Math.round(81 * lcc)},
  "verdict": "CONFIRMED",
  "o25": 68,
  "stake": "2u",
  "summary": "Ringkasan analisis 2-3 kalimat dalam Bahasa Indonesia",
  "homeTeam": "${homeTeam}",
  "awayTeam": "${awayTeam}",
  "sources": ["sumber1", "sumber2"]
}`;

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
  // Ambil text dari semua content blocks
  const fullText = data.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");

  // Parse JSON dari response
  const jsonMatch = fullText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Format response tidak valid");
  return JSON.parse(jsonMatch[0]);
}

// ─── Deep Research Panel ──────────────────────────────────────────────────────
function DeepResearchPanel({ fixture, lcc, leagueName }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const doResearch = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await runDeepResearch(
        fixture.teams.home.name,
        fixture.teams.away.name,
        leagueName,
        lcc
      );
      setResult(res);
    } catch(e) {
      setError("Gagal: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!result && !loading && !error) {
    return (
      <div style={{padding:"14px",borderTop:"1px solid #1e3a5f",background:"#07111c",textAlign:"center"}}>
        <div style={{fontSize:11,color:"#60a5fa",marginBottom:10}}>
          🤖 API-Football habis — gunakan Deep Research AI
        </div>
        <button onClick={doResearch} style={{background:"linear-gradient(135deg,#1e3a8a,#2563eb)",border:"none",borderRadius:8,color:"#fff",padding:"10px 20px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
          🔍 Deep Research Sekarang
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{padding:"20px",borderTop:"1px solid #1e3a5f",background:"#07111c",textAlign:"center"}}>
        <div style={{fontSize:24,marginBottom:8}}>🔍</div>
        <div style={{fontSize:12,color:"#60a5fa",marginBottom:4}}>AI sedang riset pertandingan...</div>
        <div style={{fontSize:10,color:"#374151"}}>Mencari form, klasemen, H2H, kondisi pemain</div>
        <div style={{display:"flex",gap:4,justifyContent:"center",marginTop:12}}>
          {[0,1,2].map(i=>(
            <div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#2563eb",animation:`pulse 1.2s ${i*0.2}s infinite`}}/>
          ))}
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1.2)}}`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{padding:"14px",borderTop:"1px solid #dc2626",background:"#07111c"}}>
        <div style={{color:"#f87171",fontSize:11,marginBottom:8}}>❌ {error}</div>
        <button onClick={doResearch} style={{background:"#1e293b",border:"1px solid #374151",borderRadius:6,color:"#94a3b8",padding:"6px 14px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
          Coba lagi
        </button>
      </div>
    );
  }

  const vc = result.verdict==="CONFIRMED"?"#4ade80":result.verdict==="BORDERLINE"?"#fbbf24":"#f87171";
  const vb = result.verdict==="CONFIRMED"?"#052e16":result.verdict==="BORDERLINE"?"#1a1200":"#1c0606";

  return (
    <div style={{padding:"12px 14px",borderTop:"1px solid #1e3a5f",background:"#07111c"}}>
      {/* Badge AI */}
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
        <span style={{fontSize:9,background:"#1e3a8a",color:"#93c5fd",padding:"2px 8px",borderRadius:6,fontWeight:700}}>🤖 AI DEEP RESEARCH</span>
        {result.sources?.length>0&&<span style={{fontSize:9,color:"#374151"}}>{result.sources.length} sumber</span>}
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
        {[{l:"FDRM Raw",v:result.fr+"%",c:"#94a3b8"},{l:"FDRM Final",v:result.ff+"%",c:vc},{l:"O2.5 Est",v:result.o25+"%",c:"#60a5fa"}].map(x=>(
          <div key={x.l} style={{background:"#0a1628",borderRadius:6,padding:8,textAlign:"center"}}>
            <div style={{fontSize:8,color:"#475569",marginBottom:2}}>{x.l}</div>
            <div style={{fontSize:18,fontWeight:800,color:x.c}}>{x.v}</div>
          </div>
        ))}
      </div>

      {/* Form & Research */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <div style={{background:"#0a1628",borderRadius:6,padding:8}}>
          <div style={{fontSize:8,color:"#475569",marginBottom:4}}>FORM {result.homeTeam?.split(" ")[0]}</div>
          <div style={{display:"flex",gap:3}}>
            {(result.homeForm||"").split("").map((c,i)=>(
              <span key={i} style={{fontSize:10,fontWeight:700,color:c==="W"?"#4ade80":c==="L"?"#f87171":"#fbbf24",background:c==="W"?"#052e16":c==="L"?"#1c0606":"#1a1200",padding:"2px 4px",borderRadius:3}}>{c}</span>
            ))}
          </div>
        </div>
        <div style={{background:"#0a1628",borderRadius:6,padding:8}}>
          <div style={{fontSize:8,color:"#475569",marginBottom:4}}>FORM {result.awayTeam?.split(" ")[0]}</div>
          <div style={{display:"flex",gap:3}}>
            {(result.awayForm||"").split("").map((c,i)=>(
              <span key={i} style={{fontSize:10,fontWeight:700,color:c==="W"?"#4ade80":c==="L"?"#f87171":"#fbbf24",background:c==="W"?"#052e16":c==="L"?"#1c0606":"#1a1200",padding:"2px 4px",borderRadius:3}}>{c}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Info */}
      {[{label:"📊 H2H",val:result.headToHead},{label:"🏥 Cedera",val:result.injuries},{label:"🎯 Konteks",val:result.context}].map(item=>(
        item.val&&<div key={item.label} style={{background:"#0a1628",borderRadius:6,padding:"6px 10px",marginBottom:6}}>
          <span style={{fontSize:9,color:"#475569"}}>{item.label}: </span>
          <span style={{fontSize:10,color:"#94a3b8"}}>{item.val}</span>
        </div>
      ))}

      {/* Summary */}
      {result.summary&&(
        <div style={{background:"#0d1f38",border:"1px solid #1e3a5f",borderRadius:8,padding:"10px 12px",marginTop:10}}>
          <div style={{fontSize:9,color:"#60a5fa",fontWeight:700,marginBottom:4}}>📝 RINGKASAN AI</div>
          <div style={{fontSize:11,color:"#cbd5e1",lineHeight:1.6}}>{result.summary}</div>
        </div>
      )}

      <div style={{marginTop:10,fontSize:9,color:"#374151",textAlign:"center"}}>LCC {lcc} · Powered by Claude AI + Web Search</div>
    </div>
  );
}

// ─── Standard FDRM Panel ──────────────────────────────────────────────────────
function FDRMPanel({ fixture, standings, lcc }) {
  const fdrm = calcFDRM(fixture, standings, lcc);
  const vc=fdrm.verdict==="CONFIRMED"?"#4ade80":fdrm.verdict==="BORDERLINE"?"#fbbf24":"#f87171";
  const vb=fdrm.verdict==="CONFIRMED"?"#052e16":fdrm.verdict==="BORDERLINE"?"#1a1200":"#1c0606";
  return (
    <div style={{padding:"12px 14px",borderTop:"1px solid #1e293b",background:"#07111c"}}>
      <div style={{textAlign:"center",marginBottom:14}}>
        <div style={{display:"inline-block",background:vb,border:`2px solid ${vc}`,borderRadius:12,padding:"8px 24px"}}>
          <div style={{fontSize:9,color:"#64748b",marginBottom:2}}>FDRM VERDICT</div>
          <div style={{fontSize:22,fontWeight:900,color:vc}}>{fdrm.verdict}</div>
          <div style={{fontSize:10,color:vc,marginTop:2}}>{fdrm.verdict==="CONFIRMED"?"Stake 2u":fdrm.verdict==="BORDERLINE"?"Stake 1u":"Skip"}</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
        {[{l:"FDRM Raw",v:fdrm.fr+"%",c:"#94a3b8"},{l:"FDRM Final",v:fdrm.ff+"%",c:vc},{l:"O2.5 Est",v:fdrm.o25+"%",c:"#60a5fa"}].map(x=>(
          <div key={x.l} style={{background:"#0a1628",borderRadius:6,padding:8,textAlign:"center"}}>
            <div style={{fontSize:8,color:"#475569",marginBottom:2}}>{x.l}</div>
            <div style={{fontSize:18,fontWeight:800,color:x.c}}>{x.v}</div>
          </div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
        {[{gate:"G1 SMI",pass:fdrm.smi,val:fdrm.smi?"GW OK":"Terlalu awal"},{gate:"G2 Derby",pass:!fdrm.derby,val:fdrm.derby?"Derby!":"Bukan derby"},{gate:"G3 SWP",pass:fdrm.swpPass,val:fdrm.swp+"%"},{gate:"G4 UPV",pass:fdrm.upv,val:fdrm.upv?"Form OK":"Form buruk"},{gate:"G6 MSF",pass:fdrm.msf,val:"Stabil"}].map(g=>{
          const col=g.pass===true?{bg:"#052e16",br:"#16a34a",ic:"✅",tx:"#4ade80"}:g.pass===false?{bg:"#1c0606",br:"#dc2626",ic:"❌",tx:"#f87171"}:{bg:"#1a1200",br:"#ca8a04",ic:"⚠️",tx:"#fbbf24"};
          return(<div key={g.gate} style={{background:col.bg,border:`1px solid ${col.br}`,borderRadius:6,padding:"6px 8px",display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:9,color:col.tx}}>{col.ic} {g.gate}</span>
            <span style={{fontSize:9,color:col.tx,fontWeight:700}}>{g.val}</span>
          </div>);
        })}
      </div>
      <div style={{marginTop:10,fontSize:9,color:"#374151",textAlign:"center"}}>LCC {lcc} · Data API-Football</div>
    </div>
  );
}

// ─── Match Card ───────────────────────────────────────────────────────────────
function MatchCard({ fixture, standings, lcc, leagueName, apiQuotaExceeded }) {
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
          <span style={{marginLeft:"auto",fontSize:10,color:apiQuotaExceeded?"#60a5fa":"#475569"}}>
            {open?"▲":"▼"} {apiQuotaExceeded?"🤖 AI":"Analisis"}
          </span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 60px 1fr",alignItems:"center",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"flex-end"}}>
            <span style={{fontSize:12,fontWeight:700,color:"#e2e8f0",textAlign:"right"}}>{fixture.teams.home.name}</span>
            <img src={fixture.teams.home.logo} alt="" style={{width:28,height:28,objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
          </div>
          <div style={{textAlign:"center"}}>
            {(status==="live"||status==="done")?<div style={{fontSize:20,fontWeight:900,color:"#f1f5f9"}}>{score.home??0}–{score.away??0}</div>:<div style={{fontSize:12,color:"#475569",fontWeight:700}}>vs</div>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <img src={fixture.teams.away.logo} alt="" style={{width:28,height:28,objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
            <span style={{fontSize:12,fontWeight:700,color:"#e2e8f0"}}>{fixture.teams.away.name}</span>
          </div>
        </div>
      </div>
      {open && (
        apiQuotaExceeded
          ? <DeepResearchPanel fixture={fixture} lcc={lcc} leagueName={leagueName} />
          : <FDRMPanel fixture={fixture} standings={standings} lcc={lcc} />
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [fixtures, setFixtures]   = useState([]);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [apiQuotaExceeded, setApiQuotaExceeded] = useState(false);

  const fetchLeague = useCallback(async (league) => {
    setSelectedLeague(league);
    setLoading(true);
    setError(null);
    setFixtures([]);
    setApiQuotaExceeded(false);

    try {
      const [liveRes, nextRes, standRes] = await Promise.all([
        fetch(`/api/football?endpoint=fixtures&live=all&league=${league.id}`).then(r=>r.json()),
        fetch(`/api/football?endpoint=fixtures&league=${league.id}&next=15`).then(r=>r.json()),
        fetch(`/api/football?endpoint=standings&league=${league.id}`).then(r=>r.json()),
      ]);

      // Deteksi quota exceeded
      const quotaError = liveRes.errors?.requests || nextRes.errors?.requests;
      if (quotaError) {
        setApiQuotaExceeded(true);
        // Buat fixture dummy agar user bisa tetap pakai Deep Research
        // Ambil dari response sebelum quota habis jika ada
        const available = [...(liveRes.response||[]), ...(nextRes.response||[])];
        if (available.length > 0) {
          const seen = new Set();
          const merged = available.filter(f => { if(seen.has(f.fixture.id))return false; seen.add(f.fixture.id); return true; })
            .sort((a,b)=>new Date(a.fixture.date)-new Date(b.fixture.date));
          setFixtures(merged);
        }
        setStandings([]);
        setLastUpdate(new Date());
        return;
      }

      const liveF = liveRes.response||[], nextF = nextRes.response||[];
      const seen = new Set();
      const merged = [...liveF,...nextF].filter(f=>{
        if(seen.has(f.fixture.id))return false; seen.add(f.fixture.id); return true;
      }).sort((a,b)=>new Date(a.fixture.date)-new Date(b.fixture.date));

      setFixtures(merged);
      setStandings(standRes.response?.[0]?.league?.standings||[]);
      setLastUpdate(new Date());
    } catch(err) {
      setError("Gagal: " + err.message);
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
            <div style={{fontSize:10,color:"#475569"}}>Real-time · API-Football · Vercel</div>
          </div>
          {liveCount>0&&<span style={{fontSize:10,background:"#dc2626",color:"#fff",padding:"4px 12px",borderRadius:16,fontWeight:700}}>🔴 {liveCount} LIVE</span>}
        </div>
      </div>

      <div style={{maxWidth:600,margin:"0 auto",padding:"12px 14px"}}>
        {apiQuotaExceeded&&(
          <div style={{background:"#0d1f38",border:"1px solid #2563eb",borderRadius:8,padding:"10px 12px",marginBottom:12,fontSize:10,color:"#93c5fd",lineHeight:1.7}}>
            ⚠️ <b>Quota API-Football habis</b> — Mode <b>🤖 Deep Research AI</b> aktif otomatis.<br/>
            Klik pertandingan manapun untuk analisis mendalam oleh Claude AI + Web Search.
          </div>
        )}

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

        {error&&<div style={{background:"#1c0606",border:"1px solid #dc2626",borderRadius:8,padding:12,marginBottom:12,color:"#fca5a5",fontSize:12}}>❌ {error}</div>}
        {loading&&<div style={{textAlign:"center",padding:"30px 0",color:"#475569"}}><div style={{fontSize:28,marginBottom:8}}>⚽</div><div style={{fontSize:13}}>Mengambil data {selectedLeague?.name}...</div></div>}

        {!loading&&fixtures.length>0&&(
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#ca8a04",letterSpacing:1.5,marginBottom:10,display:"flex",justifyContent:"space-between"}}>
              <span>📋 {selectedLeague?.name} · {fixtures.length} Pertandingan</span>
              {lastUpdate&&<span style={{color:"#374151",fontWeight:400}}>Update {lastUpdate.toLocaleTimeString("id-ID")}</span>}
            </div>
            {fixtures.map(f=>(
              <MatchCard key={f.fixture.id} fixture={f} standings={standings} lcc={selectedLeague?.lcc||0.80} leagueName={selectedLeague?.name||""} apiQuotaExceeded={apiQuotaExceeded}/>
            ))}
          </div>
        )}

        {!loading&&!error&&selectedLeague&&fixtures.length===0&&(
          <div style={{textAlign:"center",padding:"40px 0",color:"#374151"}}>
            <div style={{fontSize:32,marginBottom:8}}>{apiQuotaExceeded?"🤖":"📭"}</div>
            <div style={{fontSize:13}}>{apiQuotaExceeded?"Quota habis & tidak ada cache pertandingan":"Tidak ada pertandingan mendatang"}</div>
          </div>
        )}

        {!loading&&!selectedLeague&&(
          <div style={{textAlign:"center",padding:"40px 0",color:"#374151"}}>
            <div style={{fontSize:32,marginBottom:8}}>👆</div>
            <div style={{fontSize:13}}>Pilih liga di atas untuk melihat pertandingan</div>
          </div>
        )}

        <div style={{background:"#07111c",border:"1px solid #1e293b",borderRadius:8,padding:10,fontSize:9,color:"#374151",marginTop:12,textAlign:"center"}}>
          ⚠️ FDRM v5.0 alat bantu analisis. Bukan jaminan. · Data: API-Football + Claude AI
        </div>
      </div>
    </div>
  );
}
