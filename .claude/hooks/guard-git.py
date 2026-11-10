#!/usr/bin/env python3
"""Claude Code PreToolUse hook: merges into beta and main only on Alessio's word, no push.

Claude merges into `main` only the `beta -> main` promotion (amendment 2026-11-01),
merges into `beta` only what the coordinating session has reviewed, merges into either
only when Alessio's latest message in the chat asks for that PR by number (amendment
2026-11-10), never pushes to `dev`, `beta` or `main`, and never merges anything on a red
or pending CI.

The repository is private on GitHub's free plan, so branch protection is not available
server-side (the API answers 403). This hook enforces working method 0013 (v2) where the
work actually happens: in Claude Code sessions. It reads the tool call from stdin and, for
a Bash command, blocks (exit 2, reason on stderr, which Claude sees) when:

- the command merges a pull request into `main` of a code repository that is not the
  `beta -> main` promotion, or merges the promotion other than as a merge commit
  (the wiki's `main` is not an environment: its PRs merge on green);
- the command merges a pull request into `beta` of a code repository that has not passed
  review: its head commit must carry a green `review` status (set by the coordinating
  session after the pre-merge review, so a commit pushed after the review drops it), and
  the merge must keep a merge commit (`--merge`; no squash, rebase, `--auto`, `--admin`)
  - decision 0013, amendment 2026-10-20;
- the command merges a pull request into `beta` or `main` of a code repository and
  Alessio's latest message does not consent to it: it must name the PR (`#157`, or the
  bare number) beside a word that asks for the merge (`unisci`, `merge`, ...), with no
  negation, outside any pasted text - decision 0013, amendment 2026-11-10. The message is
  read from the session's transcript, and only an entry the app marks as typed by the
  person (`origin.kind == "human"`) counts: another session's message, a notification,
  a tool result or a subagent's prompt never does, so no text Claude reads or writes can
  stand in for his word. An unreadable transcript is no consent;
- the command merges any other pull request whose checks are not all green, or cannot be
  read;
- the command merges through `gh api .../pulls/N/merge`, which would skip both checks;
- the command pushes to `dev` (rebuilt by the `integrate` workflow), `beta` or `main`.

Commands are found wherever they sit in the call: after `&&`, `;`, `|` or a newline, and
behind `git -c key=value` options or `VAR=value` prefixes. A multi-line script used to
hide a `gh pr merge` on its second line, and `git -c ... push` was never recognised.

Anything else passes untouched (exit 0).
"""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys

PROTECTED = ("dev", "beta", "main")
OWNER_MERGES = ("main",)
"""Bases that take only the promotion from `beta` (decision 0013, amended 2026-11-01)."""
REVIEWED_MERGES = ("beta",)
"""Bases Claude may merge into once the PR passed review (decision 0013, amended 2026-10-20)."""
PROMOTION_HEAD = "beta"
"""The one branch a session may merge into main (amendment 2026-11-01): the promotion."""
CONSENT_MERGES = ("beta", "main")
"""Bases a merge reaches only on Alessio's explicit word (decision 0013, amended 2026-11-10)."""
CONSENT_VERB = re.compile(
    r"\b(unisc\w*|unir\w*|uniamo|unite|merg\w*|fai\s+il\s+merge)\b", re.IGNORECASE
)
"""Words that ask for a merge, in Italian and English (`unisci`, `unire`, `merge`, ...)."""
CONSENT_NEGATION = re.compile(
    r"\b(non|mai|don'?t|do\s+not|never|not)\s+(\w+\s+){0,2}?(unisc|unir|merg)", re.IGNORECASE
)
"""`non unire #157` names the PR beside the verb and is the opposite of consent."""
PASTED = re.compile(r"<pasted_content\b.*?</pasted_content[^>]*>", re.IGNORECASE | re.DOTALL)
"""Text he pasted is someone else's words, not his consent."""
REVIEW_CONTEXT = "review"
"""The commit status the coordinating session sets on a PR's head after its review."""
FORBIDDEN_MERGE_FLAGS = {"--squash", "-s", "--rebase", "-r", "--auto", "--admin"}
"""A squash or rebase drops beta's history, `--auto` merges later without the guard, and
`--admin` skips requirements."""
CODE_REPOS = ("brain-trails-backend", "brain-trails-frontend")
"""Where `beta` and `main` are environments. A PR whose repository cannot be read counts."""
GREEN = {"SUCCESS", "SKIPPED", "NEUTRAL"}
GIT_VALUE_OPTIONS = {"-c", "-C", "--git-dir", "--work-tree", "--namespace"}


