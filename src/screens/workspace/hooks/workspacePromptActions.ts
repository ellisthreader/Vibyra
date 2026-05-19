import { useCallback, useRef } from "react";
import { GeneratedApp, Project } from "../../../types/domain";
import type { ChatToolMode, GeneratedImage } from "../../../types/chatTools";
import { chatToolSkillId, type ChatStartOptions } from "../../../types/chatTools";
import { generatePublishAsset } from "../../../utils/communityApi";
import { appApiStreamChat, type ChatResponse } from "../../../utils/appApi";
import { makeId } from "../../../utils/ids";
import { userFacingAgentError } from "../../../context/agentErrors";
import { bareNameCandidate, currentProjectReply, extractFileName, extractFolderName, isCurrentProjectQuestion, isFindFolderIntent, isOpenFileIntent, isProjectLookupOnly } from "../helpers/chatPrompts";
import { folderContentsReply, projectFilesReply } from "../helpers/chatProjectReplies";
import { bareNameClarifyReply, confusionReply, detachedFallbackReply, greetingReply, helpReply, isConfusion, isGreeting, isHelpRequest, isSmallTalk, projectSmallTalkReply, smallTalkReply } from "../helpers/chatReplies";
import { WorkspaceState } from "./useWorkspaceState";
import { useWorkspaceChatRuntime } from "./workspaceChatRuntime";
import { handleWorkspacePreviewIntent } from "./workspacePreviewActions";
import { isKnownAiSkillCommand, isProjectFilesQuestion } from "./workspacePromptPredicates";
import { handlePublishCommand } from "./workspacePublishCommand";
import { handleChatProjectCreation } from "./workspaceProjectCreationActions";
import { commandOutputReply, isTerminalApproval, isTerminalDenial, isUnsupportedTerminalCommandIntent, needsTerminalApproval, parseTerminalCommandIntent, unsupportedTerminalReply } from "./workspaceTerminalCommands";

type Runtime = ReturnType<typeof useWorkspaceChatRuntime>;
type ReplyFn = (reply: string, project?: Project, preview?: GeneratedApp) => void;

