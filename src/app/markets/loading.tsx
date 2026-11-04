import { LoadingBlock, Skeleton } from "@/components/ui";

export default function MarketsLoading() {
  return (
    <LoadingBlock label="Loading Markets">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="mt-3 h-11 w-56" />
      <Skeleton className="mt-5 h-5 w-full max-w-[640px]" />
      <div className="mt-10 grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-8 w-52" />
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}
        </div>
        <div className="space-y-3">
          <Skeleton className="h-7 w-40" />
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}
        </div>
      </div>
    </LoadingBlock>
  );
}
