import { dom, appState } from '../scripts.js';
import { showToast } from '../ui.js';
import { HULLS, COMPONENTS, DEFAULT_SHIP_DESIGNS } from './cb_constants.js';

export function showShipDesigner() {
    if (document.getElementById('ship-designer-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'ship-designer-overlay';
    overlay.className = 'ship-designer-overlay';
    document.body.appendChild(overlay);
    renderShipDesigner();
}

function closeShipDesigner() {
    const overlay = document.getElementById('ship-designer-overlay');
    if (overlay) {
        overlay.remove();
    }
}

function renderShipDesigner() {
    const overlay = document.getElementById('ship-designer-overlay');
    overlay.innerHTML = `
        <div class="designer-header">
            <h2>Ship Designer</h2>
            <div>
                <button id="new-design-btn" class="theme-button">New Design</button>
                <button class="designer-close-btn" onclick="closeShipDesignerFromGlobal()">&times;</button> <!-- NOSONAR -->
            </div>
        </div>
        <div class="ship-designer">
            <div id="designer-component-column" class="designer-column">
                <h3>Component Catalog</h3>
                <div id="component-list"></div>
            </div>
            <div id="ship-layout-area" class="ship-layout-area">
                <input type="text" id="ship-design-name" placeholder="Enter Ship Name" class="theme-button" style="width: 50%; align-self: center; text-align: center;">
                <div id="ship-stats-grid" class="ship-stats-grid"></div>
                <div id="installed-components" class="designer-column">
                    <h4>Installed Components</h4>
                </div>
            </div>
            <div class="designer-column">
                <h3>Saved Designs</h3>
                <div id="saved-designs-list"></div>
                <button id="save-design-btn" class="theme-button">Save Current Design</button>
            </div>
        </div>
    `;

    window.closeShipDesignerFromGlobal = closeShipDesigner;

    const componentList = document.getElementById('component-list');
    Object.keys(COMPONENTS).forEach(category => {
        componentList.innerHTML += `<h4>${category.charAt(0).toUpperCase() + category.slice(1)}</h4>`;
        COMPONENTS[category].forEach(component => {
            const item = document.createElement('div');
            item.className = 'component-item theme-button';
            item.textContent = component.name;
            item.draggable = true;
            item.dataset.componentId = component.id;
            item.dataset.category = category;
            item.addEventListener('dragstart', () => {
                window.draggedComponentData = { id: component.id, category: category };
            });
            componentList.appendChild(item);
        });
    });

    const shipLayoutArea = document.getElementById('ship-layout-area');
    shipLayoutArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        shipLayoutArea.classList.add('drag-over');
    });
    shipLayoutArea.addEventListener('dragleave', () => shipLayoutArea.classList.remove('drag-over'));
    shipLayoutArea.addEventListener('drop', handleComponentDrop);

    updateShipStats(appState.soloGameState.currentDesign);
    renderSavedDesigns();

    document.getElementById('new-design-btn').onclick = showNewDesignSelector;
    document.getElementById('save-design-btn').onclick = saveCurrentDesign;
}

function showNewDesignSelector() {
    const layoutArea = document.getElementById('ship-layout-area');
    layoutArea.innerHTML = `
        <div style="text-align: center;">
            <h3>Start a New Design</h3>
            <p>Select a Hull and Technology Level to begin.</p>
            <div class="designer-column">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h4>1. Select Hull</h4>
                    <span id="hull-info-text" style="font-size: 0.9rem; color: var(--text-light);"></span>
                </div>
                <div id="hull-selector-list">
                    ${HULLS.map(hull => `<button class="theme-button component-item" data-hull-id="${hull.id}">${hull.name}</button>`).join('')}
                </div>
            </div>
            <div class="designer-column">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h4>2. Select Tech Level</h4>
                    <span id="tech-info-text" style="font-size: 0.9rem; color: var(--text-light);"></span>
                </div>
                <div id="tech-selector-list">
                     ${[1,2,3,4,5,6].map(n => `<button class="theme-button component-item" data-tech-level="${n}">Tech ${n}</button>`).join('')}
                </div>
            </div>
            <div class="button-row" style="justify-content: center;">
                <button id="begin-design-btn" class="theme-button" disabled>Begin Design</button>
                <button id="cancel-new-design-btn" class="theme-button">Cancel</button>
            </div>
        </div>
    `;

    const hullButtons = layoutArea.querySelectorAll('button[data-hull-id]');
    const beginBtn = document.getElementById('begin-design-btn');
    const techButtons = layoutArea.querySelectorAll('button[data-tech-level]');
    const hullInfo = document.getElementById('hull-info-text');
    const techInfo = document.getElementById('tech-info-text');
    const cancelBtn = document.getElementById('cancel-new-design-btn');

    let selectedHullId = null;
    let selectedTechLevel = 1;

    hullButtons.forEach(button => {
        button.onclick = () => {
            hullButtons.forEach(btn => btn.classList.remove('active-hand'));
            button.classList.add('active-hand');
            selectedHullId = button.dataset.hullId;
            const hull = HULLS.find(h => h.id === selectedHullId);
            hullInfo.textContent = `Size: ${hull.size}, Mass: ${hull.mass}`;
            beginBtn.disabled = !selectedHullId;
        };
    });

    techButtons.forEach(button => {
        button.onclick = () => {
            techButtons.forEach(btn => btn.classList.remove('active-hand'));
            button.classList.add('active-hand');
            selectedTechLevel = parseInt(button.dataset.techLevel, 10);
            techInfo.textContent = `Space per Tech Sector: ${9 + selectedTechLevel}`;
        };
    });

    beginBtn.onclick = () => {
        if (selectedHullId) {
            appState.soloGameState.currentDesign = {
                id: `design-${Date.now()}`,
                name: `${HULLS.find(h => h.id === selectedHullId).name} Mk I`,
                hull: selectedHullId,
                techLevel: selectedTechLevel,
                components: []
            };
            renderShipDesigner();
        }
    };

    cancelBtn.onclick = renderShipDesigner;
}

