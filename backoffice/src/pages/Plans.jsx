import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { platform } from '../api';
import { errMessage, featureSummary, hasUpcomingAi, planSeatLabel } from '../lib';
import { useToast } from '../toast';

export default function PlansPage() {
  const { push } = useToast();
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    platform
      .plans()
      .then((res) => setPlans(res?.plans || []))
      .catch((err) => push(errMessage(err, 'Nu am putut încărca planurile.'), 'error'));
  }, [push]);

  return (
    <>
      <header className="bo-page-head">
        <div>
          <h1>Planuri</h1>
          <p>Catalogul din contract. Locurile și modulele nu depășesc abonamentul.</p>
        </div>
      </header>

      {plans.length === 0 ? (
        <p className="bo-muted">Se încarcă planurile…</p>
      ) : (
        <div className="bo-plan-grid">
          {plans.map((plan) => (
            <article key={plan.id} className="bo-card bo-plan-card">
              <h2>{plan.label}</h2>
              <p className="bo-plan-card__seats">
                {planSeatLabel(plan)}
                {plan.max_staff != null ? ` · până la ${plan.max_staff} staff` : ''}
              </p>
              <p>{featureSummary(plan.features)}</p>
              {hasUpcomingAi(plan.features) ? (
                <p className="bo-muted">
                  Formely AI nu e live. Flag-urile din catalog rămân pentru activare ulterioară, nu se vând acum.
                </p>
              ) : null}
              <Link className="bo-btn bo-btn--sm" to={`/clients?plan=${plan.id}`}>
                Clienți pe {plan.label}
              </Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
