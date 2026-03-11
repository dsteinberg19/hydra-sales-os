import { useState } from "react";

const API = "/api/claude";
const MODEL = "claude-haiku-4-5-20251001";
const C = { bg:"#080a0f", surface:"#0e1118", border:"#1c2030", gold:"#c9a96e", goldLight:"#e8c98a", text:"#e8e0d4", muted:"#6b7280", green:"#4ade80", red:"#f87171" };

const btn = (v="default") => ({ padding:"9px 18px", borderRadius:"8px", border:"none", cursor:"pointer", fontSize:"12px", fontWeight:600, fontFamily:"inherit", letterSpacing:"0.04em", transition:"all 0.2s",
  ...(v==="gold"?{background:`linear-gradient(135deg,${C.gold},${C.goldLight})`,color:"#080a0f"}
    :v==="green"?{background:"#14532d",color:C.green,border:"1px solid #166534"}
    :v==="ghost"?{background:"transparent",color:C.muted,border:`1px solid ${C.border}`}
    :{background:C.surface,color:C.text,border:`1px solid ${C.border}`})
});
const tag = (color) => ({ display:"inline-flex", alignItems:"center", background:color+"18", color, border:`1px solid ${color}30`, borderRadius:"4px", padding:"2px 8px", fontSize:"11px", fontWeight:700, letterSpacing:"0.06em" });
const card = { background:C.surface, border:`1px solid ${C.border}`, borderRadius:"12px", padding:"20px" };

function Spinner() {
  return <span style={{ display:"inline-block", width:12, height:12, border:`2px solid ${C.border}`, borderTopColor:C.gold, borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />;
}

function ScoreRing({ score }) {
  const color = score>=8?C.green:score>=6?C.gold:C.red;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", minWidth:52 }}>
      <div style={{ width:50, height:50, borderRadius:"50%", border:`3px solid ${color}`, display:"flex", alignItems:"center", justifyContent:"center", background:color+"10", boxShadow:`0 0 10px ${color}30` }}>
        <span style={{ fontSize:16, fontWeight:800, color, fontFamily:"monospace" }}>{score}</span>
      </div>
      <span style={{ fontSize:10, color:C.muted, marginTop:3 }}>score</span>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type="text", hint }) {
  return (
    <div>
      <label style={{ fontSize:11, color:C.muted, letterSpacing:"0.08em", textTransform:"uppercase", display:"block", marginBottom:5 }}>{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 13px", color:C.text, fontSize:13, outline:"none", fontFamily:"'DM Mono',monospace" }} />
      {hint && <div style={{ fontSize:11, color:"#4b5563", marginTop:5, lineHeight:1.5 }}>{hint}</div>}
    </div>
  );
}

function OutreachPanel({ outreach, bookingLink }) {
  const [tab, setTab] = useState("email");
  const tabs = [["email","📧 Email 1"],["followUp1","📧 Follow-up 1"],["followUp2","📧 Follow-up 2"],["linkedin","💼 LinkedIn"],["sms","💬 SMS"]];
  const c = outreach[tab];
  const isMsg = tab==="linkedin"||tab==="sms";
  const raw = isMsg ? c?.body : `Subject: ${c?.subject}\n\n${c?.body}`;
  const text = (raw||"").replace(/\[booking.?link\]/gi, bookingLink);
  return (
    <div>
      <div style={{ fontSize:10, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>Outreach Messages</div>
      <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
        {tabs.map(([k,l]) => (
          <button key={k} onClick={()=>setTab(k)} style={{ ...btn("ghost"), color:tab===k?C.gold:C.muted, borderColor:tab===k?C.gold+"44":C.border, fontSize:11, padding:"5px 12px" }}>{l}</button>
        ))}
      </div>
      <div style={{ position:"relative" }}>
        <textarea readOnly value={text} rows={9} style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 14px", color:C.text, fontSize:12, lineHeight:1.7, resize:"vertical", outline:"none", fontFamily:"'DM Mono',monospace" }} />
        <button onClick={()=>navigator.clipboard.writeText(text)} style={{ position:"absolute", top:8, right:8, ...btn(), fontSize:10, padding:"3px 8px" }}>Copy</button>
      </div>
    </div>
  );
}

async function fetchWithTimeout(url, options, timeoutMs=45000) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {...options, signal:controller.signal});
    clearTimeout(timer); return res;
  } catch(e) {
    clearTimeout(timer);
    if (e.name==="AbortError") throw new Error("Request timed out. Please try again.");
    throw e;
  }
}

async function searchAndFormat(userQuery, formatInstructions, onStatus) {
  onStatus && onStatus("🔍 Searching the web for leads…");
  const searchRes = await fetchWithTimeout(API, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:MODEL, max_tokens:1000, tools:[{type:"web_search_20250305",name:"web_search"}], messages:[{role:"user",content:userQuery}]})
  }, 40000);
  const searchData = await searchRes.json();
  if (searchData.error) throw new Error(searchData.error.message);
  const rawText = searchData.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"";
  onStatus && onStatus("⚙️ Formatting lead data…");
  const formatRes = await fetchWithTimeout(API, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:MODEL, max_tokens:1000, system:"You convert research into structured JSON. Output ONLY valid JSON — no markdown fences, no explanation. Start directly with [ or {.", messages:[{role:"user",content:`${formatInstructions}\n\nResearch:\n${rawText.slice(0,6000)}`}]})
  }, 30000);
  const formatData = await formatRes.json();
  if (formatData.error) throw new Error(formatData.error.message);
  const text = formatData.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"";
  const clean = text.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
  const m = clean.match(/\[[\s\S]*\]/)||clean.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Could not parse response. Please try again.");
  return JSON.parse(m[0]);
}

