import urllib.request, json, os, sys

repo = "adi805/SoftwareSawit"
run_number = 11
out_dir = r"D:\Estate\Droid\SoftwareSawit\.factory\monitor\run11_logs"
os.makedirs(out_dir, exist_ok=True)

def api_get(path):
    url = f"https://api.github.com/repos/{repo}/{path}"
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code} for {url}")
        return None

# Find run by run_number
runs_data = api_get("actions/runs?per_page=10")
run_data = None
for r in runs_data.get("workflow_runs", []):
    if r["run_number"] == run_number:
        run_data = r
        break
if run_data:
    with open(os.path.join(out_dir, "run.json"), "w", encoding="utf-8") as f:
        json.dump(run_data, f, indent=2)
    print(f"Run URL: {run_data['html_url']}")
    print(f"Run status: {run_data['status']} conclusion: {run_data.get('conclusion')}")
    run_id = run_data["id"]
else:
    print("Run not found")
    sys.exit(1)

# Get jobs
jobs_data = api_get(f"actions/runs/{run_id}/jobs")
if jobs_data:
    with open(os.path.join(out_dir, "jobs.json"), "w", encoding="utf-8") as f:
        json.dump(jobs_data, f, indent=2)
    for job in jobs_data.get("jobs", []):
        print(f"Job: {job['name']} - status={job['status']} conclusion={job.get('conclusion')}")
        # Download log for each job
        log_url = job.get("logs_url")
        if log_url:
            try:
                req = urllib.request.Request(log_url, headers={"Accept": "application/vnd.github+json"})
                with urllib.request.urlopen(req, timeout=60) as resp:
                    log_bytes = resp.read()
                log_path = os.path.join(out_dir, f"job_{job['id']}_log.zip")
                with open(log_path, "wb") as f:
                    f.write(log_bytes)
                print(f"  Downloaded log -> {log_path}")
            except Exception as e:
                print(f"  Failed to download log: {e}")

print("Done.")