def block(reason: str) -> None:
    """Refuse the tool call; Claude receives `reason` and must not work around it."""
    print(f"Blocked by .claude/hooks/guard-git.py: {reason}", file=sys.stderr)
    sys.exit(2)


def gh_env(command: str) -> dict[str, str]:
    """The environment `gh` needs to see what the command itself would see.

    The hook runs in Claude Code's environment, not in the command's, so a
    `GH_TOKEN=$(gh auth token --user X)` inside the command is invisible here. On a
    machine with several GitHub logins the default account may not reach the repo, so
    the account the command pins is pinned here too.
    """
    env = dict(os.environ)
    user = re.search(r"gh auth token --user\s+([\w-]+)", command)
    if user:
        token = subprocess.run(
            ["gh", "auth", "token", "--user", user.group(1)], capture_output=True, text=True
        ).stdout.strip()
        if token:
            env["GH_TOKEN"] = token
    return env


# `gh pr merge` flags that take a value, so the value is not mistaken for the PR.
VALUE_FLAGS = {
    "-R",
    "--repo",
    "-t",
    "--subject",
    "-b",
    "--body",
    "-F",
    "--body-file",
    "-A",
    "--author-email",
    "--match-head-commit",
}


def parse_merge(words: list[str]) -> tuple[str | None, str | None]:
    """The PR a `gh pr merge` command names and the repository it names it in.

    The repository matters: without it the checks would be read from the repository of
    the current directory, i.e. from a different PR that happens to share the number.
    """
    args = words[words.index("merge") + 1 :]
    target: str | None = None
    repo: str | None = None
    i = 0
    while i < len(args):
        word = args[i]
        if word in ("-R", "--repo") and i + 1 < len(args):
            repo = args[i + 1]
            i += 2
            continue
        if word.startswith("--repo="):
            repo = word.split("=", 1)[1]
        elif word in VALUE_FLAGS:
            i += 2
            continue
        elif not word.startswith("-") and target is None:
            target = word
        i += 1
    return target, repo


SEPARATORS = ("&&", "||", ";", "|", "&", "\n")
HEREDOC = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")


def split_commands(command: str) -> list[str]:
    """Split a Bash call into its simple commands, the way the shell would.

    Separators (`&&`, `||`, `;`, `|`, `&`, newline) count only outside quotes and outside
    `$(...)`, so `git -c credential.helper='!f(){ echo x; }; f' push` stays one command.
    A heredoc's body is data, not commands: a commit message or a test that mentions a
    merge must not be read as one. Not a full shell parser - just enough not to be fooled
    by the commands Claude actually writes.
    """
    parts: list[str] = []
    buf: list[str] = []
    pending: list[str] = []  # heredoc terminators whose body starts at the next newline
    quote: str | None = None
    depth = 0
    i, n = 0, len(command)

    def flush() -> None:
        part = "".join(buf).strip()
        if part:
            parts.append(part)
        buf.clear()

    while i < n:
        c = command[i]
        if quote == "'":
            buf.append(c)
            quote = None if c == "'" else quote
            i += 1
            continue
        if c == "\\" and i + 1 < n:
            buf.append(command[i : i + 2])
            i += 2
            continue
        if quote == '"':
            buf.append(c)
            quote = None if c == '"' else quote
            i += 1
            continue
        if c in "'\"":
            quote = c
            buf.append(c)
            i += 1
            continue
        if command.startswith("$(", i):
            depth += 1
            buf.append("$(")
            i += 2
            continue
        if c == ")" and depth:
            depth -= 1
            buf.append(c)
            i += 1
            continue
        if depth == 0 and command.startswith("<<", i):
            found = HEREDOC.match(command, i)
            if found:
                pending.append(found.group(2))
        if depth == 0:
            sep = next((s for s in SEPARATORS if command.startswith(s, i)), None)
            if sep is not None:
                flush()
                i += len(sep)
                if sep == "\n" and pending:
                    # skip each heredoc body, up to and including its terminator line
                    while pending:
                        end = pending.pop(0)
                        while i < n:
                            eol = command.find("\n", i)
                            line = command[i : eol if eol >= 0 else n]
                            i = eol + 1 if eol >= 0 else n
                            if line.strip() == end:
                                break
                continue
        buf.append(c)
        i += 1
    flush()
    return parts


