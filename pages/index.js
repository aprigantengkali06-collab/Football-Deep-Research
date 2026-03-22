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

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const USE_MOCK = true; // ← Ganti jadi FALSE kalau quota API sudah reset

function getMockFixtures(leagueId) {
  const now = new Date();
  const inHour = (h) => new Date(now.getTime() + h * 3600000).toISOString();
  const teams = {
    39:  [["Manchester City","Man City","https://media.api-sports.io/football/teams/50.png"],["Arsenal","Arsenal","https://media.api-sports.io/football/teams/42.png"],["Liverpool","Liverpool","https://media.api-sports.io/football/teams/40.png"],["Chelsea","Chelsea","https://media.api-sports.io/football/teams/49.png"],["Tottenham","Spurs","https://media.api-sports.io/football/teams/47.png"],["Aston Villa","Aston Villa","https://media.api-sports.io/football/teams/66.png"]],
    140: [["Real Madrid","Real Madrid","https://media.api-sports.io/football/teams/541.png"],["Barcelona","Barcelona","https://media.api-sports.io/football/teams/529.png"],["Atletico Madrid","Atletico","https://media.api-sports.io/football/teams/530.png"],["Sevilla","Sevilla","https://media.api-sports.io/football/teams/536.png"],["Real Sociedad","R.Sociedad","https://media.api-sports.io/football/teams/548.png"],["Villarreal","Villarreal","https://media.api-sports.io/football/teams/533.png"]],
    78:  [["Bayern Munich","Bayern","https://media.api-sports.io/football/teams/157.png"],["Borussia Dortmund","Dortmund","https://media.api-sports.io/football/teams/165.png"],["RB Leipzig","Leipzig","https://media.api-sports.io/football/teams/173.png"],["Bayer Leverkusen","Leverkusen","https://media.api-sports.io/football/teams/168.png"]],
    135: [["Inter Milan","Inter","https://media.api-sports.io/football/teams/505.png"],["AC Milan","Milan","https://media.api-sports.io/football/teams/489.png"],["Juventus","Juventus","https://media.api-sports.io/football/teams/496.png"],["Napoli","Napoli","https://media.api-sports.io/football/teams/492.png"]],
    61:  [["PSG","PSG","https://media.api-sports.io/football/teams/85.png"],["Marseille","Marseille","https://media.api-sports.io/football/teams/81.png"],["Lyon","Lyon","https://media.api-sports.io/football/teams/80.png"],["Monaco","Monaco","https://media.api-sports.io/football/teams/91.png"]],
    2:   [["Real Madrid","Real Madrid","https://media.api-sports.io/football/teams/541.png"],["Manchester City","Man City","https://media.api-sports.io/football/teams/50.png"],["Bayern Munich","Bayern","https://media.api-sports.io/football/teams/157.png"],["PSG","PSG","https://media.api-sports.io/football/teams/85.png"]],
    3:   [["Arsenal","Arsenal","https://media.api-sports.io/football/teams/42.png"],["Roma","Roma","https://media.api-sports.io/football/teams/497.png"],["Ajax","Ajax","https://media.api-sports.io/football/teams/194.png"],["Sevilla","Sevilla","https://media.api-sports.io/football/teams/536.png"]],
    88:  [["Ajax","Ajax","https://media.api-sports.io/football/teams/194.png"],["PSV","PSV","https://media.api-sports.io/football/teams/197.png"],["Feyenoord","Feyenoord","https://media.api-sports.io/football/teams/198.png"],["AZ","AZ","https://media.api-sports.io/football/teams/196.png"]],
    94:  [["Porto","Porto","https://media.api-sports.io/football/teams/212.png"],["Benfica","Benfica","https://media.api-sports.io/football/teams/211.png"],["Sporting CP","Sporting","https://media.api-sports.io/football/teams/228.png"],["Braga","Braga","https://media.api-sports.io/football/teams/217.png"]],
    128: [["Boca Juniors","Boca","https://media.api-sports.io/football/teams/405.png"],["River Plate","River","https://media.api-sports.io/football/teams/406.png"],["Racing Club","Racing","https://media.api-sports.io/football/teams/435.png"],["Independiente","Independiente","https://media.api-sports.io/football/teams/441.png"]],
  };
  const t = teams[leagueId] || teams[39];
  const standings = t.map(([name], i) => ({ team: { id: i+1, name }, rank: i+1, points: 60-(i*5), form: i<2?"WWWDW":"WDLWL", all: { played: 28 } }));
  const fixtures = [];
  const statuses = [
    { short: "LIVE", elapsed: 34 },
    { short: "1H",   elapsed: 52 },
    { short: "NS",   elapsed: null },
    { short: "NS",   elapsed: null },
    { short: "NS",   elapsed: null },
  ];
  for (let i = 0; i < Math.min(5, Math.floor(t.length/2)); i++) {
    const h = t[i*2], a = t[i*2+1] || t[0];
    const st = statuses[i] || { short: "NS", elapsed: null };
    const isLive = ["LIVE","1H","2H","HT"].includes(st.short);
    fixtures.push({
      fixture: { id: leagueId*100+i, date: inHour(i===0?0:i*2), status: st },
      teams: {
        home: { id: i*2+1,   name: h[0], logo: h[2] },
        away: { id: i*2+2,   name: a[0], logo: a[2] },
      },
      goals: { home: isLive ? i : null, away: isLive ? (i>1?1:0) : null },
      league: { id: leagueId },
    });
  }
  return { fixtures, standings };
}

