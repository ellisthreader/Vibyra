import React, { useState } from "react";
import { Icon } from "./shared.jsx";
import { COMPETITORS, FEATURES, REVIEW_DATE, VIBYRA_FEATURES } from "./comparisonData.js";
import "../../../css/marketing/home-comparison.css";

/* #compare, the "Spotlight column" the owner picked on 2026-10-05: features
 * down the side, Vibyra as one lit column beside the four closest rivals.
 * The whole snapshot stays one click away. A dash means "not listed in the
 * product's own sources", never a proven absence. */

const native = product => product.stack === "Native" || product.stack === "Tauri";
const ROWS = [
    ...FEATURES.map(([, short], index) => ({ label: short, cell: product => product.values[index][0], vibyra: VIBYRA_FEATURES[index][0] })),
    { label: "Native app", cell: product => native(product) ? "y" : "n", vibyra: "y" },
];
const score = product => ROWS.filter(row => row.cell(product) === "y").length;
const PICKS = ["Superset", "Conductor", "AQ / AgentQueue", "Sourceweave"].map(name => COMPETITORS.find(product => product.name === name)).filter(Boolean);
const ORDER = [...COMPETITORS].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
const TOTAL = ROWS.length;

function Mark({ value }) {
    if (value === "y") return <span className="cmp-yes"><Icon name="check" size={12} /><span className="cmp-sr">Has it</span></span>;
    if (value === "p") return <span className="cmp-soon">Soon</span>;
    return <span className="cmp-no"><span className="cmp-sr">Not listed</span></span>;
}

function Dot({ value }) {
    const kind = value === "y" ? " is-yes" : value === "p" ? " is-soon" : "";
    return <span className={`cmp-dot${kind}`} title={value === "y" ? "Has it" : value === "p" ? "Beta or coming soon" : "Not listed"} />;
}

export default function Comparison() {
    const [open, setOpen] = useState(false);
    return <section className="cmp-section section-space" id="compare" aria-labelledby="cmp-title">
        <div className="page-width">
            <header className="home-section-heading cmp-heading">
                <h2 id="cmp-title">Others do some of it.<br /><span className="cmp-heading-accent">Vibyra does all of it.</span></h2>
                <p>Vibyra beside the four workspaces that come closest.</p>
            </header>

            <div className="cmp-scroll" tabIndex={0} aria-label="Comparison chart, scrolls sideways on small screens">
                <div className="cmp-chart" role="table" aria-label={`Vibyra compared with ${PICKS.length} agent workspaces. Snapshot ${REVIEW_DATE}.`}>
                    <span className="cmp-glow" aria-hidden="true" />
                    <div className="cmp-row cmp-head" role="row">
                        <span role="columnheader" className="cmp-feature"><span className="cmp-sr">Feature</span></span>
                        <span role="columnheader" className="cmp-lit"><span className="cmp-brand"><img src="/vibyra-cobalt.png" alt="" width="20" height="15" />Vibyra</span><small>Mac · iPhone · Cloud</small></span>
                        {PICKS.map(product => <span role="columnheader" key={product.name}><b>{product.name}</b><small>{product.platforms}</small></span>)}
                    </div>
                    {ROWS.map(row => <div className="cmp-row" role="row" key={row.label}>
                        <span role="rowheader" className="cmp-feature">{row.label}</span>
                        <span role="cell" className="cmp-lit">{row.vibyra === "y" && <span className="cmp-tick"><Icon name="check" size={14} /><span className="cmp-sr">Vibyra has it</span></span>}</span>
                        {PICKS.map(product => <span role="cell" key={product.name}><Mark value={row.cell(product)} /></span>)}
                    </div>)}
                    <div className="cmp-row cmp-total" role="row">
                        <span role="rowheader" className="cmp-feature">Features</span>
                        <span role="cell" className="cmp-lit">{ROWS.filter(row => row.vibyra === "y").length} of {TOTAL}</span>
                        {PICKS.map(product => <span role="cell" key={product.name}>{score(product)} of {TOTAL}</span>)}
                    </div>
                </div>
            </div>

            <div className="cmp-foot">
                <p>Snapshot {REVIEW_DATE}, from each product’s own site. A dash means not listed, not proven missing.</p>
                <button type="button" className="cmp-more" aria-expanded={open} aria-controls="cmp-grid" onClick={() => setOpen(value => !value)}>
                    {open ? "Hide the full comparison" : `Compare all ${COMPETITORS.length} workspaces`}<Icon name="chevron" size={13} />
                </button>
            </div>

            {open && <div className="cmp-grid" id="cmp-grid">
                <div className="cmp-grid-scroll" tabIndex={0} aria-label="Full comparison, scrolls sideways">
                    <table>
                        <caption className="cmp-sr">Each workspace against the {TOTAL} features. Filled dot: has it. Ring: beta or coming soon. Empty: not listed.</caption>
                        <thead><tr>
                            <th scope="col">Workspace</th>
                            {ROWS.map(row => <th scope="col" key={row.label}><span>{row.label}</span></th>)}
                        </tr></thead>
                        <tbody>
                            {ORDER.map(product => <tr key={product.name}>
                                <th scope="row"><a href={product.url} target="_blank" rel="noopener noreferrer">{product.name}</a><small>{product.platforms}</small></th>
                                {ROWS.map(row => <td key={row.label}><Dot value={row.cell(product)} /></td>)}
                            </tr>)}
                        </tbody>
                    </table>
                </div>
                <p className="cmp-legend"><span><i className="cmp-dot is-yes" />Has it</span><span><i className="cmp-dot is-soon" />Beta or coming soon</span><span><i className="cmp-dot" />Not listed</span></p>
            </div>}
        </div>
    </section>;
}
