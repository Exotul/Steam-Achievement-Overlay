import { SORT_OPTIONS } from '../lib/sorting';

export default function LibraryControls({
  search,
  onSearchChange,
  sortBy,
  onSortChange,
  resultCount,
  totalCount,
  releaseDatesLoading,
  hideReleaseDate = false,
}) {
  return (
    <div className="controls">
      <div className="controls__search">
        <svg className="controls__search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          className="controls__input"
          placeholder="Spiel suchen…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Spiel suchen"
        />
        {search && (
          <button className="controls__clear" onClick={() => onSearchChange('')} aria-label="Suche leeren">
            ✕
          </button>
        )}
      </div>

      <div className="controls__sort">
        <span className="controls__sort-label">Sortieren</span>
        {SORT_OPTIONS.filter((opt) => !(hideReleaseDate && opt.id === 'releaseDate')).map((opt) => (
          <button
            key={opt.id}
            className={`chip${sortBy === opt.id ? ' chip--active' : ''}`}
            onClick={() => onSortChange(opt.id)}
          >
            {opt.label}
            {opt.id === 'releaseDate' && releaseDatesLoading && sortBy === 'releaseDate' && ' …'}
          </button>
        ))}
      </div>

      {search && (
        <p className="controls__result-count">
          {resultCount} von {totalCount} Spielen
        </p>
      )}
    </div>
  );
}
