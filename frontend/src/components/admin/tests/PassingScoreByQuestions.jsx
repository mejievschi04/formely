import React, { useEffect, useState } from 'react';
import './PassingScoreByQuestions.css';

export function passingPercentFromCounts(required, total) {
  const t = Math.max(1, Number(total) || 1);
  const r = Math.min(t, Math.max(0, Number(required) || 0));
  return Math.round((r / t) * 100);
}

export function requiredCountFromPercent(percent, total) {
  const t = Math.max(1, Number(total) || 1);
  const pct = Math.min(100, Math.max(0, Number(percent) || 0));
  return Math.min(t, Math.max(0, Math.round((pct / 100) * t)));
}

export default function PassingScoreByQuestions({
  questionCount,
  passingScore,
  onPassingScoreChange,
  disabled = false,
}) {
  const derivedTotal = Math.max(1, Number(questionCount) || 10);
  const [total, setTotal] = useState(derivedTotal);
  const required = requiredCountFromPercent(passingScore, total);
  const percent = passingPercentFromCounts(required, total);

  useEffect(() => {
    setTotal(Math.max(1, Number(questionCount) || 10));
  }, [questionCount]);

  const commit = (nextRequired, nextTotal = total) => {
    const t = Math.max(1, Number(nextTotal) || 1);
    const r = Math.min(t, Math.max(0, Number(nextRequired) || 0));
    setTotal(t);
    onPassingScoreChange(passingPercentFromCounts(r, t));
  };

  return (
    <div className="passing-score-by-questions">
      <span className="passing-score-by-questions-label">Promovare</span>
      <div className="passing-score-by-questions-box">
        <div className="passing-score-by-questions-stepper">
          <button
            type="button"
            className="passing-score-stepper-btn"
            onClick={() => commit(required - 1)}
            disabled={disabled || required <= 0}
            aria-label="Scade numărul de întrebări corecte"
          >
            −
          </button>
          <input
            type="number"
            min={0}
            max={total}
            value={required}
            disabled={disabled}
            onChange={(e) => commit(e.target.value)}
            aria-label="Întrebări corecte necesare"
          />
          <button
            type="button"
            className="passing-score-stepper-btn"
            onClick={() => commit(required + 1)}
            disabled={disabled || required >= total}
            aria-label="Crește numărul de întrebări corecte"
          >
            +
          </button>
        </div>
        <span className="passing-score-by-questions-hint">
          din {total} {total === 1 ? 'întrebare' : 'întrebări'}
        </span>
        <strong className="passing-score-by-questions-percent" aria-live="polite">
          {percent}%
        </strong>
      </div>
    </div>
  );
}
