"""Tariff, carbon and currency rules.

Single source of truth for every monetary and environmental figure the
platform produces. The forecast, anomaly, recommendation and report services
all read from here so a rate change lands in one place instead of three.

Rates default to an Indian commercial TOU schedule, which is what the
synthetic datasets model. Override via env:

    ECOMIND_TARIFF_PEAK_RATE=0.31
    ECOMIND_CO2_KG_PER_KWH=0.708
"""

from __future__ import annotations

import os
from dataclasses import asdict, dataclass
from datetime import datetime

# --- Carbon ----------------------------------------------------------------
# kg CO2 per kWh. 0.5 is the Indian grid baseline factor.
CO2_KG_PER_KWH = float(os.getenv("ECOMIND_CO2_KG_PER_KWH", "0.5"))

CURRENCY = "INR"
CURRENCY_SYMBOL = "₹"


@dataclass(frozen=True)
class TariffBand:
    """A time-of-use band."""

    key: str
    label: str
    rate_per_kwh: float
    start_hour: int
    end_hour: int  # exclusive, wraps at 24


# Weekdays. Weekend and public-holiday consumption is billed at the
# shoulder rate so that the night-shifting recommendations the platform
# generates actually pay off against this schedule.
BANDS: tuple[TariffBand, ...] = (
    TariffBand(
        key="peak",
        label="Peak",
        rate_per_kwh=float(os.getenv("ECOMIND_TARIFF_PEAK_RATE", "0.28")),
        start_hour=9,
        end_hour=22,
    ),
    TariffBand(
        key="shoulder",
        label="Shoulder",
        rate_per_kwh=float(os.getenv("ECOMIND_TARIFF_SHOULDER_RATE", "0.17")),
        start_hour=22,
        end_hour=24,
    ),
    TariffBand(
        key="off_peak",
        label="Off-peak",
        rate_per_kwh=float(os.getenv("ECOMIND_TARIFF_OFFPEAK_RATE", "0.09")),
        start_hour=0,
        end_hour=9,
    ),
)

# Non-working days bill at the shoulder rate.
WEEKEND_RATE_PER_KWH = 0.17
FLAT_FALLBACK_RATE_PER_KWH = 0.20

# Standing charge applied once per billing period.
STANDING_CHARGE_PER_PERIOD = float(os.getenv("ECOMIND_STANDING_CHARGE", "125.0"))

# Typical billing period length in days.
BILLING_PERIOD_DAYS = 30


def band_for_hour(hour: int) -> TariffBand:
    """Return the tariff band covering ``hour`` (0-23)."""
    hour = int(hour) % 24
    for band in BANDS:
        if band.start_hour <= band.end_hour:
            if band.start_hour <= hour < band.end_hour:
                return band
        else:  # wraps midnight
            if hour >= band.start_hour or hour < band.end_hour:
                return band
    return BANDS[-1]


def rate_for(ts: datetime | None = None) -> float:
    """Blended rate per kWh for a single reading."""
    if ts is None:
        return FLAT_FALLBACK_RATE_PER_KWH
    if ts.weekday() >= 5:
        return WEEKEND_RATE_PER_KWH
    return band_for_hour(ts.hour).rate_per_kwh


def cost_of(kwh: float, ts: datetime | None = None) -> float:
    """Cost in rupees for ``kwh`` consumed at time ``ts``."""
    return round(float(kwh) * rate_for(ts), 4)


def blended_rate(kwh_series) -> float:
    """Volume-weighted average rate across an iterable of (kwh, ts) pairs."""
    total_kwh = 0.0
    total_cost = 0.0
    for kwh, ts in kwh_series:
        if kwh is None:
            continue
        kwh = float(kwh)
        if kwh <= 0:
            continue
        total_kwh += kwh
        total_cost += kwh * rate_for(ts)
    if total_kwh <= 0:
        return FLAT_FALLBACK_RATE_PER_KWH
    return round(total_cost / total_kwh, 4)


def cost_of_series(kwh_values, timestamps) -> float:
    """Cost for parallel kWh / timestamp sequences."""
    pairs = zip(kwh_values or [], timestamps or [])
    total = 0.0
    for kwh, ts in pairs:
        if kwh is None:
            continue
        kwh = float(kwh)
        if kwh <= 0:
            continue
        total += kwh * rate_for(ts)
    return round(total, 2)


def co2_of(kwh: float) -> float:
    """kg CO2 for ``kwh`` consumed."""
    return round(float(kwh) * CO2_KG_PER_KWH, 4)


def co2_tonnes(kwh: float) -> float:
    """Metric tonnes of CO2 for ``kwh`` consumed."""
    return round(float(kwh) * CO2_KG_PER_KWH / 1000.0, 4)


def band_for_key(key: str) -> TariffBand | None:
    for band in BANDS:
        if band.key == key:
            return band
    return None


def projected_bill(period_kwh: float, n_periods: int = 1) -> dict:
    """Illustrative bill: consumption at the blended rate plus standing charge."""
    rate = blended_rate([(period_kwh, None)])
    consumption_cost = period_kwh * rate
    total = consumption_cost + STANDING_CHARGE_PER_PERIOD * max(1, n_periods)
    return {
        "kwh": round(float(period_kwh), 2),
        "rate_per_kwh": rate,
        "consumption_cost": round(consumption_cost, 2),
        "standing_charge": round(STANDING_CHARGE_PER_PERIOD * max(1, n_periods), 2),
        "total": round(total, 2),
        "currency": CURRENCY,
    }


def tariff_summary() -> dict:
    """Serialisable description of the schedule, for the UI and the report."""
    return {
        "currency": CURRENCY,
        "currency_symbol": CURRENCY_SYMBOL,
        "co2_kg_per_kwh": CO2_KG_PER_KWH,
        "standing_charge_per_period": STANDING_CHARGE_PER_PERIOD,
        "billing_period_days": BILLING_PERIOD_DAYS,
        "bands": [asdict(b) for b in BANDS],
        "weekend_rate_per_kwh": WEEKEND_RATE_PER_KWH,
    }
