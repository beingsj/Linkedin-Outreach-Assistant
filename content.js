(function () {
  async function applyTemplateToNoteModal() {
    const modal = document.querySelector('[data-test-modal]') || document.querySelector('.artdeco-modal__content');
    if (!modal) return;

    const textarea = modal.querySelector('textarea') || modal.querySelector('[role="textbox"]');
    if (!textarea || textarea.value.trim().length > 0) return;

    const { clients = [], activeClient, tags = {} } = await chrome.storage.local.get(["clients", "activeClient", "tags"]);
    const client = clients.find(c => c.id === activeClient);
    if (!client?.templates?.length) return;

    const template = client.templates[client.defaultIndex ?? 0]?.content || "";

    const fullName = document.querySelector('.text-heading-xlarge')?.textContent.trim() ||
                     document.querySelector('.profile-topcard-person-entity__name')?.textContent.trim() || "";
    const firstName = fullName.split(" ")[0] || "";
    const title = document.querySelector('.text-body-medium.break-words')?.textContent.trim() || "";
    const company = document.querySelector('[data-test-line-clamp-content]')?.textContent.trim() || "";

    const tagList = tags[window.location.href] || [];
    const tagString = tagList.length ? tagList.join(", ") : "connection";

    const note = template
      .replaceAll("{firstName}", firstName)
      .replaceAll("{title}", title)
      .replaceAll("{company}", company)
      .replaceAll("{tag}", tagString);

    textarea.value = note;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // Save for preview
    const previewProfile = { firstName, title, company, tag: tagString };
    chrome.storage.local.set({ previewProfile });
  }

  // Auto-fill modal if detected
  const observer = new MutationObserver(() => {
    const isNoteModalOpen = document.querySelector('div[role="dialog"] textarea');
    if (isNoteModalOpen) applyTemplateToNoteModal();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Auto-connect execution flow
  async function tryAutoConnectFlow() {
    const { autoConnectMode, queue = [] } = await chrome.storage.local.get(["autoConnectMode", "queue"]);
    if (!autoConnectMode || queue.length === 0) return;

    const profileUrl = window.location.href;
    if (!queue[0].url.includes(profileUrl)) return;

    const connectBtn = document.querySelector('button[data-control-name="connect"], .pv-s-profile-actions--connect');
    if (connectBtn) {
      connectBtn.click();
      setTimeout(() => {
        const noteBtn = document.querySelector('button[aria-label*="Add a note"]');
        if (noteBtn) noteBtn.click();
        setTimeout(() => {
          const sendBtn = [...document.querySelectorAll('.artdeco-button__text')].find(btn => btn.textContent.trim() === "Send");
          if (sendBtn) sendBtn.click();
        }, 1000);
      }, 1000);
    }

    // Remove from queue
    queue.shift();
    await chrome.storage.local.set({ queue });

    // Log the attempt
    const fullName = document.querySelector('.text-heading-xlarge')?.textContent.trim() || "Unknown";
    const { clients, activeClient, logs = [] } = await chrome.storage.local.get(["clients", "activeClient", "logs"]);
    const client = clients?.find(c => c.id === activeClient);
    logs.unshift({
      name: fullName,
      clientName: client?.name || "Unknown",
      datetime: new Date().toLocaleString(),
      profileUrl,
      replied: false
    });
    await chrome.storage.local.set({ logs });
  }

  // Run auto connect if active
  tryAutoConnectFlow();

  // Send tracking (manual send)
  document.body.addEventListener('click', async e => {
    if (e.target.matches('.artdeco-button__text') && e.target.textContent.trim() === 'Send') {
      const fullName = document.querySelector('.text-heading-xlarge')?.textContent.trim() || "Unknown";
      const { clients, activeClient, logs = [] } = await chrome.storage.local.get(["clients", "activeClient", "logs"]);
      const client = clients?.find(c => c.id === activeClient);
      logs.unshift({
        name: fullName,
        clientName: client?.name || "Unknown",
        datetime: new Date().toLocaleString(),
        profileUrl: window.location.href,
        replied: false
      });
      await chrome.storage.local.set({ logs });
    }
  }, true);

  // Add tagging & note tools
  function injectProfileTools() {
    const header = document.querySelector('.pv-text-details__left-panel');
    if (!header || document.querySelector('#tag-extension-btn')) return;

    const tagBtn = document.createElement('button');
    tagBtn.id = "tag-extension-btn";
    tagBtn.textContent = "Tag Person";
    Object.assign(tagBtn.style, {
      margin: "5px 0",
      padding: "6px 10px",
      background: "#0073b1",
      color: "#fff",
      border: "none",
      borderRadius: "3px",
      cursor: "pointer"
    });
    tagBtn.onclick = tagPerson;
    header.appendChild(tagBtn);

    const noteBox = document.createElement('textarea');
    noteBox.id = "note-extension-box";
    noteBox.placeholder = "Internal note...";
    Object.assign(noteBox.style, {
      display: "block",
      width: "100%",
      marginTop: "6px",
      height: "60px",
      padding: "6px",
      fontSize: "13px"
    });
    header.appendChild(noteBox);

    loadProfileData();
  }

  async function loadProfileData() {
    const url = window.location.href;
    const { notes = {} } = await chrome.storage.local.get("notes");
    document.querySelector("#note-extension-box").value = notes[url] || "";

    document.querySelector("#note-extension-box").addEventListener("blur", async () => {
      const updatedNotes = (await chrome.storage.local.get("notes")).notes || {};
      updatedNotes[url] = document.querySelector("#note-extension-box").value;
      await chrome.storage.local.set({ notes: updatedNotes });
    });
  }

  async function tagPerson() {
    const tag = prompt("Enter a tag for this profile (e.g. Founder, SaaS, Investor):");
    if (!tag) return;
    const url = window.location.href;
    const { tags = {} } = await chrome.storage.local.get("tags");
    tags[url] = [...new Set([...(tags[url] || []), tag])];
    await chrome.storage.local.set({ tags });
    alert("Tagged!");
  }

  // Inject profile tools on change
  const profileObserver = new MutationObserver(() => {
    injectProfileTools();
  });
  profileObserver.observe(document.body, { childList: true, subtree: true });
})();
