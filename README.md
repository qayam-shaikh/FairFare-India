# FairFare India

Checks whether a flight fare is **underpriced, fair or overpriced**, using 15,000 domestic fare listings (2019 to 2025, 20 cities).

## Run it

```bash
pip install -r requirements.txt
cd backend
uvicorn app:app --port 8000
```

Open http://localhost:8000 and press **Try an example**.

## Pages

| Page | What it does |
|---|---|
| Check a fare | 3 steps: trip, flight, price. |
| Result | Verdict, fair range, listed fares over time, other stop counts, re-check with another price. |
| Models | Pick a time-series model and see its forecast and backtest error. |
| How it works | The method in three cards and what moves fares in this data. |

## Folders

| Path | What it is |
|---|---|
| `notebook/FairFare_v2_Notebook.ipynb` | Audit, EDA, time-series diagnostics, model comparison, band calibration. Run it from the `notebook/` folder; it reads `../data/flights.csv` and writes `../artifacts/`. |
| `data/flights.csv` | The dataset. |
| `artifacts/` | Outputs of the notebook that the backend loads. |
| `backend/` | `app.py` (FastAPI: `/api/meta`, `/api/check`, `/api/models`, `/api/forecast`), `fairfare.py` (fare logic), `tsmodels.py` (the time-series models). |
| `frontend/` | `index.html`, `style.css`, `app.js`. No build step. |

## How the verdict works

1. Expected fare = average fare for the stop count + the weekly fare level.
2. The weekly fare level is the output of the selected time-series model (the notebook picks the simplest model within 0.5% of the lowest backtest error).
3. The fair range is the 10th to 90th percentile of out-of-sample errors, per stop count.

## Findings to state in the report

- Only the number of stops moves price. Airline, route, departure time, duration and calendar effects are not distinguishable from zero.
- After removing the stops effect, the weekly series is stationary white noise, so all time-series models perform about the same.
- The fair range is wide (about ±₹3,800) because that is the real spread of fares for a given stop count.
