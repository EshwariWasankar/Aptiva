/**
 * Pinned GitHub fetch (pipeline stage "Fetch", Section 15.1/15.3).
 * Downloads the repository tarball at a ref via codeload (single request,
 * no REST rate limit), resolves the commit SHA for provenance, and lists
 * extracted files with sha256 checksums. `fetchImpl` is injectable so
 * tests never touch the network.
 */

import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import * as tar from 'tar';

export interface FetchedFile {
  path: string; // path relative to repo root
  content: string;
  sha256: string;
  size: number;
}

export interface RepoSnapshot {
  repo: string; // owner/name
  requestedRef: string;
  commit: string; // resolved SHA — recorded in import_batches.source_ref
  branch: string;
  files: FetchedFile[];
}

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

const API = 'https://api.github.com';

async function ghJson<T>(fetchImpl: FetchImpl, url: string): Promise<T> {
  const res = await fetchImpl(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'aptiva-ingest',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`);
  return (await res.json()) as T;
}

interface CommitResponse {
  sha: string;
}

/**
 * Fetch the repository at `ref` (branch name, tag, or commit SHA; empty =
 * default branch). Only files under `prefix` are returned, but the whole
 * tarball is streamed once. Binary files are skipped by callers via
 * `include` predicate support here: we keep utf8-decodable text only.
 */
export async function fetchGitHubRepo(
  repo: string,
  ref: string,
  opts: { prefix?: string; fetchImpl?: FetchImpl } = {},
): Promise<RepoSnapshot> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const [owner, name] = repo.split('/');
  if (!owner || !name) throw new Error(`Bad repo identifier: ${repo}`);

  const meta = await ghJson<{ default_branch: string }>(fetchImpl, `${API}/repos/${owner}/${name}`);
  const branch = ref || meta.default_branch;

  // Resolve ref → commit SHA for provenance (branch, tag or SHA all work).
  const commitRes = await ghJson<CommitResponse>(
    fetchImpl,
    `${API}/repos/${owner}/${name}/commits/${encodeURIComponent(branch)}`,
  );
  const commit = commitRes.sha;

  // Tarball at the pinned commit — codeload needs no auth.
  const tarball = await fetchImpl(`https://codeload.github.com/${owner}/${name}/tar.gz/${commit}`, {
    redirect: 'follow',
  });
  if (!tarball.ok || !tarball.body) {
    throw new Error(`codeload ${tarball.status} for ${owner}/${name}@${commit}`);
  }

  const prefix = opts.prefix?.replace(/^\/+|\/+$/g, '');
  const files: FetchedFile[] = [];
  // codeload tarballs wrap everything in a single "<repo>-<sha>/" root dir.
  const rootRe = /^[^/]+\//;

  await new Promise<void>((resolve, reject) => {
    const parser = tar.t({
      onentry: (entry) => {
        if (entry.type !== 'File') return;
        const rel = entry.path.replace(rootRe, '');
        if (prefix && rel !== prefix && !rel.startsWith(`${prefix}/`)) return;
        const chunks: Buffer[] = [];
        entry.on('data', (c: Buffer) => chunks.push(c));
        entry.on('end', () => {
          const buf = Buffer.concat(chunks);
          // Skip binary content (PDFs, images, zips) — replace \0 check.
          if (buf.includes(0)) return;
          files.push({
            path: rel,
            content: buf.toString('utf8'),
            sha256: createHash('sha256').update(buf).digest('hex'),
            size: buf.length,
          });
        });
      },
    });
    parser.on('error', reject);
    parser.on('end', () => resolve());
    // Node fetch body → node stream.
    Readable.fromWeb(tarball.body as unknown as WebReadableStream).pipe(parser);
  });

  files.sort((a, b) => a.path.localeCompare(b.path));
  return { repo, requestedRef: branch, commit, branch: meta.default_branch, files };
}
