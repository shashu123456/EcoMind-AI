# EcoMind-AI — Related Work & Positioning

> Literature positioning for the IEEE paper. Citation keys are written
> inline as `(AuthorYear)` and are intended to match `references.bib` exactly.
> Every positioning claim ties back to the *implemented* system described in
> `methodology.md` and the measured evidence in `EVIDENCE.md`.

---

## 1. Data-Quality Frameworks

Data quality has traditionally been defined through theoretical dimensions rather
than executable rules. Wang and Strong's influential framework organizes quality
into intrinsic, contextual, representational, and accessibility categories with
dimensions such as accuracy, completeness, consistency, and timeliness
(WangStrong1996). Batini et al. survey the field's methodologies and show that
most approaches assess a handful of the same dimensions but rarely ship as
operational, auditable rule engines (Batini2009). Pipino, Lee, and Wang's
working definition of quality *assessment* adds validity — conformance to value
and semantic bounds — as a first-class dimension, and the ISO/IEC 25012 standard
formalizes "data quality" for information systems (Pipino2002, Iso25012).

EcoMind-AI is not a new taxonomy but a *runtime instantiation*: it hard-codes the
five classical dimensions (completeness, validity, consistency, accuracy,
timeliness) as eight executable, formula-defined rules (EcoMind:Section3). Each
rule emits a per-100 score, a severity, and a pass/fail against dimension-aware
thresholds (≥ 80 info/warning, ≥ 70 critical). Unlike most frameworks that stop
at assessment, EcoMind **feeds** these scores forward into model selection and
the deployment trust gate, and it exposes its own aggregate-scoring bug as a
reported lesson: an index must be normalized and dimension-consistent — the 
per-100 rule scores are the defensible quantities, not the engine's 159 "overall".

Time-series-specific data quality adds a fourth axis to the static-table view:
temporal regularity. EcoMind's timeliness rule flags intervals exceeding 1.5× the
median cadence, its monotonicity rule counts timestamp regressions (120 of 3,600
rows on the reference dataset), and its completeness metric is measured per cell
over the full n×C grid (43,200 cells audited) — treating the series as a
timespan, not a bag of rows.

## 2. Building-Energy Forecasting Models

Amasyali and El-Gohary's review maps the building-energy forecasting landscape:
data-driven (ML) models now dominate physics-based methods for short-horizon load
prediction, with tree ensembles among the strongest general-purpose learners
(Amasyali2018). XGBoost in particular has become a default high-performing
regressor on tabular energy data, frequently winning on public datasets despite
exposing less interpretability than linear baselines (Chen2016). Standard
benchmark corpora such as the Building Data Genome Project (BDG2) provide
large-scale, labeled whole-building meter data with known -drivers such as
weather, occupancy, and calendar structure (Miller2020). Most reported pipelines
train on a pre-cleaned shared table and report leaderboard metrics without
disclosing feature-construction order.

EcoMind operates on an **offline, single-machine** variant of this paradigm:
hourly meter readings (10 derived plus raw feature columns) with XGBoost, Random
Forest, and Gradient Boosting trained under sklearn defaults and evaluated on a
chronological 70/30 holdout. Its measured best model is Gradient Boosting
(r² = 0.9175, RMSE 1.3517, MAPE 1.32), and it surfaces the *boundary condition*
that such leaderboards are only meaningful if feature-time alignment is
correct — which is precisely the gap this work targets. Where BDG2-style
approaches assume clean, leakage-free feature engineering, EcoMind makes the
leakage check an explicit, auditable pipeline stage.

## 3. Time-Series Validation & Leakage Awareness

The canonical result on time-series evaluation is Bergmeir and Benítez's analysis
showing that, under stationarity assumptions, k-fold cross-validation can be a
valid estimator for model selection — but that naive application on non-stationary
energy series inflates fidelity, and that any overlap between the information in
the training and test windows corrupts the estimate (Bergmeir2012). Subsequent
practitioner guidance on temporal splits and target "look-ahead" leakage
(e.g., lag features that encode the label, or normalization fit on the full
series before splitting) is well documented in applied ML literature, and
forecasting libraries standardize forward-chaining (expanding-window) validation
for exactly this reason (Hyndman2018).

EcoMind's contribution here is a measured case study rather than a new estimator.
Its default pipeline initially derived features before the chronological split,
creating `lag_1h = y_{t−1}` and `diff_1h = y_t − y_{t−1}` such that
`y_t = diff_1h + lag_1h` exactly; Ridge consequently reported r² = 1.0000 and
RMSE 0.0048 — a floating-point exact reconstruction that the platform's own
raw-vs-processed and benchmark stages then flagged as a leakage artifact
(EcoMind:Section4.2). The paper reports this honestly as the motivator for a
**split-then-derive** policy: derived features whose construction touches the
target must be computed after the train/test boundary, and a near-perfect
R² on a linear baseline is a diagnostic to investigate, not a milestone to
celebrate.

## 4. Explainable AI for Tabular & Time-Series Models

