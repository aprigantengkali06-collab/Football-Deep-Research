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
function toLocalTime(u) { return u ? new Date(u).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}) : "--:--"; }
function toLocalDate(u) { return u ? new Date(u).toLocaleDateString("id-ID",{day:"numeric",month:"short"}) : ""; }

// ─── Kirim data real ke Groq → jalankan FDRM + analisis ──────────────────────
async function runFDRMWithGroq(fixture, standings, lcc, leagueName) {
  const allS = standings?.flat() || [];
  const hS = allS.find(s => s.team.id === fixture.teams.home.id);
  const aS = allS.find(s => s.team.id === fixture.teams.away.id);

  const homeData = {
    name:  fixture.teams.home.name,
    rank:  hS?.rank   || "?",
    pts:   hS?.points || "?",
    form:  hS?.form   || "?",
    played: hS?.all?.played || "?",
    wins:  hS?.all?.win || "?",
    draws: hS?.all?.draw || "?",
    loss:  hS?.all?.lose || "?",
    gf:    hS?.all?.goals?.for || "?",
    ga:    hS?.all?.goals?.against || "?",
  };
  const awayData = {
    name:  fixture.teams.away.name,
    rank:  aS?.rank   || "?",
    pts:   aS?.points || "?",
    form:  aS?.form   || "?",
    played: aS?.all?.played || "?",
    wins:  aS?.all?.win || "?",
    draws: aS?.all?.draw || "?",
    loss:  aS?.all?.lose || "?",
    gf:    aS?.all?.goals?.for || "?",
    ga:    aS?.all?.goals?.against || "?",
  };

  const prompt = `Kamu adalah analis sepak bola FDRM. Berikut data REAL-TIME dari API-Football:

PERTANDINGAN: ${homeData.name} vs ${awayData.name}
LIGA: ${leagueName} | LCC: ${lcc}

DATA TIM KANDANG (${homeData.name}):
- Rank: #${homeData.rank} | Poin: ${homeData.pts} | Main: ${homeData.played}
- W/D/L: ${homeData.wins}/${homeData.draws}/${homeData.loss}
- Gol: ${homeData.gf} masuk / ${homeData.ga} kemasukan
- Form 5 terakhir: ${homeData.form}

DATA TIM TANDANG (${awayData.name}):
- Rank: #${awayData.rank} | Poin: ${awayData.pts} | Main: ${awayData.played}
- W/D/L: ${awayData.wins}/${awayData.draws}/${awayData.loss}
- Gol: ${awayData.gf} masuk / ${awayData.ga} kemasukan
- Form 5 terakhir: ${awayData.form}

ALGORITMA FDRM:
Gate 1 SMI: lolos jika gameweek >= 10
Gate 2 Derby: skip jika derby
Gate 3 SWP = 50 + (rankAway-rankHome)*1.8 + (ptsHome-ptsAway)*0.4, lolos jika SWP >= 62
Gate 4 UPV: lolos jika home menang minimal 1 dari 3 match terakhir
FR = SWP*0.5 + 10(UPV) + 5(MSF) + 10(SWP>=65) + 20, max 95
FF = FR * ${lcc}
CONFIRMED jika FF>=80, BORDERLINE jika FF>=62, STOP jika <62

Hitung FDRM dengan data di atas, lalu berikan analisis lengkap.
Balas JSON saja tanpa teks lain:
{"smi":true,"derby":false,"swp":72,"swpPass":true,"upv":true,"fr":81,"ff":73,"verdict":"CONFIRMED","stake":"2u","o25":65,"ah":"Home -0.5","ahConf":"TINGGI","ftOU":"Over 2.5","ftOUConf":"SEDANG","htOU":"Under 1.5","htOUConf":"TINGGI","ftBTTS":"Yes","htBTTS":"No","ftResult":"Home Win","htResult":"Home Win","score":"2-0","h2h":"Home unbeaten 3 match terakhir vs Away","inj":"Tidak ada cedera signifikan","ctx":"Home butuh poin untuk top 4","sum":"Analisis 2-3 kalimat berdasarkan data di atas"}`;

  const r = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error);

  let cleanText = data.text.replace(/```json/gi,"").replace(/```/g,"").trim();
  const s = cleanText.indexOf("{");
  const e = cleanText.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("Format AI tidak valid");
  const result = JSON.parse(cleanText.slice(s, e+1));
  
  // Recalculate FF dengan LCC yang benar
  result.ff = Math.round((result.fr || 75) * lcc);
  result.verdict = result.ff >= 80 ? "CONFIRMED" : result.ff >= 62 ? "BORDERLINE" : "STOP";
  result.stake = result.ff >= 80 ? "2u" : result.ff >= 62 ? "1u" : "Skip";
  result.homeData = homeData;
  result.awayData = awayData;
  return result;
}

