---
title: Zoom Interview Prep
aliases:
  - Zoom CX Interview Studio
type: project
status: active
priority: 1
project_path: C:\Users\Ellis\Desktop\zoom-interview-prep
repository: ""
technologies:
  - React
  - Vite
  - JavaScript
  - Node.js
  - OpenAI API
last_reviewed: 2026-07-21
source: Codex chats
confidence: high
tags:
  - project/portfolio
  - project/interview-prep
---

# Zoom Interview Prep

## Purpose

Interactive preparation workspace for the Zoom AI Deployment Strategist interview process. It turns interview requirements into structured study modules, quizzes, scored practice, glossary help, and an architecture whiteboard.

> [!success] Reusable in Obsidian
> The durable method, full rebuild specification, interview context, and ready-to-copy templates are now connected through [[03 Resources/Interview Preparation/Interview Preparation System|Interview Preparation System]]. Start any future interview from [[90 Templates/Interview Prep/Interview Hub Template|Interview Hub Template]].

## Interview preparation system

- [[01 Projects/Portfolio/Zoom Interview Prep/Zoom Interview Context|Zoom Interview Context]] — role focus, positioning, evidence sources, and verification gaps.
- [[01 Projects/Portfolio/Zoom Interview Prep/Ram Rajagopalan - Public Research|Ram Rajagopalan - Public Research]] — sourced role, career, product philosophy, evaluation lens, and evidence boundaries.
- [[01 Projects/Portfolio/Zoom Interview Prep/Oxfordshire County Council - Zoom CX Summit 2025|Oxfordshire County Council - Zoom CX Summit 2025]] — sourced public-sector CX evidence on trust, frontline empowerment, and human-centred service.
- [[01 Projects/Portfolio/Zoom Interview Prep/Zoom Learning Method|Zoom Learning Method]] — why the learning loop works and what to preserve.
- [[01 Projects/Portfolio/Zoom Interview Prep/Zoom App Rebuild Specification|Zoom App Rebuild Specification]] — architecture, data contracts, commands, adaptation steps, and acceptance criteria.
- [[03 Resources/Interview Preparation/Interview Preparation System|Interview Preparation System]] — reusable workflow for every employer.

## Target user

Ellis, preparing for the final major panel stage for the Zoom AI Deployment Strategist position. The previous recorded stage was Round 2 with John Aspinall. Current preparation focuses on cross-functional deployment judgment, technical architecture, API integration, RAG, voice AI, reliability, lifecycle ownership, CX metrics, and customer-facing communication.

## Current status

**Active.** The 60-minute Zoom Video panel is scheduled for **Monday 27 July 2026 at 20:00 BST**. Panel membership and the exact agenda are not yet recorded. The preparation roadmap is [[01 Projects/Portfolio/Zoom Interview Prep/Zoom Panel Roadmap - 21-27 July 2026|Zoom Panel Roadmap - 21-27 July 2026]]. The local app was used and updated through 2026-07-10 and is not currently a Git repository.

## Last known development state

- React + Vite app in `src/` with a Node scoring server in `server.js`.
- `npm run dev` starts the scoring API on port `8788` and Vite on `8787`.
- Model scoring uses the OpenAI Responses API when `OPENAI_API_KEY` is set; a local rubric-based fallback remains available.
- The repository still contains older root `script.js` content alongside the newer React app; treat it as legacy/deep reference until confirmed otherwise.

## Technology stack

- React 19 + Vite
- JavaScript/JSX and CSS
- Node.js scoring server
- OpenAI Responses API with structured scoring
- Web Speech API for spoken answers
- `localStorage` for readiness/progress/history
- `react-rnd`, `html-to-image`, and Lucide for the interactive architecture whiteboard

## Confirmed completed features

- Round 2 content aligned to the latest interview email.
- Completion-gated home screen with Questions and Interview Mode.
- Typed and spoken practice answers.
- Model-based answer score, subscores, critical feedback, and local fallback scoring.
- Saved attempts, averages, score history, and improvement tracking.
- Glossary/tooltips for CX, RAG, voice, and reliability terms.
- 17 quiz questions across RAG, voice, reliability, and Zoom CX/metrics with balanced answer positions.
- Interactive architecture whiteboard and export support.

