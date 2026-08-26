export function SearchBar() {
  return (
    <div className="flex items-center gap-3 border-b border-dashed border-gray-200 px-6 py-4">
      <div className="flex flex-1 items-center gap-2 rounded-lg bg-gray-100 px-3 py-2">
        <SearchIcon />
        <input placeholder="Search" className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400" />
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-gray-400">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
