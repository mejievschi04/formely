import React, { useState } from 'react';
import './PassingScoreByQuestions.css';

function passingPercentFromCounts(required, total) {
  const t = Math.max(1, Number(total) || 1);
  const r = Math.min(t, Math.max(0, Number(required) || 0));
  return Math.round((r / t) * 100);
}

function requiredCountFromPercent(percent, total) {
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
  const [syncedQuestionCount, setSyncedQuestionCount] = useState(questionCount);
  if (syncedQuestionCount !== questionCount) {
    setSyncedQuestionCount(questionCount);
    setTotal(derivedTotal);
  }
  const required = requiredCountFromPercent(passingScore, total);
  const percent = passingPercentFromCounts(required, total);

  const commit = (nextRequired, nextTotal) => {
    const t = Math.max(1, Number(nextTotal) || 1);
    const r = Math.min(t, Math.max(0, Number(nextRequired) || 0));
    setTotal(t);
    onPassingScoreChange(passingPercentFromCounts(r, t));
  };

  return (
    <div className="passing-score-by-questions">
      <span className="passing-score-by-questions-label">Promovare</span>
      <div className="passing-score-by-questions-row">
        <input
          type="number"
          min={0}
          max={total}
          value={required}
          disabled={disabled}
          onChange={(e) => commit(e.target.value, total)}
          aria-label="Întrebări corecte necesare"
        />
        <span className="passing-score-by-questions-din">din</span>
        <input
          type="number"
          min={1}
          value={total}
          disabled={disabled}
          onChange={(e) => commit(required, e.target.value)}
          aria-label="Total întrebări"
        />
        <span className="passing-score-by-questions-hint">întrebări</span>
        <strong className="passing-score-by-questions-percent" aria-live="polite">
          {percent}%
        </strong>
      </div>
    </div>
  );
}
