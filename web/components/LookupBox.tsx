"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseLoginInput } from "@/lib/slug";

export function LookupBox() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const login = parseLoginInput(value);
    if (!login) return setBad(true);
    setBad(false);
    router.push(`/u/${login}`);
  }

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor="lookup-login" className="block font-bold cond text-lg">GitHub username</label>
      <div className="flex gap-3 items-end">
        <input
          id="lookup-login"
          className="field"
          value={value}
          onChange={(e) => { setValue(e.target.value); setBad(false); }}
          placeholder="torvalds"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={bad}
          aria-describedby="lookup-help"
        />
        <button type="submit" className="btn shrink-0">Look up</button>
      </div>
      <p id="lookup-help" className={`mt-2 text-sm ${bad ? "text-accent font-semibold" : "text-muted"}`}>
        {bad ? "That is not a valid GitHub username." : "Reads your last 300 commits across your 10 most recently pushed public repositories."}
      </p>
    </form>
  );
}
