import { useCallback, useRef } from "react";
import { GeneratedApp, Project } from "../../../types/domain";
import { type ChatStartOptions } from "../../../types/chatTools";
import { bareNameCandidate, extractFolderName, isFindFolderIntent, isOpenFileIntent } from "../helpers/chatPrompts";
import { confusionReply, greetingReply, helpReply, isConfusion, isGreeting, isHelpRequest, isSmallTalk, projectSmallTalkReply, smallTalkReply } from "../helpers/chatReplies";
import { WorkspaceState } from "./useWorkspaceState";
import { useWorkspaceChatRuntime } from "./workspaceChatRuntime";
import { handleWorkspacePreviewIntent } from "./workspacePreviewActions";
import { isFolderRecoveryCancel, isKnownAiSkillCommand, isPreviewFixPrompt } from "./workspacePromptPredicates";
import { handlePublishCommand } from "./workspacePublishCommand";
import { handleChatProjectCreation } from "./workspaceProjectCreationActions";
import { isUnsupportedTerminalCommandIntent, parseTerminalCommandIntent, unsupportedTerminalReply } from "./workspaceTerminalCommands";
import { createWorkspaceToolHandlers } from "./workspaceToolActions";
import { createWorkspaceCommandHandlers } from "./workspaceCommandActions";
import { createWorkspacePromptReplyHandlers } from "./workspacePromptReplyHandlers";
import { createWorkspaceFileFolderHandlers } from "./workspacePromptFileFolderActions";
import { detachedAttachmentDecision } from "./workspacePromptRouting";

type Runtime = ReturnType<typeof useWorkspaceChatRuntime>;
type ReplyFn = (reply: string, project?: Project, preview?: GeneratedApp) => void;

