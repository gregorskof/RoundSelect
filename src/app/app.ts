import { Component, signal } from '@angular/core';
import { RoundedSelectionDirective } from './directives/rounded-selection.directive';

type DemoMode = 'dark' | 'light';

@Component({
  selector: 'app-root',
  standalone: true,
  hostDirectives: [RoundedSelectionDirective],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly demoMode = signal<DemoMode>('dark');
  readonly selectedColor = signal('#9272ff');
  readonly showExtraLine = signal(false);
  readonly copyMessage = signal('Copy snippet');
  readonly copiedSnippet = signal<'angular' | 'css' | null>(null);

  readonly tones = [
    { name: 'Violet', value: '#9272ff' },
    { name: 'Sky', value: '#42adf5' },
    { name: 'Mint', value: '#39d7ad' },
    { name: 'Coral', value: '#ff8d8f' },
  ];

  readonly steps = [
    { number: '01', title: 'Listen', label: 'selectionchange', detail: 'Watch for native selection, scroll and layout changes.' },
    { number: '02', title: 'Read', label: 'Selection API', detail: 'Get the current selection without replacing its behavior.' },
    { number: '03', title: 'Find', label: 'TreeWalker', detail: 'Visit the actual selected text nodes, not whole boxes.' },
    { number: '04', title: 'Measure', label: 'Range.getClientRects()', detail: 'Collect the viewport coordinates of text fragments.' },
    { number: '05', title: 'Merge', label: '2D geometry', detail: 'Join touching fragments on the same visual line.' },
    { number: '06', title: 'Draw', label: 'SVG paths', detail: 'Build rounded corners and connectors between nearby lines.' },
    { number: '07', title: 'Reveal', label: 'Native fallback', detail: 'Show the overlay, then hide the native highlight background.' },
  ];

  readonly setupCode = `import { Component } from '@angular/core';
import { RoundedSelectionDirective } from './directives/rounded-selection.directive';

@Component({
  selector: 'app-root',
  standalone: true,
  hostDirectives: [RoundedSelectionDirective],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}`;

  readonly cssCode = `:root { --sel-bg: #9272ff; }

::selection {
  background: var(--sel-bg, #9272ff);
  color: currentColor;
}

html.rounded-selection-enabled ::selection {
  background: transparent !important;
  color: currentColor !important;
}

html.rounded-selection-enabled
:is(input, textarea, [contenteditable])::selection {
  background: Highlight !important;
  color: HighlightText !important;
}

.rounded-selection-overlay {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  z-index: 2147483647;
  pointer-events: none;
  user-select: none;
}

.rounded-selection-shape {
  fill: rgba(146, 114, 255, .4);
  fill: color-mix(in srgb,
    var(--highlight-color, #9272ff) 40%, transparent);
  pointer-events: none;
}

@media (hover: none) and (pointer: coarse),
       (forced-colors: active) {
  .rounded-selection-overlay { display: none !important; }
  html.rounded-selection-enabled ::selection {
    background: Highlight !important;
    color: HighlightText !important;
  }
}`;

  setColor(color: string): void {
    this.selectedColor.set(color);
  }

  toggleMode(): void {
    this.demoMode.update(mode => mode === 'dark' ? 'light' : 'dark');
  }

  toggleExtraLine(): void {
    this.showExtraLine.update(current => !current);
  }

  async copyCode(code: string, snippet: 'angular' | 'css'): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.copiedSnippet.set(snippet);
      this.copyMessage.set('Copied!');
    } catch {
      this.copiedSnippet.set(snippet);
      this.copyMessage.set('Select manually');
    }
  }
}
