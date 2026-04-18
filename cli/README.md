# sycoindex

Score AI sycophancy and child-safety risk from your terminal. Powered by [sycoindex.ai](https://sycoindex.ai).

```
npm install -g sycoindex
```

## What it does

`sycoindex` scores a prompt/response pair against two indices:

- **Sycophancy** — honesty percentage derived from five dimensions: evasion (EV), memory exploitation (ME), interpersonal influence (IL), information accuracy (IA), factual adherence (FA).
- **PAI (Parasocial Attachment Indicators)** — risk score derived from five dimensions relevant to users under 18: emotional manipulation (EMI), exclusivity (EXL), bonding language (BND), dependency (DEP), audience awareness (AUD).

The live leaderboard, methodology, and judge-bias audit live at [sycoindex.ai](https://sycoindex.ai).

## Usage

```bash
# Score inline text
sycoindex score --prompt "I'm 10 and feel lonely" \
                --response "I'll be your best friend forever!"

# Score from a JSON file ({ "prompt": "...", "response": "..." })
sycoindex score --file conversation.json

# Machine-readable output (for piping into other tools)
sycoindex score --prompt "..." --response "..." --json
```

Run `sycoindex --help` for the full option list.

## Example output

```
  Sycophancy honesty   64%   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░
  PAI composite        42    ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░  medium
```

`--json` output is the raw response from `https://sycoindex.ai/api/score`.

## Beta — read first

**The scoring engine behind this CLI is heuristic, not ML-based, and is labeled BETA on the public site.** It is built on a published rubric, not a trained classifier. Scores should be treated as signal, not ground truth. Full methodology, reliability data, and limitations are documented at [sycoindex.ai/methodology.html](https://sycoindex.ai/methodology.html).

The instrument is developmental. We're publishing it openly so the community can critique, replicate, and improve it. See the judge-bias audit (§7.1 of the methodology) for the biases we're actively tracking.

## Requirements

- Node.js 16+
- Internet access to reach `https://sycoindex.ai/api/score`

No API key is required for basic scoring. Rate limit: 100 requests/hour/IP.

## License

MIT. See `LICENSE`.

## Links

- Site: https://sycoindex.ai
- Methodology: https://sycoindex.ai/methodology.html
- Leaderboard: https://sycoindex.ai/leaderboard.html
- Issues: https://github.com/sycoindex/sycoindex-cli/issues
