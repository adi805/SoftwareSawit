import urllib.request, json, os, zipfile

repo = "adi805/SoftwareSawit"
run_id = 24226050691
out_dir = r"D:\Estate\Droid\SoftwareSawit\.factory\monitor\run11_logs"
os.makedirs(out_dir, exist_ok=True)

token = os.environ.get("GH_TOKEN", "")
if not token:
    print("No GH_TOKEN env var")
    raise SystemExit(1)

# get artifact list
url = f"https://api.github.com/repos/{repo}/actions/runs/{run_id}/artifacts"
req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "Authorization": f"Bearer {token}"})
with urllib.request.urlopen(req) as resp:
    arts = json.load(resp)

agg = None
for a in arts.get("artifacts", []):
    if "aggregate-test-report" in a["name"]:
        agg = a
        break

if not agg:
    print("Aggregate artifact not found")
    raise SystemExit(1)

dl_url = agg["archive_download_url"]
print(f"Downloading {agg['name']} ...")
req2 = urllib.request.Request(dl_url, headers={"Authorization": f"Bearer {token}"})
zip_path = os.path.join(out_dir, "aggregate.zip")
with urllib.request.urlopen(req2) as resp:
    with open(zip_path, "wb") as f:
        f.write(resp.read())
print(f"Saved to {zip_path}")

# extract
extract_dir = os.path.join(out_dir, "aggregate")
os.makedirs(extract_dir, exist_ok=True)
with zipfile.ZipFile(zip_path, "r") as z:
    z.extractall(extract_dir)
print(f"Extracted to {extract_dir}")

# list files
for root, dirs, files in os.walk(extract_dir):
    for f in files:
        print(os.path.join(root, f))
