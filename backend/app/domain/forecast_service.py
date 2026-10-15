SELF_REFERENTIAL = ("lag_1h", "diff_1h", "rolling_mean_24h", "rolling_std_24h")

#: Hours of per-device target history the recursive walk carries forward in its
#: ring buffer. Long enough to rebuild the 24-hour rolling features used by the
#: trained model, short enough to stay fixed-size as the walk marches forward.
ROLLING_WINDOW = 48
