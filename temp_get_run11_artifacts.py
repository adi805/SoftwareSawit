import urllib.request, json, os, zipfile

repo = "adi805/SoftwareSawit"
run_id = 24226050691
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

arts = api_get(f"actions/runs/{run_id}/artifacts")
if arts:
    with open(os.path.join(out_dir, "artifacts.json"), "w", encoding="utf-8") as f:
        json.dump(arts, f, indent=2)
    for a in arts.get("artifacts", []):
        name = a["name"]
        dl_url = a["archive_download_url"]
        print(f"Artifact: {name} size={a['size_in_bytes']} url={dl_url}")
else:
    print("No artifacts data")
