import { useState, useEffect, useCallback } from "react";
import Head from "next/head";

const SOURCES = ["Paper", "Email", "Apple Notes", "Slack", "Memory", "Other"];
const CATEGORIES = ["Client", "Team / AM", "Partner", "Admin", "Personal", "Follow-Up"];
const PEOPLE = ["Duda", "Ashley", "Rebecca", "James Race", "John Roberts", "Martyn Rozier", "Other"];

function today() { return new Date().toISOString().split("T")[0]; }

function dueSeverity(dueDate, done) {
  if (done || !dueDate) return null;
  const diff = Math.ceil((new Date(dueDate) - new Date(today())) / 86400000);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 2) return "soon";
  return null;
}

function fmtDate(d) {
  if (!d) return "";
  const diff = Math.ceil((new Date(d) - new Date(today())) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `Due ${new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

const dueBadge = {
  overdue: { bg: "#3b0a0a", color: "#f87171", border: "#7f1d1d" },
  today:   { bg: "#2a1a00", color: "#fbbf24", border: "#78350f" },
  soon:    { bg: "#0f1e2a", color: "#60a5fa", border: "#1e3a5f" },
};
const priorityColor = { high: "#ef4444", medium: "#f59e0b", low: "#6ee7b7" };
const statusColor = { "Pending": "#f59e0b", "In Progress": "#3b82f6", "Done": "#22c55e", "Blocked": "#ef4444" };
const sourceIcon = { "Paper": "📄", "Email": "✉️", "Apple Notes": "🍎", "Slack": "💬", "Memory": "🧠", "Other": "📌" };

export default function TaskHub() {
  const [myTasks, setMyTasks] = useState([]);
  const [delegated, setDelegated] = useState([]);
  const [tab, setTab] = useState("mine");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showDelegate, setShowDelegate] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [newTask, setNewTask] = useState({ text: "", source: "Memory", category: "Admin", priority: "medium", dueDate: today(), notes: "" });
  const [newDel, setNewDel] = useState({ text: "", assignee: PEOPLE[0], status: "Pending", dueDate: "", notes: "" });
  const [toast, setToast] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [digestText, setDigestText] = useState(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [slackModal, setSlackModal] = useState(null);
  const [slackMsg, setSlackMsg] = useState("");
  const [slackTarget, setSlackTarget] = useState(PEOPLE[0]);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const loadTasks = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMyTasks(data.myTasks || []);
      setDelegated(data.delegated || []);
    } catch (e) {
      showToast("Sync failed: " + e.message, "error");
    }
    setSyncing(false);
    setLoading(false);
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  async function mutate(action, data) {
    const res = await fetch("/api/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
  }

  async function addTask() {
    if (!newTask.text.trim()) return;
    setSaving(true);
    try {
      await mutate("addTask", newTask);
      showToast("Task saved to Notion ✓");
      setNewTask({ text: "", source: "Memory", category: "Admin", priority: "medium", dueDate: today(), notes: "" });
      setShowAdd(false);
      await loadTasks();
    } catch (e) { showToast("Failed: " + e.message, "error"); }
    setSaving(false);
  }

  async function addDelegate() {
    if (!newDel.text.trim()) return;
    setSaving(true);
    try {
      await mutate("addDelegated", newDel);
      showToast("Delegated task saved ✓");
      setNewDel({ text: "", assignee: PEOPLE[0], status: "Pending", dueDate: "", notes: "" });
      setShowDelegate(false);
      await loadTasks();
    } catch (e) { showToast("Failed: " + e.message, "error"); }
    setSaving(false);
  }

  async function toggleDone(task) {
    const newDone = !task.done;
    setMyTasks(t => t.map(x => x.id === task.id ? { ...x, done: newDone } : x));
    try { await mutate("updateTask", { id: task.id, changes: { done: newDone } }); }
    catch { showToast("Sync failed", "error"); await loadTasks(); }
  }

  async function updateStatus(item, status) {
    setDelegated(d => d.map(x => x.id === item.id ? { ...x, status } : x));
    try { await mutate("updateDelegate", { id: item.id, changes: { status } }); }
    catch { showToast("Sync failed", "error"); await loadTasks(); }
  }

  async function generateDigest() {
    setDigestLoading(true); setDigestText(null);
    const overdue = myTasks.filter(t => !t.done && t.dueDate && t.dueDate < today());
    const dueToday = myTasks.filter(t => !t.done && t.dueDate === today());
    const upcoming = myTasks.filter(t => !t.done && t.dueDate > today());
    const pending = delegated.filter(d => d.status !== "Done");
    try {
      const res = await fetch("/api/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overdue, dueToday, upcoming, pending })
      });
      const data = await res.json();
      setDigestText(data.text || "Could not generate.");
    } catch { showToast("Digest failed", "error"); }
    setDigestLoading(false);
  }

  async function parseWithAI() {
    if (!aiInput.trim()) return;
    setAiLoading(true); setAiResult(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: aiInput })
      });
      const data = await res.json();
      setAiResult(data.tasks || []);
    } catch { showToast("Parse failed", "error"); }
    setAiLoading(false);
  }

  async function importAITasks() {
    if (!aiResult?.length) return;
    setSaving(true);
    try {
      for (const task of aiResult) await mutate("addTask", task);
      showToast(`${aiResult.length} tasks saved to Notion ✓`);
      setAiResult(null); setAiInput(""); setTab("mine");
      await loadTasks();
    } catch { showToast("Some tasks failed to save", "error"); }
    setSaving(false);
  }

  function openSlack(item, type) {
    setSlackMsg(type === "task"
      ? `Hey — flagging this task: "${item.text}"${item.dueDate ? ` (${fmtDate(item.dueDate)})` : ""}.`
      : `Hi ${item.assignee} — checking in on: "${item.text}"${item.dueDate ? ` (${fmtDate(item.dueDate)})` : ""}. What's the status?`);
    setSlackTarget(item.assignee || PEOPLE[0]);
    setSlackModal({ item, type });
  }

  const filteredTasks = myTasks
    .filter(t => filter === "all" || t.category === filter)
    .filter(t => !search || t.text.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const sev = { overdue: 0, today: 1, soon: 2 };
      const sa = sev[dueSeverity(a.dueDate, a.done)] ?? 3;
      const sb = sev[dueSeverity(b.dueDate, b.done)] ?? 3;
      if (sa !== sb) return sa - sb;
      return ({ high: 0, medium: 1, low: 2 }[a.priority] ?? 1) - ({ high: 0, medium: 1, low: 2 }[b.priority] ?? 1);
    });

  const pendingCount = myTasks.filter(t => !t.done).length;
  const overdueCount = myTasks.filter(t => !t.done && t.dueDate && t.dueDate < today()).length;
  const delegatedPending = delegated.filter(d => d.status !== "Done").length;
  const inp = { background: "#0f0f13", border: "1px solid #2a2a38", borderRadius: 7, color: "#e8e6f0", fontSize: 13, padding: "8px 12px", fontFamily: "inherit" };
  const TABS = [["digest","☀️ Morning"],["mine",`Tasks${overdueCount>0?" 🔴":""} (${pendingCount})`],["delegated",`Delegated (${delegatedPending})`],["import","✦ Import"]];

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#0f0f13", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif", color:"#e8e6f0" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:13, color:"#7c6ef7", marginBottom:8 }}>Connecting to Notion...</div>
        <div style={{ fontSize:11, color:"#333348" }}>Loading your tasks</div>
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>Mickey's Task Hub</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0} body{background:#0f0f13;color:#e8e6f0;font-family:'DM Sans','Helvetica Neue',sans-serif}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#1a1a23} ::-webkit-scrollbar-thumb{background:#3a3a50;border-radius:4px}
        .hov:hover{background:#1c1c28!important} button{transition:opacity 0.15s;cursor:pointer;font-family:inherit} button:hover{opacity:0.82}
        input:focus,textarea:focus,select:focus{outline:none;border-color:#7c6ef7!important}
      `}</style>

      <div style={{ background:"#13131c", borderBottom:"1px solid #1e1e2a", padding:"16px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50 }}>
        <div>
          <div style={{ fontSize:10, letterSpacing:"0.2em", color:"#7c6ef7", fontWeight:600, textTransform:"uppercase", marginBottom:2 }}>Notion-Backed</div>
          <div style={{ fontSize:19, fontWeight:600, letterSpacing:"-0.02em" }}>Mickey's Task Hub</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {overdueCount>0 && <div style={{ background:"#3b0a0a", border:"1px solid #7f1d1d", borderRadius:6, padding:"5px 10px", fontSize:11, color:"#f87171", fontWeight:600 }}>⚠ {overdueCount} overdue</div>}
          <div style={{ background:"#1a1a23", borderRadius:6, padding:"5px 10px", fontSize:11, color:"#888" }}>
            <span style={{ color:"#7c6ef7", fontWeight:600 }}>{pendingCount}</span> open · <span style={{ color:"#f59e0b", fontWeight:600 }}>{delegatedPending}</span> awaiting
          </div>
          <button onClick={loadTasks} disabled={syncing} style={{ background:"#1a1a23", border:"1px solid #2a2a38", borderRadius:6, padding:"5px 10px", fontSize:11, color:syncing?"#7c6ef7":"#666", fontWeight:600 }}>
            {syncing?"Syncing...":"↻ Sync"}
          </button>
        </div>
      </div>

      <div style={{ maxWidth:860, margin:"0 auto", padding:"22px 18px" }}>
        <div style={{ display:"flex", gap:3, marginBottom:20, flexWrap:"wrap" }}>
          {TABS.map(([key,label]) => (
            <button key={key} onClick={()=>setTab(key)} style={{ background:tab===key?"#7c6ef7":"#13131c", color:tab===key?"#fff":"#666", border:"1px solid "+(tab===key?"#7c6ef7":"#1e1e2a"), borderRadius:7, padding:"7px 15px", fontSize:12, fontWeight:600 }}>{label}</button>
          ))}
        </div>

        {tab==="digest" && (
          <div>
            <div style={{ background:"#13131c", border:"1px solid #1e1e2a", borderRadius:14, padding:22, marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:10, color:"#7c6ef7", fontWeight:600, letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:3 }}>Morning Briefing</div>
                  <div style={{ fontSize:16, fontWeight:600 }}>{new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</div>
                </div>
                <button onClick={generateDigest} disabled={digestLoading} style={{ background:"#7c6ef7", color:"#fff", border:"none", borderRadius:8, padding:"8px 18px", fontSize:13, fontWeight:600, opacity:digestLoading?0.6:1 }}>
                  {digestLoading?"Generating...":digestText?"Refresh ↺":"Generate Briefing"}
                </button>
              </div>
              {digestText
                ? <div style={{ fontSize:13.5, lineHeight:1.8, color:"#c0bdd4", whiteSpace:"pre-wrap", borderTop:"1px solid #1e1e2a", paddingTop:16 }}>{digestText}</div>
                : <div style={{ fontSize:13, color:"#3a3a50", fontStyle:"italic" }}>Hit "Generate Briefing" for your AI morning standup based on your live Notion tasks.</div>}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
              {[
                {label:"Overdue",value:overdueCount,color:"#f87171",bg:"#3b0a0a",border:"#7f1d1d"},
                {label:"Due Today",value:myTasks.filter(t=>!t.done&&t.dueDate===today()).length,color:"#fbbf24",bg:"#2a1a00",border:"#78350f"},
                {label:"Awaiting Others",value:delegatedPending,color:"#60a5fa",bg:"#0a1628",border:"#1e3a5f"},
              ].map(c=>(
                <div key={c.label} style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:10, padding:"14px 18px" }}>
                  <div style={{ fontSize:26, fontWeight:700, color:c.color, fontFamily:"'DM Mono',monospace" }}>{c.value}</div>
                  <div style={{ fontSize:11, color:c.color, opacity:0.65, marginTop:2 }}>{c.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab==="mine" && (
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tasks..." style={{ ...inp, flex:1, minWidth:130 }} />
              <select value={filter} onChange={e=>setFilter(e.target.value)} style={{ ...inp, cursor:"pointer" }}>
                <option value="all">All Categories</option>
                {CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
              <button onClick={()=>setShowAdd(!showAdd)} style={{ background:"#7c6ef7", color:"#fff", border:"none", borderRadius:8, padding:"8px 15px", fontSize:13, fontWeight:600 }}>+ Add</button>
            </div>
            {showAdd && (
              <div style={{ background:"#13131c", border:"1px solid #7c6ef7", borderRadius:12, padding:16, marginBottom:12 }}>
                <input value={newTask.text} onChange={e=>setNewTask(n=>({...n,text:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addTask()} placeholder="What needs to get done?" autoFocus style={{ ...inp, width:"100%", fontSize:14, marginBottom:10 }} />
                <input value={newTask.notes} onChange={e=>setNewTask(n=>({...n,notes:e.target.value}))} placeholder="Notes (optional)" style={{ ...inp, width:"100%", marginBottom:10 }} />
                <div style={{ display:"flex", gap:7, flexWrap:"wrap", alignItems:"center" }}>
                  {[["source",SOURCES],["category",CATEGORIES]].map(([f,opts])=>(
                    <select key={f} value={newTask[f]} onChange={e=>setNewTask(n=>({...n,[f]:e.target.value}))} style={inp}>{opts.map(o=><option key={o}>{o}</option>)}</select>
                  ))}
                  <select value={newTask.priority} onChange={e=>setNewTask(n=>({...n,priority:e.target.value}))} style={inp}>{["high","medium","low"].map(p=><option key={p}>{p}</option>)}</select>
                  <input type="date" value={newTask.dueDate} onChange={e=>setNewTask(n=>({...n,dueDate:e.target.value}))} style={inp} />
                  <button onClick={addTask} disabled={saving} style={{ background:"#7c6ef7", color:"#fff", border:"none", borderRadius:7, padding:"7px 15px", fontSize:12, fontWeight:600, opacity:saving?0.6:1 }}>{saving?"Saving...":"Save to Notion"}</button>
                  <button onClick={()=>setShowAdd(false)} style={{ background:"none", border:"1px solid #2a2a38", color:"#777", borderRadius:7, padding:"7px 12px", fontSize:12 }}>Cancel</button>
                </div>
              </div>
            )}
            <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
              {filteredTasks.length===0 && <div style={{ textAlign:"center", color:"#333348", padding:"38px 0", fontSize:14 }}>No tasks found.</div>}
              {filteredTasks.map(task=>{
                const sev=dueSeverity(task.dueDate,task.done); const badge=sev?dueBadge[sev]:null;
                return (
                  <div key={task.id} style={{ borderRadius:9, background:task.done?"#0d0d11":"#13131c", border:"1px solid "+(sev&&!task.done?(badge?.border||"#1e1e2a"):(task.done?"#181820":"#1e1e2a")), opacity:task.done?0.42:1 }}>
                    <div className="hov" style={{ display:"flex", alignItems:"flex-start", gap:11, padding:"11px 13px" }}>
                      <div onClick={()=>toggleDone(task)} style={{ width:16, height:16, borderRadius:4, border:"2px solid "+(task.done?"#7c6ef7":"#333348"), background:task.done?"#7c6ef7":"transparent", cursor:"pointer", flexShrink:0, marginTop:2, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, color:"#fff" }}>{task.done?"✓":""}</div>
                      <div style={{ flex:1, minWidth:0, cursor:"pointer" }} onClick={()=>setExpandedId(expandedId===task.id?null:task.id)}>
                        <div style={{ fontSize:13.5, textDecoration:task.done?"line-through":"none", color:task.done?"#3a3a50":"#e0ddf0" }}>{task.text}</div>
                        <div style={{ display:"flex", gap:5, marginTop:5, flexWrap:"wrap", alignItems:"center" }}>
                          {task.source && <span style={{ fontSize:11, background:"#1a1a23", borderRadius:4, padding:"2px 6px", color:"#666" }}>{sourceIcon[task.source]} {task.source}</span>}
                          {task.category && <span style={{ fontSize:11, background:"#1a1a23", borderRadius:4, padding:"2px 6px", color:"#666" }}>{task.category}</span>}
                          {task.priority && <span style={{ fontSize:11, color:priorityColor[task.priority], fontWeight:600 }}>● {task.priority}</span>}
                          {task.dueDate && <span style={{ fontSize:11, background:badge?.bg||"#181820", color:badge?.color||"#444458", borderRadius:4, padding:"2px 6px", fontWeight:sev?600:400 }}>{fmtDate(task.dueDate)}</span>}
                        </div>
                      </div>
                      <button onClick={()=>openSlack(task,"task")} style={{ background:"#1a1a23", border:"1px solid #222230", borderRadius:5, color:"#666", fontSize:11, padding:"3px 7px", flexShrink:0 }}>💬</button>
                    </div>
                    {expandedId===task.id && task.notes && (
                      <div style={{ padding:"0 13px 12px 40px", fontSize:12, color:"#666680", lineHeight:1.6, borderTop:"1px solid #1a1a23" }}>{task.notes}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab==="delegated" && (
          <div>
            <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
              <button onClick={()=>setShowDelegate(!showDelegate)} style={{ background:"#7c6ef7", color:"#fff", border:"none", borderRadius:8, padding:"8px 16px", fontSize:13, fontWeight:600 }}>+ Log Delegated Task</button>
            </div>
            {showDelegate && (
              <div style={{ background:"#13131c", border:"1px solid #7c6ef7", borderRadius:12, padding:16, marginBottom:12 }}>
                <input value={newDel.text} onChange={e=>setNewDel(n=>({...n,text:e.target.value}))} placeholder="What did you ask them to do?" autoFocus style={{ ...inp, width:"100%", fontSize:14, marginBottom:10 }} />
                <input value={newDel.notes} onChange={e=>setNewDel(n=>({...n,notes:e.target.value}))} placeholder="Notes / context (optional)" style={{ ...inp, width:"100%", marginBottom:10 }} />
                <div style={{ display:"flex", gap:7, flexWrap:"wrap", alignItems:"center" }}>
                  <select value={newDel.assignee} onChange={e=>setNewDel(n=>({...n,assignee:e.target.value}))} style={inp}>{PEOPLE.map(p=><option key={p}>{p}</option>)}</select>
                  <select value={newDel.status} onChange={e=>setNewDel(n=>({...n,status:e.target.value}))} style={inp}>{["Pending","In Progress","Done","Blocked"].map(s=><option key={s}>{s}</option>)}</select>
                  <input type="date" value={newDel.dueDate} onChange={e=>setNewDel(n=>({...n,dueDate:e.target.value}))} style={inp} />
                  <button onClick={addDelegate} disabled={saving} style={{ background:"#7c6ef7", color:"#fff", border:"none", borderRadius:7, padding:"7px 15px", fontSize:12, fontWeight:600, opacity:saving?0.6:1 }}>{saving?"Saving...":"Save to Notion"}</button>
                  <button onClick={()=>setShowDelegate(false)} style={{ background:"none", border:"1px solid #2a2a38", color:"#777", borderRadius:7, padding:"7px 12px", fontSize:12 }}>Cancel</button>
                </div>
              </div>
            )}
            <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
              {delegated.length===0 && <div style={{ textAlign:"center", color:"#333348", padding:"38px 0", fontSize:14 }}>No delegated tasks yet.</div>}
              {delegated.map(item=>{
                const sev=dueSeverity(item.dueDate,item.status==="Done"); const badge=sev?dueBadge[sev]:null;
                return (
                  <div key={item.id} className="hov" style={{ display:"flex", alignItems:"flex-start", gap:11, padding:"12px 13px", borderRadius:9, background:"#13131c", border:"1px solid "+(sev?(badge?.border||"#1e1e2a"):"#1e1e2a"), opacity:item.status==="Done"?0.42:1 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:statusColor[item.status]||"#555", flexShrink:0, marginTop:5 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13.5 }}>{item.text}</div>
                      {item.notes && <div style={{ fontSize:12, color:"#444458", marginTop:3 }}>{item.notes}</div>}
                      <div style={{ display:"flex", gap:7, marginTop:6, alignItems:"center", flexWrap:"wrap" }}>
                        <span style={{ fontSize:12, background:"#1a1a23", borderRadius:4, padding:"2px 8px", color:"#888" }}>→ {item.assignee}</span>
                        <select value={item.status} onChange={e=>updateStatus(item,e.target.value)} style={{ background:"#1a1a23", border:"none", borderRadius:4, color:statusColor[item.status]||"#888", fontSize:11, padding:"2px 7px", fontFamily:"inherit", fontWeight:600, cursor:"pointer" }}>
                          {["Pending","In Progress","Done","Blocked"].map(s=><option key={s}>{s}</option>)}
                        </select>
                        {item.dueDate && <span style={{ fontSize:11, background:badge?.bg||"#181820", color:badge?.color||"#444458", borderRadius:4, padding:"2px 6px", fontWeight:sev?600:400 }}>{fmtDate(item.dueDate)}</span>}
                      </div>
                    </div>
                    <button onClick={()=>openSlack(item,"delegate")} style={{ background:"#1a1a23", border:"1px solid #222230", borderRadius:5, color:"#666", fontSize:11, padding:"3px 8px", flexShrink:0 }}>💬 Chase</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab==="import" && (
          <div style={{ background:"#13131c", border:"1px solid #1e1e2a", borderRadius:14, padding:22 }}>
            <div style={{ fontSize:10, color:"#7c6ef7", fontWeight:600, letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:5 }}>✦ AI Task Extraction</div>
            <div style={{ fontSize:13, color:"#555568", marginBottom:14 }}>Paste anything — email, Apple Notes, brain dump. Extracts every action item and saves to Notion.</div>
            <textarea value={aiInput} onChange={e=>setAiInput(e.target.value)} placeholder="Paste your notes, emails, or brain dump here..."
              style={{ width:"100%", background:"#0f0f13", border:"1px solid #1e1e2a", borderRadius:8, color:"#e8e6f0", fontSize:13, padding:"12px 14px", resize:"vertical", minHeight:120, fontFamily:"inherit", lineHeight:1.65 }} />
            <div style={{ display:"flex", gap:10, marginTop:12 }}>
              <button onClick={parseWithAI} disabled={aiLoading||!aiInput.trim()} style={{ background:"#7c6ef7", color:"#fff", border:"none", borderRadius:7, padding:"9px 20px", fontSize:13, fontWeight:600, opacity:(!aiInput.trim()||aiLoading)?0.5:1 }}>
                {aiLoading?"Extracting...":"Extract Tasks"}
              </button>
              {aiInput && <button onClick={()=>{setAiInput("");setAiResult(null);}} style={{ background:"none", border:"1px solid #1e1e2a", color:"#666", borderRadius:7, padding:"9px 14px", fontSize:12 }}>Clear</button>}
            </div>
            {aiResult && (
              <div style={{ marginTop:16, background:"#0f0f13", borderRadius:10, border:"1px solid #1e1e2a", padding:14 }}>
                <div style={{ fontSize:11, color:"#6ee7b7", fontWeight:600, marginBottom:10 }}>Found {aiResult.length} tasks:</div>
                {aiResult.map((t,i)=>(
                  <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"6px 0", borderBottom:"1px solid #181820" }}>
                    <span style={{ fontSize:10, color:priorityColor[t.priority], marginTop:3 }}>●</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13 }}>{t.text}</div>
                      <div style={{ fontSize:11, color:"#444458", marginTop:2 }}>{sourceIcon[t.source]} {t.source} · {t.category} · {t.priority}</div>
                    </div>
                  </div>
                ))}
                <button onClick={importAITasks} disabled={saving} style={{ marginTop:12, background:"#22c55e", color:"#fff", border:"none", borderRadius:7, padding:"8px 18px", fontSize:13, fontWeight:600, opacity:saving?0.6:1 }}>
                  {saving?"Saving to Notion...":"Save All to Notion →"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {slackModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.72)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:20 }}>
          <div style={{ background:"#13131c", border:"1px solid #2a2a38", borderRadius:14, padding:24, width:"100%", maxWidth:460 }}>
            <div style={{ fontSize:10, color:"#7c6ef7", fontWeight:600, letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:4 }}>Send Slack Message</div>
            <div style={{ fontSize:13, color:"#555568", marginBottom:16 }}>"{slackModal.item.text}"</div>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:"#555568", marginBottom:5 }}>To:</div>
              <select value={slackTarget} onChange={e=>setSlackTarget(e.target.value)} style={{ ...inp, width:"100%" }}>{PEOPLE.map(p=><option key={p}>{p}</option>)}</select>
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:"#555568", marginBottom:5 }}>Message:</div>
              <textarea value={slackMsg} onChange={e=>setSlackMsg(e.target.value)} rows={4} style={{ ...inp, width:"100%", resize:"vertical" }} />
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>{navigator.clipboard?.writeText(slackMsg); showToast("Copied — paste into Slack ✓"); setSlackModal(null);}}
                style={{ background:"#4a90e2", color:"#fff", border:"none", borderRadius:8, padding:"9px 20px", fontSize:13, fontWeight:600, flex:1 }}>Copy Message</button>
              <button onClick={()=>setSlackModal(null)} style={{ background:"none", border:"1px solid #2a2a38", color:"#777", borderRadius:8, padding:"9px 16px", fontSize:13 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position:"fixed", bottom:22, left:"50%", transform:"translateX(-50%)", background:toast.type==="error"?"#ef4444":"#22c55e", color:"#fff", borderRadius:8, padding:"10px 20px", fontSize:13, fontWeight:600, boxShadow:"0 4px 24px rgba(0,0,0,0.5)", zIndex:999, whiteSpace:"nowrap" }}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
