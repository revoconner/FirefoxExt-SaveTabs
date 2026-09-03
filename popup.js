"use strict";

const DEFAULT_SETTINGS = { allWindows: false, replaceOnSave: false, hideTitles: false };
let state = { folders: [], settings: { ...DEFAULT_SETTINGS } };

const $ = sel => document.querySelector(sel);

async function load() {
    const data = await browser.storage.local.get({ folders: [], settings: DEFAULT_SETTINGS });
    state.folders = data.folders;
    state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
}

async function persist() {
    await browser.storage.local.set({ folders: state.folders, settings: state.settings });
}

function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.hidden = true; }, 2200);
}

function pad(n) {
    return String(n).padStart(2, "0");
}

function defaultName(index) {
    const d = new Date();
    const date = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${pad(d.getFullYear() % 100)}`;
    const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    return `Folder ${index}: ${date} | ${time}`;
}

async function getOpenTabs() {
    const query = state.settings.allWindows ? {} : { currentWindow: true };
    const tabs = await browser.tabs.query(query);
    return tabs.filter(t => t.url).map(t => ({ url: t.url, title: t.title || t.url }));
}

async function saveNewFolder() {
    const tabs = await getOpenTabs();
    if (!tabs.length) {
        toast("No tabs to save");
        return;
    }
    state.folders.unshift({
        id: crypto.randomUUID(),
        name: defaultName(state.folders.length + 1),
        created: Date.now(),
        expanded: false,
        tabs
    });
    await persist();
    render();
    toast(`Saved ${tabs.length} tab${tabs.length === 1 ? "" : "s"}`);
}

async function saveIntoFolder(folder) {
    const open = await getOpenTabs();
    if (state.settings.replaceOnSave) {
        folder.tabs = open;
        toast(`Replaced with ${open.length} tab${open.length === 1 ? "" : "s"}`);
    } else {
        const known = new Set(folder.tabs.map(t => t.url));
        const added = open.filter(t => !known.has(t.url));
        folder.tabs.push(...added);
        toast(added.length ? `Added ${added.length} new tab${added.length === 1 ? "" : "s"}` : "Nothing new to add");
    }
    await persist();
    render();
}

// Tabs are created discarded so many URLs open without loading; privileged pages fall back or get skipped
async function openTabs(tabs) {
    let failed = 0;
    for (const t of tabs) {
        try {
            await browser.tabs.create({ url: t.url, active: false, discarded: true, title: t.title });
        } catch (e) {
            try {
                await browser.tabs.create({ url: t.url, active: false });
            } catch (e2) {
                failed++;
            }
        }
    }
    if (failed) {
        toast(`${failed} tab${failed === 1 ? "" : "s"} could not be opened`);
    }
}

function download(filename, text, mime) {
    browser.runtime.sendMessage({ type: "download", filename, text, mime });
}

function safeFilename(name) {
    return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "folder";
}

function exportFolderTxt(folder) {
    download(`${safeFilename(folder.name)}.txt`, folder.tabs.map(t => t.url).join("\n") + "\n", "text/plain");
}

async function copyFolderUrls(folder) {
    if (!folder.tabs.length) {
        toast("Nothing to copy");
        return;
    }
    try {
        await navigator.clipboard.writeText(folder.tabs.map(t => t.url).join("\n") + "\n");
        toast(`Copied ${folder.tabs.length} URL${folder.tabs.length === 1 ? "" : "s"}`);
    } catch (e) {
        toast("Copy failed");
    }
}

function exportAllJson() {
    const payload = { app: "FFsaveTabs", version: 1, exported: new Date().toISOString(), folders: state.folders };
    download("ffsavetabs-backup.json", JSON.stringify(payload, null, 4), "application/json");
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

function iconBtn(name, tooltip) {
    const b = el("button", "icon-btn");
    b.title = tooltip;
    const i = el("span", "icon");
    i.style.setProperty("--icon", `url("svg/${name}.svg")`);
    b.appendChild(i);
    return b;
}

// First click swaps the row's action buttons for a Delete? Yes | No prompt
function confirmable(button, action) {
    button.addEventListener("click", () => {
        const row = button.parentElement;
        const hidden = [...row.children].filter(n => n.tagName === "BUTTON");
        for (const b of hidden) {
            b.hidden = true;
        }
        const box = el("span", "confirm-box");
        box.appendChild(el("span", "confirm-label", "Delete?"));
        const yes = el("button", "confirm-yes", "Yes");
        yes.addEventListener("click", action);
        const no = el("button", "confirm-no", "No");
        no.addEventListener("click", () => {
            box.remove();
            for (const b of hidden) {
                b.hidden = false;
            }
        });
        box.appendChild(yes);
        box.appendChild(no);
        row.appendChild(box);
    });
}

function startRename(folder, nameSpan) {
    const input = el("input", "rename-input");
    input.value = folder.name;
    nameSpan.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const commit = async save => {
        if (done) {
            return;
        }
        done = true;
        if (save && input.value.trim()) {
            folder.name = input.value.trim();
            await persist();
        }
        render();
    };
    input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            commit(true);
        } else if (e.key === "Escape") {
            commit(false);
        }
    });
    input.addEventListener("blur", () => commit(true));
}

function renderFolder(folder) {
    const box = el("div", "folder");
    const row = el("div", "folder-row");
    box.appendChild(row);

    const name = el("span", "folder-name");
    name.appendChild(document.createTextNode(folder.name + " "));
    name.appendChild(el("span", "folder-count", `(${folder.tabs.length})`));
    name.title = "Open all tabs in this folder";
    name.addEventListener("click", () => openTabs(folder.tabs));
    row.appendChild(name);

    const btnExpand = iconBtn(folder.expanded ? "collapse" : "expand", folder.expanded ? "Collapse" : "Expand");
    btnExpand.addEventListener("click", async () => {
        folder.expanded = !folder.expanded;
        await persist();
        render();
    });

    const btnRename = iconBtn("rename", "Rename folder");
    btnRename.addEventListener("click", () => startRename(folder, name));

    const btnSave = iconBtn("save", state.settings.replaceOnSave ? "Replace folder contents with the open tabs" : "Add open tabs to this folder");
    btnSave.classList.add("btn-add", "gap-left");
    btnSave.addEventListener("click", () => saveIntoFolder(folder));

    const btnExport = iconBtn("export", "Export URLs as a text file");
    btnExport.addEventListener("click", () => exportFolderTxt(folder));

    const btnCopy = iconBtn("copy", "Copy URLs to clipboard");
    btnCopy.addEventListener("click", () => copyFolderUrls(folder));

    const btnDelete = iconBtn("delete", "Delete folder");
    btnDelete.classList.add("btn-delete");
    confirmable(btnDelete, async () => {
        state.folders = state.folders.filter(f => f.id !== folder.id);
        await persist();
        render();
    });

    btnExpand.classList.add("gap-left");
    for (const b of [btnRename, btnExport, btnCopy, btnDelete, btnSave, btnExpand]) {
        row.appendChild(b);
    }

    if (folder.expanded) {
        const list = el("div", "tab-list");
        for (const tab of folder.tabs) {
            const tabRow = el("div", "tab-row");
            const link = el("span", "tab-link");
            if (!state.settings.hideTitles) {
                link.appendChild(el("div", "tab-title", tab.title));
            }
            link.appendChild(el("div", "tab-url", tab.url));
            link.title = tab.url;
            link.addEventListener("click", () => openTabs([tab]));
            const del = iconBtn("delete", "Remove this link");
            del.classList.add("tab-del", "btn-delete");
            del.addEventListener("click", async () => {
                folder.tabs = folder.tabs.filter(t => t !== tab);
                await persist();
                render();
            });
            tabRow.appendChild(link);
            tabRow.appendChild(del);
            list.appendChild(tabRow);
        }
        if (!folder.tabs.length) {
            list.appendChild(el("div", "tab-empty", "Empty folder"));
        }
        box.appendChild(list);
    }
    return box;
}

function render() {
    const list = $("#folder-list");
    list.textContent = "";
    for (const folder of state.folders) {
        list.appendChild(renderFolder(folder));
    }
    $("#empty-note").hidden = state.folders.length > 0;
    $("#opt-all-windows").checked = state.settings.allWindows;
    $("#opt-replace").checked = state.settings.replaceOnSave;
    $("#opt-hide-titles").checked = state.settings.hideTitles;
}

function wire() {
    $("#save-new").addEventListener("click", saveNewFolder);
    $("#opt-all-windows").addEventListener("change", async e => {
        state.settings.allWindows = e.target.checked;
        await persist();
    });
    $("#opt-replace").addEventListener("change", async e => {
        state.settings.replaceOnSave = e.target.checked;
        await persist();
        render();
    });
    $("#opt-hide-titles").addEventListener("change", async e => {
        state.settings.hideTitles = e.target.checked;
        await persist();
        render();
    });
    $("#export-all").addEventListener("click", exportAllJson);
    // The OS file picker closes the popup and kills its document, so importing happens in a real tab
    $("#import-json").addEventListener("click", async () => {
        await browser.tabs.create({ url: "import.html" });
        window.close();
    });
}

load().then(() => {
    wire();
    render();
});
