#!/usr/bin/env python3
"""Tiny PTY bridge used by the AgentSpace dashboard.

Node talks to this worker over stdin/stdout. The worker owns a real pseudo
terminal, so interactive CLIs can behave like they are inside a normal shell.
"""

from __future__ import annotations

import json
import os
import pty
import select
import signal
import sys
import time


def main() -> int:
    config = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    cwd = config.get("cwd") or os.getcwd()
    shell = config.get("shell") or "/bin/zsh"
    initial_command = (config.get("initialCommand") or "").strip()
    env_patch = config.get("env") or {}

    child_pid, master_fd = pty.fork()

    if child_pid == 0:
        os.chdir(cwd)
        env = os.environ.copy()
        env.update(env_patch)
        env.setdefault("TERM", "xterm-256color")
        env.setdefault("COLORTERM", "truecolor")
        os.execvpe(shell, [shell, "-il"], env)
        return 0

    def forward_signal(signum: int, _frame: object) -> None:
        try:
            os.kill(child_pid, signum)
        except ProcessLookupError:
            pass

    signal.signal(signal.SIGTERM, forward_signal)
    signal.signal(signal.SIGINT, forward_signal)

    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()
    initial_sent = not initial_command
    initial_at = time.time() + 0.35
    stdin_open = True

    try:
        while True:
            if not initial_sent and time.time() >= initial_at:
                os.write(master_fd, (initial_command + "\n").encode())
                initial_sent = True

            watch_fds = [master_fd]
            if stdin_open:
                watch_fds.append(stdin_fd)

            readable, _, _ = select.select(watch_fds, [], [], 0.1)

            if master_fd in readable:
                try:
                    data = os.read(master_fd, 8192)
                except OSError:
                    break
                if not data:
                    break
                os.write(stdout_fd, data)

            if stdin_fd in readable:
                data = os.read(stdin_fd, 8192)
                if not data:
                    stdin_open = False
                else:
                    os.write(master_fd, data)

            try:
                ended_pid, _status = os.waitpid(child_pid, os.WNOHANG)
                if ended_pid == child_pid:
                    break
            except ChildProcessError:
                break
    finally:
        try:
            os.kill(child_pid, signal.SIGHUP)
        except ProcessLookupError:
            pass
        try:
            os.close(master_fd)
        except OSError:
            pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
