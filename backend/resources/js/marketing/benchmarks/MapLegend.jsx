import React from "react";

export default function MapLegend() {
    return (
        <ul className="bm-legend" aria-label="Legend">
            <li><i className="bm-key is-best" />Best trade-off</li>
            <li><i className="bm-key" />Other models</li>
            <li><i className="bm-key is-open" />Open weights</li>
            <li className="bm-legend-hint">Hover a dot for details. Click to highlight it everywhere.</li>
        </ul>
    );
}
