import { pricingCompareRows } from '../../data/site';

function Cell({ value }) {
  if (value === true) {
    return <span className="prc-compare__yes" aria-label="Inclus">✓</span>;
  }
  if (value === '—') {
    return <span className="prc-compare__dash">—</span>;
  }
  return <span className="prc-compare__text">{value}</span>;
}

export default function PricingCompare() {
  return (
    <div className="prc-compare-wrap">
      <table className="prc-compare">
        <caption className="prc-sr-only">Comparație planuri Formely</caption>
        <thead>
          <tr>
            <th scope="col">Funcționalitate</th>
            <th scope="col">Echipă</th>
            <th scope="col">Academy</th>
            <th scope="col">Enterprise</th>
          </tr>
        </thead>
        <tbody>
          {pricingCompareRows.map((row) => (
            <tr key={row.feature}>
              <th scope="row">{row.feature}</th>
              <td><Cell value={row.echipa} /></td>
              <td><Cell value={row.academy} /></td>
              <td><Cell value={row.enterprise} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
