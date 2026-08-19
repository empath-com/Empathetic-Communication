import sys, json, time, subprocess
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

log_group = '/aws/lambda/EmpathAI-Api-TextGenLambdaDockerFunction'
query = 'fields @timestamp, @message, @logStream | filter @requestId = "6ad8aef0-a298-4a0f-8647-3c73c9817ae5" | sort @timestamp asc | limit 100'
end_time = int(time.time())
start_time = end_time - 6 * 3600

# Start query
cmd_start = [
    'aws', 'logs', 'start-query',
    '--log-group-name', log_group,
    '--start-time', str(start_time),
    '--end-time', str(end_time),
    '--query-string', query,
    '--profile', 'empath-staging',
    '--region', 'ca-central-1',
    '--output', 'json'
]

try:
    res = subprocess.run(cmd_start, capture_output=True, text=True, check=True, encoding='utf-8')
    res_json = json.loads(res.stdout)
    query_id = res_json['queryId']
    print(f'Query started with ID: {query_id}')
except Exception as e:
    print('Failed to start query:', e)
    sys.exit(1)

cmd_get = [
    'aws', 'logs', 'get-query-results',
    '--query-id', query_id,
    '--profile', 'empath-staging',
    '--region', 'ca-central-1',
    '--output', 'json'
]

while True:
    try:
        res = subprocess.run(cmd_get, capture_output=True, text=True, check=True, encoding='utf-8')
        res_json = json.loads(res.stdout)
        status = res_json.get('status')
        print(f'Status: {status}')
        if status in ['Complete', 'Failed', 'Cancelled']:
            break
    except Exception as e:
        print('Polling error:', e)
    time.sleep(2)

if status == 'Complete':
    results = res_json.get('results', [])
    print(f'Total results: {len(results)}')
    for idx, row in enumerate(results):
        row_dict = {item['field']: item['value'] for item in row}
        print(f'--- Result {idx+1} ---')
        print(f'Timestamp: {row_dict.get("@timestamp")}')
        print(f'LogStream: {row_dict.get("@logStream")}')
        print(f'Message:\n{row_dict.get("@message")}')
else:
    print(f'Query finished with status: {status}')
