import React from "react";

// The welcome screen each CLI prints when it starts, so an agent pane opens
// the way it does on the Mac instead of as an empty black box. Sample only.
const cwd = "~/projects/orbit";

// "GEMINI" as a 5-row pixel bitmap, drawn as SVG so it stays crisp at any scale.
const gemini = [
    " ### #### #   # ### #   # ###",
    "#    #    ## ##  #  ##  #  # ",
    "# ## ###  # # #  #  # # #  # ",
    "#  # #    #   #  #  #  ##  # ",
    " ### #### #   # ### #   # ###",
];
const pixels = gemini.flatMap((row, y) => [...row].map((cell, x) => (cell === "#" ? [x, y] : null)).filter(Boolean));

function GeminiArt() {
    const width = gemini[0].length;
    return <svg className="vdev-cli-art" viewBox={`0 0 ${width} 5`} width={width * 5} height="25" shapeRendering="crispEdges">
        <defs><linearGradient id="vdev-gemini" x1="0" x2="1"><stop offset="0" stopColor="#4796e4" /><stop offset=".5" stopColor="#847ace" /><stop offset="1" stopColor="#c3677f" /></linearGradient></defs>
        <g fill="url(#vdev-gemini)">{pixels.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" />)}</g>
    </svg>;
}

export default function CliBanner({ agent }) {
    if (agent === "claude") {
        return <div className="vdev-cli vdev-cli-claude" aria-hidden="true">
            <div className="vdev-cli-box">
                <div><b>✻</b> Welcome to <strong>Claude Code</strong>!</div>
                <div className="vdev-term-dim">  /help for help, /status for your current setup</div>
                <div className="vdev-term-dim">  cwd: {cwd}</div>
            </div>
        </div>;
    }
    if (agent === "codex") {
        return <div className="vdev-cli vdev-cli-codex" aria-hidden="true">
            <div className="vdev-cli-box">
                <div><b>&gt;_</b> <strong>OpenAI Codex</strong></div>
                <div><span className="vdev-term-dim">model:</span>     default  <span className="vdev-term-dim">/model to change</span></div>
                <div><span className="vdev-term-dim">directory:</span> {cwd}</div>
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