// ─── FDRM Logic ───────────────────────────────────────────────────────────────
function calcFDRM(fixture, standings, lcc) {
  const hTeamId = fixture.teams.home.id;
  const aTeamId = fixture.teams.away.id;
  const allStandings = standings?.flat() || [];
  const hStand = allStandings.find(s => s.team.id === hTeamId);
  const aStand = allStandings.find(s => s.team.id === aTeamId);
  const hRk = hStand?.rank || 10, aRk = aStand?.rank || 10;
  const hPts = hStand?.points || 30, aPts = aStand?.points || 30;
  const gw = hStand?.all?.played || 25;
  const smi = gw >= 10;
  const derby = fixture.teams.home.name.split(" ")[0] === fixture.teams.away.name.split(" ")[0];
  const rankDiff = aRk - hRk, ptsDiff = hPts - aPts;
  const swp = Math.min(85, Math.max(20, 50 + rankDiff*1.5 + ptsDiff*0.3));
  const swpPass = swp >= 65 ? true : swp >= 62 ? null : false;
  const upv = (hStand?.form || "WWDLL").slice(-3).includes("W");
  const msf = true;
  if (!smi || derby || swpPass === false || !upv)
    return { skip:true, derby, smi, swp:Math.round(swp), swpPass, upv, msf, lcc, fr:0, ff:0, verdict:derby?"SKIP":"STOP", o25:45 };
  const fr = Math.min(95, Math.max(50, swp*0.5+(upv?10:0)+(msf?5:0)+(swpPass===true?10:5)+20));
  const ff = Math.round(fr * lcc);
  const verdict = ff>=80?"CONFIRMED":ff>=62?"BORDERLINE":"STOP";
  const lambda = 2.5+rankDiff*0.05+ptsDiff*0.01;
  const o25 = Math.min(90,Math.max(30,Math.round((1-Math.exp(-lambda)*(1+lambda+lambda*lambda/2))*100)));
  return { skip:false, derby, smi, swp:Math.round(swp), swpPass, upv, msf, lcc, fr:Math.round(fr), ff, verdict, o25 };
}

const LIVE_STATUSES = ["1H","2H","HT","ET","BT","P","LIVE","INT"];
const DONE_STATUSES = ["FT","AET","PEN","AWD","WO"];
function getStatus(s) {
  if (LIVE_STATUSES.includes(s?.short)) return "live";
  if (DONE_STATUSES.includes(s?.short)) return "done";
  return "upcoming";
}
function toLocalTime(u) { return u ? new Date(u).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}) : "--:--"; }
function toLocalDate(u) { return u ? new Date(u).toLocaleDateString("id-ID",{day:"numeric",month:"short"}) : ""; }

