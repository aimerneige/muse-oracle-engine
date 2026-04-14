// API URL base
const API_BASE = '/api/v1';

// DOM Elements
const appDiv = document.getElementById('app')!;

// App State
let seriesData: any[] = [];
let styles: any[] = [];
let currentProjectId: string | null = null;
let currentProject: any = null;

// Initialization
async function init() {
  renderLoading('Initializing Manga Generator...');
  try {
    const [charRes, styleRes] = await Promise.all([
      fetch(`${API_BASE}/characters`),
      fetch(`${API_BASE}/styles`)
    ]);
    const charData = await charRes.json();
    styles = await styleRes.json();
    
    // Keep series-grouped structure for collapsible UI
    seriesData = charData;

    renderCreateForm();
  } catch (err) {
    appDiv.innerHTML = `<h2 style="color:red; text-align:center;">Failed to connect to backend API</h2>`;
  }
}

// ---------------- UI Renderers ---------------- //

function renderLoading(message: string) {
  appDiv.innerHTML = `
    <div class="loading-container active">
      <div class="loading-spinner"></div>
      <p class="subtitle mt-4">${message}</p>
    </div>
  `;
}

function renderCreateForm() {
  appDiv.innerHTML = `
    <h1>Create New Manga</h1>
    <p class="subtitle">Select your characters and provide a story outline</p>
    
    <form id="create-form" class="step-container active">
      <div class="input-group">
        <label>Characters</label>
        <div class="char-series-container" id="char-series-container">
          ${seriesData.map((series: any, idx: number) => `
            <div class="char-series-group" data-series="${series.series.id}">
              <button type="button" class="char-series-header" onclick="toggleSeries(this)">
                <span class="header-inner">
                  <span class="series-arrow">${idx === 0 ? '&#9660;' : '&#9654;'}</span>
                  <span class="series-name">${series.series.name}</span>
                  <span class="series-count">${series.characters.length}</span>
                </span>
              </button>
              <div class="char-grid ${idx === 0 ? '' : 'series-collapsed'}">
                ${series.characters.map((c: any) => `
                  <label class="char-card" data-id="${c.id}">
                    <input type="checkbox" value="${c.id}" />
                    ${c.name_jp || c.name_en}
                  </label>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="input-group">
        <label>Art Style</label>
        <select id="style-select" required>
          ${styles.map(s => `
            <option value="${s.id}">${s.name}</option>
          `).join('')}
        </select>
      </div>

      <div class="input-group">
        <label>Plot Hint / Scenario</label>
        <textarea id="plot-hint" placeholder="e.g. Honoka visits a haunted house..." required></textarea>
      </div>

      <button type="submit">Start Generation ✨</button>
    </form>
  `;

  // Handle character card selection toggle
  document.querySelectorAll('.char-card').forEach(card => {
    const cb = card.querySelector('input')! as HTMLInputElement;
    
    cb.addEventListener('change', () => {
      if (cb.checked) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });
  });

  const form = document.getElementById('create-form') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const selectedChars = Array.from(document.querySelectorAll('.char-card input:checked'))
                            .map((el: any) => el.value);
    
    if (selectedChars.length === 0) {
      alert("Please select at least 1 character");
      return;
    }

    const style = (document.getElementById('style-select') as HTMLSelectElement).value;
    const plot = (document.getElementById('plot-hint') as HTMLTextAreaElement).value;

    const btn = form.querySelector('button')!;
    btn.disabled = true;
    btn.innerHTML = `Creating...`;

    try {
      const res = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characters: selectedChars,
          style: style,
          plot_hint: plot
        })
      });
      const data = await res.json();
      if (data.id) {
        currentProjectId = data.id;
        currentProject = data;
        await runPipeline();
      } else {
        alert("Failed to create project: " + JSON.stringify(data));
      }
    } catch (e: any) {
      alert(e.message);
    }
  });
}

// ---------------- Pipeline Trigger ---------------- //

