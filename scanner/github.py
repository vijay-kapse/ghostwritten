"""Thin GitHub REST client.

- Auth from GITHUB_TOKEN (works unauthenticated, at 60 requests/hour).
- Primary rate limit: when a resource is exhausted, sleep until its reset (unless that passes the deadline).
- Secondary rate limit / abuse detection: honour Retry-After.
- 202 Accepted (stats endpoints computing in the background): retry with backoff.
- 5xx and connection errors: retry with backoff.
- Conditional requests: with cache=True, the ETag and body are kept on disk; a 304 reply reuses the body
  and does not count against the rate limit.
- Pagination by the Link header.
- Counts requests and stops at an optional request budget.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path

import requests

API = "https://api.github.com"
DEFAULT_CACHE = Path(__file__).with_name(".cache") / "etag"


class BudgetExhausted(Exception):
    """The request budget or the time deadline for this run is used up."""


class GitHubError(Exception):
    def __init__(self, status: int, url: str, body: str = ""):
        super().__init__(f"HTTP {status} for {url}: {body[:200]}")
        self.status = status
        self.url = url


@dataclass
class Response:
    status: int
    data: object
    headers: dict
    next_url: str | None = None
    from_cache: bool = False
    links: dict = field(default_factory=dict)


_LINK_RE = re.compile(r'<([^>]+)>;\s*rel="([^"]+)"')


def parse_link(header: str | None) -> dict:
    return {rel: url for url, rel in _LINK_RE.findall(header or "")}


class GitHub:
    def __init__(
        self,
        token: str | None = None,
        cache_dir: Path | None = DEFAULT_CACHE,
        request_budget: int | None = None,
        deadline: float | None = None,
        session: requests.Session | None = None,
        sleep=time.sleep,
        verbose: bool = False,
    ):
        self.token = token if token is not None else os.environ.get("GITHUB_TOKEN") or None
        self.cache_dir = Path(cache_dir) if cache_dir else None
        self.request_budget = request_budget
        self.deadline = deadline
        self.s = session or requests.Session()
        self.s.headers.update(
            {
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "ghostwritten-scanner",
            }
        )
        if self.token:
            self.s.headers["Authorization"] = f"Bearer {self.token}"
        self.sleep = sleep
        self.verbose = verbose
        self.requests = 0  # requests that count against the rate limit (304s excluded)
        self.not_modified = 0
        self.last_remaining: int | None = None

    # ---------- budget ----------
    def budget_left(self) -> int | None:
        if self.request_budget is None:
            return None
        return self.request_budget - self.requests

    def _check_budget(self) -> None:
        if self.request_budget is not None and self.requests >= self.request_budget:
            raise BudgetExhausted("request budget used up")
        if self.deadline is not None and time.time() >= self.deadline:
            raise BudgetExhausted("time budget used up")

    # ---------- etag cache ----------
    def _cache_path(self, url: str) -> Path | None:
        if not self.cache_dir:
            return None
        h = hashlib.sha256(url.encode()).hexdigest()[:32]
        return self.cache_dir / h[:2] / f"{h}.json"

    def _cache_load(self, url: str) -> dict | None:
        p = self._cache_path(url)
        if p and p.exists():
            try:
                return json.loads(p.read_text())
            except (OSError, ValueError):
                return None
        return None

    def _cache_store(self, url: str, etag: str, data, link: str | None) -> None:
        p = self._cache_path(url)
        if not p:
            return
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps({"url": url, "etag": etag, "link": link, "data": data}))
        tmp.replace(p)

    # ---------- core ----------
    @staticmethod
    def build_url(path_or_url: str, params: dict | None = None) -> str:
        url = path_or_url if path_or_url.startswith("http") else API + path_or_url
        if params:
            req = requests.Request("GET", url, params=params).prepare()
            url = req.url
        return url

    def get(self, path_or_url: str, params: dict | None = None, cache: bool = False, ok=(200,)) -> Response:
        url = self.build_url(path_or_url, params)
        cached = self._cache_load(url) if cache else None
        attempt = 0
        while True:
            self._check_budget()
            headers = {}
            if cached and cached.get("etag"):
                headers["If-None-Match"] = cached["etag"]
            try:
                r = self.s.get(url, headers=headers, timeout=60)
            except requests.RequestException as e:
                attempt += 1
                if attempt > 4:
                    raise GitHubError(0, url, str(e)) from e
                self.sleep(2**attempt)
                continue
            if r.status_code != 304:
                self.requests += 1
            rem = r.headers.get("X-RateLimit-Remaining")
            if rem is not None and r.headers.get("X-RateLimit-Resource", "core") == "core":
                self.last_remaining = int(rem)
            if self.verbose:
                print(f"  GET {r.status_code} {url} (remaining {rem})")

            if r.status_code == 304 and cached:
                self.not_modified += 1
                link = parse_link(cached.get("link"))
                return Response(200, cached["data"], dict(r.headers), link.get("next"), True, link)

            if r.status_code in (403, 429) and self._is_rate_limited(r):
                self._wait_rate_limit(r)
                continue

            if r.status_code == 202:  # stats endpoints: GitHub is computing; ask again shortly
                attempt += 1
                if attempt > 6:
                    return Response(202, None, dict(r.headers))
                self.sleep(min(2**attempt, 30))
                continue

            if r.status_code >= 500:
                attempt += 1
                if attempt > 4:
                    raise GitHubError(r.status_code, url, r.text)
                self.sleep(2**attempt)
                continue

            if r.status_code not in ok:
                raise GitHubError(r.status_code, url, r.text)

            data = r.json() if r.content else None
            link_hdr = r.headers.get("Link")
            links = parse_link(link_hdr)
            if cache and r.headers.get("ETag"):
                self._cache_store(url, r.headers["ETag"], data, link_hdr)
            return Response(r.status_code, data, dict(r.headers), links.get("next"), False, links)

    @staticmethod
    def _is_rate_limited(r) -> bool:
        if r.headers.get("Retry-After"):
            return True
        if r.headers.get("X-RateLimit-Remaining") == "0":
            return True
        txt = r.text.lower()
        return "rate limit" in txt or "abuse" in txt

    def _wait_rate_limit(self, r) -> None:
        if r.headers.get("Retry-After"):
            wait = int(r.headers["Retry-After"]) + 1
        else:
            reset = int(r.headers.get("X-RateLimit-Reset") or (time.time() + 60))
            wait = max(reset - time.time(), 0) + 2
        if self.deadline is not None and time.time() + wait >= self.deadline:
            raise BudgetExhausted(f"rate limited; reset in {wait:.0f}s is past the deadline")
        print(f"  rate limited ({r.headers.get('X-RateLimit-Resource', '?')}); sleeping {wait:.0f}s")
        self.sleep(wait)

    def paginate(self, path: str, params: dict | None = None, max_pages: int | None = None, cache=False):
        """Yield (page_number, Response) following Link rel=next."""
        url = self.build_url(path, params)
        n = 0
        while url and (max_pages is None or n < max_pages):
            resp = self.get(url, cache=cache)
            n += 1
            yield n, resp
            url = resp.next_url

    def rate_limit(self) -> dict:
        """GET /rate_limit (free: it does not count against the limit)."""
        r = self.s.get(API + "/rate_limit", timeout=30)
        r.raise_for_status()
        return r.json()["resources"]