## In progress

- Ongoing content refinement as interview requirements change.
- Calibrating scoring so it is critical and useful without inflating answers.
- Keeping model choice/cost current and verifying the server never exposes the API key to the browser.

## Planned or useful next work
- [x] Confirm the selected panel slot: 27 July 2026 at 20:00 BST.
- [ ] Ask the recruiter for panel member names, roles, format, and whether a presentation, case study, coding, or whiteboarding exercise is expected.
- [ ] Work through [[01 Projects/Portfolio/Zoom Interview Prep/Zoom Final Panel Interview - July 2026|Zoom Final Panel Interview - July 2026]].

- [ ] Put the project under Git and make a clean baseline commit.
- [ ] Add automated tests for readiness gating, scoring fallback, persistence, and speech-unavailable behavior.
- [ ] Remove or archive superseded root static-app files after confirming the React app owns all current features.
- [ ] Add a concise runbook and `.env.example` without secrets.
- [ ] Recheck all interview-specific names/content immediately before the interview.

## Architecture

Browser React app -> local `/score-answer` endpoint -> OpenAI Responses API. If model scoring is unavailable, the browser uses a local rubric-based evaluator. Progress and previous attempts remain local to the browser.

## Important integrations

- OpenAI Responses API for structured scoring.
- Browser speech recognition for dictation.
- No evidence of Zoom APIs being integrated; Zoom is the interview/product domain.

## Database and authentication

- No database identified.
- No user authentication identified.
- Local progress uses `localStorage`.

## Important files

- `src/App.jsx` - current React application.
- `src/main.jsx` - React entry.
- `src/styles.css` - current styling.
- `server.js` - scoring endpoint and OpenAI call.
- `package.json` - run/build scripts.
- `README.md` - compact run instructions.
- `script.js` - older large static-app implementation; verify before editing.

## Key decisions

- Interview Mode is gated until prep reaches 100%.
- Feedback should be direct and evidence-based rather than encouraging by default.
- API keys stay server-side.
- Local scoring keeps the app useful when the model/API is unavailable.

## Bugs and lessons

- Readiness scoring was previously brittle because raw points were treated as a percent; use total-points normalisation.
- Changing interview rounds requires replacing stale interviewer/role language throughout content, not only the homepage.
- Multiple app generations in one folder create ownership ambiguity; establish a single current source tree.

## Current limitations

- No Git history.
- Production/deployment status is unknown.
- No confirmed automated test suite.
- Browser speech recognition support varies.
- Model/cost choice can become outdated and should be checked against current official docs before changes.

## Skills demonstrated

- AI-assisted product design
- Prompt/rubric design
- RAG and voice-AI conceptual knowledge
- React/Vite workflow exposure
- OpenAI API integration exposure
- Career-focused technical communication

## Related notes
- [[01 Projects/Portfolio/Zoom Interview Prep/Zoom Final Panel Interview - July 2026|Zoom Final Panel Interview - July 2026]]
- [[01 Projects/Portfolio/Zoom Interview Prep/Zoom Panel Roadmap - 21-27 July 2026|Zoom Panel Roadmap - 21-27 July 2026]]

- [[02 Areas/Technical Skills Inventory|Technical Skills Inventory]]
- [[02 Areas/Technical Career Evidence|Technical Career Evidence]]
- [[01 Projects/RelayClarity/RelayClarity|RelayClarity]]
- [[02 Areas/Portfolio and Career|Portfolio and Career]]
- [[03 Resources/Interview Preparation/Interview Preparation System|Interview Preparation System]]

## Source conversations

- Direct interview-prep chats: 2026-07-01 to 2026-07-03.
- Round 2 application updates and subagent reviews: 2026-07-09 to 2026-07-10.
- Repository state checked: 2026-07-10.