async function runPipeline() {
  if (!currentProjectId) return;

  // 1. Generate Story
  renderLoading("Drafting the story based on your hints...");
  const storyRes = await fetch(`${API_BASE}/projects/${currentProjectId}/generate/story`, { method: 'POST' });
  currentProject = await storyRes.json();

  // 2. Generate Storyboard
  renderLoading("Creating comic panels and storyboard...");
  const boardRes = await fetch(`${API_BASE}/projects/${currentProjectId}/generate/storyboard`, { method: 'POST' });
  currentProject = await boardRes.json();

  // 3. Review phase
  renderReviewPhase();
}

function renderReviewPhase() {
  if (!currentProject.storyboard) return;

  appDiv.innerHTML = `
    <h1>Review Storyboard</h1>
    <p class="subtitle">Review the drafted panels before generating images</p>
    
    <div style="background: rgba(0,0,0,0.3); padding: 16px; border-radius: 12px; max-height: 300px; overflow-y: auto; margin-bottom: 20px;">
      ${currentProject.storyboard.panels.map((p: any) => `
        <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1);">
          <strong>Panel ${p.index}</strong>
          <p style="margin: 4px 0; color: #a5b4fc;">[Setting] ${p.setting}</p>
          <p style="margin: 4px 0; color: #fecdd3;">[Action] ${p.action}</p>
          <p style="margin: 4px 0; color: #fef08a;">[Dialogue] ${p.dialogue}</p>
        </div>
      `).join('')}
    </div>

    <div class="feedback-section">
      <button id="btn-approve">Approve & Generate Images ✨</button>
      <button id="btn-reject" class="reject-btn">Reject / Retry</button>
    </div>
  `;

  document.getElementById('btn-approve')!.addEventListener('click', async () => {
    renderLoading("Sending to render queue...");
    await fetch(`${API_BASE}/projects/${currentProjectId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true, feedback: "" })
    });
    renderLoading("Generating final images... This may take a while depending on the model.");
    await fetch(`${API_BASE}/projects/${currentProjectId}/generate/images`, { method: 'POST' });
    
    // Refresh project details to get images
    const res = await fetch(`${API_BASE}/projects/${currentProjectId}`);
    currentProject = await res.json();
    
    renderResults();
  });

  document.getElementById('btn-reject')!.addEventListener('click', async () => {
    const fb = prompt("What should be changed?");
    if (fb !== null) {
      document.getElementById('btn-reject')!.setAttribute('disabled', 'true');
      await fetch(`${API_BASE}/projects/${currentProjectId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: false, feedback: fb })
      });
      // Retry storyboard
      renderLoading("Regenerating storyboard with feedback...");
      await fetch(`${API_BASE}/projects/${currentProjectId}/retry/storyboard`, { method: 'POST' });
      const res = await fetch(`${API_BASE}/projects/${currentProjectId}`);
      currentProject = await res.json();
      renderReviewPhase();
    }
  });
}

function renderResults() {
  appDiv.innerHTML = `
    <h1>Manga Complete! 🎉</h1>
    <p class="subtitle">Here are the generated panels for your project</p>
    
    <div class="comic-grid">
      ${currentProject.images.map((img: any) => `
        <div style="position:relative;">
          <img src="${API_BASE}/projects/${currentProjectId}/images/${img.index}?t=${new Date().getTime()}" alt="Panel ${img.index}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' fill=\\'none\\' viewBox=\\'0 0 24 24\\' stroke=\\'white\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'2\\' d=\\'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z\\'/></svg>'"/>
          <p style="text-align:center; font-size: 0.8rem; margin-top: 8px; color: #a5b4fc;">Panel ${img.index}</p>
        </div>
      `).join('')}
    </div>

    <button style="margin-top: 30px; margin-inline: auto;" onclick="location.reload()">Create Another ✨</button>
  `;
}

// Start app
init();

// Globally accessible for inline onclick handlers
(window as any).toggleSeries = function(btn: HTMLElement) {
  const group = btn.closest('.char-series-group')!;
  const grid = group.querySelector('.char-grid')!;
  const arrow = btn.querySelector('.series-arrow')!;
  const isCollapsed = grid.classList.contains('series-collapsed');
  
  if (isCollapsed) {
    grid.classList.remove('series-collapsed');
    arrow.innerHTML = '&#9660;';
  } else {
    grid.classList.add('series-collapsed');
    arrow.innerHTML = '&#9654;';
  }
};
