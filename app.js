const STORAGE_KEY = "ship-log.entries.v1";

const form = document.getElementById("entry-form");
const titleInput = document.getElementById("title");
const bodyInput = document.getElementById("body");
const tagsInput = document.getElementById("tags");
const dateInput = document.getElementById("date");
const searchInput = document.getElementById("search");
const feedEl = document.getElementById("feed");
const recapList = document.getElementById("recap-list");
const recapEmpty = document.getElementById("recap-empty");
const recapRange = document.getElementById("recap-range");
const recapStats = document.getElementById("recap-stats");
const todayLabel = document.getElementById("today-label");
const copyRecapBtn = document.getElementById("copy-recap");

let entries = loadEntries();
let range = "week";
let editingId = null;

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return isoFromDate(d);
}

function endOfWeek(start) {
  const d = new Date(`${start}T00:00:00`);
  d.setDate(d.getDate() + 6);
  return isoFromDate(d);
}

function isoFromDate(d) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function formatLong(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatShort(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function parseTags(value) {
  return [...new Set(value.split(/[,#]/).map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function weekEntries(list = entries) {
  const start = startOfWeek(todayISO());
  const end = endOfWeek(start);
  return list.filter((e) => e.date >= start && e.date <= end);
}

function visibleEntries() {
  const q = searchInput.value.trim().toLowerCase();
  const today = todayISO();
  const start = startOfWeek(today);
  const end = endOfWeek(start);

  return entries
    .filter((e) => {
      if (range === "today" && e.date !== today) return false;
      if (range === "week" && (e.date < start || e.date > end)) return false;
      if (!q) return true;
      const hay = `${e.title} ${e.body} ${e.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function render() {
  const today = todayISO();
  todayLabel.textContent = formatLong(today);
  dateInput.max = today;
  if (!dateInput.value) dateInput.value = today;

  const week = weekEntries().sort((a, b) => a.date.localeCompare(b.date));
  const start = startOfWeek(today);
  const end = endOfWeek(start);
  recapRange.textContent = `${formatShort(start)} – ${formatShort(end)}`;

  const tagCounts = {};
  week.forEach((e) => e.tags.forEach((t) => (tagCounts[t] = (tagCounts[t] || 0) + 1)));
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  recapStats.textContent = week.length
    ? `${week.length} logged · ${new Set(week.map((e) => e.date)).size} day${new Set(week.map((e) => e.date)).size === 1 ? "" : "s"}`
    : "";

  recapList.innerHTML = "";
  week.forEach((e) => {
    const li = document.createElement("li");
    li.textContent = `${formatShort(e.date)} — ${e.title}`;
    recapList.appendChild(li);
  });
  if (topTags.length) {
    const li = document.createElement("li");
    li.innerHTML = `<div class="tag-cloud">${topTags
      .map(([t, n]) => `<span class="tag">#${escapeHtml(t)} ${n}</span>`)
      .join("")}</div>`;
    recapList.appendChild(li);
  }
  recapEmpty.hidden = week.length > 0;
  recapList.hidden = week.length === 0;

  const shown = visibleEntries();
  if (!shown.length) {
    feedEl.innerHTML = `<p class="empty">No entries in this view. Log the first thing you shipped today.</p>`;
    return;
  }

  const groups = new Map();
  shown.forEach((e) => {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  });

  feedEl.innerHTML = "";
  groups.forEach((dayEntries, date) => {
    const section = document.createElement("section");
    section.className = "day-group";
    section.innerHTML = `<h3>${formatLong(date)}</h3>`;
    dayEntries.forEach((e) => {
      const article = document.createElement("article");
      article.className = "entry";
      article.innerHTML = `
        <header>
          <h4>${escapeHtml(e.title)}</h4>
          <div class="entry-actions">
            <button type="button" data-edit="${e.id}">Edit</button>
            <button type="button" data-delete="${e.id}">Delete</button>
          </div>
        </header>
        ${e.body ? `<p>${escapeHtml(e.body)}</p>` : ""}
        ${e.tags.length ? `<div class="tags">${e.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join("")}</div>` : ""}
      `;
      section.appendChild(article);
    });
    feedEl.appendChild(section);
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function recapMarkdown() {
  const today = todayISO();
  const start = startOfWeek(today);
  const end = endOfWeek(start);
  const week = weekEntries().sort((a, b) => a.date.localeCompare(b.date));
  const lines = [`# Ship Log · ${formatShort(start)}–${formatShort(end)}`, ""];
  if (!week.length) {
    lines.push("No entries this week.");
    return lines.join("\n");
  }
  let current = "";
  week.forEach((e) => {
    if (e.date !== current) {
      current = e.date;
      lines.push(`## ${formatLong(e.date)}`);
    }
    const tags = e.tags.length ? ` (${e.tags.map((t) => `#${t}`).join(" ")})` : "";
    lines.push(`- **${e.title}**${tags}`);
    if (e.body) lines.push(`  ${e.body.replace(/\n/g, "\n  ")}`);
  });
  return lines.join("\n");
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title) return;
  const payload = {
    title,
    body: bodyInput.value.trim(),
    tags: parseTags(tagsInput.value),
    date: dateInput.value || todayISO(),
  };
  if (editingId) {
    entries = entries.map((e) => (e.id === editingId ? { ...e, ...payload } : e));
    editingId = null;
    document.getElementById("save-btn").textContent = "Log it";
    toast("Entry updated");
  } else {
    entries.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...payload,
    });
    toast("Logged");
  }
  saveEntries();
  form.reset();
  dateInput.value = todayISO();
  titleInput.focus();
  render();
});

titleInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    form.requestSubmit();
  }
});

bodyInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

searchInput.addEventListener("input", render);

document.querySelectorAll(".pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    range = btn.dataset.range;
    document.querySelectorAll(".pill").forEach((b) => b.classList.toggle("is-active", b === btn));
    render();
  });
});

feedEl.addEventListener("click", (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  if (editId) {
    const entry = entries.find((e) => e.id === editId);
    if (!entry) return;
    editingId = editId;
    titleInput.value = entry.title;
    bodyInput.value = entry.body;
    tagsInput.value = entry.tags.join(", ");
    dateInput.value = entry.date;
    document.getElementById("save-btn").textContent = "Save edits";
    titleInput.focus();
  }
  if (deleteId) {
    entries = entries.filter((e) => e.id !== deleteId);
    if (editingId === deleteId) {
      editingId = null;
      form.reset();
      dateInput.value = todayISO();
      document.getElementById("save-btn").textContent = "Log it";
    }
    saveEntries();
    render();
  }
});

copyRecapBtn.addEventListener("click", async () => {
  const text = recapMarkdown();
  try {
    await navigator.clipboard.writeText(text);
    toast("Recap copied");
  } catch {
    toast("Copy failed — select from a weekly export instead");
  }
});

dateInput.value = todayISO();
render();
titleInput.focus();
