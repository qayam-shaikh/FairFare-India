import warnings

import numpy as np
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.holtwinters import ExponentialSmoothing, SimpleExpSmoothing
from statsmodels.tsa.statespace.sarimax import SARIMAX

TS_MODELS = ["Mean", "Naive", "Seasonal naive (52)", "SES", "Holt (damped)", "ARIMA(1,0,1)",
             "SARIMAX (AR1 + yearly Fourier)"]


def fourier(t0, n, K=2):
    t = np.arange(t0, t0 + n)
    return np.column_stack([f(2 * np.pi * k * t / 52.18) for k in range(1, K + 1) for f in (np.sin, np.cos)])


def ts_forecast(name, y, h):
    y = np.asarray(y, dtype=float)
    n = len(y)
    if name == "Mean":
        return np.repeat(y.mean(), h)
    if name == "Naive":
        return np.repeat(y[-1], h)
    if name == "Seasonal naive (52)":
        return np.resize(y[-52:], h)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        if name == "SES":
            return np.asarray(SimpleExpSmoothing(y, initialization_method="estimated").fit().forecast(h))
        if name == "Holt (damped)":
            return np.asarray(ExponentialSmoothing(y, trend="add", damped_trend=True,
                                                   initialization_method="estimated").fit().forecast(h))
        if name == "ARIMA(1,0,1)":
            return np.asarray(ARIMA(y, order=(1, 0, 1)).fit().forecast(h))
        if name.startswith("SARIMAX"):
            return np.asarray(SARIMAX(y, exog=fourier(0, n), order=(1, 0, 0)).fit(disp=False)
                              .forecast(h, exog=fourier(n, h)))
    raise ValueError("Unknown method")


def fit_level(name, y, h=60):
    """One-step-ahead fitted level for every week, plus a forecast of the next h weeks."""
    y = np.asarray(y, dtype=float)
    n = len(y)
    if name == "Mean":
        fitted = np.full(n, y.mean())
    elif name == "Naive":
        fitted = np.r_[y[0], y[:-1]]
    elif name == "Seasonal naive (52)":
        fitted = np.r_[np.full(52, y[:52].mean()), y[:-52]]
    else:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            if name == "SES":
                m = SimpleExpSmoothing(y, initialization_method="estimated").fit()
            elif name == "Holt (damped)":
                m = ExponentialSmoothing(y, trend="add", damped_trend=True, initialization_method="estimated").fit()
            elif name == "ARIMA(1,0,1)":
                m = ARIMA(y, order=(1, 0, 1)).fit()
            else:
                m = SARIMAX(y, exog=fourier(0, n), order=(1, 0, 0)).fit(disp=False)
            fitted = np.asarray(m.fittedvalues)
    return fitted, ts_forecast(name, y, h)