export default function HydraSalesOS() {
  const [view, setView] = useState("find");
  const [query, setQuery] = useState("");
  const [leads, setLeads] = useState([]);
  const [finding, setFinding] = useState(false);
  const [findErr, setFindErr] = useState("");
  const [findStatus, setFindStatus] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [senderName, setSenderName] = useState("Daniel");
  const [senderTitle, setSenderTitle] = useState("Founder, Hydra Home Wellness");
  const [senderEmail, setSenderEmail] = useState("daniel@hydrawellness.com");
  const [bookingLink, setBookingLink] = useState("https://calendly.com/your-link");
  const [apolloKey, setApolloKey] = useState("");
  const [hsKey, setHsKey] = useState("");

  const updateLead = (id, patch) => setLeads(ls=>ls.map(l=>l.id===id?{...l,...patch}:l));
  const qualified = leads.filter(l=>l.research?.score>=7).length;

  async function findLeads() {
    if (!query.trim()) return;
    setFinding(true); setFindErr(""); setFindStatus(""); setLeads([]);
    try {
      const locationHint = query.match(/\b(florida|miami|orlando|tampa|jacksonville|fort lauderdale|boca raton|palm beach|naples|sarasota|south florida|jupiter|delray|vero beach)\b/i)?.[0]||"Florida";
      const arr = await searchAndFormat(
        `Search for luxury home builders, interior designers, architects, and high-end real estate developers in ${locationHint} who work on $3M+ residential projects. Find real people with names, companies, roles. Query: ${query}`,
        `Create a JSON array of 8 leads for Hydra, a luxury wellness design company building turnkey wellness spaces ($20k-$250k+) in luxury Florida homes. CRITICAL: Only include leads in ${locationHint} or Florida. Every lead must have a real person's full name. Return ONLY a JSON array: [{"id":1,"name":"First Last","type":"B2B","role":"Title","company":"Company","location":"City, FL","email":"email or Not found","phone":"phone or Not found","website":"url or Not found","linkedin":"url or Not found","industry":"sector","estimatedBudget":"$X-$Y","notes":"why strong Hydra lead","rawScore":8}]`,
        setFindStatus
      );
      setLeads((Array.isArray(arr)?arr:[arr]).map(l=>({...l,status:"pending"})));
      setView("pipeline");
    } catch(e) { setFindErr(e.message); }
    finally { setFinding(false); setFindStatus(""); }
  }

  async function researchLead(id) {
    updateLead(id,{status:"researching"});
    try {
      const lead = leads.find(l=>l.id===id);
      const research = await searchAndFormat(
        `Research ${lead.name}, ${lead.role} at ${lead.company} in ${lead.location}. Find recent projects, portfolio, awards, company background, project scale, personal details useful for sales outreach.`,
        `Create a research profile JSON for ${lead.name} (${lead.role}, ${lead.company}) as a potential Hydra client. Hydra sells turnkey luxury wellness spaces ($20k-$250k+) in high-end Florida homes. Return ONLY a JSON object: {"score":8,"scoringReason":"2 sentences","companySize":"estimated","recentNews":"relevant news","painPoints":["p1","p2"],"personalHooks":["hook"],"idealProduct":"best Hydra fit","estimatedDealSize":"$X-$Y","pushToCRM":true}`
      );
      updateLead(id,{research,status:"researched"});
    } catch(e) { updateLead(id,{status:"error",errorMsg:e.message}); }
  }

  async function draftOutreach(id) {
    updateLead(id,{status:"drafting"});
    try {
      const lead = leads.find(l=>l.id===id);
      const res = await fetchWithTimeout(API, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:MODEL, max_tokens:1000,
          system:"You write personalized luxury sales outreach. Output ONLY valid JSON — no markdown, no explanation. Start directly with {.",
          messages:[{role:"user",content:`Write outreach from ${senderName}, ${senderTitle} (${senderEmail}) to ${lead.name}, ${lead.role} at ${lead.company}. Hydra: luxury wellness design firm building turnkey spaces (saunas, cold plunges, steam rooms, red light, cryo, float) in luxury FL homes. $20k-$250k+. Sell the space not equipment. Research: ${JSON.stringify(lead.research)}. Booking: ${bookingLink}. Return ONLY: {"email":{"subject":"...","body":"4-6 sentences, personal hook, soft CTA with booking link"},"linkedin":{"body":"2-3 sentences, conversational"},"sms":{"body":"1-2 sentences"},"followUp1":{"subject":"...","body":"day 3 follow-up"},"followUp2":{"subject":"...","body":"day 7 final nudge"}}`}]
        })
      }, 30000);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const text = data.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"";
      const clean = text.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
      const m = clean.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Could not parse outreach");
      updateLead(id,{outreach:JSON.parse(m[0]),status:"done"});
    } catch(e) { updateLead(id,{status:"error",errorMsg:e.message}); }
  }

  async function runPipeline(id) {
    await researchLead(id);
    setLeads(ls=>{
      const lead = ls.find(l=>l.id===id);
      if (lead?.research?.score>=7) setTimeout(()=>draftOutreach(id),400);
      return ls;
    });
  }

  async function runAll() {
    for (const l of leads.filter(l=>l.status==="pending")) {
      await runPipeline(l.id);
      await new Promise(r=>setTimeout(r,500));
    }
  }

  async function enrichLead(id) {
    if (!apolloKey) { alert("Add your Apollo API key in Settings first."); return; }
    updateLead(id,{enriching:true});
    try {
      const lead = leads.find(l=>l.id===id);
      const res = await fetchWithTimeout("https://api.apollo.io/v1/people/match", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({api_key:apolloKey,name:lead.name,organization_name:lead.company,reveal_personal_emails:true,reveal_phone_number:true})
      }, 15000);
      if (!res.ok) throw new Error("Apollo request failed.");
      const data = await res.json();
      const p = data.person;
      updateLead(id,{email:p?.email||lead.email,phone:p?.phone_numbers?.[0]?.sanitized_number||lead.phone,linkedin:p?.linkedin_url||lead.linkedin,enriching:false,enriched:true});
    } catch(e) { updateLead(id,{enriching:false}); alert("Enrich failed: "+e.message); }
  }

  async function pushToHubSpot(id) {
    if (!hsKey) { alert("Add your HubSpot token in Settings first."); return; }
    updateLead(id,{status:"pushing"});
    try {
      const lead = leads.find(l=>l.id===id);
      const res = await fetchWithTimeout("https://api.hubapi.com/crm/v3/objects/contacts", {
        method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${hsKey}`},
        body:JSON.stringify({properties:{firstname:lead.name?.split(" ")[0]||"",lastname:lead.name?.split(" ").slice(1).join(" ")||"",email:lead.email!=="Not found"?lead.email:"",phone:lead.phone!=="Not found"?lead.phone:"",company:lead.company||"",jobtitle:lead.role||"",website:lead.website!=="Not found"?lead.website:"",hs_lead_status:"NEW",description:`Hydra Lead | Score: ${lead.research?.score}/10\n${lead.research?.scoringReason}\nIdeal: ${lead.research?.idealProduct}\nDeal: ${lead.research?.estimatedDealSize}`}})
      }, 15000);
      if (!res.ok) { const e=await res.json(); throw new Error(e.message); }
      updateLead(id,{status:"pushed"});
    } catch(e) { updateLead(id,{status:"done"}); alert("HubSpot push failed: "+e.message); }
  }

  function buildCSV() {
    const rows = leads.map(l=>({Name:l.name||"",Type:l.type||"",Role:l.role||"",Company:l.company||"",Location:l.location||"",Email:l.email||"",Phone:l.phone||"",Website:l.website||"",LinkedIn:l.linkedin||"",Score:l.research?.score||l.rawScore||"",EstimatedDeal:l.research?.estimatedDealSize||l.estimatedBudget||"",IdealProduct:l.research?.idealProduct||"",ScoringReason:l.research?.scoringReason||"",Notes:l.notes||"",EmailSubject:l.outreach?.email?.subject||"",EmailBody:l.outreach?.email?.body||"",LinkedInDM:l.outreach?.linkedin?.body||"",SMS:l.outreach?.sms?.body||"",FollowUp1Subject:l.outreach?.followUp1?.subject||"",FollowUp1Body:l.outreach?.followUp1?.body||"",FollowUp2Subject:l.outreach?.followUp2?.subject||"",FollowUp2Body:l.outreach?.followUp2?.body||""}));
    const headers = Object.keys(rows[0]);
    return [headers.join(","),...rows.map(r=>headers.map(h=>`"${String(r[h]).replace(/"/g,'""')}"`).join(","))].join("\n");
  }

  function exportCSV() {
    const blob = new Blob([buildCSV()],{type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download=`hydra-leads-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  function openInSheets() {
    exportCSV();
    setTimeout(()=>window.open("https://sheets.new","_blank"),800);
  }

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'Cormorant Garamond',Georgia,serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;} button:hover{opacity:0.82;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
      <div style={{ borderBottom:`1px solid ${C.border}`, padding:"0 32px", display:"flex", alignItems:"center", height:56, position:"sticky", top:0, background:C.bg, zIndex:50 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginRight:40 }}>
          <div style={{ width:30, height:30, background:`linear-gradient(135deg,${C.gold},${C.goldLight})`, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>〜</div>
          <span style={{ fontSize:16, fontWeight:700, letterSpacing:"0.08em", color:C.gold }}>HYDRA</span>
          <span style={{ fontSize:10, color:C.muted, letterSpacing:"0.15em", textTransform:"uppercase", borderLeft:`1px solid ${C.border}`, paddingLeft:10 }}>Sales OS</span>
        </div>
        {[["find","🔍 Find"],["pipeline",`⚡ Pipeline${leads.length?` (${leads.length})`:""}`],["settings","⚙ Settings"]].map(([v,label])=>(
          <button key={v} onClick={()=>setView(v)} style={{ background:"transparent", border:"none", borderBottom:`2px solid ${view===v?C.gold:"transparent"}`, color:view===v?C.gold:C.muted, padding:"0 14px", height:56, cursor:"pointer", fontSize:12, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", fontFamily:"inherit" }}>{label}</button>
        ))}
        {qualified>0&&<div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:C.green, boxShadow:`0 0 8px ${C.green}` }}/>
          <span style={{ fontSize:12, color:C.muted }}>{qualified} qualified</span>
        </div>}
      </div>

      {view==="find"&&(
        <div style={{ maxWidth:680, margin:"70px auto", padding:"0 32px", animation:"fadeIn 0.3s ease" }}>
          <div style={{ fontSize:11, color:C.muted, letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:6 }}>Lead Discovery</div>
          <h1 style={{ fontSize:40, fontWeight:300, color:C.gold, margin:"0 0 6px", lineHeight:1.1 }}>Find Your<br/>Next Client</h1>
          <p style={{ color:C.muted, fontSize:13, marginBottom:36, fontFamily:"'DM Mono',monospace" }}>Find Florida-based luxury homeowners, builders, and designers tied to active high-end residential projects with strong wellness integration potential.</p>
          <textarea value={query} onChange={e=>setQuery(e.target.value)} rows={4}
            placeholder={"e.g. \"Custom home builders in Palm Beach working on $5M+ estates\"\n\"Luxury interior designers in Miami on active high-end residential builds\"\n\"High-net-worth homeowners in Naples building or renovating 7,000+ sq ft homes\""}
            style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"14px 18px", color:C.text, fontSize:14, outline:"none", resize:"vertical", lineHeight:1.6, fontFamily:"'DM Mono',monospace" }}/>
          <div style={{ display:"flex", gap:12, alignItems:"center", marginTop:12, flexWrap:"wrap" }}>
            <button onClick={findLeads} disabled={finding||!query.trim()} style={{ ...btn("gold"), padding:"12px 28px", fontSize:14 }}>
              {finding?<span style={{ display:"flex", alignItems:"center", gap:8 }}><Spinner/> Searching…</span>:"Find Leads →"}
            </button>
            {finding&&<span style={{ fontSize:12, color:C.gold, fontFamily:"'DM Mono',monospace" }}>{findStatus||"Starting…"}</span>}
            {findErr&&<span style={{ color:C.red, fontSize:12, fontFamily:"'DM Mono',monospace" }}>{findErr}</span>}
          </div>
          {finding&&(
            <div style={{ marginTop:16, background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 16px" }}>
              <div style={{ fontSize:11, color:C.muted, fontFamily:"'DM Mono',monospace", marginBottom:8 }}>This takes 30–60 seconds…</div>
              {[["🔍 Searching the web for leads…",true],["⚙️ Formatting lead data…",findStatus==="⚙️ Formatting lead data…"]].map(([step,active])=>(
                <div key={step} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:active?C.gold:C.border, boxShadow:active?`0 0 6px ${C.gold}`:undefined }}/>
                  <span style={{ fontSize:12, color:active?C.gold:C.muted, fontFamily:"'DM Mono',monospace" }}>{step}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop:40 }}>
            <div style={{ fontSize:11, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>Quick searches</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {["Luxury custom home builders Palm Beach Florida active projects","High-end residential interior designers Miami working on $5M+ homes","Luxury real estate developers South Florida active residential builds","Custom home builders Naples Florida 7000+ sq ft estates","Luxury homeowners Boca Raton renovating or building new construction","High-end architects Miami Dade designing luxury residential properties"].map(q=>(
                <button key={q} onClick={()=>setQuery(q)} style={{ ...btn(), fontSize:11, padding:"5px 12px", color:C.muted }}>{q}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {view==="pipeline"&&(
        <div style={{ maxWidth:1080, margin:"0 auto", padding:"36px 32px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28 }}>
            <div>
              <div style={{ fontSize:11, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>Pipeline</div>
              <h2 style={{ fontSize:26, fontWeight:300, color:C.gold, margin:0 }}>{leads.length} Leads</h2>
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <button onClick={()=>setView("find")} style={btn()}>+ New Search</button>
              {leads.length>0&&<><button onClick={exportCSV} style={btn()}>⬇ CSV</button><button onClick={openInSheets} style={btn()}>📊 Sheets</button></>}
              <button onClick={runAll} disabled={leads.every(l=>l.status!=="pending")} style={btn("gold")}>⚡ Run All</button>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:28 }}>
            {[["Total",leads.length,C.text],["Researched",leads.filter(l=>l.research).length,C.gold],["Qualified 7+",qualified,C.green],["In HubSpot",leads.filter(l=>l.status==="pushed").length,"#60a5fa"]].map(([label,val,color])=>(
              <div key={label} style={{ ...card, textAlign:"center", padding:14 }}>
                <div style={{ fontSize:26, fontWeight:700, color, fontFamily:"'DM Mono',monospace" }}>{val}</div>
                <div style={{ fontSize:10, color:C.muted, letterSpacing:"0.08em", textTransform:"uppercase", marginTop:3 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {leads.map(lead=>(
              <div key={lead.id} style={{ ...card, animation:"fadeIn 0.3s ease" }}>
                <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                  {lead.research?<ScoreRing score={lead.research.score}/>:(
                    <div style={{ width:50, height:50, minWidth:50, borderRadius:"50%", border:`2px dashed ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <span style={{ fontSize:10, color:C.muted }}>?</span>
                    </div>
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                      <span style={{ fontSize:16, fontWeight:600 }}>{lead.name}</span>
                      <span style={tag(lead.type==="B2B"?"#818cf8":"#f472b6")}>{lead.type}</span>
                      {lead.status==="researching"&&<span style={tag(C.gold)}>Researching…</span>}
                      {lead.status==="drafting"&&<span style={tag(C.gold)}>Drafting…</span>}
                      {lead.status==="done"&&<span style={tag(C.green)}>Ready</span>}
                      {lead.status==="pushed"&&<span style={tag("#60a5fa")}>In HubSpot ✓</span>}
                      {lead.status==="error"&&<span style={tag(C.red)} title={lead.errorMsg}>Error</span>}
                      {lead.enriched&&<span style={tag(C.green)}>Enriched ✓</span>}
                      {lead.research?.estimatedDealSize&&<span style={tag(C.gold)}>{lead.research.estimatedDealSize}</span>}
                    </div>
                    <div style={{ fontSize:12, color:C.muted, fontFamily:"'DM Mono',monospace" }}>
                      {[lead.role,lead.company,lead.location].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", justifyContent:"flex-end" }}>
                    {lead.status==="pending"&&<button onClick={()=>runPipeline(lead.id)} style={btn("gold")}>Research + Draft</button>}
                    {lead.status==="researched"&&<button onClick={()=>draftOutreach(lead.id)} style={btn("gold")}>✍ Draft Outreach</button>}
                    {!lead.enriched&&lead.status!=="researching"&&lead.status!=="drafting"&&(
                      <button onClick={()=>enrichLead(lead.id)} disabled={!!lead.enriching} style={btn()}>
                        {lead.enriching?<Spinner/>:"🔬 Enrich"}
                      </button>
                    )}
                    {lead.outreach&&lead.status!=="pushed"&&lead.status!=="pushing"&&(
                      <button onClick={()=>pushToHubSpot(lead.id)} style={btn("green")}>→ HubSpot</button>
                    )}
                    {lead.status==="pushing"&&<span style={{ ...btn(), opacity:0.5, display:"flex", alignItems:"center" }}><Spinner/></span>}
                    <button onClick={()=>setExpanded(expanded===lead.id?null:lead.id)} style={btn()}>{expanded===lead.id?"▲":"▼"}</button>
                  </div>
                </div>
                {expanded===lead.id&&(
                  <div style={{ marginTop:18, borderTop:`1px solid ${C.border}`, paddingTop:18, animation:"fadeIn 0.2s ease" }}>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:lead.outreach?20:0 }}>
                      <div>
                        <div style={{ fontSize:10, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>Research</div>
                        {!lead.research?<p style={{ color:C.muted, fontSize:12, fontFamily:"'DM Mono',monospace" }}>Click "Research + Draft" to begin.</p>:(
                          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                            {[["Scoring",lead.research.scoringReason],["Ideal product",lead.research.idealProduct,true],["Deal size",lead.research.estimatedDealSize,true],["Company size",lead.research.companySize],["Recent news",lead.research.recentNews]].filter(([,v])=>v).map(([k,v,hi])=>(
                              <div key={k}>
                                <div style={{ fontSize:10, color:C.muted, marginBottom:2 }}>{k}</div>
                                <div style={{ fontSize:12, color:hi?C.gold:C.text, fontFamily:"'DM Mono',monospace", lineHeight:1.5 }}>{v}</div>
                              </div>
                            ))}
                            {lead.research.personalHooks?.map((h,i)=>(
                              <div key={i} style={{ fontSize:12, color:C.goldLight }}>✦ {h}</div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize:10, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>Contact</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                          {[["Email",lead.email],["Phone",lead.phone],["LinkedIn",lead.linkedin],["Website",lead.website]].map(([k,v])=>v&&v!=="Not found"?(
                            <div key={k} style={{ display:"flex", gap:8 }}>
                              <span style={{ fontSize:10, color:C.muted, width:56, paddingTop:1 }}>{k}</span>
                              {v?.startsWith("http")?<a href={v} target="_blank" rel="noreferrer" style={{ fontSize:12, color:"#60a5fa", fontFamily:"'DM Mono',monospace", wordBreak:"break-all" }}>{v}</a>:<span style={{ fontSize:12, color:C.text, fontFamily:"'DM Mono',monospace" }}>{v}</span>}
                            </div>
                          ):null)}
                        </div>
                      </div>
                    </div>
                    {lead.outreach&&<OutreachPanel outreach={lead.outreach} bookingLink={bookingLink}/>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {view==="settings"&&(
        <div style={{ maxWidth:560, margin:"60px auto", padding:"0 32px", animation:"fadeIn 0.3s ease" }}>
          <div style={{ fontSize:11, color:C.muted, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:6 }}>Configuration</div>
          <h2 style={{ fontSize:28, fontWeight:300, color:C.gold, margin:"0 0 28px" }}>Settings</h2>
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <Field label="Your Name" value={senderName} onChange={setSenderName} placeholder="Daniel"/>
            <Field label="Your Title" value={senderTitle} onChange={setSenderTitle} placeholder="Founder, Hydra Home Wellness"/>
            <Field label="Your Email" value={senderEmail} onChange={setSenderEmail} placeholder="daniel@hydrawellness.com"/>
            <Field label="Booking Link" value={bookingLink} onChange={setBookingLink} placeholder="https://calendly.com/your-link" hint="Calendly or Cal.com — embedded in all outreach"/>
            <Field label="Apollo.io API Key" value={apolloKey} onChange={setApolloKey} type="password" placeholder="Your Apollo API key" hint="apollo.io → Settings → Integrations → API"/>
            <Field label="HubSpot Token" value={hsKey} onChange={setHsKey} type="password" placeholder="pat-na1-xxxxxxxx" hint="HubSpot → Settings → Legacy Apps → Hydra Lead Gen → Auth tab"/>
          </div>
          <div style={{ marginTop:24, padding:14, background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, fontSize:12, color:C.muted, fontFamily:"'DM Mono',monospace", lineHeight:1.6 }}>
            ⚠ API keys reset each session here. On Vercel they will be saved permanently as environment variables.
          </div>
        </div>
      )}
    </div>
  );
}
