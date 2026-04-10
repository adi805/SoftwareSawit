import urllib.request, json, time, os, sys
from datetime import datetime

run_id = 11
repo = "adi805/SoftwareSawit"
log_file = r"D:\Estate\Droid\SoftwareSawit\.factory\monitor\state\watch_run11.log"
state_file = r"D:\Estate\Droid\SoftwareSawit\.factory\monitor\state\watch_run11_state.json"

def log(msg):
    ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    line = f"[{ts}] {msg}"
    print(line)
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(line + "\n")

def get_latest_run():
    url = f"https://api.github.com/repos/{repo}/actions/runs?per_page=5"
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    for r in data["workflow_runs"]:
        if r["run_number"] == run_id:
            return r
    return None

def main():
    os.makedirs(os.path.dirname(log_file), exist_ok=True)
    log(f"Starting watch for Run #{run_id}")
    while True:
        run = get_latest_run()
        if not run:
            log(f"Run #{run_id} not found, retrying in 2 min...")
            time.sleep(120)
            continue
        status = run["status"]
        conclusion = run.get("conclusion") or "N/A"
        cid = run["head_commit"]["id"][:8]
        log(f"Run #{run_id}: status={status} conclusion={conclusion} commit={cid}")
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump({"run_number": run_id, "status": status, "conclusion": conclusion, "commit": cid, "checked_at": datetime.utcnow().isoformat()}, f)
        if status == "completed":
            log(f"Run #{run_id} COMPLETED with conclusion={conclusion}")
            sys.exit(0 if conclusion == "success" else 1)
        time.sleep(120)

if __name__ == "__main__":
    main()
