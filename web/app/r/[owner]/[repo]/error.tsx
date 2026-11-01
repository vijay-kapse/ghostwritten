"use client";

import { ErrorPanel } from "@/components/ErrorPanel";

export default function RepoError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorPanel title="Could not read this repository" reset={reset}>
      <p>
        GitHub did not answer, or its rate limit is used up. Nothing was cached, so trying again in a few minutes
        will work.
      </p>
    </ErrorPanel>
  );
}
