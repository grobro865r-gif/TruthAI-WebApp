const chatEl = document.querySelector("#chat");
const promptEl = document.querySelector("#prompt");
const sendBtn = document.querySelector("#sendBtn");
const providerEl = document.querySelector("#provider");
const webToggle = document.querySelector("#webToggle");
const fileInput = document.querySelector("#fileInput");
const filePreview = document.querySelector("#filePreview");
const statusDot = document.querySelector("#statusDot");
const statusText = document.querySelector("#statusText");
const sidebar = document.querySelector(".sidebar");

let messages = [];
let attachedText = "";

const esc = (s) => String(s)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function saveHistory() {
  localStorage.setItem("truthai_history", JSON.stringify(messages.slice(-40)));
}

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem("truthai_history") || "[]");
    if (Array.isArray(saved) && saved.length) {
      messages = saved;
      renderAll();
    }
  } catch {}
}

function renderAll() {
  chatEl.innerHTML = "";
  if (!messages.length) {
    chatEl.innerHTML = `
      <div class="welcome">
        <div class="welcome-logo">T</div>
        <h1>What do you want to know?</h1>
        <p>Current facts are checked against the web when verification is on. Sources appear below grounded answers.</p>
        <div class="chips">
          <button class="chip">Germany shoe designer jobs</button>
          <button class="chip">Explain this in Roman Urdu</button>
          <button class="chip">Compare two technologies</button>
          <button class="chip">Research a topic deeply</button>
        </div>
      </div>`;
    bindChips();
    return;
  }

  for (const m of messages) addMessage(m.role, m.content, m.sources || []);
  scrollBottom();
}

function addMessage(role, content, sources = []) {
  const wrap = document.createElement("div");
  wrap.className = `message ${role === "user" ? "user" : "ai"}`;
  const avatar = role === "user" ? "You" : "T";
  const sourceHtml = sources?.length
    ? `<div class="sources">${sources.map(s =>
        `<a class="source" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">↗ ${esc(s.title || s.url)}</a>`
      ).join("")}</div>`
    : "";
  wrap.innerHTML = `
    <div class="avatar">${avatar}</div>
    <div class="bubble">${esc(content)}${sourceHtml}</div>`;
  chatEl.appendChild(wrap);
  return wrap;
}

function scrollBottom() {
  requestAnimationFrame(() => chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: "smooth" }));
}

function bindChips() {
  document.querySelectorAll(".chip").forEach(btn => {
    btn.onclick = () => {
      promptEl.value = btn.textContent;
      autoResize();
      promptEl.focus();
    };
  });
}

async function send() {
  let text = promptEl.value.trim();
  if (!text || sendBtn.disabled) return;

  if (attachedText) {
    text += `\n\n[Attached file: ${filePreview.dataset.name || "file"}]\n${attachedText}`;
  }

  const userMessage = { role: "user", content: text };
  messages.push(userMessage);
  addMessage("user", text);
  saveHistory();

  promptEl.value = "";
  attachedText = "";
  filePreview.classList.add("hidden");
  autoResize();
  sendBtn.disabled = true;

  const typing = addMessage("assistant", "Researching and thinking…");
  typing.querySelector(".bubble").classList.add("typing");
  scrollBottom();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        provider: providerEl.value,
        web: webToggle.checked
      })
    });

    const data = await response.json();
    typing.remove();

    if (!response.ok) throw new Error(data.error || "Request failed.");

    const aiMessage = {
      role: "assistant",
      content: data.answer,
      sources: data.sources || [],
      provider: data.provider
    };
    messages.push(aiMessage);
    addMessage("assistant", aiMessage.content, aiMessage.sources);
    saveHistory();
  } catch (err) {
    typing.querySelector(".bubble").classList.remove("typing");
    typing.querySelector(".bubble").innerHTML = `<span class="error">${esc(err.message)}</span>`;
  } finally {
    sendBtn.disabled = false;
    scrollBottom();
  }
}

async function checkStatus() {
  try {
    const r = await fetch("/api/status");
    const s = await r.json();
    const active = providerEl.value === "gemini" ? s.gemini : s.openai;
    statusDot.className = `status-dot ${active ? "ok" : "bad"}`;
    statusText.textContent = active ? `${providerEl.value === "gemini" ? "Gemini" : "OpenAI"} connected` : "API key not configured";
  } catch {
    statusDot.className = "status-dot bad";
    statusText.textContent = "Server unavailable";
  }
}

async function attachFile(file) {
  if (!file) return;
  filePreview.classList.remove("hidden");
  filePreview.textContent = `Reading ${file.name}…`;
  const form = new FormData();
  form.append("file", file);
  try {
    const r = await fetch("/api/file", { method: "POST", body: form });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    attachedText = data.text;
    filePreview.dataset.name = data.name;
    filePreview.textContent = `Attached: ${data.name}`;
  } catch (e) {
    attachedText = "";
    filePreview.textContent = `File error: ${e.message}`;
  }
}

function autoResize() {
  promptEl.style.height = "auto";
  promptEl.style.height = Math.min(promptEl.scrollHeight, 160) + "px";
}

sendBtn.onclick = send;
promptEl.addEventListener("input", autoResize);
promptEl.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});
document.querySelector("#attachBtn").onclick = () => fileInput.click();
fileInput.onchange = () => attachFile(fileInput.files[0]);
document.querySelector("#newChat").onclick = () => {
  messages = [];
  localStorage.removeItem("truthai_history");
  renderAll();
  sidebar.classList.remove("open");
};
document.querySelector("#clearHistory").onclick = () => {
  messages = [];
  localStorage.removeItem("truthai_history");
  renderAll();
};
document.querySelector("#mobileMenu").onclick = () => sidebar.classList.toggle("open");
providerEl.onchange = checkStatus;

loadHistory();
bindChips();
checkStatus();
autoResize();