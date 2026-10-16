import { $prose } from '@milkdown/utils';
import { Plugin } from '@milkdown/prose/state';
import { Fragment } from '@milkdown/prose/model';

export const createImageDropPlugin = (pendingImages: Map<string, File>) =>
  $prose(() => {
    return new Plugin({
      props: {
        handleDrop(view, event) {
          const files = event.dataTransfer?.files;
          if (!files?.length) return false;
          const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
          if (!imageFiles.length) return false;
          event.preventDefault();

          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!pos) return false;

          const imageType = view.state.schema.nodes['image'];
          if (!imageType) return false;

          // All in one step, so several dropped images keep their order (inserted one at a time
          // at the same point, each landed in front of the last).
          const nodes = imageFiles.map((file) => {
            const blobUrl = URL.createObjectURL(file);
            pendingImages.set(blobUrl, file);
            return imageType.create({ src: blobUrl, alt: file.name });
          });
          view.dispatch(view.state.tr.insert(pos.pos, Fragment.from(nodes)));
          return true;
        },
        handlePaste(view, event) {
          const files = event.clipboardData?.files;
          if (!files?.length) return false;
          const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
          if (!imageFiles.length) return false;
          event.preventDefault();

          const imageType = view.state.schema.nodes['image'];
          if (!imageType) return false;

          for (const file of imageFiles) {
            const blobUrl = URL.createObjectURL(file);
            pendingImages.set(blobUrl, file);
            const node = imageType.create({ src: blobUrl, alt: file.name });
            const tr = view.state.tr.replaceSelectionWith(node);
            view.dispatch(tr);
          }
          return true;
        }
      }
    });
  });
