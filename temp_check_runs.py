import urllib.request, json
url = 'https://api.github.com/repos/adi805/SoftwareSawit/actions/runs?per_page=10'
req = urllib.request.Request(url, headers={'Accept': 'application/vnd.github+json'})
d = json.load(urllib.request.urlopen(req))
for r in d['workflow_runs']:
    rn = r['run_number']
    status = r['status']
    conclusion = r.get('conclusion') or 'N/A'
    cid = r['head_commit']['id'][:8]
    print(f'Run #{rn}: status={status} conclusion={conclusion} commit={cid}')
