import { boilerDatabase } from '../knowledge/boilers.js';

// Survey storage (in production, this would be a database)
const surveys = new Map();
const surveyResponses = new Map();

export const toolHandlers = {
  create_survey: async (input) => {
    const surveyId = `survey_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const survey = {
      id: surveyId,
      title: input.title,
      questions: input.questions.map((q, idx) => ({
        id: `q${idx + 1}`,
        ...q
      })),
      createdAt: new Date().toISOString()
    };

    surveys.set(surveyId, survey);
    surveyResponses.set(surveyId, []);

    return {
      success: true,
      surveyId,
      message: `Survey "${input.title}" created successfully with ${input.questions.length} questions.`,
      survey
    };
  },

  recommend_boiler: async (input) => {
    const {
      home_size_sqm,
      num_bedrooms = 3,
      num_bathrooms = 2,
      fuel_type,
      budget_range = 'mid_range',
      efficiency_priority = true
    } = input;

    // Calculate required kW
    const kwRequired = calculateKW(home_size_sqm);

    // Filter boilers by fuel type and requirements
    const suitableBoilers = boilerDatabase.filter(boiler => {
      const meetsSize = boiler.output_kw >= kwRequired * 0.9 && boiler.output_kw <= kwRequired * 1.3;
      const meetsFuel = boiler.fuel_type === fuel_type;
      const meetsBudget = matchesBudget(boiler.price_range, budget_range);

      return meetsSize && meetsFuel && meetsBudget;
    });

    // Sort by efficiency if priority
    if (efficiency_priority) {
      suitableBoilers.sort((a, b) => b.efficiency - a.efficiency);
    }

    const recommendations = suitableBoilers.slice(0, 3).map(boiler => ({
      ...boiler,
      suitability_score: calculateSuitability(boiler, input)
    }));

    return {
      required_kw: kwRequired,
      recommended_output: `${kwRequired}kW`,
      recommendations,
      reasoning: generateRecommendationReasoning(recommendations, input)
    };
  },

  calculate_heating_needs: async (input) => {
    const {
      home_size_sqm,
      ceiling_height = 2.4,
      insulation_quality = 'average',
      climate_zone = 'moderate',
      num_windows = Math.floor(home_size_sqm / 20)
    } = input;

    // Base calculation: 0.1-0.15 kW per square metre depending on factors
    let kwPerSqM = 0.12; // baseline for UK

    // Adjust for climate
    const climateMultipliers = {
      cold: 1.3,
      moderate: 1.0,
      warm: 0.7
    };
    kwPerSqM *= climateMultipliers[climate_zone];

    // Adjust for insulation
    const insulationMultipliers = {
      poor: 1.25,
      average: 1.0,
      good: 0.85,
      excellent: 0.7
    };
    kwPerSqM *= insulationMultipliers[insulation_quality];

    // Adjust for ceiling height
    if (ceiling_height > 2.4) {
      kwPerSqM *= (ceiling_height / 2.4);
    }

    // Adjust for windows (heat loss) - ~0.3kW per window
    const windowLoss = num_windows * 0.3;

    const totalKW = Math.round((home_size_sqm * kwPerSqM + windowLoss) * 10) / 10; // Round to 1 decimal
    const recommendedBoilerSize = Math.ceil(totalKW); // Round up to nearest kW

    return {
      total_kw_required: totalKW,
      recommended_boiler_size_kw: recommendedBoilerSize,
      kw_per_sqm: Math.round(kwPerSqM * 100) / 100,
      breakdown: {
        base_heating: Math.round(home_size_sqm * kwPerSqM * 10) / 10,
        window_loss: Math.round(windowLoss * 10) / 10,
        safety_margin: Math.round(totalKW * 0.15 * 10) / 10
      },
      recommendations: {
        min_output_kw: Math.round(totalKW * 0.9),
        ideal_output_kw: recommendedBoilerSize,
        max_output_kw: Math.ceil(totalKW * 1.3)
      }
    };
  },

  diagnose_boiler_issue: async (input) => {
    const { symptoms, error_code, boiler_age = 0, boiler_type = 'unknown' } = input;

    const diagnoses = [];
    const solutions = [];

    symptoms.forEach(symptom => {
      const diagnosis = getDiagnosisForSymptom(symptom, error_code, boiler_age, boiler_type);
      diagnoses.push(diagnosis);
    });

    // Determine urgency
    const urgentSymptoms = ['leaking', 'no_heat', 'error_code'];
    const isUrgent = symptoms.some(s => urgentSymptoms.includes(s));

    return {
      diagnoses,
      severity: isUrgent ? 'urgent' : boiler_age > 15 ? 'serious' : 'moderate',
      recommended_action: isUrgent ? 'Call a Gas Safe registered engineer immediately' :
                         boiler_age > 15 ? 'Schedule professional inspection' :
                         'Try basic troubleshooting first',
      diy_safe: !isUrgent && boiler_age < 10,
      estimated_cost: estimateRepairCost(symptoms, boiler_age),
      replacement_recommended: boiler_age > 15 && symptoms.length > 2
    };
  },

  compare_boilers: async (input) => {
    const { boiler_ids, comparison_criteria = ['efficiency', 'price', 'warranty'] } = input;

    const boilers = boiler_ids.map(id =>
      boilerDatabase.find(b => b.id === id) || { id, name: 'Not found' }
    );

    const comparison = {
      boilers: boilers.map(b => ({
        id: b.id,
        name: b.name,
        manufacturer: b.manufacturer,
        details: extractComparisonDetails(b, comparison_criteria)
      })),
      winner_by_criteria: determineWinners(boilers, comparison_criteria),
      overall_recommendation: determineOverallWinner(boilers)
    };

    return comparison;
  },

  estimate_installation_cost: async (input) => {
    const { boiler_type, fuel_type, installation_complexity, include_accessories = false } = input;

    // Base costs by type and fuel
    const baseCosts = {
      combi: { gas: 2500, oil: 3000, electric: 2000, lpg: 2800 },
      system: { gas: 2800, oil: 3300, electric: 2200, lpg: 3100 },
      conventional: { gas: 3000, oil: 3500, electric: 2500, lpg: 3300 }
    };

    const complexityMultipliers = {
      simple_replacement: 1.0,
      upgrade: 1.3,
      new_installation: 1.6,
      complex: 2.0
    };

    const baseEquipmentCost = baseCosts[boiler_type][fuel_type];
    const laborCost = baseEquipmentCost * 0.4 * complexityMultipliers[installation_complexity];
    const accessoriesCost = include_accessories ? 500 : 0;

    const total = baseEquipmentCost + laborCost + accessoriesCost;

    return {
      equipment_cost: baseEquipmentCost,
      labor_cost: Math.round(laborCost),
      accessories_cost: accessoriesCost,
      total_estimated_cost: Math.round(total),
      breakdown: {
        boiler: baseEquipmentCost,
        installation: Math.round(laborCost),
        controls_accessories: accessoriesCost,
        vat: Math.round(total * 0.05) // 5% VAT estimate
      },
      note: 'This is an estimate. Actual costs may vary based on location and specific requirements.'
    };
  },

  save_survey_response: async (input) => {
    const { survey_id, question_id, response } = input;

    if (!surveyResponses.has(survey_id)) {
      return {
        success: false,
        error: 'Survey not found'
      };
    }

    const responses = surveyResponses.get(survey_id);
    responses.push({
      question_id,
      response,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      message: 'Response saved successfully',
      total_responses: responses.length
    };
  }
};

// Helper functions
function calculateKW(sqm) {
  return Math.round(sqm * 0.12); // Simple baseline for UK: ~0.12kW per m²
}

function matchesBudget(priceRange, budget) {
  const budgetMap = {
    budget: ['budget', 'mid_range'],
    mid_range: ['budget', 'mid_range', 'premium'],
    premium: ['mid_range', 'premium']
  };
  return budgetMap[budget].includes(priceRange);
}

function calculateSuitability(boiler, requirements) {
  let score = 100;

  if (requirements.efficiency_priority && boiler.efficiency < 90) {
    score -= 20;
  }

  return score;
}

function generateRecommendationReasoning(recommendations, input) {
  if (recommendations.length === 0) {
    return 'No suitable boilers found for your requirements. Consider adjusting your criteria.';
  }

  const topPick = recommendations[0];
  return `Based on your ${input.home_size_sqm}m² home and ${input.fuel_type} fuel preference, ` +
         `the ${topPick.name} is recommended for its ${topPick.efficiency}% efficiency and ` +
         `${topPick.output_kw}kW output.`;
}

function getDiagnosisForSymptom(symptom, errorCode, age, type) {
  const diagnosisMap = {
    no_heat: {
      issue: 'No heating',
      possible_causes: ['Thermostat issue', 'Low pressure', 'Airlocks', 'Faulty pump', 'Boiler failure'],
      quick_fixes: ['Check thermostat settings', 'Check pressure gauge', 'Bleed radiators']
    },
    no_hot_water: {
      issue: 'No hot water',
      possible_causes: ['Diverter valve failure', 'Thermostat issue', 'Airlock'],
      quick_fixes: ['Check hot water temperature setting', 'Reset boiler']
    },
    strange_noises: {
      issue: 'Strange noises (kettling/banging)',
      possible_causes: ['Limescale buildup', 'Air in system', 'Pump issue'],
      quick_fixes: ['Bleed radiators', 'Check water pressure']
    },
    leaking: {
      issue: 'Water leaking',
      possible_causes: ['Pressure relief valve', 'Pipe corrosion', 'Seal failure'],
      quick_fixes: ['Turn off water supply', 'Call engineer immediately']
    },
    low_pressure: {
      issue: 'Low pressure',
      possible_causes: ['Water leak', 'Recently bled radiators', 'Pressure relief valve issue'],
      quick_fixes: ['Repressurise boiler using filling loop', 'Check for leaks']
    },
    pilot_light_out: {
      issue: 'Pilot light out',
      possible_causes: ['Thermocouple failure', 'Draft', 'Gas supply issue'],
      quick_fixes: ['Relight pilot following manual instructions', 'Check gas supply']
    }
  };

  return diagnosisMap[symptom] || {
    issue: symptom,
    possible_causes: ['Unknown - professional diagnosis required'],
    quick_fixes: ['Contact a Gas Safe registered engineer']
  };
}

function estimateRepairCost(symptoms, age) {
  const baseCosts = {
    no_heat: 150,
    no_hot_water: 200,
    strange_noises: 100,
    leaking: 250,
    low_pressure: 80,
    pilot_light_out: 120
  };

  const total = symptoms.reduce((sum, symptom) => sum + (baseCosts[symptom] || 150), 0);
  const ageFactor = age > 10 ? 1.5 : 1.0;

  return {
    min: Math.round(total * 0.7 * ageFactor),
    max: Math.round(total * 1.5 * ageFactor),
    currency: 'GBP'
  };
}

function extractComparisonDetails(boiler, criteria) {
  const details = {};
  criteria.forEach(criterion => {
    switch(criterion) {
      case 'efficiency':
        details.efficiency = `${boiler.efficiency}%`;
        break;
      case 'price':
        details.price_range = boiler.price_range;
        break;
      case 'warranty':
        details.warranty = `${boiler.warranty_years} years`;
        break;
      case 'output':
        details.output = `${boiler.output_btu} BTU`;
        break;
      case 'size':
        details.dimensions = boiler.dimensions;
        break;
      case 'features':
        details.features = boiler.features;
        break;
    }
  });
  return details;
}

function determineWinners(boilers, criteria) {
  const winners = {};
  criteria.forEach(criterion => {
    if (criterion === 'efficiency') {
      winners.efficiency = boilers.reduce((max, b) =>
        b.efficiency > max.efficiency ? b : max
      ).name;
    }
  });
  return winners;
}

function determineOverallWinner(boilers) {
  return boilers[0]?.name || 'N/A';
}
