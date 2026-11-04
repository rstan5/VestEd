import { LoadingBlock, Skeleton } from "@/components/ui";

export default function SecurityLoading() {
  return (
    <LoadingBlock label="Loading security">
      <Skeleton className="h-4 w-20" />
      <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
        <div>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-11 w-64" />
        </div>
        <Skeleton className="h-12 w-40" />
      </div>
      <Skeleton className="mt-8 h-10 w-60" />
      <div className="mt-12 grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Skeleton className="h-[240px] w-full" />
        <div className="space-y-3">
          {Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="h-9 w-full" />)}
        </div>
      </div>
    </LoadingBlock>
  );
}
