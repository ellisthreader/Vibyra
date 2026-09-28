import React from "react";
import { T, Check, Bar, at } from "./storyParts.jsx";
import { ClaudeMark, OpenAIMark, GeminiMark } from "./brandMarks.jsx";

/* Safe mode, drawn as the worktrees really sit on disk: your project on
 * main at the root, and one sibling folder per agent branching off it, each
 * on its own branch with its own changed files. Each finishes and merges
 * back up the tree while your copy stays untouched. Words follow the
 * desktop app's Worktrees panel. Styles: home-eco-safe.css. */

const ROOT_Y = 42;
const TREES = [
    { id: "claude", Mark: ClaudeMark, dir: "orbit-claude", branch: "claude/dark-mode", files: [["M", "Header.tsx", 1.9], ["A", "ThemeToggle.tsx", 2.8]], merge: 4.5 },
    { id: "codex", Mark: OpenAIMark, dir: "orbit-codex", branch: "codex/api-tests", files: [["A", "api.test.ts", 2.2], ["M", "client.ts", 3.1]], merge: 5 },
    { id: "gemini", Mark: GeminiMark, dir: "orbit-gemini", branch: "gemini/docs", files: [["M", "README.md", 2.5], ["A", "setup.md", 3.4]], merge: 5.5 },
];
const top = (i) => 62 + i * 66;
const mid = (i) => top(i) + 29;
const elbow = (y) => `M27 ${y - 16}Q27 ${y} 43 ${y}H48`;
const flow = (y) => `path("M48 ${y}H43Q27 ${y} 27 ${y - 16}V${ROOT_Y}")`;

const BranchIcon = () => (
    <svg className="ecs-branch" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
        <path d="M3.5 2v8M8.5 4c0 2.6-5 2-5 4.6" />
        <circle cx="3.5" cy="2" r="1.3" />
        <circle cx="8.5" cy="3.4" r="1.3" />
    </svg>
);

const Folder = ({ children, className = "" }) => (
    <span className={`ecs-folder ${className}`}>
        <svg viewBox="0 0 24 20" width="24" height="20" aria-hidden="true">
            <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h4.3l2.2 2.4h8.5A2.5 2.5 0 0 1 22 6.9v8.6a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 15.5z" />
        </svg>
        {children}
    </span>
);

export default function SafeStory() {
    return (
        <div className="ecs ecs-safe">
            <div className="ecs-win ecs-safe-panel">
                <Bar>
                    Worktrees
                    <span className="ecs-safe-pill">
                        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                            <path d="M8 1.5 3 3.5v4c0 3.2 2.2 5.6 5 7 2.8-1.4 5-3.8 5-7v-4z" />
                        </svg>
                        Safe Mode on
                    </span>
                </Bar>
                <div className="ecs-tree">
                    <svg className="ecs-tree-lines" viewBox="0 0 60 270" width="60" height="270" aria-hidden="true">
                        <path className="ecs-trunk" d={`M27 ${ROOT_Y}V${mid(2) - 16}`} />
                        {TREES.map((tree, i) => (
                            <path key={tree.id} className={`ecs-elbow ecs-tree-${tree.id}`} d={elbow(mid(i))} pathLength="1" style={at(0.45 + i * 0.3)} />
                        ))}
                    </svg>
                    <div className="ecs-tree-root">
                        <Folder className="ecs-root-folder" />
                        <b>orbit</b>
                        <code>
                            <BranchIcon />
                            main
                        </code>
                        <span className="ecs-tree-state">
                            <T tag="span" at={0} out={5.9}>
                                Your copy, untouched
                            </T>
                            <T tag="span" at={6} className="is-merged">
                                <Check />3 merged · nothing overwritten
                            </T>
                        </span>
                    </div>
                    {TREES.map(({ id, Mark, dir, branch, files, merge }, i) => (
                        <React.Fragment key={id}>
                            <T at={0.5 + i * 0.3} className={`ecs-tree-row ecs-tree-${id}`} style={{ top: top(i) }}>
                                <Folder>
                                    <span className="ecs-folder-badge">
                                        <Mark size={11} />
                                    </span>
                                </Folder>
                                <div className="ecs-tree-text">
                                    <p className="ecs-tree-head">
                                        <b>{dir}</b>
                                        <span className="ecs-tree-state">
                                            <T tag="span" at={0.9 + i * 0.3} out={merge} className="is-working">
                                                Working
                                            </T>
                                            <T tag="span" at={merge} className="is-merged">
                                                <Check />
                                                Merged
                                            </T>
                                        </span>
                                    </p>
                                    <p>
                                        <code>
                                            <BranchIcon />
                                            {branch}
                                        </code>
                                        {files.map(([kind, name, t]) => (
                                            <T key={name} tag="span" at={t} className={`ecs-file is-${kind}`}>
                                                <em>{kind}</em>
                                                {name}
                                            </T>
                                        ))}
                                    </p>
                                </div>
                            </T>
                            <i className={`ecs-tree-flow ecs-tree-${id}`} style={{ offsetPath: flow(mid(i)), "--in": `${merge - 0.55}s` }} />
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
}
