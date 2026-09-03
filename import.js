"use strict";

const $ = sel => document.querySelector(sel);

function pad(n) {
    return String(n).padStart(2, "0");
}

function defaultName(index) {
    const d = new Date();
    const date = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${pad(d.getFullYear() % 100)}`;
    const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    return `Folder ${index}: ${date} | ${time}`;
}

async function importFile(file) {
    let payload;
    try {
        payload = JSON.parse(await file.text());
    } catch (e) {
        return "Not a valid JSON file";
    }
    const incoming = Array.isArray(payload) ? payload : payload.folders;
    if (!Array.isArray(incoming)) {
        return "No folders found in this file";
    }
    const data = await browser.storage.local.get({ folders: [] });
    const folders = data.folders;
    let addedFolders = 0;
    let addedTabs = 0;
    for (const raw of incoming) {
        if (!raw || !Array.isArray(raw.tabs)) {
            continue;
        }
        const tabs = raw.tabs.filter(t => t && typeof t.url === "string").map(t => ({ url: t.url, title: typeof t.title === "string" ? t.title : t.url }));
        const existing = raw.id && folders.find(f => f.id === raw.id);
        if (existing) {
            const known = new Set(existing.tabs.map(t => t.url));
            const fresh = tabs.filter(t => !known.has(t.url));
            existing.tabs.push(...fresh);
            addedTabs += fresh.length;
        } else {
            folders.unshift({
                id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
                name: typeof raw.name === "string" ? raw.name : defaultName(folders.length + 1),
                created: typeof raw.created === "number" ? raw.created : Date.now(),
                expanded: false,
                tabs
            });
            addedFolders++;
        }
    }
    await browser.storage.local.set({ folders });
    return `Imported ${addedFolders} folder${addedFolders === 1 ? "" : "s"}, merged ${addedTabs} tab${addedTabs === 1 ? "" : "s"} into existing ones.`;
}

$("#pick").addEventListener("click", () => $("#file").click());
$("#file").addEventListener("change", async e => {
    if (!e.target.files[0]) {
        return;
    }
    $("#result").textContent = "Importing...";
    $("#result").textContent = await importFile(e.target.files[0]);
    $("#close").hidden = false;
    e.target.value = "";
});
$("#close").addEventListener("click", () => window.close());
