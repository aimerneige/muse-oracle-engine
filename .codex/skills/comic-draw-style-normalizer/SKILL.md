---
name: comic-draw-style-normalizer
description: Review and normalize existing style prompt templates under internal/prompt/templates/comic_draw. Use when the user asks Codex to compare comic_draw style templates, find inconsistent prompt structure or wording, align them to the strongest existing template format, remove unreasonable style instructions, spread valuable shared constraints, and report the changes.
---

# Comic Draw Style Normalizer

## Purpose

Normalize existing `internal/prompt/templates/comic_draw/*.md.tmpl` style prompt templates so they share one system format while keeping only style-specific visual details different.

This skill is for revising existing templates, not for creating a new style from a reference file. For new reference-to-template work, use `comic-draw-style-template`.

## Workflow

1. Restate the scope:
   - Target directory: `internal/prompt/templates/comic_draw`.
   - Only edit style prompt templates unless the user explicitly asks for code changes.
   - Preserve style identity and useful style-specific constraints.
   - Do not silently add new dependencies or change prompt rendering code.

2. Read before writing:
   - Run `git status --short`.
   - List all files under `internal/prompt/templates/comic_draw`.
   - Read every `*.md.tmpl` file in the directory before choosing a standard.
   - Search prompt usage for required Go template variables before editing.

3. Choose the baseline:
   - Pick the strongest existing template as the format baseline.
   - Prefer the template with the most complete and consistent system structure, layout constraints, text handling rules, output format, workflow, and initialization behavior.
   - State the chosen baseline before major edits when the task is substantial.

4. Compare templates by system structure:
   - Section order and headings:
     - `# Role`
     - `## Profile`
     - `### Skill`
     - `## Goals`
     - `## Constrains`
     - `## OutputFormat`
     - `## Workflow`
     - `## Initialization`
     - `## 角色固有生理特征设定：`
     - `## 分镜脚本：`
   - Shared execution behavior.
   - Shared comic layout rules.
   - Shared text and bubble placement rules.
   - Shared output ratio and four-panel requirements.
   - Required placeholders.

5. Normalize with surgical edits:
   - Keep each style's visual medium, material rules, rendering vocabulary, and SFX treatment.
   - Align section density, wording style, numbering, bold labels, quote style, and common constraints.
   - Spread valuable shared rules from the baseline into weaker templates.
   - Remove or rewrite obviously unreasonable content, such as labels that do not match the medium.
   - Do not make all styles visually identical; only unify the system scaffold.

6. Preserve required template placeholders exactly:

```gotemplate
{{ .CharacterSetting }}
```

```gotemplate
{{ .PanelContent }}
```

7. Keep shared comic constraints unless the user asks otherwise:
   - 9:16 vertical four-panel comic.
   - Simplified Chinese dialogue bubbles.
   - Japanese katakana SFX where appropriate.
   - Speaker-bubble proximity principle.
   - Bubble tails must point to the correct speaker.
   - No face, key costume feature, or important action occlusion.
   - No panel titles.
   - No caption boxes or narration text boxes.
   - Direct image-generation behavior with no greetings, dialogue transcript, or story analysis.

8. Verify:
   - Search all templates for the required placeholders.
   - Search for missing shared constraints, stale wording, mismatched quote styles, and medium-inappropriate output labels.
   - Run `git diff --check -- internal/prompt/templates/comic_draw`.
   - Run project tests when practical, usually `go test ./...`.
   - Review `git diff -- internal/prompt/templates/comic_draw` before reporting.

## Editing Rules

- Use Chinese prompt content to match the repository templates.
- Keep edits minimal and traceable to consistency, correctness, or removal of unreasonable wording.
- Do not rename existing template files unless the user explicitly asks.
- Do not modify user-provided or unrelated changes.
- Do not replace nuanced style-specific details with generic language.
- Do not alter the Go template variable names, spacing, or final placeholder sections.

## Report Shape

After completion, report:

- Baseline template chosen and why.
- Files changed.
- Main inconsistency categories fixed.
- Any unreasonable content removed or rewritten.
- Verification commands and results.
- Mention that no loop optimization concerns apply if only prompt templates were edited.
