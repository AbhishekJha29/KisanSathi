"""Advisory engine module for KisanSathi smart crop advisory assistant.

Execution Flow:
    1. Validation: Request payload is validated and sanitized by validation service.
    2. Data Retrieval: Full agronomic crop profile is loaded from SQLite via crop_repository.
    3. Engine Processing (this module):
        - Converts land measurement to standardized acres.
        - Checks crop seasonal and soil compatibility warnings.
        - Calculates scaled fertilizer doses for plot area.
        - Adjusts irrigation frequencies and runtimes by water source and soil type.
        - Formats diagnostic pest alerts and sequential harvest procedures.
        - Generates personalized summaries and APMC mandi benchmark rates.
    4. Delivery: Returns structured AdvisoryResultData payload to client.

This module contains pure business logic and helper functions with zero Flask
or database dependencies.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

_MONTHS: List[str] = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
]


def convert_to_acres(land_size: float, land_unit: str) -> float:
    """Convert land measurement from specified unit into standard acres.

    Conversion Factors:
        - 1 hectare = 2.47105 acres
        - 1 bigha = 0.4 acre (standard North/Central Indian approximation)
        - 1 acre = 1.0 acre

    Args:
        land_size: Numerical land area value.
        land_unit: Land unit string ('acres', 'hectares', or 'bigha').

    Returns:
        float: Equivalent land area in acres rounded to 2 decimal places.
    """
    unit_normalized = (land_unit or "").strip().lower()
    if unit_normalized == "hectares":
        return round(land_size * 2.47105, 2)
    elif unit_normalized == "bigha":
        return round(land_size * 0.4, 2)
    return round(float(land_size), 2)


def check_season_suitability(
    crop: Dict[str, Any],
    selected_season: str,
) -> Optional[str]:
    """Verify whether selected cropping cycle aligns with crop seasonal profile.

    Args:
        crop: Full nested crop record dictionary.
        selected_season: Agricultural cycle ('kharif', 'rabi', or 'zaid').

    Returns:
        Optional[str]: seasonWarning string or None if suitable.
    """
    crop_seasons = [s.lower().strip() for s in crop.get("seasons", [])]
    chosen = selected_season.lower().strip()

    if crop_seasons and chosen not in crop_seasons:
        crop_name_en = crop.get("nameEn", "This crop")
        suitable_en = ", ".join(s.capitalize() for s in crop_seasons)
        formatted_chosen = chosen.capitalize()

        return (
            f"Notice: {crop_name_en} is conventionally cultivated in {suitable_en}, "
            f"but your selected cycle is {formatted_chosen}. Close monitoring of temperature "
            f"fluctuations and micro-irrigation management is strongly advised."
        )

    return None


def check_soil_suitability(
    crop: Dict[str, Any],
    selected_soil: str,
) -> Optional[str]:
    """Verify whether selected soil type matches crop soil compatibility.

    Args:
        crop: Full nested crop record dictionary.
        selected_soil: Soil type ID (e.g. 'loamy', 'black', 'alluvial').

    Returns:
        Optional[str]: soilWarning string or None if suitable.
    """
    crop_soils = [s.lower().strip() for s in crop.get("soils", [])]
    chosen_soil = selected_soil.lower().strip()

    # If crop specifies compatible soils and chosen soil does not match any
    if crop_soils and not any(chosen_soil in s or s in chosen_soil for s in crop_soils):
        crop_name_en = crop.get("nameEn", "This crop")
        suitable_soils_en = ", ".join(s.capitalize() for s in crop_soils)

        return (
            f"Soil Compatibility Notice: {crop_name_en} yields optimally in {suitable_soils_en} soil, "
            f"whereas your plot has {chosen_soil.capitalize()} soil. Incorporate organic matter, "
            f"maintain proper drainage, and adjust basal fertilizer incorporation."
        )

    return None


def _scale_dosage_text(text: str, acres: float) -> str:
    """Scale dosage numbers within an agronomic recommendation string.

    Avoids scaling NPK ratio grades (e.g. 19:19:19 or 00:52:34) and percentages.

    Args:
        text: Raw dosage string (e.g. '50 kg DAP + 20 kg MOP').
        acres: Calculated plot area in acres.

    Returns:
        str: Dose string with unit quantities scaled for plot size.
    """
    if not text:
        return ""

    if abs(acres - 1.0) < 1e-4:
        return text

    def _replace_unit_qty(match: re.Match[str]) -> str:
        num_str, unit_str = match.group(1), match.group(2)
        try:
            val = float(num_str)
            scaled = val * acres
            # Format integer if whole number, otherwise 1 decimal place
            formatted_num = f"{int(scaled)}" if scaled.is_integer() else f"{scaled:.1f}"
            return f"{formatted_num} {unit_str}"
        except (ValueError, TypeError):
            return match.group(0)

    # Matches quantities tied to physical mass or volume units (e.g., 50 kg, 20 tonnes, 200 g, 100 L)
    pattern = r"\b(\d+(?:\.\d+)?)\s*(kg|tonnes|tonne|g|gm|liters|litres|L|qtl|quintal)\b"
    scaled_text = re.sub(pattern, _replace_unit_qty, text, flags=re.IGNORECASE)
    return scaled_text


def build_fertilizer_plan(
    crop: Dict[str, Any],
    acres: float,
) -> List[Dict[str, str]]:
    """Build nutrient application plan with doses scaled to plot acreage.

    Args:
        crop: Full nested crop record dictionary.
        acres: Plot area in acres.

    Returns:
        List[Dict[str, str]]: Ordered fertilizer stages with scaled doses.
    """
    raw_stages = crop.get("fertilizerStages", [])
    if not raw_stages:
        return [
            {
                "stage": "Basal Application",
                "fertilizerName": "Balanced NPK + Micronutrient Mix",
                "qtyPerAcre": f"{round(50 * acres)} kg NPK Complex",
                "applicationMethod": "Drill into seedbed prior to sowing",
            }
        ]

    plan: List[Dict[str, str]] = []
    for stage in raw_stages:
        raw_qty = stage.get("quantityPerAcre") or ""
        scaled_qty = _scale_dosage_text(raw_qty, acres)

        plan.append(
            {
                "stage": stage.get("stageEn") or f"Stage {stage.get('stageOrder', 1)}",
                "fertilizerName": stage.get("fertilizerEn") or "Fertilizer Dose",
                "qtyPerAcre": scaled_qty,
                "applicationMethod": stage.get("applicationMethod") or "Broadcast with irrigation",
            }
        )
    return plan


def build_irrigation_plan(
    crop: Dict[str, Any],
    water_source: str,
    soil: str,
) -> Dict[str, Any]:
    """Calculate irrigation schedule adjusted by water source and soil texture.

    Args:
        crop: Full nested crop record dictionary.
        water_source: Water delivery method ('drip', 'sprinkler', 'canal', etc.).
        soil: Soil type ('sandy', 'clay', 'loamy', etc.).

    Returns:
        Dict[str, Any]: Tailored irrigation metrics and moisture milestones.
    """
    irrig_data = crop.get("irrigation") or {}
    ws_lower = (water_source or "").lower()
    soil_lower = (soil or "").lower()

    is_drip = "drip" in ws_lower
    is_sprinkler = "sprinkler" in ws_lower

    # 1. Efficiency and water conservation adjustments
    if is_drip:
        efficiency_gain = "30% water and fertilizer efficiency gain with drip fertigation"
        water_conserved = "~40% Conserved via Drip"
        runtime = "1.5–2.0 hours per fertigation zone"
    elif is_sprinkler:
        efficiency_gain = "25% water efficiency gain with overhead sprinkler"
        water_conserved = "~35% Conserved via Sprinkler"
        runtime = "2.0 hours per sprinkler shift"
    else:
        efficiency_gain = crop.get("efficiencyGain") or "20% yield boost with timely irrigation"
        water_conserved = irrig_data.get("waterConserved") or "~25% with planned irrigation"
        runtime = irrig_data.get("runtimePerZone") or "2.0–2.5 hours per rotation"

    # 2. Cycle frequency tailored to soil water retention characteristics
    base_freq = irrig_data.get("frequencyEn") or "Every 8–10 Days"
    if "sandy" in soil_lower:
        freq_note = f"{base_freq} (Light, frequent waterings for sandy soil)"
    elif "clay" in soil_lower:
        freq_note = f"{base_freq} (Ensure surface drainage for clay soil)"
    else:
        freq_note = base_freq

    # 3. Moisture stress stages
    critical_stages_str = irrig_data.get("criticalStagesEn") or ""
    moisture_stages: List[Dict[str, Any]] = []
    if critical_stages_str:
        raw_parts = [p.strip() for p in critical_stages_str.split(",") if p.strip()]
        statuses = [
            "Most Critical - Do not miss",
            "High moisture need for grain/fruit setting",
            "Light irrigation prevents shriveling",
        ]
        for idx, part in enumerate(raw_parts[:3]):
            moisture_stages.append(
                {
                    "step": idx + 1,
                    "title": part,
                    "status": statuses[idx] if idx < len(statuses) else "Maintain optimal moisture",
                }
            )

    if not moisture_stages:
        moisture_stages = [
            {"step": 1, "title": "Vegetative Establishment", "status": "Most Critical - Do not miss"},
            {"step": 2, "title": "Flowering & Peak Growth", "status": "High moisture requirement"},
            {"step": 3, "title": "Grain / Fruit Development", "status": "Light irrigation prevents stress"},
        ]

    stagnation = (
        crop.get("stagnationAlert")
        or irrig_data.get("tipsEn")
        or "Avoid standing water for more than 24 hours. Ensure drainage."
    )

    return {
        "efficiencyGain": efficiency_gain,
        "waterConserved": water_conserved,
        "runtimePerZone": runtime,
        "irrigationFrequency": freq_note,
        "moistureStages": moisture_stages,
        "stagnationAlert": stagnation,
    }


def build_pest_alerts(crop: Dict[str, Any]) -> List[Dict[str, str]]:
    """Format crop protection and pest/disease management alerts.

    Args:
        crop: Full nested crop record dictionary.

    Returns:
        List[Dict[str, str]]: Diagnostic symptoms and IPM mitigation steps.
    """
    raw_pests = crop.get("pestsDiseases", [])
    if not raw_pests:
        return [
            {
                "name": "General Sucking Pests & Leaf Spot",
                "severity": "Medium Risk",
                "symptoms": "Foliage curling, chlorotic spots, and sticky honeydew.",
                "control": "Spray Neem oil 1500 ppm (5 ml/L) or recommended bio-pesticide upon early notice.",
            }
        ]

    alerts: List[Dict[str, str]] = []
    for p in raw_pests:
        alerts.append(
            {
                "name": p.get("nameEn") or "Pest / Disease",
                "severity": p.get("severity") or "Medium Risk",
                "symptoms": p.get("symptomsEn") or "Scout plants regularly for leaf curling or spotting.",
                "control": p.get("controlEn") or "Apply recommended IPM control measures promptly.",
            }
        )
    return alerts


def build_harvest_plan(crop: Dict[str, Any]) -> List[Dict[str, str]]:
    """Format step-by-step harvesting, curing, and storage indicators.

    Args:
        crop: Full nested crop record dictionary.

    Returns:
        List[Dict[str, str]]: Chronological harvest steps.
    """
    raw_steps = crop.get("harvestSteps", [])
    if not raw_steps:
        indicator = crop.get("harvestingIndicator") or "Maturity reached when crop shows golden yellow dry signs."
        return [
            {"letter": "A", "title": "Maturity Check", "desc": indicator},
            {"letter": "B", "title": "Timely Harvesting", "desc": "Harvest during dry sunny hours to prevent loss."},
            {"letter": "C", "title": "Post-Harvest Storage", "desc": "Clean and store in moisture-proof conditions."},
        ]

    steps: List[Dict[str, str]] = []
    for idx, s in enumerate(raw_steps):
        letter = s.get("letter") or chr(65 + idx)
        title = s.get("titleEn") or f"Step {idx + 1}"
        desc = s.get("textEn") or ""
        steps.append({"letter": letter, "title": title, "desc": desc})
    return steps


def build_mandi_rates(crop: Dict[str, Any], region: str) -> List[Dict[str, str]]:
    """Construct benchmark APMC mandi market rate estimates.

    Args:
        crop: Full nested crop record dictionary.
        region: Agro-climatic zone label (e.g. 'North', 'West').

    Returns:
        List[Dict[str, str]]: APMC mandi benchmark ticker items.
    """
    crop_name = crop.get("nameEn", "Produce")
    price_range = crop.get("marketPrice") or crop.get("mandiPriceRange") or "₹2,500 - ₹3,500 / Qtl"
    clean_price = price_range.replace(" (approx.)", "").strip()
    variety = crop.get("varietyTag") or "Standard Variety"

    return [
        {
            "cropName": f"{crop_name} (Grade-A / Premium)",
            "variety": variety,
            "marketYard": f"{region} APMC Benchmark Yard",
            "rateRange": clean_price,
            "trend": "trending_up",
            "trendText": "+₹40 / Qtl this week",
        },
        {
            "cropName": f"{crop_name} (Common / FAQ)",
            "variety": "Standard Lot",
            "marketYard": "National Mandi Average",
            "rateRange": clean_price,
            "trend": "trending_flat",
            "trendText": "Steady Demand",
        },
    ]


def build_summary(
    crop: Dict[str, Any],
    form: Dict[str, Any],
    region: str,
    is_drip: bool,
) -> str:
    """Generate localized synthesis narrative.

    Greeting follows standard etiquette ('Hello!') without
    hardcoding any personal individual name.

    Args:
        crop: Full nested crop record dictionary.
        form: Validated advisory input form.
        region: Agro-climatic zone.
        is_drip: Boolean flag for micro-irrigation presence.

    Returns:
        str: personalizedIntro narrative.
    """
    district = form.get("district") or "your area"
    block = form.get("block")
    state = form.get("state") or "India"
    land_size = form.get("landSize", 1)
    land_unit = form.get("landUnit", "acres")
    water_source = form.get("waterSource", "irrigation")

    loc_str = f"{district}{f' ({block})' if block else ''}, {state} ({region} Region)"

    intro_tip_en = crop.get("introTipEn") or "Ensure balanced NPK nutrition and monitor soil moisture."
    water_en = "drip fertigation" if is_drip else f"{water_source.replace('_', ' ')} irrigation"

    return (
        f"Hello! For your {land_size} {land_unit} plot in {loc_str}, {intro_tip_en} "
        f"With {water_en}, maintain optimal soil moisture and scout leaves regularly for pests."
    )


def generate_advisory(
    form: Dict[str, Any],
    crop: Dict[str, Any],
    region: str,
    today: Optional[date] = None,
) -> Dict[str, Any]:
    """Generate comprehensive agricultural advisory report.

    Args:
        form: Validated form data dictionary.
        crop: Full nested crop record from database repository.
        region: Agro-climatic region (e.g. 'North', 'South', etc.).
        today: Deterministic date override (defaults to date.today()).

    Returns:
        Dict[str, Any]: Structured advisory matching TypeScript AdvisoryResultData interface.
    """
    # 1. Date calculation
    eval_date: date = today if today is not None else date.today()
    month_name: str = _MONTHS[eval_date.month - 1]
    season_raw = form.get("season", "kharif")
    season_formatted = season_raw.capitalize()
    generated_date = f"{month_name} {eval_date.year} / {season_formatted} Season"

    # 2. Land area normalization
    land_size = float(form.get("landSize", 1.0))
    land_unit = form.get("landUnit", "acres")
    acres = convert_to_acres(land_size, land_unit)

    # 3. Zone naming and irrigation mode
    state = form.get("state") or "India"
    zone_name = f"{region} Agro-Climatic Region ({state})"
    water_source = form.get("waterSource", "")
    soil_type = form.get("soilType") or form.get("soil", "loamy")
    is_drip = "drip" in water_source.lower()

    # 4. Warnings
    season_warning = check_season_suitability(crop, season_raw)
    soil_warning = check_soil_suitability(crop, soil_type)

    # 5. Composite plan builders
    intro = build_summary(crop, form, region, is_drip)
    fertilizer_plan = build_fertilizer_plan(crop, acres)
    irrigation_plan = build_irrigation_plan(crop, water_source, soil_type)
    pest_alerts = build_pest_alerts(crop)
    harvest_steps = build_harvest_plan(crop)
    mandi_rates = build_mandi_rates(crop, region)

    expected_yield = crop.get("expectedYield") or crop.get("avgYield") or "15 - 20 Quintal / Acre (approx.)"
    micronutrient = (
        crop.get("micronutrientNote")
        or "Apply balanced zinc and boron micronutrients during active vegetative growth."
    )

    result: Dict[str, Any] = {
        "fieldData": form,
        "generatedDate": generated_date,
        "zoneName": zone_name,
        "personalizedIntro": intro,
        "efficiencyGain": irrigation_plan["efficiencyGain"],
        "fertilizerPlan": fertilizer_plan,
        "micronutrientNote": micronutrient,
        "irrigationFrequency": irrigation_plan["irrigationFrequency"],
        "waterConserved": irrigation_plan["waterConserved"],
        "runtimePerZone": irrigation_plan["runtimePerZone"],
        "moistureStages": irrigation_plan["moistureStages"],
        "stagnationAlert": irrigation_plan["stagnationAlert"],
        "pests": pest_alerts,
        "harvestSteps": harvest_steps,
        "expectedYield": expected_yield,
        "mandiRates": mandi_rates,
    }

    # Add optional suitability warnings if present
    if season_warning:
        result["seasonWarning"] = season_warning

    if soil_warning:
        result["soilWarning"] = soil_warning

    return result
