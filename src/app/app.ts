import { Component, signal } from '@angular/core';
import { RoundedSelectionDirective } from './directives/rounded-selection.directive';

type DemoMode = 'dark' | 'light';
type Snippet = 'angular' | 'css';

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
  readonly copyFeedback = signal<Snippet | null>(null);

  readonly tones = [
    { name: 'Violet', value: '#9272ff' },
    { name: 'Azure', value: '#5aabff' },
    { name: 'Mint', value: '#4ad7ae' },
    { name: 'Rose', value: '#f28ca9' },
  ];

  readonly steps = [
    { number: '01', title: 'Listen', detail: 'Track native text selection and layout changes.' },
    { number: '02', title: 'Measure', detail: 'Collect selected fragments using Range and TreeWalker.' },
    { number: '03', title: 'Draw', detail: 'Merge adjacent fragments into rounded SVG paths.' },
    { number: '04', title: 'Enhance', detail: 'Display the overlay, preserving native fallbacks.' },
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
  background: var(--sel-bg);
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
  width: 100%; height: 100%;
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
    this.showExtraLine.update(value => !value);
  }

  async copyCode(code: string, snippet: Snippet): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.copyFeedback.set(snippet);
    } catch {
      // Snippets remain selectable so developers can copy manually.
      this.copyFeedback.set(null);
    }
  }
}
