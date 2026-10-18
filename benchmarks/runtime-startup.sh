#!/usr/bin/env bash
# Ukur startup runtime Rust (R4): wall time proses + `engine.executed` timings.
# Hasil: benchmarks/results/runtime-startup.json — mesin dev, BUKAN klaim publik
# (BLUEPRINT §8/§10). Jalankan: benchmarks/runtime-startup.sh [RUNS=7]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${RAMONYX_RUNTIME_BIN:-$ROOT/target/release/ramonyx-runtime}"
RUNS="${RUNS:-${1:-7}}"
OUT="${RAMONYX_RUNTIME_STARTUP_OUT:-$ROOT/benchmarks/results/runtime-startup.json}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ ! -x "$BIN" ]; then
  echo "binary tidak ditemukan: $BIN (jalankan: cargo build --release -p ramonyx-runtime-cli)" >&2
  exit 1
fi

cat > "$TMP/mini.mjs" <<'EOF'
console.log("halo");
EOF

cat > "$TMP/pekerja.mjs" <<'EOF'
const pesan = await ramonyx.parent.receive();
await ramonyx.parent.send({ hasil: pesan.a * 2 });
EOF

cat > "$TMP/workers.mjs" <<EOF
const jalur = "$TMP/pekerja.mjs";
const hasil = await Promise.all(
  Array.from({ length: 4 }, async () => {
    const worker = await ramonyx.worker(jalur, { timeoutMs: 10000 });
    await worker.send({ a: 2 });
    const balasan = await worker.receive();
    return balasan.hasil;
  }),
);
console.log("worker:", hasil.join(","));
EOF

mkdir -p "$(dirname "$OUT")"
python3 - "$BIN" "$RUNS" "$TMP" "$OUT" <<'PY'
import json
import statistics
import subprocess
import sys
import time
from datetime import datetime, timezone

binary, runs, tmp, out_path = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]


def measure(script, extra=()):
    wall, startup, load, evaluate, total = [], [], [], [], []
    v8, bootstrap, web_shim = [], [], []
    for _ in range(runs):
        started = time.perf_counter()
        result = subprocess.run(
            [binary, "run", script, *extra], capture_output=True, text=True
        )
        wall.append((time.perf_counter() - started) * 1000)
        if result.returncode != 0:
            raise SystemExit(f"gagal menjalankan {script}: {result.stderr}")
        for line in result.stdout.splitlines():
            try:
                record = json.loads(line)
            except ValueError:
                continue
            if record.get("message") != "engine.executed":
                continue
            fields = record.get("fields", {})
            startup.append(fields.get("startupMs"))
            breakdown = fields.get("startup") or {}
            v8.append(breakdown.get("v8Ms"))
            bootstrap.append(breakdown.get("bootstrapMs"))
            web_shim.append(breakdown.get("webShimMs"))
            timings = fields.get("timings") or {}
            load.append(timings.get("loadMs"))
            evaluate.append(timings.get("evalMs"))
            total.append(timings.get("totalMs"))

    def stats(values):
        values = [value for value in values if value is not None]
        if not values:
            return None
        return {
            "median": round(statistics.median(values), 2),
            "min": round(min(values), 2),
            "max": round(max(values), 2),
        }

    return {
        "wallMs": stats(wall),
        "engineStartupMs": stats(startup),
        "startupBreakdown": {
            "v8Ms": stats(v8),
            "bootstrapMs": stats(bootstrap),
            "webShimMs": stats(web_shim),
        },
        "loadMs": stats(load),
        "evaluateMs": stats(evaluate),
        "totalMs": stats(total),
    }


hasil = {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "binary": binary,
    "runs": runs,
    "note": "Mesin dev; warm-up tidak dipisah. Bukan klaim publik (BLUEPRINT §10).",
    "scenarios": {
        "mini": measure(f"{tmp}/mini.mjs"),
        "mini-with-op-metrics": measure(f"{tmp}/mini.mjs", ["--op-metrics"]),
        "four-workers": measure(f"{tmp}/workers.mjs"),
    },
}

with open(out_path, "w") as handle:
    json.dump(hasil, handle, indent=2)
    handle.write("\n")

print(json.dumps(hasil, indent=2))
PY
