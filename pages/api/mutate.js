import { createTask, createDelegated, updateTask, updateDelegate } from "../../lib/notion";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { action, data } = req.body;
  try {
    if (action === "addTask") await createTask(data);
    else if (action === "addDelegated") await createDelegated(data);
    else if (action === "updateTask") await updateTask(data.id, data.changes);
    else if (action === "updateDelegate") await updateDelegate(data.id, data.changes);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
