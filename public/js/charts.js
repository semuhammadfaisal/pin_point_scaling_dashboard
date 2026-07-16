const instances = new Map();
const palette = {
  indigo: '#5b5bd6',
  indigoSoft: 'rgba(91,91,214,.12)',
  green: '#18a278',
  greenSoft: 'rgba(24,162,120,.12)',
  amber: '#d49424',
  red: '#d65b70',
  blue: '#3d83d5',
  slate: '#8290a6',
  purple: '#8a61d2',
};

function stageFor(canvas) {
  return canvas?.closest('[data-chart-stage]');
}

export function destroyChart(id) {
  instances.get(id)?.destroy();
  instances.delete(id);
}

export function setChartState(id, state) {
  const canvas = document.getElementById(id);
  const stage = stageFor(canvas);
  if (!stage) return;
  stage.classList.toggle('loading', state === 'loading');
  stage.querySelector('.chart-empty')?.classList.toggle('d-none', state !== 'empty');
  canvas.classList.toggle('d-none', state === 'empty');
}

export function renderChart(id, configuration) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  if (!window.Chart) {
    window.addEventListener('load', () => renderChart(id, configuration), { once: true });
    return;
  }
  destroyChart(id);
  const hasData = configuration.data.datasets.some((dataset) => dataset.data.some((value) => Number(value) !== 0));
  if (!hasData) {
    setChartState(id, 'empty');
    return;
  }
  setChartState(id, 'ready');
  const chart = new Chart(canvas, {
    ...configuration,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 7, color: '#697386', padding: 18, font: { size: 11 } } },
        tooltip: { padding: 11, cornerRadius: 9, backgroundColor: '#172033', titleFont: { size: 11 }, bodyFont: { size: 11 } },
        ...(configuration.options?.plugins || {}),
      },
      scales: configuration.type === 'doughnut' ? undefined : {
        x: { grid: { display: false }, ticks: { color: '#8892a4', maxRotation: 0, autoSkip: true, maxTicksLimit: 10, font: { size: 10 } } },
        y: { beginAtZero: true, grid: { color: '#edf0f5' }, ticks: { color: '#8892a4', precision: 0, font: { size: 10 } } },
        ...(configuration.options?.scales || {}),
      },
      ...(configuration.options || {}),
    },
  });
  instances.set(id, chart);
}

export function lineChart(id, labels, datasets, options = {}) {
  renderChart(id, {
    type: 'line',
    data: { labels, datasets: datasets.map((dataset, index) => ({
      borderColor: dataset.color || [palette.indigo, palette.green, palette.amber, palette.blue][index],
      backgroundColor: dataset.fill ? (dataset.backgroundColor || palette.indigoSoft) : 'transparent',
      borderWidth: 2, pointRadius: labels.length > 18 ? 0 : 2, pointHoverRadius: 4, tension: .34, fill: Boolean(dataset.fill), ...dataset,
    })) },
    options,
  });
}

export function barChart(id, labels, datasets, options = {}) {
  renderChart(id, {
    type: 'bar',
    data: { labels, datasets: datasets.map((dataset, index) => ({
      backgroundColor: dataset.color || [palette.indigo, palette.green, palette.amber, palette.blue, palette.purple][index],
      borderRadius: 5, maxBarThickness: 34, ...dataset,
    })) },
    options,
  });
}

export function doughnutChart(id, labels, data) {
  renderChart(id, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: [palette.green, palette.indigo, palette.amber, palette.red], borderWidth: 0, hoverOffset: 5 }] },
    options: { cutout: '66%' },
  });
}

export { palette };
