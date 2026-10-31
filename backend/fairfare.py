from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from tsmodels import TS_MODELS, fit_level, ts_forecast

ART = Path(__file__).resolve().parent.parent / "artifacts"
STOPS = ["non-stop", "1 stop", "2 stops", "3 stops"]
MAX_DATE = pd.Timestamp("2026-12-31")
NOTES = {
    "Mean": "Simplest. A constant fare level.",
    "SES": "Follows slow shifts in the fare level.",
    "Holt (damped)": "Allows a gentle, fading trend.",
    "ARIMA(1,0,1)": "Uses short-term memory of past weeks.",
    "SARIMAX (AR1 + yearly Fourier)": "Adds a yearly seasonal pattern.",
    "Naive": "Repeats last week's level.",
    "Seasonal naive (52)": "Repeats the same week last year.",
}


class FairFare:
    def __init__(self):
        m = joblib.load(ART / "fairfare_v2.joblib")
        self.stop_mean, self.band, self.best = m["stop_mean"], m["band"], m["best"]
        self.bands = m["bands"]
        self._levels = {self.best: (np.asarray(m["level"]), np.asarray(m["level_future"]))}
        self.idx_full, self.start_week = np.asarray(m["idx_full"]), pd.Timestamp(m["start_week"])
        self.n_weeks, self.first, self.last = int(m["n_weeks"]), pd.Timestamp(m["first_date"]), pd.Timestamp(m["last_date"])
        self.df = pd.read_csv(ART / "clean_fares.csv.gz", parse_dates=["date"])
        self.backtest = pd.read_csv(ART / "backtest.csv")
        self.drivers = pd.read_csv(ART / "drivers.csv")
        self.points = {s: g.sort_values("date") for s, g in self.df.groupby("stops")}
        self.prices = {s: np.sort(g.price.values) for s, g in self.df.groupby("stops")}
        total_weeks = (MAX_DATE - self.start_week).days // 7 + 1
        self.total_weeks = total_weeks
        self.weeks = [(self.start_week + pd.Timedelta(days=7 * i)).strftime("%Y-%m-%d") for i in range(total_weeks)]

    # ---------- helpers ----------
    def levels(self, method):
        if method not in self._levels:
            self._levels[method] = fit_level(method, self.idx_full)
        return self._levels[method]

    def level_at(self, w, method):
        fitted, future = self.levels(method)
        return float(fitted[w]) if w < self.n_weeks else float(future[min(w - self.n_weeks, len(future) - 1)])

    def ranked(self):
        """Time-series models ordered by accuracy; near-ties (within 0.5%) go simplest first."""
        mae = self.backtest.set_index("model").MAE
        top = min(mae[m] for m in TS_MODELS)
        tied = [m for m in TS_MODELS if mae[m] <= top * 1.005]
        rest = sorted((m for m in TS_MODELS if m not in tied), key=lambda m: mae[m])
        return tied + rest

    def week_of(self, date):
        return (pd.Timestamp(date) - self.start_week).days // 7

    # ---------- API ----------
    def meta(self):
        return {
            "cities": sorted(set(self.df.origin) | set(self.df.dest)),
            "airlines": sorted(self.df.airline.unique()),
            "stops": STOPS,
            "date_min": self.first.strftime("%Y-%m-%d"),
            "date_max_data": self.last.strftime("%Y-%m-%d"),
            "date_max": MAX_DATE.strftime("%Y-%m-%d"),
            "rows": int(len(self.df)),
        }

    def check(self, origin, dest, airline, stops, date, price, method=None):
        method = method or self.best
        if method not in TS_MODELS:
            raise ValueError("Unknown forecast model")
        d = pd.Timestamp(date)
        if origin == dest:
            raise ValueError("Origin and destination must differ")
        if stops not in self.stop_mean:
            raise ValueError("Unknown number of stops")
        if d < self.first or d > MAX_DATE:
            raise ValueError(f"Date must be between {self.first:%d %b %Y} and {MAX_DATE:%d %b %Y}")

        w = self.week_of(d)
        lo, hi = self.bands[method][stops]
        exp = self.stop_mean[stops] + self.level_at(w, method)
        dev = price - exp
        verdict = "underpriced" if dev < lo else "overpriced" if dev > hi else "fair"
        pr = self.prices[stops]

        line = [self.stop_mean[stops] + self.level_at(i, method) for i in range(self.total_weeks)]
        pts = self.points[stops]
        weekly = pts.groupby("wk").price.mean().reindex(range(self.n_weeks)).interpolate()
        return {
            "verdict": verdict, "label": f"{airline}, {stops}",
            "expected": round(exp), "fair_low": round(exp + lo), "fair_high": round(exp + hi),
            "deviation_pct": round(dev / exp * 100, 1),
            "peers": {"count": int(len(pr)), "cost_less_pct": round(float((pr < price).mean() * 100))},
            "projected": bool(d > self.last),
            "method": method,
            "by_stops": {s: round(self.stop_mean[s] + self.level_at(w, method)) for s in STOPS},
            "chart": {
                "weeks": self.weeks, "expected": [round(v) for v in line],
                "low": [round(v + lo) for v in line], "high": [round(v + hi) for v in line],
                "weekly_mean": [round(float(v)) for v in weekly.values],
                "points": {"d": pts.date.dt.strftime("%Y-%m-%d").tolist(), "p": pts.price.astype(int).tolist()},
                "selected": date, "data_end": self.last.strftime("%Y-%m-%d"),
            },
        }

    def models(self):
        bt = self.backtest.rename(columns={"vs best": "vs_best"}).set_index("model")
        options = [{"rank": i + 1, "model": m, "mae": round(float(bt.MAE[m])), "vs_best": round(float(bt.vs_best[m]), 4),
                    "note": NOTES[m], "recommended": m == self.best} for i, m in enumerate(self.ranked())]
        ml = bt.loc["GBM, all features + date"]
        return {
            "best": self.best, "horizon_weeks": 13, "options": options,
            "ml": {"model": "GBM, all features + date", "mae": round(float(ml.MAE)), "vs_best": round(float(ml.vs_best), 4)},
            "drivers": self.drivers.to_dict("records"),
        }

    def forecast(self, method, weeks=26):
        if method not in TS_MODELS:
            raise ValueError("Unknown method")
        y, hold = self.idx_full, 26
        fc_hold = ts_forecast(method, y[:-hold], hold)
        future = ts_forecast(method, y, weeks)
        sd = float(np.std(y[:-hold] - np.mean(y[:-hold])))
        band = 1.28 * sd
        dates = lambda a, b: [(self.start_week + pd.Timedelta(days=7 * i)).strftime("%Y-%m-%d") for i in range(a, b)]
        n = self.n_weeks
        return {
            "method": method, "is_selected": method == self.best,
            "history": {"d": dates(n - 78, n - hold), "v": [round(float(v)) for v in y[n - 78:n - hold]]},
            "holdout": {"d": dates(n - hold, n), "actual": [round(float(v)) for v in y[-hold:]],
                        "forecast": [round(float(v)) for v in fc_hold],
                        "mae": round(float(np.mean(np.abs(y[-hold:] - fc_hold))))},
            "future": {"d": dates(n, n + weeks), "forecast": [round(float(v)) for v in future],
                       "low": [round(float(v - band)) for v in future], "high": [round(float(v + band)) for v in future]},
        }
