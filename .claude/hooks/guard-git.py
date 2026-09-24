#!/usr/bin/env python3
"""Claude Code PreToolUse hook: no merge into beta or main, no merge on a red CI, no push.

Claude never merges into `beta` or `main`, never pushes to `dev`, `beta` or `main`, and
never merges anything on a red or pending CI.

The repository is private on GitHub's free plan, so branch protection is not available
server-side (the API answers 403). This hook enforces working method 0013 (v2) where the
work actually happens: in Claude Code sessions. It reads the tool call from stdin and, for
a Bash command, blocks (exit 2, reason on stderr, which Claude sees) when:

- the command merges a pull request into `beta` or `main` - only the owner does, by hand;
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
OWNER_MERGES = ("beta", "main")
"""Bases only the owner merges into, by hand (decision 0013, v2)."""
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


def merge_verdict(pr: dict[str, object]) -> str | None:
    """Why a merge of `pr` must not happen, or None when it may."""
    number = pr.get("number")
    base = pr.get("baseRefName")
    if base in OWNER_MERGES:
        return (
            f"PR #{number} goes into `{base}`: only the owner merges into beta and main, by "
            "hand (decision 0013, v2). Leave it open; `integrate` puts it in dev."
        )
    checks = pr.get("statusCheckRollup") or []
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


def check_merge(words: list[str], env: dict[str, str]) -> None:
    """Allow `gh pr merge` only outside beta and main, and only on an all-green CI."""
    target, repo = parse_merge(words)
    cmd = ["gh", "pr", "view", "--json", "number,statusCheckRollup,baseRefName"]
    if target:
        cmd.insert(3, target)
    if repo:
        cmd += ["--repo", repo]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=30, env=env)
        pr = json.loads(out.stdout)
    except Exception as exc:
        block(f"could not read the PR ({exc}); merge only what the guard can check.")
    reason = merge_verdict(pr)
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
            check_merge(words, gh_env(command))
        if words[:2] == ["gh", "api"] and any(re.search(r"pulls/\d+/merge\b", w) for w in words):
            block("merging through `gh api` skips the guard; use `gh pr merge` so it can check.")
        if git_subcommand(words) == "push":
            check_push(words)


if __name__ == "__main__":
    main()
