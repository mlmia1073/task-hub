import { getMyTasks, getDelegatedTasks } from "../../lib/notion";

export default async function handler(req, res) {
  try {
    const [myTasks, delegated] = await Promise.all([
      getMyTasks(),
      getDelegatedTasks()
    ]);
    res.status(200).json({ myTasks, delegated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
