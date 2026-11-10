"""Unit tests for the KisanSathi advisory engine core logic.

Tests pure functions without database dependencies:
    - Unit conversions (acres, hectares, bigha)
    - Linear scaling of fertilizer quantities by land size
    - Seasonal suitability warning logic (wheat in Kharif vs Rabi)
    - Soil suitability warning logic
    - Greeting anonymity (no hardcoded person names)
    - Engine determinism given fixed evaluation date
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path
from typing import Any, Dict

import pytest

# Ensure project root is present on sys.path
_PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from backend.services.advisory_engine import (
    convert_to_acres,
    build_fertilizer_plan,
    check_season_suitability,
    check_soil_suitability,
    generate_advisory,
)


@pytest.fixture
def sample_wheat_crop() -> Dict[str, Any]:
    """Provide a standalone crop dictionary fixture modeling wheat."""
    return {
        "id": "wheat",
        "nameEn": "Wheat",
        "scientificName": "Triticum aestivum",
        "seasons": ["rabi"],
        "soils": ["loamy", "alluvial"],
        "varietyTag": "HD-2967 / PBW-343",
        "duration": "110–130 Days",
        "waterNeed": "Medium (4–6 Irrigations)",
        "introTipEn": "Crown Root Initiation (CRI at 21 DAS) is the most critical stage.",
        "efficiencyGain": "20% yield boost with timely CRI irrigation",
        "micronutrientNote": "Spray 0.5% ZnSO4 if zinc deficient.",
        "stagnationAlert": "Avoid stagnant water for more than 24 hours.",
        "expectedYield": "18 - 24 Quintal / Acre (approx.)",
        "marketPrice": "₹2,275 - ₹2,450 / Qtl",
        "fertilizerStages": [
            {
                "stageOrder": 1,
                "stageEn": "Basal Dose",
                "timingEn": "At sowing",
                "fertilizerEn": "DAP + Muriate of Potash + Zinc Sulphate",
                "quantityPerAcre": "50 kg DAP + 20 kg MOP + 10 kg ZnSO4",
                "applicationMethod": "Drill 4–5 cm below seed level during sowing",
            },
            {
                "stageOrder": 2,
                "stageEn": "First Top Dressing (21–25 DAS / CRI)",
                "timingEn": "21–25 DAS",
                "fertilizerEn": "Neem-Coated Urea",
                "quantityPerAcre": "35 kg Urea",
                "applicationMethod": "Broadcast just before first irrigation",
            },
        ],
        "irrigation": {
            "frequencyEn": "Every 18–22 Days (4–5 irrigations)",
            "criticalStagesEn": "Crown Root Initiation (20–25 DAS), Booting & Flowering (70–85 DAS)",
            "runtimePerZone": "2.5 hours per rotation",
            "waterConserved": "~30% via furrow / sprinkler",
            "tipsEn": "Avoid stagnant water for more than 24 hours.",
        },
        "pestsDiseases": [
            {
                "nameEn": "Yellow / Brown Rust",
                "severity": "High Alert",
                "symptomsEn": "Yellow to orange-brown powdery pustules.",
                "controlEn": "Spray Propiconazole 25% EC (1 ml/L water).",
            }
        ],
        "harvestSteps": [
            {
                "letter": "A",
                "titleEn": "Maturity Testing",
                "textEn": "Grain moisture should drop below 12%.",
            }
        ],
    }


def test_unit_conversions() -> None:
    """Test unit conversions from acres, hectares, and bigha to standard acres."""
    # Acres (1:1)
    assert convert_to_acres(1.0, "acres") == 1.0
    assert convert_to_acres(5.5, "acres") == 5.5

    # Hectares (1 hectare = 2.47105 acres)
    assert convert_to_acres(1.0, "hectares") == 2.47
    assert convert_to_acres(2.0, "hectares") == 4.94

    # Bigha (1 bigha = 0.4 acre)
    assert convert_to_acres(1.0, "bigha") == 0.4
    assert convert_to_acres(10.0, "bigha") == 4.0
    assert convert_to_acres(2.5, "bigha") == 1.0


def test_fertilizer_quantities_scale_linearly(sample_wheat_crop: Dict[str, Any]) -> None:
    """Test that fertilizer quantities scale linearly with calculated plot acreage."""
    # Baseline: 1.0 Acre
    plan_1_acre = build_fertilizer_plan(sample_wheat_crop, acres=1.0)
    assert len(plan_1_acre) == 2
    assert "50 kg DAP" in plan_1_acre[0]["qtyPerAcre"]
    assert "20 kg MOP" in plan_1_acre[0]["qtyPerAcre"]
    assert "10 kg ZnSO4" in plan_1_acre[0]["qtyPerAcre"]
    assert "35 kg Urea" in plan_1_acre[1]["qtyPerAcre"]

    # Scaled: 5.0 Acres (5x multiplier)
    plan_5_acres = build_fertilizer_plan(sample_wheat_crop, acres=5.0)
    assert "250 kg DAP" in plan_5_acres[0]["qtyPerAcre"]
    assert "100 kg MOP" in plan_5_acres[0]["qtyPerAcre"]
    assert "50 kg ZnSO4" in plan_5_acres[0]["qtyPerAcre"]
    assert "175 kg Urea" in plan_5_acres[1]["qtyPerAcre"]

    # Scaled: 0.5 Acre (0.5x multiplier)
    plan_half_acre = build_fertilizer_plan(sample_wheat_crop, acres=0.5)
    assert "25 kg DAP" in plan_half_acre[0]["qtyPerAcre"]
    assert "10 kg MOP" in plan_half_acre[0]["qtyPerAcre"]
    assert "5 kg ZnSO4" in plan_half_acre[0]["qtyPerAcre"]
    assert "17.5 kg Urea" in plan_half_acre[1]["qtyPerAcre"]


def test_wheat_kharif_returns_season_warning(sample_wheat_crop: Dict[str, Any]) -> None:
    """Test that cultivating wheat in Kharif produces seasonal suitability warnings."""
    warning_en = check_season_suitability(sample_wheat_crop, "kharif")
    assert warning_en is not None
    assert "Wheat is conventionally cultivated in Rabi" in warning_en


def test_wheat_rabi_no_season_warning(sample_wheat_crop: Dict[str, Any]) -> None:
    """Test that cultivating wheat in Rabi does not produce seasonal suitability warnings."""
    warning_en = check_season_suitability(sample_wheat_crop, "rabi")
    assert warning_en is None


def test_unsuitable_soil_returns_soil_warning(sample_wheat_crop: Dict[str, Any]) -> None:
    """Test that cultivating on incompatible soil produces a soil warning."""
    # Red soil is not in wheat's ['loamy', 'alluvial'] list
    warning_en = check_soil_suitability(sample_wheat_crop, "red")
    assert warning_en is not None
    assert "Soil Compatibility Notice" in warning_en

    # Loamy soil is compatible
    ok_en = check_soil_suitability(sample_wheat_crop, "loamy")
    assert ok_en is None


def test_greeting_contains_no_personal_name(sample_wheat_crop: Dict[str, Any]) -> None:
    """Test that advisory greeting strictly uses standard polite salutation without farmer name."""
    form_data = {
        "crop": "wheat",
        "soilType": "loamy",
        "season": "rabi",
        "state": "Punjab",
        "district": "Ludhiana",
        "landSize": 5.0,
        "landUnit": "acres",
        "waterSource": "canal",
        "farmerName": "Sardar Jaspal Singh",  # Personal name must not appear in greeting
    }

    result = generate_advisory(form_data, sample_wheat_crop, region="North")

    # Assert greeting does not hardcode or interpolate personal individual name
    assert "Sardar Jaspal Singh" not in result["personalizedIntro"]
    assert "personalizedIntroHi" not in result

    # Verify standard universal greeting
    assert result["personalizedIntro"].startswith("Hello!")


def test_advisory_deterministic_with_fixed_today(sample_wheat_crop: Dict[str, Any]) -> None:
    """Test that identical requests evaluated on fixed date produce identical results."""
    form_data = {
        "crop": "wheat",
        "soilType": "loamy",
        "season": "rabi",
        "state": "Uttar Pradesh",
        "district": "Varanasi",
        "landSize": 2.5,
        "landUnit": "acres",
        "waterSource": "drip",
    }
    fixed_date = date(2026, 10, 18)

    result_1 = generate_advisory(form_data, sample_wheat_crop, region="North", today=fixed_date)
    result_2 = generate_advisory(form_data, sample_wheat_crop, region="North", today=fixed_date)

    assert result_1 == result_2
    assert result_1["generatedDate"] == "October 2026 / Rabi Season"
