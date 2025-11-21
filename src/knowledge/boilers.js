// Boiler knowledge database
export const boilerDatabase = [
  // Combi Boilers - Gas
  {
    id: 'worcester-bosch-greenstar-4000',
    name: 'Worcester Bosch Greenstar 4000',
    manufacturer: 'Worcester Bosch',
    type: 'combi',
    fuel_type: 'gas',
    output_btu: 102000, // 30kW
    efficiency: 94,
    price_range: 'premium',
    warranty_years: 10,
    dimensions: '440 x 380 x 290mm',
    features: ['Smart controls compatible', 'Quiet operation', 'Compact design'],
    suitable_for: '3-4 bedroom homes',
    pros: ['Excellent reliability', 'Long warranty', 'High efficiency'],
    cons: ['Premium price point']
  },
  {
    id: 'vaillant-ecotec-plus',
    name: 'Vaillant ecoTEC Plus',
    manufacturer: 'Vaillant',
    type: 'combi',
    fuel_type: 'gas',
    output_btu: 95000, // 28kW
    efficiency: 94,
    price_range: 'premium',
    warranty_years: 7,
    dimensions: '440 x 360 x 290mm',
    features: ['Weather compensation', 'Smart controls', 'Frost protection'],
    suitable_for: '2-4 bedroom homes',
    pros: ['German engineering', 'Very efficient', 'Good customer support'],
    cons: ['Parts can be expensive']
  },
  {
    id: 'ideal-logic-plus',
    name: 'Ideal Logic Plus',
    manufacturer: 'Ideal',
    type: 'combi',
    fuel_type: 'gas',
    output_btu: 102000, // 30kW
    efficiency: 92,
    price_range: 'mid_range',
    warranty_years: 7,
    dimensions: '450 x 380 x 285mm',
    features: ['Easy installation', 'Simple controls', 'Compact'],
    suitable_for: '3-4 bedroom homes',
    pros: ['Great value', 'Reliable', 'Good warranty'],
    cons: ['Slightly lower efficiency than premium models']
  },
  {
    id: 'baxi-800',
    name: 'Baxi 800',
    manufacturer: 'Baxi',
    type: 'combi',
    fuel_type: 'gas',
    output_btu: 68000, // 20kW
    efficiency: 89.9,
    price_range: 'budget',
    warranty_years: 5,
    dimensions: '440 x 360 x 275mm',
    features: ['Basic controls', 'Compact', 'Easy to use'],
    suitable_for: '1-2 bedroom homes',
    pros: ['Affordable', 'Compact size', 'Easy to install'],
    cons: ['Lower efficiency', 'Shorter warranty']
  },

  // System Boilers - Gas
  {
    id: 'worcester-greenstar-ri',
    name: 'Worcester Bosch Greenstar Ri',
    manufacturer: 'Worcester Bosch',
    type: 'system',
    fuel_type: 'gas',
    output_btu: 85000, // 25kW
    efficiency: 94,
    price_range: 'premium',
    warranty_years: 10,
    dimensions: '600 x 400 x 350mm',
    features: ['OpenTherm compatible', 'Modulating pump', 'Weather compensation'],
    suitable_for: '4-5 bedroom homes with multiple bathrooms',
    pros: ['Excellent for high demand', 'Very reliable', 'Great warranty'],
    cons: ['Requires cylinder space', 'Higher installation cost']
  },
  {
    id: 'vaillant-ecotec-pro',
    name: 'Vaillant ecoTEC Pro',
    manufacturer: 'Vaillant',
    type: 'system',
    fuel_type: 'gas',
    output_btu: 102000, // 30kW
    efficiency: 93,
    price_range: 'premium',
    warranty_years: 7,
    dimensions: '580 x 420 x 340mm',
    features: ['Weather compensation', 'Load compensation', 'Quiet operation'],
    suitable_for: '4-6 bedroom homes',
    pros: ['High output', 'Efficient', 'German quality'],
    cons: ['Premium pricing', 'Needs hot water cylinder']
  },

  // Conventional Boilers - Gas
  {
    id: 'ideal-mexico-heatmax',
    name: 'Ideal Mexico HeatMax',
    manufacturer: 'Ideal',
    type: 'conventional',
    fuel_type: 'gas',
    output_btu: 102000, // 30kW
    efficiency: 89,
    price_range: 'mid_range',
    warranty_years: 5,
    dimensions: '686 x 521 x 381mm',
    features: ['Traditional heating', 'Cast iron heat exchanger', 'Robust design'],
    suitable_for: 'Large homes with existing conventional systems',
    pros: ['Very reliable', 'Long lifespan', 'Good for large homes'],
    cons: ['Lower efficiency', 'Requires tanks and cylinder', 'Large footprint']
  },

  // Oil Boilers
  {
    id: 'grant-vortex-eco',
    name: 'Grant Vortex Eco',
    manufacturer: 'Grant',
    type: 'combi',
    fuel_type: 'oil',
    output_btu: 75000, // 22kW
    efficiency: 92,
    price_range: 'mid_range',
    warranty_years: 5,
    features: ['Condensing technology', 'External installation', 'Weather resistant'],
    suitable_for: 'Rural homes without gas supply',
    pros: ['Efficient oil boiler', 'Can be installed outside', 'Reliable'],
    cons: ['Requires oil tank', 'Oil price fluctuations', 'Regular tank fills needed']
  },
  {
    id: 'firebird-enviromax-combi',
    name: 'Firebird Enviromax Combi',
    manufacturer: 'Firebird',
    type: 'combi',
    fuel_type: 'oil',
    output_btu: 90000, // 26kW
    efficiency: 90,
    price_range: 'mid_range',
    warranty_years: 5,
    features: ['Blue flame technology', 'Outdoor installation', 'Compact'],
    suitable_for: 'Off-grid 3-4 bedroom homes',
    pros: ['Good efficiency for oil', 'Saves space', 'Irish-made quality'],
    cons: ['Oil dependency', 'Higher running costs than gas']
  },

  // Electric Boilers
  {
    id: 'electric-heating-company-comet',
    name: 'Electric Heating Company Comet',
    manufacturer: 'Electric Heating Company',
    type: 'system',
    fuel_type: 'electric',
    output_btu: 40950, // 12kW
    efficiency: 99.9,
    price_range: 'mid_range',
    warranty_years: 2,
    features: ['100% efficient', 'No flue needed', 'Silent operation', 'Compact'],
    suitable_for: 'Small homes, flats, off-grid properties',
    pros: ['No emissions', 'No annual service needed', 'Very compact', 'Safe'],
    cons: ['High electricity costs', 'Not suitable for large homes', 'Limited output']
  },
  {
    id: 'heatrae-sadia-electromax',
    name: 'Heatrae Sadia Electromax',
    manufacturer: 'Heatrae Sadia',
    type: 'system',
    fuel_type: 'electric',
    output_btu: 20475, // 6kW
    efficiency: 99.8,
    price_range: 'budget',
    warranty_years: 2,
    features: ['Economy 7 compatible', 'No emissions', 'Wall mounted'],
    suitable_for: 'Flats and small properties',
    pros: ['Very affordable', 'Easy installation', 'No gas safety checks'],
    cons: ['Limited capacity', 'High running costs', 'Slow recovery']
  },

  // LPG Boilers
  {
    id: 'worcester-greenstar-lpg',
    name: 'Worcester Bosch Greenstar (LPG)',
    manufacturer: 'Worcester Bosch',
    type: 'combi',
    fuel_type: 'lpg',
    output_btu: 95000, // 28kW
    efficiency: 93,
    price_range: 'premium',
    warranty_years: 10,
    features: ['LPG optimized', 'Smart controls', 'Modulating burner'],
    suitable_for: 'Off-grid 3-4 bedroom homes',
    pros: ['Excellent reliability', 'Great warranty', 'Efficient LPG use'],
    cons: ['LPG costs', 'Requires tank rental/purchase']
  }
];

