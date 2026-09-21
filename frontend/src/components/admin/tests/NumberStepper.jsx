import React from 'react';
import './NumberStepper.css';

export default function NumberStepper({
  value,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  disabled = false,
  allowEmpty = false,
  onChange,
  ariaLabel,
}) {
  const numeric = value === '' || value == null || Number.isNaN(Number(value)) ? null : Number(value);

  const commit = (next) => {
    if (next == null) {
      if (allowEmpty) onChange(null);
      return;
    }
    const clampedMax = Number.isFinite(max) ? Math.min(max, next) : next;
    const clamped = Math.max(min, clampedMax);
    onChange(clamped);
  };

  return (
    <div className="formely-number-stepper">
      <button
        type="button"
        className="formely-number-stepper-btn"
        onClick={() => {
          if (numeric == null) return;
          if (allowEmpty && numeric <= min) commit(null);
          else commit(numeric - step);
        }}
        disabled={disabled || numeric == null || (!allowEmpty && numeric <= min)}
        aria-label="Scade"
      >
        −
      </button>
      <input
        type="number"
        min={min}
        max={Number.isFinite(max) ? max : undefined}
        value={numeric ?? ''}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === '') {
            if (allowEmpty) onChange(null);
            return;
          }
          commit(Number(e.target.value));
        }}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        className="formely-number-stepper-btn"
        onClick={() => commit((numeric == null ? min : numeric) + step)}
        disabled={disabled || (Number.isFinite(max) && numeric != null && numeric >= max)}
        aria-label="Crește"
      >
        +
      </button>
    </div>
  );
}
