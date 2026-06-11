const chatImageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const maxChatImageBytes = 3 * 1024 * 1024;
const chatScreenshotPathType = "application/x-vibyra-screenshot-path";

async function stageChatAttachmentFiles(fileList) {
  const files = Array.from(fileList || []).slice(0, 6);
  const images = files.filter((file) => chatImageTypes.has(file.type)).slice(0, 3);
  const oversized = images.find((file) => file.size > maxChatImageBytes);
  if (oversized) {
    showScreenshotNotice("Images must be 3 MB or smaller.");
    return;
  }
  try {
    chatAttachments = files.map((file) => file.webkitRelativePath || file.name).slice(0, 6);
    chatImageAttachments = await Promise.all(images.map(async (file) => ({
      name: file.name,
      url: await chatAttachmentDataUrl(file)
    })));
  } catch {
    showScreenshotNotice("The image could not be attached.");
    return;
  }
  openChatMenu = "";
  renderChat();
}

function chatAttachmentDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
    reader.addEventListener("error", () => reject(new Error("Image attachment could not be read.")), { once: true });
    reader.readAsDataURL(file);
  });
}

function bindChatAttachmentDrop() {
  const composer = document.querySelector(".composer");
  if (!composer || composer.dataset.attachmentDropBound) return;
  composer.dataset.attachmentDropBound = "1";
  composer.addEventListener("dragover", (event) => {
    const types = event.dataTransfer?.types || [];
    if (!types.includes("Files") && !types.includes(chatScreenshotPathType)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    composer.classList.add("is-file-dragover");
  });
  composer.addEventListener("dragleave", (event) => {
    if (!composer.contains(event.relatedTarget)) composer.classList.remove("is-file-dragover");
  });
  composer.addEventListener("drop", (event) => {
    event.preventDefault();
    composer.classList.remove("is-file-dragover");
    const path = event.dataTransfer?.getData(chatScreenshotPathType).trim();
    if (path) {
      insertChatScreenshotPath(path);
      return;
    }
    void stageChatAttachmentFiles(event.dataTransfer?.files);
  });
}

function insertChatScreenshotPath(path) {
  const input = document.getElementById("chat-input");
  if (!input) return;
  const spacer = input.value && !/\s$/.test(input.value) ? " " : "";
  input.value = `${input.value}${spacer}${path}`;
  chatDraft = input.value;
  localStorage.setItem("vibyra.desktop.chatDraft", chatDraft);
  renderSendState();
  input.focus();
}
