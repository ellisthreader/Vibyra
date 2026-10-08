---
title: Zoom App Rebuild Specification
type: rebuild-specification
status: active
updated: 2026-07-21
parent: "[[01 Projects/Portfolio/Zoom Interview Prep|Zoom Interview Prep]]"
project_path: /home/ellis/Desktop/ZoomBoard
tags:
  - project/interview-prep
  - resource/rebuild
---

# Zoom App Rebuild Specification

This note contains enough architectural and product context to reproduce the interview studio or adapt it for another interview. The local source remains the exact implementation source of truth.

## Product goal

Turn a job/interview brief into a focused workspace that teaches role-specific knowledge, tests recall, scores spoken or typed answers, revisits weak areas, and supports visual architecture practice.

## Local source and commands

- Folder: `/home/ellis/Desktop/ZoomBoard`
- Install: `npm install`
- Development: `npm run dev`
- Current preview: `http://127.0.0.1:4173/`
- Build: `npm run build`
- Tests: `npm test`
- Browser validation: `node scripts/visual-check.mjs`

## Stack

- React 19 and Vite.
- TypeScript content and deterministic local rubric scoring; no API key is required.
- Browser Web Speech API for dictation.
- `localStorage` for progress, assignment artifacts, answers, FSRS flashcard state, panel recall, mock history, and whiteboards.
- `ts-fsrs` for scheduled active recall and a canvas architecture lab.
- Lucide React icons.

## Canonical files

| File | Responsibility |
|---|---|
| `src/App.tsx` | Navigation, dashboard, panel brief, recall, answer coaching, stories, architecture, mocks, evidence, and resources |
| `src/panelIntel.ts` | Sourced public-role intelligence, likely-question inference, article briefs, active-recall prompts, and recall scorer |
| `src/data.ts` | Seven-day roadmap, vocabulary, questions, stories, architecture stages, metrics, safe claims, and resource links |
| `src/answerBenchmarks.ts` | Question-specific 10/10 answers, concept rules, pressure follow-ups, and deterministic evaluation |
| `src/exercises.ts` | Guided evidence-producing exercises for every roadmap assignment |
| `src/progress.ts` | Versioned local persistence and progress export/reset |
| `src/styles.css` | Responsive visual system |
| `src/main.tsx` | React entry point |
| `src/data.test.ts` | Curriculum coverage, benchmark quality, panel research, article and recall contracts |
| `scripts/visual-check.mjs` | Desktop/mobile Playwright workflow, overflow, persistence, and canvas validation |
| `package.json` | Scripts and dependencies |

The source modules above are the current implementation contract. The older Windows `zoom-interview-prep` architecture and `script.js` ownership warning no longer describe this app.

## Required product areas

1. **Home/readiness dashboard** — progress, modes, and the answer framework.
2. **Prep modules** — write, quiz, and story formats with examples and explicit rubrics.
3. **Scored interview mode** — likely prompt, expected signals, answer editor/dictation, evaluation, missed signals, feedback, and follow-up.
4. **Flashcards** — topic filters, attempt before reveal, 1–5 confidence, weak-card scheduling, 10-card checkpoints, mastery, and history.
5. **Glossary** — search plus inline definitions and interview usage.
6. **Architecture whiteboard** — named boards, drawing, text boxes, formatting, undo, clear, autosave, switching, and PNG export.
7. **Panel Brief** — four named interviewer lenses with evidence confidence, predicted questions, tailored questions, public sources, two July 2026 article application briefs, and eight persistent scored recall drills.

## Content model to preserve

### Module

- `id`, `type`, `title`, `short`, `points`, `instruction`, and `kind`.
- Write modules add `prompt`, `starter`, answer examples, required concepts, and rubric.
- Quiz modules add questions, choices, correct answer, and explanation.
- Story modules add prompts and adaptable truthful examples.

### Interview question

- Stable `id`, category, title, prompt, expected signals, signal term checks, strong answer, follow-ups, and red flags.

### Flashcard

- Stable `id`, topic, question, and concise answer.
- Confidence history must survive refresh and determine future selection priority.

### Glossary entry

- Term, aliases, plain-English meaning, and how to use it in the interview.

## Scoring contract

Evaluation should return:

- Overall score out of 10 and level.
- Missed signals and red flags.
- Specific feedback.
- One next-answer focus.
- Improved answer outline.
- A likely follow-up question.

The fallback score checks signal terms and answer depth. Model scoring must stay server-side and should be direct, calibrated, and evidence-based.

## Persistence and isolation

Current progress uses `zoom-panel-command-center-v1`; whiteboard persistence uses its own namespaced browser state. For a new interview, namespace every key with a stable project ID so Zoom progress cannot leak into another company's prep.

## Adaptation checklist

- [ ] Copy the app into a new project folder or make content configuration selectable.
- [ ] Replace Zoom/company branding and product language.
- [ ] Replace context, modules, questions, model answers, follow-ups, quizzes, glossary, and flashcards.
- [ ] Map questions to truthful evidence in [[02 Areas/Technical Career Evidence|Technical Career Evidence]].
- [ ] Replace the scoring rubric and expected signals.
- [ ] Rename exported whiteboard files and storage keys.
- [ ] Verify microphone fallback, refresh persistence, scoring fallback, responsive layout, build, and start commands.
- [ ] Add the new project hub from [[90 Templates/Interview Prep/Interview Hub Template|Interview Hub Template]].

## Validation acceptance criteria

- `npm run build` passes.
- Today, roadmap assignments, Panel Brief, recall, vocabulary, Answer Studio, stories, architecture, mock panel, evidence, and resources open without console errors.
- All four named interviewer tabs, both article briefs, and eight panel recall exercises render and persist.
- Progress and attempts survive refresh.
- Weak flashcards reappear more often and checkpoints occur every ten cards.
- Scoring works without an API key and uses the server when configured.
- No key or secret reaches browser code or Obsidian.
- Employer-specific terminology is consistent across every view.
- All example claims are truthful and traceable.

## Related

- [[01 Projects/Portfolio/Zoom Interview Prep|Zoom Interview Prep]]
- [[01 Projects/Portfolio/Zoom Interview Prep/Zoom Interview Context|Zoom Interview Context]]
- [[01 Projects/Portfolio/Zoom Interview Prep/Zoom Learning Method|Zoom Learning Method]]
- [[03 Resources/Interview Preparation/Interview Preparation System|Interview Preparation System]]
