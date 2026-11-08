# site-bench

Public probe of one site through proxies.

## Files

| Path | Purpose |
| --- | --- |
| `proxies/*.env` | Proxy configuration |
| `sites/*.json` | A JSON array of `http` or `https` URLs to probe |
| `user-agents/*.json` | A JSON array of `{ "name", "ua" }`. |

`sites/exanple.json` and `user-agents/default.json` are the built-in cell axes.
Copy `proxies/proxy.env.example` and fill environment variables to add a proxy:
`RATE`, `DURATION`, `ALLOW_HIGHER_RATE`, `FAIL_ON_CHALLENGE`, `FAIL_ON_NON200`, and `P95_MS` live in `Taskfile.yml`.

A cell without a proxy URL refuses to start.

## Run

```sh
task show
task --exit-code run PROXY=superproxy.env SITE=gigasite.json UA=megaagents.json
task --exit-code all
```

`task show` prints one line per cell.
`task run` starts one clean k6 container with `docker compose run --rm`.
`task all` runs every cell in order and stops at the first failure.

k6 writes `results/<cell>.txt`, `results/<cell>.json`, and `results/<cell>.csv`.
The text file is the short rollup.
The JSON file is the k6 summary.
The CSV file is k6's metric series.
The cell name is the three file stems, for example `proxy1-dancebet-default`.