export function useWorkspacePromptActions(s: WorkspaceState, runtime: Runtime) {
  const { app } = s;
  const awaitingFolderNameRef = useRef(false);
  const folderRecoveryRef = useRef(false);
  const pendingTerminalRef = useRef<{ command: string; projectId: string } | null>(null);
  const pendingPreviewServerRef = useRef<{ projectId: string; messageId: string } | null>(null);
  const submitLockRef = useRef(false);
  const toolHandlers = createWorkspaceToolHandlers(s, runtime);
  const commandHandlers = createWorkspaceCommandHandlers(s, runtime, {
    pendingPreviewServerRef,
    pendingTerminalRef,
    promptForDesktopConnection: addDesktopConnectionPrompt
  });
  const fileFolderHandlers = createWorkspaceFileFolderHandlers(s, runtime, addDesktopConnectionPrompt);
  const { runFileOpen, runFolderSearch } = fileFolderHandlers;
  const replyHandlers = createWorkspacePromptReplyHandlers(s, runtime, runFolderSearch, addDesktopConnectionPrompt);

  const onStartChat = useCallback(async (promptOverride?: string | ChatStartOptions) => {
    const rawPrompt = typeof promptOverride === "string" ? promptOverride : (promptOverride?.prompt ?? app.taskText);
    const tool = typeof promptOverride === "object" ? promptOverride?.tool : undefined;
    const fileAttachments = typeof promptOverride === "object" ? (promptOverride?.fileAttachments ?? []) : [];
    const imageAttachments = typeof promptOverride === "object" ? (promptOverride?.imageAttachments ?? []) : [];
    const modelOverride = typeof promptOverride === "object" ? promptOverride?.model : undefined;
    const displayPrompt = typeof promptOverride === "object" ? promptOverride?.displayPrompt : undefined;
    const prompt = rawPrompt.trim();
    const visiblePrompt = (displayPrompt ?? prompt).trim();
    if (!prompt || submitLockRef.current) return;
    submitLockRef.current = true;
    const projectChat = Boolean(s.selectedChatId?.startsWith("project-"));
    const detached = !projectChat;
    const reply = (r: string, project?: Project, preview?: GeneratedApp) => detached
      ? runtime.addDetachedChatReply(visiblePrompt, r)
      : app.addLocalChatReply(visiblePrompt, r, runtime.activeProjectTarget(project), preview);

    try {
      if (projectChat) {
        const projectTarget = runtime.activeProjectTarget();
        if (tool && await toolHandlers.handleToolMode(prompt, tool, false, projectTarget, reply, imageAttachments, modelOverride, fileAttachments, visiblePrompt)) return;
        if (imageAttachments.length > 0 || fileAttachments.length > 0) {
          await app.startAgent(projectTarget, prompt, { displayPrompt: visiblePrompt, fileAttachments, imageAttachments });
          return;
        }
        if (await commandHandlers.handlePreviewServerFollowUp(prompt, projectTarget)) return;
        if (await commandHandlers.handleTerminalFollowUp(prompt, projectTarget, reply)) return;
        const terminalCommand = parseTerminalCommandIntent(prompt);
        if (terminalCommand) {
          await commandHandlers.handleTerminalCommand(prompt, terminalCommand, projectTarget, reply);
          return;
        }
        if (isUnsupportedTerminalCommandIntent(prompt)) {
          reply(unsupportedTerminalReply(), projectTarget.project);
          return;
        }
        const projectFileIntent = isOpenFileIntent(prompt);
        const projectFileName = fileFolderHandlers.extractedFileName(prompt);
        if (projectFileIntent) {
          if (!projectFileName) reply("Which file should I open? Send the exact file name or path, like `App.tsx`.", projectTarget.project);
          else await runFileOpen(prompt, projectFileName, false);
          return;
        }
        if (handlePublishCommand(prompt, detached, s, runtime, reply)) return;
        if (await replyHandlers.handleProjectFilesQuestion(prompt, false, reply)) return;
        if (replyHandlers.handleProjectQuestion(prompt, false, reply)) return;
        if (isPreviewFixPrompt(prompt)) {
          await app.startAgent(projectTarget, prompt, { displayPrompt: visiblePrompt });
          return;
        }
        if (await handleWorkspacePreviewIntent({ app, detached, prompt, reply, runtime, onNeedsServerApproval: commandHandlers.rememberPreviewServerApproval })) return;
        if (isGreeting(prompt)) { reply(greetingReply(), projectTarget.project); return; }
        if (isSmallTalk(prompt)) { reply(projectSmallTalkReply(), projectTarget.project); return; }
        if (isConfusion(prompt)) { reply(confusionReply(), projectTarget.project); return; }
        if (isHelpRequest(prompt)) { reply(helpReply(), projectTarget.project); return; }
        await app.startAgent(projectTarget, prompt, { ...(modelOverride ? { model: modelOverride } : {}), displayPrompt: visiblePrompt });
        return;
      }

      const detachedAttachments = detachedAttachmentDecision(tool, fileAttachments.length, imageAttachments.length);
      if (detachedAttachments.kind === "tool") {
        const toolImages = tool ? imageAttachments : [];
        await toolHandlers.handleToolMode(prompt, detachedAttachments.tool, true, runtime.activeProjectTarget(), reply, toolImages, modelOverride, fileAttachments, visiblePrompt);
        return;
      }
      if (detachedAttachments.kind === "reply") {
        reply(detachedAttachments.message);
        return;
      }
      if (handlePublishCommand(prompt, detached, s, runtime, reply)) return;
      if (isKnownAiSkillCommand(prompt, app.chatSkills)) {
        runtime.addDetachedChatReply(visiblePrompt, "Open a project chat first, then use that slash command there.");
        return;
      }
      if (handleDetachedStarter(prompt)) return;
      if (await handleChatProjectCreation(prompt, s, runtime, resetFolderState)) return;
      if (!awaitingFolderNameRef.current) {
        if (isGreeting(prompt)) { runtime.addDetachedChatReply(prompt, greetingReply()); return; }
        if (isSmallTalk(prompt)) { runtime.addDetachedChatReply(prompt, smallTalkReply()); return; }
      }
      if (await handleRecovery(prompt, detached, reply, runFolderSearch)) return;
      if (await replyHandlers.handleProjectFilesQuestion(prompt, detached, reply)) return;
      if (replyHandlers.handleProjectQuestion(prompt, detached, reply)) return;
      if (isPreviewFixPrompt(prompt)) {
        s.setSelectedChatId(`project-${app.selectedProject.id}`); await app.startAgent(runtime.activeProjectTarget(), prompt, { displayPrompt: visiblePrompt }); return;
      }
      if (await handleWorkspacePreviewIntent({ app, detached, prompt, reply, runtime, onNeedsServerApproval: commandHandlers.rememberPreviewServerApproval })) return;

      const findIntent = isFindFolderIntent(prompt);
      const fileIntent = isOpenFileIntent(prompt);
      const extractedFileName = fileFolderHandlers.extractedFileName(prompt);
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
        await runFolderSearch(prompt, extractedName, fileFolderHandlers.isProjectLookupOnly(prompt), detached);
        return;
      }
      replyHandlers.handleDetachedFallback(prompt);
    } finally {
      setTimeout(() => { submitLockRef.current = false; }, 750);
    }
  }, [app, runtime, runFileOpen, runFolderSearch, s]);

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

  function resetFolderState() { folderRecoveryRef.current = false; awaitingFolderNameRef.current = false; }

  const resumeFolderSearch = useCallback(async (query: string, detached: boolean) => {
    const trimmed = query.trim(); if (!trimmed || !app.connection) return;
    resetFolderState(); await runFolderSearch(`Search PC for ${trimmed}`, trimmed, true, detached);
  }, [app.connection, runFolderSearch]);

  return {
    onStartChat,
    folderRecoveryRef,
    resumeFolderSearch,
    approvePreviewServerStart: () => commandHandlers.applyPreviewServerDecision(null, runtime.activeProjectTarget(), true),
    denyPreviewServerStart: () => commandHandlers.applyPreviewServerDecision(null, runtime.activeProjectTarget(), false)
  };

  function addDesktopConnectionPrompt(prompt: string, query: string, detached: boolean) {
    const connectionPrompt = { reason: "desktop-search" as const, ...(query ? { query } : {}) };
    if (detached) runtime.addDetachedDesktopConnectionPrompt(prompt, connectionPrompt);
    else app.addLocalDesktopConnectionPrompt(prompt, connectionPrompt, runtime.activeProjectTarget());
  }
}
