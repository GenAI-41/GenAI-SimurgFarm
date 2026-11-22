"""
Generate submission_deep_67.csv using the trained 5-fold CatBoost ensemble.
"""
import sys
from pathlib import Path
import pandas as pd
import numpy as np
import joblib

BASE_DIR = Path(__file__).resolve().parent
DATA_TEST = BASE_DIR / "expamlomycin_test.csv"
MODELS_DIR = BASE_DIR / "output" / "models"
OUTPUT_DIR = BASE_DIR / "output"

sys.path.append(str(BASE_DIR))
from src.features import add_biomedical_features
from src.dosing import compute_robust_dose

def run():
    print(f"Loading test data from: {DATA_TEST}")
    test_raw = pd.read_csv(DATA_TEST, sep=";")
    print(f"Test shape: {test_raw.shape}")
    assert test_raw.shape == (500, 15), f"Unexpected test shape: {test_raw.shape}"

    test_fe = add_biomedical_features(test_raw)

    models_cl = joblib.load(MODELS_DIR / "catboost_models_cl.pkl")
    models_vd = joblib.load(MODELS_DIR / "catboost_models_vd.pkl")
    feature_cols = joblib.load(MODELS_DIR / "feature_cols.pkl")

    alpha_file = OUTPUT_DIR / "best_alpha.txt"
    alpha = float(alpha_file.read_text().strip()) if alpha_file.exists() else 0.50
    print(f"Using dosing alpha: {alpha}")

    X_test = test_fe[feature_cols]

    preds_cl = np.zeros((len(models_cl), len(test_raw)))
    preds_vd = np.zeros((len(models_vd), len(test_raw)))

    for i, (m_cl, m_vd) in enumerate(zip(models_cl, models_vd)):
        preds_cl[i] = np.exp(m_cl.predict(X_test))
        preds_vd[i] = np.exp(m_vd.predict(X_test))

    pred_cl = np.mean(preds_cl, axis=0)
    pred_vd = np.mean(preds_vd, axis=0)

    doses = compute_robust_dose(pred_cl, pred_vd, alpha=alpha)

    sub = pd.DataFrame({
        "patient_id": test_raw["patient_id"],
        "pred_CL": np.round(pred_cl, 3),
        "pred_Vd": np.round(pred_vd, 3),
        "Dose": np.round(doses, 2)
    })

    # Assertions
    assert len(sub) == 500
    assert list(sub.columns) == ["patient_id", "pred_CL", "pred_Vd", "Dose"]
    assert sub.isna().sum().sum() == 0
    assert (sub["pred_CL"] > 0).all()
    assert (sub["pred_Vd"] > 0).all()
    assert (sub["Dose"] > 0).all()

    # Save to required locations
    paths_to_save = [
        OUTPUT_DIR / "submission_deep_67.csv",
        BASE_DIR / "submission_deep_67.csv",
        Path("C:/Users/PC/Downloads/submission_deep_67.csv")
    ]

    for p in paths_to_save:
        try:
            sub.to_csv(p, index=False)
            print(f"Saved: {p}")
        except Exception as e:
            print(f"Failed to save {p}: {e}")

    print("\nFirst 5 rows of submission_deep_67.csv:")
    print(sub.head())
    print("\nSummary stats:")
    print(sub.describe())

if __name__ == "__main__":
    run()
