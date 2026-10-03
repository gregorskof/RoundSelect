import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RoundedSelectionDirective } from './directives/rounded-selection.directive';
import { INSTALL_EXAMPLE, DOWNLOAD_FILES, ZIP_SIZE } from './generated/installation';

type PreviewMode = 'light' | 'dark';
type Sample = 'prose' | 'markup';
type Snippet = 'styles' | 'component';

@Component({
  selector: 'app-root',
  standalone: true,
  hostDirectives: [RoundedSelectionDirective],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly previewMode = signal<PreviewMode>('light');
  readonly sample = signal<Sample>('prose');
  readonly selectedColor = signal('#9272ff');
  readonly showDynamic = signal(false);
  readonly copied = signal<Snippet | null>(null);
  readonly copyStatus = signal('');
  readonly downloadFiles = DOWNLOAD_FILES;
  readonly zipSize = ZIP_SIZE;
  readonly componentCode = INSTALL_EXAMPLE;
  readonly stylesCode = `/* src/styles.css — before other rules */
@import './rounded-selection.css';

/* Optional: match your theme. */
:root { --sel-bg: #9272ff; }`;

  readonly tones = [
    { name: 'Violet', value: '#9272ff' },
    { name: 'Blue', value: '#5aabff' },
    { name: 'Mint', value: '#4ad7ae' },
    { name: 'Rose', value: '#f28ca9' },
  ];

  readonly stages = [
    { title: 'Listen', api: 'selectionchange', detail: 'Listen for selection changes, scrolling, and layout updates.' },
    { title: 'Read', api: 'Selection', detail: 'Read the browser’s native selection and its active range.' },
    { title: 'Walk', api: 'TreeWalker', detail: 'Find the selected text nodes, including nested inline elements.' },
    { title: 'Measure', api: 'Range', detail: 'Measure each selected text fragment in viewport coordinates.' },
    { title: 'Merge', api: 'Visual lines', detail: 'Join nearby fragments that belong to the same visual line.' },
    { title: 'Shape', api: 'SVG paths', detail: 'Build rounded paths and connecting segments between close lines.' },
    { title: 'Render', api: 'Overlay', detail: 'Render the SVG, then hide the native highlight only when ready.' },
  ];

  private readonly destroyRef = inject(DestroyRef);
  private feedbackTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.feedbackTimer));
  }

  // Preserve a mouse selection while changing its color; keyboard focus stays native.
  keepSelection(event: PointerEvent): void {
    if (event.pointerType === 'mouse') event.preventDefault();
  }

  toggleDynamic(): void {
    this.showDynamic.update(value => !value);
  }

  async copyCode(code: string, snippet: Snippet): Promise<void> {
    clearTimeout(this.feedbackTimer);
    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(snippet);
      this.copyStatus.set(snippet === 'styles' ? 'Stylesheet example copied.' : 'Component example copied. Merge it into your existing component.');
    } catch {
      this.copied.set(null);
      this.copyStatus.set('Clipboard unavailable. Select the code and copy it with Ctrl+C or Command+C.');
    }
    this.feedbackTimer = setTimeout(() => {
      this.copied.set(null);
      this.copyStatus.set('');
    }, 4000);
  }
}
