// Wrappers around uPlot (loaded globally via index.html's <script> tag).
// data shape: [timestampsArray, valuesArray] — uPlot's AlignedData.

const COMMON_OPTS = {
  width: 240,
  height: 50,
  padding: [4, 4, 4, 4],
  scales: { x: { time: true }, y: { auto: true } },
  axes: [{ show: false }, { show: false }],
  legend: { show: false },
  cursor: { show: false },
  select: { show: false },
};

function ensureUPlot() {
  if (typeof window.uPlot !== 'function') {
    throw new Error('uPlot not loaded — check the <script> tag in index.html');
  }
  return window.uPlot;
}

export function lineChart(mountNode, data, { color = '#a78bfa' } = {}) {
  const uPlot = ensureUPlot();
  return new uPlot({
    ...COMMON_OPTS,
    width: mountNode.clientWidth || 240,
    series: [{}, { stroke: color, width: 1.5, points: { show: false } }],
  }, data, mountNode);
}

export function areaChart(mountNode, data, { color = '#a78bfa' } = {}) {
  const uPlot = ensureUPlot();
  return new uPlot({
    ...COMMON_OPTS,
    width: mountNode.clientWidth || 240,
    series: [{}, { stroke: color, width: 1.5, fill: `${color}33`, points: { show: false } }],
  }, data, mountNode);
}

export function barChart(mountNode, data, { color = '#a78bfa' } = {}) {
  const uPlot = ensureUPlot();
  return new uPlot({
    ...COMMON_OPTS,
    width: mountNode.clientWidth || 240,
    series: [{}, {
      stroke: color,
      fill: color,
      points: { show: false },
      paths: uPlot.paths.bars({ size: [0.6, Infinity] }),
    }],
  }, data, mountNode);
}