// Energy efficiency ratings explained
export const efficiencyGuide = {
  'A-rated': 'Over 90% efficiency - Condensing boilers',
  'B-rated': '86-90% efficiency - Modern non-condensing',
  'C-rated': '82-86% efficiency - Older efficient models',
  'D-rated': '78-82% efficiency - Standard older boilers',
  'E-G-rated': 'Below 78% - Old inefficient boilers (replace urgently)'
};

// Boiler type explanations
export const boilerTypes = {
  combi: {
    name: 'Combination (Combi) Boiler',
    description: 'Heats water directly from mains when needed. No tank or cylinder required.',
    pros: ['Space saving', 'Instant hot water', 'Lower installation cost', 'Good water pressure'],
    cons: ['Limited to one outlet at a time', 'Not suitable for homes with high hot water demand', 'Dependent on mains pressure'],
    bestFor: 'Small to medium homes (1-3 bedrooms) with one bathroom'
  },
  system: {
    name: 'System Boiler',
    description: 'Stores hot water in a cylinder. Main components built in.',
    pros: ['Multiple taps simultaneously', 'Good for high demand', 'Efficient', 'Compatible with solar thermal'],
    cons: ['Requires cylinder space', 'More expensive installation', 'Hot water can run out'],
    bestFor: 'Medium to large homes with 2+ bathrooms'
  },
  conventional: {
    name: 'Conventional (Regular/Heat Only) Boiler',
    description: 'Traditional system with separate cold water tank and hot water cylinder.',
    pros: ['Great for very large homes', 'Compatible with older systems', 'Multiple outlets', 'Good pressure'],
    cons: ['Requires loft tank and cylinder', 'Takes up most space', 'More complex installation'],
    bestFor: 'Large homes with multiple bathrooms or existing conventional systems'
  }
};

