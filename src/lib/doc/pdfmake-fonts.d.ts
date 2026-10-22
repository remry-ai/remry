// pdfmake's font bundles ship without types: each is a font container to hand to `addFontContainer`.
declare module 'pdfmake/build/fonts/Roboto' {
  import type { TFontContainer } from 'pdfmake/interfaces';
  const container: TFontContainer;
  export default container;
}

declare module 'pdfmake/build/standard-fonts/Courier' {
  import type { TFontContainer } from 'pdfmake/interfaces';
  const container: TFontContainer;
  export default container;
}
