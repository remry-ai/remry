import { $prose } from '@milkdown/utils';
import { Plugin } from '@milkdown/prose/state';

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

          for (const file of imageFiles) {
            const blobUrl = URL.createObjectURL(file);
            pendingImages.set(blobUrl, file);
            const node = imageType.create({ src: blobUrl, alt: file.name });
            const tr = view.state.tr.insert(pos.pos, node);
            view.dispatch(tr);
          }
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
