# RoundSelect — Angular source kit

An experimental SVG enhancement for the browser's real text selection. RoundSelect never wraps or replaces your text; native selection, keyboard selection, and copying remain available.

## Package

```text
roundselect/
├── rounded-selection.directive.ts
├── rounded-selection.css
├── app.example.ts
└── README.md
```

The CSS contains only the selection styles, not the demo website. No extra runtime package is required beyond Angular. The website is built with Angular 21. The directive uses standalone directives and `hostDirectives`; validate it in your Angular version and target browsers.

## Three steps

1. **Add the directive.** Copy `rounded-selection.directive.ts` to `src/app/directives/`.
2. **Include the global stylesheet.** Copy `rounded-selection.css` to `src/`, then add the following at the beginning of your global `src/styles.css`:

   ```css
   @import './rounded-selection.css';
   ```

   Alternatively, register `src/rounded-selection.css` in the build target's `styles` array in `angular.json`. It must be global, not a component stylesheet.
3. **Register the directive.** Merge the import and `hostDirectives` setting from `app.example.ts` into your existing root component:

   ```ts
   import { RoundedSelectionDirective } from './directives/rounded-selection.directive';

   // Inside your existing @Component({ ... }) metadata:
   hostDirectives: [RoundedSelectionDirective],
   ```

   Add to any existing `hostDirectives` array. **Do not replace your root component.** Keep your template, component imports, providers, selector, styles, and application logic. Adjust the import path to your folder structure. Register once on the root component.

## Theme

Set `--sel-bg` globally or on the container whose text is being selected:

```css
:root { --sel-bg: #9272ff; }
.article { --sel-bg: #5aabff; }
```

The overlay uses a 40% color mix. Check readability on both light and dark surfaces. The original text color and native clipboard behavior stay intact.

## Native fallbacks and limits

- Inputs, textareas, editable content, touch/coarse-pointer environments, and forced-colors mode retain native highlighting.
- Large selections stop measuring after 1,400 selected text nodes or 280 measured fragments; native highlighting remains available.
- Layout changes, scrolling, resizing, theme changes, and dynamically inserted Angular content trigger batched measurements with `requestAnimationFrame`.
- The native highlight is hidden only after a valid SVG overlay is ready. Unsupported geometry restores it.
- Keyboard text selection uses the browser's native caret browsing (usually F7, where supported) or ordinary keyboard selection. Normal copy shortcuts continue to work.

Source: https://github.com/gregorskof/RoundSelect

Demo: https://gregorskof.github.io/RoundSelect/
