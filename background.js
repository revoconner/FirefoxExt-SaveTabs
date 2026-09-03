"use strict";

// Downloads run here because a blob URL made in the popup dies when the save dialog closes the popup
browser.runtime.onMessage.addListener(msg => {
    if (!msg || msg.type !== "download") {
        return;
    }
    const url = URL.createObjectURL(new Blob([msg.text], { type: msg.mime }));
    browser.downloads.download({ url, filename: msg.filename, saveAs: true })
        .catch(() => {})
        .finally(() => setTimeout(() => URL.revokeObjectURL(url), 60000));
});
