"""Row framing: make a lag feature mean what its name says.

Ownership: S3/S4 shared.

`feature_utils.derive_features` derives `lag_1h`, `rolling_mean_24h` and
`diff_1h` from the order of the frame it is handed. The stored dataset is
interleaved — for a given hour, one row per device, then the next hour — so a
plain derivation produces a `lag_1h` that is *the previous device's reading*.
It is not a lag at all. It is a smear of the neighbouring meter, and it changes
meaning entirely depending on how the rows happened to be written to disk.

Two consequences, both of which bit during the rebuild:

**Training learns the wrong thing.** A model handed that column learns a
relationship between a meter and its neighbour in file order. It scores
respectably, because each device sits at a different position in every hour and
so the column is a reliable proxy for device identity — which is memorising the
estate, not learning energy behaviour. Its feature importances look meaningful
and mean nothing.

**Forecasting cannot reproduce it.** The forecast walks each device's own
timeline, feeding it a true per-device lag. Against a model trained on a
cross-device smear, that is a different input distribution, and the backtest
came back at 2,288% error — the model was not badly fitted, it was being asked a
question it had never been trained on.

`per_device_frame` derives the lag features on a device-sorted copy, then sorts
back into timestamp order before anything else touches the frame. The two sorts
do not fight: the feature values are computed in the first order and travel
with their rows through the second, so the caller gets a chronologically ordered
frame whose lags are per-device.

The sort back to timestamp order matters as much as the device sort. Leaving the
frame device-sorted would make a chronological 70/30 split a *device* split —
the held-out third would be the alphabetically last meters rather than the most
recent week — and the model would report an accuracy that says nothing about
forecasting.
"""

from __future__ import annotations

import pandas as pd
from app.domain.feature_utils import derive_features, find_ts_column

#: Column that identifies the asset a row belongs to. A flat meter dataset still
#: has one; if it somehow does not, the frame is passed through unchanged rather
#: than guessed at.
DEVICE_COLUMN = "device_code"


def per_device_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Derive temporal features per device, return chronologically ordered.

    Non-mutating. A frame without a device column or a timestamp column comes
    back as a copy, because there is no per-device structure to honour and a
    silent sort on a guessed column would reorder a reader's data.
    """
    ts = find_ts_column(df)
    if not ts or DEVICE_COLUMN not in df.columns:
        return df.copy()

    by_device = df.sort_values([DEVICE_COLUMN, ts], kind="mergesort")
    derived = derive_features(by_device, ts_col=ts)
    # mergesort above is stable, so equal (device, timestamp) pairs keep their
    # original relative order and the derivation stays deterministic.
    return derived.sort_values(ts, kind="mergesort").reset_index(drop=True)
