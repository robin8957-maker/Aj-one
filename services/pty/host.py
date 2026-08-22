#!/usr/bin/env python3
"""Persistent PTY host. stdin bytes go to the slave; slave output goes to stdout."""
import os
import pty
import select
import signal
import sys

cwd = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
try:
    os.chdir(cwd)
except OSError:
    pass

pid, fd = pty.fork()
if pid == 0:
    os.environ.setdefault("TERM", "xterm-256color")
    os.environ["PS1"] = "aj$ "
    os.execvp("bash", ["bash", "--noprofile", "--norc"])

def die(signum, _frame):
    try:
        os.kill(pid, signal.SIGHUP)
    except OSError:
        pass
    sys.exit(0)

signal.signal(signal.SIGTERM, die)
signal.signal(signal.SIGINT, die)

stdin_fd = sys.stdin.fileno()
while True:
    try:
        r, _, _ = select.select([fd, stdin_fd], [], [], 0.2)
    except InterruptedError:
        continue
    if fd in r:
        try:
            data = os.read(fd, 4096)
        except OSError:
            break
        if not data:
            break
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()
    if stdin_fd in r:
        try:
            data = os.read(stdin_fd, 4096)
        except OSError:
            break
        if not data:
            break
        os.write(fd, data)
die(signal.SIGTERM, None)
