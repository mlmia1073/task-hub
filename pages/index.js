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
        <div style={{ fontSize:13, color:"#7c6ef7", marginBottom
