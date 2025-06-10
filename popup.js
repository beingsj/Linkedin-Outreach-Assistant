// Use DOMContentLoaded to ensure script runs after popup HTML is loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log("✅ popup.js initialized");

  const $ = id => document.getElementById(id);
  const clientSelect = $("clientSelect");
  const templateSelect = $("templateSelect");
  const templateText = $("templateText");
  const renameBtn = $("renameTemplate");
  const defaultChk = $("defaultTemplateCheckbox");
  const previewBox = $("previewBox");
  const logList = $("logList");
  const statsBox = $("statsBox");

  let {
    clients = [],
    activeClient = null,
    logs = [],
    previewProfile = null,
    queue = []
  } = await chrome.storage.local.get([
    "clients",
    "activeClient",
    "logs",
    "previewProfile",
    "queue"
  ]);

  // --------------------------- Render Functions ---------------------------

  function renderClients() {
    clientSelect.innerHTML = "";
    clients.forEach(c => {
      const opt = new Option(c.name, c.id, c.id === activeClient, c.id === activeClient);
      clientSelect.add(opt);
    });
    clientSelect.value = activeClient;
    renderTemplates();
  }

  function renderTemplates() {
    const client = clients.find(c => c.id === clientSelect.value);
    if (!client) return;
    templateSelect.innerHTML = "";
    client.templates = client.templates || [];
    client.templates.forEach((t, i) => {
      const opt = new Option(t.name, i);
      templateSelect.add(opt);
    });
    const defaultIndex = client.defaultIndex ?? 0;
    templateSelect.value = defaultIndex;
    templateText.value = client.templates[defaultIndex]?.content || "";
    defaultChk.checked = (defaultIndex == templateSelect.value);
    updatePreview();
  }

  function updatePreview() {
    const tmpl = templateText.value;
    const mock = { firstName: "John", title: "Product Manager", company: "Stripe", tag: "SaaS Founder" };
    const data = previewProfile || mock;
    let result = tmpl;
    Object.entries(data).forEach(([k, v]) => {
      result = result.replaceAll(`{${k}}`, v);
    });
    previewBox.textContent = result;
  }

  function renderLogs() {
    logList.innerHTML = "";
    logs.forEach((log, i) => {
      const li = document.createElement("li");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = log.replied || false;
      checkbox.onchange = () => {
        logs[i].replied = checkbox.checked;
        chrome.storage.local.set({ logs });
        renderStats();
      };
      li.appendChild(checkbox);
      li.append(` ${log.datetime} — ${log.clientName} → ${log.name}`);
      logList.appendChild(li);
    });
  }

  function renderStats() {
    const total = logs.length;
    const replied = logs.filter(l => l.replied).length;
    const rate = total ? ((replied / total) * 100).toFixed(1) : 0;
    statsBox.innerHTML = `<p><b>Total:</b> ${total} | <b>Replied:</b> ${replied} | <b>Rate:</b> ${rate}%</p>`;
  }

  // --------------------------- Top Profiles ---------------------------

  async function renderTopProfiles() {
    const { visitLogs = {} } = await chrome.storage.local.get("visitLogs");
    const entries = Object.values(visitLogs);
    entries.sort((a, b) => b.totalTime - a.totalTime);
    const list = $("topProfilesList");
    list.innerHTML = "";
    entries.slice(0, 10).forEach(v => {
      const li = document.createElement("li");
      li.textContent = `${v.name} — ${v.count}×, ${Math.round(v.time / 1000)} s`;
      list.appendChild(li);
    });
  }

  $("exportVisits")?.addEventListener("click", async () => {
    const { visitLogs = {} } = await chrome.storage.local.get("visitLogs");
    const rows = [["Name", "URL", "Visit Count", "Total Time (s)"]];
    Object.values(visitLogs).forEach(v => {
      rows.push([v.name, v.url, v.count, Math.round(v.time / 1000)]);
    });
    const csv = rows.map(r => r.map(f => `"${f}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: `visit-history-${Date.now()}.csv`, saveAs: true });
  });

  // --------------------------- Event Listeners ---------------------------

  clientSelect.onchange = async () => {
    activeClient = clientSelect.value;
    await chrome.storage.local.set({ activeClient });
    renderTemplates();
  };

  $("addClient").onclick = async () => {
    const name = prompt("Enter client name:");
    if (!name) return;
    const id = Date.now().toString();
    clients.push({ id, name, templates: [], defaultIndex: 0 });
    activeClient = id;
    await chrome.storage.local.set({ clients, activeClient });
    renderClients();
  };

  $("addTemplate").onclick = () => {
    const name = prompt("Enter template name:");
    if (!name) return;
    const client = clients.find(c => c.id === clientSelect.value);
    client.templates.push({ name, content: "" });
    chrome.storage.local.set({ clients });
    renderTemplates();
    templateText.value = "";
    updatePreview();
  };

  renameBtn.onclick = () => {
    const client = clients.find(c => c.id === clientSelect.value);
    const tmpl = client.templates[templateSelect.value];
    const newName = prompt("Rename template to:", tmpl?.name);
    if (newName && tmpl) {
      tmpl.name = newName;
      chrome.storage.local.set({ clients });
      renderTemplates();
    }
  };

  $("deleteTemplate").onclick = () => {
    const client = clients.find(c => c.id === clientSelect.value);
    const idx = templateSelect.selectedIndex;
    if (idx === -1) return;
    if (confirm("Delete this template?")) {
      client.templates.splice(idx, 1);
      chrome.storage.local.set({ clients });
      renderTemplates();
    }
  };

  templateSelect.onchange = () => {
    const client = clients.find(c => c.id === clientSelect.value);
    const tmpl = client.templates[templateSelect.value];
    if (tmpl) {
      templateText.value = tmpl.content;
      defaultChk.checked = (client.defaultIndex == templateSelect.value);
      updatePreview();
    }
  };

  defaultChk.onchange = () => {
    const client = clients.find(c => c.id === clientSelect.value);
    client.defaultIndex = parseInt(templateSelect.value);
    chrome.storage.local.set({ clients });
  };

  $("saveTemplate").onclick = () => {
    const client = clients.find(c => c.id === clientSelect.value);
    const tmpl = client.templates[templateSelect.value];
    if (tmpl) {
      tmpl.content = templateText.value;
      chrome.storage.local.set({ clients });
      updatePreview();
      alert("Template saved!");
    }
  };

  $("exportCsv").onclick = () => {
    if (logs.length === 0) return alert("No logs to export.");
    const rows = [["Date/Time", "Client", "Name", "Replied"],
      ...logs.map(l => [l.datetime, l.clientName, l.name, l.replied ? "Yes" : "No"])
    ];
    const csvText = rows.map(r => r.map(f => `"${f}"`).join(",")).join("\n");
    const blob = new Blob([csvText], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: `linkedin-logs-${Date.now()}.csv`, saveAs: true });
  };

  $("startQueueBtn").onclick = async () => {
    const delay = parseFloat($("delayInput").value || "1");
    const newQueue = logs
      .filter(l => !l.sent && l.profileUrl)
      .map(l => ({ url: l.profileUrl, delay }));
    await chrome.storage.local.set({ queue: newQueue, autoConnectMode: true });
    chrome.alarms.create("nextConnect", { delayInMinutes: delay });
    alert("Auto-connect started!");
  };

  $("stopQueueBtn").onclick = async () => {
    await chrome.storage.local.set({ autoConnectMode: false, queue: [] });
    chrome.alarms.clearAll();
    alert("Auto-connect stopped.");
  };

  // --------------------------- Tab Navigation ---------------------------

  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll("section").forEach(s => s.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");

      if (btn.dataset.tab === "topProfiles") {
        renderTopProfiles();
      }
    });
  });

  // --------------------------- Initial Rendering ---------------------------

  renderClients();
  renderLogs();
  renderStats();
});
