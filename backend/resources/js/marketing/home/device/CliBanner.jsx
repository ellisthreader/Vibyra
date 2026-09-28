import React from "react";

// "GEMINI" as a 5-row pixel bitmap, drawn as SVG so it stays crisp at any scale.
const gemini = [
    " ### #### #   # ### #   # ###",
    "#    #    ## ##  #  ##  #  # ",
    "# ## ###  # # #  #  # # #  # ",
    "#  # #    #   #  #  #  ##  # ",
    " ### #### #   # ### #   # ###",
];
const pixels = gemini.flatMap((row, y) => [...row].map((cell, x) => (cell === "#" ? [x, y] : null)).filter(Boolean));

export function GeminiArt() {
    const width = gemini[0].length;
    return <svg className="vdev-cli-art" viewBox={`0 0 ${width} 5`} width={width * 5} height="25" shapeRendering="crispEdges">
        <defs><linearGradient id="vdev-gemini" x1="0" x2="1"><stop offset="0" stopColor="#4796e4" /><stop offset=".5" stopColor="#847ace" /><stop offset="1" stopColor="#c3677f" /></linearGradient></defs>
        <g fill="url(#vdev-gemini)">{pixels.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" />)}</g>
    </svg>;
}

// Claude Code 2.1.283: ANSI body/eyes with the glyph bearings measured from
// the supplied terminal screenshot. The feet sit below the body with a gap.
function ClaudeCliMark() {
    return <svg className="vdev-claude-mark" viewBox="0 0 126 90" preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden="true">
        <path fill="#d77757" d="M14 0h98v60H14z M7 17h7v12H7z M112 17h7v12h-7z M14 65h7v12h-7z M28 65h7v12h-7z M91 65h7v12h-7z M105 65h7v12h-7z" />
        <path fill="#000" d="M35 17h7v12h-7z M84 17h7v12h-7z" />
    </svg>;
}

export default function CliBanner({ agent, projectName = "Orbit", model }) {
    const cwd = `~/projects/${projectName.toLowerCase().replace(/\s+/g, "-")}`;
    if (agent === "claude") {
        return <div className="vdev-cli vdev-cli-claude">
            <div className="vdev-claude-heading">
                <ClaudeCliMark />
                <div className="vdev-claude-details">
                    <div><strong>Claude Code</strong><span className="vdev-cli-version">v2.1.283</span></div>
                    <span>{(model ?? "Opus 5.5").replace(/^Claude\s+/, "")} with medium effort · Claude Max</span>
                    <span className="vdev-term-dim">{cwd}</span>
                </div>
            </div>
        </div>;
    }
    if (agent === "codex") {
        return <div className="vdev-cli vdev-cli-codex">
            <div className="vdev-codex-card">
                <div className="vdev-codex-title"><b aria-hidden="true">&gt;_</b><strong>OpenAI Codex</strong><span className="vdev-cli-version">v0.157.1</span></div>
                <div className="vdev-codex-data"><span>model:</span><strong>{model ?? "GPT-6 Sol"}</strong><span className="vdev-codex-hint">/model to change</span></div>
                <div className="vdev-codex-data"><span>directory:</span><strong>{cwd}</strong></div>
            </div>
        </div>;
    }
    if (agent === "gemini") {
        return <div className="vdev-cli vdev-cli-gemini" aria-hidden="true">
            <GeminiArt />
            <div className="vdev-term-dim">Tips: ask questions, edit files, run commands.</div>
        </div>;
    }
    return null;
}