export function useWorkspacePromptActions(s: WorkspaceState, runtime: Runtime) {
  const { app } = s;
  const awaitingFolderNameRef = useRef(false);
  const folderRecoveryRef = useRef(false);
  const pendingTerminalRef = useRef<{ command: string; projectId: string } | null>(null);
  const pendingPreviewServerRef = useRef<{ projectId: string; messageId: string } | null>(null);
  const submitLockRef = useRef(false);

  const runFolderSearch = useCallback(async (prompt: string, query: string, lookupOnly: boolean, detached: boolean) => {
    const reply = (r: string, project?: Project, preview?: GeneratedApp) => detached
      ? runtime.addDetachedChatReply(prompt, r)
      : app.addLocalChatReply(prompt, r, runtime.activeProjectTarget(project), preview);

    const matches = await app.searchDesktopFolders(query);
    if (matches.length === 0) {
      reply(`I couldn't find a folder matching "${query}". Try the exact folder name, or open the Projects tab to browse.`);
      return;
    }
    const onTop = matches[0]?.path && matches[0].path === app.selectedProject?.path;
    if (onTop) {
      if (lookupOnly) app.addLocalChatReply(prompt, `${matches[0].name} is already the selected project.`, runtime.activeProjectTarget(matches[0]));
      else await app.startAgent(runtime.activeProjectTarget(matches[0]));
      return;
    }
    if (lookupOnly || detached) {
      const top = matches[0];
      const replyText = matches.length > 1
        ? `I found ${matches.length} folders matching "${query}". Open ${top.name}?`
        : `Found ${top.name} on your desktop. Open it for this chat?`;
      detached
        ? runtime.addDetachedChatProposal(prompt, replyText, matches, query)
        : app.addLocalChatProposal(prompt, replyText, matches, runtime.activeProjectTarget(), query);
      return;
    }
    s.setFolderConfirm({ query: prompt, matches });
  }, [app, runtime, s]);

  const runFileOpen = useCallback(async (prompt: string, query: string, detached: boolean) => {
    const reply = (r: string, project?: Project, preview?: GeneratedApp) => detached
      ? runtime.addDetachedChatReply(prompt, r)
      : app.addLocalChatReply(prompt, r, runtime.activeProjectTarget(project), preview);
    if (!app.connection) { addDesktopConnectionPrompt(prompt, query, detached); return; }
    if (detached) {
      reply(`I can open "${query}", but first attach a project chat. Ask me to find the folder on your PC, then open the file from that project.`);
      return;
    }
    const target = runtime.activeProjectTarget();
    const normalized = query.toLowerCase();
    const file = app.files.filter((item) => item.id !== "empty" && (item.name.toLowerCase().includes(normalized) || item.path.toLowerCase().includes(normalized)))
      .sort((a, b) => Number(b.name.toLowerCase() === normalized) - Number(a.name.toLowerCase() === normalized))[0];
    if (!file) {
      reply(`I couldn't find a loaded file matching "${query}" in ${target.project.name}. Open the project first, then try the exact file name or path.`);
      return;
    }
    s.setPreviewApp(null);
    await app.selectFile(file.id);
    reply(`Opened ${file.path} in ${target.project.name}.`, target.project);
  }, [app, runtime, s]);

  const onStartChat = useCallback(async (promptOverride?: string | ChatStartOptions) => {
    const rawPrompt = typeof promptOverride === "string" ? promptOverride : (promptOverride?.prompt ?? app.taskText);
    const tool = typeof promptOverride === "object" ? promptOverride?.tool : undefined;
    const imageAttachments = typeof promptOverride === "object" ? (promptOverride?.imageAttachments ?? []) : [];
    const prompt = rawPrompt.trim();
    if (!prompt || submitLockRef.current) return;
    submitLockRef.current = true;
    const projectChat = Boolean(s.selectedChatId?.startsWith("project-"));
    const detached = !projectChat;
    if (s.selectedChatId && !projectChat) s.setSelectedChatId(null);
    const reply = (r: string, project?: Project, preview?: GeneratedApp) => detached
      ? runtime.addDetachedChatReply(prompt, r)
      : app.addLocalChatReply(prompt, r, runtime.activeProjectTarget(project), preview);

    try {
      if (projectChat) {
        const projectTarget = runtime.activeProjectTarget();
        if (tool && await handleToolMode(prompt, tool, false, projectTarget, reply, imageAttachments)) return;
        if (imageAttachments.length > 0) {
          await app.startAgent(projectTarget, prompt, { imageAttachments });
          return;
        }
        if (await handlePreviewServerFollowUp(prompt, projectTarget, reply)) return;
        if (await handleTerminalFollowUp(prompt, projectTarget, reply)) return;
        const terminalCommand = parseTerminalCommandIntent(prompt);
        if (terminalCommand) {
          await handleTerminalCommand(prompt, terminalCommand, projectTarget, reply);
          return;
        }
        if (isUnsupportedTerminalCommandIntent(prompt)) {
          reply(unsupportedTerminalReply(), projectTarget.project);
          return;
        }
        const projectFileIntent = isOpenFileIntent(prompt);
        const projectFileName = extractFileName(prompt);
        if (projectFileIntent) {
          if (!projectFileName) reply("Which file should I open? Send the exact file name or path, like `App.tsx`.", projectTarget.project);
          else await runFileOpen(prompt, projectFileName, false);
          return;
        }
        if (handlePublishCommand(prompt, detached, s, runtime, reply)) return;
        if (await handleProjectFilesQuestion(prompt, false, reply)) return;
        if (handleProjectQuestion(prompt, false, reply)) return;
        if (isPreviewFixPrompt(prompt)) {
          await app.startAgent(projectTarget, prompt);
          return;
        }
        if (await handleWorkspacePreviewIntent({ app, detached, prompt, reply, runtime, onNeedsServerApproval: rememberPreviewServerApproval })) return;
        if (isGreeting(prompt)) { reply(greetingReply(), projectTarget.project); return; }
        if (isSmallTalk(prompt)) { reply(projectSmallTalkReply(), projectTarget.project); return; }
        if (isConfusion(prompt)) { reply(confusionReply(), projectTarget.project); return; }
        if (isHelpRequest(prompt)) { reply(helpReply(), projectTarget.project); return; }
        await app.startAgent(projectTarget, prompt);
        return;
      }

      if (tool && await handleToolMode(prompt, tool, true, runtime.activeProjectTarget(), reply, imageAttachments)) return;
      if (imageAttachments.length > 0) {
        reply("Open a project chat first so I can use images with the AI chat.");
        return;
      }
      if (handlePublishCommand(prompt, detached, s, runtime, reply)) return;
      if (isKnownAiSkillCommand(prompt, app.chatSkills)) {
        runtime.addDetachedChatReply(prompt, "Open a project chat first, then use that slash command there.");
        return;
      }
      if (handleDetachedStarter(prompt)) return;
      if (await handleChatProjectCreation(prompt, s, runtime, resetFolderState)) return;
      if (!awaitingFolderNameRef.current) {
        if (isGreeting(prompt)) { runtime.addDetachedChatReply(prompt, greetingReply()); return; }
        if (isSmallTalk(prompt)) { runtime.addDetachedChatReply(prompt, smallTalkReply()); return; }
      }
      if (await handleRecovery(prompt, detached, reply, runFolderSearch)) return;
      if (await handleProjectFilesQuestion(prompt, detached, reply)) return;
      if (handleProjectQuestion(prompt, detached, reply)) return;
      if (isPreviewFixPrompt(prompt)) {
        s.setSelectedChatId(`project-${app.selectedProject.id}`); await app.startAgent(runtime.activeProjectTarget(), prompt); return;
      }
      if (await handleWorkspacePreviewIntent({ app, detached, prompt, reply, runtime, onNeedsServerApproval: rememberPreviewServerApproval })) return;

      const findIntent = isFindFolderIntent(prompt);
      const fileIntent = isOpenFileIntent(prompt);
      const extractedFileName = extractFileName(prompt);
      const extractedName = extractFolderName(prompt);
      if (fileIntent) {
        if (!extractedFileName) reply("Which file should I open? Send the exact file name or path, like `App.tsx`.");
        else await runFileOpen(prompt, extractedFileName, detached);
        return;
      }
      if (findIntent && !extractedName) {
        if (!app.connection) { addDesktopConnectionPrompt(prompt, "", detached); return; }
        awaitingFolderNameRef.current = true;
        reply("Sure — what's the folder called? Just type the name (e.g. `test1`).");
        return;
      }
      if (findIntent && extractedName) {
        if (!app.connection) { addDesktopConnectionPrompt(prompt, extractedName, detached); return; }
        await runFolderSearch(prompt, extractedName, isProjectLookupOnly(prompt), detached);
        return;
      }
      handleDetachedFallback(prompt);
    } finally {
      setTimeout(() => { submitLockRef.current = false; }, 750);
    }
  }, [app, runtime, runFileOpen, runFolderSearch, s]);

  async function handleToolMode(
    prompt: string,
    tool: ChatToolMode,
    detached: boolean,
    target: ReturnType<Runtime["activeProjectTarget"]>,
    reply: ReplyFn,
    imageAttachments: ChatStartOptions["imageAttachments"] = []
  ) {
    if (tool === "image") {
      await createImage(prompt, detached, target, reply);
      return true;
    }
    if (tool === "analyze" && detached) {
      reply("Open a project chat first so I can analyze that app's files.");
      return true;
    }
    const skillId = chatToolSkillId(tool);
    if (!skillId) return false;
    if (detached) {
      await runDetachedCloudTool(prompt, tool, skillId);
      return true;
    }
    await app.startAgent(target, prompt, { imageAttachments, skillId });
    return true;
  }

  async function runDetachedCloudTool(prompt: string, tool: Exclude<ChatToolMode, "image">, skillId: string) {
    if (!app.authToken) {
      runtime.addDetachedChatReply(prompt, "Log in or create an account to use Vibyra AI chat.");
      return;
    }
    const assistantId = addDetachedToolPending(prompt, tool);
    try {
      const result = await appApiStreamChat<ChatResponse>({
        history: s.newChatMessages
          .filter((message) => message.text.trim() && message.text !== "Working on it...")
          .slice(-3)
          .map((message) => ({ role: message.role, text: message.text.slice(0, 600) })),
        model: app.selectedChatModel || app.selectedModel,
        mode: "chat",
        prompt,
        reasoningEffort: app.reasoningEffort,
        skill: skillId
      }, app.authToken, {
        onChunk: (delta) => appendDetachedToolDelta(assistantId, delta)
      });
      if (result.user) app.applyRemoteUserFromIap(result.user);
      finishDetachedTool(assistantId, result);
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes("session")) app.expireSession("Your Vibyra login needs refreshing before AI chat can continue.");
      failDetachedTool(assistantId, userFacingAgentError(error));
    }
  }

  function addDetachedToolPending(prompt: string, tool: Exclude<ChatToolMode, "image">) {
    const assistantId = makeId("new-chat-assistant");
    s.setNewChatMessages((current) => [
      ...current,
      { id: makeId("new-chat-user"), role: "user", text: prompt },
      {
        id: assistantId,
        role: "assistant",
        text: "Working on it...",
        assistantModel: app.selectedChatModel || app.selectedModel,
        runStatus: { route: "cloud", mode: "chat", status: "running", tool, startedAt: Date.now() }
      }
    ]);
    app.setTaskText("");
    return assistantId;
  }

  function appendDetachedToolDelta(messageId: string, delta: string) {
    if (!delta) return;
    s.setNewChatMessages((current) => current.map((message) => {
      if (message.id !== messageId) return message;
      const previous = message.text === "Working on it..." ? "" : message.text;
      return { ...message, text: previous + delta };
    }));
  }

  function finishDetachedTool(messageId: string, result: ChatResponse) {
    s.setNewChatMessages((current) => current.map((message) => (
      message.id === messageId
        ? {
          ...message,
          text: result.reply || message.text,
          creditCost: result.creditCost,
          runStatus: message.runStatus ? { ...message.runStatus, status: "complete", completedAt: Date.now() } : message.runStatus
        }
        : message
    )));
  }

  function failDetachedTool(messageId: string, error: string) {
    s.setNewChatMessages((current) => current.map((message) => (
      message.id === messageId
        ? {
          ...message,
          text: error,
          runStatus: message.runStatus ? { ...message.runStatus, status: "failed", completedAt: Date.now() } : message.runStatus
        }
        : message
    )));
  }

  async function createImage(prompt: string, detached: boolean, target: ReturnType<Runtime["activeProjectTarget"]>, reply: ReplyFn) {
    if (!app.authToken) {
      reply("Log in before generating images.");
      return;
    }
    const pendingMessageId = detached
      ? addDetachedImageGenerationPending(prompt)
      : app.addLocalImageGenerationPending(prompt, target);
    try {
      const result = await generatePublishAsset({
        authToken: app.authToken,
        description: target.project.name,
        kind: "screenshot",
        prompt,
        title: target.project.name || "Vibyra image"
      });
      if (result.user) app.applyRemoteUserFromIap(result.user);
      const image: GeneratedImage = {
        id: `generated-image-${Date.now()}`,
        provider: result.provider,
        title: "Generated image",
        url: result.imageUrl
      };
      detached ? finishDetachedGeneratedImage(pendingMessageId, image) : app.finishLocalGeneratedImage(pendingMessageId, image, target);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image generation failed. Try again.";
      detached ? failDetachedImageGeneration(pendingMessageId, message) : app.failLocalImageGeneration(pendingMessageId, message, target);
    }
  }

  function addDetachedImageGenerationPending(prompt: string) {
    const assistantId = makeId("new-chat-assistant");
    s.setNewChatMessages((current) => [
      ...current,
      { id: makeId("new-chat-user"), role: "user", text: prompt },
      {
        id: assistantId,
        role: "assistant",
        text: "Working on it...",
        runStatus: { route: "cloud", mode: "chat", status: "running", tool: "image", startedAt: Date.now() }
      }
    ]);
    app.setTaskText("");
    return assistantId;
  }

  function finishDetachedGeneratedImage(messageId: string, image: GeneratedImage) {
    s.setNewChatMessages((current) => current.map((message) => (
      message.id === messageId
        ? {
          ...message,
          text: `Created **${image.title}**.`,
          generatedImage: image,
          runStatus: message.runStatus ? { ...message.runStatus, status: "complete", completedAt: Date.now() } : message.runStatus
        }
        : message
    )));
  }

  function failDetachedImageGeneration(messageId: string, error: string) {
    s.setNewChatMessages((current) => current.map((message) => (
      message.id === messageId
        ? {
          ...message,
          text: error,
          runStatus: message.runStatus ? { ...message.runStatus, status: "failed", completedAt: Date.now() } : message.runStatus
        }
        : message
    )));
  }

  function handleDetachedStarter(prompt: string) {
    if (isConfusion(prompt)) { resetFolderState(); runtime.addDetachedChatReply(prompt, confusionReply()); return true; }
    if (isHelpRequest(prompt)) { resetFolderState(); runtime.addDetachedChatReply(prompt, helpReply()); return true; }
    return false;
  }

  async function handleRecovery(prompt: string, detached: boolean, reply: (r: string) => void, search: typeof runFolderSearch) {
    const waiting = folderRecoveryRef.current || awaitingFolderNameRef.current;
    if (!waiting) return false;
    if (isFolderRecoveryCancel(prompt)) {
      resetFolderState();
      reply("Got it - cancelled.");
      return true;
    }
    const name = extractFolderName(prompt) ?? (folderRecoveryRef.current ? bareNameCandidate(prompt) : prompt.replace(/^(?:yes|yeah|yep|ok(?:ay)?|sure|please)\b\s*/i, "").trim());
    if (!name || name.length > 40 || !/^[a-z0-9][\w.-]*$/i.test(name)) { reply(folderRecoveryRef.current ? "Type just the folder name, or use Manual search / Auto search PC." : "Type just the folder name, like `test1`. (Or say \"cancel\" to drop it.)"); return true; }
    if (/^cancel$/i.test(name)) { resetFolderState(); reply("Got it — cancelled."); return true; }
    resetFolderState();
    if (!app.connection) { addDesktopConnectionPrompt(prompt, name, detached); return true; }
    await search(prompt, name, true, detached);
    return true;
  }

  function handleProjectQuestion(prompt: string, detached: boolean, reply: (r: string) => void) {
    if (!isCurrentProjectQuestion(prompt)) return false;
    const target = runtime.activeProjectTarget();
    reply(detached ? "This is a new chat with no project attached yet. Open a folder from Projects, or ask me to find a folder on your PC." : currentProjectReply(target.project, target.file?.name ?? "No file selected"));
    return true;
  }

  async function handleProjectFilesQuestion(prompt: string, detached: boolean, reply: (r: string) => void) {
    if (!isProjectFilesQuestion(prompt)) return false;
    if (detached) {
      reply("This is a new chat with no project attached yet. Open a folder first, then ask me what files are inside.");
      return true;
    }
    const target = runtime.activeProjectTarget();
    try {
      const listing = await app.browseDesktopPath(target.project.path);
      reply(folderContentsReply(target.project, listing.entries));
    } catch {
      reply(projectFilesReply(target.project, app.files));
    }
    return true;
  }

  function handleDetachedFallback(prompt: string) {
    const bare = bareNameCandidate(prompt);
    if (!bare) { runtime.addDetachedChatReply(prompt, detachedFallbackReply()); return; }
    if (/^(?:no|nope|nah|not)\b/i.test(prompt) && app.connection) void runFolderSearch(prompt, bare, true, true);
    else if (app.connection) runtime.addDetachedChatReply(prompt, bareNameClarifyReply(bare));
    else addDesktopConnectionPrompt(prompt, bare, true);
  }

  function resetFolderState() { folderRecoveryRef.current = false; awaitingFolderNameRef.current = false; }

  async function handleTerminalFollowUp(prompt: string, target: ReturnType<Runtime["activeProjectTarget"]>, reply: ReplyFn) {
    const pending = pendingTerminalRef.current;
    if (!pending || pending.projectId !== target.projectId) return false;
    if (isTerminalDenial(prompt)) {
      pendingTerminalRef.current = null;
      reply(`Cancelled \`${pending.command}\`.`);
      return true;
    }
    if (!isTerminalApproval(prompt)) return false;
    pendingTerminalRef.current = null;
    await runApprovedTerminalCommand(prompt, pending.command, target, reply);
    return true;
  }

  async function handlePreviewServerFollowUp(prompt: string, target: ReturnType<Runtime["activeProjectTarget"]>, reply: ReplyFn) {
    const pending = pendingPreviewServerRef.current;
    if (!pending || pending.projectId !== target.projectId) return false;
    if (isTerminalDenial(prompt)) {
      applyPreviewServerDecision(prompt, target, false);
      return true;
    }
    if (!isTerminalApproval(prompt)) return false;
    applyPreviewServerDecision(prompt, target, true);
    return true;
  }

  function applyPreviewServerDecision(prompt: string | null, target: ReturnType<Runtime["activeProjectTarget"]>, approved: boolean) {
    const pending = pendingPreviewServerRef.current;
    if (!pending || pending.projectId !== target.projectId) return;
    pendingPreviewServerRef.current = null;
    if (prompt?.trim()) app.addLocalUserMessage(prompt, target);
    if (!approved) {
      app.updatePreviewServerMessage(pending.messageId, pending.projectId, {
        status: "cancelled",
        phase: "cancelled",
        detail: "Cancelled by user"
      });
      return;
    }
    app.updatePreviewServerMessage(pending.messageId, pending.projectId, {
      status: "starting",
      phase: "requesting-desktop",
      detail: "Sending request to Vibyra Desktop"
    });
    void runApprovedPreviewServer(target, pending.messageId);
  }

  async function handleTerminalCommand(prompt: string, command: string, target: ReturnType<Runtime["activeProjectTarget"]>, reply: ReplyFn) {
    if (!app.connection) {
      addDesktopConnectionPrompt(prompt, "", false);
      return;
    }
    if (needsTerminalApproval(command)) {
      pendingTerminalRef.current = { command, projectId: target.projectId };
      reply(`Approve running \`${command}\` in **${target.project.name}**? Reply yes to run it or no to cancel.`);
      return;
    }
    await runApprovedTerminalCommand(prompt, command, target, reply);
  }

  async function runApprovedTerminalCommand(prompt: string, command: string, target: ReturnType<Runtime["activeProjectTarget"]>, reply: ReplyFn) {
    try {
      const result = await app.runTerminalCommand(command, target);
      reply(commandOutputReply(result.command, result.ok, result.output), target.project);
    } catch (error) {
      reply(error instanceof Error ? error.message : `Could not run \`${command}\`.`, target.project);
    }
  }

  async function runApprovedPreviewServer(target: ReturnType<Runtime["activeProjectTarget"]>, messageId: string) {
    try {
      const preview = await app.startPreviewServer(target.projectId, target.project.name, (phase, detail) => {
        app.updatePreviewServerMessage(messageId, target.projectId, {
          status: phase === "ready" ? "ready" : "starting",
          phase,
          detail
        });
      });
      app.updatePreviewServerMessage(messageId, target.projectId, {
        status: "ready",
        phase: "ready",
        detail: "Phone preview route verified"
      }, preview);
    } catch (error) {
      app.updatePreviewServerMessage(messageId, target.projectId, {
        status: "failed",
        phase: "failed",
        detail: error instanceof Error ? error.message : "Could not start the preview server."
      });
    }
  }

  function rememberPreviewServerApproval(target: ReturnType<Runtime["activeProjectTarget"]>, messageId: string) {
    pendingPreviewServerRef.current = { projectId: target.projectId, messageId };
  }

  const resumeFolderSearch = useCallback(async (query: string, detached: boolean) => {
    const trimmed = query.trim(); if (!trimmed || !app.connection) return;
    resetFolderState(); await runFolderSearch(`Search PC for ${trimmed}`, trimmed, true, detached);
  }, [app.connection, runFolderSearch]);

  return {
    onStartChat,
    folderRecoveryRef,
    resumeFolderSearch,
    approvePreviewServerStart: () => applyPreviewServerDecision(null, runtime.activeProjectTarget(), true),
    denyPreviewServerStart: () => applyPreviewServerDecision(null, runtime.activeProjectTarget(), false)
  };

  function addDesktopConnectionPrompt(prompt: string, query: string, detached: boolean) {
    const connectionPrompt = { reason: "desktop-search" as const, ...(query ? { query } : {}) };
    if (detached) runtime.addDetachedDesktopConnectionPrompt(prompt, connectionPrompt);
    else app.addLocalDesktopConnectionPrompt(prompt, connectionPrompt, runtime.activeProjectTarget());
  }
}

function isFolderRecoveryCancel(prompt: string) {
  return /^(?:cancel(?:\s+it)?|stop|nah|nope|no|nvm|never\s*mind|forget\s+it|drop\s+it|skip\s+it|leave\s+it)\b/i.test(prompt.trim());
}

export function isPreviewFixPrompt(prompt: string): boolean {
  return /^The (?:runnable|live) preview for .+ crashed\b|Captured preview diagnostics:/i.test(prompt);
}
