#!/usr/bin/env python3
"""PR_SET_NO_NEW_PRIVS + a deny-list seccomp-BPF filter (no libseccomp)."""
import ctypes
import ctypes.util
import os
import struct
import sys

PR_SET_NO_NEW_PRIVS = 38
PR_SET_SECCOMP = 22
SECCOMP_MODE_FILTER = 2
AUDIT_ARCH_X86_64 = 0xC000003E

# x86_64 syscall numbers to kill
DENY = {
    101,  # ptrace
    165,  # mount
    166,  # umount2
    169,  # reboot
    246,  # kexec_load
    175,  # init_module
    176,  # delete_module
    167,  # swapon
    168,  # swapoff
    321,  # bpf
    298,  # perf_event_open
    323,  # userfaultfd
    312,  # kcmp
    179,  # quotactl
    163,  # acct
}

libc = ctypes.CDLL(ctypes.util.find_library("c") or "libc.so.6", use_errno=True)


class SockFilter(ctypes.Structure):
    _fields_ = [("code", ctypes.c_uint16), ("jt", ctypes.c_uint8), ("jf", ctypes.c_uint8), ("k", ctypes.c_uint32)]


class SockFprog(ctypes.Structure):
    _fields_ = [("len", ctypes.c_ushort), ("filter", ctypes.POINTER(SockFilter))]


# Classic BPF
BPF_LD = 0x00
BPF_W = 0x00
BPF_ABS = 0x20
BPF_JMP = 0x05
BPF_JEQ = 0x10
BPF_K = 0x00
BPF_RET = 0x06
SECCOMP_RET_ALLOW = 0x7FFF0000
SECCOMP_RET_KILL_PROCESS = 0x80000000


def _insn(code, k, jt=0, jf=0):
    return SockFilter(code, jt, jf, k)


def build_filter():
    insns = [
        _insn(BPF_LD | BPF_W | BPF_ABS, 4),  # arch
        _insn(BPF_JMP | BPF_JEQ | BPF_K, AUDIT_ARCH_X86_64, 1, 0),
        _insn(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
        _insn(BPF_LD | BPF_W | BPF_ABS, 0),  # nr
    ]
    denied = sorted(DENY)
    for i, nr in enumerate(denied):
        remain = len(denied) - i
        # if nr == X → kill, else fall through
        insns.append(_insn(BPF_JMP | BPF_JEQ | BPF_K, nr, 0, 1))
        insns.append(_insn(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS))
        del remain
    insns.append(_insn(BPF_RET | BPF_K, SECCOMP_RET_ALLOW))
    arr = (SockFilter * len(insns))(*insns)
    return SockFprog(len(insns), arr)


def no_new_privs() -> None:
    if libc.prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0:
        sys.stderr.write("seccomp: PR_SET_NO_NEW_PRIVS failed (continuing)\n")


def apply_filter() -> None:
    if os.uname().machine != "x86_64":
        return
    prog = build_filter()
    rc = libc.prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, ctypes.byref(prog))
    if rc != 0:
        sys.stderr.write("seccomp: FILTER not applied (continuing with nnp only)\n")


if __name__ == "__main__":
    no_new_privs()
    apply_filter()
    if len(sys.argv) > 1:
        os.execvp(sys.argv[1], sys.argv[1:])