Shapley-based attribution, popularized in machine learning by Lundberg and Lee's
SHAP, provides locally accurate, model-agnostic explanations by framing feature
importance as a cooperative game over prediction margins (Lundberg2017). For tree
ensembles, TreeExplainer computes exact SHAP values in linear time and is the
standard tool for gradient-boosted energy models, while earlier work such as LIME
established the local-surrogate paradigm (Ribeiro2016). A known weakness of
Shapley values for time-series forecasting is *explanation drift*: attribution
rankings can vary across subsamples, and few pipelines quantify whether a model's
story is stable or a function of the sampled rows (Lundberg2019 tutorial practice).

EcoMind uses `shap.TreeExplainer` with mean-|SHAP| global importance and — its
implemented research contribution — a **stability index**: the Spearman
correlation between feature rankings computed on two independently seeded
half-samples (`random_state=1` vs `2`, n/2 capped at 300), expressed on a 0–100
scale (`shap_service._stability`, value 75 on the reference dataset; consumed by
the trust gate). During validation we also found that the comparison service
labels a *column-order-alignment* correlation (`max(0, Pearson(argsort(mean|SHAP|),
arange))·100`, unseeded) as `shap_stability`; we disclose this mislabeling so the
final paper measures explanation *stability* with the seeded Spearman index and
never reports the column-order artifact as an explanatory-quality claim
(EcoMind:Section6).

## 5. Trustworthiness & Deployment Gates for ML

The model-trust literature distinguishes statistical confidence from
decision-theoretic trust: calibration studies (Guo et al.) show that modern
classifiers' confidences are miscalibrated and that temperature scaling repairs
them, but regression-for-forecasting trust is less standardized (Guo2017).
Varshney frames trust in machine learning as two complementary clauses — the model
must be both *validated* (statistical fidelity) and *verifiable* (evidence the
operator can inspect) — and argues a deployment decision should rest on evidence
an auditor can reproduce (Varshney2018). MLOps/verification surveys position
deployment gates as a quality-lock between CI and production, typically monitoring
drift and calibration post-deployment rather than *before* allowing a model to
ship (Breck2017).

EcoMind implements a **pre-deployment trust gate** as a weighted fusion of four
evidence channels on a common 0–100 scale:

```
trust = 0.40·prediction_confidence + 0.25·dq_score + 0.20·model_relevance + 0.15·shap_stability
```

with verdict thresholds (≥ 80 `high_trust`, ≥ 60 `moderate_trust`, else
`low_trust`). Measured on the reference dataset it yields **94.5 / `high_trust`**
(confidence 100, DQ 100, relevance 91.5, stability 75). This is deliberately not a
calibration quantity: it is an *auditable quality composite*, and the paper says
so — distinguishing EcoMind's gate from statistical coverage claims while noting
that no conformal or calibration layer is yet included (a documented limit).

## 6. Data-Centric AI & Cleaning-First Pipelines

The data-centric AI movement (Ng and colleagues) argues that, at the current
computational plateau, model architecture is a commodity and the highest-leverage
interventions are data quality, data efficiency, and data programming (Ng2021).
Earlier literature on data preparation for ML (e.g., the "dirty data" studies of
Ganti et al. and the DataCivilization line of work) reaches the same economic
conclusion from the database side: cleaning cost concentrates before modeling, and
its payoff is measured in model outcomes, not schema aesthetics (Ganti2008,
Frenay2014 on label noise). Empirical reports show cleaning before training can
improve accuracy, but the effect is *conditional on how dirty the input is* —
clean-source data gains little.

EcoMind's raw-vs-processed stage is an exact operationalization of that
conditionality, and its measured result is a deliberately honest null:
on the already-clean seed dataset, cleaning changed **none** of the predictive
metrics (raw and processed both r² = 0.9153, RMSE 1.3692, MAE 0.121, MAPE 1.58),
and the system's own conclusion reads *"Raw data matched or beat cleaned data here —
possible over-cleaning or already-high quality input"* (EcoMind:Section8). We
report Δ≈0 exactly because it is the correct scientific statement: it validates
that cleaning value is data-dependent and that a deployment pipeline must *measure*
that value per dataset, rather than assume it.

## Positioning Summary

Related work treats the four concerns we combine — executable DQ rules, building-energy
forecasting, temporal-validation rigor, SHAP explainability, trust gating, and
cleaning-first data strategy — as separate literatures with separate toolchains.
EcoMind-AI is a single, offline, self-contained pipeline that:

1. *quantifies* data quality with formula-defined per-rule scores across five
   classical dimensions;
2. *warns* the analyst when its own benchmark exposes target leakage (ridge
   r² = 1.0) and motivates split-then-derive;
3. *explains* the winning gradient-boosted model with SHAP and measures
   explanation stability via a seeded Spearman index;
4. *gates* deployment on a weighted composite trust score (measured 94.5 /
   high_trust); and
5. *audits* the cleaning assumption with an honest raw-vs-processed experiment
   that reports Δ≈0 when the input is already clean.

Its differentiators are the same as its limits: one self-contained offline
artifact, DQ scored before modeling, an explicit null result on clean seed data,
and full stage-level traceability — every claim reproducible from
`data/ecomind.db` in WAL mode without external services.