def commands(command: str) -> list[list[str]]:
    """Every simple command in a Bash call, as words, with its prefixes stripped."""
    found = []
    for part in split_commands(command):
        try:
            words = shlex.split(part)
        except ValueError:
            words = part.split()
        while words and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", words[0]):
            words = words[1:]  # VAR=value prefixes
        if words[:1] in (["env"], ["sudo"], ["command"]):
            words = words[1:]
        if words:
            found.append(words)
    return found


def git_subcommand(words: list[str]) -> str | None:
    """`push` for `git -c k=v -C dir push ...`: the first word after git's own options."""
    if not words or words[0] != "git":
        return None
    i = 1
    while i < len(words) and words[i].startswith("-"):
        i += 2 if words[i] in GIT_VALUE_OPTIONS else 1
    return words[i] if i < len(words) else None


def repo_name(pr: dict[str, object]) -> str | None:
    """The repository of `pr` from its URL (`https://github.com/<org>/<repo>/pull/<n>`)."""
    url = pr.get("url")
    if not isinstance(url, str):
        return None
    parts = url.split("/")
    return parts[4].lower() if len(parts) > 4 else None


def last_human_message(transcript_path: str | None) -> str | None:
    """The text of the latest message Alessio typed in this session, or None.

    The transcript is the session's JSONL log. Only `user` entries the app marks with
    `origin.kind == "human"` are his: tool results, another session's messages (`peer`),
    task notifications and a subagent's prompts (`isSidechain`) carry another origin or
    none. None when the file cannot be read or holds no such entry - no consent.
    """
    if not transcript_path:
        return None
    latest: str | None = None
    try:
        with open(transcript_path, encoding="utf-8", errors="replace") as log:
            for line in log:
                if '"human"' not in line:
                    continue
                try:
                    entry = json.loads(line)
                except ValueError:
                    continue
                origin = entry.get("origin")
                if (
                    entry.get("type") != "user"
                    or entry.get("isSidechain")
                    or not isinstance(origin, dict)
                    or origin.get("kind") != "human"
                ):
                    continue
                content = (entry.get("message") or {}).get("content")
                if isinstance(content, str):
                    latest = content
                elif isinstance(content, list):
                    latest = " ".join(
                        b.get("text", "")
                        for b in content
                        if isinstance(b, dict) and b.get("type") == "text"
                    )
    except OSError:
        return None
    return latest


def consents(number: object, message: str | None) -> bool:
    """Whether `message` asks for the merge of PR `number`.

    It must name the PR (`#157` or `157`, not inside another number or a path) and hold
    a word asking for a merge, with no negation in front of it. Pasted text is dropped
    first. Deliberately literal: a generic "ok" or "vai" is not consent to a merge.
    """
    if message is None or number is None:
        return False
    text = PASTED.sub(" ", message)
    if not CONSENT_VERB.search(text) or CONSENT_NEGATION.search(text):
        return False
    return re.search(rf"(?<![\w/.#-])#?{re.escape(str(number))}(?![\w/-])", text) is not None