// Common boiler issues and solutions
export const commonIssues = {
  kettling: {
    name: 'Kettling (Boiler making kettle-like noises)',
    causes: ['Limescale buildup on heat exchanger', 'Restricted water flow'],
    solutions: ['Power flush system', 'Chemical descale', 'Replace heat exchanger if severe'],
    urgency: 'medium',
    diy: false
  },
  no_pressure: {
    name: 'Loss of pressure',
    causes: ['Water leak in system', 'Faulty pressure relief valve', 'Recently bled radiators'],
    solutions: ['Check for visible leaks', 'Repressurise boiler', 'Check PRV', 'Call engineer if persistent'],
    urgency: 'low',
    diy: true
  },
  radiator_cold_spots: {
    name: 'Radiators with cold spots',
    causes: ['Air in system', 'Sludge buildup', 'Pump not working'],
    solutions: ['Bleed radiators', 'Power flush if sludge', 'Check pump operation'],
    urgency: 'low',
    diy: 'bleeding only'
  }
};

// Fuel type comparison
export const fuelComparison = {
  gas: {
    cost_per_kwh: 0.07,
    availability: 'High - most UK homes',
    efficiency: 'Very good with modern boilers',
    environmental_impact: 'Medium - fossil fuel but cleaner than oil',
    pros: ['Cheapest fuel', 'Convenient', 'Wide choice of boilers'],
    cons: ['Requires gas connection', 'Fossil fuel']
  },
  oil: {
    cost_per_kwh: 0.06,
    availability: 'Rural areas only',
    efficiency: 'Good with modern boilers',
    environmental_impact: 'Higher than gas',
    pros: ['Good for off-grid', 'Cheaper than LPG'],
    cons: ['Price volatility', 'Requires tank', 'Deliveries needed', 'Higher emissions']
  },
  lpg: {
    cost_per_kwh: 0.08,
    availability: 'Rural areas',
    efficiency: 'Very good',
    environmental_impact: 'Similar to gas',
    pros: ['Cleaner than oil', 'Good off-grid option'],
    cons: ['More expensive than gas', 'Tank required', 'Deliveries or rental']
  },
  electric: {
    cost_per_kwh: 0.24,
    availability: 'Universal',
    efficiency: '99%+ at point of use',
    environmental_impact: 'Depends on grid mix',
    pros: ['No emissions at home', 'No flue needed', 'Low maintenance', 'Getting greener'],
    cons: ['Very expensive to run', 'Limited output', 'Not suitable for large homes']
  }
};
