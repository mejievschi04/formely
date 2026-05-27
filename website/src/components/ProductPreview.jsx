export default function ProductPreview() {
  return (
    <div className="product-preview" aria-hidden="true">
      <div className="product-preview__glow" />
      <div className="product-preview__frame">
        <header className="product-preview__top">
          <div className="product-preview__dots">
            <span /><span /><span />
          </div>
          <span className="product-preview__title">Curs Demo — 4 Module</span>
          <span className="product-preview__badge">Modul 3</span>
        </header>
        <div className="product-preview__layout">
          <aside className="product-preview__sidebar">
            <div className="product-preview__nav-item is-done">Modul 1 · Introducere</div>
            <div className="product-preview__nav-item is-done">Modul 2 · Fundamente</div>
            <div className="product-preview__nav-item is-active">Modul 3 · Practică</div>
            <div className="product-preview__nav-item">Modul 4 · Evaluare</div>
          </aside>
          <main className="product-preview__main">
            <div className="product-preview__lesson">
              <span className="product-preview__chip">Lecție 5 · Video</span>
              <div className="product-preview__video" />
              <div className="product-preview__line w-90" />
              <div className="product-preview__line w-70" />
            </div>
            <div className="product-preview__quiz">
              <span className="product-preview__chip is-success">Test modul · Promovat 100%</span>
              <div className="product-preview__options">
                <span className="is-selected">Variantă corectă</span>
                <span>Variantă B</span>
                <span>Variantă C</span>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
