import type { Metadata } from "next";
import { SampleNote } from "@/components/SampleNote";
import { Leaderboards } from "@/components/Leaderboards";
import { loadLeaderboards } from "@/lib/data";
import { num, windowLabel } from "@/lib/format";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Repositories, organizations and languages ranked by the share of commits written with AI agents.",
};

export default function LeaderboardPage() {
  const { data, provenance } = loadLeaderboards();
  const empty = !data.repos.length && !data.orgs.length && !data.languages.length;
  return (
    <div>
      {provenance === "sample" && <SampleNote />}
      <div className="pt-8 sm:pt-12">
      <h1 className="display cond text-[2.6rem] sm:text-[3.6rem]" style={{ lineHeight: 0.95 }}>Leaderboard</h1>
      <p className="prose mt-3">
        {empty
          ? "No scan results yet. Rankings appear after the first scan writes data/leaderboards.json."
          : `Ranked by the share of commits carrying an AI signature, ${windowLabel(data.window)}. ${num(data.universe.repos)} repositories in the universe: ${data.universe.selection}. Click a column to sort.`}
      </p>
      {!empty && (
        <Leaderboards repos={data.repos} orgs={data.orgs} languages={data.languages} defaultMin={100} />
      )}
      </div>
    </div>
  );
}
