"""
Analytical Pharmacokinetic Engine and Competition Metric Evaluator.
"""
import numpy as np
import pandas as pd
from typing import Dict, Tuple, Union
from src.config import C_PEAK_MAX, C_AVG_MIN, C_AVG_MAX, TIME_HORIZON, TIME_PEAK

def calc_dose_bounds(
    cl: Union[float, np.ndarray],
    vd: Union[float, np.ndarray]
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Analytically derives exact dose boundaries for 1-compartment IV bolus:
    C(t) = (Dose / Vd) * exp(-CL/Vd * t)

    Returns:
    - d_min_avg: Minimum dose satisfying C_avg >= 6 mg/L
    - d_max_avg: Maximum dose satisfying C_avg <= 12 mg/L
    - d_max_peak: Maximum dose satisfying C(0.5) <= 26 mg/L
    - d_upper: min(d_max_avg, d_max_peak)
    """
    cl = np.asarray(cl, dtype=float)
    vd = np.asarray(vd, dtype=float)
    k = cl / vd

    exp_term = 1.0 - np.exp(-TIME_HORIZON * k)
    # Avoid division by zero
    exp_term = np.where(exp_term <= 1e-9, 1e-9, exp_term)

    # C_avg = Dose / (12 * CL) * (1 - exp(-12 * k))
    # 6 <= C_avg <= 12
    d_min_avg = (C_AVG_MIN * TIME_HORIZON * cl) / exp_term
    d_max_avg = (C_AVG_MAX * TIME_HORIZON * cl) / exp_term

    # C(0.5) = (Dose / Vd) * exp(-0.5 * k) <= 26
    d_max_peak = C_PEAK_MAX * vd * np.exp(TIME_PEAK * k)

    d_upper = np.minimum(d_max_avg, d_max_peak)
    return d_min_avg, d_max_avg, d_max_peak, d_upper


def compute_robust_dose(
    cl: Union[float, np.ndarray],
    vd: Union[float, np.ndarray],
    alpha: float = 0.50
) -> np.ndarray:
    """
    Computes robust individual dose from predicted (or true) CL and Vd.
    - If [D_min_avg, D_upper] is valid (non-empty): Dose = D_min_avg + alpha * (D_upper - D_min_avg)
    - If window is empty (k > 0.450, rapid elimination): clamps strictly to D_max_peak to guarantee peak safety.
    """
    d_min_avg, d_max_avg, d_max_peak, d_upper = calc_dose_bounds(cl, vd)

    valid_window = d_min_avg <= d_upper
    # When window is valid, interpolate between lower and upper bound with alpha
    dose = np.where(
        valid_window,
        d_min_avg + alpha * (d_upper - d_min_avg),
        d_max_peak
    )
    # Ensure dose is strictly positive and non-NaN
    dose = np.nan_to_num(dose, nan=100.0, posinf=500.0, neginf=50.0)
    return np.maximum(dose, 1.0)


def simulate_concentrations(
    dose: np.ndarray,
    cl: np.ndarray,
    vd: np.ndarray
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Simulates:
    1. C(0.5): Concentration at 30 minutes.
    2. C_avg(0-12): Average concentration over the first 12 hours.
    """
    cl = np.asarray(cl, dtype=float)
    vd = np.asarray(vd, dtype=float)
    dose = np.asarray(dose, dtype=float)
    k = cl / vd

    c_peak = (dose / vd) * np.exp(-TIME_PEAK * k)
    exp_term = 1.0 - np.exp(-TIME_HORIZON * k)
    c_avg = (dose / (TIME_HORIZON * cl)) * exp_term
    return c_peak, c_avg


def evaluate_competition_metrics(
    cl_pred: np.ndarray,
    vd_pred: np.ndarray,
    cl_true: np.ndarray,
    vd_true: np.ndarray,
    doses: np.ndarray
) -> Dict[str, float]:
    """
    Calculates exact hackathon metrics:
    - MAPE_CL and MAPE_Vd (%)
    - Pk_acc = max(0, 100 - 0.5 * (MAPE_CL + MAPE_Vd))
    - TAR (% of patients meeting both therapeutic constraints)
    - T = (TAR + Pk_acc) / 2
    """
    cl_pred = np.asarray(cl_pred, dtype=float)
    vd_pred = np.asarray(vd_pred, dtype=float)
    cl_true = np.asarray(cl_true, dtype=float)
    vd_true = np.asarray(vd_true, dtype=float)
    doses = np.asarray(doses, dtype=float)

    mape_cl = np.mean(np.abs(cl_pred - cl_true) / cl_true) * 100.0
    mape_vd = np.mean(np.abs(vd_pred - vd_true) / vd_true) * 100.0
    pk_acc = float(np.maximum(0.0, 100.0 - 0.5 * (mape_cl + mape_vd)))

    # Evaluate therapeutic success using true physiological PK parameters
    c_peak_true, c_avg_true = simulate_concentrations(doses, cl_true, vd_true)
    success = (
        (c_peak_true <= C_PEAK_MAX + 1e-4) &
        (c_avg_true >= C_AVG_MIN - 1e-4) &
        (c_avg_true <= C_AVG_MAX + 1e-4)
    )
    tar = float(np.mean(success) * 100.0)
    t_score = float(0.5 * (tar + pk_acc))

    peak_viol = float(np.mean(c_peak_true > C_PEAK_MAX + 1e-4) * 100.0)
    low_viol = float(np.mean(c_avg_true < C_AVG_MIN - 1e-4) * 100.0)
    high_viol = float(np.mean(c_avg_true > C_AVG_MAX + 1e-4) * 100.0)

    return {
        "MAPE_CL": mape_cl,
        "MAPE_Vd": mape_vd,
        "Pk_acc": pk_acc,
        "TAR": tar,
        "T_score": t_score,
        "Peak_violations_pct": peak_viol,
        "Underdose_violations_pct": low_viol,
        "Overdose_violations_pct": high_viol,
    }


def optimize_alpha(
    cl_pred: np.ndarray,
    vd_pred: np.ndarray,
    cl_true: np.ndarray,
    vd_true: np.ndarray,
    alpha_grid: np.ndarray = None
) -> Tuple[float, float]:
    """
    Performs grid search to find alpha maximizing TAR on validation set.
    """
    if alpha_grid is None:
        alpha_grid = np.linspace(0.30, 0.70, 41)

    best_alpha = 0.50
    best_tar = -1.0

    for a in alpha_grid:
        d = compute_robust_dose(cl_pred, vd_pred, alpha=a)
        c_peak, c_avg = simulate_concentrations(d, cl_true, vd_true)
        tar = np.mean((c_peak <= C_PEAK_MAX + 1e-4) & (c_avg >= C_AVG_MIN - 1e-4) & (c_avg <= C_AVG_MAX + 1e-4)) * 100.0
        if tar > best_tar:
            best_tar = tar
            best_alpha = float(a)

    return best_alpha, best_tar
