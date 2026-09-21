import React from 'react';
import { seatPercent, seats } from './lib';

export function SeatMeter({ used, max, pending }) {
  const pct = seatPercent(used, max);
  return (
    <div className="bo-seat">
      <span>
        {seats(used, max)}
        {pending ? ` · ${pending} invit.` : ''}
      </span>
      {pct != null && (
        <div className="bo-seat__bar" aria-hidden>
          <span className={pct >= 100 ? 'is-full' : pct >= 85 ? 'is-high' : ''} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
