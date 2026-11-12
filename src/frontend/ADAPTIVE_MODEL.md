# VOLTRA adaptive circuit model

The adaptive model is an explainable, online anomaly detector for per-circuit telemetry. It runs in the browser as readings enter the central telemetry store. It is observational: it cannot actuate a relay or participate in overload trips.

## Inputs

- Valid, increasing telemetry timestamps
- Per-circuit watts, using direct circuit power where available and voltage × current × panel power factor otherwise
- The activity threshold configured for that circuit in Usage Patterns
- Continuous intervals no longer than 30 seconds

Demo and hardware models use different storage keys. A browser reload restores learned distributions and completed-session statistics, but deliberately discards in-progress sessions and candidates.

## Learned features

Each circuit maintains three time-decayed online distributions:

1. Active-state power
2. Standby-state power
3. Completed active-session duration

Power learning accepts at most one baseline sample every five seconds. Changing Stream from 1 Hz to 10 Hz therefore does not accelerate training. A candidate anomaly is not written into the baseline while it is being evaluated.

## Evidence gates

A high-power observation requires:

- 60 learned active samples or 90 learned standby samples for the state being evaluated
- A positive deviation larger than four learned standard deviations
- A difference of at least 50 W and 30% of the learned mean
- Three consecutive samples spanning at least five seconds

A long-runtime observation requires:

- Five completed sessions
- A continuous session exceeding the learned mean by the largest of three standard deviations, 15 minutes, or 50% of the learned mean

Any telemetry gap over 30 seconds breaks continuity. A model observation describes a statistical deviation and is never presented as a fault diagnosis.

## Persistence and feedback

Model state and the latest 100 observations are saved locally per data source. User feedback marks an observation as expected or for later review; it does not silently retrain the distribution. Resetting learning removes the selected source's model and observations.

## Product surfaces

- Stream shows live model status beside raw telemetry.
- Patterns shows training evidence, learned active power, session duration, observations, and the decision rules.
- The Groq usage assistant receives a bounded summary of the current model and at most five recent observations, including explicit safety and uncertainty limits.

## Safety boundary

Breaker protection remains deterministic in the telemetry store. Rated-current checks and consecutive threshold violations control overload trips. The adaptive model cannot open or close a breaker, override protection, or assert electrical safety.
