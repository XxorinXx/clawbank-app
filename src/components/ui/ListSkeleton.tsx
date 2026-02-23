interface ListSkeletonProps {
  rows?: number;
}

export function ListSkeleton({ rows = 2 }: ListSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl p-3">
          <div className="h-10 w-10 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-28 rounded bg-gray-200" />
            <div className="h-3 w-20 rounded bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  );
}