function renderSavedDesigns() {
    const savedList = document.getElementById('saved-designs-list');
    savedList.innerHTML = '';
    const allDesigns = [...DEFAULT_SHIP_DESIGNS, ...appState.soloGameState.shipDesigns];

    allDesigns.forEach(design => {
        const item = document.createElement('div');
        item.className = 'component-item theme-button';
        let deleteBtn = '';
        if (!design.id.startsWith('default-')) {
            deleteBtn = `<button class="designer-close-btn" style="font-size: 1.5rem; padding: 0 5px;" data-design-id="${design.id}">&times;</button>`;
        }
        const designInfo = `<div style="flex-grow: 1; cursor: pointer;"><strong>${design.name}</strong><br><small>${design.description || ''}</small></div>`;
        item.innerHTML = `${designInfo} ${deleteBtn}`;
        item.style.display = 'flex';
        item.style.alignItems = 'center';

        item.querySelector('div').onclick = () => loadDesignIntoDesigner(design);

        const deleteButton = item.querySelector('button.designer-close-btn');
        if (deleteButton) {
            deleteButton.onclick = (e) => {
                e.stopPropagation();
                deleteSavedDesign(design.id);
            };
        }
        savedList.appendChild(item);
    });
}

function loadDesignIntoDesigner(design) {
    appState.soloGameState.currentDesign = JSON.parse(JSON.stringify(design));
    document.getElementById('ship-design-name').value = appState.soloGameState.currentDesign.name;
    rerenderCurrentDesign();
}

function handleComponentDrop(event) {
    event.preventDefault();
    document.getElementById('ship-layout-area').classList.remove('drag-over');

    const data = window.draggedComponentData;
    if (!data || !appState.soloGameState.currentDesign) return;

    const component = COMPONENTS[data.category].find(c => c.id === data.id);
    if (component) {
        const existingComponent = appState.soloGameState.currentDesign.components.find(c => c.id === data.id && c.category === data.category);
        if (existingComponent) {
            existingComponent.count++;
        } else {
            appState.soloGameState.currentDesign.components.push({ category: data.category, id: data.id, count: 1 });
        }
        rerenderCurrentDesign();
    }
}

function updateShipStats(design) {
    const statsGrid = document.getElementById('ship-stats-grid');
    if (!statsGrid) return;
    if (!design) {
        statsGrid.innerHTML = `<div class="stat-item"><strong>Select a design to begin...</strong></div>`;
        return;
    }

    const hull = HULLS.find(h => h.id === design.hull);
    const techLevel = design.techLevel || 1;
    const totalSpace = (9 + techLevel) * Math.pow(2, hull.size - 1);

    let spaceUsed = 0;
    design.components.forEach(compInfo => {
        const component = COMPONENTS[compInfo.category].find(c => c.id === compInfo.id);
        if (component) {
            spaceUsed += calculateComponentSpace(component, compInfo, techLevel);
        }
    });
    const spaceLeft = totalSpace - spaceUsed;

    const power = design.components.filter(c => c.category === 'engines').reduce((sum, c) => sum + (COMPONENTS.engines.find(e => e.id === c.id)?.power || 0) * c.count, 0);
    const mass = hull.mass;

    statsGrid.innerHTML = `
        <div class="stat-item"><strong>SPACE LEFT:</strong> ${spaceLeft.toFixed(2)}</div>
        <div class="stat-item"><strong>POWER:</strong> ${power}</div>
        <div class="stat-item"><strong>MASS:</strong> ${mass}</div>
        <div class="stat-item"><strong>TECH LEVEL:</strong> ${techLevel}</div>
    `;
}

