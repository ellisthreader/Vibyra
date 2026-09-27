import React from "react";
import { Mark, Stage } from "./sceneParts.jsx";

/* An Obsidian vault lent to an agent: the vault's graph on the left, the note
 * being read on the right, and what it says flowing on to Claude Code. */
const NODES = [
    { x: 86, y: 98, r: 8.5, label: "Orbit", hub: true },
    { x: 38, y: 58, r: 6, label: "Decisions", read: true },
    { x: 142, y: 54, r: 5, label: "Palette" },
    { x: 150, y: 138, r: 5, label: "Roadmap" },
    { x: 34, y: 146, r: 5, label: "Tests" },
    { x: 96, y: 174, r: 4, label: "Ideas" },
    { x: 118, y: 16, r: 3 },
    { x: 14, y: 100, r: 3 },
    { x: 164, y: 96, r: 3 },
    { x: 62, y: 196, r: 2.5 },
];
const EDGES = [
    [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 4], [2, 6], [3, 8], [1, 7], [5, 4], [5, 9],
];
const NOTES = ["Keep the palette calm", "Tests live in /tests", "Weekly summary ships first"];

export default function NotesScene() {
    return (
        <Stage name="nt">
            <p className="nt-vault">
                <svg viewBox="0 0 16 16">
                    <path d="M8 1.5 13 5l-1.2 7L8 14.5 4.2 12 3 5z" />
                </svg>
                Obsidian vault
                <i />
            </p>
            <svg className="nt-graph" viewBox="0 0 176 210" width="200" height="238">
                <g className="nt-drift">
                    {EDGES.map(([from, to]) => (
                        <line
                            key={`${from}-${to}`}
                            className={from === 0 && to === 1 ? "nt-edge is-read" : "nt-edge"}
                            x1={NODES[from].x}
                            y1={NODES[from].y}
                            x2={NODES[to].x}
                            y2={NODES[to].y}
                        />
                    ))}
                    {NODES.map((node, index) => (
                        <g key={index} className={`nt-node${node.hub ? " is-hub" : ""}${node.read ? " is-read" : ""}`}>
                            {node.read && <circle className="nt-halo" cx={node.x} cy={node.y} r={node.r + 5} />}
                            <circle cx={node.x} cy={node.y} r={node.r} />
                            {node.label && (
                                <text x={node.x} y={node.y + node.r + 11}>
                                    {node.label}
                                </text>
                            )}
                        </g>
                    ))}
                </g>
            </svg>
            <svg className="nt-link" viewBox="0 0 560 320" width="560" height="320">
                <path d="M74 124C170 124 220 100 292 100" />
                <path d="M414 221V251" />
            </svg>
            <div className="nt-note">
                <p className="nt-file">Decisions.md</p>
                <p className="nt-h"># Orbit</p>
                <ul>
                    {NOTES.map((note) => (
                        <li key={note}>{note}</li>
                    ))}
                </ul>
                <span className="nt-scan" />
            </div>
            <p className="nt-agent">
                <Mark logo="claude-color" size={13} />
                Claude Code
                <span className="nt-dots">
                    <i />
                    <i />
                    <i />
                </span>
            </p>
        </Stage>
    );
}
