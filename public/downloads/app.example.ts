// Example only: merge into your existing root component.
// Keep your template, imports, providers, and other settings.
import { Component } from '@angular/core';
import { RoundedSelectionDirective } from './directives/rounded-selection.directive';

@Component({
  selector: 'app-root',
  standalone: true,
  hostDirectives: [RoundedSelectionDirective], // Add to any existing host directives.
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