// ─── Analysis Panel ───────────────────────────────────────────────────────────
function AnalysisPanel({ fixture, standings, lcc }) {
  const fdrm = calcFDRM(fixture, standings, lcc);
  const vc = fdrm.verdict==="CONFIRMED"?"#4ade80":fdrm.verdict==="BORDERLINE"?"#fbbf24":"#f87171";
  const vb = fdrm.verdict==="CONFIRMED"?"#052e16":fdrm.verdict==="BORDERLINE"?"#1a1200":"#1c0606";
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
        {[{label:"FDRM Raw",val:fdrm.fr+"%",c:"#94a3b8"},{label:"FDRM Final",val:fdrm.ff+"%",c:vc},{label:"O2.5 Est",val:fdrm.o25+"%",c:"#60a5fa"}].map(x=>(
          <div key={x.label} style={{background:"#0a1628",borderRadius:6,padding:8,textAlign:"center"}}>
            <div style={{fontSize:8,color:"#475569",marginBottom:2}}>{x.label}</div>
            <div style={{fontSize:18,fontWeight:800,color:x.c}}>{x.val}</div>
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
      <div style={{marginTop:10,fontSize:9,color:"#374151",textAlign:"center"}}>LCC {lcc} · FDRM Analysis</div>
    </div>
  );
}

// ─── Match Card ───────────────────────────────────────────────────────────────
function MatchCard({ fixture, standings, lcc }) {
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
          <span style={{marginLeft:"auto",fontSize:10,color:"#475569"}}>{open?"▲":"▼"} Analisis</span>
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
      {open&&<AnalysisPanel fixture={fixture} standings={standings} lcc={lcc}/>}
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

  const fetchLeague = useCallback(async (league) => {
    setSelectedLeague(league);
    setLoading(true);
    setError(null);
    setFixtures([]);

    if (USE_MOCK) {
      // Simulasi delay network
      await new Promise(r => setTimeout(r, 800));
      const { fixtures: mf, standings: ms } = getMockFixtures(league.id);
      setFixtures(mf);
      setStandings(ms);
      setLastUpdate(new Date());
      setLoading(false);
      return;
    }

    try {
      const [liveRes, nextRes, standRes] = await Promise.all([
        fetch(`/api/football?endpoint=fixtures&live=all&league=${league.id}`).then(r=>r.json()),
        fetch(`/api/football?endpoint=fixtures&league=${league.id}&next=15`).then(r=>r.json()),
        fetch(`/api/football?endpoint=standings&league=${league.id}`).then(r=>r.json()),
      ]);
      const liveF = liveRes.response||[], nextF = nextRes.response||[];
      const seen = new Set();
      const merged = [...liveF,...nextF].filter(f=>{
        if(seen.has(f.fixture.id))return false;
        seen.add(f.fixture.id);return true;
      }).sort((a,b)=>new Date(a.fixture.date)-new Date(b.fixture.date));
      setFixtures(merged);
      setStandings(standRes.response?.[0]?.league?.standings||[]);
      setLastUpdate(new Date());
    } catch(err) {
      setError("Gagal mengambil data: "+err.message);
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
            {USE_MOCK&&<span style={{fontSize:9,background:"#ca8a04",color:"#000",padding:"1px 6px",borderRadius:6,marginLeft:6,fontWeight:700}}>DEMO</span>}
            <div style={{fontSize:10,color:"#475569"}}>Real-time · API-Football · Vercel</div>
          </div>
          {liveCount>0&&<span style={{fontSize:10,background:"#dc2626",color:"#fff",padding:"4px 12px",borderRadius:16,fontWeight:700}}>🔴 {liveCount} LIVE</span>}
        </div>
      </div>

      <div style={{maxWidth:600,margin:"0 auto",padding:"12px 14px"}}>
        {USE_MOCK&&(
          <div style={{background:"#1a1200",border:"1px solid #ca8a04",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:10,color:"#fbbf24"}}>
            ⚠️ Mode DEMO — data palsu untuk preview UI. Ganti <b>USE_MOCK = false</b> di kode setelah quota API reset (besok jam 07:00 WIB)
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
                  {isActive&&loading&&<span style={{marginLeft:"auto",fontSize:10}}>⏳</span>}
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
            {fixtures.map(f=><MatchCard key={f.fixture.id} fixture={f} standings={standings} lcc={selectedLeague?.lcc||0.80}/>)}
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
            <div style={{fontSize:13}}>Pilih liga di atas untuk melihat pertandingan</div>
          </div>
        )}
        <div style={{background:"#07111c",border:"1px solid #1e293b",borderRadius:8,padding:10,fontSize:9,color:"#374151",marginTop:12,textAlign:"center"}}>
          ⚠️ FDRM v5.0 alat bantu analisis. Bukan jaminan. · Data: API-Football
        </div>
      </div>
    </div>
  );
}
