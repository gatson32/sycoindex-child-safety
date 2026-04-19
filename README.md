# Sycoindex — PAI Framework for AI-Child Safety

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.19656141.svg)](https://doi.org/10.5281/zenodo.19656141)
[![License: CC BY 4.0](https://img.shields.io/badge/License-CC%20BY%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/)
[![Live Site](https://img.shields.io/badge/site-sycoindex.ai-blue)](https://sycoindex.ai)

The **Parasocial Attachment Indicators (PAI) framework** is a five-dimension
instrument for measuring parasocial attachment patterns in synthetic
AI--child conversation transcripts. PAI scores are produced by a cross-lab
ensemble of five frontier LLM judges (Anthropic, OpenAI, Mistral, Google,
Meta) with a pre-registered Cohen's kappa >= 0.700 reliability gate.

- **Live leaderboard & methodology:** [sycoindex.ai](https://sycoindex.ai)
- **Methodology paper (v1):** [sycoindex.ai/methodology.html](https://sycoindex.ai/methodology.html)
- **Judge-bias audit (public):** [sycoindex.ai/judge-bias-audit.html](https://sycoindex.ai/judge-bias-audit.html)
- **Preprint DOI (concept):** [10.5281/zenodo.19656141](https://doi.org/10.5281/zenodo.19656141)
- **v0.1.0-preprint release:** [10.5281/zenodo.19656142](https://doi.org/10.5281/zenodo.19656142)

## What's in this repo

- `preprint/sycoindex-v1.tex` — the v0.1 preprint source (LaTeX).
- `methodology.html` — the public methodology page (rubric, scoring, audit chain, reliability).
- `judge-bias-audit.html` + `data/audit/judge-bias.json` — the public aggregate judge-bias audit report.
- `index.html` — the public leaderboard and framing.

## What is intentionally **not** in this repo

To keep the evaluation set uncontaminated and the benchmark meaningful,
the following artifacts are retained as trade secrets and are listed in
`.gitignore` / `.vercelignore`:

- Verbatim judge prompts, RUBRIC/SPEC/PROTOCOL documents.
- The evaluation corpus (`data/pai-corpus-*.json`, `data/pai-personas.json`).
- Raw per-transcript judge outputs and scoring pipeline scripts.

Aggregate, auditable outputs (kappa, dimension means, bias flags) are
published openly via the methodology and judge-bias-audit pages.

## Citation

If you use the PAI framework or Sycoindex scores, please cite:

```bibtex
@misc{sycoindex2026pai,
  title        = {The {PAI} Framework: Measuring Parasocial Attachment
                  Patterns in {AI}--Child Interactions},
  author       = {Gatson, Chris},
  year         = {2026},
  month        = {April},
  version      = {0.1.0-preprint},
  publisher    = {Zenodo},
  doi          = {10.5281/zenodo.19656141},
  url          = {https://doi.org/10.5281/zenodo.19656141},
  howpublished = {\url{https://sycoindex.ai/methodology.html}}
}
```

## License

- **Text, rubric descriptions, and methodology prose:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Trade-secret artifacts** listed above: all rights reserved.

## Contact

Chris Gatson &mdash; `chris@sycoindex.org` &mdash; [sycoindex.ai](https://sycoindex.ai)
