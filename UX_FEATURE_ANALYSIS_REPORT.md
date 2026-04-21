# UX Evidence Analysis: SDK schema + 3-step analysis + material price graph

Date: 2026-04-20
Scope reviewed: `InstructionsInterface`, `KainosInterface`, `PaklausimoKortele`, `kainosService`.

## Executive summary

There is strong code-level evidence that user feedback is valid:

1. **Prompt variable uncertainty is real**: users can edit prompt templates, but there is **no pre-send rendered prompt preview** with actual values. Missing variables are only surfaced at runtime as a transient notification.
2. **"Su DI" can look like "math-based" by design**: the graph’s math prediction line is explicitly interpolated across AI forecast dates whenever AI points exist, which visually aligns trajectories and can make lines appear to mimic each other.
3. **Troubleshooting visibility is weak**: diagnostics exist (notifications/errors/parser counters), but they are mostly ephemeral and not persisted into an actionable troubleshooting panel.

## Evidence by complaint

### 1) "Not sure prompt variables get filled"

#### What the code does
- Prompt templates are edited as raw text in `InstructionsInterface` with placeholder hints only; there is no rendered-value preview mode before execution.
- Runtime rendering uses a basic `injectPromptVars` string replacement in `KainosInterface`.
- Unknown placeholders are detected by regex (`findUnresolvedPromptVars`) and reported as UI notifications while generating analysis.

#### Why users feel uncertainty
- They cannot inspect final prompt payloads (`today`, `materialList`, `trendData`, etc.) before calling the LLM.
- If a variable is missing, feedback appears during generation as a toast, not as a persistent prompt validation artifact.
- Placeholders include aliases (`oilAnalysisContext` and `boundedNaftaText`, etc.), increasing cognitive load and mismatch risk.

### 2) "'Su DI' line mimics math-based line"

#### What the code does
- In graph construction, when AI series exists, the **math line (`predicted`) is generated on AI timestamps using interpolation toward math target**.
- AI line (`aiPredicted`) is then plotted over the same timeline.
- AI predictions are additionally clamped to a ±35% safety range from latest actual price.

#### Why users feel mimicry
- The math line is not independent from AI timeline when AI is enabled; it is intentionally reshaped on the same date anchors.
- Shared dates + close values (especially after ±35% clamp) produce near-parallel or overlapping trajectories.
- Labels/tooltips do not expose quantitative divergence (e.g., MAE or Δ%) by default, so visual difference is hard to verify.

### 3) "Unsure what to troubleshoot"

#### Existing diagnostics
- Prompt unresolved placeholders trigger notification errors.
- Analysis parsing exposes counts for JSON chunks / markdown fallback / failed chunks and appends "Parserio įrodymas" text.
- Missing AI forecasts trigger info/error notifications.

#### Why troubleshooting still feels unclear
- Signals are fragmented across toasts + analysis text + console logs.
- No single "health/debug" view summarizes: prompt used, unresolved vars, fallback path, per-material missing forecast reasons, citation/source quality.
- In `PaklausimoKortele`, `predictionMode: 'ai'` can still send math fallback prices for stale materials when AI extraction fails, while request metadata still labels source context as "Su DI" at the request level; this can confuse root-cause analysis.

## Specific technical risk points

1. **No preflight prompt rendering UI**
   - High UX risk for template editing confidence.
2. **AI vs math visual coupling in chart builder**
   - High perception risk of "fake AI" behavior even when AI values differ.
3. **Fallback opacity**
   - Medium/high troubleshooting risk: AI->markdown->narrative->none flow is complex and not surfaced clearly per material.
4. **Mode labeling ambiguity in price estimation payloads**
   - "Su DI" mode may include math-source predictions item-by-item, which is valid technically but unclear UX-wise.

## Validation outcome

Based on the code paths reviewed, there is substantial direct evidence supporting all three user complaints as plausible outcomes of current implementation behavior.

## Recommended troubleshooting instrumentation (next step)

1. Add **Prompt Preflight Preview** modal before run:
   - show final rendered prompt per step,
   - unresolved variable list,
   - truncated sections and lengths.
2. Add **Graph Diff Metrics** badge:
   - per material Δ(AI vs Math) absolute and percentage at forecast horizon.
3. Add **Analysis Debug Panel**:
   - step status, tool citations count, parse path (JSON/markdown/narrative), missing forecast list.
4. In estimation payload UI, show **effective source breakdown**:
   - count of materials using AI vs math fallback inside "Su DI" mode.

