import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Section } from "@/components/Section";
import { TickMeter } from "@/components/TickMeter";
import { computeUser } from "@/lib/compute";
import { num, pct, pctWhole } from "@/lib/format";
import { GithubError } from "@/lib/github";
import { logRequest } from "@/lib/requestlog";
import { isOwner, siteUrl } from "@/lib/slug";

export const revalidate = 86400;

type Params = { login: string };

// Empty list: no page is prebuilt, each user is rendered on first visit then cached for 24 h (ISR).
export function generateStaticParams() {
  return [];
}

async function load(login: string) {
  if (!isOwner(login)) notFound();
  try {
    return await computeUser(login);
  } catch (e) {
    if (e instanceof GithubError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { login } = await params;
  try {
    const u = await load(login);
    const title = u.commits ? `${login}: ${pctWhole(u.share)} of recent commits are AI` : `${login} on ghostwritten`;
    return {
      title: `@${login}`,
      openGraph: { title, description: "How much of this GitHub user's recent code was ghostwritten by AI agents.", url: `${siteUrl()}/u/${login}` },
      twitter: { card: "summary_large_image", title },
    };
  } catch {
    return { title: `@${login}` };
  }
}

export default async function UserPage({ params }: { params: Promise<Params> }) {
  const { login: raw } = await params;
  const u = await load(raw);
  after(() => logRequest(`user:${u.login}`));

  const url = `${siteUrl()}/u/${u.login}`;
  const text = u.commits
    ? `${pctWhole(u.share)} of my recent GitHub commits are ghostwritten by AI agents${u.topTool ? ` (mostly ${u.topTool})` : ""}. What is yours?`
    : "Check how much of your GitHub is ghostwritten by AI agents.";
  const x = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const li = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

  return (
    <div className="pt-8 sm:pt-12">
      <div className="flex items-center gap-4">
        {u.avatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${u.avatar}${u.avatar.includes("?") ? "&" : "?"}s=96`} alt="" width={48} height={48} className="size-12" />
        )}
        <div>
          <h1 className="display cond text-[2.2rem] sm:text-[3rem]" style={{ lineHeight: 0.95 }}>@{u.login}</h1>
          {u.name && <p className="text-muted text-[14px]">{u.name}</p>}
        </div>
      </div>

      {u.commits === 0 ? (
        <div className="mt-8 border-l-[6px] border-accent pl-4 max-w-[60ch]">
          <p className="display cond text-[1.8rem]" style={{ lineHeight: 1.05 }}>No countable commits.</p>
          <p className="prose mt-2">
            None of {u.login}&rsquo;s {u.reposSampled} most recently pushed public repositories has a commit authored by
            this account (forks, merges and bot commits are skipped). Push something public and look again tomorrow.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid lg:grid-cols-[auto_1fr] gap-x-12 gap-y-4 items-end">
            <p className="display text-[clamp(6.5rem,27vw,14rem)] -ml-1" aria-label={`${(u.share * 100).toFixed(1)} percent`}>
              {Math.round(u.share * 100)}
              <span className="text-[0.42em] align-top ml-1 inline-block pt-[0.1em]">%</span>
            </p>
            <div className="pb-3">
              <p className="font-bold cond text-[1.4rem] max-w-[32ch] leading-tight">
                of {num(u.commits)} recent commits carry an AI agent&rsquo;s signature.
              </p>
              <p className="mt-2 text-[15px]">
                {u.topTool ? <>Most used: <b>{u.topTool}</b>. </> : <>No agent signature found. </>}
                <span className="text-muted">
                  {num(u.ai)} AI commits across {u.repos.length} of the {u.reposSampled} repositories sampled.
                </span>
              </p>
            </div>
          </div>
          <div className="mt-4"><TickMeter share={u.share} n={100} height={22} label={`${pct(u.share)} of commits`} /></div>

          <div className="mt-6 flex flex-wrap gap-3">
            <a className="btn" href={x} target="_blank" rel="noopener noreferrer">Post on X</a>
            <a className="btn ghost" href={li} target="_blank" rel="noopener noreferrer">Share on LinkedIn</a>
          </div>

          <Section id="repos" title="Where it came from" note="Newest 300 commits authored by this user, across their 10 most recently pushed public repositories (forks skipped).">
            <table className="tbl">
              <caption className="sr-only">Sampled commits by repository</caption>
              <thead>
                <tr>
                  <th scope="col">Repository</th>
                  <th scope="col" className="w-[30%] hidden sm:table-cell"><span className="sr-only">Share meter</span></th>
                  <th scope="col" className="r">AI share</th>
                  <th scope="col" className="r">AI / commits</th>
                </tr>
              </thead>
              <tbody>
                {u.repos.map((r) => (
                  <tr key={r.repo}>
                    <td className="font-semibold"><a className="link" href={`/r/${r.repo}`}>{r.repo}</a></td>
                    <td className="hidden sm:table-cell"><TickMeter share={r.total ? r.ai / r.total : 0} height={9} /></td>
                    <td className="r font-bold">{pct(r.total ? r.ai / r.total : 0, 0)}</td>
                    <td className="r text-muted">{num(r.ai)} / {num(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </>
      )}
      <p className="mt-8 text-sm text-muted max-w-[70ch]">
        Cached for 24 hours. Only commits that name an AI agent are counted, so this is a floor: an agent that leaves
        no trace looks like you.
      </p>
    </div>
  );
}
