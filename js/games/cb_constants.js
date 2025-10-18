//==============================
// Cosmic Balance Constants
//==============================

// Component catalog, moved to a more global scope for access by the designer
export const HULLS = [
    { id: 'sz1', name: 'Corvette', size: 1, mass: 2, baseSpace: (9 + 1) * Math.pow(2, 1 - 1) }, // Tech level 1 space
    { id: 'sz2', name: 'Frigate', size: 2, mass: 4, baseSpace: (9 + 1) * Math.pow(2, 2 - 1) },
    { id: 'sz3', name: 'Destroyer', size: 3, mass: 8, baseSpace: (9 + 1) * Math.pow(2, 3 - 1) },
    { id: 'sz4', name: 'Cruiser', size: 4, mass: 16, baseSpace: (9 + 1) * Math.pow(2, 4 - 1) },
    { id: 'sz5', name: 'Dreadnought', size: 5, mass: 32, baseSpace: (9 + 1) * Math.pow(2, 5 - 1) }
];

export const COMPONENTS = {
    drives: [{ id: 'dr1', name: 'Drive', space: 4, cost: 10 }],
    engines: [{ id: 'en1', name: 'Engine', space: 2, cost: 5, power: 8 }],
    warp: [{ id: 'wd1', name: 'Warp Drive', techSpace: 1, cost: 20 }], // Tech Sector
    cargo: [{ id: 'ca1', name: 'Cargo Hold', techSpace: 1, cost: 5 }], // Tech Sector
    fighters: [{ id: 'fb1', name: 'Fighter Bay', techSpace: 2, cost: 30 }], // Tech Sector
    tractors: [{ id: 'tr1', name: 'Tractor Beam', space: 4, cost: 15 }],
    marines: [{ id: 'mr1', name: 'Marines', space: 1, cost: 5 }],
    transporters: [{ id: 'tp1', name: 'Transporter', space: 1, cost: 10 }],
    armor: [{ id: 'ar1', name: 'Armor', space: 1, cost: 2 }],
    belts: [{ id: 'be1', name: 'Belt', space: 1, cost: 3 }],
    racks: [{ id: 'rk1', name: 'Seeker Rack', space: 2, cost: 4 }],
    seekers: [
        { id: 'sk1', name: 'Light Seeker', rackSpace: 1, cost: 2 },
        { id: 'sk2', name: 'Heavy Seeker', rackSpace: 2, cost: 5 }
    ],
    weapons: [
        { id: 'w_lp', name: 'Light Phaser', type: 'beam', range: 400, damage: 1, space: 0.5, arcBonus: 3/16, cost: 8, powerCost: 1, color: '#33CC33', cooldown: 1 },
        { id: 'w_hp', name: 'Heavy Phaser', type: 'beam', range: 500, damage: 2, space: 1, arcBonus: 3/8, cost: 12, powerCost: 1, color: '#CC3333', cooldown: 1 },
        { id: 'w_sp', name: 'Siege Phaser', type: 'beam', range: 600, damage: 3, space: 2, arcBonus: 3/4, cost: 18, powerCost: 2, color: '#FF8C00', cooldown: 1 },
        { id: 'w_d', name: 'Disruptor', type: 'beam', range: 800, damage: 2, space: 2, arcBonus: 3/4, cost: 20, powerCost: 2, color: '#9400D3', cooldown: 2 },
        { id: 'w_pt', name: 'Photon Torpedo', type: 'beam', range: 500, damage: 2, space: 2, arcBonus: 3/4, cost: 15, powerCost: 5, color: '#F0AD4E', cooldown: 1 },
        { id: 'w_plt', name: 'Plasma Torpedo', type: 'projectile', range: 600, damage: 5, speed: 15, space: 15, cost: 25, powerCost: 5, color: '#00BFFF', cooldown: 3 }
    ]
};

export const DEFAULT_SHIP_DESIGNS = [
    {
        id: 'default-enterprise',
        name: 'Enterprise',
        description: 'A well-rounded command cruiser with strong forward firepower and a marine detachment for strategic flexibility.',
        hull: 'sz4',
        components: [
            { category: 'warp', id: 'wd1', count: 2 },
            { category: 'engines', id: 'en1', count: 4 },
            { category: 'drives', id: 'dr1', count: 4 },
            { category: 'marines', id: 'mr1', count: 1 },
            { category: 'transporters', id: 'tp1', count: 1 },
            { category: 'weapons', id: 'w_pt', count: 4, arcs: [1, 8] }, // Photon Torpedoes
            { category: 'weapons', id: 'w_hp', count: 2, arcs: [1, 2, 3, 6, 7, 8] } // Heavy Phasers
        ],
        shields: [21, 20, 20, 20, 20, 20, 20, 21]
    },
    {
        id: 'default-reliant',
        name: 'Reliant',
        description: 'An aggressive gunship featuring all-around shields and versatile, 360-degree weapon arcs for brawling.',
        hull: 'sz4',
        components: [
            { category: 'warp', id: 'wd1', count: 2 },
            { category: 'engines', id: 'en1', count: 4 },
            { category: 'drives', id: 'dr1', count: 4 },
            { category: 'weapons', id: 'w_pt', count: 2, arcs: [1, 8] },
            { category: 'weapons', id: 'w_hp', count: 4, arcs: [1, 2, 3, 4, 5, 6, 7, 8] } // Heavy Phasers
        ],
        shields: [25, 25, 25, 25, 25, 25, 25, 25]
    }
];

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 1000;