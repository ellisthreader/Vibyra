import { numeric } from "./ownerData.js";
export function chartModel(rows, keys) {
  const values = rows.flatMap(row => keys.map(key => numeric(row[key]))).filter(value => value != null);
  const maximum = Math.max(1, ...values);
  const step = maximum <= 4 ? 1 : Math.ceil(maximum / 4);
  const ceiling = Math.ceil(maximum / step) * step;
  const ticks = Array.from({ length: ceiling / step + 1 }, (_, index) => index * step);
  const x = index => rows.length === 1 ? 360 : 64 + index / Math.max(1, rows.length - 1) * 612;
  const y = value => 174 - value / ceiling * 142;
  const series = keys.map(key => {
    const points = rows.map((row, index) => {
      const value = numeric(row[key]);
      return value == null ? null : { x: x(index), y: y(value), value };
    });
    let continuation = false;
    const path = points.map(point => {
      if (!point) { continuation = false; return ""; }
      const command = continuation ? "L" : "M";
      continuation = true;
      return command + point.x + "," + point.y;
    }).join(" ");
    return { key, points, path };
  });
  return { ceiling, ticks, x, y, series, hasValues: values.length > 0 };
}
