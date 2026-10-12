import React, { useId, useState } from "react";
import { formatCount, formatDay } from "./format.js";
import { chartModel } from "./chartGeometry.js";
import { Panel, Empty } from "./OwnerPrimitives.jsx";

const axisCount = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export default function OwnerTrend({ rows = [], primary, secondary, title, note }) {
  const [selected, setSelected] = useState(null);
  const id = useId();
  const metrics = [primary, secondary].filter(Boolean);
  const model = chartModel(rows, metrics.map(item => item.key));
  const index = selected != null && selected < rows.length ? selected : rows.length - 1;
  const row = rows[index];
  const readout = row ? metrics.map(item => item.label + ": " + formatCount(row[item.key])).join(" · ") : "";
  return <Panel title={title} subtitle={note} className="od-chart">
    {!model.hasValues ? <Empty title="No daily records available">Daily values will appear when they are included in this report.</Empty> : <>
      <div className="od-chart-readout" aria-live="polite"><span>{formatDay(row?.date)}</span><strong>{metrics.map((item, i) =>
        <span className={"od-chart-key series-" + i} key={item.key}><i aria-hidden="true" />{item.label + ": " + formatCount(row?.[item.key])}</span>)}</strong></div>
      <svg viewBox="0 0 720 218" role="img" aria-labelledby={id}>
        <title id={id}>{title + ". Exact daily values are available below the chart."}</title>
        {model.ticks.map(tick => <g key={tick}><line className="od-chart-grid" x1="64" x2="676" y1={model.y(tick)} y2={model.y(tick)} /><text x="48" y={model.y(tick) + 4} textAnchor="end">{axisCount.format(tick)}</text></g>)}
        {model.series.map((series, i) => <g key={series.key} className={"od-chart-series series-" + i}>
          <path d={series.path} />
          {series.points.map((point, n) => point && <circle key={n} cx={point.x} cy={point.y} r={rows.length === 1 || n === index ? 4 : 2} />)}
        </g>)}
        {rows.map((item, n) => (n === 0 || n === rows.length - 1 || n % Math.max(1, Math.ceil(rows.length / 5)) === 0) &&
          <text key={item.date} className={n > 0 && n < rows.length - 1 ? "od-chart-x-interior" : undefined} x={model.x(n)} y="205" textAnchor={n === 0 ? "start" : n === rows.length - 1 ? "end" : "middle"}>{formatDay(item.date)}</text>)}
        {rows.map((item, n) => <rect key={item.date} fill="transparent" x={model.x(n) - 612 / Math.max(1, rows.length - 1) / 2} y="24" width={612 / Math.max(1, rows.length - 1)} height="156"
          onMouseEnter={() => setSelected(n)} onClick={() => setSelected(n)} />)}
      </svg>
      <label className="od-chart-picker">Inspect a day
        <input type="range" min="0" max={Math.max(0, rows.length - 1)} value={Math.max(0, index)} onChange={event => setSelected(Number(event.target.value))} aria-valuetext={formatDay(row?.date) + ". " + readout} />
      </label>
      <details className="od-chart-table"><summary>View daily values</summary><div className="od-table-scroll" tabIndex="0" role="region" aria-label={title + " daily values"}>
        <table><thead><tr><th>Date (UTC)</th>{metrics.map(item => <th key={item.key}>{item.label}</th>)}</tr></thead>
          <tbody>{rows.map(item => <tr key={item.date}><th scope="row">{formatDay(item.date)}</th>{metrics.map(metric => <td key={metric.key}>{formatCount(item[metric.key])}</td>)}</tr>)}</tbody></table>
      </div></details>
    </>}
  </Panel>;
}
