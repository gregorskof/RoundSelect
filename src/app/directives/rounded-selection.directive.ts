import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  Directive,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  inject,
} from '@angular/core';

/** A viewport-relative fragment of actual selected text (not an element's box). */
interface SelectionRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  color: string;
}

type SelectionRow = SelectionRect;

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_TEXT_NODES = 1400;
const MAX_FRAGMENTS = 280;
const CORNER_RADIUS = 5;
const VERTICAL_OFFSET = 1.5;

/**
 * Global visual enhancement for native text selection.
 * - Does not edit/wrap the website's text or replace the native Selection.
 * - Falls back to native highlighting for unsupported/large selections and touch UIs.
 * - SVG subpaths avoid darker seams where adjacent rounded fragments overlap.
 */
@Directive({
  selector: '[appRoundedSelection]',
  standalone: true,
})
export class RoundedSelectionDirective implements OnInit, OnDestroy {
  private readonly doc = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);

  private overlay: SVGSVGElement | null = null;
  private frame: number | null = null;
  private hostObserver: MutationObserver | null = null;
  private themeObserver: MutationObserver | null = null;
  private sizeObserver: ResizeObserver | null = null;
  private readonly coarsePointerQuery = '(hover: none) and (pointer: coarse)';
  private readonly forcedColorsQuery = '(forced-colors: active)';
  private coarsePointer: MediaQueryList | null = null;
  private forcedColors: MediaQueryList | null = null;

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.overlay = this.doc.createElementNS(SVG_NS, 'svg');
    this.overlay.classList.add('rounded-selection-overlay');
    this.overlay.setAttribute('aria-hidden', 'true');
    this.overlay.setAttribute('focusable', 'false');
    this.overlay.setAttribute('width', '100%');
    this.overlay.setAttribute('height', '100%');
    this.doc.body.appendChild(this.overlay);

    this.coarsePointer = window.matchMedia(this.coarsePointerQuery);
    this.forcedColors = window.matchMedia(this.forcedColorsQuery);

    // These listeners only schedule the next repaint; no Angular template update.
    this.zone.runOutsideAngular(() => {
      this.doc.addEventListener('selectionchange', this.scheduleUpdate);
      this.doc.addEventListener('scroll', this.scheduleUpdate, true);
      this.doc.addEventListener('keyup', this.scheduleUpdate);
      this.doc.addEventListener('pointerup', this.scheduleUpdate);
      window.addEventListener('resize', this.scheduleUpdate);
      window.visualViewport?.addEventListener('resize', this.scheduleUpdate);
      window.visualViewport?.addEventListener('scroll', this.scheduleUpdate);
      this.coarsePointer?.addEventListener('change', this.scheduleUpdate);
      this.forcedColors?.addEventListener('change', this.scheduleUpdate);

      // Re-measure if Angular changes selected text while a selection exists.
      this.hostObserver = new MutationObserver(this.scheduleUpdate);
      this.hostObserver.observe(this.host.nativeElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme', 'hidden'],
      });

      // Keep theme variables in sync even when only <html>/<body> changes.
      this.themeObserver = new MutationObserver(this.scheduleUpdate);
      for (const node of [this.doc.documentElement, this.doc.body]) {
        this.themeObserver.observe(node, {
          attributes: true,
          attributeFilter: ['class', 'style', 'data-theme', 'data-mode'],
        });
      }

      if ('ResizeObserver' in window) {
        this.sizeObserver = new ResizeObserver(this.scheduleUpdate);
        this.sizeObserver.observe(this.host.nativeElement);
      }
    });
  }

  private readonly scheduleUpdate = (): void => {
    if (this.frame !== null) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = null;
      this.renderSelection();
    });
  };

  private renderSelection(): void {
    if (!this.overlay) return;

    const selection = this.doc.getSelection();
    const active = this.doc.activeElement;
    const nativePreferred =
      this.coarsePointer?.matches || this.forcedColors?.matches;

    // Native selection works better with mobile selection handles, editable fields,
    // and operating-system high-contrast themes.
    if (
      nativePreferred ||
      !selection ||
      selection.isCollapsed ||
      !selection.rangeCount ||
      active?.matches('input, textarea, select')
    ) {
      this.clearSelection();
      return;
    }

    const range = selection.getRangeAt(0);
    const host = this.host.nativeElement;
    if (
      !host.contains(range.commonAncestorContainer) ||
      this.isEditable(range.startContainer) ||
      this.isEditable(range.endContainer)
    ) {
      this.clearSelection();
      return;
    }

    // Abort instead of freezing the UI for huge selections. Native remains usable.
    const fragments: SelectionRect[] = [];
    let visited = 0;
    let overflow = false;
    let containsEditable = false;

    const measureText = (node: Text): void => {
      if (overflow || !node.length || !range.intersectsNode(node)) return;
      if (++visited > MAX_TEXT_NODES) {
        overflow = true;
        return;
      }
      if (this.isEditable(node)) {
        containsEditable = true;
        return;
      }

      const part = this.doc.createRange();
      part.selectNodeContents(node);
      if (range.startContainer === node) part.setStart(node, range.startOffset);
      if (range.endContainer === node) part.setEnd(node, range.endOffset);
      if (part.collapsed) return;

      const parent = node.parentElement;
      const computed = parent ? getComputedStyle(parent) : null;
      // --sel-bg lets a site's existing selection theme drive this overlay.
      const color =
        computed?.getPropertyValue('--sel-bg').trim() ||
        computed?.getPropertyValue('--rounded-selection-color').trim() ||
        '#3b82f6';

      for (const box of Array.from(part.getClientRects())) {
        if (box.width <= 0 || box.height <= 0) continue;
        if (fragments.length >= MAX_FRAGMENTS) {
          overflow = true;
          return;
        }
        fragments.push({
          left: box.left,
          top: box.top + VERTICAL_OFFSET,
          right: box.right,
          bottom: box.bottom + VERTICAL_OFFSET,
          color,
        });
      }
    };

    try {
      const root = range.commonAncestorContainer;
      if (root.nodeType === Node.TEXT_NODE) {
        measureText(root as Text);
      } else {
        const walker = this.doc.createTreeWalker(
          root,
          NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node: Node): number => {
              if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
              if (node.nodeType === Node.TEXT_NODE)
                return NodeFilter.FILTER_ACCEPT;
              // A selected element may contain other selected text descendants.
              return NodeFilter.FILTER_SKIP;
            },
          }
        );
        while (walker.nextNode()) {
          measureText(walker.currentNode as Text);
          if (overflow || containsEditable) break;
        }
      }

      if (overflow || containsEditable || !fragments.length) {
        this.clearSelection();
        return;
      }

      const rows = this.combineFragments(fragments);
      const groups = new Map<string, SelectionRow[]>();
      for (const row of rows) {
        const group = groups.get(row.color) || [];
        group.push(row);
        groups.set(row.color, group);
      }

      const graphics = this.doc.createDocumentFragment();
      for (const [color, group] of groups) {
        const d: string[] = [];
        for (const row of group) {
          d.push(this.roundedRectPath(row));
        }

        // Connect close, overlapping rows. The connectors share one SVG fill
        // with the rounded rectangles, so overlap does NOT become darker.
        const sorted = [...group].sort((a, b) => a.top - b.top);
        for (let i = 0; i < sorted.length; i++) {
          const upper = sorted[i];
          for (let j = i + 1; j < sorted.length; j++) {
            const lower = sorted[j];
            const height = upper.bottom - upper.top;
            const gap = lower.top - upper.bottom;
            if (gap > Math.min(10, height * 0.65)) break;
            if (gap < -1 || lower.top <= upper.top + 2) continue;

            const left = Math.max(upper.left, lower.left);
            const right = Math.min(upper.right, lower.right);
            if (right - left < 8) continue;

            const inset = Math.min(CORNER_RADIUS, height / 3);
            d.push(
              this.rectPath(
                left,
                upper.bottom - inset,
                right,
                lower.top + inset
              )
            );
          }
        }

        const path = this.doc.createElementNS(SVG_NS, 'path');
        path.classList.add('rounded-selection-shape');
        path.setAttribute('d', d.join(' '));
        path.style.setProperty('--highlight-color', color);
        graphics.appendChild(path);
      }

      this.overlay.replaceChildren(graphics);
      // Important: keep native highlighting until a valid custom path exists.
      if (
        !this.doc.documentElement.classList.contains(
          'rounded-selection-enabled'
        )
      ) {
        this.doc.documentElement.classList.add('rounded-selection-enabled');
      }
    } catch {
      // Any unexpected browser Range behaviour restores native highlighting.
      this.clearSelection();
    }
  }

  /** Combine horizontally touching fragments on a matching text line. */
  private combineFragments(rects: SelectionRect[]): SelectionRow[] {
    const lines: {
      color: string;
      top: number;
      bottom: number;
      center: number;
      items: SelectionRect[];
    }[] = [];
    for (const rect of [...rects].sort(
      (a, b) => a.top - b.top || a.left - b.left
    )) {
      const center = (rect.top + rect.bottom) / 2;
      const line = lines.find((item) => {
        const intersection =
          Math.min(rect.bottom, item.bottom) - Math.max(rect.top, item.top);
        const minHeight = Math.min(
          rect.bottom - rect.top,
          item.bottom - item.top
        );
        return (
          item.color === rect.color &&
          intersection >= minHeight * 0.68 &&
          Math.abs(center - item.center) <= Math.max(3, minHeight * 0.24)
        );
      });
      if (line) {
        line.items.push(rect);
        line.top = Math.min(line.top, rect.top);
        line.bottom = Math.max(line.bottom, rect.bottom);
        line.center = (line.top + line.bottom) / 2;
      } else {
        lines.push({
          color: rect.color,
          top: rect.top,
          bottom: rect.bottom,
          center,
          items: [rect],
        });
      }
    }

    const result: SelectionRow[] = [];
    for (const line of lines) {
      const sorted = line.items.sort((a, b) => a.left - b.left);
      let merged: SelectionRect | null = null;
      for (const r of sorted) {
        if (merged && r.left <= merged.right + 2) {
          merged.right = Math.max(merged.right, r.right);
          merged.top = Math.min(merged.top, r.top);
          merged.bottom = Math.max(merged.bottom, r.bottom);
        } else {
          if (merged) result.push({ ...merged });
          merged = { ...r };
        }
      }
      if (merged) result.push({ ...merged });
    }
    return result;
  }

  /** SVG path with genuinely curved outside corners. */
  private roundedRectPath(box: SelectionRect): string {
    const { left: x, top: y, right, bottom } = box;
    const radius = Math.min(CORNER_RADIUS, (right - x) / 2, (bottom - y) / 2);
    return [
      `M ${x + radius} ${y}`,
      `H ${right - radius}`,
      `Q ${right} ${y} ${right} ${y + radius}`,
      `V ${bottom - radius}`,
      `Q ${right} ${bottom} ${right - radius} ${bottom}`,
      `H ${x + radius}`,
      `Q ${x} ${bottom} ${x} ${bottom - radius}`,
      `V ${y + radius}`,
      `Q ${x} ${y} ${x + radius} ${y}`,
      'Z',
    ].join(' ');
  }

  private rectPath(
    left: number,
    top: number,
    right: number,
    bottom: number
  ): string {
    return `M ${left} ${top} H ${right} V ${bottom} H ${left} Z`;
  }

  private isEditable(node: Node): boolean {
    const element =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement)
        : node.parentElement;
    return (
      !!element?.isContentEditable ||
      !!element?.closest('input, textarea, select')
    );
  }

  private clearSelection(): void {
    this.overlay?.replaceChildren();
    if (
      this.doc.documentElement.classList.contains('rounded-selection-enabled')
    ) {
      this.doc.documentElement.classList.remove('rounded-selection-enabled');
    }
  }

  ngOnDestroy(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.doc.removeEventListener('selectionchange', this.scheduleUpdate);
    this.doc.removeEventListener('scroll', this.scheduleUpdate, true);
    this.doc.removeEventListener('keyup', this.scheduleUpdate);
    this.doc.removeEventListener('pointerup', this.scheduleUpdate);
    window.removeEventListener('resize', this.scheduleUpdate);
    window.visualViewport?.removeEventListener('resize', this.scheduleUpdate);
    window.visualViewport?.removeEventListener('scroll', this.scheduleUpdate);
    this.coarsePointer?.removeEventListener('change', this.scheduleUpdate);
    this.forcedColors?.removeEventListener('change', this.scheduleUpdate);
    this.hostObserver?.disconnect();
    this.themeObserver?.disconnect();
    this.sizeObserver?.disconnect();
    if (this.frame !== null) window.cancelAnimationFrame(this.frame);
    this.clearSelection();
    this.overlay?.remove();
  }
}
