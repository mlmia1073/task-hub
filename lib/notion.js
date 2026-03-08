import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const MY_TASKS_DB = process.env.MY_TASKS_DB_ID;
const DELEGATED_DB = process.env.DELEGATED_DB_ID;

function pageToTask(page) {
  const props = page.properties;
  return {
    id: page.id,
    text: props.Task?.title?.[0]?.plain_text || "",
    done: props.Done?.checkbox || false,
    priority: props.Priority?.select?.name || "medium",
    category: props.Category?.select?.name || "",
    source: props.Source?.select?.name || "",
    dueDate: props["Due Date"]?.date?.start || null,
    notes: props.Notes?.rich_text?.[0]?.plain_text || "",
  };
}

function pageToDelegate(page) {
  const props = page.properties;
  return {
    id: page.id,
    text: props.Task?.title?.[0]?.plain_text || "",
    assignee: props.Assignee?.select?.name || "",
    status: props.Status?.select?.name || "Pending",
    dueDate: props["Due Date"]?.date?.start || null,
    notes: props.Notes?.rich_text?.[0]?.plain_text || "",
  };
}

export async function getMyTasks() {
  const res = await notion.databases.query({
    database_id: MY_TASKS_DB,
    sorts: [{ property: "Due Date", direction: "ascending" }],
  });
  return res.results.map(pageToTask);
}

export async function getDelegatedTasks() {
  const res = await notion.databases.query({
    database_id: DELEGATED_DB,
    sorts: [{ property: "Due Date", direction: "ascending" }],
  });
  return res.results.map(pageToDelegate);
}

export async function createTask(task) {
  return notion.pages.create({
    parent: { database_id: MY_TASKS_DB },
    properties: {
      Task: { title: [{ text: { content: task.text } }] },
      Done: { checkbox: false },
      Priority: { select: { name: task.priority || "medium" } },
      Category: { select: { name: task.category || "Admin" } },
      Source: { select: { name: task.source || "Memory" } },
      ...(task.dueDate ? { "Due Date": { date: { start: task.dueDate } } } : {}),
      ...(task.notes ? { Notes: { rich_text: [{ text: { content: task.notes } }] } } : {}),
    },
  });
}

export async function createDelegated(item) {
  return notion.pages.create({
    parent: { database_id: DELEGATED_DB },
    properties: {
      Task: { title: [{ text: { content: item.text } }] },
      Assignee: { select: { name: item.assignee } },
      Status: { select: { name: item.status || "Pending" } },
      ...(item.dueDate ? { "Due Date": { date: { start: item.dueDate } } } : {}),
      ...(item.notes ? { Notes: { rich_text: [{ text: { content: item.notes } }] } } : {}),
    },
  });
}

export async function updateTask(id, changes) {
  const props = {};
  if (changes.done !== undefined) props.Done = { checkbox: changes.done };
  if (changes.priority) props.Priority = { sel
