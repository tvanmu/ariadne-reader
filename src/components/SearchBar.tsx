import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface SearchBarProps {
  query: string;
  totalMatches: number;
  activeMatchNumber: number;
  searchedPages: number;
  totalPages: number;
  isSearching: boolean;
  onQueryChange: (query: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}

export default function SearchBar({
  query,
  totalMatches,
  activeMatchNumber,
  searchedPages,
  totalPages,
  isSearching,
  onQueryChange,
  onPrevious,
  onNext,
  onClose,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasQuery = query.trim().length > 0;
  const hasMatches = totalMatches > 0;
  const statusLabel = getSearchStatusLabel({
    hasQuery,
    hasMatches,
    activeMatchNumber,
    totalMatches,
    searchedPages,
    totalPages,
    isSearching,
  });

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <form
      className="reader-search-bar"
      role="search"
      aria-label="Search in document"
      onSubmit={(event) => {
        event.preventDefault();
        onNext();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          if (event.shiftKey) {
            onPrevious();
          } else {
            onNext();
          }
        }
      }}
    >
      <Search size={16} strokeWidth={1.8} />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search this thread"
        aria-label="Search this document"
      />
      <span className="reader-search-status" aria-live="polite">
        {statusLabel}
      </span>
      <button
        className="icon-button"
        type="button"
        onClick={onPrevious}
        disabled={!hasMatches}
        aria-label="Previous match"
      >
        <ChevronUp size={16} strokeWidth={1.8} />
      </button>
      <button
        className="icon-button"
        type="button"
        onClick={onNext}
        disabled={!hasMatches}
        aria-label="Next match"
      >
        <ChevronDown size={16} strokeWidth={1.8} />
      </button>
      <button className="icon-button" type="button" onClick={onClose} aria-label="Close search">
        <X size={16} strokeWidth={1.8} />
      </button>
    </form>
  );
}

interface SearchStatusInput {
  hasQuery: boolean;
  hasMatches: boolean;
  activeMatchNumber: number;
  totalMatches: number;
  searchedPages: number;
  totalPages: number;
  isSearching: boolean;
}

function getSearchStatusLabel({
  hasQuery,
  hasMatches,
  activeMatchNumber,
  totalMatches,
  searchedPages,
  totalPages,
  isSearching,
}: SearchStatusInput): string {
  if (!hasQuery) {
    return 'Find text';
  }

  if (hasMatches) {
    return `Match ${activeMatchNumber} of ${totalMatches}`;
  }

  if (isSearching) {
    return `Scanning ${searchedPages} of ${totalPages}`;
  }

  return 'No matches';
}
