import time, json
from genome import enumerate_codes
res = {}
for k in range(11, 40):
    t = time.time()
    c, _ = enumerate_codes(10**k, collect=False)
    res[k] = c
    print(k, c, f"{time.time()-t:.1f}s", flush=True)
    json.dump(res, open("genome_counts.json", "w"))
    if time.time() - t > 400:
        break
