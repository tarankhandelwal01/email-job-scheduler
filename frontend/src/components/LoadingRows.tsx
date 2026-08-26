export function LoadingRows({ count = 4 }: { count?: number }) {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4">
          <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-20 animate-pulse rounded-full bg-gray-200" />
          <div className="h-4 flex-1 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}
