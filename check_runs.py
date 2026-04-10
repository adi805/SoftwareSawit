import json

# Check run 12 status
with open('temp_run12.json') as f:
    run = json.load(f)

print(f"Run #12 Status: {run['status']}")
print(f"Conclusion: {run.get('conclusion') or 'Still running...'}")
print(f"Branch: {run['head_branch']}")
print(f"URL: {run['html_url']}")
