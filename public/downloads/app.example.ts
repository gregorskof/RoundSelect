/** Example only: merge hostDirectives into your existing root component. */
import { Component } from '@angular/core';
import { RoundedSelectionDirective } from './directives/rounded-selection.directive';

@Component({
  selector: 'app-root',
  standalone: true,
  hostDirectives: [RoundedSelectionDirective],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
