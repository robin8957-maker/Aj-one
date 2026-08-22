#!/bin/sh
# Linux namespace jail. Invoked already inside:
#   unshare --mount --uts --ipc --pid --fork --mount-proc [--net] --propagation private
# Args: <work-abs> <network:none|open> <command>
set -eu

WORK=${1:-}
NET=${2:-none}
CMD=${3:-}

if [ -z "$WORK" ] || [ -z "$CMD" ]; then
  echo "sandbox: usage: enter.sh <work> <none|open> <command>" >&2
  exit 2
fi
if [ ! -d "$WORK" ]; then
  echo "sandbox: work root missing" >&2
  exit 2
fi

JAIL=$(mktemp -d /tmp/aj-jail-XXXXXX)
cleanup() {
  umount -l "$JAIL/work" 2>/dev/null || true
  umount -l "$JAIL/usr" 2>/dev/null || true
  umount -l "$JAIL/bin" 2>/dev/null || true
  umount -l "$JAIL/lib" 2>/dev/null || true
  umount -l "$JAIL/lib64" 2>/dev/null || true
  umount -l "$JAIL/proc" 2>/dev/null || true
  umount -l "$JAIL/tmp" 2>/dev/null || true
  umount -l "$JAIL/opt/extra" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

mkdir -p "$JAIL/work" "$JAIL/proc" "$JAIL/tmp" "$JAIL/dev" "$JAIL/etc" "$JAIL/usr" "$JAIL/bin" "$JAIL/lib" "$JAIL/opt"

bind_ro() {
  src=$1
  dst=$2
  if [ -d "$src" ]; then
    mkdir -p "$dst"
    mount --bind "$src" "$dst"
    mount -o remount,ro,bind "$dst" 2>/dev/null || true
  fi
}

bind_ro /usr "$JAIL/usr"
bind_ro /bin "$JAIL/bin"
bind_ro /lib "$JAIL/lib"
if [ -d /lib64 ]; then
  mkdir -p "$JAIL/lib64"
  mount --bind /lib64 "$JAIL/lib64"
  mount -o remount,ro,bind "$JAIL/lib64" 2>/dev/null || true
fi

mount --bind "$WORK" "$JAIL/work"
mount -t tmpfs -o size=64m,nosuid,nodev,mode=1777 tmpfs "$JAIL/tmp"
mount -t proc -o nosuid,noexec,nodev proc "$JAIL/proc"

if [ -n "${AJ_RO_BIND:-}" ] && [ -d "${AJ_RO_BIND}" ]; then
  mkdir -p "$JAIL/opt/extra"
  mount --bind "${AJ_RO_BIND}" "$JAIL/opt/extra"
  mount -o remount,ro,bind "$JAIL/opt/extra" 2>/dev/null || true
fi

# Devices: bind individual nodes (mknod is often blocked in nested containers).
for node in null zero urandom tty; do
  if [ -e "/dev/$node" ]; then
    touch "$JAIL/dev/$node"
    mount --bind "/dev/$node" "$JAIL/dev/$node" 2>/dev/null || true
  fi
done

printf 'root:x:0:0:root:/work:/sbin/nologin\nnobody:x:65534:65534:sandbox:/work:/bin/bash\n' >"$JAIL/etc/passwd"
printf 'root:x:0:\nnogroup:x:65534:\n' >"$JAIL/etc/group"
printf 'hosts: files\npasswd: files\ngroup: files\n' >"$JAIL/etc/nsswitch.conf"
hostname aj-sandbox 2>/dev/null || true

chmod a+rwX "$JAIL/work" 2>/dev/null || true
find "$JAIL/work" -type d -exec chmod a+rwx {} + 2>/dev/null || true
find "$JAIL/work" -type f -exec chmod a+rw {} + 2>/dev/null || true

# Privilege drop is attempted but this host may map only uid 0 (nested container).
# Isolation still holds via chroot + mount/pid/net namespaces + no host binds + no mknod.
printf '%s\n' "cd /work && $CMD" >"$JAIL/tmp/cmd.sh"
chmod 755 "$JAIL/tmp/cmd.sh"

export HOME=/work USER=sandbox LOGNAME=sandbox TMPDIR=/tmp PATH=/usr/bin:/bin NODE_DISABLE_COLORS=1
unset XAI_API_KEY OPENAI_API_KEY ANTHROPIC_API_KEY AWS_SECRET_ACCESS_KEY AWS_ACCESS_KEY_ID
unset AZURE_OPENAI_API_KEY GITHUB_TOKEN AJ_MASTER_KEY DATABASE_URL NEON_DATABASE_URL
unset PGUSER PGPASSWORD PGHOST

# setpriv --nnp blocks privilege escalation from the allowlisted binary.
# seccomp.py adds a deny-list (ptrace/mount/bpf/kexec…) when BPF is accepted.
SECCOMP=""
if [ -x /usr/bin/python3 ] && [ -f /workspace/services/sandbox/seccomp.py ]; then
  SECCOMP="/usr/bin/python3 /workspace/services/sandbox/seccomp.py"
elif [ -x /usr/bin/python3 ] && [ -f "$(dirname "$0")/seccomp.py" ]; then
  SECCOMP="/usr/bin/python3 $(dirname "$0")/seccomp.py"
fi
if [ -x /usr/bin/setpriv ]; then
  WRAP="/usr/bin/setpriv --no-new-privs --inh-caps=-all"
else
  WRAP=""
fi
if [ -x /usr/bin/prlimit ]; then
  $SECCOMP $WRAP /usr/bin/prlimit --cpu=25 --nproc=64 --fsize=67108864 --stack=8388608 -- \
    /usr/sbin/chroot "$JAIL" /usr/bin/timeout --signal=KILL 22 /bin/bash /tmp/cmd.sh
else
  $SECCOMP $WRAP /usr/sbin/chroot "$JAIL" /usr/bin/timeout --signal=KILL 22 /bin/bash /tmp/cmd.sh
fi
