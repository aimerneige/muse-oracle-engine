---
name: comic-draw-style-template
description: Create a new project-local comic_draw prompt template from a provided reference Markdown file. Use when the user provides or points to a .md prompt/style file and asks to add a new style under internal/prompt/templates/comic_draw, convert it to the existing .md.tmpl format, derive a suitable filename, or repeat the new_style.md-to-comic_draw-template workflow.
---

# Comic Draw Style Template

## Overview

Convert one reference Markdown prompt into a new `internal/prompt/templates/comic_draw/*.md.tmpl` template that matches this repository's existing comic style prompt format.

The key rule is to extract the reusable visual style, rendering constraints, typography rules, and layout rules from the reference file without accidentally freezing reference-only IP names, character names, franchise names, or one-off scene assumptions into a general style template.

## Workflow

1. Restate the target:
   - Source reference Markdown path, such as `new_style.md`.
   - Target directory, defaulting to `internal/prompt/templates/comic_draw`.
   - Assumption that the source reference file must remain unchanged.

2. Read before writing:
   - Read the full reference Markdown.
   - List and read existing files in `internal/prompt/templates/comic_draw`.
   - Confirm the local suffix and structure from existing templates instead of guessing.

3. Derive the style identity:
   - Identify the reusable style category, such as `anime_3d_engine`, `watercolor`, `retro_comic`, or `ink_wash`.
   - Prefer lowercase English filenames with underscores.
   - Use `.md.tmpl` for the target filename.
   - Do not name the file after an IP, franchise, work title, or character unless the user explicitly asks for a franchise-specific template.

4. Generalize the reference:
   - Preserve reusable visual constraints, rendering medium, material rules, layout constraints, text handling, output format, and workflow.
   - Replace franchise-specific references with general language, such as "动漫角色", "二次元角色", or "角色".
   - Keep non-general constraints only when they describe the visual medium itself, not the reference source's subject matter.
   - If a reference is mostly IP-specific and no reusable style can be confidently extracted, stop and ask the user whether the target should be IP-specific or generalized.

5. Write the template:
   - Create exactly one new file under `internal/prompt/templates/comic_draw`.
   - Match the existing section structure:
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
   - Preserve the final placeholders exactly:

```gotemplate
{{ .CharacterSetting }}
```

```gotemplate
{{ .PanelContent }}
```

6. Verify the result:
   - Run `git status --short`.
   - Read the new file after writing.
   - Search the new file for reference-only proper nouns, franchise names, and character names identified from the source reference.
   - Confirm the source reference file was not modified.
   - Report the new file path and any deliberate retained constraints.

## Template Adaptation Rules

Use Chinese for prompt content to match the repository's existing templates.

Keep the direct-image-generation behavior:

- The assistant persona should ignore greetings.
- It should avoid outputting dialogue text or story analysis.
- It should convert the storyboard into drawing instructions and call the drawing tool.

Keep shared comic layout constraints unless the user asks otherwise:

- 9:16 vertical four-panel comic.
- Chinese simplified dialogue bubbles.
- Japanese katakana SFX where appropriate.
- Strict proximity between speaker and bubble.
- Bubble tails must point to the correct speaker.
- No caption boxes or narration text boxes.
- No face or key costume feature occlusion.

Avoid overfitting:

- Do not preserve named franchises as style restrictions.
- Do not preserve named characters as required subjects.
- Do not preserve venue, costume, or prop details unless they define the style itself.
- Do not copy large blocks verbatim from the source reference; rewrite to match the local template voice.

## Naming Heuristics

Choose a filename from the generalized visual medium:

- `3D MMD / Unity / Toon Shader` -> `anime_3d_engine.md.tmpl`
- `水墨 / 国风 / 宣纸` -> `ink_wash.md.tmpl`
- `复古美漫 / 网点 / 印刷颗粒` -> `retro_comic.md.tmpl`
- `赛璐璐 / 动画截图` -> `cel_animation.md.tmpl`
- `厚涂 / 游戏立绘` -> `painterly_game.md.tmpl`

If the derived filename already exists, do not overwrite it silently. Pick a more specific generalized name or ask the user.

## Expected Response Shape

After completing the work, answer briefly with:

- The created file path.
- The generalized style name.
- A note that the reference `.md` was left unchanged.
- Verification performed, especially any proper-noun/IP cleanup check.
