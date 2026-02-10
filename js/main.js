// Main entry point for D3 visualizations

const VIS_CONFIG = {
  width: 900,
  height: 400,
  margin: { top: 40, right: 30, bottom: 50, left: 60 },
};

// Placeholder for Visualization 1
function initVis1() {
  const container = d3.select('#vis1');
  container.html('');

  const svg = container
    .append('svg')
    .attr('width', VIS_CONFIG.width)
    .attr('height', VIS_CONFIG.height);

  svg
    .append('text')
    .attr('x', VIS_CONFIG.width / 2)
    .attr('y', VIS_CONFIG.height / 2)
    .attr('text-anchor', 'middle')
    .attr('fill', '#aaa')
    .attr('font-size', '1.2rem')
    .text('Visualization 1 — Coming Soon');
}

// Placeholder for Visualization 2
function initVis2() {
  const container = d3.select('#vis2');
  container.html('');

  const svg = container
    .append('svg')
    .attr('width', VIS_CONFIG.width)
    .attr('height', VIS_CONFIG.height);

  svg
    .append('text')
    .attr('x', VIS_CONFIG.width / 2)
    .attr('y', VIS_CONFIG.height / 2)
    .attr('text-anchor', 'middle')
    .attr('fill', '#aaa')
    .attr('font-size', '1.2rem')
    .text('Visualization 2 — Coming Soon');
}

// Initialize all visualizations
function init() {
  initVis1();
  initVis2();
}

init();
