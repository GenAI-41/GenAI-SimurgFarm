"""
Machine Learning Training and Cross-Validation Pipeline with CatBoost Regressors.
Trains models on ln(CL) and ln(Vd) and optimizes the dosing parameter alpha.
"""
import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from sklearn.model_selection import StratifiedKFold
from catboost import CatBoostRegressor
from src.config import (
    DATA_TRAIN, OUTPUT_DIR, MODELS_DIR, CAT_COLS, SEED, N_FOLDS
)
from src.features import add_biomedical_features, get_feature_columns
from src.dosing import (
    compute_robust_dose,
    evaluate_competition_metrics,
    optimize_alpha
)

def train_and_evaluate():
    print("--- [1/4] Loading and preparing training dataset ---")
    train = pd.read_csv(DATA_TRAIN, sep=",")
    train_fe = add_biomedical_features(train)
    feature_cols = get_feature_columns(train_fe)
    print(f"Features count: {len(feature_cols)}")
    print(f"Features: {feature_cols}")

    # Create composite stratification key: sepsis_status + oat_variant
    strat_key = train_fe["sepsis_status"].astype(str) + "_" + train_fe["oat_variant"].astype(str)
    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=SEED)

    oof_cl = np.zeros(len(train))
    oof_vd = np.zeros(len(train))

    y_cl = train["CL_L_h"].values
    y_vd = train["Vd_L"].values

    models_cl = []
    models_vd = []

    print("\n--- [2/4] Training 5-Fold Stratified Cross-Validation ---")
    for fold, (tr_idx, val_idx) in enumerate(skf.split(train_fe, strat_key)):
        X_tr = train_fe.iloc[tr_idx][feature_cols]
        X_val = train_fe.iloc[val_idx][feature_cols]

        y_tr_cl, y_val_cl = y_cl[tr_idx], y_cl[val_idx]
        y_tr_vd, y_val_vd = y_vd[tr_idx], y_vd[val_idx]

        # Model for ln(CL)
        cb_cl = CatBoostRegressor(
            iterations=400,
            learning_rate=0.06,
            depth=6,
            loss_function="MAE",
            cat_features=[c for c in CAT_COLS if c in feature_cols],
            verbose=0,
            thread_count=-1,
            random_seed=SEED + fold
        )
        cb_cl.fit(X_tr, np.log(y_tr_cl), eval_set=(X_val, np.log(y_val_cl)), early_stopping_rounds=40)
        oof_cl[val_idx] = np.exp(cb_cl.predict(X_val))
        models_cl.append(cb_cl)

        # Model for ln(Vd)
        cb_vd = CatBoostRegressor(
            iterations=400,
            learning_rate=0.06,
            depth=6,
            loss_function="MAE",
            cat_features=[c for c in CAT_COLS if c in feature_cols],
            verbose=0,
            thread_count=-1,
            random_seed=SEED + fold
        )
        cb_vd.fit(X_tr, np.log(y_tr_vd), eval_set=(X_val, np.log(y_val_vd)), early_stopping_rounds=40)
        oof_vd[val_idx] = np.exp(cb_vd.predict(X_val))
        models_vd.append(cb_vd)

        fold_mape_cl = np.mean(np.abs(oof_cl[val_idx] - y_val_cl) / y_val_cl) * 100
        fold_mape_vd = np.mean(np.abs(oof_vd[val_idx] - y_val_vd) / y_val_vd) * 100
        print(f"Fold {fold+1}/{N_FOLDS}: MAPE(CL) = {fold_mape_cl:.2f}%, MAPE(Vd) = {fold_mape_vd:.2f}%")

    # Save models
    joblib.dump(models_cl, MODELS_DIR / "catboost_models_cl.pkl")
    joblib.dump(models_vd, MODELS_DIR / "catboost_models_vd.pkl")
    joblib.dump(feature_cols, MODELS_DIR / "feature_cols.pkl")
    print("Models saved successfully to output/models/")

    # ==========================================================
    # Optimize alpha and calculate final competition metrics
    # ==========================================================
    print("\n--- [3/4] Optimizing dosing parameter alpha on OOF predictions ---")
    best_alpha, best_tar = optimize_alpha(oof_cl, oof_vd, y_cl, y_vd)
    print(f"Optimal alpha = {best_alpha:.3f} (OOF TAR = {best_tar:.2f}%)")

    # Save optimal alpha
    with open(OUTPUT_DIR / "best_alpha.txt", "w") as f:
        f.write(str(best_alpha))

    doses_oof = compute_robust_dose(oof_cl, oof_vd, alpha=best_alpha)
    metrics = evaluate_competition_metrics(oof_cl, oof_vd, y_cl, y_vd, doses_oof)

    print("\n=======================================================")
    print("           ИТОГОВЫЕ МЕТРИКИ КРОСС-ВАЛИДАЦИИ            ")
    print("=======================================================")
    print(f"MAPE(CL):                {metrics['MAPE_CL']:.2f}%")
    print(f"MAPE(Vd):                {metrics['MAPE_Vd']:.2f}%")
    print(f"Pk_acc:                  {metrics['Pk_acc']:.2f} / 100")
    print(f"TAR (Терапевтич. окно):  {metrics['TAR']:.2f}%")
    print(f"Итоговый балл (T):       {metrics['T_score']:.2f} / 100")
    print("-------------------------------------------------------")
    print(f"Превышение пика C(0.5):  {metrics['Peak_violations_pct']:.2f}%")
    print(f"Недодозирование Cavg<6:  {metrics['Underdose_violations_pct']:.2f}%")
    print(f"Передозирование Cavg>12: {metrics['Overdose_violations_pct']:.2f}%")
    print("=======================================================")

    # Save OOF predictions and evaluation
    oof_df = pd.DataFrame({
        "patient_id": train["patient_id"],
        "CL_true": y_cl,
        "Vd_true": y_vd,
        "CL_pred": oof_cl,
        "Vd_pred": oof_vd,
        "Dose": doses_oof
    })
    oof_df.to_csv(OUTPUT_DIR / "oof_predictions.csv", index=False)

    return metrics

if __name__ == "__main__":
    train_and_evaluate()
