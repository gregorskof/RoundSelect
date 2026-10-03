# RoundSelect — Angular source integration

RoundSelect is a source-code integration, not a published npm package. The selection effect is decorative; native selection and copy/paste remain active.

## Files
- `rounded-selection.directive.ts` — the complete SVG selection engine.
- `rounded-selection.css` — selection-only global CSS; it does **not** include the demo website styling.
- `app.example.ts` — an example root component. Do not overwrite your existing `app.ts` wholesale.

## Installation (Angular standalone)
1. Put `rounded-selection.directive.ts` in `src/app/directives/`.
2. Copy the rules from `rounded-selection.css` into your **global** `src/styles.css`, or register the supplied CSS file in your Angular workspace's `styles` build option.
3. Import `RoundedSelectionDirective` into your root Angular component and add `hostDirectives: [RoundedSelectionDirective]` to its `@Component()` metadata. Preserve all other imports, providers, declarations, and existing metadata. Use `app.example.ts` as a reference only.
4. Change `--sel-bg` to match your theme. The directive reads this variable from selected text.

Requires a recent Angular version supporting standalone directives and `hostDirectives`. No jQuery or Rangy. Test your target browsers and respect reduced-motion/accessibility needs. Touch/coarse-pointer environments, forced colors and editable fields use native selection.

Source: https://github.com/gregorskof/RoundSelect