// ─── Analysis Panel ───────────────────────────────────────────────────────────
function AnalysisPanel({ fixture, standings, lcc, leagueName }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const status = getStatus(fixture.fixture.status);

  const doAnalysis = async () => {
    setLoading(true); setError(null);
    try { setResult(await runFDRMWithGroq(fixture, standings, lcc, leagueName)); }
    catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (!result && !loading && !error) return (
    <div style={{padding:"14px",borderTop:"1px solid #1e293b",background:"#07111c",textAlign:"center"}}>
      {status==="done"&&<div style={{fontSize:10,color:"#475569",marginBottom:6}}>✔ Match selesai</div>}
      <button onClick={doAnalysis} style={{background:"linear-gradient(135deg,#1e3a8a,#2563eb)",border:"none",borderRadius:8,color:"#fff",padding:"10px 22px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
        🤖 Analisis FDRM
      </button>
      <div style={{fontSize:9,color:"#374151",marginTop:5}}>Data real API-Football → Groq AI kalkulasi FDRM</div>
    </div>
  );

  if (loading) return (
    <div style={{padding:"20px",borderTop:"1px solid #1e293b",background:"#07111c",textAlign:"center"}}>
      <div style={{fontSize:11,color:"#60a5fa",marginBottom:4}}>🔍 Groq kalkulasi FDRM dari data real...</div>
      <div style={{fontSize:9,color:"#374151",marginBottom:12}}>Standings · Form · Gates · Bet recommendations</div>
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
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
        <span style={{fontSize:9,background:"#1e3a8a",color:"#93c5fd",padding:"2px 8px",borderRadius:6,fontWeight:700}}>🤖 FDRM + GROQ AI</span>
        <span style={{fontSize:9,color:"#374151"}}>Data real · LCC {lcc}</span>
      </div>

      {/* Verdict */}
      <div style={{textAlign:"center",marginBottom:12}}>
        <div style={{display:"inline-block",background:vb,border:`2px solid ${vc}`,borderRadius:12,padding:"8px 24px"}}>
          <div style={{fontSize:9,color:"#64748b",marginBottom:2}}>FDRM VERDICT</div>
          <div style={{fontSize:22,fontWeight:900,color:vc}}>{result.verdict}</div>
          <div style={{fontSize:10,color:vc,marginTop:2}}>Stake {result.stake}</div>
        </div>
      </div>

      {/* Scores */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
        {[{l:"FDRM Raw",v:(result.fr||0)+"%",c:"#94a3b8"},{l:"FDRM Final",v:result.ff+"%",c:vc},{l:"O2.5 Est",v:(result.o25||0)+"%",c:"#60a5fa"}].map(x=>(
          <div key={x.l} style={{background:"#0a1628",borderRadius:6,padding:8,textAlign:"center"}}>
            <div style={{fontSize:8,color:"#475569",marginBottom:2}}>{x.l}</div>
            <div style={{fontSize:18,fontWeight:800,color:x.c}}>{x.v}</div>
          </div>
        ))}
      </div>

      {/* Data real standings */}
      {result.homeData && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
          {[result.homeData, result.awayData].map(t=>(
            <div key={t.name} style={{background:"#0a1628",borderRadius:6,padding:8}}>
              <div style={{fontSize:8,color:"#475569",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div>
              <div style={{fontSize:9,color:"#64748b",marginBottom:4}}>#{t.rank} · {t.pts} pts · {t.gf}/{t.ga} gol</div>
              <div style={{display:"flex",gap:2}}>
                {(t.form||"").split("").slice(-5).map((c,i)=>(
                  <span key={i} style={{fontSize:9,fontWeight:700,color:c==="W"?"#4ade80":c==="L"?"#f87171":"#fbbf24",background:c==="W"?"#052e16":c==="L"?"#1c0606":"#1a1200",padding:"2px 4px",borderRadius:3}}>{c}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Gates */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:10}}>
        {[
          {gate:"G1 SMI",  pass:result.smi,    val:result.smi?"GW OK":"Terlalu awal"},
          {gate:"G2 Derby",pass:!result.derby,  val:result.derby?"Derby!":"Bukan derby"},
          {gate:"G3 SWP",  pass:result.swpPass, val:(result.swp||0)+"%"},
          {gate:"G4 UPV",  pass:result.upv,     val:result.upv?"Form OK":"Form buruk"},
        ].map(g=>{
          const col=g.pass===true?{bg:"#052e16",br:"#16a34a",ic:"✅",tx:"#4ade80"}:g.pass===false?{bg:"#1c0606",br:"#dc2626",ic:"❌",tx:"#f87171"}:{bg:"#1a1200",br:"#ca8a04",ic:"⚠️",tx:"#fbbf24"};
          return(<div key={g.gate} style={{background:col.bg,border:`1px solid ${col.br}`,borderRadius:6,padding:"5px 8px",display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:9,color:col.tx}}>{col.ic} {g.gate}</span>
            <span style={{fontSize:9,color:col.tx,fontWeight:700}}>{g.val}</span>
          </div>);
        })}
      </div>

      {/* H2H & Info */}
      {[{ic:"📊",l:"H2H",v:result.h2h},{ic:"🏥",l:"Cedera",v:result.inj},{ic:"🎯",l:"Konteks",v:result.ctx},{ic:"⚽",l:"Prediksi Skor",v:result.score}].map(item=>(
        item.v&&<div key={item.l} style={{background:"#0a1628",borderRadius:6,padding:"7px 10px",marginBottom:6,display:"flex",gap:8}}>
          <span>{item.ic}</span>
          <div><span style={{fontSize:9,color:"#475569"}}>{item.l}: </span><span style={{fontSize:10,color:"#94a3b8"}}>{item.v}</span></div>
        </div>
      ))}

      {/* Taruhan */}
      <div style={{marginTop:10}}>
        <div style={{fontSize:9,fontWeight:700,color:"#ca8a04",letterSpacing:1.5,marginBottom:8}}>🎯 REKOMENDASI TARUHAN</div>
        <div style={{fontSize:9,color:"#475569",fontWeight:700,marginBottom:4}}>FULL TIME</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:8}}>
          {[
            {label:"1X2",val:result.ftResult,c:"#60a5fa"},
            {label:"AH",val:result.ah,sub:result.ahConf,c:"#a78bfa"},
            {label:"O/U",val:result.ftOU,sub:result.ftOUConf,c:"#4ade80"},
            {label:"BTTS",val:result.ftBTTS,c:"#fb923c"},
          ].map(x=>(
            <div key={x.label} style={{background:"#0a1628",borderRadius:6,padding:"7px 8px"}}>
              <div style={{fontSize:8,color:"#475569",marginBottom:2}}>{x.label} FT</div>
              <div style={{fontSize:13,fontWeight:700,color:x.c}}>{x.val||"-"}</div>
              {x.sub&&<div style={{fontSize:8,color:"#374151",marginTop:1}}>{x.sub}</div>}
            </div>
          ))}
        </div>
        <div style={{fontSize:9,color:"#475569",fontWeight:700,marginBottom:4}}>HALF TIME</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
          {[
            {label:"1X2",val:result.htResult,c:"#60a5fa"},
            {label:"O/U",val:result.htOU,sub:result.htOUConf,c:"#4ade80"},
            {label:"BTTS",val:result.htBTTS,c:"#fb923c"},
          ].map(x=>(
            <div key={x.label} style={{background:"#0a1628",borderRadius:6,padding:"7px 8px"}}>
              <div style={{fontSize:8,color:"#475569",marginBottom:2}}>{x.label} HT</div>
              <div style={{fontSize:13,fontWeight:700,color:x.c}}>{x.val||"-"}</div>
              {x.sub&&<div style={{fontSize:8,color:"#374151",marginTop:1}}>{x.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Ringkasan */}
      {result.sum&&(
        <div style={{background:"#0d1f38",border:"1px solid #1e3a5f",borderRadius:8,padding:"10px 12px",marginTop:10}}>
          <div style={{fontSize:9,color:"#60a5fa",fontWeight:700,marginBottom:4}}>📝 ANALISIS AI</div>
          <div style={{fontSize:11,color:"#cbd5e1",lineHeight:1.7}}>{result.sum}</div>
        </div>
      )}
      <div style={{fontSize:9,color:"#374151",textAlign:"center",marginTop:8}}>
        Standings & form: API-Football (real-time) · Kalkulasi & analisis: Groq AI
      </div>
    </div>
  );
}

// ─── Match Card ───────────────────────────────────────────────────────────────
function MatchCard({ fixture, standings, lcc, leagueName }) {
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
          <span style={{marginLeft:"auto",fontSize:10,color:"#475569"}}>{open?"▲":"▼"}</span>
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
      {open&&<AnalysisPanel fixture={fixture} standings={standings} lcc={lcc} leagueName={leagueName}/>}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [fixtures,  setFixtures]  = useState([]);
  const [standings, setStandings] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchLeague = useCallback(async (league) => {
    setSelectedLeague(league);
    setLoading(true);
    setError(null);
    setFixtures([]);
    setStandings([]);
    try {
      const now   = Date.now();
      const in12h = now + 12 * 3600000;
      const d1 = new Date(now).toISOString().slice(0,10);
      const d2 = new Date(in12h).toISOString().slice(0,10);
      const dates = [...new Set([d1, d2])];

      const [liveRes, standRes, ...dateResults] = await Promise.all([
        fetch(`/api/football?endpoint=fixtures&live=all&league=${league.id}`).then(r=>r.json()),
        fetch(`/api/football?endpoint=standings&league=${league.id}`).then(r=>r.json()),
        ...dates.map(d=>fetch(`/api/football?endpoint=fixtures&league=${league.id}&date=${d}`).then(r=>r.json()))
      ]);

      const liveF = liveRes.response || [];
      const dateF = dateResults.flatMap(r => r.response || []);
      const seen  = new Set();
      const merged = [...liveF, ...dateF]
        .filter(f => {
          if (seen.has(f.fixture.id)) return false;
          seen.add(f.fixture.id);
          const t  = new Date(f.fixture.date).getTime();
          const st = f.fixture.status?.short;
          return LIVE_STATUSES.includes(st) || (t >= now - 7200000 && t <= in12h);
        })
        .sort((a,b) => new Date(a.fixture.date) - new Date(b.fixture.date));

      setFixtures(merged);
      setStandings(standRes.response?.[0]?.league?.standings || []);
      setLastUpdate(new Date());
      if (merged.length === 0) setError(`Tidak ada pertandingan ${league.name} dalam 12 jam ke depan`);
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
            <div style={{fontSize:10,color:"#475569"}}>API-Football + Groq AI · Vercel</div>
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
                  {isActive&&!loading&&<span style={{marginLeft:"auto",color:"#ca8a04",fontSize:10}}>✓</span>}
                  {isActive&&loading&&<span style={{marginLeft:"auto"}}>⏳</span>}
                </button>
              );
            })}
          </div>
        </div>

        {error&&<div style={{background:"#1c0606",border:"1px solid #dc2626",borderRadius:8,padding:12,marginBottom:12,color:"#fca5a5",fontSize:12}}>⚠️ {error}</div>}
        {loading&&<div style={{textAlign:"center",padding:"30px 0",color:"#475569"}}><div style={{fontSize:28,marginBottom:8}}>⚽</div><div style={{fontSize:13}}>Mengambil data {selectedLeague?.name}...</div></div>}

        {!loading&&fixtures.length>0&&(
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#ca8a04",letterSpacing:1.5,marginBottom:10,display:"flex",justifyContent:"space-between"}}>
              <span>📋 {selectedLeague?.name} · {fixtures.length} Match</span>
              {lastUpdate&&<span style={{color:"#374151",fontWeight:400}}>Update {lastUpdate.toLocaleTimeString("id-ID")}</span>}
            </div>
            {fixtures.map(f=>(
              <MatchCard key={f.fixture.id} fixture={f} standings={standings} lcc={selectedLeague?.lcc||0.80} leagueName={selectedLeague?.name||""}/>
            ))}
          </div>
        )}

        {!loading&&!selectedLeague&&(
          <div style={{textAlign:"center",padding:"40px 0",color:"#374151"}}>
            <div style={{fontSize:32,marginBottom:8}}>👆</div>
            <div style={{fontSize:13}}>Pilih liga untuk melihat pertandingan</div>
            <div style={{fontSize:10,marginTop:4}}>Data standings real-time · FDRM dijalankan Groq AI</div>
          </div>
        )}

        <div style={{background:"#07111c",border:"1px solid #1e293b",borderRadius:8,padding:10,fontSize:9,color:"#374151",marginTop:12,textAlign:"center"}}>
          ⚠️ FDRM v5.0 alat bantu analisis. Bukan jaminan. · API-Football + Groq AI
        </div>
      </div>
    </div>
  );
}
