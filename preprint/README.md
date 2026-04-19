# Sycoindex / PAI preprint

This directory holds the LaTeX source for the PAI v1 preprint.

**Status:** work in progress. Not yet submitted to arXiv.

## What's here

- `sycoindex-v1.tex` — the preprint skeleton, with abstract, intro, related work, limitations (incl. judge-bias audit), ethics, and open-methodology sections written out. The **Results** section (§6) is now fully populated with three figures and cross-index analysis. Instrument (§3) and Pipeline (§4) sections are still stubbed with `[TODO]` markers that point back to `../methodology.html` as the source of truth.
- `sycoindex-v1.bib` — BibTeX for all current citations including the three LLM-as-judge bias references (Zheng 2023, Wang 2023, Dubois 2024).
- `figures/generate.py` — deterministic matplotlib script that produces three publication-ready PDFs from `../data/leaderboard.json`. Re-run after any leaderboard update.
- `figures/dimension_heatmap_pai.pdf` — PAI per-dimension heatmap (10 models × 5 dimensions, 0–10 scale).
- `figures/dimension_heatmap_syco.pdf` — sycophancy per-dimension heatmap (10 models × 5 dimensions, 0–10 scale).
- `figures/cross_index_scatter.pdf` — scatter of sycophancy honesty (%) vs PAI composite across six model families with Pearson correlation (r = −0.81, n = 6).

## Building

```bash
cd preprint
pdflatex sycoindex-v1.tex
bibtex sycoindex-v1
pdflatex sycoindex-v1.tex
pdflatex sycoindex-v1.tex   # resolve cross-refs
```

Or use `latexmk -pdf sycoindex-v1.tex`.

## Remaining work before arXiv submission

1. **Fill in `\S3` (Instrument) and `\S4` (Pipeline)** from the corresponding sections of `../methodology.html`. These two sections still have `[TODO]` markers; prose is already in methodology.html — it just needs to be moved into LaTeX.
2. ~~**Figures.** Per-dimension heatmaps (PAI + sycophancy) and cross-index scatter.~~ **Done** — see `figures/`. Regenerate via `cd preprint/figures && python3 generate.py` after any leaderboard update.
3. **Run the judge-bias audit** described in `\S7.1`. This is the standalone technical note promised in that section — per-judge drift patterns across the ensemble. Once run, either inline the results or publish the note separately and cite it here.
4. **arXiv endorsement.** Submitting to `cs.CY` requires either an existing arXiv account in that category or an endorsement from someone who has one. Ask a contact at Stanford HAI, MIT, or a university collaborator to endorse; fallback is to submit cross-list under `cs.LG` first if we have easier access there.
5. **DOI.** Register the preprint with Zenodo (free) for a citable DOI once v1 is stable. Link from `sycoindex.ai/methodology.html` in the Citation section.
6. **Final proof pass.** Confirm all claims in the preprint are also defensible on the live site and vice versa — the public-facing methodology and the preprint must not contradict each other.

## Notes on the open/proprietary split

The preprint is aligned with `../terms.html` §4.1/§4.2:

- **Published in the preprint:** rubric, dimension definitions, scoring anchors, reliability methodology, reliability gate, ensemble architecture description, judge-bias audit.
- **Kept out of the preprint:** verbatim judge prompts, scenario transcripts, calibration-anchor-to-transcript mappings, aggregation-code specifics.

This mirrors MLCommons' practice of publishing methodology while keeping evaluation data private to prevent contamination.