def merge_verdict(
    pr: dict[str, object], flags: list[str] | None = None, consent: str | None = None
) -> str | None:
    """Why a merge of `pr` must not happen, or None when it may.

    `main` of the code repositories, where a merge deploys prod, takes only the promotion
    from `beta`; an unreadable repository is treated as one of them. `beta` of a code
    repository takes a merge only after review (a green `review` status on the head).
    Both take only a merge commit, and only when `consent` - Alessio's latest message in
    the chat - asks for this PR. The green-CI rule binds everywhere. `flags` are the
    `gh pr merge` options.
    """
    number = pr.get("number")
    base = pr.get("baseRefName")
    repo = repo_name(pr)
    code = repo is None or repo in CODE_REPOS
    checks = pr.get("statusCheckRollup") or []
    if base in OWNER_MERGES and code:
        if pr.get("headRefName") != PROMOTION_HEAD:
            return (
                f"PR #{number} goes into `{base}` from `{pr.get('headRefName')}`: a session "
                f"merges into main only the `{PROMOTION_HEAD} -> {base}` promotion (decision "
                "0013, amended 2026-11-01). Anything else goes to beta first."
            )
        used = [f for f in (flags or []) if f.split("=", 1)[0] in FORBIDDEN_MERGE_FLAGS]
        if used or ("--merge" not in (flags or []) and "-m" not in (flags or [])):
            return (
                f"PR #{number} promotes `{PROMOTION_HEAD}` into `{base}`: merge it with "
                f"`--merge` only, never {', '.join(used) or 'a squash or rebase'} (a squash "
                "cuts main off from beta's history, decision 0013)."
            )
    if base in REVIEWED_MERGES and code:
        used = [f for f in (flags or []) if f.split("=", 1)[0] in FORBIDDEN_MERGE_FLAGS]
        if used or ("--merge" not in (flags or []) and "-m" not in (flags or [])):
            return (
                f"PR #{number} goes into `{base}`: merge it with `--merge` only (a merge "
                f"commit), never {', '.join(used) or 'a squash or rebase'} (decision 0013)."
            )
        reviewed = [
            c
            for c in (checks if isinstance(checks, list) else [])
            if (c.get("context") or c.get("name")) == REVIEW_CONTEXT
        ]
        if not reviewed or (reviewed[0].get("state") or reviewed[0].get("conclusion")) not in GREEN:
            return (
                f"PR #{number} goes into `{base}` and its head has no green `{REVIEW_CONTEXT}` "
                "status: it has not passed the pre-merge review, or a commit came after it. "
                "Review it, set the status on the head, then merge (decision 0013, amended "
                "2026-10-20)."
            )
    if base in CONSENT_MERGES and code and not consents(number, consent):
        return (
            f"PR #{number} goes into `{base}` and Alessio's latest message does not ask for "
            f"it: a merge into beta or main needs his explicit word, naming the PR (for "
            f'example "unisci #{number}"). Ask him in the chat and wait for his answer; '
            "only a message he typed counts (decision 0013, amended 2026-11-10)."
        )
    if not isinstance(checks, list) or not checks:
        return f"PR #{number} has no CI checks yet; wait for `ci` to run."
    bad = []
    for c in checks:
        outcome = c.get("conclusion") or c.get("state")
        if outcome not in GREEN:
            bad.append(f"{c.get('name') or c.get('context')}={outcome or c.get('status')}")
    if bad:
        return (
            f"PR #{number} is not green ({', '.join(bad)}). Fix the failures "
            "(run `make lint` and `uv run pytest` locally), push, and wait for CI."
        )
    return None


def check_merge(words: list[str], env: dict[str, str], transcript_path: str | None) -> None:
    """Allow `gh pr merge` per `merge_verdict`, with Alessio's latest message as consent."""
    target, repo = parse_merge(words)
    cmd = ["gh", "pr", "view", "--json", "number,statusCheckRollup,baseRefName,headRefName,url"]
    if target:
        cmd.insert(3, target)
    if repo:
        cmd += ["--repo", repo]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=30, env=env)
        pr = json.loads(out.stdout)
    except Exception as exc:
        block(f"could not read the PR ({exc}); merge only what the guard can check.")
    flags = [w for w in words[words.index("merge") + 1 :] if w.startswith("-")]
    reason = merge_verdict(pr, flags, last_human_message(transcript_path))
    if reason:
        block(reason)


def push_targets(words: list[str]) -> list[str]:
    """The protected branches a `git ... push` would write to, from its refspecs."""
    args = [w for w in words[words.index("push") + 1 :] if not w.startswith("-")]
    hits = []
    for ref in args[1:]:  # args[0] is the remote
        dest = ref.split(":")[-1].removeprefix("+").removeprefix("refs/heads/")
        if dest in PROTECTED:
            hits.append(dest)
    return hits


def check_push(words: list[str]) -> None:
    """Refuse `git push` whose refspec lands on a protected branch."""
    for dest in push_targets(words):
        block(
            f"direct push to `{dest}` is not allowed. Work lands through a pull request into "
            "`beta`; `dev` is rebuilt by the `integrate` workflow (decision 0013, v2)."
        )
    args = [w for w in words[words.index("push") + 1 :] if not w.startswith("-")]
    branch = subprocess.run(
        ["git", "branch", "--show-current"], capture_output=True, text=True
    ).stdout.strip()
    if len(args) <= 1 and branch in PROTECTED:
        block(f"you are on `{branch}`; branch off (`git switch -c feat/...`) and open a PR.")


def main() -> None:
    """Dispatch on every command of the Bash call, wherever it sits."""
    event = json.load(sys.stdin)
    command = (event.get("tool_input") or {}).get("command", "")
    for words in commands(command):
        if words[:3] == ["gh", "pr", "merge"]:
            check_merge(words, gh_env(command), event.get("transcript_path"))
        if words[:2] == ["gh", "api"] and any(re.search(r"pulls/\d+/merge\b", w) for w in words):
            block("merging through `gh api` skips the guard; use `gh pr merge` so it can check.")
        if git_subcommand(words) == "push":
            check_push(words)


if __name__ == "__main__":
    main()
