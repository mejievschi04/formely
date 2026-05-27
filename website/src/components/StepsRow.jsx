import { steps } from '../data/site';

export default function StepsRow() {
  return (
    <div className="steps-row">
      {steps.map((step, i) => (
        <div key={step.num} className="step">
          <div className="step__num">{i + 1}</div>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
        </div>
      ))}
    </div>
  );
}