function calculateComponentSpace(component, compInfo, techLevel) {
    if (component.techSpace) {
        return component.techSpace * (9 + techLevel) * compInfo.count;
    }
    if (compInfo.category === 'weapons' && compInfo.arcs) {
        const baseSpace = component.space;
        const arcBonus = component.arcBonus;
        const numArcs = compInfo.arcs.length;
        const totalArcCost = numArcs > 1 ? baseSpace + (arcBonus * (numArcs - 1)) : baseSpace;
        return totalArcCost * compInfo.count;
    }
    return (component.space || 0) * compInfo.count;
}

function setWeaponArcs(weaponInfo) {
    const currentArcs = weaponInfo.arcs ? weaponInfo.arcs.join(',') : '1,8';
    const newArcsInput = prompt('Enter firing arcs (1-8, comma-separated):', currentArcs);

    if (newArcsInput !== null) {
        const parsedArcs = newArcsInput.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= 8);
        if (parsedArcs.length > 0) {
            weaponInfo.arcs = parsedArcs;
            rerenderCurrentDesign();
        }
    }
}

function removeComponent(categoryId, componentId) {
    const design = appState.soloGameState.currentDesign;
    if (!design) return;

    const componentIndex = design.components.findIndex(c => c.category === categoryId && c.id === componentId);
    if (componentIndex > -1) {
        const component = design.components[componentIndex];
        component.count--;
        if (component.count <= 0) {
            design.components.splice(componentIndex, 1);
        }
        rerenderCurrentDesign();
    }
}

function saveCurrentDesign() {
    const currentDesign = appState.soloGameState.currentDesign;
    if (!currentDesign) {
        showToast('No active design to save.', 'error');
        return;
    }

    currentDesign.name = document.getElementById('ship-design-name').value || 'Unnamed Design';

    const existingIndex = appState.soloGameState.shipDesigns.findIndex(d => d.id === currentDesign.id);
    if (existingIndex > -1) {
        appState.soloGameState.shipDesigns[existingIndex] = currentDesign;
    } else {
        appState.soloGameState.shipDesigns.push(currentDesign);
    }

    localStorage.setItem('cosmicBalanceDesigns', JSON.stringify(appState.soloGameState.shipDesigns));
    showToast(`Design "${currentDesign.name}" saved!`, 'info');
    renderSavedDesigns();
}

export function loadDesignsFromStorage() {
    const saved = localStorage.getItem('cosmicBalanceDesigns');
    return saved ? JSON.parse(saved) : [];
}

function rerenderCurrentDesign() {
    const design = appState.soloGameState.currentDesign;
    const installedList = document.getElementById('installed-components');
    installedList.innerHTML = '<h4>Installed Components</h4>';

    design.components.forEach(compInfo => {
        const component = COMPONENTS[compInfo.category].find(c => c.id === compInfo.id);
        if (component) {
            installedList.appendChild(createInstalledComponentElement(compInfo, component));
        }
    });
    updateShipStats(design);
}

function createInstalledComponentElement(compInfo, component) {
    const techLevel = appState.soloGameState.currentDesign.techLevel || 1;
    const spaceCost = calculateComponentSpace(component, compInfo, techLevel);

    const itemDiv = document.createElement('div');
    itemDiv.className = 'installed-component';
    itemDiv.innerHTML = `<span>${component.name} (x${compInfo.count}) - Space: ${spaceCost.toFixed(2)}</span>`;

    if (compInfo.category === 'weapons') {
        const arcBtn = document.createElement('button');
        arcBtn.textContent = 'Set Arcs';
        arcBtn.className = 'arc-selector-btn theme-button';
        arcBtn.onclick = (e) => { e.stopPropagation(); setWeaponArcs(compInfo); };
        itemDiv.appendChild(arcBtn);
    }

    const removeBtn = document.createElement('button');
    removeBtn.innerHTML = '&times;';
    removeBtn.className = 'remove-component-btn';
    removeBtn.onclick = (e) => { e.stopPropagation(); removeComponent(compInfo.category, compInfo.id); };
    itemDiv.appendChild(removeBtn);

    return itemDiv;
}

function deleteSavedDesign(designId) {
    if (!confirm('Are you sure you want to delete this design?')) {
        return;
    }

    const designs = appState.soloGameState.shipDesigns;
    const designIndex = designs.findIndex(d => d.id === designId);

    if (designIndex > -1) {
        designs.splice(designIndex, 1);
        localStorage.setItem('cosmicBalanceDesigns', JSON.stringify(designs));
        showToast('Design deleted.', 'info');
        renderSavedDesigns();
    }
}