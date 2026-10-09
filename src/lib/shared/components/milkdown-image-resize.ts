import { $view } from '@milkdown/utils';
import { imageSchema } from '@milkdown/preset-commonmark';
import type { NodeViewConstructor } from '@milkdown/prose/view';

const parseWidth = (title: string | null): number | null => {
  if (!title) return null;
  const match = title.match(/w=(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
};

const setWidthInTitle = (title: string | null, width: number): string => {
  const base = title?.replace(/\s*w=\d+/, '').trim() ?? '';
  return base ? `${base} w=${width}` : `w=${width}`;
};

export const imageResizeView = $view(imageSchema.node, (): NodeViewConstructor => {
  return (node, view, getPos) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'image-resize-wrapper';
    wrapper.style.cssText = 'position:relative;display:inline-block;max-width:100%;line-height:0;';

    const img = document.createElement('img');
    img.src = node.attrs.src ?? '';
    img.alt = node.attrs.alt ?? '';
    img.style.cssText = 'display:block;max-width:100%;border-radius:4px;';
    img.draggable = false;

    const savedWidth = parseWidth(node.attrs.title);
    if (savedWidth) {
      img.style.width = `${savedWidth}px`;
    }

    const dotStyle = (cursor: string, extra: string) =>
      `position:absolute;width:8px;height:8px;background:var(--color-primary,#3b82f6);border:1.5px solid var(--color-bg,#1a1a2e);border-radius:50%;opacity:0;transition:opacity 0.15s;cursor:${cursor};${extra}`;

    const dots = ['nw', 'ne', 'sw', 'se'].map((corner) => {
      const dot = document.createElement('div');
      dot.className = `image-resize-dot image-resize-dot-${corner}`;
      const isTop = corner.startsWith('n');
      const isLeft = corner.endsWith('w');
      const cursor = corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize';
      dot.style.cssText = dotStyle(cursor, `${isTop ? 'top:-4px' : 'bottom:-4px'};${isLeft ? 'left:-4px' : 'right:-4px'}`);
      dot.dataset.corner = corner;
      return dot;
    });

    const showDots = () => dots.forEach(d => { d.style.opacity = '1'; });
    const hideDots = () => dots.forEach(d => { d.style.opacity = '0'; });
    wrapper.addEventListener('mouseenter', showDots);
    wrapper.addEventListener('mouseleave', hideDots);

    let startX = 0;
    let startWidth = 0;
    let direction = 1;

    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(50, startWidth + direction * (e.clientX - startX));
      img.style.width = `${newWidth}px`;
    };

    const onMouseUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      const finalWidth = Math.max(50, startWidth + direction * (e.clientX - startX));
      const pos = getPos();
      if (pos === undefined) return;
      const tr = view.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        title: setWidthInTitle(node.attrs.title, finalWidth),
      });
      view.dispatch(tr);
    };

    for (const dot of dots) {
      dot.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startWidth = img.offsetWidth;
        direction = dot.dataset.corner?.endsWith('w') ? -1 : 1;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    }

    wrapper.appendChild(img);
    dots.forEach(d => wrapper.appendChild(d));

    return {
      dom: wrapper,
      stopEvent: (e) => (e.target as HTMLElement)?.classList?.contains('image-resize-dot'),
      update: (updatedNode) => {
        if (updatedNode.type.name !== 'image') return false;
        img.src = updatedNode.attrs.src ?? '';
        img.alt = updatedNode.attrs.alt ?? '';
        const w = parseWidth(updatedNode.attrs.title);
        img.style.width = w ? `${w}px` : '';
        return true;
      },
    };
  };
});
